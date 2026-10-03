// Intake flow state machine (intake-flow.md §3). Kept separate from
// IntakeFlow.tsx so the reducer is independently unit-testable without
// React Testing Library (Dan Vanderkam: typed discriminated unions).
import type { Contradiction, DataFlowGraph, GraphCorrection, IntakeQuestion, QuestionAnswer } from '../engine/types';
import type { Assumption, PlainAnswers } from './plain-copy';

export type { Contradiction, IntakeQuestion, QuestionAnswer };

export type IntakeState =
  | { step: 'description_entry'; description: string }
  | { step: 'duplicate_check'; description: string }
  | {
      step: 'graph_extraction';
      description: string;
      // D-1 (Minor): this is intake-flow's OWN method name, not the
      // graph's — the engine's field (DataFlowGraph.intake_method,
      // engine/types.ts) is 'llm' | 'structured_form'. Two spellings for
      // the same concept; a test fixture once used the invalid value
      // 'form' here and nothing caught it. Kept distinct on purpose
      // (this one is a UI routing choice made before any graph exists),
      // but read the two together before changing either.
      method: 'llm' | 'form';
      // W-4 (R16-W §1, D-70). Present only on a RESUBMISSION of the form —
      // CHANGE_ANSWER and the form-path STEP_BACK set these so the form
      // reopens filled in (plainAnswers) and so a second Continue reuses
      // the use case this intake already minted rather than writing a
      // second use_case_created (useCaseId). Absent on the very first
      // visit to the form, and always absent on the description/LLM path.
      useCaseId?: string;
      plainAnswers?: PlainAnswers;
      assumptions?: Assumption[];
      // R16-D2 §5 (D-82, DR7-17/DR7-22). Present only on a CORRECTION of a
      // form-built verdict (`CORRECT_VERDICT_WITH_FORM`, carried forward by
      // every return trip to this step — CHANGE_ANSWER, a form-path
      // EVALUATION_FAILED, the questionnaire's own STEP_BACK). `useCaseId`
      // above is reused the same way a plain resubmission already reuses
      // it; these two name the correction itself: which verdict is being
      // corrected, and the graph it was produced from, so a resubmission's
      // `formCorrections()` diff is always against the ORIGINAL answers —
      // never against a previous, never-attested resubmission attempt.
      originalVerdictId?: string;
      originalGraph?: DataFlowGraph;
    }
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
      // R6 (ADR-IF-R6-1): intake artifacts travelling BESIDE the graph.
      // provenance[nodeId][field] = VERIFIED verbatim quote from the
      // description; guessedFields[nodeId] = decision-bearing fields with
      // no verified basis. Ephemeral review state, like unconfirmedNodeIds.
      provenance?: Record<string, Record<string, string>>;
      guessedFields?: Record<string, string[]>;
      // R7-JC (ADR-IF-R7-1): false on the LLM path until the human confirms
      // or edits the extracted jurisdictions — the field that selects which
      // regulatory PACKS evaluate must never stay model-asserted. Absent on
      // the form path (explicit answer, R3-JU) and re-entry paths.
      jurisdictionsConfirmed?: boolean;
      // R5-GX-1 (ADR-IF-R5-2). Jurisdiction strings the extractor returned
      // that the loaded policy does not recognise — removed from the graph
      // before the human sees it, surfaced so the removal is visible.
      ignoredJurisdictions?: string[];
      // M-2 (FX-2 review). Present only after a Back from the questionnaire:
      // the FROZEN uncertainNodeIds from the first QUESTIONS_GENERATED, so a
      // Back + Continue does not re-derive it from the since-trimmed
      // guessedFields.
      uncertainNodeIds?: string[];
      // F-2 (DR7-04). Set by EVALUATION_FAILED on a description-path graph
      // ONLY — this is a re-entry after a genuine engine/policy failure,
      // not a fresh submission, so it must not be walked out of the same
      // way a correction pass (originalVerdictId) cannot be: STEP_BACK
      // returns the state unchanged, and canStepBack (IntakeFlow.tsx) is
      // false here, exactly mirroring the correction-pass rule. Absent on
      // every other route into graph_review.
      afterFailedEvaluation?: boolean;
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
      // R16-D2 §5: see graph_extraction's own comment above — carried
      // forward only so a further "Change an answer"/STEP_BACK/evaluation
      // failure during this correction can hand it back to the form.
      originalGraph?: DataFlowGraph;
      // v0.7.1: single-level undo — the graph and corrections length as
      // they stood BEFORE the most recent answer. Cleared by the next
      // answer. Ephemeral review state; the trail records only what is
      // attested. R16-E §3: also snapshots `questions` (an answer can
      // insert a follow-up right after itself — undoing it must remove
      // that follow-up too, not just the answer) and the assumptions
      // length (a "Not sure" answer can append one).
      // CR6-04 (Critical, BC-002): `questions`/`assumptionsLen` were added
      // at 9348882 — a draft saved by an older build has an `undo` with
      // neither (the pre-9348882 shape was `{ graph, correctionsLen }`
      // only). ANSWER_UNDONE below falls back rather than reading either
      // as `undefined` and crashing QuestionnaireStep, which indexes
      // `questions[answeredCount]`; intake-draft.ts's versioned envelope
      // is the first layer (drops an incompatible `undo` on restore —
      // never lets it reach here from an old draft at all) — this is
      // defense in depth for anything that still does. CR6-03's own
      // `guessedFields` snapshot is newer still, optional for the
      // identical reason.
      undo?: {
        graph: DataFlowGraph;
        correctionsLen: number;
        questions: IntakeQuestion[];
        assumptionsLen: number;
        guessedFields?: Record<string, string[]>;
      };
      // W-3/W-4 (R16-W §1). Present only when this questionnaire was
      // reached via FORM_SUBMITTED (the form path's own questions, if
      // any) — carried so a form-path STEP_BACK can return to the form
      // filled in, and so the summary can still show the "Not sure"
      // assumptions once the graph reaches confirmation. Absent on the
      // description/LLM path, which never sets them.
      plainAnswers?: PlainAnswers;
      assumptions?: Assumption[];
      // F-7 (DR7-07). Node ids the LLM path flagged uncertain/guessed,
      // captured from graph_review's own `guessedFields` at the moment
      // QUESTIONS_GENERATED leaves that step — set once, here, then
      // threaded forward through every subsequent transition (never
      // re-derived, since graph_review's own guessedFields field does not
      // exist past that step). Replaces the `uncertainNodeIds` useState
      // IntakeFlow.tsx used to hold instead, which a refresh silently
      // dropped (the draft only ever persisted IntakeState). Absent/empty
      // on the form path, which never sets guessedFields.
      uncertainNodeIds?: string[];
      // CR6-03 (Critical). Carried from graph_review's own guessedFields/
      // provenance/unconfirmedNodeIds/jurisdictionsConfirmed at the SAME
      // moment QUESTIONS_GENERATED captures uncertainNodeIds above — and
      // restored on STEP_BACK, so Back does not turn off the R5-GR-2/
      // R7-JC review gate it left behind. Unlike uncertainNodeIds (frozen:
      // it records what the description did NOT say, which stays true
      // after the person answers), guessedFields here means "still to
      // ask" — ANSWER_SUBMITTED trims a field out of it the moment that
      // field is answered, so a later Back + Continue does not regenerate
      // a question for it. unconfirmedNodeIds/jurisdictionsConfirmed are
      // threaded through UNCHANGED (QUESTIONS_GENERATED's own guard never
      // lets a non-empty unconfirmedNodeIds or a false jurisdictionsConfirmed
      // reach here, so what's carried is always either undefined — no
      // gate, the form path and correction/evaluation-failure re-entries —
      // or the concrete "everything already checked" values).
      guessedFields?: Record<string, string[]>;
      provenance?: Record<string, Record<string, string>>;
      unconfirmedNodeIds?: string[];
      jurisdictionsConfirmed?: boolean;
      // M-2 (FX-2 review). Carried from graph_review at QUESTIONS_GENERATED
      // (and threaded through a contradiction round trip) so Back restores
      // the "We ignored X" notice instead of silently dropping it.
      ignoredJurisdictions?: string[];
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
      // R16-D2 §5: see graph_extraction's own comment.
      originalGraph?: DataFlowGraph;
      // W-3/W-4: see the questionnaire variant's comment above.
      plainAnswers?: PlainAnswers;
      assumptions?: Assumption[];
      // F-7: see the questionnaire variant's comment above.
      uncertainNodeIds?: string[];
      ignoredJurisdictions?: string[];
      // CR6-03: see the questionnaire variant's comment above — threaded
      // through a contradiction-review round trip the same way
      // uncertainNodeIds already is, so a Back from the questionnaire
      // reached via CONTRADICTION_RESOLVED still restores the right gate.
      guessedFields?: Record<string, string[]>;
      provenance?: Record<string, Record<string, string>>;
      unconfirmedNodeIds?: string[];
      jurisdictionsConfirmed?: boolean;
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
      // R16-D2 §5: see graph_extraction's own comment.
      originalGraph?: DataFlowGraph;
      // W-3/W-4: see the questionnaire variant's comment above. This is
      // what IntakeFlow now reads directly for UnderstoodSummary's
      // assumptions list — replacing the `formAssumptions` useState the
      // B+C chunk used, which a refresh (the draft only ever persisted
      // IntakeState) silently lost.
      plainAnswers?: PlainAnswers;
      assumptions?: Assumption[];
      // F-7: see the questionnaire variant's comment above — this is what
      // IntakeFlow now reads directly for UnderstoodSummary's "uncertain"
      // list, replacing the component `useState` of the same name.
      uncertainNodeIds?: string[];
    }
  | {
      step: 'evaluation_pending';
      graph: DataFlowGraph;
      useCaseId: string;
      originalVerdictId?: string;
      // R16-D2 §5: see graph_extraction's own comment — carried here so a
      // genuine evaluation failure during a form correction can still hand
      // it back to the form (EVALUATION_FAILED, below).
      originalGraph?: DataFlowGraph;
      // Review 004 finding 2: carried so a failed evaluation can restore a
      // WORKING review screen — description visible, jurisdictions editable.
      description?: string;
      // F-2 (DR7-04). Carried from the confirmation state so EVALUATION_FAILED
      // can hand them straight back: a form-path graph returns to the form
      // itself (graph_extraction), which needs both to reopen filled in; a
      // description-path graph returns to graph_review, which does not read
      // these directly but a later re-confirm still needs them threaded
      // onward exactly as any other confirmation re-entry does.
      plainAnswers?: PlainAnswers;
      assumptions?: Assumption[];
    }
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
  | {
      type: 'GRAPH_EXTRACTED';
      graph: DataFlowGraph;
      useCaseId: string;
      ignoredJurisdictions?: string[];
      provenance?: Record<string, Record<string, string>>;
      guessedFields?: Record<string, string[]>;
    }
  // R16-E §5 (D-104, DR7-30/AB-1). "Answer the questions instead" — a
  // failed extraction's own second button. Valid only from the LLM path's
  // graph_extraction; `description` is already there and StructuredForm
  // already pre-fills from it (`initialDescription`), so this is a pure
  // method flip, not a new carrier of state.
  | { type: 'SWITCH_TO_FORM' }
  // W-3 (R16-W §1, D-69). Valid only from graph_extraction with
  // method: 'form' — GRAPH_EXTRACTED (above) stays the description path's
  // own action; the form path's screen-after-screen field-card review
  // (`graph_review`) is engine vocabulary principle 1 bans from a path
  // where the person picked every value themselves, so this skips it.
  // The caller computes `questions`/`contradictions` from the graph in
  // hand (never from stale state) and this reducer only picks which of
  // the three destinations they lead to — pure, no audit write here (the
  // one write for a fresh submission stays IntakeFlow's use_case_created,
  // written before this dispatches).
  | {
      type: 'FORM_SUBMITTED';
      graph: DataFlowGraph;
      useCaseId: string;
      description: string;
      plainAnswers: PlainAnswers;
      assumptions: Assumption[];
      questions: IntakeQuestion[];
      contradictions: Contradiction[];
      // R16-D2 §5 (D-82). Empty on a fresh submission; on a correction,
      // the caller's `formCorrections(originalGraph, graph, …)` diff —
      // computed in IntakeFlow.tsx's handleFormSubmitted, which has both
      // graphs in scope (the one on `state.originalGraph`, and this one).
      // Threaded onto the SAME `corrections` field every other path already
      // uses, so `runConfirmAndEvaluate`'s existing per-correction write
      // loop needs no change to also write these.
      corrections: GraphCorrection[];
    }
  | { type: 'CORRECTION_APPLIED'; correction: GraphCorrection; updatedGraph: DataFlowGraph }
  // R5-GR-2: the human states a model-proposed node is right as shown.
  | { type: 'NODE_CONFIRMED'; nodeId: string }
  // R7-JC: accept the extracted jurisdictions as shown…
  | { type: 'JURISDICTIONS_CONFIRMED' }
  // …or replace them (policy-scoped codes only, enforced by the caller's
  // UI); the edit is a recorded correction and confirms implicitly.
  | { type: 'JURISDICTIONS_SET'; updatedGraph: DataFlowGraph; correction: GraphCorrection }
  | { type: 'QUESTIONS_GENERATED'; questions: IntakeQuestion[] }
  // R6-QN-1 (ADR-IF-R6-3): an answer that differs from the graph IS a
  // correction — carried with the answer so the reducer applies both
  // atomically, and the engine finally sees what the user answered.
  // R16-E §3 (D-102). `assumption`: a "Not sure" answer carries D2's
  // Assumption shape straight through — accumulated into
  // `state.assumptions` (created on first use; every other step already
  // carries this field optionally, so the shape was always there). `
  // insertQuestions`: the decision-type-other / vendor / model follow-up
  // questions, inserted into `state.questions` right after the one just
  // answered — e.g. picking "Something else" for what it helps decide, or
  // "Not on this list" for the supplier.
  | {
      type: 'ANSWER_SUBMITTED';
      answer: QuestionAnswer;
      correction?: GraphCorrection;
      updatedGraph?: DataFlowGraph;
      assumption?: Assumption;
      insertQuestions?: IntakeQuestion[];
    }
  // v0.7.1: take back the most recent answer (and its write-back), once.
  | { type: 'ANSWER_UNDONE' }
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
  | { type: 'CORRECT_VERDICT'; graph: DataFlowGraph; useCaseId: string; originalVerdictId: string }
  // R16-D2 §5 (D-82, DR7-17). The form-path counterpart to CORRECT_VERDICT
  // above: re-enters at the GUIDED FORM itself (graph_review is engine
  // vocabulary a form-built case has no business showing, principle 1),
  // filled in with what was last confirmed, carrying the id of the verdict
  // being corrected and the graph it was produced from (so the eventual
  // resubmission's formCorrections() diff is against the real original).
  | {
      type: 'CORRECT_VERDICT_WITH_FORM';
      originalGraph: DataFlowGraph;
      useCaseId: string;
      originalVerdictId: string;
      description: string;
      plainAnswers: PlainAnswers;
      assumptions: Assumption[];
    }
  // R16-C (§3): "Change an answer" on the UnderstoodSummary. Deliberately
  // its OWN action rather than reusing STEP_BACK — STEP_BACK's existing
  // reducer case and canStepBack's UI gate stay exactly as they are
  // (confirmation has no "← Back" control, on purpose: IntakeFlow.back.test.tsx
  // asserts that). This is a navigation-only transition, same destination
  // shape as STEP_BACK's questionnaire case, never a write to the audit
  // trail — the one write stays the Confirm button and its in-flight guard.
  | { type: 'CHANGE_ANSWER' };

