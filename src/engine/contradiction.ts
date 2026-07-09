import type { Contradiction, DataFlowGraph, QuestionAnswer } from './types';

// UC-5 (intake-flow.md §7). Pure — no I/O, no LLM (§2 ASR: "LLM at input
// edge only"). Scoped down (judgment call, build/prompts/P4-C03.md #3):
// detectContradictions()'s spec signature doesn't give access to which
// graph field each QuestionAnswer targeted (only questionId), so true
// answer-vs-answer field contradiction isn't derivable from this
// signature. Implements description-vs-graph contradiction only, matching
// intake-flow.md §5's own Pattern 1 example — a fixed table of known
// signal pairs, not a general NLP solution.

interface SignalPair {
  descriptionPattern: RegExp;
  field: string;
  graphContradicts: (graph: DataFlowGraph) => boolean;
  statement1: string;
  statement2Template: string;
}

const SIGNAL_PAIRS: SignalPair[] = [
  {
    descriptionPattern: /no (client|personal) data|does not (touch|use|process) (client|personal) data/i,
    field: 'data_class',
    graphContradicts: (graph) =>
      graph.input_nodes.some((n) => n.data_class === 'Client PII' || n.data_class === 'MNPI'),
    statement1: 'Description states no client/personal data is involved.',
    statement2Template: 'Extracted graph shows a data node classified as Client PII or MNPI.',
  },
  {
    descriptionPattern: /no autonomy|fully manual|human (approves|reviews) every|always requires human/i,
    field: 'autonomy_level',
    graphContradicts: (graph) => graph.processing_nodes.some((n) => n.autonomy_level >= 3),
    statement1: 'Description states the system requires human approval for every action (no autonomy).',
    statement2Template: 'Extracted graph shows a processing node with autonomy level 3 or higher.',
  },
];

export function detectContradictions(
  description: string,
  _answers: QuestionAnswer[],
  graph: DataFlowGraph,
): Contradiction[] {
  const contradictions: Contradiction[] = [];
  for (const pair of SIGNAL_PAIRS) {
    if (pair.descriptionPattern.test(description) && pair.graphContradicts(graph)) {
      contradictions.push({
        statement1: pair.statement1,
        statement2: pair.statement2Template,
        field: pair.field,
      });
    }
  }
  return contradictions;
}
