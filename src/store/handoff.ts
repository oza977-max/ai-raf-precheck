import { z } from 'zod';
import type { AuditEvent, RegisterNode, RegisterEdge } from './types';
import { getAllForExport, importTailIfContinues, backupAndReplaceAllRawEvents, verifyChainOf, sha256Hex } from './audit';
import { exportAll, importRegister, backupAndReplaceRegister } from './register';

// RG-8 — verified hand-off bundle (2026-09-01; relabelled from RG-6 in
// code-review-005 F9/F27 — RG-6 already meant blast-radius queries in this
// product's requirement set, and this feature had never had a requirement
// id of its own). The core end-to-end gap: AIGate's whole value is a
// SUBMITTER and a REVIEWER who are different people, but the app runs
// entirely in one browser, so "1LoD" and "2LoD" were a role toggle on one
// machine. This module lets a bundle of the register + the append-only
// audit trail be exported from one machine and imported on another, with
// the hash chain used exactly as intended: an accidentally damaged file, or
// one edited without recomputing the chain, is caught on arrival — and, the
// honest hard part, two histories can only be merged when one is a PREFIX
// of the other.
//
// WHAT THE SEAL AND CHAIN DO NOT PROVE (code-review-005 F2). Both are plain
// SHA-256 over public, open-source logic — no key, no secret, no external
// anchor. They catch accidental corruption and an edit that was NOT
// followed by recomputing the downstream chain — the common case, and the
// gap this product used to leave wide open. They do NOT prove who produced
// the file: anyone holding it can edit it and recompute every hash and the
// seal to match, and import will accept the result (see the F2 test in
// handoff.test.ts, which builds exactly that and asserts it is accepted).
// This is the same "tamper-evident, not tamper-proof" honesty the local
// trail already states (types.ts's AuditEvent.hash comment) — a hand-off
// file just makes the file itself the thing an attacker could hold, so the
// UI, export/replace messages, and this comment all say the same thing:
// only import a bundle from someone you trust, sent by a route you trust.
//
// WHY PREFIX-ONLY IS THE CORRECT INVARIANT, NOT A LIMITATION.
// The hash chain is global: every event's hash depends on the one before
// it, back to genesis. Two chains grown independently on two machines share
// no common suffix and cannot be concatenated without either recomputing
// hashes (destroying the tamper-evidence that was verified at the source)
// or leaving a break (a false tamper signal). There is no honest general
// merge. But the hand-off workflow never produces divergent chains in
// normal use: A exports, B imports and appends its sign-off, B exports
// back, A imports. At every step one side's chain is a prefix of the
// other's. So the rule is exact: import succeeds iff the local chain and
// the bundle chain are prefix-compatible (one extends the other,
// byte-for-byte on the shared span); anything else means the two histories
// have genuinely diverged (the code's ImportOutcome calls this 'diverged'),
// and the import is REJECTED with no writes. This is idempotent
// (re-importing an already-absorbed bundle is a no-op) and it refuses
// precisely the case it cannot honestly handle.

export const HANDOFF_FORMAT_VERSION = 1;

// --- Bundle shape + validation -------------------------------------------
//
// code-review-005 F3/F4/F13/F20. The bundle travels between people, so it is
// untrusted input — the schema below now validates it structurally AND
// semantically before anything is hashed or written: every timestamp is a
// real ISO datetime (an unparseable one used to make the monotonic clock
// NaN and break every later local write for the rest of the session);
// event_type and payload.type are drawn from the actual AuditEventType
// union and must agree with each other; each payload variant's OWN required
// fields are checked (not just "some object with the right `type`" — a
// missing field used to render as a blank or "undefined" line in the audit
// trail, the product's core artefact); register-node metadata matches the
// real RegisterNodeMetadata shape and metadata.node_type agrees with the
// node's own node_type (a mismatch used to throw deep inside a Promise.all
// in register.ts and freeze the whole register list behind "Loading…").
// `verdict`/`correction` stay intentionally partial (passthrough) rather
// than mirroring every nested field of Verdict/GraphCorrection: only the
// fields this codebase actually dereferences are required, so the schema
// does not have to track two full complex types in two places, which is
// its own drift risk (the project's RF-1/RF-3 recurring findings) — the
// audit chain's own hash verification remains the deeper integrity gate.

