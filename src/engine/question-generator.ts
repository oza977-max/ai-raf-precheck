import { CANONICAL_VOCABULARY } from './canonical-vocabulary';
import type {
  DataFlowGraph,
  HardLine,
  IntakeQuestion,
  Invariant,
  JurisdictionPack,
  PolicyFile,
  Tier,
} from './types';
import { assignTier } from './tier';

// UC-4 (intake-flow.md §6). Pure — no I/O, no LLM, same src/engine/* rule.
//
// "Worst-case" provisional tier (judgment call, build/prompts/P4-C03.md #1):
// extractGraph() already instructs the LLM to fill uncertain fields with a
// concrete best-guess value, not leave them empty — so the provisional tier
// pass below uses the graph's already-extracted values directly, rather
// than building a separate per-field worst-case substitution engine.
function budgetForTier(tier: Tier): number {
  if (tier === 'Low') return 5;
  if (tier === 'Medium') return 10;
  return 15; // High or Critical
}

const QUESTION_TEXT: Record<string, string> = {
  autonomy_level: 'What level of human oversight does this AI system have?',
  data_class: 'What is the most sensitive class of data this system touches?',
  data_zone: 'Which data zone does this processing occur in?',
  exposure: 'Who is exposed to this system’s output?',
  decision_type: 'What kind of decision does this system inform or make?',
  hitl: 'Is there a human in the loop before this system acts?',
  output_reversibility: 'Can the action this system takes be reversed?',
  model_type: 'What type of AI/ML model is this?',
  action_type: 'What does this system’s output do?',
  decision_bindingness: 'How binding is the decision this system produces?',
  scale: 'Does this system operate at limited or full scale?',
  replaces_prior_model: 'Does this system replace an existing model or process?',
};

function questionForField(
  field: string,
  nodeId: string | undefined,
  triggeredBy: string[],
): IntakeQuestion {
  const canonicalOptions = CANONICAL_VOCABULARY[field];
  return {
    id: `Q-${field}-${nodeId ?? 'graph'}`,
    text: QUESTION_TEXT[field] ?? `Please confirm the value for "${field}".`,
    field,
    node_id: nodeId,
    triggered_by: [...triggeredBy],
    answer_type: canonicalOptions ? 'select' : field === 'hitl' || field === 'replaces_prior_model' ? 'boolean' : 'text',
    options: canonicalOptions ? [...canonicalOptions] : undefined,
  };
}

function findUncertainNode(graph: DataFlowGraph, field: string): { id: string } | undefined {
  // Only ProcessingNode carries `uncertain` today (intake-flow.md §4.2) —
  // InputNode/OutputNode have no per-node confidence flag yet.
  for (const node of graph.processing_nodes) {
    if (node.uncertain && field in node) return { id: node.id };
  }
  return undefined;
}

function candidatesFromRules<T extends { id: string; condition: Record<string, unknown> }>(
  rules: T[],
  graph: DataFlowGraph,
): IntakeQuestion[] {
  const candidates: IntakeQuestion[] = [];
  for (const rule of rules) {
    for (const field of Object.keys(rule.condition)) {
      const uncertainNode = findUncertainNode(graph, field);
      if (uncertainNode) {
        candidates.push(questionForField(field, uncertainNode.id, [rule.id]));
      }
    }
  }
  return candidates;
}

function dedupeAndMerge(candidates: IntakeQuestion[]): IntakeQuestion[] {
  const byKey = new Map<string, IntakeQuestion>();
  for (const q of candidates) {
    const key = `${q.field}::${q.node_id ?? ''}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.triggered_by = [...new Set([...existing.triggered_by, ...q.triggered_by])];
    } else {
      byKey.set(key, { ...q });
    }
  }
  return [...byKey.values()];
}

export function generateQuestions(
  graph: DataFlowGraph,
  policy: PolicyFile,
  _activePacks: JurisdictionPack[],
): IntakeQuestion[] {
  const provisionalTier = assignTier(graph, [...policy.tiers].sort((a, b) => a.id.localeCompare(b.id))).tier;
  const budget = budgetForTier(provisionalTier);

  const sortedInvariants = [...policy.invariants].sort((a, b) => a.id.localeCompare(b.id)) as Invariant[];
  const sortedHardLines = [...policy.hard_lines].sort((a, b) => a.id.localeCompare(b.id)) as HardLine[];

  const candidates = [
    ...candidatesFromRules(sortedInvariants, graph),
    ...candidatesFromRules(sortedHardLines, graph),
  ];

  const deduped = dedupeAndMerge(candidates);

  // Prioritize by how many invariants/hard-lines a question would resolve
  // — trim to budget by removing lowest-priority candidates, not by
  // generating fewer candidates up front (BC-P4C03-02).
  deduped.sort((a, b) => b.triggered_by.length - a.triggered_by.length || a.id.localeCompare(b.id));

  return deduped.slice(0, budget);
}
