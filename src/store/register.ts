import { openRegisterDb } from './db';
import { append } from './audit';
import type { RegisterNode, RegisterEdge, UseCaseSummary, LifecycleStage } from './types';

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

// UseCaseSummary is a derived/computed read view — never separately stored,
// to avoid dual-write inconsistency (Fowler). Computed here from a use_case
// RegisterNode's metadata.
function toSummary(node: RegisterNode): UseCaseSummary {
  if (node.metadata.node_type !== 'use_case') {
    throw new Error(`toSummary() called on non-use_case node: ${node.node_id}`);
  }
  const metadata = node.metadata;
  return {
    use_case_id: node.node_id,
    label: node.label,
    submitted_by: metadata.submitted_by,
    submitted_at: node.created_at,
    lifecycle_stage: metadata.lifecycle_stage,
    tier: metadata.tier,
    track: metadata.track,
    // Verdict-derived fields land with the real engine wiring (P3-C01/P4-C04) —
    // this chunk has no verdict source to compute them from yet.
    current_verdict_status: null,
    last_evaluated_at: null,
    policy_version_at_evaluation: null,
    stale_assessment: false,
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
export async function getUseCases(role: 'all' | string): Promise<UseCaseSummary[]> {
  const db = await openRegisterDb();

  const nodes =
    role === 'all'
      ? await db.getAllFromIndex('register_nodes', 'by_type', 'use_case')
      : await db.getAllFromIndex('register_nodes', 'by_submitted_by', role);

  return nodes
    .filter((node): node is RegisterNode & { metadata: { node_type: 'use_case' } } => node.node_type === 'use_case')
    .map(toSummary);
}

export async function getUseCase(useCaseId: string): Promise<UseCaseSummary | undefined> {
  const db = await openRegisterDb();
  const node = await db.get('register_nodes', useCaseId);
  if (!node || node.metadata.node_type !== 'use_case') {
    return undefined;
  }
  return toSummary(node);
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