const isoDatetime = z.string().datetime({ offset: true, message: 'must be a valid ISO datetime' });

const LIFECYCLE_STAGES = ['idea', 'exploring', 'pre_checked', 'approved', 'in_production', 'monitored', 'retired'] as const;
const lifecycleStageSchema = z.enum(LIFECYCLE_STAGES);

// Load-bearing subset of Verdict (src/types/verdict.ts extends
// EvaluationResult, src/engine/types.ts) — exactly the fields register.ts's
// toSummary()/hasPendingPolicyUpdate() dereference. Everything else on a
// real Verdict rides through via passthrough.
const verdictSchema = z
  .object({
    id: z.string(),
    use_case_id: z.string(),
    status: z.enum(['approved', 'approved_with_controls', 'rejected']),
    policy_version: z.string(),
    tier: z.string().nullable().optional(),
    track: z.string().nullable().optional(),
    provisional_reasons: z.array(z.string()).optional(),
  })
  .passthrough();

// GraphCorrection (src/engine/types.ts) in full — it is a small, flat,
// stable type (unlike Verdict), so mirroring it exactly costs little and
// buys real protection for RegisterDetail's correction-record rendering.
const graphCorrectionSchema = z.object({
  correction_id: z.string(),
  graph_version_before: z.number(),
  graph_version_after: z.number(),
  node_id: z.string(),
  field: z.string(),
  original_value: z.unknown(),
  corrected_value: z.unknown(),
  corrected_by: z.string(),
  corrected_at: z.string(),
  reason: z.string().optional(),
});

// Mirrors AuditEventPayload (src/store/types.ts) variant-for-variant: the
// `type` literal plus that variant's OWN required fields, so an incomplete
// payload is rejected at the boundary instead of rendering blank/"undefined"
// downstream (F13).
const auditPayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('use_case_created'),
    description: z.string(),
    intake_method: z.enum(['llm', 'structured_form']),
  }),
  z.object({
    type: z.literal('duplicate_dismissed'),
    candidate_use_case_id: z.string(),
    candidate_label: z.string(),
  }),
  z.object({
    type: z.literal('classification_adopted'),
    adopted_from_use_case_id: z.string(),
    adopted_from_label: z.string(),
    tier: z.string().nullable(),
    track: z.string().nullable(),
  }),
  z.object({
    type: z.literal('graph_confirmed'),
    graph_id: z.string(),
    graph_version: z.number(),
    corrections_count: z.number(),
    submitter_note: z.string().optional(),
    contradiction_resolutions: z.array(z.string()).optional(),
    answer_contexts: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal('verdict_produced'),
    verdict: verdictSchema,
    reasoning_trace: z.string().optional(),
    knowledge_lens_matched_entry_ids: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal('graph_corrected'),
    correction: graphCorrectionSchema,
  }),
  z.object({
    type: z.literal('verdict_corrected'),
    original_verdict_id: z.string(),
    new_verdict: verdictSchema,
    reasoning_trace: z.string().optional(),
    knowledge_lens_matched_entry_ids: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal('lifecycle_stage_changed'),
    from_stage: lifecycleStageSchema,
    to_stage: lifecycleStageSchema,
  }),
  z.object({
    type: z.literal('re_evaluation_queued'),
    policy_version: z.string(),
  }),
  z.object({
    type: z.literal('twoloD_reviewed'),
    action: z.enum(['approved', 'rejected', 'correction_requested']),
    verdict_id: z.string(),
    attested_by_name: z.string().optional(),
    notes: z.string().optional(),
  }),
  z.object({
    type: z.literal('reasoning_trace_generated'),
    verdict_id: z.string(),
    trace: z.string(),
  }),
  z.object({
    type: z.literal('rule_dissent_filed'),
    verdict_id: z.string(),
    rule_id: z.string(),
    rule_label: z.string().optional(),
    dissent: z.string(),
    filed_by_name: z.string(),
  }),
  z.object({
    type: z.literal('sampling_reviewed'),
    verdict_id: z.string(),
    reviewed_by_name: z.string(),
    outcome_note: z.string().optional(),
  }),
  z.object({
    type: z.literal('control_ownership_assigned'),
    verdict_id: z.string(),
    control_id: z.string(),
    owner_name: z.string(),
    target_date: z.string(),
  }),
  z.object({
    type: z.literal('control_evidence_attested'),
    verdict_id: z.string(),
    control_id: z.string(),
    attested_by_name: z.string(),
    evidence_note: z.string(),
  }),
]);

