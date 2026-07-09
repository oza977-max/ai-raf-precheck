import { evaluate } from '../engine/evaluate';
import { routeToWorkflow } from '../engine/workflow-router';
import { addNode, addEdge, getUseCase } from '../store/register';
import { append } from '../store/audit';
import type { DataFlowGraph, PolicyFile } from '../engine/types';
import type { Verdict } from '../types/verdict';

// register-lifecycle.md §9 (LC-6). AIGate must appear in its own register
// with a real, self-produced verdict — not a fixture.
export const AIGATE_USE_CASE_ID = 'aigate-self-assessment';
const AIGATE_VENDOR_NODE_ID = 'aigate-vendor-anthropic';

// BC-P7C01-03: uses output_reversibility (the real OutputNode field —
// src/engine/types.ts line 86), not §9's incorrect `reversibility` example.
export const AIGATE_USE_CASE_GRAPH: DataFlowGraph = {
  id: AIGATE_USE_CASE_ID,
  version: 1,
  intake_method: 'structured_form',
  extracted_at: '2026-06-01T00:00:00Z',
  jurisdictions: ['UK'],
  input_nodes: [
    {
      id: 'in-1',
      label: 'User-described AI use case (text)',
      data_class: 'Internal',
      data_zone: 'Zone B',
    },
  ],
  processing_nodes: [
    {
      id: 'proc-1',
      label: 'AIGate evaluation engine + LLM graph extraction (Anthropic Claude)',
      model_type: 'llm',
      autonomy_level: 1,
      data_zone: 'Zone B',
      vendor: 'Anthropic',
      replaces_prior_model: false,
    },
  ],
  output_nodes: [
    {
      id: 'out-1',
      label: 'Structured governance verdict (approved / approved_with_controls / rejected)',
      action_type: 'recommend',
      exposure: 'internal-only',
      decision_bindingness: 'material',
      output_reversibility: 'reversible',
      scale: 'limited',
    },
  ],
  edges: [
    { from: 'in-1', to: 'proc-1' },
    { from: 'proc-1', to: 'out-1' },
  ],
};

// BC-P7C01-02: idempotent — a no-op if AIGate's own node already exists,
// regardless of what else is in the register or how many times this is
// called (drift fix #2, build/prompts/P7-C01.md).
//
// The read-then-write existence check below is not safe against two
// concurrent callers on its own (React StrictMode double-invokes mount
// effects in dev, and App.tsx's useEffect calls this function — both
// invocations can pass the getUseCase() check before either has written
// anything, producing duplicate audit events). This in-flight promise
// cache collapses concurrent calls onto a single execution (review
// finding, pass 1).
let inFlight: Promise<void> | null = null;

export function seedAigateSelfAssessment(policy: PolicyFile): Promise<void> {
  if (!inFlight) {
    inFlight = runSeed(policy).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function runSeed(policy: PolicyFile): Promise<void> {
  const existing = await getUseCase(AIGATE_USE_CASE_ID);
  if (existing) return;

  const evalResult = evaluate(AIGATE_USE_CASE_GRAPH, policy);
  if (!evalResult.ok) {
    throw new Error(`AIGate self-assessment failed: ${evalResult.error.kind}`);
  }
  const result = evalResult.value;

  const now = new Date().toISOString();
  const verdict: Verdict = {
    ...result,
    id: crypto.randomUUID(),
    use_case_id: AIGATE_USE_CASE_ID,
    living_status: 'approved',
    living_status_updated_at: now,
    attested_by: 'system',
    attested_at: now,
    graph_version: AIGATE_USE_CASE_GRAPH.version,
    corrections: [],
  };

  // Matches IntakeFlow.tsx's real fresh-path pattern (drift fix #4) —
  // graph_confirmed then verdict_produced, not the unused
  // `use_case_created` AuditEventType variant.
  await append({
    event_id: crypto.randomUUID(),
    use_case_id: AIGATE_USE_CASE_ID,
    event_type: 'graph_confirmed',
    occurred_at: now,
    actor: 'system',
    payload: {
      type: 'graph_confirmed',
      graph_id: AIGATE_USE_CASE_GRAPH.id,
      graph_version: AIGATE_USE_CASE_GRAPH.version,
      corrections_count: 0,
    },
  });
  await append({
    event_id: crypto.randomUUID(),
    use_case_id: AIGATE_USE_CASE_ID,
    event_type: 'verdict_produced',
    occurred_at: now,
    actor: 'system',
    payload: { type: 'verdict_produced', verdict },
  });

  // BC-P7C01-01: routed through the exact same function as any other use
  // case — §9's explicit "no auto-approve" is satisfied by NOT
  // special-casing this call, not by a bypass.
  const routedWorkflow = routeToWorkflow(result.tier, policy);

  await addNode({
    node_id: AIGATE_USE_CASE_ID,
    node_type: 'use_case',
    label: 'AIGate (self-assessment)',
    created_at: now,
    metadata: {
      node_type: 'use_case',
      submitted_by: 'system',
      lifecycle_stage: routedWorkflow.lifecycle_stage,
      current_verdict_id: verdict.id,
      tier: result.tier,
      track: result.track,
    },
  });

  // Drift fix #3: 'pending', not 'approved' — no real vendor-approval
  // workflow exists in this codebase.
  await addNode({
    node_id: AIGATE_VENDOR_NODE_ID,
    node_type: 'vendor',
    label: 'Anthropic',
    created_at: now,
    metadata: {
      node_type: 'vendor',
      vendor_name: 'Anthropic',
      approval_status: 'pending',
    },
  });

  await addEdge({
    edge_id: crypto.randomUUID(),
    from_node_id: AIGATE_USE_CASE_ID,
    to_node_id: AIGATE_VENDOR_NODE_ID,
    edge_type: 'provided_by_vendor',
    created_at: now,
  });
}
