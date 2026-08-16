import { useEffect, useCallback, useMemo, useReducer, useState, useRef } from 'react';
import { extractGraph } from '../llm/graph-extractor';
import { confirmSemanticDuplicate } from '../llm/duplicate-check';
import { getApiKey } from '../llm/client';
import { localLlmEnabled } from '../llm/local-provider';
import { evaluate } from '../engine/evaluate';
import { findPossibleDuplicates, matchCorpus } from '../engine/duplicate';
import { loadPolicy } from '../store/policy';
import { getCurrentPolicyYaml } from '../store/policy-source';
import { loadPacks } from '../store/packs';
import { getPackSources } from '../store/pack-source';
import { selfAssessmentSeeded } from '../seeds/aigate-self-assessment';
import { addNode, getUseCase, getUseCases, updateUseCaseVerdictSummary, updateLifecycleStage } from '../store/register';
import { getRole } from '../store/role';
import { routeToWorkflow } from '../engine/workflow-router';
import type { DataFlowGraph, GraphCorrection } from '../engine/types';
import type { Verdict } from '../types/verdict';
import type { AuditEvent, LifecycleStage, UseCaseSummary } from '../store/types';
import { generateQuestions, getQuestionBudget } from '../engine/question-generator';
import { detectContradictions } from '../engine/contradiction';
import { plausibilityWarnings } from '../engine/plausibility';
import { append as appendAuditEvent, getAll as getAuditEvents } from '../store/audit';
import { generateReasoningTraceForVerdict } from '../llm/reasoning-trace';
import { findRuleDescription } from '../engine/find-rule-description';
import { intakeReducer } from './intake-state';
import { saveDraft, loadDraft, clearDraft, clearFormDraft } from './intake-draft';
import type { IntakeState } from './intake-state';
import StructuredForm from './StructuredForm';
import GraphView from './GraphView';
import StepTracker from './StepTracker';
import QuestionnaireStep from './QuestionnaireStep';
import ContradictionReview from './ContradictionReview';
import ConfirmationStep from './ConfirmationStep';
import VerdictDisplay from './VerdictDisplay';
// Rule 4 (cross-cutting.md §7): presentation-only. No business logic inline
// — calls engine/store/llm functions. Real 9-state machine (intake-flow.md
// §3) as of P4-C04 — every state through confirmation/attestation is real.
// getRole() (P6-C01) replaces the hardcoded '1LoD' placeholder throughout.
const INITIAL_STATE: IntakeState = { step: 'description_entry', description: '' };