const AUDIT_EVENT_TYPES = [
  'use_case_created',
  'duplicate_dismissed',
  'classification_adopted',
  'graph_confirmed',
  'verdict_produced',
  'graph_corrected',
  'verdict_corrected',
  'lifecycle_stage_changed',
  're_evaluation_queued',
  'twoloD_reviewed',
  'reasoning_trace_generated',
  'rule_dissent_filed',
  'sampling_reviewed',
  'control_ownership_assigned',
  'control_evidence_attested',
] as const;

const auditEventSchema = z
  .object({
    event_id: z.string(),
    use_case_id: z.string(),
    event_type: z.enum(AUDIT_EVENT_TYPES),
    occurred_at: isoDatetime,
    actor: z.string(),
    payload: auditPayloadSchema,
    prev_hash: z.string().nullable(),
    hash: z.string(),
  })
  .refine((e) => e.event_type === e.payload.type, {
    message: 'event_type does not match payload.type',
  });

const REGISTER_NODE_TYPES = ['use_case', 'ai_model', 'platform', 'vendor', 'data_source', 'control'] as const;

// Mirrors RegisterNodeMetadata (src/store/types.ts) variant-for-variant.
const registerNodeMetadataSchema = z.discriminatedUnion('node_type', [
  z.object({
    node_type: z.literal('use_case'),
    description: z.string().optional(),
    submitted_by: z.string(),
    lifecycle_stage: lifecycleStageSchema,
    current_verdict_id: z.string().nullable(),
    tier: z.string().nullable(),
    track: z.string().nullable(),
  }),
  z.object({
    node_type: z.literal('ai_model'),
    model_id: z.string(),
    vendor: z.string(),
    is_approved: z.boolean(),
  }),
  z.object({
    node_type: z.literal('platform'),
    platform_id: z.string(),
    approved_envelope_summary: z.string(),
  }),
  z.object({
    node_type: z.literal('vendor'),
    vendor_name: z.string(),
    approval_status: z.enum(['approved', 'unapproved', 'pending']),
  }),
  z.object({
    node_type: z.literal('data_source'),
    data_class: z.string(),
    data_zone: z.string(),
  }),
  z.object({
    node_type: z.literal('control'),
    control_id: z.string(),
    burden: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  }),
]);

const registerNodeSchema = z
  .object({
    node_id: z.string(),
    node_type: z.enum(REGISTER_NODE_TYPES),
    label: z.string(),
    created_at: isoDatetime,
    metadata: registerNodeMetadataSchema,
  })
  .refine((n) => n.node_type === n.metadata.node_type, {
    message: 'node_type does not match metadata.node_type',
  });

const registerEdgeSchema = z.object({
  edge_id: z.string(),
  from_node_id: z.string(),
  to_node_id: z.string(),
  edge_type: z.enum(['uses_model', 'runs_on_platform', 'provided_by_vendor', 'consumes_data_from', 'requires_control']),
  created_at: isoDatetime,
});

// Cheap pre-check so an unsupported format_version gets its OWN honest
// message (F3/F4/F13/F20) instead of the generic "not a bundle" one — run
// BEFORE the full schema, which would otherwise fail the same way for both.
const bundleEnvelopeSchema = z.object({ format: z.string(), format_version: z.number() }).passthrough();

const handoffBundleSchema = z.object({
  format: z.literal('aigate-handoff'),
  format_version: z.literal(HANDOFF_FORMAT_VERSION),
  exported_at: isoDatetime,
  app_version: z.string(),
  register: z.object({
    nodes: z.array(registerNodeSchema),
    edges: z.array(registerEdgeSchema),
  }),
  audit_events: z.array(auditEventSchema),
  // sha256 over the canonical serialisation of everything above. Covers the
  // register (which is NOT hash-chained) and binds it to the audit tip, so a
  // bundle whose register was altered in transit fails even though the audit
  // chain alone would still verify.
  seal: z.string(),
});

