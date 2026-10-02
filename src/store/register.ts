import { openRegisterDb, createWriteQueue } from './db';
import { appendWithinQueue, withAuditQueue, getAll as getAuditEvents } from './audit';
import type { RegisterNode, RegisterEdge, UseCaseSummary, LifecycleStage, AuditEvent } from './types';
import { isVerdictProvisional } from '../engine/provisional';
import { isSampledForReview } from '../engine/temporal';
import type { PolicyFile, ProcessingNode } from '../engine/types';

// Rule 3 (cross-cutting.md §7): persistence-only, no evaluation logic, no LLM, no React.
// Repository pattern (Fowler) — this is the only module that reaches into
// aigate-register's IndexedDB stores directly.

// code-review-005 F17. A whole-register replace/import (the hand-off path)
// was not serialised against the OTHER functions in this file that also
// write register_nodes/register_edges — two independently-created IndexedDB
// transactions on the same store race on their RELATIVE order, so e.g. a
// plain addNode() mid-replace could either be silently wiped by the
// replace's clear() or land after it and survive, depending on timing.
// Every write below (and exportAll's read, for F18) goes through this one
// queue; db.ts's factory also takes a named cross-tab lock where the
// browser supports it, so a second TAB writing the register is serialised
// too — not just this tab's own concurrent calls.
const enqueueRegister = createWriteQueue('aigate-register-write');

export function addNode(node: RegisterNode): Promise<void> {
  return enqueueRegister(async () => {
    const db = await openRegisterDb();
    await db.add('register_nodes', node);
  });
}

export function addEdge(edge: RegisterEdge): Promise<void> {
  return enqueueRegister(async () => {
    const db = await openRegisterDb();
    await db.add('register_edges', edge);
  });
}

// R11-MG-3 / ADR-RL-R11-1 (register-lifecycle.md §16). Consumes the
// `ai_model` node type and `uses_model` edge type — defined since the
// register's first schema and never once instantiated (CLAUDE.md's standing
// gotcha: "a field that is computed but never consumed is a bug in
// waiting"). Deterministically keyed by `model_id` so the SAME model
// declared by two different use cases resolves to ONE `ai_model` node —
// the dormancy-repeat guard the fit criteria name. `vendor`/`is_approved`
// are a snapshot of the policy registry AT WRITE TIME, not a live join —
// consistent with the append-only discipline elsewhere in the register.
export function addUseCaseModelLink(
  useCaseId: string,
  processingNode: ProcessingNode,
  policy: PolicyFile,
): Promise<void> {
  const modelId = processingNode.declared_model_id;
  if (!modelId) return Promise.resolve();

  return enqueueRegister(async () => {
    const db = await openRegisterDb();
    const modelNodeId = `ai-model-${modelId}`;
    const existing = await db.get('register_nodes', modelNodeId);

    if (!existing) {
      const entry = (policy.approved_models ?? []).find((m) => m.model_id === modelId);
      await db.add('register_nodes', {
        node_id: modelNodeId,
        node_type: 'ai_model',
        label: modelId,
        created_at: new Date().toISOString(),
        metadata: {
          node_type: 'ai_model',
          model_id: modelId,
          vendor: entry?.vendor ?? 'unknown',
          is_approved: entry?.is_approved ?? false,
        },
      });
    }

    await db.add('register_edges', {
      edge_id: crypto.randomUUID(),
      from_node_id: useCaseId,
      to_node_id: modelNodeId,
      edge_type: 'uses_model',
      created_at: new Date().toISOString(),
    });
  });
}

