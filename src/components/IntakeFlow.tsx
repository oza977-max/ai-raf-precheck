import { useEffect, useCallback, useMemo, useReducer, useState, useRef } from 'react';
import { extractGraph } from '../llm/graph-extractor';
import { confirmSemanticDuplicate } from '../llm/duplicate-check';
import { getApiKey } from '../llm/client';
import { localLlmEnabled } from '../llm/local-provider';
import { evaluate } from '../engine/evaluate';
import { findPossibleDuplicates, matchCorpus } from '../engine/duplicate';
import { loadPolicy } from '../store/policy';
import { checkPolicyReferences } from '../store/policy-references';
import { getCurrentPolicyYaml } from '../store/policy-source';
import { loadPacks } from '../store/packs';
import { getPackSources } from '../store/pack-source';
import { selfAssessmentSeeded } from '../seeds/aigate-self-assessment';
import { addNode, addUseCaseModelLink, getUseCase, getUseCases, updateUseCaseVerdictSummary, updateLifecycleStage, findLatestVerdictEvent } from '../store/register';
import { getRole } from '../store/role';
import { routeToWorkflow } from '../engine/workflow-router';
import type { DataFlowGraph, GraphCorrection, PolicyFile } from '../engine/types';
import type { Verdict } from '../types/verdict';
import type { AuditEvent, LifecycleStage, UseCaseSummary } from '../store/types';
import { coerceAnswerValue, generateQuestions, getQuestionBudget, questionsForGuessedFields } from '../engine/question-generator';
import { detectContradictions } from '../engine/contradiction';
import { plausibilityWarnings } from '../engine/plausibility';
import { findPrecedents } from '../engine/precedent';
import type { PrecedentCandidate } from '../engine/precedent';
import SimilarCases from './SimilarCases';
import type { EnrichedPrecedent } from './SimilarCases';
import { matchKnowledgeLens } from '../engine/knowledge-lens';
import { applyReattestExpiry, computeStaleSources } from '../engine/temporal';
import { loadKnowledgeLens } from '../store/knowledge-lens-loader';
import { getCurrentKnowledgeLensYaml } from '../store/knowledge-lens-source';
import KnowledgeLensPanel from './KnowledgeLensPanel';
import { append as appendAuditEvent, getAll as getAuditEvents } from '../store/audit';
import { generateReasoningTraceForVerdict } from '../llm/reasoning-trace';
import { findRuleDescription } from '../engine/find-rule-description';
import { intakeReducer } from './intake-state';
import { saveDraft, loadDraft, clearDraft, clearFormDraft } from './intake-draft';
import type { IntakeState } from './intake-state';
import StructuredForm from './StructuredForm';
import type { Assumption, PlainAnswers } from './plain-copy';
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

