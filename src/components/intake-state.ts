// Intake flow state machine (intake-flow.md §3). Kept separate from
// IntakeFlow.tsx so the reducer is independently unit-testable without
// React Testing Library (Dan Vanderkam: typed discriminated unions).
import type { Contradiction, DataFlowGraph, GraphCorrection, IntakeQuestion, QuestionAnswer } from '../engine/types';

export type { Contradiction, IntakeQuestion, QuestionAnswer };

export type IntakeState =
  | { step: 'description_entry'; description: string }
  | { step: 'duplicate_check'; description: string }
  | { step: 'graph_extraction'; description: string; method: 'llm' | 'form' }
  | { step: 'graph_review'; graph: DataFlowGraph; graphVersion: number; corrections: GraphCorrection[] }
  | {
      step: 'questionnaire';
      graph: DataFlowGraph;
      questions: IntakeQuestion[];
      answers: QuestionAnswer[];
      resolutionNotes: string[];
      corrections: GraphCorrection[];
      useCaseId: string;
    }
  | {
      step: 'contradiction_review';
      graph: DataFlowGraph;
      questions: IntakeQuestion[];
      answers: QuestionAnswer[];
      contradictions: Contradiction[];
      resolutionNotes: string[];
      corrections: GraphCorrection[];
      useCaseId: string;
    }
  | {
      step: 'confirmation';
      graph: DataFlowGraph;
      graphVersion: number;
      corrections: GraphCorrection[];
      answers: QuestionAnswer[];
      useCaseId: string;
    }
  | { step: 'evaluation_pending'; graph: DataFlowGraph; useCaseId: string }
  | { step: 'verdict'; verdictId: string };

export type IntakeAction =
  | { type: 'DESCRIPTION_CHANGED'; description: string }
  | { type: 'SUBMIT_DESCRIPTION' }
  | { type: 'NO_DUPLICATE_FOUND'; method: 'llm' | 'form' }
  | { type: 'GRAPH_EXTRACTED'; graph: DataFlowGraph }
  | { type: 'CORRECTION_APPLIED'; correction: GraphCorrection; updatedGraph: DataFlowGraph }
  // useCaseId generated once by the caller at questionnaire entry
  // (P4-C04) and threaded through every subsequent state — never
  // regenerated (BC-P4C04-03).
  | { type: 'QUESTIONS_GENERATED'; questions: IntakeQuestion[]; useCaseId: string }
  | { type: 'ANSWER_SUBMITTED'; answer: QuestionAnswer }
  | { type: 'CONTRADICTIONS_DETECTED'; contradictions: Contradiction[] }
  | { type: 'CONTRADICTION_RESOLVED'; explanation: string }
  // UC-6 (intake-flow.md §9): always an explicit human action, even with
  // zero questions — replaces P4-C01's PROCEED_TO_EVALUATION_PASSTHROUGH,
  // which is fully removed as of P4-C04 (BC-P4C04-01).
  | { type: 'PROCEED_TO_CONFIRMATION' }
  | { type: 'CONFIRMED' }
  | { type: 'VERDICT_READY' };

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
      return { step: 'graph_extraction', description: state.description, method: action.method };

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

    case 'QUESTIONS_GENERATED':
      if (state.step !== 'graph_review') return state;
      return {
        step: 'questionnaire',
        graph: state.graph,
        questions: action.questions,
        answers: [],
        resolutionNotes: [],
        corrections: state.corrections,
        useCaseId: action.useCaseId,
      };

    case 'ANSWER_SUBMITTED':
      if (state.step !== 'questionnaire') return state;
      return { ...state, answers: [...state.answers, action.answer] };

    case 'CONTRADICTIONS_DETECTED':
      if (state.step !== 'questionnaire') return state;
      return {
        step: 'contradiction_review',
        graph: state.graph,
        questions: state.questions,
        answers: state.answers,
        contradictions: action.contradictions,
        resolutionNotes: state.resolutionNotes,
        corrections: state.corrections,
        useCaseId: state.useCaseId,
      };

    case 'CONTRADICTION_RESOLVED':
      // BC-P4C03-03 defense in depth: reject an empty/whitespace-only
      // explanation at the reducer layer too, not just the UI's
      // disabled-button check.
      if (state.step !== 'contradiction_review' || !action.explanation.trim()) return state;
      return {
        step: 'questionnaire',
        graph: state.graph,
        questions: state.questions,
        answers: state.answers,
        resolutionNotes: [...state.resolutionNotes, action.explanation.trim()],
        corrections: state.corrections,
        useCaseId: state.useCaseId,
      };

    case 'PROCEED_TO_CONFIRMATION':
      if (state.step !== 'questionnaire') return state;
      return {
        step: 'confirmation',
        graph: state.graph,
        graphVersion: state.graph.version,
        corrections: state.corrections,
        answers: state.answers,
        useCaseId: state.useCaseId,
      };

    case 'CONFIRMED':
      if (state.step !== 'confirmation') return state;
      return { step: 'evaluation_pending', graph: state.graph, useCaseId: state.useCaseId };

    case 'VERDICT_READY':
      if (state.step !== 'evaluation_pending') return state;
      return { step: 'verdict', verdictId: state.useCaseId };

    default:
      return state;
  }
}