export interface HandoffBundle {
  format: 'aigate-handoff';
  format_version: typeof HANDOFF_FORMAT_VERSION;
  exported_at: string;
  app_version: string;
  register: { nodes: RegisterNode[]; edges: RegisterEdge[] };
  audit_events: AuditEvent[];
  seal: string;
}

// --- Canonical serialisation (deterministic; the seal depends on it) -----
//
// Sorted keys, sorted collections by their stable id, so two machines with
// the same logical state produce byte-identical input to the seal hash.
// Register nodes/edges are re-sorted by id; audit events keep their
// chain order (they are already globally ordered — see audit.ts's
// chain-linked export order — and the chain itself is order-sensitive).

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

function sealInput(
  register: { nodes: RegisterNode[]; edges: RegisterEdge[] },
  events: AuditEvent[],
): string {
  const nodes = [...register.nodes].sort((a, b) => a.node_id.localeCompare(b.node_id));
  const edges = [...register.edges].sort((a, b) => a.edge_id.localeCompare(b.edge_id));
  const tip = events.length > 0 ? events[events.length - 1]!.hash : 'EMPTY';
  return canonicalJson({ nodes, edges, audit_tip: tip, audit_count: events.length });
}

// Exported (code-review-005 F2) so tests proving the documented seal limit —
// "anyone holding the file can recompute it" — can do so with this module's
// own public function instead of re-implementing the algorithm privately.
export async function computeSeal(
  register: { nodes: RegisterNode[]; edges: RegisterEdge[] },
  events: AuditEvent[],
): Promise<string> {
  return sha256Hex(sealInput(register, events));
}

// --- Export ---------------------------------------------------------------

export async function exportBundle(appVersion: string): Promise<HandoffBundle> {
  const register = await exportAll();
  const audit_events = await getAllForExport(); // chain-ordered
  const seal = await computeSeal(register, audit_events);
  return {
    format: 'aigate-handoff',
    format_version: HANDOFF_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    app_version: appVersion,
    register,
    audit_events,
    seal,
  };
}

// --- Import ---------------------------------------------------------------

export type ImportOutcome =
  | 'invalid_format' // not a bundle / schema failed
  | 'tampered' // seal or internal chain broken
  | 'up_to_date' // bundle == local, nothing to do
  | 'local_ahead' // local already extends the bundle, nothing to do
  | 'merged' // bundle extended local; events/register absorbed
  | 'imported_into_empty' // local was empty; whole bundle absorbed (code-review-005 F27: was 'adopted', which collided with the unrelated classification_adopted audit event)
  | 'replaced' // user-confirmed: local discarded (backup taken), bundle installed
  | 'diverged'; // two histories that cannot be merged — rejected, no writes

export interface ImportResult {
  outcome: ImportOutcome;
  message: string;
  eventsAdded: number;
}

// --- F14: remember successful syncs, so a later divergence reads as a
// warning rather than a reassurance --------------------------------------
//
// A browser's FIRST hand-off receipt always diverges (every browser seeds
// its own demo cases), so the first-time message is deliberately calm. Once
// a sync has actually succeeded, a LATER divergence means something the
// product cannot explain away as normal — the wrong file, both sides
// editing at once, or an altered file — so the message changes to a
// warning. localStorage is the simplest durable, per-browser marker that
// survives reloads without a schema migration on either IndexedDB database;
// it is best-effort (private browsing can block it) and never used for
// anything safety-critical — only for which of two pieces of copy to show.
const LAST_SYNCED_TIP_KEY = 'aigate-handoff-last-synced-tip';

function recordSyncedTip(tipHash: string | null): void {
  try {
    if (tipHash === null) {
      localStorage.removeItem(LAST_SYNCED_TIP_KEY);
    } else {
      localStorage.setItem(LAST_SYNCED_TIP_KEY, tipHash);
    }
  } catch {
    /* localStorage unavailable — the sync marker is advisory copy, not a safety mechanism */
  }
}

function hasSyncedBefore(): boolean {
  try {
    return localStorage.getItem(LAST_SYNCED_TIP_KEY) !== null;
  } catch {
    return false;
  }
}

// TEST-ONLY (code-review-005 F14). Mirrors audit.__resetChainStateForTests /
// db.__resetDbsForTests — simulating a "fresh browser" in one test process
// needs this reset alongside those. Not a runtime path.
export function __resetHandoffSyncStateForTests(): void {
  try {
    localStorage.removeItem(LAST_SYNCED_TIP_KEY);
  } catch {
    /* ignore */
  }
}