// F-6 (DR7-13). The "questions -> contradiction review -> confirmation"
// priority used to be written twice: once here (FORM_SUBMITTED, below) and
// once in IntakeFlow.tsx's `handleProceedFromGraphReview` (the description
// path's own exit from graph_review). One pure function, used by both —
// behaviour unchanged, the priority pinned once.
export function nextReviewStep(
  questions: IntakeQuestion[],
  contradictions: Contradiction[],
): 'questionnaire' | 'contradiction_review' | 'confirmation' {
  if (questions.length > 0) return 'questionnaire';
  if (contradictions.length > 0) return 'contradiction_review';
  return 'confirmation';
}

/** R16-D2 §5 (v2.1). Whether a step back, "Change an answer" or an
 *  evaluation failure returns to the guided form. A form-built graph does —
 *  EXCEPT in a correction whose form answers and original graph are not both
 *  in hand (a correction that came through the review screen,
 *  CORRECT_VERDICT): that goes back to the review screen instead. An empty
 *  form in correction mode would rebuild the case from blank answers and,
 *  with no original graph to diff against, record "no answers changed" — a
 *  false record on the append-only trail. */
function returnsToForm(state: {
  graph: DataFlowGraph;
  plainAnswers?: PlainAnswers;
  originalVerdictId?: string;
  originalGraph?: DataFlowGraph;
}): boolean {
  if (state.graph.intake_method !== 'structured_form') return false;
  if (!state.originalVerdictId) return true;
  return state.plainAnswers !== undefined && state.originalGraph !== undefined;
}

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
          //
          // F-2 (DR7-04): a re-entry after a genuine evaluation failure
          // (afterFailedEvaluation) is refused for the identical reason —
          // the case already has a graph_confirmed attestation on the
          // trail, and "back" must not route the next Continue into
          // minting a second, orphaned case the way it used to.
          if (state.originalVerdictId || state.afterFailedEvaluation) return state;
          return { step: 'duplicate_check', description: carriedDescription(state) };
        case 'questionnaire':
          // W-3 (R16-W §1, D-69): a form-path graph steps back into the
          // form itself, filled in (W-4) — not the retired field-card
          // screen, which the form path no longer visits on the way
          // forward either (FORM_SUBMITTED skips straight past it). Same
          // intake_method branch CHANGE_ANSWER already uses from
          // confirmation, below.
          if (returnsToForm(state)) {
            return {
              step: 'graph_extraction',
              description: carriedDescription(state),
              method: 'form',
              useCaseId: state.useCaseId,
              plainAnswers: state.plainAnswers,
              assumptions: state.assumptions,
              // R16-D2 §5: a correction pass must stay a correction pass on
              // the way back into the form too — dropping these here would
              // reopen the identical "orphaned correction" dead end §5
              // closes for CHANGE_ANSWER/EVALUATION_FAILED, just reached via
              // Back from the questionnaire instead.
              originalVerdictId: state.originalVerdictId,
              originalGraph: state.originalGraph,
            };
          }
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
            // CR6-03 (Critical). Restored from questionnaire's own carried
            // copies (set once, at QUESTIONS_GENERATED) — never left
            // undefined here, which used to silently turn OFF the R5-GR-2/
            // R7-JC review gate on return. unconfirmedNodeIds/
            // jurisdictionsConfirmed are whatever QUESTIONS_GENERATED's
            // own guard already proved safe to carry: undefined (no gate —
            // the form path, a correction, an evaluation-failure re-entry)
            // or the concrete "everything already checked" values — never
            // the gate reappearing non-empty/false.
            guessedFields: state.guessedFields,
            provenance: state.provenance,
            unconfirmedNodeIds: state.unconfirmedNodeIds,
            jurisdictionsConfirmed: state.jurisdictionsConfirmed,
            // M-2: the notice and the frozen record both survive the trip.
            ...(state.ignoredJurisdictions ? { ignoredJurisdictions: state.ignoredJurisdictions } : {}),
            ...(state.uncertainNodeIds ? { uncertainNodeIds: state.uncertainNodeIds } : {}),
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
              // ADR-IF-R6-2: nodes with guessed fields are EXCLUDED — their
              // resolution path is a correction or the questionnaire, never
              // a one-click confirm of a value nobody stated.
              unconfirmedNodeIds: [
                ...action.graph.input_nodes,
                ...action.graph.processing_nodes,
                ...action.graph.output_nodes,
              ]
                .map((n) => n.id)
                .filter((id) => !(action.guessedFields && (action.guessedFields[id]?.length ?? 0) > 0)),
              ...(action.provenance ? { provenance: action.provenance } : {}),
              ...(action.guessedFields ? { guessedFields: action.guessedFields } : {}),
              jurisdictionsConfirmed: false,
            }
          : {}),
        ...(action.ignoredJurisdictions && action.ignoredJurisdictions.length > 0
          ? { ignoredJurisdictions: action.ignoredJurisdictions }
          : {}),
      };

    // R16-E §5. A pure method flip — `description` (and, on a correction,
    // `originalVerdictId`/`originalGraph`) are already on this state and
    // need no change; StructuredForm's own `initialDescription` prop picks
    // up the carried description unchanged.
    case 'SWITCH_TO_FORM':
      if (state.step !== 'graph_extraction' || state.method !== 'llm') return state;
      return { ...state, method: 'form' };

    case 'FORM_SUBMITTED': {
      // W-3 (R16-W §1, D-69): valid only from the form's own
      // graph_extraction — GRAPH_EXTRACTED (above) is the description
      // path's exit from this step, never this one's.
      if (state.step !== 'graph_extraction' || state.method !== 'form') return state;
      const carried = {
        description: action.description,
        graph: action.graph,
        useCaseId: action.useCaseId,
        plainAnswers: action.plainAnswers,
        assumptions: action.assumptions,
        // R16-D2 §5: carried from THIS state (the correction's start), not
        // from the action — a correction stays the same correction across
        // however many times the form is resubmitted before Confirm.
        originalVerdictId: state.originalVerdictId,
        originalGraph: state.originalGraph,
      };
      // F-6 (DR7-13): the ONE routing rule, shared with
      // handleProceedFromGraphReview's dispatch choice (IntakeFlow.tsx) —
      // generated questions first; failing that, a contradiction stops at
      // its own review; failing that, confirmation.
      switch (nextReviewStep(action.questions, action.contradictions)) {
        case 'questionnaire':
          return {
            step: 'questionnaire',
            ...carried,
            questions: action.questions,
            answers: [],
            resolutionNotes: [],
            // R16-D2 §5: the caller's formCorrections() diff (empty on a
            // fresh submission) — the SAME field the description path's
            // node-level corrections already use, so runConfirmAndEvaluate
            // writes them with no change of its own.
            corrections: action.corrections,
            // B-10 (rewritten, FX-2 review I-3): nothing carried. A submission-
            // time contradiction is re-derived from the CURRENT graph when the
            // questions end (IntakeFlow), never replayed from a stale copy.
          };
        case 'contradiction_review':
          return {
            step: 'contradiction_review',
            ...carried,
            questions: action.questions,
            answers: [],
            contradictions: action.contradictions,
            resolutionNotes: [],
            corrections: action.corrections,
          };
        case 'confirmation':
          return {
            step: 'confirmation',
            ...carried,
            graphVersion: action.graph.version,
            corrections: action.corrections,
            answers: [],
            resolutionNotes: [],
          };
      }
    }

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
        // R6: a corrected field is no longer guessed, and the model's quote
        // for it no longer describes the value on screen — both drop.
        ...(state.guessedFields
          ? {
              guessedFields: Object.fromEntries(
                Object.entries(state.guessedFields)
                  .map(([id, fields]) => [
                    id,
                    id === action.correction.node_id ? fields.filter((fld) => fld !== action.correction.field) : fields,
                  ])
                  .filter(([, fields]) => (fields as string[]).length > 0),
              ),
            }
          : {}),
        ...(state.provenance && state.provenance[action.correction.node_id]?.[action.correction.field]
          ? {
              provenance: {
                ...state.provenance,
                [action.correction.node_id]: Object.fromEntries(
                  Object.entries(state.provenance[action.correction.node_id]!).filter(
                    ([fld]) => fld !== action.correction.field,
                  ),
                ),
              },
            }
          : {}),
      };

    case 'JURISDICTIONS_CONFIRMED':
      if (state.step !== 'graph_review' || state.jurisdictionsConfirmed === undefined) return state;
      return { ...state, jurisdictionsConfirmed: true };

    case 'JURISDICTIONS_SET':
      if (state.step !== 'graph_review') return state;
      return {
        ...state,
        graph: action.updatedGraph,
        graphVersion: action.updatedGraph.version,
        corrections: [...state.corrections, action.correction],
        ...(state.jurisdictionsConfirmed !== undefined ? { jurisdictionsConfirmed: true } : {}),
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
      if (state.jurisdictionsConfirmed === false) return state;
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
        // F-7 (DR7-07): captured once, here, from graph_review's own
        // guessedFields — the only step this field exists on.
        // M-2: after a Back round trip graph_review carries the FIRST capture;
        // keep it rather than re-deriving from the trimmed guessedFields.
        uncertainNodeIds: state.uncertainNodeIds ?? Object.keys(state.guessedFields ?? {}),
        // CR6-03 (Critical). Carried forward so a later STEP_BACK can
        // restore them — see the questionnaire type's own comment. The
        // guard above already proved unconfirmedNodeIds/jurisdictionsConfirmed
        // are safe to carry as-is (never non-empty/false here).
        guessedFields: state.guessedFields,
        provenance: state.provenance,
        unconfirmedNodeIds: state.unconfirmedNodeIds,
        jurisdictionsConfirmed: state.jurisdictionsConfirmed,
        ...(state.ignoredJurisdictions ? { ignoredJurisdictions: state.ignoredJurisdictions } : {}),
      };

    case 'ANSWER_SUBMITTED': {
      if (state.step !== 'questionnaire') return state;
      // v0.7.1 double-submit guard: a question already answered is refused
      // at the reducer, so a double-click cannot record twice and skip the
      // next question (same layering as the R5/R6 gates).
      if (state.answers.some((a) => a.questionId === action.answer.questionId)) return state;
      // R16-E §3 (D-102): a follow-up question (decision_type_other, a
      // supplier/model not on the firm's list) is inserted right after the
      // one just answered — found by id, never by index, so this stays
      // correct regardless of where in the list the current question sits.
      const currentIndex = state.questions.findIndex((q) => q.id === action.answer.questionId);
      const answeredQuestion = currentIndex !== -1 ? state.questions[currentIndex] : undefined;
      const questions =
        action.insertQuestions && action.insertQuestions.length > 0 && currentIndex !== -1
          ? [
              ...state.questions.slice(0, currentIndex + 1),
              ...action.insertQuestions,
              ...state.questions.slice(currentIndex + 1),
            ]
          : state.questions;
      const assumptions = action.assumption ? [...(state.assumptions ?? []), action.assumption] : state.assumptions;
      // CR6-03 (Critical). A guessed field that has just been answered is
      // no longer "still to ask" — dropped from the carried guessedFields
      // (the same trim CORRECTION_APPLIED already does for graph_review's
      // own copy) so a later Back + Continue does not regenerate a
      // question for it. uncertainNodeIds (F-7, above) is a DIFFERENT,
      // frozen record of what the description did not say and is never
      // touched here — an answered guessed field still belongs in it.
      const guessedFields =
        state.guessedFields && answeredQuestion?.node_id && answeredQuestion.field
          ? Object.fromEntries(
              Object.entries(state.guessedFields)
                .map(([id, fields]) => [
                  id,
                  id === answeredQuestion.node_id ? fields.filter((fld) => fld !== answeredQuestion.field) : fields,
                ])
                .filter(([, fields]) => (fields as string[]).length > 0),
            )
          : state.guessedFields;
      // ADR-IF-R6-3: when the answer differs from the graph, the caller
      // sends the correction and the updated graph with it — applied here
      // so the attested, evaluated graph is the one the user answered.
      return {
        ...state,
        questions,
        answers: [...state.answers, action.answer],
        undo: {
          graph: state.graph,
          correctionsLen: state.corrections.length,
          questions: state.questions,
          assumptionsLen: state.assumptions?.length ?? 0,
          // CR6-03: the PRE-answer guessedFields, so ANSWER_UNDONE can put
          // an undone guessed field back among those still to ask.
          guessedFields: state.guessedFields,
        },
        ...(action.updatedGraph ? { graph: action.updatedGraph } : {}),
        ...(action.correction ? { corrections: [...state.corrections, action.correction] } : {}),
        ...(assumptions ? { assumptions } : {}),
        ...(state.guessedFields ? { guessedFields } : {}),
      };
    }

    case 'ANSWER_UNDONE': {
      if (state.step !== 'questionnaire' || !state.undo || state.answers.length === 0) return state;
      const { undo, ...rest } = state;
      return {
        ...rest,
        answers: state.answers.slice(0, -1),
        graph: undo.graph,
        corrections: state.corrections.slice(0, undo.correctionsLen),
        // CR6-04 (Critical, BC-002): defensive fallback — a snapshot from
        // before 9348882 has no `questions` at all (`undefined`), which
        // QuestionnaireStep then indexes (`questions[answeredCount]`) and
        // crashes on. Falling back to the CURRENT questions is the honest
        // "nothing to undo for this part" behaviour, never a crash.
        questions: undo.questions ?? state.questions,
        ...(state.assumptions
          ? { assumptions: state.assumptions.slice(0, undo.assumptionsLen ?? state.assumptions.length) }
          : {}),
        // CR6-03: restores the pre-answer guessedFields too, so an undone
        // guessed-field answer is askable again via Back + Continue — only
        // when the snapshot actually has one (an old-shaped undo has
        // neither `guessedFields` NOR a reason to think the current,
        // already-trimmed copy in `rest` is wrong, so it is left alone).
        ...(undo.guessedFields !== undefined ? { guessedFields: undo.guessedFields } : {}),
      };
    }

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
        // R16-D2 §5: threaded forward alongside originalVerdictId.
        originalGraph: state.originalGraph,
        // W-4: carried so a form-path contradiction review still has them
        // once it returns to the questionnaire and on to confirmation.
        plainAnswers: state.plainAnswers,
        assumptions: state.assumptions,
        // F-7: threaded forward, never re-derived.
        uncertainNodeIds: state.uncertainNodeIds,
        // CR6-03: threaded forward, same reasoning as uncertainNodeIds —
        // a Back reached via CONTRADICTION_RESOLVED must still restore the
        // right gate.
        guessedFields: state.guessedFields,
        provenance: state.provenance,
        unconfirmedNodeIds: state.unconfirmedNodeIds,
        jurisdictionsConfirmed: state.jurisdictionsConfirmed,
        ...(state.ignoredJurisdictions ? { ignoredJurisdictions: state.ignoredJurisdictions } : {}),
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
        // R16-D2 §5: threaded forward alongside originalVerdictId.
        originalGraph: state.originalGraph,
        // W-4: see CONTRADICTIONS_DETECTED's comment above.
        plainAnswers: state.plainAnswers,
        assumptions: state.assumptions,
        // F-7: threaded forward, never re-derived.
        uncertainNodeIds: state.uncertainNodeIds,
        // CR6-03: threaded forward — see CONTRADICTIONS_DETECTED's comment.
        guessedFields: state.guessedFields,
        provenance: state.provenance,
        unconfirmedNodeIds: state.unconfirmedNodeIds,
        jurisdictionsConfirmed: state.jurisdictionsConfirmed,
        ...(state.ignoredJurisdictions ? { ignoredJurisdictions: state.ignoredJurisdictions } : {}),
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
        // R16-D2 §5: threaded forward alongside originalVerdictId.
        originalGraph: state.originalGraph,
        // W-4: the one place a form-path intake reaches confirmation
        // without a question or a contradiction ever firing — still has
        // to carry these, same as FORM_SUBMITTED's own confirmation exit.
        plainAnswers: state.plainAnswers,
        assumptions: state.assumptions,
        // F-7: threaded forward, never re-derived.
        uncertainNodeIds: state.uncertainNodeIds,
      };

    case 'CHANGE_ANSWER':
      if (state.step !== 'confirmation') return state;
      // The form path returns to the guided form itself, filled in (W-4:
      // plainAnswers/assumptions/useCaseId carried so StructuredForm
      // reopens with its answers and a resubmission reuses the same use
      // case — see "One use case, one creation event" §1). The
      // description path returns to the existing correction flow
      // (GraphView, UC-7), unchanged.
      //
      // R16-D2 §5 (v2.1): originalVerdictId/originalGraph carried on the
      // FORM branch too — before this fix, "Change an answer" during a
      // correction of a form-built case lost both, so the eventual
      // re-confirm ran as a FRESH confirm and the F-1 precondition refused
      // it as "already has a result": safe (nothing written) but a dead
      // end. The graph_review branch below already carried
      // originalVerdictId (the "CORRECT_VERDICT fallback" case) — unchanged.
      return returnsToForm(state)
        ? {
            step: 'graph_extraction',
            description: state.description,
            method: 'form',
            useCaseId: state.useCaseId,
            plainAnswers: state.plainAnswers,
            assumptions: state.assumptions,
            originalVerdictId: state.originalVerdictId,
            originalGraph: state.originalGraph,
          }
        : {
            step: 'graph_review',
            description: carriedDescription(state),
            graph: state.graph,
            graphVersion: state.graph.version,
            corrections: state.corrections,
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
        // R16-D2 §5: threaded forward alongside originalVerdictId, for the
        // identical reason — EVALUATION_FAILED hands it straight back too.
        originalGraph: state.originalGraph,
        description: state.description,
        // F-2 (DR7-04): carried so EVALUATION_FAILED can hand a form-path
        // graph straight back to the filled-in form.
        plainAnswers: state.plainAnswers,
        assumptions: state.assumptions,
      };

    case 'VERDICT_READY':
      if (state.step !== 'evaluation_pending') return state;
      return { step: 'verdict', verdictId: state.useCaseId };

    case 'EVALUATION_FAILED': {
      // Back to the review point, not stuck on "Evaluating..." forever.
      if (state.step !== 'evaluation_pending') return state;
      // F-2 (DR7-04). A form-path graph returns to the FORM itself — the
      // same filled-in shape FORM_SUBMITTED/CHANGE_ANSWER/the form-path
      // STEP_BACK already produce — never the retired field-card screen,
      // which the form path has never visited on the way forward either
      // (W-3). `useCaseId` is reused (the case already has a
      // graph_confirmed attestation on the trail); the next Confirm
      // passes the F-1 precondition and writes a new one — a deliberate
      // second attestation.
      if (returnsToForm(state)) {
        return {
          step: 'graph_extraction',
          description: carriedDescription(state),
          method: 'form',
          useCaseId: state.useCaseId,
          plainAnswers: state.plainAnswers,
          assumptions: state.assumptions,
          // R16-D2 §5 (v2.1): see CHANGE_ANSWER's identical fix above — a
          // genuine evaluation failure during a form correction must not
          // drop the correction context either.
          originalVerdictId: state.originalVerdictId,
          originalGraph: state.originalGraph,
        };
      }
      return {
        step: 'graph_review',
        description: carriedDescription(state),
        graph: state.graph,
        graphVersion: state.graph.version,
        corrections: [],
        useCaseId: state.useCaseId,
        originalVerdictId: state.originalVerdictId,
        // Review 004 finding 2: the failure most likely to land here is
        // jurisdiction/track-driven — the panel to FIX it must render.
        // Confirmed=true (it was confirmed before evaluation; re-entry is
        // not a fresh attestation, the R5 rule), editable via the panel.
        jurisdictionsConfirmed: true,
        // F-2 (DR7-04): a re-entry after a genuine failure, not a fresh
        // submission — STEP_BACK must not walk out of it, mirroring the
        // correction-pass rule (see the STEP_BACK case above).
        afterFailedEvaluation: true,
      };
    }

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

    // R16-D2 §5 (D-82). The form-path counterpart to CORRECT_VERDICT above.
    case 'CORRECT_VERDICT_WITH_FORM':
      if (state.step !== 'verdict') return state;
      return {
        step: 'graph_extraction',
        description: action.description,
        method: 'form',
        useCaseId: action.useCaseId,
        plainAnswers: action.plainAnswers,
        assumptions: action.assumptions,
        originalVerdictId: action.originalVerdictId,
        originalGraph: action.originalGraph,
      };

    default:
      return state;
  }
}
