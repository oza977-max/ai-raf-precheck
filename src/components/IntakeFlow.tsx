import { useEffect, useCallback, useMemo, useReducer, useState } from 'react';
import { extractGraph } from '../llm/graph-extractor';
import { confirmSemanticDuplicate } from '../llm/duplicate-check';
import { getApiKey } from '../llm/client';
import { evaluate } from '../engine/evaluate';
import { findPossibleDuplicates } from '../engine/duplicate';
import { loadPolicy } from '../store/policy';
import { getCurrentPolicyYaml } from '../store/policy-source';
import { addNode, getUseCase, getUseCases, updateUseCaseVerdictSummary, updateLifecycleStage } from '../store/register';
import { getRole } from '../store/role';
import { routeToWorkflow } from '../engine/workflow-router';
import type { DataFlowGraph, GraphCorrection } from '../engine/types';
import type { Verdict } from '../types/verdict';
import type { AuditEvent, UseCaseSummary } from '../store/types';
import { generateQuestions } from '../engine/question-generator';
import { detectContradictions } from '../engine/contradiction';
import { append as appendAuditEvent, getAll as getAuditEvents } from '../store/audit';
import { generateReasoningTraceForVerdict } from '../llm/reasoning-trace';
import { findRuleDescription } from '../engine/find-rule-description';
import { intakeReducer } from './intake-state';
import type { IntakeState } from './intake-state';
import StructuredForm from './StructuredForm';
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
  const [state, dispatch] = useReducer(intakeReducer, INITIAL_STATE);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [verdictAuditEvents, setVerdictAuditEvents] = useState<AuditEvent[]>([]);
  const [lastGraph, setLastGraph] = useState<DataFlowGraph | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [registerRows, setRegisterRows] = useState<UseCaseSummary[]>([]);
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
    setDuplicateWarning(null);

    const candidates = findPossibleDuplicates(
      state.description,
      registerRows.map((r) => ({ id: r.use_case_id, label: r.label })),
    );
    if (candidates.length > 0 && getApiKey()) {
      const topCandidate = registerRows.find((r) => r.use_case_id === candidates[0]?.id);
      if (topCandidate) {
        const confirmed = await confirmSemanticDuplicate(state.description, topCandidate.label);
        if (confirmed) {
          setDuplicateWarning(`A similar use case may already exist: "${topCandidate.label}"`);
        }
      }
    } else if (candidates.length > 0) {
      setDuplicateWarning('A similar use case may already exist in the register (keyword match).');
    }

    const hasApiKey = getApiKey() !== null;
    dispatch({ type: 'NO_DUPLICATE_FOUND', method: hasApiKey ? 'llm' : 'form' });

    if (!hasApiKey) {
      // P4-C02: structured-form fallback (UC-3a) — real form UI, not the
      // dead-end message P4-C01 shipped. Rendered below in graph_extraction.
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

  async function handleConfirmAndEvaluate() {
    if (state.step !== 'confirmation') return;
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
    const evalResult = evaluate(graph, policyResult.policy);
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

        {state.step === 'duplicate_check' && <p>Checking for similar use cases…</p>}

        {state.step === 'graph_extraction' && state.method === 'llm' && (
          <div>
            <p>Extracting graph…</p>
            {extractionError && <p role="alert">{extractionError}</p>}
          </div>
        )}

        {state.step === 'graph_extraction' && state.method === 'form' && (
          <StructuredForm
            jurisdictions={policyResult.valid ? policyResult.policy.jurisdictions : []}
            onSubmit={(graph) => dispatch({ type: 'GRAPH_EXTRACTED', graph, useCaseId: crypto.randomUUID() })}
          />
        )}

        {state.step === 'graph_review' && (
          <section>
            <h2>Review extracted graph</h2>
            {duplicateWarning && <p role="alert">{duplicateWarning}</p>}
            {evaluationError && (
              <p role="alert">Evaluation could not complete: {evaluationError}. Review the graph and try again.</p>
            )}
            <ul>
              {[...state.graph.input_nodes, ...state.graph.processing_nodes, ...state.graph.output_nodes].map(
                (node) => (
                  <li key={node.id} data-uncertain={'uncertain' in node && node.uncertain ? 'true' : 'false'}>
                    {node.label}
                    {'uncertain' in node && node.uncertain && <strong> (uncertain — please confirm)</strong>}
                    <button
                      type="button"
                      onClick={() => handleCorrectNode(node.id, 'label', `${node.label} (corrected)`)}
                    >
                      Edit
                    </button>
                  </li>
                ),
              )}
            </ul>
            <button type="button" onClick={handleProceedFromGraphReview}>
              Proceed
            </button>
          </section>
        )}

        {state.step === 'questionnaire' && (
          <QuestionnaireStep
            questions={state.questions}
            answeredCount={state.answers.length}
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
            onCorrect={handleCorrectVerdict}
          />
        )}
      </div>
    </div>
  );
}