const FIRST_TIME_DIVERGED_MESSAGE =
  "This bundle and your copy have different histories, so they can't be merged. The first time you receive a case this is normal — your browser starts with its own demo cases. You can save a backup of yours and replace it with this bundle.";

const REPEAT_DIVERGED_MESSAGE =
  "Warning: this bundle doesn't continue the history you last synced. That shouldn't happen at this stage — it can mean the wrong file, both of you changing the case at once, or a file that was altered. Check with the sender before replacing anything.";

// Steps shared by import and replace so neither can skip a check: shape,
// duplicate ids, seal, and the incoming chain's own internal integrity.
async function validateBundle(raw: unknown): Promise<{ bundle: HandoffBundle } | { failure: ImportResult }> {
  // 1. format_version gets its own honest message (F3/F4/F13/F20) — checked
  //    before the strict schema, which would otherwise fail identically for
  //    "not a bundle at all" and "a bundle from a different app version".
  const envelope = bundleEnvelopeSchema.safeParse(raw);
  if (!envelope.success || envelope.data.format !== 'aigate-handoff') {
    return { failure: { outcome: 'invalid_format', message: 'This file is not an AIGate hand-off bundle.', eventsAdded: 0 } };
  }
  if (envelope.data.format_version !== HANDOFF_FORMAT_VERSION) {
    return {
      failure: {
        outcome: 'invalid_format',
        message: "This hand-off file was made by a different version of AIGate and can't be imported here.",
        eventsAdded: 0,
      },
    };
  }

  // 2. Full shape + semantic validation (see the block comment above the
  //    schemas): every event/node/edge field present, correctly typed, from
  //    the known type sets, with each variant's own required fields checked.
  const parsed = handoffBundleSchema.safeParse(raw);
  if (!parsed.success) {
    return { failure: { outcome: 'invalid_format', message: 'This file is not an AIGate hand-off bundle.', eventsAdded: 0 } };
  }
  const bundle = parsed.data as HandoffBundle;

  // 3. Duplicate event ids inside one bundle (F3/F4/F13/F20) — a bundle
  //    cannot be internally self-consistent if it claims the same event
  //    twice, and importTailIfContinues' db.add() would only fail loudly
  //    AFTER the seal/chain checks below had already passed.
  const seenIds = new Set<string>();
  for (const e of bundle.audit_events) {
    if (seenIds.has(e.event_id)) {
      return {
        failure: {
          outcome: 'invalid_format',
          message: `This bundle has more than one event with the id "${e.event_id}" and cannot be imported.`,
          eventsAdded: 0,
        },
      };
    }
    seenIds.add(e.event_id);
  }

  // 4. Tamper in transit: recompute the seal over the bundle's own contents.
  const expectedSeal = await computeSeal(bundle.register, bundle.audit_events);
  if (expectedSeal !== bundle.seal) {
    return {
      failure: {
        outcome: 'tampered',
        message: 'This bundle was altered after it was exported — its seal does not match its contents. Nothing was imported.',
        eventsAdded: 0,
      },
    };
  }

  // 5. Internal chain integrity of the incoming events, independent of the
  //    local store — the FULL walk (linkage + each event's content hash), so
  //    a payload edited in transit is caught here even in the case the seal
  //    (which binds only the tip) would not cover.
  const incoming = await verifyChainOf(bundle.audit_events);
  if (!incoming.ok) {
    return {
      failure: {
        outcome: 'tampered',
        message: `The bundle's audit chain is broken at event ${incoming.brokenAtEventId} (${incoming.reason}). Nothing was imported.`,
        eventsAdded: 0,
      },
    };
  }
  return { bundle };
}