// Find the most recent verdict-bearing event (verdict_produced or
// verdict_corrected) in an audit trail. Events are returned by audit.getAll()
// in occurred_at order (monotonic tie-break — see audit.ts), so the last
// matching entry is the current verdict.
// Exported since P8-C06 (register-lifecycle.md §15.1b, design review I-4).
// P8-C07 renders the verdict on the sign-off page and needs the same scan;
// exporting it is what stops a third copy being written — the duplication
// ADR-EE-R3-1 exists to close.
export function findLatestVerdictEvent(
  events: AuditEvent[]
): Extract<AuditEvent['payload'], { type: 'verdict_produced' | 'verdict_corrected' }> | undefined {
  for (const event of [...events].reverse()) {
    if (event.payload.type === 'verdict_produced' || event.payload.type === 'verdict_corrected') {
      return event.payload;
    }
  }
  return undefined;
}

// UseCaseSummary is a derived/computed read view — never separately stored,
// to avoid dual-write inconsistency (Fowler). current_verdict_status,
// last_evaluated_at, policy_version_at_evaluation, and stale_assessment are
// computed here by scanning the use case's audit trail (verdict-audit.md §8:
// "computed by scanning AuditEvent[], not persisted separately"), not read
// from RegisterNodeMetadata.
function toSummary(
  node: RegisterNode,
  auditEvents: AuditEvent[],
  currentPolicyVersion?: string,
  samplingRate?: number,
): UseCaseSummary {
  if (node.metadata.node_type !== 'use_case') {
    throw new Error(`toSummary() called on non-use_case node: ${node.node_id}`);
  }
  const metadata = node.metadata;
  const latestVerdictEvent = findLatestVerdictEvent(auditEvents);
  const verdict = latestVerdictEvent
    ? latestVerdictEvent.type === 'verdict_produced'
      ? latestVerdictEvent.verdict
      : latestVerdictEvent.new_verdict
    : undefined;
  const latestVerdictEventEntry = latestVerdictEvent
    ? auditEvents.find((e) => e.payload === latestVerdictEvent)
    : undefined;

  // ADR-EE-R3-1: read the engine's determination, never re-derive it. The
  // register row and the verdict screen cannot disagree, because there is one
  // determination.
  const isProvisional = verdict ? isVerdictProvisional(verdict) : false;

  // Deviation (documented in build/prompts/P6-C01.md): compared against the
  // current loaded policy version, not "active pack versions" — jurisdiction
  // packs don't exist in this codebase yet.
  const staleAssessment = Boolean(
    verdict && currentPolicyVersion !== undefined && verdict.policy_version !== currentPolicyVersion
  );

  // R12-AB-1: "self-served" = never touched by a 2LoD sign-off event — a
  // decided Low-tier verdict that reached its outcome without a reviewer.
  // Deterministic selection is re-applied here (register.ts already loads
  // the full trail per row for staleAssessment/isProvisional above, so this
  // is a free read, not a new N+1).
  const wasTwoLoDReviewed = auditEvents.some((e) => e.payload.type === 'twoloD_reviewed');
  const alreadySamplingReviewed =
    verdict !== undefined &&
    auditEvents.some((e) => e.payload.type === 'sampling_reviewed' && e.payload.verdict_id === verdict.id);
  const samplingReviewDue = Boolean(
    verdict &&
      metadata.tier === 'Low' &&
      !wasTwoLoDReviewed &&
      samplingRate !== undefined &&
      isSampledForReview(verdict.id, samplingRate) &&
      !alreadySamplingReviewed,
  );

  return {
    use_case_id: node.node_id,
    label: node.label,
    description: metadata.description,
    submitted_by: metadata.submitted_by,
    submitted_at: node.created_at,
    lifecycle_stage: metadata.lifecycle_stage,
    tier: metadata.tier,
    track: metadata.track,
    current_verdict_status: verdict ? verdict.status : null,
    provisional: isProvisional,
    last_evaluated_at: latestVerdictEventEntry?.occurred_at ?? null,
    policy_version_at_evaluation: verdict?.policy_version ?? null,
    stale_assessment: staleAssessment,
    provisional_reasons: verdict?.provisional_reasons ? [...verdict.provisional_reasons] : [],
    current_verdict_id: verdict?.id ?? null,
    sampling_review_due: samplingReviewDue,
  };
}

