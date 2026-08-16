// Intake flow state machine (intake-flow.md §3). Kept separate from
// IntakeFlow.tsx so the reducer is independently unit-testable without
// React Testing Library (Dan Vanderkam: typed discriminated unions).
import type { Contradiction, DataFlowGraph, GraphCorrection, IntakeQuestion, QuestionAnswer } from '../engine/types';

export type { Contradiction, IntakeQuestion, QuestionAnswer };

export type IntakeState =
  | { step: 'description_entry'; description: string }
  | { step: 'duplicate_check'; description: string }
  | { step: 'graph_extraction'; description: string; method: 'llm' | 'form' }
  | {
      step: 'graph_review';
      // Round 4 (charter 004 D-001, charter 005 O-001). The description was
      // dropped from graph_review onward, which cost two things: the submitter
      // never saw their own words again after typing them, and
      // detectContradictions ran against a separate useState that a restored
      // draft never repopulated — so a resumed session checked answers against
      // an empty string and quietly found nothing. Carrying it on the state
      // fixes both, because the draft envelope persists the state.
      description: string;
      graph: DataFlowGraph;
      graphVersion: number;
      corrections: GraphCorrection[];
      useCaseId: string;
      // Present only on a correction pass (P5-C01, verdict-audit.md §6) —
      // undefined on a fresh submission.
      originalVerdictId?: string;
      // R5-GR-2 (ADR-IF-R5-1). Node ids the human has not yet confirmed or
      // corrected. Populated ONLY when the graph came from the LLM path —
      // form-path values were typed by a human, and a correction pass or
      // evaluation-failure re-entry attests nothing new. Ephemeral review
      // state: never written to the audit trail; the graph_confirmed
      // attestation stays the recorded act.
      unconfirmedNodeIds?: string[];
      // R5-GX-1 (ADR-IF-R5-2). Jurisdiction strings the extractor returned
      // that the loaded policy does not recognise — removed from the graph
      // before the human sees it, surfaced so the removal is visible.
      ignoredJurisdictions?: string[];
    }
  | {
      step: 'questionnaire';
      description: string;
      graph: DataFlowGraph;
      questions: IntakeQuestion[];
      answers: QuestionAnswer[];
      resolutionNotes: string[];
      corrections: GraphCorrection[];
      useCaseId: string;
      originalVerdictId?: string;
    }
  | {
      step: 'contradiction_review';
      description: string;
      graph: DataFlowGraph;
      questions: IntakeQuestion[];
      answers: QuestionAnswer[];
      contradictions: Contradiction[];
      resolutionNotes: string[];
      corrections: GraphCorrection[];
      useCaseId: string;
      originalVerdictId?: string;
    }
  | {
      step: 'confirmation';
      description: string;
      graph: DataFlowGraph;
      graphVersion: number;
      corrections: GraphCorrection[];
      answers: QuestionAnswer[];
      // UC-5 (2026-08-15): carried so the attestation can persist them.
      // This shape used to drop the notes, so the explanations a submitter
      // was REQUIRED to type before proceeding evaporated before the write.
      resolutionNotes: string[];
      useCaseId: string;
      originalVerdictId?: string;
    }
  | { step: 'evaluation_pending'; graph: DataFlowGraph; useCaseId: string; originalVerdictId?: string }
  | { step: 'verdict'; verdictId: string };

export type IntakeAction =
  | { type: 'DESCRIPTION_CHANGED'; description: string }
  // explore-005 D-002: the only action valid from EVERY step. The resumed-
  // draft banner's "Start over instead" previously dispatched
  // DESCRIPTION_CHANGED, which the guard below discards from any step but
  // description_entry — so the escape hatch hid itself and changed nothing.
  | { type: 'RESTART' }
  // FN-006: one step backwards. Bounded at the confirmation attestation —
  // see the reducer case for why it stops there rather than everywhere.
  | { type: 'STEP_BACK' }
  | { type: 'SUBMIT_DESCRIPTION' }
  | { type: 'NO_DUPLICATE_FOUND'; method: 'llm' | 'form' }
  // useCaseId generated once by the caller at graph extraction (P5-C01 —
  // moved earlier than P4-C04's questionnaire-entry generation so a
  // correction pass, which re-enters at graph_review, can reuse it
  // instead of generating a new one; BC-P5C01-01).
  | { type: 'GRAPH_EXTRACTED'; graph: DataFlowGraph; useCaseId: string; ignoredJurisdictions?: string[] }
  | { type: 'CORRECTION_APPLIED'; correction: GraphCorrection; updatedGraph: DataFlowGraph }
  // R5-GR-2: the human states a model-proposed node is right as shown.
  | { type: 'NODE_CONFIRMED'; nodeId: string }
  | { type: 'QUESTIONS_GENERATED'; questions: IntakeQuestion[] }
  | { type: 'ANSWER_SUBMITTED'; answer: QuestionAnswer }
  | { type: 'CONTRADICTIONS_DETECTED'; contradictions: Contradiction[] }
  | { type: 'CONTRADICTION_RESOLVED'; explanation: string }
  // UC-6 (intake-flow.md §9): always an explicit human action, even with
  // zero questions.
  | { type: 'PROCEED_TO_CONFIRMATION' }
  | { type: 'CONFIRMED' }
  // A legitimate engine/policy failure (e.g. no-track-match) during
  // evaluation must not leave the UI stuck on "Evaluating..." forever —
  // returns to confirmation so the submitter sees the error and can
  // retry or go back. (Fix for the pre-existing gap flagged in P5-C01's
  // handover.)
  | { type: 'EVALUATION_FAILED' }
  | { type: 'VERDICT_READY' }
  // VD-3 (verdict-audit.md §6): re-enters graph_review reusing the
  // ORIGINAL useCaseId, carrying the id of the verdict being corrected.
  | { type: 'CORRECT_VERDICT'; graph: DataFlowGraph; useCaseId: string; originalVerdictId: string };