export default function IntakeFlow({ newPrecheckNonce = 0 }: { newPrecheckNonce?: number } = {}) {
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

  // "+ New pre-check" while a flow is FINISHED starts a fresh one (known
  // issue since v0.3.2). Only the verdict step resets: an in-progress
  // draft is the user's work, and the resumed-draft banner already offers
  // its own explicit Start over.
  const lastNonce = useRef(newPrecheckNonce);
  useEffect(() => {
    if (newPrecheckNonce === lastNonce.current) return;
    lastNonce.current = newPrecheckNonce;
    if (state.step === 'verdict') handleStartOver();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newPrecheckNonce]);

  function handleStartOver() {
    clearDraft();
    // explore-005 D-002: the guided form keeps its answers under a SECOND
    // key, so clearing the reducer draft alone left the abandoned answers to
    // reappear on the next visit to the form step.
    clearFormDraft();
    setShowResumed(false);
    // The confirm guard is deliberately left set after a SUCCESSFUL
    // confirm (that flow never returns to its confirmation step). A fresh
    // intake must release it, or the next case's "Confirm and evaluate"
    // silently does nothing until a page reload — "+ New pre-check" lands
    // here without remounting this component. Found by the R16-W
    // walkthrough's second submission in one tab.
    confirmInFlight.current = false;
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
  // R16-W W-4 (§1, D-70): derived from the reducer state rather than its
  // own useState — the B+C chunk's `formAssumptions` useState was silently
  // lost on refresh, because the intake draft only ever persists
  // IntakeState. Reading it off `state.assumptions` means the draft's
  // existing persistence covers it for free, and a fresh run naturally has
  // none (RESTART/NO_DUPLICATE_FOUND land on a state shape with no
  // `assumptions` field at all) — no explicit reset needed.
  const formAssumptions: Assumption[] = 'assumptions' in state ? state.assumptions ?? [] : [];
  // R16-W W-4: StructuredForm's own `initialAnswers` prop — present only on
  // a resubmission (CHANGE_ANSWER or the form-path STEP_BACK set it).
  const formInitialAnswers: PlainAnswers | undefined = 'plainAnswers' in state ? state.plainAnswers : undefined;
  // R16-C (§3, UC-12): node ids the LLM path flagged uncertain/guessed,
  // captured while on graph_review (where state.guessedFields lives) and
  // frozen at whatever it was when the user left that step — confirmation
  // has no guessedFields of its own in IntakeState's shape. Naturally []
  // for every form-path run, since the form never sets guessedFields.
  const [uncertainNodeIds, setUncertainNodeIds] = useState<string[]>([]);
  // R8-SC: similar decided cases, enriched with each match's controls read
  // from its own audit trail (3 reads max — the ranked top three only).
  const [precedents, setPrecedents] = useState<EnrichedPrecedent[]>([]);
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
  // R16-B: StructuredForm now takes the whole PolicyFile (it reads
  // platforms/vendors/jurisdictions/approved_models itself). An invalid
  // policy is already a best-effort-only condition elsewhere in this file
  // (handleProceedFromGraphReview throws rather than render a usable
  // screen); this minimal stand-in just keeps the form's own render from
  // crashing on a missing object — every dynamic option list it drives
  // reads as empty, same degraded behaviour the old per-field props had.
  const EMPTY_POLICY_FALLBACK: PolicyFile = {
    version: '0',
    policy_id: 'INVALID',
    firm_name: '[FIRM]',
    translation_attestation: { attested_by: '', role: '', date: '', raf_version_checked: '' },
    hard_lines: [],
    tracks: [],
    tiers: [],
    invariants: [],
    controls: [],
    kri_thresholds: {},
    jurisdictions: [],
    roles: {},
    tier_workflow: { Critical: 'self-service', High: 'self-service', Medium: 'self-service', Low: 'self-service' },
    safety_margin: 0,
  };
  // V2-A: jurisdiction packs — bundled files, parsed once. Invalid packs
  // are dropped by the loader (whole-pack rejection, CF-5/RA-7) and shown
  // on the Appetite screen; evaluation proceeds with the valid ones.
  const loadedPacks = useMemo(() => loadPacks(getPackSources()).packs, []);
  // R11-KL-1: parsed once, entirely separate from policy/packs — this is
  // advisory-only and never touched by evaluate().
  const knowledgeLensResult = useMemo(() => loadKnowledgeLens(getCurrentKnowledgeLensYaml()), []);
  const knowledgeLensEntries = useMemo(
    () => (knowledgeLensResult.valid ? knowledgeLensResult.entries : []),
    [knowledgeLensResult],
  );
  // R12-ST-3: the file's own curation header, threaded through as a prop so
  // KnowledgeLensPanel can render "curated by … · review owner …" and an
  // age warning — absent on a legacy/invalid file, which the panel treats
  // the same as "no meta to show".
  const knowledgeLensMeta = knowledgeLensResult.valid ? knowledgeLensResult.meta : undefined;
  // R11-KL-2: the rule ids THIS verdict actually relied on, read from its
  // own explanation — same derivation RegisterDetail.tsx's
  // `challengeableRules` uses, so "covered" means the same thing in both
  // places.
  const verdictRuleIds = useMemo(() => {
    if (!verdict) return [];
    const ids = new Set<string>();
    const ex = verdict.explanation;
    if (ex) {
      if (ex.tier_rationale?.rule_id) ids.add(ex.tier_rationale.rule_id);
      if (ex.track_rationale?.rule_id) ids.add(ex.track_rationale.rule_id);
      for (const t of ex.tripped_invariants) ids.add(t.id);
      for (const r of ex.regulatory_chain ?? []) ids.add(r.rule_id);
    }
    if (verdict.binding_constraint) ids.add(verdict.binding_constraint);
    return [...ids];
  }, [verdict]);
  const knowledgeLensMatches = useMemo(() => {
    if (!verdict || !lastGraph) return [];
    return matchKnowledgeLens(lastGraph, knowledgeLensEntries, verdictRuleIds);
  }, [verdict, lastGraph, knowledgeLensEntries, verdictRuleIds]);

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
  // code-review-004 F17: fresh ref — must reset independently of the others.
  const retryExtractionInFlight = useRef(false);
  // R16-W W-3/W-4 (§1): the form's own Continue click writes use_case_created
  // on a FIRST submission (never on a resubmission — see "one use case, one
  // creation event" below) — same append-only-trail guard class as every
  // other audit-writing handler in this file.
  const formSubmitInFlight = useRef(false);

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
      const parted = partitionJurisdictions(extraction.value.graph);
      dispatch({
        type: 'GRAPH_EXTRACTED',
        graph: parted.graph,
        useCaseId: crypto.randomUUID(),
        ignoredJurisdictions: parted.ignored,
        provenance: extraction.value.provenance,
        guessedFields: extraction.value.guessed,
      });
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
    // Sweep-001: models sometimes emit empty-string jurisdictions. Nothing
    // was claimed, so nothing is reported — dropped silently, unlike real
    // unrecognised values which stay visible.
    const claimed = graph.jurisdictions.filter((j) => j.trim() !== '');
    const ignored = claimed.filter((j) => !known.has(j));
    if (ignored.length === 0 && claimed.length === graph.jurisdictions.length) return { graph, ignored };
    return { graph: { ...graph, jurisdictions: claimed.filter((j) => known.has(j)) }, ignored };
  }

  // Code review round 3, Panel C. The only exit from a failed extraction.
  // code-review-004 F17: guarded like every sibling handler — this was the
  // one async handler without an in-flight ref, so a fast double-click
  // fired two concurrent extractGraph() calls racing to dispatch, each with
  // its own fresh useCaseId; last-to-resolve silently won.
  async function handleRetryExtraction() {
    if (state.step !== 'graph_extraction') return;
    if (retryExtractionInFlight.current) return;
    retryExtractionInFlight.current = true;
    try {
      setExtractionError(null);
      const extraction = await extractGraph(state.description);
      if (!extraction.ok) {
        setExtractionError(`Graph extraction failed: ${extraction.error.kind}`);
        return;
      }
      const parted = partitionJurisdictions(extraction.value.graph);
      dispatch({
        type: 'GRAPH_EXTRACTED',
        graph: parted.graph,
        useCaseId: crypto.randomUUID(),
        ignoredJurisdictions: parted.ignored,
        provenance: extraction.value.provenance,
        guessedFields: extraction.value.guessed,
      });
    } finally {
      retryExtractionInFlight.current = false;
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
    // R7-JC-2: jurisdictions select which REGULATIONS evaluate — they are
    // never left model-asserted.
    if (state.jurisdictionsConfirmed === false) {
      setReviewGateError(
        'Confirm the jurisdictions before proceeding. They decide which regulatory rule packs evaluate this use case, so the model\u2019s reading is never accepted on its own.',
      );
      return;
    }
    setReviewGateError(null);
    if (!policyResult.valid) {
      throw new Error(
        `Policy invalid: ${policyResult.errors.map((e) => `${e.field}: ${e.reason}`).join('; ')}`,
      );
    }
    // R16-A1 (§1.4, CF-5): a reference error (e.g. a covers_reviews id that
    // doesn't resolve) is surfaced through the gentler reviewGateError path,
    // not a thrown exception — unlike a malformed policy file, this is an
    // expected-to-happen-during-editing condition, and the submitter should
    // see why evaluation stopped rather than the app breaking.
    const referenceCheck = checkPolicyReferences(policyResult.policy, loadedPacks);
    if (referenceCheck.errors.length > 0) {
      setReviewGateError(
        `Policy file invalid — ${referenceCheck.errors.join(' ')} Evaluation is disabled until this is resolved.`,
      );
      return;
    }
    // R6-QN-1: guessed-field questions ride with the budget-driven ones,
    // deduplicated by id (a field can be both uncertain-budgeted and
    // guessed; one question is enough).
    const budgeted = generateQuestions(state.graph, policyResult.policy, []);
    const forGuessed = questionsForGuessedFields(state.guessedFields ?? {}, state.graph);
    const seenIds = new Set(budgeted.map((q) => q.id));
    const questions = [...budgeted, ...forGuessed.filter((q) => !seenIds.has(q.id))];
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

  // R16-W W-3/W-4 (§1, D-69/D-70). The form's own Continue — replaces the
  // old GRAPH_EXTRACTED dispatch that routed every form submission through
  // graph_review, which is engine vocabulary a path where the person typed
  // every value themselves has no business showing (principle 1). Mirrors
  // handleProceedFromGraphReview's reference-check/questions/contradiction
  // logic exactly: a form-built graph clears the identical gates a
  // description-built one does — only the SCREEN it skips differs.
  //
  // Unlike confirmInFlight below, this guard DOES reset in `finally` on
  // every path, including success: a legitimate resubmission (Change an
  // answer, fill in again, Continue) must be able to re-enter this handler
  // a second time for the SAME mounted IntakeFlow, where confirmInFlight's
  // sibling pattern never needs to (that flow leaves confirmation for good
  // on success; CORRECT_VERDICT is its own, explicit re-arm). The
  // double-click race this guard exists for is still closed: a second,
  // near-simultaneous click reads the ref before the first call's
  // `await appendAuditEvent` has resolved, every time.
  async function handleFormSubmitted(graph: DataFlowGraph, assumptions: Assumption[], plainAnswers: PlainAnswers) {
    if (state.step !== 'graph_extraction' || state.method !== 'form') return;
    if (formSubmitInFlight.current) return;
    formSubmitInFlight.current = true;
    try {
      // Both checks run BEFORE the creation write below: stopping on the
      // form after use_case_created was written would leave the next
      // Continue (no useCaseId carried yet) to mint a second, orphaned one.
      if (!policyResult.valid) {
        throw new Error(
          `Policy invalid: ${policyResult.errors.map((e) => `${e.field}: ${e.reason}`).join('; ')}`,
        );
      }
      // Same gentler reviewGateError path as handleProceedFromGraphReview,
      // for the same reason: a reference error is expected-to-happen-
      // during-editing, not a reason to break the app. Stay on the form
      // and show the message — do not dispatch (§1).
      const referenceCheck = checkPolicyReferences(policyResult.policy, loadedPacks);
      if (referenceCheck.errors.length > 0) {
        setReviewGateError(
          `Policy file invalid — ${referenceCheck.errors.join(' ')} Evaluation is disabled until this is resolved.`,
        );
        return;
      }
      setReviewGateError(null);

      // W-1 (R16-W §1, D-67): question 2 starts with the first screen's
      // words, and whatever the person leaves there is THE description
      // from here on — the trail, the contradiction check, the register
      // node and the memo all read it. The first screen's text is only the
      // fallback for an empty answer (question 2 is required, so this is
      // defensive).
      const answeredDescription = typeof plainAnswers['2'] === 'string' ? plainAnswers['2'].trim() : '';
      const description = answeredDescription || state.description;
      setSubmittedDescription(description);

      // "One use case, one creation event" (§1, W-4): a resubmission
      // already minted a useCaseId on the FIRST submission — carried on
      // graph_extraction's own state by CHANGE_ANSWER/the form-path
      // STEP_BACK. Reuse it and skip the write; writing use_case_created
      // again would leave an orphaned creation event on the append-only
      // trail for what is still, to the register, one use case.
      const isResubmission = Boolean(state.useCaseId);
      const useCaseId = state.useCaseId ?? crypto.randomUUID();
      if (!isResubmission) {
        await appendAuditEvent({
          event_id: crypto.randomUUID(),
          use_case_id: useCaseId,
          event_type: 'use_case_created',
          occurred_at: new Date().toISOString(),
          actor: getRole(),
          payload: { type: 'use_case_created', description, intake_method: 'structured_form' },
        });
      }

      // Computed from the graph IN HAND, never from stale state (§1).
      const questions = generateQuestions(graph, policyResult.policy, []);
      const contradictions = detectContradictions(description, [], graph);
      dispatch({
        type: 'FORM_SUBMITTED',
        graph,
        useCaseId,
        description,
        plainAnswers,
        assumptions,
        questions,
        contradictions,
      });
    } finally {
      formSubmitInFlight.current = false;
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

  // R16-C (§3, UC-12): tracks live while the user is on graph_review (where
  // state.guessedFields actually lives) and simply stops updating once they
  // proceed past it — confirmation's own IntakeState shape carries no
  // guessedFields, so this is the only way UnderstoodSummary can still say
  // which nodes were uncertain by the time it renders. Naturally empty for
  // the form path (guessedFields is never set there) and for a correction
  // pass whose graph has no unresolved guesses.
  useEffect(() => {
    if (state.step === 'graph_review') setUncertainNodeIds(Object.keys(state.guessedFields ?? {}));
  }, [state]);

  // R8-SC-1/-3: precedents = decided register entries ranked by the pure
  // engine helper; controls enriched from each match's own trail.
  //
  // R16-W W-3 (§1): also computed on `confirmation` when the graph came
  // from the guided form — that path no longer passes through
  // `graph_review` on the way to confirmation (FORM_SUBMITTED skips it),
  // so if a form-path submitter is ever to see similar decided cases
  // before attesting, this is the only step left to compute them on.
  useEffect(() => {
    const isGraphReview = state.step === 'graph_review';
    const isFormConfirmation = state.step === 'confirmation' && state.graph.intake_method === 'structured_form';
    if (!isGraphReview && !isFormConfirmation) {
      setPrecedents([]);
      return;
    }
    const currentGraph = state.graph;
    const currentDescription = state.description;
    const currentUseCaseId = state.useCaseId;
    let cancelled = false;
    void (async () => {
      const rows = await getUseCases('all');
      const candidates: PrecedentCandidate[] = rows
        .filter((r) => r.current_verdict_status !== null)
        .map((r) => ({
          id: r.use_case_id,
          label: r.label,
          description: r.description,
          status: r.current_verdict_status!,
          tier: r.tier,
          track: r.track,
          decided_at: r.last_evaluated_at,
          policy_version: r.policy_version_at_evaluation,
        }));
      const subjectLabel = currentGraph.input_nodes[0]?.label ?? '';
      const matches = findPrecedents(
        { label: subjectLabel, description: currentDescription },
        candidates,
        currentUseCaseId,
      );
      const enriched: EnrichedPrecedent[] = [];
      for (const m of matches) {
        const events = await getAuditEvents(m.id);
        const payload = findLatestVerdictEvent(events);
        const verdict = payload ? (payload.type === 'verdict_produced' ? payload.verdict : payload.new_verdict) : null;
        enriched.push({ ...m, controls: verdict?.controls ?? [] });
      }
      if (!cancelled) setPrecedents(enriched);
    })();
    return () => {
      cancelled = true;
    };
    // Delta review 005 finding 1: a correction updates the graph while the
    // step stays graph_review (or, now, confirmation) — the version in the
    // dep re-runs the search so the precedent list always reflects the
    // graph on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, state.step === 'graph_review' || state.step === 'confirmation' ? state.graphVersion : -1]);

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
    // R6-CX-1: the contexts typed on question answers, persisted with the
    // attestation. Same evaporation risk the resolutionNotes fix closed —
    // read them out BEFORE the CONFIRMED dispatch drops the shape.
    const answerContexts: string[] =
      'answers' in state ? state.answers.map((a) => a.context).filter((c): c is string => Boolean(c)) : [];
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
        answerContexts,
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
    answerContexts: string[] = [],
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
          ...(answerContexts.length > 0 ? { answer_contexts: answerContexts } : {}),
        },
      });
    }

    if (!policyResult.valid) {
      throw new Error(
        `Policy invalid: ${policyResult.errors.map((e) => `${e.field}: ${e.reason}`).join('; ')}`,
      );
    }
    // R16-A1 (§1.4, CF-5): same reference-error gate as the first evaluation
    // gate above, repeated here because this is the second (description-
    // first / correction-flow) path that reaches evaluate().
    const confirmReferenceCheck = checkPolicyReferences(policyResult.policy, loadedPacks);
    if (confirmReferenceCheck.errors.length > 0) {
      setReviewGateError(
        `Policy file invalid — ${confirmReferenceCheck.errors.join(' ')} Evaluation is disabled until this is resolved.`,
      );
      return;
    }
    // R12-ST-1 (ADR-EE-R12-1): pure pre-transform, run BEFORE evaluate() so
    // an expired family entry is simply unapproved by the time evaluate()
    // sees the policy — "today" is read here at the component layer, never
    // inside engine code.
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const attestablePolicy = applyReattestExpiry(policyResult.policy, today);

    // §6.1: the engine evaluates the corrected graph as a fresh call —
    // there is no "partial re-evaluation".
    const evalResult = evaluate(graph, attestablePolicy, loadedPacks);
    if (!evalResult.ok) {
      throw new Error(`Evaluation failed: ${evalResult.error.kind}`);
    }
    const result = evalResult.value;

    // R12-ST-1: computed alongside evaluate(), never inside it — rides on
    // the Verdict wrapper, keeping TC-PE-1-01's byte-identical guarantee
    // true by construction.
    const staleSources = computeStaleSources(loadedPacks, today);

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
      ...(staleSources.length > 0 ? { stale_sources: staleSources } : {}),
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

    // R11-KL-2/ADR-EE-R11-1: a SECOND, independent call, computed AFTER
    // evaluate() has already returned — never fed into it, never read by
    // it. Riding beside the verdict on the audit event (never inside
    // Verdict/EvaluationResult) is what keeps R11-NF-1 true.
    const verdictRuleIdsForLens = (() => {
      const ids = new Set<string>();
      const ex = fullVerdict.explanation;
      if (ex) {
        if (ex.tier_rationale?.rule_id) ids.add(ex.tier_rationale.rule_id);
        if (ex.track_rationale?.rule_id) ids.add(ex.track_rationale.rule_id);
        for (const t of ex.tripped_invariants) ids.add(t.id);
        for (const r of ex.regulatory_chain ?? []) ids.add(r.rule_id);
      }
      if (fullVerdict.binding_constraint) ids.add(fullVerdict.binding_constraint);
      return [...ids];
    })();
    const knowledgeLensMatchedEntryIds = matchKnowledgeLens(graph, knowledgeLensEntries, verdictRuleIdsForLens).map(
      (m) => m.entry.id,
    );

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
          knowledge_lens_matched_entry_ids: knowledgeLensMatchedEntryIds,
        },
      });
    } else {
      await appendAuditEvent({
        event_id: crypto.randomUUID(),
        use_case_id: useCaseId,
        event_type: 'verdict_produced',
        occurred_at: now,
        actor: 'system',
        payload: {
          type: 'verdict_produced',
          verdict: fullVerdict,
          reasoning_trace: reasoningTrace,
          knowledge_lens_matched_entry_ids: knowledgeLensMatchedEntryIds,
        },
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
      // R11-MG-3 / ADR-RL-R11-1 (register-lifecycle.md §16): the dormant
      // ai_model/uses_model schema, consumed at the same write that already
      // produces the use_case node. Only on first confirmation, not on a
      // correction re-evaluation — a correction reuses useCaseId and would
      // otherwise write a second uses_model edge for the same use case.
      const declaredModelNode = graph.processing_nodes.find((n) => n.declared_model_id);
      if (declaredModelNode && policyResult.valid) {
        await addUseCaseModelLink(useCaseId, declaredModelNode, policyResult.policy);
      }
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

  function handleAnswerSubmitted(questionId: string, value: unknown, context?: string) {
    if (state.step !== 'questionnaire') return;
    // ADR-IF-R6-3. An answer that differs from the graph IS a correction:
    // before this, answers were recorded and contradiction-checked but the
    // engine evaluated the model's original best-guess values regardless —
    // the 10th computed-but-never-consumed instance. The correction goes
    // through the same shape as a graph-screen edit, so it is versioned and
    // written as graph_corrected at attestation.
    const question = state.questions.find((q) => q.id === questionId);
    let correction: GraphCorrection | undefined;
    let updatedGraph: DataFlowGraph | undefined;
    if (question?.node_id && question.field) {
      const applyTo = (nodes: { id: string }[]) =>
        nodes.map((n) =>
          n.id === question.node_id ? { ...n, [question.field]: value } : n,
        );
      const node = [...state.graph.input_nodes, ...state.graph.processing_nodes, ...state.graph.output_nodes].find(
        (n) => n.id === question.node_id,
      ) as Record<string, unknown> | undefined;
      const originalValue = node?.[question.field];
      // v0.7.1 validation gate: a value outside the field's legal set must
      // never reach the graph. Buttons produce legal values by
      // construction; this closes the free-text and future-regression
      // paths (the bug that let "internal team" land in autonomy_level).
      const coerced = coerceAnswerValue(question.field, value);
      if (!coerced.ok) {
        setReviewGateError(`That answer was not recorded: ${coerced.reason}.`);
        return;
      }
      setReviewGateError(null);
      value = coerced.value;
      if (node && originalValue !== value) {
        updatedGraph = {
          ...state.graph,
          version: state.graph.version + 1,
          input_nodes: applyTo(state.graph.input_nodes) as typeof state.graph.input_nodes,
          processing_nodes: applyTo(state.graph.processing_nodes) as typeof state.graph.processing_nodes,
          output_nodes: applyTo(state.graph.output_nodes) as typeof state.graph.output_nodes,
        };
        correction = {
          correction_id: crypto.randomUUID(),
          graph_version_before: state.graph.version,
          graph_version_after: updatedGraph.version,
          node_id: question.node_id,
          field: question.field,
          original_value: originalValue,
          corrected_value: value,
          corrected_at: new Date().toISOString(),
          corrected_by: getRole(),
        };
      }
    }
    const answer = { questionId, value, ...(context ? { context } : {}) };
    const nextAnswers = [...state.answers, answer];
    dispatch({ type: 'ANSWER_SUBMITTED', answer, correction, updatedGraph });

    // O-001 (charter 005): this read `submittedDescription`, a useState written
    // only inside handleSubmitDescription. A restored draft never re-ran that,
    // so a resumed questionnaire checked answers against an EMPTY STRING and
    // quietly found no contradictions — degrading silently rather than
    // failing. The description now travels on the reducer state, which the
    // draft envelope persists.
    const contradictions = detectContradictions(
      'description' in state ? state.description : submittedDescription,
      nextAnswers,
      // R6: check against the graph as answered, not as extracted — an
      // answer that just fixed the contradiction must not re-flag it.
      updatedGraph ?? state.graph,
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
      {/* R16-W §4 (D-74): replaces "Describe the AI use case in plain
          language. The engine reads what it can, asks only what it must,
          and returns a defensible verdict." — engine vocabulary
          ("the engine", "verdict" as a process word) on the very first
          thing a newcomer reads. */}
      <p className="intake-flow__subtitle">
        Tell us about an AI tool you want to use. We&rsquo;ll check it against your firm&rsquo;s rules and
        tell you whether you can go ahead, and what needs doing first.
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
            {/* R16-W §4 (D-74): label/placeholder/button/help all replaced —
                "Describe your AI use case" / "Read & extract →" were the
                tool's own internal-process words ("extract"), not the
                submitter's question. */}
            <label htmlFor="description-input">What AI tool do you want to use, and what will it do for you?</label>
            <textarea
              id="description-input"
              value={state.description}
              onChange={(e) => dispatch({ type: 'DESCRIPTION_CHANGED', description: e.target.value })}
              placeholder='e.g. "Use ChatGPT to turn my client meeting notes into follow-up emails, which I check before sending."'
            />
            <button type="button" onClick={handleSubmitDescription} disabled={!state.description.trim()}>
              Next →
            </button>
            {/* design-review round 4 (Panel G — Intake: Describe, Important):
                the button never said what happens after clicking, or that
                nothing is final yet. */}
            <p className="field-help">
              You can check and change everything before anything is decided — nothing here is final
              yet.
            </p>
          </div>
        )}

        {state.step === 'duplicate_check' && adoptedFrom && (
          <section aria-label="Classification adopted" className="dup-gate">
            {/* NF-11 (design-review round 4, Panel A): "UC-2" was the
                internal requirements-doc ID for this screen, rendered bare
                with no reader-facing purpose. Dropped, not glossed — there
                is nothing here a reader needs the code for.
                R16-W §4 (D-74): tag and both paragraphs replaced — "tier
                and track"/"verdict" were engine vocabulary on a screen a
                newcomer reaches with no questions of their own. */}
            <div className="questionnaire__tag">EARLIER RESULT USED</div>
            <p>
              Earlier result used from {adoptedFrom}. This is on the register with the same risk
              level and review route, and no questions were asked.
            </p>
            <p className="dup-gate__clear">
              Nothing was checked for this record, so it has no result of its own — its sign-off
              page says so, and the record shows where it came from. If the two turn out to differ,
              start a fresh pre-check rather than editing this one.
            </p>
          </section>
        )}

        {state.step === 'duplicate_check' && !adoptedFrom && (
          <section aria-label="Duplicate check" className="dup-gate">
            {/* R16-W §4 (D-74): the no-match and match-found cases are
                treated as two distinct screens with their own copy — the
                match-found screen gets a plain-language TITLE instead of
                the "HAS THIS BEEN CHECKED BEFORE?" tag, which belongs to
                the no-match screen only. */}
            {duplicateCheckDone && duplicateMatch ? (
              <p className="duplicate-card__title">Something similar has been checked before</p>
            ) : (
              <>
                <div className="questionnaire__tag">HAS THIS BEEN CHECKED BEFORE?</div>
                {/* design-review round 4 (Panel G, Important): the screen
                    never said why this check runs. */}
                <p className="field-help">
                  We look for a similar tool your firm has already checked, so similar uses get the
                  same answer.
                </p>
              </>
            )}
            {!duplicateCheckDone ? (
              <p>Looking through earlier checks…</p>
            ) : (
              <>
                {duplicateMatch ? (
                  <div className="duplicate-card" role="alert">
                    {/* BC-V12C-02: the matched label stays redacted for 1LoD
                        — unchanged by this fix. design-review round 4
                        (Panel G — Intake: Duplicate check, Critical #1/#2):
                        what WAS wrong is that the non-2LoD copy said
                        "Contact AI Risk to adopt" while the button right
                        below adopted immediately, with no role check at all
                        — the words and the only clickable thing on the
                        screen disagreed. Fixed by describing what the button
                        actually does, for both roles, instead of claiming a
                        gate that doesn't exist. R16-W §4 (D-74): the 1LoD
                        text now drops the tier entirely (no tier claim on a
                        redacted card); the 2LoD text is unchanged. */}
                    {getRole() === '2LoD' ? (
                      <p>
                        Overlapping use case: <strong>{duplicateMatch.label}</strong>
                        {duplicateMatch.tier ? ` — tier ${duplicateMatch.tier}` : ''}.
                      </p>
                    ) : (
                      <p>A similar use is already on your firm&rsquo;s register. Your AI risk team can see its details.</p>
                    )}
                    <p className="dup-gate__clear">
                      Using the earlier result skips the questions: this goes onto the register with
                      the same risk level and review route as the earlier one, without a check of its
                      own. If the two turn out to differ, start a fresh pre-check rather than editing
                      this one.
                    </p>
                  </div>
                ) : (
                  <p className="dup-gate__clear">
                    Nothing similar found — we looked through {registerRows.length} earlier check
                    {registerRows.length === 1 ? '' : 's'}.
                  </p>
                )}
                <div className="dup-gate__actions">
                  {/* UC-2: both decisions, side by side. Only "new use case"
                      existed, so the requirement's other half — adopt — was
                      unreachable and the fit criterion unmet. Adopt appears
                      only when there IS a match to adopt from. R16-W §4
                      (D-74): both buttons renamed. */}
                  {duplicateMatch && (
                    <button type="button" onClick={() => void handleAdoptClassification()}>
                      Use the earlier result
                    </button>
                  )}
                  <button type="button" onClick={() => void handleConfirmNewUseCase()}>
                    {duplicateMatch ? 'Mine is different — continue →' : 'Continue →'}
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
                  again from the start — the guided form is always available without a model configured.
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
              /* design-review round 4 (Panel G — Intake: Graph review,
                 Critical): "graph" was the operative word in this loading
                 state, the screen title, and the ARIA region label — never
                 defined, right after a screen that promised plain language. */
              <p>Reading your description…</p>
            )}
          </div>
        )}

        {state.step === 'graph_extraction' && state.method === 'form' && (
          <>
            {reviewGateError && (
              <p role="alert" className="intake-flow__gate-error">
                {reviewGateError}
              </p>
            )}
            <StructuredForm
              policy={policyResult.valid ? policyResult.policy : EMPTY_POLICY_FALLBACK}
              initialDescription={state.description}
              initialAnswers={formInitialAnswers}
              onSubmit={(graph, assumptions, plainAnswers) => void handleFormSubmitted(graph, assumptions, plainAnswers)}
            />
          </>
        )}

        {state.step === 'graph_review' && (
          <section>
            {/* design-review round 4 (Panel G, Critical): was "Review
                extracted graph" — system-side vocabulary (what the LLM did)
                where the user's actual goal is "did the system understand
                my use case." */}
            <h2>Confirm what we understood</h2>
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
            {/* R9-SC-1 (ADR-IF-R9-1): the user's remaining obligations,
                aggregated from existing state — the plan the gate error
                used to reveal only on failure. */}
            {(() => {
              const nodeLabel = (id: string) =>
                [...state.graph.input_nodes, ...state.graph.processing_nodes, ...state.graph.output_nodes].find(
                  (n) => n.id === id,
                )?.label ?? id;
              const items: Array<{ key: string; text: string; target: string }> = [];
              for (const [nodeId, fields] of Object.entries(state.guessedFields ?? {})) {
                if (fields.length > 0)
                  items.push({
                    key: `g-${nodeId}`,
                    text: `Fix ${fields.length} guessed value${fields.length === 1 ? '' : 's'} on “${nodeLabel(nodeId)}”`,
                    target: `card-${nodeId}`,
                  });
              }
              for (const nodeId of state.unconfirmedNodeIds ?? []) {
                items.push({ key: `c-${nodeId}`, text: `Confirm “${nodeLabel(nodeId)}”`, target: `card-${nodeId}` });
              }
              if (state.jurisdictionsConfirmed === false) {
                items.push({ key: 'jur', text: 'Confirm jurisdictions', target: 'jurisdictions-panel' });
              }
              if (state.unconfirmedNodeIds === undefined && items.length === 0) return null;
              return (
                <div className="review-checklist" role="note">
                  {items.length === 0 ? (
                    <p className="review-checklist__done">
                      All checked — nothing left to confirm. Proceed when ready.
                    </p>
                  ) : (
                    <>
                      <p className="review-checklist__title">
                        {items.length} step{items.length === 1 ? '' : 's'} before you can proceed:
                      </p>
                      <ul>
                        {items.map((item) => (
                          <li key={item.key}>
                            <button
                              type="button"
                              className="review-checklist__item"
                              onClick={() => document.getElementById(item.target)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                            >
                              {item.text}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              );
            })()}
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
              provenance={state.provenance}
              guessedFields={state.guessedFields}
              ignoredJurisdictions={state.ignoredJurisdictions}
            />
            {/* R7-JC (ADR-IF-R7-1): jurisdictions gate at review. Sweep-001
                found a hallucinated valid code ("US") that would silently
                activate a pack — so the model's reading is explicit, named,
                editable within the policy's declared set, and never accepted
                without a human act. */}
            {state.jurisdictionsConfirmed !== undefined && policyResult.valid && (
              <div className="jurisdictions-panel" id="jurisdictions-panel">
                <h3>Jurisdictions — which regulatory rule packs apply</h3>
                <p className="field-help">
                  {state.graph.jurisdictions.length > 0
                    ? 'Proposed by the model from your description. Confirm or change it — this choice selects the regulatory rules.'
                    : 'The model read no jurisdiction from your description — only the firm\u2019s own appetite rules will apply. Confirm, or pick the regions this use case touches.'}
                </p>
                {policyResult.policy.jurisdictions.map((j) => (
                  <label key={j.code} className="jurisdictions-panel__option">
                    <input
                      type="checkbox"
                      checked={state.graph.jurisdictions.includes(j.code)}
                      disabled={state.jurisdictionsConfirmed}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...state.graph.jurisdictions, j.code]
                          : state.graph.jurisdictions.filter((c) => c !== j.code);
                        const updatedGraph = { ...state.graph, version: state.graph.version + 1, jurisdictions: next };
                        dispatch({
                          type: 'JURISDICTIONS_SET',
                          updatedGraph,
                          correction: {
                            correction_id: crypto.randomUUID(),
                            graph_version_before: state.graph.version,
                            graph_version_after: updatedGraph.version,
                            node_id: 'graph',
                            field: 'jurisdictions',
                            original_value: state.graph.jurisdictions,
                            corrected_value: next,
                            corrected_at: new Date().toISOString(),
                            corrected_by: getRole(),
                          },
                        });
                        setReviewGateError(null);
                      }}
                    />{' '}
                    {j.name} ({j.code})
                  </label>
                ))}
                {!state.jurisdictionsConfirmed ? (
                  <button
                    type="button"
                    className="jurisdictions-panel__confirm"
                    onClick={() => {
                      dispatch({ type: 'JURISDICTIONS_CONFIRMED' });
                      setReviewGateError(null);
                    }}
                  >
                    {state.graph.jurisdictions.length > 0 ? 'These are right — confirm' : 'No jurisdictions — confirm'}
                  </button>
                ) : (
                  <p className="graph-node__confirmed-note">Confirmed by you.</p>
                )}
              </div>
            )}
            {/* R9-SC-4/-5: informational content AFTER required actions,
                collapsed to its count (expand renders the full R8 panel). */}
            {precedents.length > 0 && (
              <details className="similar-cases-collapse">
                <summary>
                  {precedents.length} similar decided case{precedents.length === 1 ? '' : 's'} — show
                </summary>
                <SimilarCases matches={precedents} />
              </details>
            )}
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
          <>
          {reviewGateError && (
            <p role="alert" className="intake-flow__gate-error">
              {reviewGateError}
            </p>
          )}
          <QuestionnaireStep
            questions={state.questions}
            answeredCount={state.answers.length}
            lastAnswer={state.answers[state.answers.length - 1]}
            onUndo={() => dispatch({ type: 'ANSWER_UNDONE' })}
            {...(policyResult.valid ? getQuestionBudget(state.graph, policyResult.policy) : {})}
            onAnswer={handleAnswerSubmitted}
            policy={policyResult.valid ? policyResult.policy : undefined}
          />
          </>
        )}

        {state.step === 'contradiction_review' && (
          <ContradictionReview contradictions={state.contradictions} onResolve={handleContradictionResolved} />
        )}

        {state.step === 'confirmation' && (
          <ConfirmationStep
            graph={state.graph}
            corrections={state.corrections}
            policy={policyResult.valid ? policyResult.policy : undefined}
            assumptions={formAssumptions}
            uncertainNodeIds={uncertainNodeIds}
            precedents={precedents}
            onChangeAnswer={() => dispatch({ type: 'CHANGE_ANSWER' })}
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
            memoLabel={submittedDescription.slice(0, 80) || 'AI use case'}
            memoDescription={submittedDescription}
            knowledgeLensMatches={knowledgeLensMatches}
          />
        )}
        {/* R16-W W-5 (§5, D-75): collapsed by default on the intake verdict
            screen — "Risk-knowledge awareness… curated by project
            maintainer (2LoD practitioner)…" was sitting unfolded on a
            newcomer's FIRST screen, outside the collapsed reviewer section
            (VD-9: everything beyond the nine first-screen items is
            collapsed). RegisterDetail (the reviewer's own page) renders
            this panel unchanged — unaffected by this wrap. */}
        {state.step === 'verdict' && verdict && knowledgeLensMatches.length > 0 && (
          <details className="intake-flow__knowledge-lens-collapse">
            <summary>What outside research says about this kind of AI use (for your AI risk team)</summary>
            <KnowledgeLensPanel
              matches={knowledgeLensMatches}
              meta={knowledgeLensMeta}
              // R13-UI-3: the intake verdict screen has no filing action
              // (that is a reviewer act on the register page), but if a
              // filing already exists on the trail it still shows as Filed.
              filedRiskDomains={verdictAuditEvents
                .filter((e) => e.payload.type === 'rule_dissent_filed')
                .map((e) => (e.payload.type === 'rule_dissent_filed' ? e.payload.rule_id : ''))
                .filter(Boolean)}
            />
          </details>
        )}
      </div>
    </div>
  );
}