// code-review-005 F17: get-then-put used to be two separate implicit
// transactions, which let another writer's transaction land in between them
// — invisible in a single tab (nothing else runs between two `await`s on the
// same microtask queue... except another async caller of THIS SAME function,
// or of backupAndReplaceRegister/importRegister, genuinely can), and a real
// lost update across two tabs (IndexedDB serialises transactions against the
// same store even across tabs, so making this ONE transaction closes that
// gap there too). Also routed through enqueueRegister so it cannot interleave
// with a whole-register replace/import.
export function updateUseCaseVerdictSummary(
  useCaseId: string,
  summary: Partial<UseCaseSummary> & { currentVerdictId?: string }
): Promise<void> {
  return enqueueRegister(async () => {
    const db = await openRegisterDb();
    const tx = db.transaction('register_nodes', 'readwrite');
    const node = await tx.store.get(useCaseId);
    if (!node || node.metadata.node_type !== 'use_case') {
      throw new Error(`updateUseCaseVerdictSummary(): no use_case node found for ${useCaseId}`);
    }

    const updatedNode: RegisterNode = {
      ...node,
      metadata: {
        ...node.metadata,
        tier: summary.tier ?? node.metadata.tier,
        track: summary.track ?? node.metadata.track,
        // currentVerdictId (P5-C01, verdict-audit.md §6.2) — a correction
        // must point the register at the NEW verdict, not the original.
        current_verdict_id: summary.currentVerdictId ?? node.metadata.current_verdict_id,
      },
    };

    await tx.store.put(updatedNode);
    await tx.done;
  });
}

// register-lifecycle.md §6: both writes (node update + audit append) happen in
// the same async call. They are not wrapped in a transaction TOGETHER —
// partial write risk between the register and the audit trail is an
// acknowledged V1 limitation (unchanged by this round; see code-review-005
// F6, which is scoped to the hand-off import/replace path only). What DID
// change here (F17): the register's own get-then-put is now one transaction,
// queued against every other register writer, so a concurrent replace/import
// or another lifecycle change cannot land between the read and the write.
//
// code-review-005 round 2, N3: this used to hold the REGISTER queue
// (enqueueRegister) for the whole function and await audit.append() —
// itself queued on the AUDIT queue — from inside that callback. That is the
// opposite nesting from handoff.ts's replaceWithBundle (audit, then
// register), and this codebase's fixed rule (audit.ts's withAuditQueue doc)
// is that every operation touching both queues nests the SAME way: audit
// outer, register inner. Flipped here to match — the register write still
// happens first and the audit append second (same order as before; only
// which queue is held OUTERMOST changed) — so a concurrent replace can no
// longer interleave with an approval and leave the audit trail recording a
// change the register does not show (reproduced in audit.test.ts /
// handoff.test.ts). appendWithinQueue(), not append(), because this callback
// is already running inside the audit queue by the time it is called —
// calling append() (which enqueues again) here would deadlock.
export function updateLifecycleStage(
  useCaseId: string,
  stage: LifecycleStage,
  actor: string
): Promise<void> {
  return withAuditQueue(async () => {
    const fromStage = await enqueueRegister(async () => {
      const db = await openRegisterDb();
      const tx = db.transaction('register_nodes', 'readwrite');
      const node = await tx.store.get(useCaseId);
      if (!node || node.metadata.node_type !== 'use_case') {
        throw new Error(`updateLifecycleStage(): no use_case node found for ${useCaseId}`);
      }

      const fromStage = node.metadata.lifecycle_stage;

      const updatedNode: RegisterNode = {
        ...node,
        metadata: {
          ...node.metadata,
          lifecycle_stage: stage,
        },
      };

      await tx.store.put(updatedNode);
      await tx.done;
      return fromStage;
    });

    await appendWithinQueue({
      event_id: crypto.randomUUID(),
      use_case_id: useCaseId,
      event_type: 'lifecycle_stage_changed',
      occurred_at: new Date().toISOString(),
      actor,
      payload: {
        type: 'lifecycle_stage_changed',
        from_stage: fromStage,
        to_stage: stage,
      },
    });
  });
}

