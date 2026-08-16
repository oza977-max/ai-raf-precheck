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

// R6-QN-1 (intake-flow.md §16.4). Questions for fields the extractor
// GUESSED — no verified basis quote. Pure, deterministic ordering: nodes in
// graph array order, fields in the caller-provided per-node order. Reuses
// the same per-field question text and canonical options as budget-driven
// questions, so a guessed-field question is indistinguishable in form.
export function questionsForGuessedFields(
  guessed: Record<string, string[]>,
  graph: DataFlowGraph,
): IntakeQuestion[] {
  const questions: IntakeQuestion[] = [];
  const nodeIds = [
    ...graph.input_nodes.map((n) => n.id),
    ...graph.processing_nodes.map((n) => n.id),
    ...graph.output_nodes.map((n) => n.id),
  ];
  for (const nodeId of nodeIds) {
    for (const field of guessed[nodeId] ?? []) {
      questions.push(questionForField(field, nodeId, ['R6-PV-2:guessed']));
    }
  }
  return questions;
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

// V1.2-B (design-gap C2): expose the budget the generator already
// computes internally, so the questionnaire UI can render
// "{answered}/{total} · budget ≤N (provisional {tier})".
// BC-V12B-04: additive — generateQuestions' signature is unchanged.
export function getQuestionBudget(
  graph: DataFlowGraph,
  policy: PolicyFile,
): { budget: number; provisionalTier: Tier } {
  const provisionalTier = assignTier(graph, [...policy.tiers].sort((a, b) => a.id.localeCompare(b.id))).tier;
  return { budget: budgetForTier(provisionalTier), provisionalTier };
}

export function generateQuestions(
  graph: DataFlowGraph,
  policy: PolicyFile,
  _activePacks: JurisdictionPack[],
): IntakeQuestion[] {
  // Review finding (V1.2-B, pass 1): consume the same helper the UI uses
  // for the displayed budget, so the enforced budget and the displayed
  // budget can never silently drift apart.
  const { budget } = getQuestionBudget(graph, policy);

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
