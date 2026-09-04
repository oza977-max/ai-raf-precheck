import { z } from 'zod';
import type { AuditEvent, RegisterNode, RegisterEdge } from './types';
import { getAllForExport, importRawEvents, verifyChain, verifyChainOf, sha256Hex } from './audit';
import { exportAll, importRegister } from './register';

// RG-6 — verified hand-off bundle (2026-09-01). The core end-to-end gap:
// AIGate's whole value is a SUBMITTER and a REVIEWER who are different
// people, but the app runs entirely in one browser, so "1LoD" and "2LoD"
// were a role toggle on one machine. This module lets a bundle of the
// register + the append-only audit trail be exported from one machine and
// imported on another, with the hash chain used exactly as intended: any
// tamper in transit is detected on arrival, and — the honest hard part —
// two histories can only be merged when one is a PREFIX of the other.
//
// WHY PREFIX-ONLY IS THE CORRECT INVARIANT, NOT A LIMITATION.
// The hash chain is global: every event's hash depends on the one before
// it, back to genesis. Two chains grown independently on two machines share
// no common suffix and cannot be concatenated without either recomputing
// hashes (destroying the tamper-evidence that was verified at the source)
// or leaving a break (a false tamper signal). There is no honest general
// merge. But the hand-off workflow never produces divergent chains: A
// exports, B imports and appends its sign-off, B exports back, A imports.
// At every step one side's chain is a prefix of the other's. So the rule is
// exact: import succeeds iff the local chain and the bundle chain are
// prefix-compatible (one extends the other, byte-for-byte on the shared
// span); anything else is a genuine fork and is REJECTED with no writes.
// This is idempotent (re-importing an already-absorbed bundle is a no-op)
// and it refuses precisely the case it cannot honestly handle.

export const HANDOFF_FORMAT_VERSION = 1;

// --- Bundle shape + validation -------------------------------------------
//
// The event/node/edge payloads are validated structurally (right fields,
// right primitive types) but not re-typed against every discriminated-union
// variant — the audit chain's own hash verification is the real integrity
// gate, and z.record/z.unknown here keeps this schema from having to track
// every payload variant in two places (it would drift, per the project's
// own RF-1/RF-3 recurring findings). What this schema guarantees is that
// the bundle is shaped like a bundle before any hashing runs.

const auditEventSchema = z.object({
  event_id: z.string(),
  use_case_id: z.string(),
  event_type: z.string(),
  occurred_at: z.string(),
  actor: z.string(),
  payload: z.object({ type: z.string() }).passthrough(),
  prev_hash: z.string().nullable(),
  hash: z.string(),
});

const registerNodeSchema = z.object({
  node_id: z.string(),
  node_type: z.string(),
  label: z.string(),
  created_at: z.string(),
  metadata: z.object({}).passthrough(),
});

const registerEdgeSchema = z.object({
  edge_id: z.string(),
  from_node_id: z.string(),
  to_node_id: z.string(),
  edge_type: z.string(),
  created_at: z.string(),
});

const handoffBundleSchema = z.object({
  format: z.literal('aigate-handoff'),
  format_version: z.literal(HANDOFF_FORMAT_VERSION),
  exported_at: z.string(),
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
// chain order (they are already globally ordered by occurred_at, and the
// chain itself is order-sensitive).

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

async function computeSeal(
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
  | 'adopted' // local was empty; whole bundle absorbed
  | 'diverged'; // genuine fork — rejected, no writes

export interface ImportResult {
  outcome: ImportOutcome;
  message: string;
  eventsAdded: number;
}

// Is `a` a prefix of `b`? Two chains are prefix-compatible on the shorter
// length when every event over that span is byte-identical (same id, same
// stored prev_hash and hash). Because hashes are content-derived, matching
// hashes over a span means matching content over that span — so this is a
// full structural-equality check, not just an id check.
function chainPrefixMatch(a: readonly AuditEvent[], b: readonly AuditEvent[]): boolean {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.event_id !== y.event_id || x.prev_hash !== y.prev_hash || x.hash !== y.hash) return false;
  }
  return true;
}

export async function importBundle(raw: unknown): Promise<ImportResult> {
  // 1. Shape.
  const parsed = handoffBundleSchema.safeParse(raw);
  if (!parsed.success) {
    return { outcome: 'invalid_format', message: 'This file is not an AIGate hand-off bundle.', eventsAdded: 0 };
  }
  const bundle = parsed.data as HandoffBundle;

  // 2. Tamper in transit: recompute the seal over the bundle's own contents.
  const expectedSeal = await computeSeal(bundle.register, bundle.audit_events);
  if (expectedSeal !== bundle.seal) {
    return {
      outcome: 'tampered',
      message: 'This bundle was altered after it was exported — its seal does not match its contents. Nothing was imported.',
      eventsAdded: 0,
    };
  }

  // 3. Internal chain integrity of the incoming events, independent of the
  //    local store — the FULL walk (linkage + each event's content hash), so
  //    a payload edited in transit is caught here even in the case the seal
  //    (which binds only the tip) would not cover.
  const incoming = await verifyChainOf(bundle.audit_events);
  if (!incoming.ok) {
    return {
      outcome: 'tampered',
      message: `The bundle's audit chain is broken at event ${incoming.brokenAtEventId} (${incoming.reason}). Nothing was imported.`,
      eventsAdded: 0,
    };
  }

  // 4. Prefix relationship against the LOCAL chain.
  const local = await getAllForExport();

  if (local.length === 0) {
    await importRegister(bundle.register.nodes, bundle.register.edges);
    await importRawEvents(bundle.audit_events);
    return { outcome: 'adopted', message: `Imported ${bundle.audit_events.length} events into an empty register.`, eventsAdded: bundle.audit_events.length };
  }

  if (!chainPrefixMatch(local, bundle.audit_events)) {
    return {
      outcome: 'diverged',
      message:
        'This bundle and your copy have both changed since they were last in sync — their histories have diverged and cannot be merged. Export a fresh bundle from one side and import it into an empty register on the other.',
      eventsAdded: 0,
    };
  }

  if (bundle.audit_events.length < local.length) {
    return { outcome: 'local_ahead', message: 'Your copy already contains everything in this bundle and more. Nothing to import.', eventsAdded: 0 };
  }
  if (bundle.audit_events.length === local.length) {
    return { outcome: 'up_to_date', message: 'Your copy is already up to date with this bundle. Nothing to import.', eventsAdded: 0 };
  }

  // Bundle strictly extends local: absorb the tail + adopt the bundle's
  // register state (bundle wins — it carries any lifecycle/verdict updates
  // that accompanied the new events).
  const tail = bundle.audit_events.slice(local.length);
  await importRegister(bundle.register.nodes, bundle.register.edges);
  await importRawEvents(tail);
  return { outcome: 'merged', message: `Merged ${tail.length} new event${tail.length === 1 ? '' : 's'} from this bundle.`, eventsAdded: tail.length };
}

// Re-export for callers that want to confirm the LIVE store is intact after
// an import (the UI shows this the same way it shows it on the sign-off
// page). Keeps handoff.ts the single import surface.
export { verifyChain };