// ADR-009: role filter applied at the query layer, not in-memory. role 'all'
// returns every use_case node (2LoD view) via by_type; an actor ID filters via
// by_submitted_by.
// N+1 audit query per use case — acceptable at V1 scale (small register),
// documented as a known scaling limit in build/prompts/P6-C01.md, not
// silently ignored.
export async function getUseCases(
  role: 'all' | string,
  currentPolicyVersion?: string,
  samplingRate?: number,
): Promise<UseCaseSummary[]> {
  const db = await openRegisterDb();

  const nodes =
    role === 'all'
      ? await db.getAllFromIndex('register_nodes', 'by_type', 'use_case')
      : await db.getAllFromIndex('register_nodes', 'by_submitted_by', role);

  const useCaseNodes = nodes.filter(
    (node): node is RegisterNode & { metadata: { node_type: 'use_case' } } => node.node_type === 'use_case'
  );

  // code-review-005 F3: one malformed row (pre-dating this round's import
  // validation, or written by some other path) used to throw inside
  // Promise.all and freeze the ENTIRE list on "Loading…" forever, with the
  // bad row left in IndexedDB and no in-app recovery. Promise.allSettled +
  // a per-row catch means a single unreadable node is skipped and logged,
  // not fatal to every other row a user needs to see.
  const settled = await Promise.allSettled(
    useCaseNodes.map(async (node) => {
      const auditEvents = await getAuditEvents(node.node_id);
      return toSummary(node, auditEvents, currentPolicyVersion, samplingRate);
    })
  );

  const summaries: UseCaseSummary[] = [];
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i]!;
    if (result.status === 'fulfilled') {
      summaries.push(result.value);
    } else {
      console.error(
        `getUseCases(): skipping unreadable register row ${useCaseNodes[i]!.node_id} —`,
        result.reason,
      );
    }
  }
  return summaries;
}

export async function getUseCase(
  useCaseId: string,
  currentPolicyVersion?: string,
  samplingRate?: number,
): Promise<UseCaseSummary | undefined> {
  const db = await openRegisterDb();
  const node = await db.get('register_nodes', useCaseId);
  if (!node || node.metadata.node_type !== 'use_case') {
    return undefined;
  }
  const auditEvents = await getAuditEvents(useCaseId);
  return toSummary(node, auditEvents, currentPolicyVersion, samplingRate);
}

// register-lifecycle.md §10.2: the "Policy updated" banner fires when a
// use case has a re_evaluation_queued event more recent than its latest
// verdict event. Dormant in practice until P6-C02 builds the
// onPolicyUpdated() trigger that writes re_evaluation_queued events — the
// check itself is real, not stubbed.
export async function hasPendingPolicyUpdate(useCaseIds: string[]): Promise<boolean> {
  for (const useCaseId of useCaseIds) {
    const events = await getAuditEvents(useCaseId);
    let lastVerdictIndex = -1;
    let lastQueuedIndex = -1;
    events.forEach((event, index) => {
      if (event.payload.type === 'verdict_produced' || event.payload.type === 'verdict_corrected') {
        lastVerdictIndex = index;
      }
      if (event.payload.type === 're_evaluation_queued') {
        lastQueuedIndex = index;
      }
    });
    if (lastQueuedIndex > lastVerdictIndex) {
      return true;
    }
  }
  return false;
}

export async function getGraph(useCaseId: string): Promise<{ nodes: RegisterNode[]; edges: RegisterEdge[] }> {
  const db = await openRegisterDb();

  const outgoingEdges = await db.getAllFromIndex('register_edges', 'by_from_node', useCaseId);
  const nodeIds = new Set<string>([useCaseId, ...outgoingEdges.map((e) => e.to_node_id)]);

  const nodes = (
    await Promise.all(Array.from(nodeIds).map((id) => db.get('register_nodes', id)))
  ).filter((n): n is RegisterNode => n !== undefined);

  return { nodes, edges: outgoingEdges };
}

