import { evaluate } from '../engine/evaluate';
import { routeToWorkflow } from '../engine/workflow-router';
import { addNode, addEdge, addUseCaseModelLink, getUseCase } from '../store/register';
import { append } from '../store/audit';
import { localLlmEnabled, DEFAULT_LOCAL_LLM_MODEL } from '../llm/local-provider';
import type { DataFlowGraph, JurisdictionPack, PolicyFile } from '../engine/types';
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
      // R11-MG-3 / ADR-RL-R11-2 (register-lifecycle.md §16): "the gate gates
      // its gatekeeper" — the self-assessment declares its own runtime model
      // through the same declared_model_id mechanism any other use case
      // would use, no special-cased write path.
      declared_model_id: localLlmEnabled() ? DEFAULT_LOCAL_LLM_MODEL : 'none declared',
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

// O-002 (charter 005). The duplicate check reads the register while this
// seeding is still in flight, and can report "checked 0 register entries"
// moments before the AIGate self-assessment appears — stating a count the
// product has not established, which is an NF-2 honesty problem rather than a
// timing nit.
//
// The race is structural: React runs a CHILD's effect before its parent's, so
// IntakeFlow's register read always beat App's seeding effect. `settled`
// records the last completed run so a consumer that arrives after the fact is
// not left waiting on a promise that no longer exists.
let settled = false;

/** Resolves once the self-assessment seeding has finished — immediately if it
 *  already has, or was never started. A consumer awaiting this is saying "do
 *  not tell the user what is in the register until the register is done being
 *  written to". */
export function selfAssessmentSeeded(): Promise<void> {
  if (inFlight) return inFlight;
  return Promise.resolve();
}

/** True once a seeding run has completed in this session. Exposed so a
 *  consumer can tell "nothing to wait for, it is done" from "nothing to wait
 *  for, it has not started" — those are different, and only the first makes a
 *  register count trustworthy. */
export function selfAssessmentSettled(): boolean {
  return settled;
}

export function seedAigateSelfAssessment(policy: PolicyFile, packs: JurisdictionPack[] = []): Promise<void> {
  if (!inFlight) {
    inFlight = runSeed(policy, packs).finally(() => {
      inFlight = null;
      settled = true;
    });
  }
  return inFlight;
}

async function runSeed(policy: PolicyFile, packs: JurisdictionPack[]): Promise<void> {
  const existing = await getUseCase(AIGATE_USE_CASE_ID);
  if (existing) return;

  // P8-C04, review pass 2. This evaluated with NO packs while the graph
  // declares jurisdictions: ['UK'] — so AIGate's own self-assessment was
  // scored without the UK pack it says applies to it. Harmless-looking until
  // this chunk made the consequence visible: the row would read Provisional
  // for "no regulatory basis", which is a false statement about a use case
  // that named its jurisdiction. Pre-existing gap from P7-C01.
  const evalResult = evaluate(AIGATE_USE_CASE_GRAPH, policy, packs);
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

  // R11-MG-3 / ADR-RL-R11-2: same addUseCaseModelLink() path any other use
  // case's confirmation uses — no special-cased write.
  const declaredModelNode = AIGATE_USE_CASE_GRAPH.processing_nodes.find((n) => n.declared_model_id);
  if (declaredModelNode) {
    await addUseCaseModelLink(AIGATE_USE_CASE_ID, declaredModelNode, policy);
  }
}