export default function IntakeFlow() {
  // explore-001 D-002/D-003: restore any in-flight draft so a refresh,
  // browser Back, or a trip to the Register mid-intake no longer discards
  // the description, the guided-form answers and the extracted graph.
  // Lazy init so the read happens once, before first paint.
  const restoredDraft = useRef<boolean>(loadDraft() !== null);
  const [state, dispatch] = useReducer(intakeReducer, INITIAL_STATE, (initial) => loadDraft() ?? initial);
  // Restoring silently would drop the user somewhere they did not navigate
  // to, with no explanation — the same class of surprise NF-2 exists to
  // prevent. Say what happened and offer a way out.
  const [showResumed, setShowResumed] = useState(restoredDraft.current);

  function handleStartOver() {
    clearDraft();
    // explore-005 D-002: the guided form keeps its answers under a SECOND
    // key, so clearing the reducer draft alone left the abandoned answers to
    // reappear on the next visit to the form step.
    clearFormDraft();
    setShowResumed(false);
    // RESTART, not DESCRIPTION_CHANGED — the latter is discarded by the
    // reducer from every step but description_entry, so the banner hid
    // itself and the screen never moved.
    dispatch({ type: 'RESTART' });
  }

  // FN-006. The steps a submitter can walk back out of. Everything after
  // `questionnaire` is past the confirmation attestation, which is one-way by
  // design — see the STEP_BACK case in intake-state.ts.
  const canStepBack =
    (state.step === 'duplicate_check' ||
      state.step === 'graph_review' ||
      state.step === 'questionnaire') &&
    // No Back on a correction pass's ENTRY step — the reducer refuses it
    // (see STEP_BACK), and a control that does nothing is the false-affordance
    // defect FN-006 existed to kill. Deeper correction steps (questionnaire →
    // graph_review) still step back normally: that stays inside the audited
    // correction, originalVerdictId intact.
    !(state.step === 'graph_review' && state.originalVerdictId);

  function handleStepBack() {
    // Stepping back to the description means the duplicate check has to run
    // again on the way forward — the description it checked may change.
    //
    // BOTH of these must be cleared, and the ref is the one that bites.
    // `dupCheckInFlight` is a StrictMode double-invoke guard that is set once
    // and never reset for the life of the mount. Clearing only the
    // `duplicateCheckDone` flag would leave the effect's early return armed,
    // so re-entering the step would sit on "Checking the existing inventory…"
    // forever with no way forward: explore-005's D-001, reintroduced by its
    // own fix. Verified against src/components/IntakeFlow.tsx:161-205.
    setDuplicateCheckDone(false);
    dupCheckInFlight.current = false;
    setDuplicateMatch(null);
    dispatch({ type: 'STEP_BACK' });
  }

  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [verdictAuditEvents, setVerdictAuditEvents] = useState<AuditEvent[]>([]);
  const [lastGraph, setLastGraph] = useState<DataFlowGraph | null>(null);
  // V1.2-C (UC-2/RG-2 leak fix, design-gap C1): the match is stored with
  // both tier and label, but the LABEL is only ever rendered for 2LoD —
  // 1LoD gets the redacted card (tier + "contact AI Risk").
  // UC-2 (round 4): carries the id as well as the display fields, because both
  // decisions — dismiss and adopt — have to name WHICH use case they were
  // about when they write it to the trail.
  const [duplicateMatch, setDuplicateMatch] = useState<{
    id: string;
    tier: string | null;
    track: string | null;
    label: string;
  } | null>(null);
  const [duplicateCheckDone, setDuplicateCheckDone] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  // Set once the classification has been adopted — the flow ends here rather
  // than continuing to intake questions (TC-UC-2-02).
  const [adoptedFrom, setAdoptedFrom] = useState<string | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [registerRows, setRegisterRows] = useState<UseCaseSummary[]>([]);
  const [savedStage, setSavedStage] = useState<LifecycleStage | null>(null);
  const [submittedDescription, setSubmittedDescription] = useState('');
  // R5-GR-2: the proceed-gate refusal message. State, not derived, so it
  // appears only after an attempted Proceed rather than scolding upfront.
  const [reviewGateError, setReviewGateError] = useState<string | null>(null);
  // P7-C03: reads getCurrentPolicyYaml() (a saved-policy override, or the
  // bundled starter YAML) instead of a static import. App.tsx unmounts and
  // remounts IntakeFlow every time the user navigates away and back
  // (existing view-switching behavior), so this useMemo naturally re-reads
  // the current policy on each visit without extra prop-threading.
  //
  // Acknowledged tradeoff (review finding, pass 1): a policy saved via
  // PolicyEditor while the user is already sitting on this screen won't
  // be picked up until they navigate away and back — the memo only
  // re-reads on remount, not on every render. This is a narrow, low-risk
  // gap in the single-view nav model (App.tsx renders exactly one of
  // IntakeFlow/RegisterView/PolicyEditor at a time, so reaching
  // PolicyEditor's Save button already requires leaving this screen
  // first); not worth a cross-component subscription mechanism for V1.
  const policyResult = useMemo(() => loadPolicy(getCurrentPolicyYaml()), []);
  // V2-A: jurisdiction packs — bundled files, parsed once. Invalid packs
  // are dropped by the loader (whole-pack rejection, CF-5/RA-7) and shown
  // on the Appetite screen; evaluation proceeds with the valid ones.
  const loadedPacks = useMemo(() => loadPacks(getPackSources()).packs, []);

  // explore-005 D-001: the effect below cannot run until the register has
  // actually loaded, or a restored session would resolve the check against
  // an empty array and report "checked 0 register entries" — a wrong answer
  // rendered as a confident one.
  const [registerLoaded, setRegisterLoaded] = useState(false);

  const refreshRegister = useCallback(async () => {
    // O-002: wait for the self-assessment seeding before reading, so the
    // count reported to the user is one the product has actually established.
    await selfAssessmentSeeded();
    const rows = await getUseCases('all');
    setRegisterRows(rows);
    setRegisterLoaded(true);
  }, []);

  useEffect(() => {
    void refreshRegister();
  }, [refreshRegister]);

  function handleSubmitDescription() {
    if (state.step !== 'description_entry') return;
    setSubmittedDescription(state.description);
    setDuplicateMatch(null);
    setDuplicateCheckDone(false);
    dispatch({ type: 'SUBMIT_DESCRIPTION' });
  }

  // explore-005 D-001 (Critical). The check used to run inside
  // handleSubmitDescription, so its result existed only for a session that
  // had passed through that click. A restored draft re-enters
  // 'duplicate_check' directly (the lazy reducer init above), never calls
  // the handler, and so sat on the loading placeholder forever — with the
  // only button out of the step rendered in the other arm of that same
  // ternary, leaving no control on screen at all.
  //
  // The fix is not to persist the result. The check is DERIVED from the
  // description and the register, both of which the restored session has,
  // so it is derived on entry to the step however the step was entered.
  // Nothing here writes to the audit trail, so a re-run is free.
  const dupCheckInFlight = useRef(false);

  useEffect(() => {
    if (state.step !== 'duplicate_check' || duplicateCheckDone || !registerLoaded) return;
    // Synchronous, for the same reason as confirmInFlight below: StrictMode
    // double-invokes mount effects within a single mount, and a state
    // update lands too late to prevent the second call — which would mean
    // two confirmSemanticDuplicate() calls per restore.
    if (dupCheckInFlight.current) return;
    dupCheckInFlight.current = true;

    const description = state.description;
    void (async () => {
      try {
        const candidates = findPossibleDuplicates(
          description,
          // matchCorpus, not bare label — the register's names are three
          // words long and an identical re-typed description scored zero
          // against them (2026-08-15).
          registerRows.map((r) => ({ id: r.use_case_id, label: matchCorpus(r) })),
        );
        const topCandidate = registerRows.find((r) => r.use_case_id === candidates[0]?.id);
        if (topCandidate) {
          const confirmed = getApiKey() ? await confirmSemanticDuplicate(description, topCandidate.label) : true;
          if (confirmed) {
            setDuplicateMatch({
              id: topCandidate.use_case_id,
              tier: topCandidate.tier,
              track: topCandidate.track,
              label: topCandidate.label,
            });
          }
        }
      } finally {
        // V2-B (user feedback): the duplicate check is a REAL GATE — the
        // flow stops here and shows the result (match card, or an explicit
        // "checked N entries, none similar"), and only proceeds on the
        // user's "This is a new use case" confirmation. Previously it
        // auto-proceeded past a green tick, making the inventory check
        // invisible (the V1.2-C documented deviation, now user-rejected).
        //
        // In `finally` so an LLM failure still renders the gate rather than
        // reinstating the hang this defect is about.
        dupCheckInFlight.current = false;
        setDuplicateCheckDone(true);
      }
    })();
  }, [state, duplicateCheckDone, registerLoaded, registerRows]);

  // Code review round 3, Panel E. This handler gained an audit write in round 4
  // and did not gain the guard its siblings already had, fourteen lines away.
  // `state.step` is read from the render closure, so a second click before
  // re-render passes the same check and writes a second event into a trail
  // that cannot be corrected. Synchronous ref, because a state update lands
  // too late — the same lesson as P7-C01's seed guard and the 2LoD actions
  // (verified: src/components/RegisterDetail.tsx:76).
  const confirmNewInFlight = useRef(false);

  async function handleConfirmNewUseCase() {
    if (state.step !== 'duplicate_check') return;
    if (confirmNewInFlight.current) return;
    confirmNewInFlight.current = true;
    try {

    // UC-2 / TC-UC-2-03. Dismissing a surfaced match is a decision about the
    // inventory, and it was invisible: nothing recorded that a near-match had
    // been reviewed and set aside, so nobody could afterwards distinguish a
    // genuinely new use case from a duplicate waved through. Written against
    // the CANDIDATE's trail, because that is the record a later reader is
    // looking at when they ask why there are two of these.
    if (duplicateMatch) {
      const candidate = duplicateMatch;
      await appendAuditEvent({
        event_id: crypto.randomUUID(),
        use_case_id: candidate.id,
        event_type: 'duplicate_dismissed',
        occurred_at: new Date().toISOString(),
        actor: getRole(),
        payload: {
          type: 'duplicate_dismissed',
          candidate_use_case_id: candidate.id,
          candidate_label: candidate.label,
        },
      });
    }

    // The LLM intake path exists if EITHER extractor is configured — the
    // Anthropic key or a local open model. Which one runs is decided inside
    // extractGraph (key wins); this flag only picks the intake route.
    const hasLlm = getApiKey() !== null || localLlmEnabled();
    dispatch({ type: 'NO_DUPLICATE_FOUND', method: hasLlm ? 'llm' : 'form' });

    if (!hasLlm) {
      // P4-C02: structured-form fallback (UC-3a) rendered in graph_extraction.
      return;
    }

    const extraction = await extractGraph(state.description);
    if (!extraction.ok) {
      setExtractionError(`Graph extraction failed: ${extraction.error.kind}`);
      return;
    }
    {
      const parted = partitionJurisdictions(extraction.value);
      dispatch({ type: 'GRAPH_EXTRACTED', graph: parted.graph, useCaseId: crypto.randomUUID(), ignoredJurisdictions: parted.ignored });
    }
    } finally {
      confirmNewInFlight.current = false;
    }
  }

  // UC-2 / TC-UC-2-02. The other half of the duplicate decision. Adopting
  // creates a record whose classification came from somewhere else — so it
  // carries the source's tier and track, and deliberately NO verdict of its
  // own, because nothing was evaluated for it. The sign-off page already
  // states that plainly (register-lifecycle.md §15.2: "no verdict is
  // recorded"), which is the honest reading: a reviewer must see that this
  // classification was inherited, not derived.
  const adoptInFlight = useRef(false);

  async function handleAdoptClassification() {
    if (state.step !== 'duplicate_check' || !duplicateMatch) return;
    // The audit trail is append-only; a double-click cannot be cleaned up
    // afterwards (same guard as the 2LoD actions, RegisterDetail.tsx:76).
    if (adoptInFlight.current) return;
    adoptInFlight.current = true;

    try {
      const source = duplicateMatch;
      const useCaseId = crypto.randomUUID();
      const now = new Date().toISOString();

      await addNode({
        node_id: useCaseId,
        node_type: 'use_case',
        label: state.description.slice(0, 80),
        created_at: now,
        metadata: {
          node_type: 'use_case',
          description: state.description,
          submitted_by: getRole(),
          lifecycle_stage: 'pre_checked',
          current_verdict_id: null,
          tier: source.tier,
          track: source.track,
        },
      });

      await appendAuditEvent({
        event_id: crypto.randomUUID(),
        use_case_id: useCaseId,
        event_type: 'use_case_created',
        occurred_at: now,
        actor: getRole(),
        payload: { type: 'use_case_created', description: state.description, intake_method: 'structured_form' },
      });

      await appendAuditEvent({
        event_id: crypto.randomUUID(),
        use_case_id: useCaseId,
        event_type: 'classification_adopted',
        occurred_at: now,
        actor: getRole(),
        payload: {
          type: 'classification_adopted',
          adopted_from_use_case_id: source.id,
          adopted_from_label: source.label,
          tier: source.tier,
          track: source.track,
        },
      });

      setAdoptedFrom(source.label);
    } finally {
      adoptInFlight.current = false;
    }
  }

  // R5-GX-1 (ADR-IF-R5-2). The extractor is schema-bound for every
  // classified field EXCEPT jurisdictions (free strings by design — the
  // known set is policy-scoped, not canonical). The live model returned
  // "Internal" as a jurisdiction on its second real run; unrecognised
  // values are removed here, before the human sees the graph, and surfaced
  // on the review screen so the removal is never a silent edit.
  function partitionJurisdictions(graph: DataFlowGraph): { graph: DataFlowGraph; ignored: string[] } {
    if (!policyResult.valid) return { graph, ignored: [] };
    const known = new Set(policyResult.policy.jurisdictions.map((j) => j.code));
    const ignored = graph.jurisdictions.filter((j) => !known.has(j));
    if (ignored.length === 0) return { graph, ignored };
    return { graph: { ...graph, jurisdictions: graph.jurisdictions.filter((j) => known.has(j)) }, ignored };
  }

  // Code review round 3, Panel C. The only exit from a failed extraction.
  async function handleRetryExtraction() {
    if (state.step !== 'graph_extraction') return;
    setExtractionError(null);
    const extraction = await extractGraph(state.description);
    if (!extraction.ok) {
      setExtractionError(`Graph extraction failed: ${extraction.error.kind}`);
      return;
    }
    {
      const parted = partitionJurisdictions(extraction.value);
      dispatch({ type: 'GRAPH_EXTRACTED', graph: parted.graph, useCaseId: crypto.randomUUID(), ignoredJurisdictions: parted.ignored });
    }
  }

  function handleCorrectNode(nodeId: string, field: string, correctedValue: unknown) {
    if (state.step !== 'graph_review') return;
    const graph = state.graph;
    const allNodes = [...graph.input_nodes, ...graph.processing_nodes, ...graph.output_nodes];
    const node = allNodes.find((n) => n.id === nodeId) as Record<string, unknown> | undefined;
    if (!node) return;
    const originalValue = node[field];

    const updatedGraph = {
      ...graph,
      version: graph.version + 1,
      input_nodes: graph.input_nodes.map((n) => (n.id === nodeId ? { ...n, [field]: correctedValue } : n)),
      processing_nodes: graph.processing_nodes.map((n) =>
        n.id === nodeId ? { ...n, [field]: correctedValue } : n,
      ),
      output_nodes: graph.output_nodes.map((n) => (n.id === nodeId ? { ...n, [field]: correctedValue } : n)),
    };

    const correction: GraphCorrection = {
      correction_id: crypto.randomUUID(),
      graph_version_before: graph.version,
      graph_version_after: updatedGraph.version,
      node_id: nodeId,
      field,
      original_value: originalValue,
      corrected_value: correctedValue,
      corrected_by: getRole(),
      corrected_at: new Date().toISOString(),
    };

    dispatch({ type: 'CORRECTION_APPLIED', correction, updatedGraph });
  }

  function handleProceedFromGraphReview() {
    if (state.step !== 'graph_review') return;
    // R5-GR-2. Refuse with a message, not a silently disabled button — the
    // reducer refuses too (QUESTIONS_GENERATED guard), this is the layer
    // that explains. Counts, not names: the unconfirmed cards are already
    // visually marked.
    if (state.unconfirmedNodeIds && state.unconfirmedNodeIds.length > 0) {
      const n = state.unconfirmedNodeIds.length;
      setReviewGateError(
        `${n} card${n === 1 ? '' : 's'} still need${n === 1 ? 's' : ''} your confirmation. The model proposed these values from your description — nothing is scored until a person has confirmed or corrected each card.`,
      );
      return;
    }
    setReviewGateError(null);
    if (!policyResult.valid) {
      throw new Error(
        `Policy invalid: ${policyResult.errors.map((e) => `${e.field}: ${e.reason}`).join('; ')}`,
      );
    }
    const questions = generateQuestions(state.graph, policyResult.policy, []);
    dispatch({ type: 'QUESTIONS_GENERATED', questions });
    // UC-6 requires an explicit human confirmation click even with zero
    // questions (P4-C04) — no more silent auto-evaluation.
    if (questions.length === 0) {
      // UC-5, found by user-walking the product (2026-08-15): detection ran
      // only inside handleAnswerSubmitted, so the guided form — which marks
      // nothing uncertain and therefore generates zero questions — skipped
      // the questionnaire AND the contradiction check with it. "No client
      // data at all" in the description plus Client PII in the form reached
      // attestation unchallenged. The check must gate the SKIP, not just the
      // answers. Both dispatches below are processed in order: the state is
      // `questionnaire` by the time CONTRADICTIONS_DETECTED lands, which is
      // the step the reducer requires.
      const contradictions = detectContradictions(
        'description' in state ? state.description : submittedDescription,
        [],
        state.graph,
      );
      if (contradictions.length > 0) {
        dispatch({ type: 'CONTRADICTIONS_DETECTED', contradictions });
        return;
      }
      dispatch({ type: 'PROCEED_TO_CONFIRMATION' });
    }
  }

  // explore-001 D-001 (Critical). The step check below is necessary but NOT
  // sufficient: dispatch() is asynchronous, so two synchronous clicks both
  // read the same render's closure, both observe step === 'confirmation',
  // and both write to the append-only audit trail. Those duplicate events
  // cannot be removed afterwards, by design.
  //
  // A ref is the fix rather than state because it updates synchronously —
  // the second click sees the flag before React has re-rendered. Same
  // pattern as RegisterDetail's 2LoD action guard and the seed function's
  // in-flight promise (code review C-5).
  const confirmInFlight = useRef(false);

  useEffect(() => {
    // The draft is UI convenience only — never the audit trail, which is
    // written exclusively through appendAuditEvent.
    if (state.step === 'verdict') clearDraft();
    else saveDraft(state);
  }, [state]);

  async function handleConfirmAndEvaluate(reviewerNote?: string) {
    if (state.step !== 'confirmation') return;
    if (confirmInFlight.current) return;
    confirmInFlight.current = true;

    const { graph, corrections, useCaseId, originalVerdictId } = state;
    // The confirmation step's state shape does not carry resolutionNotes —
    // they live on questionnaire/contradiction_review. By CONFIRMED time the
    // reducer has already folded them forward? It has NOT: confirmation's
    // shape drops them. Read from the questionnaire leg via the narrowing the
    // union allows; [] when the shape lacks them.
    const resolutions: string[] =
      'resolutionNotes' in state && Array.isArray(state.resolutionNotes) ? state.resolutionNotes : [];
    dispatch({ type: 'CONFIRMED' });
    setEvaluationError(null);

    try {
      await runConfirmAndEvaluate(
        graph,
        corrections,
        useCaseId,
        originalVerdictId,
        reviewerNote,
        resolutions,
        'description' in state ? state.description : undefined,
      );
    } catch (err) {
      // A legitimate engine/policy failure (e.g. no-track-match) must not
      // leave the UI stuck on "Evaluating..." forever with no message
      // (P5-C01 review-flagged gap, fixed here).
      setEvaluationError(err instanceof Error ? err.message : String(err));
      dispatch({ type: 'EVALUATION_FAILED' });
      // Released only on failure: a genuine engine error returns the user to
      // graph_review and they must be able to retry. On success the flow
      // leaves the confirmation step entirely, so the guard stays set.
      confirmInFlight.current = false;
    }
  }

  async function runConfirmAndEvaluate(
    graph: DataFlowGraph,
    corrections: GraphCorrection[],
    useCaseId: string,
    originalVerdictId: string | undefined,
    reviewerNote?: string,
    contradictionResolutions: string[] = [],
    typedDescription?: string,
  ) {
    // VD-3 (verdict-audit.md §6): a correction pass writes
    // graph_corrected/verdict_corrected instead of
    // graph_confirmed/verdict_produced — the original verdict_produced
    // event is never modified (append-only, per-event UUIDs).
    const isCorrection = Boolean(originalVerdictId);

    if (isCorrection) {
      // BC-P5C01-02: one graph_corrected event per individual
      // GraphCorrection, matching the spec's singular payload shape.
      for (const correction of corrections) {
        await appendAuditEvent({
          event_id: crypto.randomUUID(),
          use_case_id: useCaseId,
          event_type: 'graph_corrected',
          occurred_at: new Date().toISOString(),
          actor: getRole(),
          payload: { type: 'graph_corrected', correction },
        });
      }
    } else {
      // UC-6 (intake-flow.md §9): graph_confirmed written BEFORE evaluate()
      // runs, verdict_produced written before the UI transitions to verdict
      // (BC-P4C04-02: sequential, not Promise.all).
      await appendAuditEvent({
        event_id: crypto.randomUUID(),
        use_case_id: useCaseId,
        event_type: 'graph_confirmed',
        occurred_at: new Date().toISOString(),
        actor: getRole(),
        payload: {
          type: 'graph_confirmed',
          graph_id: graph.id,
          graph_version: graph.version,
          corrections_count: corrections.length,
          // Spread-if-present, not `submitter_note: reviewerNote` — the audit
          // trail is append-only and permanent, and a record carrying
          // `submitter_note: undefined` serialises as a field somebody could
          // later mistake for a deliberately blank note.
          ...(reviewerNote ? { submitter_note: reviewerNote } : {}),
          ...(contradictionResolutions.length > 0 ? { contradiction_resolutions: contradictionResolutions } : {}),
        },
      });
    }

    if (!policyResult.valid) {
      throw new Error(
        `Policy invalid: ${policyResult.errors.map((e) => `${e.field}: ${e.reason}`).join('; ')}`,
      );
    }
    // §6.1: the engine evaluates the corrected graph as a fresh call —
    // there is no "partial re-evaluation".
    const evalResult = evaluate(graph, policyResult.policy, loadedPacks);
    if (!evalResult.ok) {
      throw new Error(`Evaluation failed: ${evalResult.error.kind}`);
    }
    const result = evalResult.value;

    const now = new Date().toISOString();
    const fullVerdict: Verdict = {
      ...result,
      id: crypto.randomUUID(),
      use_case_id: useCaseId,
      living_status: 'approved',
      living_status_updated_at: now,
      attested_by: getRole(),
      attested_at: now,
      graph_version: graph.version,
      corrections: [],
    };
    setVerdict(fullVerdict);
    setLastGraph(graph);

    // VD-8 (verdict-audit.md §7) — best-effort: a trace failure (no key,
    // network error) must not block verdict storage (BC-P5C02-01).
    // reasoning_trace: undefined is a valid, spec-mandated outcome.
    const controlLibrary = policyResult.valid ? policyResult.policy.controls : [];
    const bindingDescription =
      findRuleDescription(policyResult.valid ? policyResult.policy : undefined, fullVerdict.binding_constraint) ?? '';
    const traceResult = await generateReasoningTraceForVerdict(fullVerdict, controlLibrary, bindingDescription);
    const reasoningTrace = traceResult.ok ? traceResult.value : undefined;

    if (isCorrection) {
      await appendAuditEvent({
        event_id: crypto.randomUUID(),
        use_case_id: useCaseId,
        event_type: 'verdict_corrected',
        occurred_at: now,
        actor: 'system',
        payload: {
          type: 'verdict_corrected',
          original_verdict_id: originalVerdictId!,
          new_verdict: fullVerdict,
          reasoning_trace: reasoningTrace,
        },
      });
    } else {
      await appendAuditEvent({
        event_id: crypto.randomUUID(),
        use_case_id: useCaseId,
        event_type: 'verdict_produced',
        occurred_at: now,
        actor: 'system',
        payload: { type: 'verdict_produced', verdict: fullVerdict, reasoning_trace: reasoningTrace },
      });
    }

    // P6-C02 (register-lifecycle.md §7): route the verdict's tier to a
    // real governance stage instead of a hardcoded 'idea'.
    const routedWorkflow = policyResult.valid ? routeToWorkflow(result.tier, policyResult.policy) : undefined;
    setSavedStage(routedWorkflow?.lifecycle_stage ?? null);

    if (isCorrection) {
      // register_nodes uses db.add() in addNode() — a correction reuses
      // the existing useCaseId, so calling addNode() again would throw a
      // duplicate-key ConstraintError. Update the existing node instead.
      await updateUseCaseVerdictSummary(useCaseId, {
        tier: result.tier,
        track: result.track,
        currentVerdictId: fullVerdict.id,
      });
      // §6: "Pre-checked → Pre-checked (correction + re-evaluation)" — a
      // real, audited lifecycle_stage_changed transition, but only when
      // the routed stage actually changes (a same-stage re-evaluation
      // must not emit a no-op audit event).
      if (routedWorkflow) {
        const existing = await getUseCase(useCaseId);
        if (existing && existing.lifecycle_stage !== routedWorkflow.lifecycle_stage) {
          await updateLifecycleStage(useCaseId, routedWorkflow.lifecycle_stage, getRole());
        }
      }
    } else {
      // The register node doesn't exist until this first confirm+verdict
      // cycle (established since P4-C01/P5-C01) — the unobservable
      // Idea/Exploring states are skipped; the node is created directly
      // at its routed stage (build/prompts/P6-C02.md deviation #4).
      await addNode({
        node_id: useCaseId,
        node_type: 'use_case',
        // D-004 (charter 004): this took the INPUT node's label, which the
        // guided form builds as "<use case name> — input"
        // (build-graph-from-form.ts:51). Every form-submitted use case
        // therefore sat in the register, and on the 2LoD sign-off page, under
        // the name of the data feeding it. The register lists AI systems, so
        // the processing node — the system itself — is the right name; the
        // form sets that label to the use case name exactly
        // (build-graph-from-form.ts:59). Input remains the fallback for a
        // graph with no processing node, which the engine would reject
        // anyway.
        label: graph.processing_nodes[0]?.label ?? graph.input_nodes[0]?.label ?? 'AI use case',
        created_at: now,
        metadata: {
          node_type: 'use_case',
          description: typedDescription,
          submitted_by: getRole(),
          lifecycle_stage: routedWorkflow?.lifecycle_stage ?? 'idea',
          current_verdict_id: fullVerdict.id,
          tier: result.tier,
          track: result.track,
        },
      });
    }
    await refreshRegister();
    setVerdictAuditEvents(await getAuditEvents(useCaseId));
    dispatch({ type: 'VERDICT_READY' });
  }

  function handleCorrectVerdict() {
    if (state.step !== 'verdict' || !verdict || !lastGraph) return;
    // Re-entering the flow for a correction pass means confirmation will be
    // reached again, so the D-001 guard must be released. Missing this made
    // the correction path silently un-confirmable — caught by the P5-C01
    // test, which is why that test earns its keep.
    confirmInFlight.current = false;
    dispatch({
      type: 'CORRECT_VERDICT',
      graph: lastGraph,
      useCaseId: verdict.use_case_id,
      originalVerdictId: verdict.id,
    });
  }

  function handleAnswerSubmitted(questionId: string, value: unknown) {
    if (state.step !== 'questionnaire') return;
    const answer = { questionId, value };
    const nextAnswers = [...state.answers, answer];
    dispatch({ type: 'ANSWER_SUBMITTED', answer });

    // O-001 (charter 005): this read `submittedDescription`, a useState written
    // only inside handleSubmitDescription. A restored draft never re-ran that,
    // so a resumed questionnaire checked answers against an EMPTY STRING and
    // quietly found no contradictions — degrading silently rather than
    // failing. The description now travels on the reducer state, which the
    // draft envelope persists.
    const contradictions = detectContradictions(
      'description' in state ? state.description : submittedDescription,
      nextAnswers,
      state.graph,
    );
    if (contradictions.length > 0) {
      dispatch({ type: 'CONTRADICTIONS_DETECTED', contradictions });
      return;
    }

    if (nextAnswers.length >= state.questions.length) {
      dispatch({ type: 'PROCEED_TO_CONFIRMATION' });
    }
  }

  function handleContradictionResolved(explanation: string) {
    dispatch({ type: 'CONTRADICTION_RESOLVED', explanation });
    // Found by walking the product (2026-08-15): resolution returns to the
    // questionnaire, but when every question is already answered — always
    // true on the zero-questions path, and true whenever the contradiction
    // fired on the FINAL answer — nothing ever dispatched the next step. The
    // screen read "All questions answered." over no forward control: a dead
    // end. Both dispatches process in order, so the reducer is back on
    // `questionnaire` before PROCEED_TO_CONFIRMATION lands.
    if (state.step === 'contradiction_review' && state.answers.length >= state.questions.length) {
      dispatch({ type: 'PROCEED_TO_CONFIRMATION' });
    }
  }

  return (
    <div className="intake-flow">
      <div className="intake-flow__title-row">
        <h1>New pre-check</h1>
      </div>
      <p className="intake-flow__subtitle">
        Describe the AI use case in plain language. The engine reads what it can, asks only what it must,
        and returns a defensible verdict.
      </p>

      {showResumed && state.step !== 'description_entry' && (
        <div className="intake-flow__resumed" role="status">
          <strong>Picked up where you left off.</strong> Your unfinished pre-check was restored — you were
          part-way through, and refreshing or navigating away no longer loses it.
          <button type="button" onClick={handleStartOver}>
            Start over instead
          </button>
        </div>
      )}

      <StepTracker current={state.step} onBack={canStepBack ? handleStepBack : undefined} />

      <div className="card">
        {/* FN-006. Rendered once, above the step content, rather than per
            screen — a back control that moves around is a back control people
            stop looking for. Absent past `questionnaire` because confirmation
            is an attestation and one-way by design. */}
        {canStepBack && (
          <button type="button" className="step-back" onClick={handleStepBack}>
            ← Back
          </button>
        )}

        {state.step === 'description_entry' && (
          <div>
            <label htmlFor="description-input">Describe your AI use case</label>
            <textarea
              id="description-input"
              value={state.description}
              onChange={(e) => dispatch({ type: 'DESCRIPTION_CHANGED', description: e.target.value })}
              placeholder="What does this AI tool do? What data does it touch, and what does it decide or action?"
            />
            <button type="button" onClick={handleSubmitDescription} disabled={!state.description.trim()}>
              Read &amp; extract →
            </button>
          </div>
        )}

        {state.step === 'duplicate_check' && adoptedFrom && (
          <section aria-label="Classification adopted" className="dup-gate">
            <div className="questionnaire__tag">UC-2 · CLASSIFICATION ADOPTED</div>
            <p>
              <strong>Classification adopted from {adoptedFrom}.</strong> This use case is on the
              register with that tier and track, and no intake questions were asked.
            </p>
            <p className="dup-gate__clear">
              Nothing was evaluated for this record, so it carries no verdict of its own — its
              sign-off page says so, and the audit trail records where the classification came from.
              If the two use cases turn out to differ, run a fresh pre-check rather than editing this
              one.
            </p>
          </section>
        )}

        {state.step === 'duplicate_check' && !adoptedFrom && (
          <section aria-label="Duplicate check" className="dup-gate">
            <div className="questionnaire__tag">UC-2 · DUPLICATE CHECK</div>
            {!duplicateCheckDone ? (
              <p>Checking the existing inventory for similar use cases…</p>
            ) : (
              <>
                {duplicateMatch ? (
                  <div className="duplicate-card" role="alert">
                    <p className="duplicate-card__title">One similar use case exists in the register</p>
                    {getRole() === '2LoD' ? (
                      <p>
                        Overlapping use case: <strong>{duplicateMatch.label}</strong>
                        {duplicateMatch.tier ? ` — tier ${duplicateMatch.tier}` : ''}. Consider adopting its
                        classification, or confirm this one is genuinely new.
                      </p>
                    ) : (
                      <p>
                        A use case with overlapping characteristics
                        {duplicateMatch.tier ? ` — tier ${duplicateMatch.tier} —` : ''} is already on record. Full
                        detail is visible to the 2nd Line of Defence. Contact AI Risk to adopt its classification,
                        or confirm yours is genuinely new.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="dup-gate__clear">
                    No similar use case found — checked {registerRows.length} register{' '}
                    {registerRows.length === 1 ? 'entry' : 'entries'} for overlapping characteristics.
                  </p>
                )}
                <div className="dup-gate__actions">
                  {/* UC-2: both decisions, side by side. Only "new use case"
                      existed, so the requirement's other half — adopt — was
                      unreachable and the fit criterion unmet. Adopt appears
                      only when there IS a match to adopt from. */}
                  {duplicateMatch && (
                    <button type="button" onClick={() => void handleAdoptClassification()}>
                      Adopt this classification
                    </button>
                  )}
                  <button type="button" onClick={() => void handleConfirmNewUseCase()}>
                    This is a new use case →
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {state.step === 'graph_extraction' && state.method === 'llm' && (
          <div>
            {/* Code review round 3, Panel C. A failed extraction left this
                screen reading "Extracting graph…" forever: no retry, no way
                back, and a reload restored the same stuck step. The error was
                shown under a label still claiming work was in progress. */}
            {extractionError ? (
              <>
                <p role="alert">{extractionError}</p>
                <p className="field-help">
                  Nothing was recorded. You can try the extraction again, or describe the use case
                  again from the start — the guided form is always available without an API key.
                </p>
                <div className="dup-gate__actions">
                  <button type="button" onClick={() => void handleRetryExtraction()}>
                    Try extraction again
                  </button>
                  <button type="button" onClick={handleStartOver}>
                    Start over
                  </button>
                </div>
              </>
            ) : (
              <p>Extracting graph…</p>
            )}
          </div>
        )}

        {state.step === 'graph_extraction' && state.method === 'form' && (
          <StructuredForm
            jurisdictions={policyResult.valid ? policyResult.policy.jurisdictions : []}
            platforms={policyResult.valid ? policyResult.policy.platforms ?? [] : []}
            vendors={policyResult.valid ? policyResult.policy.vendors ?? [] : []}
            onSubmit={(graph) => dispatch({ type: 'GRAPH_EXTRACTED', graph, useCaseId: crypto.randomUUID() })}
          />
        )}

        {state.step === 'graph_review' && (
          <section>
            <h2>Review extracted graph</h2>
            {/* D-001 (charter 004): the description was captured, used for
                extraction, and never shown again — so the user was asked to
                confirm a graph against a description they could no longer
                see. Rendered as plain text; it is user input. */}
            {state.description && (
              <div className="intake-flow__submitted-description">
                <p className="intake-flow__submitted-label">What you told us</p>
                <p>{state.description}</p>
              </div>
            )}
            {evaluationError && (
              <p role="alert">Evaluation could not complete: {evaluationError}. Review the graph and try again.</p>
            )}
            {/* V1.1-C01: a real visual data-flow with a real per-field
                correction editor — replaces the flat list whose Edit
                button was a stub that appended " (corrected)" to labels. */}
            <GraphView
              graph={state.graph}
              editable
              onCorrect={handleCorrectNode}
              unconfirmedNodeIds={state.unconfirmedNodeIds}
              onConfirmNode={(nodeId) => {
                setReviewGateError(null);
                dispatch({ type: 'NODE_CONFIRMED', nodeId });
              }}
              warnings={plausibilityWarnings(state.description, state.graph)}
              ignoredJurisdictions={state.ignoredJurisdictions}
            />
            {reviewGateError && (
              <p role="alert" className="intake-flow__gate-error">
                {reviewGateError}
              </p>
            )}
            <button type="button" onClick={handleProceedFromGraphReview}>
              Proceed
            </button>
          </section>
        )}

        {state.step === 'questionnaire' && (
          <QuestionnaireStep
            questions={state.questions}
            answeredCount={state.answers.length}
            {...(policyResult.valid ? getQuestionBudget(state.graph, policyResult.policy) : {})}
            onAnswer={handleAnswerSubmitted}
          />
        )}

        {state.step === 'contradiction_review' && (
          <ContradictionReview contradictions={state.contradictions} onResolve={handleContradictionResolved} />
        )}

        {state.step === 'confirmation' && (
          <ConfirmationStep
            graph={state.graph}
            corrections={state.corrections}
            onConfirm={(note) => void handleConfirmAndEvaluate(note)}
          />
        )}

        {state.step === 'evaluation_pending' && <p>Evaluating…</p>}

        {state.step === 'verdict' && verdict && (
          <VerdictDisplay
            verdict={verdict}
            auditEvents={verdictAuditEvents}
            policy={policyResult.valid ? policyResult.policy : undefined}
            graph={lastGraph ?? undefined}
            registerStage={savedStage ?? undefined}
            onCorrect={handleCorrectVerdict}
          />
        )}
      </div>
    </div>
  );
}
