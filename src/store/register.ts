import { openRegisterDb } from './db';
import { append, getAll as getAuditEvents } from './audit';
import type { RegisterNode, RegisterEdge, UseCaseSummary, LifecycleStage, AuditEvent } from './types';
import { isVerdictProvisional } from '../engine/provisional';

// Rule 3 (cross-cutting.md §7): persistence-only, no evaluation logic, no LLM, no React.
// Repository pattern (Fowler) — this is the only module that reaches into
// aigate-register's IndexedDB stores directly.

export async function addNode(node: RegisterNode): Promise<void> {
  const db = await openRegisterDb();
  await db.add('register_nodes', node);
}

export async function addEdge(edge: RegisterEdge): Promise<void> {
  const db = await openRegisterDb();
  await db.add('register_edges', edge);
}

// Find the most recent verdict-bearing event (verdict_produced or
// verdict_corrected) in an audit trail. Events are returned by audit.getAll()
// in occurred_at order (monotonic tie-break — see audit.ts), so the last
// matching entry is the current verdict.
function findLatestVerdictEvent(
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
function toSummary(node: RegisterNode, auditEvents: AuditEvent[], currentPolicyVersion?: string): UseCaseSummary {
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

  return {
    use_case_id: node.node_id,
    label: node.label,
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
  };
}

export async function updateUseCaseVerdictSummary(
  useCaseId: string,
  summary: Partial<UseCaseSummary> & { currentVerdictId?: string }
): Promise<void> {
  const db = await openRegisterDb();
  const node = await db.get('register_nodes', useCaseId);
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

  await db.put('register_nodes', updatedNode);
}

// register-lifecycle.md §6: both writes (node update + audit append) happen in
// the same async call. They are not wrapped in a transaction — partial write
// risk is an acknowledged V1 limitation.
export async function updateLifecycleStage(
  useCaseId: string,
  stage: LifecycleStage,
  actor: string
): Promise<void> {
  const db = await openRegisterDb();
  const node = await db.get('register_nodes', useCaseId);
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

  await db.put('register_nodes', updatedNode);

  await append({
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
}

// ADR-009: role filter applied at the query layer, not in-memory. role 'all'
// returns every use_case node (2LoD view) via by_type; an actor ID filters via
// by_submitted_by.
// N+1 audit query per use case — acceptable at V1 scale (small register),
// documented as a known scaling limit in build/prompts/P6-C01.md, not
// silently ignored.
export async function getUseCases(role: 'all' | string, currentPolicyVersion?: string): Promise<UseCaseSummary[]> {
  const db = await openRegisterDb();

  const nodes =
    role === 'all'
      ? await db.getAllFromIndex('register_nodes', 'by_type', 'use_case')
      : await db.getAllFromIndex('register_nodes', 'by_submitted_by', role);

  const useCaseNodes = nodes.filter(
    (node): node is RegisterNode & { metadata: { node_type: 'use_case' } } => node.node_type === 'use_case'
  );

  return Promise.all(
    useCaseNodes.map(async (node) => {
      const auditEvents = await getAuditEvents(node.node_id);
      return toSummary(node, auditEvents, currentPolicyVersion);
    })
  );
}

export async function getUseCase(
  useCaseId: string,
  currentPolicyVersion?: string
): Promise<UseCaseSummary | undefined> {
  const db = await openRegisterDb();
  const node = await db.get('register_nodes', useCaseId);
  if (!node || node.metadata.node_type !== 'use_case') {
    return undefined;
  }
  const auditEvents = await getAuditEvents(useCaseId);
  return toSummary(node, auditEvents, currentPolicyVersion);
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

export async function exportAll(): Promise<{ nodes: RegisterNode[]; edges: RegisterEdge[] }> {
  const db = await openRegisterDb();
  const nodes = await db.getAll('register_nodes');
  const edges = await db.getAll('register_edges');
  return { nodes, edges };
}