/** The submitted description, carried forward wherever the current step still
 *  has it. `evaluation_pending` and `verdict` do not, so a correction pass
 *  re-enters graph_review without it — pre-existing, out of scope for the
 *  D-001/O-001 fix, and recorded here rather than hidden behind a cast. */
function carriedDescription(state: IntakeState): string {
  return 'description' in state && typeof state.description === 'string' ? state.description : '';
}

export function intakeReducer(state: IntakeState, action: IntakeAction): IntakeState {
  switch (action.type) {
    case 'DESCRIPTION_CHANGED':
      if (state.step !== 'description_entry') return state;
      return { step: 'description_entry', description: action.description };

    case 'RESTART':
      // Deliberately unguarded — see the action comment. Abandoning an
      // in-flight intake is a UI reset only; nothing here touches the
      // append-only audit trail, which is never written from the reducer.
      return { step: 'description_entry', description: '' };

    // FN-006. Forward-only intake meant a typo in the description cost the
    // whole session: the only escape was RESTART, which blanks everything.
    //
    // Where it STOPS is the design, not an omission:
    //  - `confirmation` is an attestation (UC-6). Stepping back across it
    //    would let a submitter un-attest something they have already signed,
    //    so the boundary holds there.
    //  - `evaluation_pending` and `verdict` are past that boundary. A verdict
    //    is corrected through CORRECT_VERDICT (VD-3), which is an audited
    //    path — not by walking backwards out of it.
    //  - `contradiction_review` already has its own exit
    //    (CONTRADICTION_RESOLVED) and is left alone.
    //
    // Answers are preserved wherever the target step's shape can hold them.
    // Going back from the questionnaire to graph_review drops the answers
    // because graph_review carries none — and that is the right behaviour
    // rather than a limitation: if the graph changes, the questions are
    // regenerated from it, so keeping answers to superseded questions would
    // be worse than asking again.
    case 'STEP_BACK':
      switch (state.step) {
        case 'duplicate_check':
          return { step: 'description_entry', description: state.description };
        case 'graph_review':
          // A CORRECTION pass re-enters here as its first step (VD-3) with no
          // description — "back" would land in a duplicate check for an empty
          // string, and proceeding from there drops originalVerdictId,
          // silently turning a correction of a recorded verdict into a fresh
          // blank draft. Found live (2026-08-15). A correction's only exits
          // are completing it or RESTART.
          if (state.originalVerdictId) return state;
          return { step: 'duplicate_check', description: carriedDescription(state) };
        case 'questionnaire':
          return {
            step: 'graph_review',
            description: carriedDescription(state),
            graph: state.graph,
            graphVersion: state.graph.version,
            corrections: state.corrections,
            useCaseId: state.useCaseId,
            // A correction pass must stay a correction pass — dropping this
            // would orphan the verdict being corrected.
            originalVerdictId: state.originalVerdictId,
          };
        default:
          return state;
      }

    case 'SUBMIT_DESCRIPTION':
      if (state.step !== 'description_entry') return state;
      return { step: 'duplicate_check', description: state.description };

    case 'NO_DUPLICATE_FOUND':
      if (state.step !== 'duplicate_check') return state;
      return { step: 'graph_extraction', description: state.description, method: action.method };

    case 'GRAPH_EXTRACTED':
      if (state.step !== 'graph_extraction') return state;
      return {
        step: 'graph_review',
        description: carriedDescription(state),
        graph: action.graph,
        graphVersion: action.graph.version,
        corrections: [],
        useCaseId: action.useCaseId,
        // R5-GR-2: only machine-proposed values need human confirmation.
        // The form path's values were typed by a person — an extra confirm
        // pass there would be ceremony, and ceremony trains blind clicking.
        ...(state.method === 'llm'
          ? {
              unconfirmedNodeIds: [
                ...action.graph.input_nodes,
                ...action.graph.processing_nodes,
                ...action.graph.output_nodes,
              ].map((n) => n.id),
            }
          : {}),
        ...(action.ignoredJurisdictions && action.ignoredJurisdictions.length > 0
          ? { ignoredJurisdictions: action.ignoredJurisdictions }
          : {}),
      };

    case 'CORRECTION_APPLIED':
      if (state.step !== 'graph_review') return state;
      return {
        ...state,
        graph: action.updatedGraph,
        graphVersion: action.updatedGraph.version,
        corrections: [...state.corrections, action.correction],
        // R5-GR-2: a correction is stronger evidence of review than a
        // Confirm click — the human read the value closely enough to
        // change it. The corrected node needs no second confirmation.
        ...(state.unconfirmedNodeIds
          ? { unconfirmedNodeIds: state.unconfirmedNodeIds.filter((id) => id !== action.correction.node_id) }
          : {}),
      };

    case 'NODE_CONFIRMED':
      if (state.step !== 'graph_review' || !state.unconfirmedNodeIds) return state;
      return {
        ...state,
        unconfirmedNodeIds: state.unconfirmedNodeIds.filter((id) => id !== action.nodeId),
      };

    case 'QUESTIONS_GENERATED':
      if (state.step !== 'graph_review') return state;
      // R5-GR-2 defense in depth (same layering as CONTRADICTION_RESOLVED's
      // empty-explanation guard): the UI refuses with a message, and the
      // reducer refuses regardless of what the UI did.
      if (state.unconfirmedNodeIds && state.unconfirmedNodeIds.length > 0) return state;
      return {
        step: 'questionnaire',
        description: carriedDescription(state),
        graph: state.graph,
        questions: action.questions,
        answers: [],
        resolutionNotes: [],
        corrections: state.corrections,
        useCaseId: state.useCaseId,
        originalVerdictId: state.originalVerdictId,
      };

    case 'ANSWER_SUBMITTED':
      if (state.step !== 'questionnaire') return state;
      return { ...state, answers: [...state.answers, action.answer] };

    case 'CONTRADICTIONS_DETECTED':
      if (state.step !== 'questionnaire') return state;
      return {
        step: 'contradiction_review',
        description: carriedDescription(state),
        graph: state.graph,
        questions: state.questions,
        answers: state.answers,
        contradictions: action.contradictions,
        resolutionNotes: state.resolutionNotes,
        corrections: state.corrections,
        useCaseId: state.useCaseId,
        originalVerdictId: state.originalVerdictId,
      };

    case 'CONTRADICTION_RESOLVED':
      // BC-P4C03-03 defense in depth: reject an empty/whitespace-only
      // explanation at the reducer layer too, not just the UI's
      // disabled-button check.
      if (state.step !== 'contradiction_review' || !action.explanation.trim()) return state;
      return {
        step: 'questionnaire',
        description: carriedDescription(state),
        graph: state.graph,
        questions: state.questions,
        answers: state.answers,
        resolutionNotes: [...state.resolutionNotes, action.explanation.trim()],
        corrections: state.corrections,
        useCaseId: state.useCaseId,
        originalVerdictId: state.originalVerdictId,
      };

    case 'PROCEED_TO_CONFIRMATION':
      if (state.step !== 'questionnaire') return state;
      return {
        step: 'confirmation',
        description: carriedDescription(state),
        graph: state.graph,
        graphVersion: state.graph.version,
        corrections: state.corrections,
        answers: state.answers,
        resolutionNotes: state.resolutionNotes,
        useCaseId: state.useCaseId,
        originalVerdictId: state.originalVerdictId,
      };

    case 'CONFIRMED':
      if (state.step !== 'confirmation') return state;
      return {
        step: 'evaluation_pending',
        graph: state.graph,
        useCaseId: state.useCaseId,
        originalVerdictId: state.originalVerdictId,
      };

    case 'VERDICT_READY':
      if (state.step !== 'evaluation_pending') return state;
      return { step: 'verdict', verdictId: state.useCaseId };

    case 'EVALUATION_FAILED':
      // Back to graph_review, not stuck on "Evaluating..." forever —
      // simplest safe recovery point (re-derive graphVersion/corrections
      // rather than threading them through evaluation_pending too).
      if (state.step !== 'evaluation_pending') return state;
      return {
        step: 'graph_review',
        description: carriedDescription(state),
        graph: state.graph,
        graphVersion: state.graph.version,
        corrections: [],
        useCaseId: state.useCaseId,
        originalVerdictId: state.originalVerdictId,
      };

    case 'CORRECT_VERDICT':
      if (state.step !== 'verdict') return state;
      return {
        step: 'graph_review',
        description: carriedDescription(state),
        graph: action.graph,
        graphVersion: action.graph.version,
        corrections: [],
        useCaseId: action.useCaseId,
        originalVerdictId: action.originalVerdictId,
      };

    default:
      return state;
  }
}