// The explicit, user-confirmed way out of 'diverged'. Found by a live dry run
// (2026-09-27): every browser seeds its own demo cases on first load, so a
// reviewer's register is never empty and never a prefix of the submitter's —
// plain import refused EVERY real two-machine hand-off. Replacing is honest
// only because the caller (a) asks the user and (b) hands them a backup of
// the register being discarded first (RegisterView's two-step confirmation,
// code-review-005 F1). Same seal + chain checks as import.
//
// code-review-005 F6: the audit trail (source of truth) is replaced BEFORE
// the register (a derived view) — a mid-way failure then leaves the source
// of truth already correct and only the presentation layer stale, never the
// reverse (a register showing a stage/verdict its own trail cannot justify).
// F16: each replace is its own atomic "read what's discarded, then discard
// it" queued step (audit.backupAndReplaceAllRawEvents /
// register.backupAndReplaceRegister) — see those functions for why that
// closes a real data-loss window a two-call "export, then replace" left
// open.
export async function replaceWithBundle(raw: unknown): Promise<ImportResult> {
  const v = await validateBundle(raw);
  if ('failure' in v) return v.failure;
  const { bundle } = v;

  await backupAndReplaceAllRawEvents(bundle.audit_events);
  try {
    await backupAndReplaceRegister(bundle.register.nodes, bundle.register.edges);
  } catch (err) {
    // The audit trail (source of truth) is already replaced; the register
    // (derived view) failed to follow. Surface this honestly — RegisterView
    // catches it and shows it (F6) — rather than claiming a clean replace.
    throw new Error(
      `Your audit trail was replaced, but the register view could not be updated: ${
        err instanceof Error ? err.message : String(err)
      }. Reload to see the latest state.`,
    );
  }

  recordSyncedTip(bundle.audit_events.at(-1)?.hash ?? null);

  return {
    outcome: 'replaced',
    message: `Your register was replaced with this bundle (${bundle.audit_events.length} events). Your previous register is in the backup file you saved.`,
    eventsAdded: bundle.audit_events.length,
  };
}

export async function importBundle(raw: unknown): Promise<ImportResult> {
  const v = await validateBundle(raw);
  if ('failure' in v) return v.failure;
  const { bundle } = v;

  // code-review-005 F5: read-the-local-chain, check-the-prefix, and write-
  // the-tail now happen as ONE queued step inside audit.ts, re-verified
  // immediately before the write — see importTailIfContinues for why the
  // old three-separate-calls version could race a concurrent import/append.
  const tailResult = await importTailIfContinues(bundle.audit_events);

  if (tailResult.kind === 'diverged') {
    return {
      outcome: 'diverged',
      message: hasSyncedBefore() ? REPEAT_DIVERGED_MESSAGE : FIRST_TIME_DIVERGED_MESSAGE,
      eventsAdded: 0,
    };
  }
  if (tailResult.kind === 'local_ahead') {
    recordSyncedTip(bundle.audit_events.at(-1)?.hash ?? null);
    return { outcome: 'local_ahead', message: 'Your copy already contains everything in this bundle and more. Nothing to import.', eventsAdded: 0 };
  }
  if (tailResult.kind === 'up_to_date') {
    recordSyncedTip(bundle.audit_events.at(-1)?.hash ?? null);
    return { outcome: 'up_to_date', message: 'Your copy is already up to date with this bundle. Nothing to import.', eventsAdded: 0 };
  }

  // tailResult.kind === 'imported'. When the tail IS the whole bundle, the
  // local chain was empty beforehand — imported_into_empty; otherwise it is
  // a genuine merge of the new tail onto an existing chain.
  const outcome: ImportOutcome = tailResult.added === bundle.audit_events.length ? 'imported_into_empty' : 'merged';

  // code-review-005 F6: register (derived view) written AFTER the audit
  // trail (source of truth, already updated by importTailIfContinues
  // above) — a failure here leaves the trail correct and only the register
  // stale, which RegisterView surfaces rather than swallows.
  try {
    await importRegister(bundle.register.nodes, bundle.register.edges);
  } catch (err) {
    throw new Error(
      `The audit trail was updated (${tailResult.added} event${tailResult.added === 1 ? '' : 's'}), but the register view could not be refreshed: ${
        err instanceof Error ? err.message : String(err)
      }. Reload to see the latest state.`,
    );
  }

  recordSyncedTip(bundle.audit_events.at(-1)?.hash ?? null);

  return outcome === 'imported_into_empty'
    ? { outcome, message: `Imported ${tailResult.added} events into an empty register.`, eventsAdded: tailResult.added }
    : { outcome, message: `Merged ${tailResult.added} new event${tailResult.added === 1 ? '' : 's'} from this bundle.`, eventsAdded: tailResult.added };
}