// Blast radius: query by_to_node index (O(edges referencing this component)),
// map matching edges to from_node_id, fetch each register_nodes row. Not a
// full table scan (Kleppmann).
export async function getBlastRadius(componentNodeId: string): Promise<RegisterNode[]> {
  const db = await openRegisterDb();

  const incomingEdges = await db.getAllFromIndex('register_edges', 'by_to_node', componentNodeId);
  const fromNodeIds = Array.from(new Set(incomingEdges.map((e) => e.from_node_id)));

  const nodes = (
    await Promise.all(fromNodeIds.map((id) => db.get('register_nodes', id)))
  ).filter((n): n is RegisterNode => n !== undefined);

  return nodes;
}

// code-review-005 F18: routed through the SAME queue as every writer above,
// so exportAll() cannot observe a torn mid-write state (e.g. a replace's
// clear() having run on register_nodes but not yet on register_edges).
// handoff.ts's exportBundle() calls this and audit.getAllForExport()
// separately — each is now clean WITHIN its own store, which is the
// strongest guarantee possible without a single transaction spanning two
// separate IndexedDB databases (not something idb/IndexedDB supports).
export function exportAll(): Promise<{ nodes: RegisterNode[]; edges: RegisterEdge[] }> {
  return enqueueRegister(async () => {
    const db = await openRegisterDb();
    const nodes = await db.getAll('register_nodes');
    const edges = await db.getAll('register_edges');
    return { nodes, edges };
  });
}

// HAND-OFF IMPORT (RG-8, store/handoff.ts). Upsert (db.put): for a use case
// present in an incoming bundle, the bundle's node/edge state WINS. This is
// safe because the register is DERIVED presentation state (verdict summary,
// lifecycle stage) — the tamper-evident source of truth is the audit trail,
// whose prefix-safety handoff.ts has already established before this runs.
// If the reviewer advanced a lifecycle stage or recorded a verdict summary,
// their bundle carries the newer node, and adopting it is exactly right.
export function importRegister(
  nodes: readonly RegisterNode[],
  edges: readonly RegisterEdge[],
): Promise<void> {
  return enqueueRegister(async () => {
    const db = await openRegisterDb();
    const tx = db.transaction(['register_nodes', 'register_edges'], 'readwrite');
    for (const n of nodes) await tx.objectStore('register_nodes').put(n);
    for (const e of edges) await tx.objectStore('register_edges').put(e);
    await tx.done;
  });
}

// HAND-OFF REPLACE ONLY (store/handoff.ts replaceWithBundle; see
// audit.backupAndReplaceAllRawEvents for the matching audit-side primitive
// and the F16 rationale). Reads the current register (the backup a caller
// must hand the user before this destroys it), then clears and installs
// `nodes`/`edges`, in ONE transaction inside ONE queued turn — so a
// concurrent addNode/addEdge/updateLifecycleStage/etc. cannot land between
// "read what's about to be discarded" and "discard it".
export function backupAndReplaceRegister(
  nodes: readonly RegisterNode[],
  edges: readonly RegisterEdge[],
): Promise<{ nodes: RegisterNode[]; edges: RegisterEdge[] }> {
  return enqueueRegister(async () => {
    const db = await openRegisterDb();
    const tx = db.transaction(['register_nodes', 'register_edges'], 'readwrite');
    const discardedNodes = await tx.objectStore('register_nodes').getAll();
    const discardedEdges = await tx.objectStore('register_edges').getAll();
    await tx.objectStore('register_nodes').clear();
    await tx.objectStore('register_edges').clear();
    for (const n of nodes) await tx.objectStore('register_nodes').put(n);
    for (const e of edges) await tx.objectStore('register_edges').put(e);
    await tx.done;
    return { nodes: discardedNodes, edges: discardedEdges };
  });
}
