// Intake flow state machine (intake-flow.md §3). Kept separate from
// IntakeFlow.tsx so the reducer is independently unit-testable without
// React Testing Library (Dan Vanderkam: typed discriminated unions).
import type { DataFlowGraph, GraphCorrection } from '../engine/types';

export interface Contradiction {
  statement1: string;
  statement2: string;
  field: string;
}

export interface IntakeQuestion {
  id: string;
  text: string;
  field: string;
  node_id?: string;
  triggered_by: string[];
  answer_type: 'boolean' | 'select' | 'text';
  options?: string[];
}

export interface QuestionAnswer {
  questionId: string;
  value: unknown;
}

export type IntakeState =
  | { step: 'description_entry'; description: string }
  | { step: 'duplicate_check'; description: string }
  | { step: 'graph_extraction'; description: string; method: 'llm' | 'form' }
  | { step: 'graph_review'; graph: DataFlowGraph; graphVersion: number; corrections: GraphCorrection[] }
  | { step: 'questionnaire'; graph: DataFlowGraph; questions: IntakeQuestion[]; answers: QuestionAnswer[] }
  | { step: 'contradiction_review'; graph: DataFlowGraph; contradictions: Contradiction[] }
  | {
      step: 'confirmation';
      graph: DataFlowGraph;
      graphVersion: number;
      corrections: GraphCorrection[];
      answers: QuestionAnswer[];
    }
  | { step: 'evaluation_pending'; graph: DataFlowGraph }
  | { step: 'verdict'; verdictId: string };

export type IntakeAction =
  | { type: 'DESCRIPTION_CHANGED'; description: string }
  | { type: 'SUBMIT_DESCRIPTION' }
  | { type: 'NO_DUPLICATE_FOUND' }
  | { type: 'GRAPH_EXTRACTED'; graph: DataFlowGraph }
  // P4-C01/P4-C04 boundary (see build/prompts/P4-C01.md): questionnaire,
  // contradiction_review, and confirmation aren't built yet (P4-C03/P4-C04).
  // This action is the documented direct pass-through from graph_review to
  // evaluation_pending, skipping the not-yet-built middle states.
  | { type: 'PROCEED_TO_EVALUATION_PASSTHROUGH' }
  | { type: 'CORRECTION_APPLIED'; correction: GraphCorrection; updatedGraph: DataFlowGraph }
  | { type: 'VERDICT_READY'; verdictId: string };

export function intakeReducer(state: IntakeState, action: IntakeAction): IntakeState {
  switch (action.type) {
    case 'DESCRIPTION_CHANGED':
      if (state.step !== 'description_entry') return state;
      return { step: 'description_entry', description: action.description };

    case 'SUBMIT_DESCRIPTION':
      if (state.step !== 'description_entry') return state;
      return { step: 'duplicate_check', description: state.description };

    case 'NO_DUPLICATE_FOUND':
      if (state.step !== 'duplicate_check') return state;
      return { step: 'graph_extraction', description: state.description, method: 'llm' };

    case 'GRAPH_EXTRACTED':
      if (state.step !== 'graph_extraction') return state;
      return { step: 'graph_review', graph: action.graph, graphVersion: action.graph.version, corrections: [] };

    case 'CORRECTION_APPLIED':
      if (state.step !== 'graph_review') return state;
      return {
        step: 'graph_review',
        graph: action.updatedGraph,
        graphVersion: action.updatedGraph.version,
        corrections: [...state.corrections, action.correction],
      };

    case 'PROCEED_TO_EVALUATION_PASSTHROUGH':
      if (state.step !== 'graph_review') return state;
      return { step: 'evaluation_pending', graph: state.graph };

    case 'VERDICT_READY':
      if (state.step !== 'evaluation_pending') return state;
      return { step: 'verdict', verdictId: action.verdictId };

    default:
      return state;
  }
}
