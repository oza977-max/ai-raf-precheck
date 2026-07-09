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
    }
  | {
      step: 'contradiction_review';
      graph: DataFlowGraph;
      questions: IntakeQuestion[];
      answers: QuestionAnswer[];
      contradictions: Contradiction[];
      resolutionNotes: string[];
    }
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
  | { type: 'NO_DUPLICATE_FOUND'; method: 'llm' | 'form' }
  | { type: 'GRAPH_EXTRACTED'; graph: DataFlowGraph }
  // P4-C01/P4-C04 boundary (build/prompts/P4-C01.md, P4-C03.md): the
  // `confirmation` state exists in the type union (locked for P4-C04) but
  // has no UI yet. This action is the documented direct pass-through from
  // questionnaire (once unanswered questions are exhausted and no
  // contradiction remains) to evaluation_pending.
  | { type: 'PROCEED_TO_EVALUATION_PASSTHROUGH' }
  | { type: 'CORRECTION_APPLIED'; correction: GraphCorrection; updatedGraph: DataFlowGraph }
  | { type: 'QUESTIONS_GENERATED'; questions: IntakeQuestion[] }
  | { type: 'ANSWER_SUBMITTED'; answer: QuestionAnswer }
  | { type: 'CONTRADICTIONS_DETECTED'; contradictions: Contradiction[] }
  | { type: 'CONTRADICTION_RESOLVED'; explanation: string }
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
      return { step: 'questionnaire', graph: state.graph, questions: action.questions, answers: [], resolutionNotes: [] };

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
      };

    case 'CONTRADICTION_RESOLVED':
      // BC-P4C03-03 defense in depth (P4-C03 review finding): reject an
      // empty/whitespace-only explanation at the reducer layer too, not
      // just the UI's disabled-button check — a future caller dispatching
      // this action directly (bug, refactor, test helper) must not be able
      // to silently bypass resolution. The explanation is kept, not
      // discarded, so it survives for whichever future chunk audits it.
      if (state.step !== 'contradiction_review' || !action.explanation.trim()) return state;
      return {
        step: 'questionnaire',
        graph: state.graph,
        questions: state.questions,
        answers: state.answers,
        resolutionNotes: [...state.resolutionNotes, action.explanation.trim()],
      };

    case 'PROCEED_TO_EVALUATION_PASSTHROUGH':
      if (state.step === 'questionnaire') return { step: 'evaluation_pending', graph: state.graph };
      return state;

    case 'VERDICT_READY':
      if (state.step !== 'evaluation_pending') return state;
      return { step: 'verdict', verdictId: action.verdictId };

    default:
      return state;
  }
}
