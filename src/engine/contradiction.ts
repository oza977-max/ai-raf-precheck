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

// R16-E §6 (D-105, DR7-30/F1B-3). Plain words, no quotation marks, and no
// claim to quote the person — `statement1` and `statement2` are both read
// as independent sentences, not as "you said X but also Y". Previously
// these named the engine's own vocabulary verbatim ("Client PII or MNPI",
// "autonomy level 3 or higher", "Extracted graph").
const SIGNAL_PAIRS: SignalPair[] = [
  {
    descriptionPattern: /no (client|personal) data|does not (touch|use|process) (client|personal) data/i,
    field: 'data_class',
    graphContradicts: (graph) =>
      graph.input_nodes.some((n) => n.data_class === 'Client PII' || n.data_class === 'MNPI'),
    statement1: 'Your description says no personal information is involved.',
    statement2Template: 'but your answers say it uses information about people.',
  },
  {
    descriptionPattern: /no autonomy|fully manual|human (approves|reviews) every|always requires human/i,
    field: 'autonomy_level',
    graphContradicts: (graph) => graph.processing_nodes.some((n) => n.autonomy_level >= 3),
    statement1: 'Your description says a person approves everything it does.',
    statement2Template: 'but your answers say it acts by itself.',
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
