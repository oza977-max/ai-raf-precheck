import { useEffect, useCallback, useMemo, useReducer, useState, useRef } from 'react';
import { extractGraph } from '../llm/graph-extractor';
import { confirmSemanticDuplicate } from '../llm/duplicate-check';
import { getApiKey } from '../llm/client';
import { evaluate } from '../engine/evaluate';
import { findPossibleDuplicates } from '../engine/duplicate';
import { loadPolicy } from '../store/policy';
import { getCurrentPolicyYaml } from '../store/policy-source';
import { loadPacks } from '../store/packs';
import { getPackSources } from '../store/pack-source';
import { addNode, getUseCase, getUseCases, updateUseCaseVerdictSummary, updateLifecycleStage } from '../store/register';
import { getRole } from '../store/role';
import { routeToWorkflow } from '../engine/workflow-router';
import type { DataFlowGraph, GraphCorrection } from '../engine/types';
import type { Verdict } from '../types/verdict';
import type { AuditEvent, LifecycleStage, UseCaseSummary } from '../store/types';
import { generateQuestions, getQuestionBudget } from '../engine/question-generator';
import { detectContradictions } from '../engine/contradiction';
import { append as appendAuditEvent, getAll as getAuditEvents } from '../store/audit';
import { generateReasoningTraceForVerdict } from '../llm/reasoning-trace';
import { findRuleDescription } from '../engine/find-rule-description';
import { intakeReducer } from './intake-state';
import { saveDraft, loadDraft, clearDraft } from './intake-draft';
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
    setShowResumed(false);
    dispatch({ type: 'DESCRIPTION_CHANGED', description: '' });
  }
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [verdictAuditEvents, setVerdictAuditEvents] = useState<AuditEvent[]>([]);
  const [lastGraph, setLastGraph] = useState<DataFlowGraph | null>(null);
  // V1.2-C (UC-2/RG-2 leak fix, design-gap C1): the match is stored with
  // both tier and label, but the LABEL is only ever rendered for 2LoD —
  // 1LoD gets the redacted card (tier + "contact AI Risk").
  const [duplicateMatch, setDuplicateMatch] = useState<{ tier: string | null; label: string } | null>(null);
  const [duplicateCheckDone, setDuplicateCheckDone] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [registerRows, setRegisterRows] = useState<UseCaseSummary[]>([]);
  const [savedStage, setSavedStage] = useState<LifecycleStage | null>(null);
  const [submittedDescription, setSubmittedDescription] = useState('');
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

  const refreshRegister = useCallback(async () => {
    const rows = await getUseCases('all');
    setRegisterRows(rows);
  }, []);

  useEffect(() => {
    void refreshRegister();
  }, [refreshRegister]);

  async function handleSubmitDescription() {
    if (state.step !== 'description_entry') return;
    setSubmittedDescription(state.description);
    dispatch({ type: 'SUBMIT_DESCRIPTION' });
    setDuplicateMatch(null);
    setDuplicateCheckDone(false);

    const candidates = findPossibleDuplicates(
      state.description,
      registerRows.map((r) => ({ id: r.use_case_id, label: r.label })),
    );
    const topCandidate = registerRows.find((r) => r.use_case_id === candidates[0]?.id);
    if (topCandidate && getApiKey()) {
      const confirmed = await confirmSemanticDuplicate(state.description, topCandidate.label);
      if (confirmed) {
        setDuplicateMatch({ tier: topCandidate.tier, label: topCandidate.label });
      }
    } else if (topCandidate) {
      setDuplicateMatch({ tier: topCandidate.tier, label: topCandidate.label });
    }
    // V2-B (user feedback): the duplicate check is now a REAL GATE — the
    // flow stops here and shows the result (match card, or an explicit
    // "checked N entries, none similar"), and only proceeds on the
    // user's "This is a new use case" confirmation. Previously it
    // auto-proceeded past a green tick, making the inventory check
    // invisible (the V1.2-C documented deviation, now user-rejected).
    setDuplicateCheckDone(true);
  }

  async function handleConfirmNewUseCase() {
    if (state.step !== 'duplicate_check') return;
    const hasApiKey = getApiKey() !== null;
    dispatch({ type: 'NO_DUPLICATE_FOUND', method: hasApiKey ? 'llm' : 'form' });

    if (!hasApiKey) {
      // P4-C02: structured-form fallback (UC-3a) rendered in graph_extraction.
      return;
    }

    const extraction = await extractGraph(state.description);
    if (!extraction.ok) {
      setExtractionError(`Graph extraction failed: ${extraction.error.kind}`);
      return;
    }
    dispatch({ type: 'GRAPH_EXTRACTED', graph: extraction.value, useCaseId: crypto.randomUUID() });
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

  async function handleConfirmAndEvaluate() {
    if (state.step !== 'confirmation') return;
    if (confirmInFlight.current) return;
    confirmInFlight.current = true;

    const { graph, corrections, useCaseId, originalVerdictId } = state;
    dispatch({ type: 'CONFIRMED' });
    setEvaluationError(null);

    try {
      await runConfirmAndEvaluate(graph, corrections, useCaseId, originalVerdictId);
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
        label: graph.input_nodes[0]?.label ?? graph.processing_nodes[0]?.label ?? 'AI use case',
        created_at: now,
        metadata: {
          node_type: 'use_case',
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

    const contradictions = detectContradictions(submittedDescription, nextAnswers, state.graph);
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

      <StepTracker current={state.step} />

      <div className="card">
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

        {state.step === 'duplicate_check' && (
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
                <button type="button" onClick={() => void handleConfirmNewUseCase()}>
                  This is a new use case →
                </button>
              </>
            )}
          </section>
        )}

        {state.step === 'graph_extraction' && state.method === 'llm' && (
          <div>
            <p>Extracting graph…</p>
            {extractionError && <p role="alert">{extractionError}</p>}
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
            {evaluationError && (
              <p role="alert">Evaluation could not complete: {evaluationError}. Review the graph and try again.</p>
            )}
            {/* V1.1-C01: a real visual data-flow with a real per-field
                correction editor — replaces the flat list whose Edit
                button was a stub that appended " (corrected)" to labels. */}
            <GraphView graph={state.graph} editable onCorrect={handleCorrectNode} />
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
            onConfirm={() => void handleConfirmAndEvaluate()}
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
