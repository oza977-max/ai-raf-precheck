import { useEffect, useCallback, useMemo, useReducer, useState } from 'react';
import { extractGraph } from '../llm/graph-extractor';
import { confirmSemanticDuplicate } from '../llm/duplicate-check';
import { getApiKey } from '../llm/client';
import { evaluate } from '../engine/evaluate';
import { findPossibleDuplicates } from '../engine/duplicate';
import { loadPolicy } from '../store/policy';
import { addNode, getUseCases } from '../store/register';
import type { DataFlowGraph, EvaluationResult, GraphCorrection } from '../engine/types';
import type { UseCaseSummary } from '../store/types';
import { generateQuestions } from '../engine/question-generator';
import { detectContradictions } from '../engine/contradiction';
import { intakeReducer } from './intake-state';
import type { IntakeState } from './intake-state';
import StructuredForm from './StructuredForm';
import StepTracker from './StepTracker';
import QuestionnaireStep from './QuestionnaireStep';
import ContradictionReview from './ContradictionReview';
// Vite ?raw import (P2-C01 upstream fix) — loadPolicy() now takes a YAML
// string; PolicyEditor.tsx's file-upload UI is not wired in until a later
// chunk, so this smoke path reads the starter policy at build time.
import appetiteYaml from '../../policy/appetite.yaml?raw';

// Rule 4 (cross-cutting.md §7): presentation-only. No business logic inline
// — calls engine/store/llm functions. Real 9-state machine (intake-flow.md
// §3) as of P4-C01. questionnaire/contradiction_review/confirmation states
// exist in the type union (locked contract for P4-C03/P4-C04) but have no
// UI here yet — graph_review proceeds directly to evaluation_pending via a
// documented pass-through (see build/prompts/P4-C01.md).
const INITIAL_STATE: IntakeState = { step: 'description_entry', description: '' };

export default function IntakeFlow() {
  const [state, dispatch] = useReducer(intakeReducer, INITIAL_STATE);
  const [verdict, setVerdict] = useState<EvaluationResult | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [registerRows, setRegisterRows] = useState<UseCaseSummary[]>([]);
  const [submittedDescription, setSubmittedDescription] = useState('');
  const policyResult = useMemo(() => loadPolicy(appetiteYaml), []);

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
    dispatch({ type: 'GRAPH_EXTRACTED', graph: extraction.value });
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
      corrected_by: '1LoD',
      corrected_at: new Date().toISOString(),
    };

    dispatch({ type: 'CORRECTION_APPLIED', correction, updatedGraph });
  }

  async function handleProceedFromGraphReview() {
    if (state.step !== 'graph_review') return;
    if (!policyResult.valid) {
      throw new Error(
        `Policy invalid: ${policyResult.errors.map((e) => `${e.field}: ${e.reason}`).join('; ')}`,
      );
    }
    const questions = generateQuestions(state.graph, policyResult.policy, []);
    if (questions.length === 0) {
      // No uncertain fields needed clarifying — nothing to ask, proceed straight through.
      const graph = state.graph;
      dispatch({ type: 'QUESTIONS_GENERATED', questions: [] });
      dispatch({ type: 'PROCEED_TO_EVALUATION_PASSTHROUGH' });
      await runEvaluation(graph);
      return;
    }
    dispatch({ type: 'QUESTIONS_GENERATED', questions });
  }

  async function runEvaluation(graph: DataFlowGraph) {
    if (!policyResult.valid) {
      throw new Error(
        `Policy invalid: ${policyResult.errors.map((e) => `${e.field}: ${e.reason}`).join('; ')}`,
      );
    }
    const evalResult = evaluate(graph, policyResult.policy);
    if (!evalResult.ok) {
      throw new Error(`Evaluation failed: ${evalResult.error.kind}`);
    }
    const result = evalResult.value;
    setVerdict(result);

    const useCaseId = crypto.randomUUID();
    await addNode({
      node_id: useCaseId,
      node_type: 'use_case',
      label: graph.input_nodes[0]?.label ?? graph.processing_nodes[0]?.label ?? 'AI use case',
      created_at: new Date().toISOString(),
      metadata: {
        node_type: 'use_case',
        submitted_by: 'current-user',
        lifecycle_stage: 'idea',
        current_verdict_id: null,
        tier: result.tier,
        track: result.track,
      },
    });
    await refreshRegister();
    dispatch({ type: 'VERDICT_READY', verdictId: useCaseId });
  }

  async function handleAnswerSubmitted(questionId: string, value: unknown) {
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
      dispatch({ type: 'PROCEED_TO_EVALUATION_PASSTHROUGH' });
      await runEvaluation(state.graph);
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
            onSubmit={(graph) => dispatch({ type: 'GRAPH_EXTRACTED', graph })}
          />
        )}

        {state.step === 'graph_review' && (
          <section>
            <h2>Review extracted graph</h2>
            {duplicateWarning && <p role="alert">{duplicateWarning}</p>}
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

        {state.step === 'evaluation_pending' && <p>Evaluating…</p>}

        {state.step === 'verdict' && verdict && (
          <section className={`verdict verdict--${verdict.status}`}>
            <p className="verdict__eyebrow">Verdict</p>
            <h2 className="verdict__heading">
              {verdict.status === 'approved' && 'Approved'}
              {verdict.status === 'approved_with_controls' && 'Approved with controls'}
              {verdict.status === 'rejected' && 'Rejected'}
            </h2>
            <div className="verdict__cards">
              <div className="verdict__stat">
                <span className="verdict__stat-label">Tier</span>
                <span className={`verdict__stat-value verdict__stat-value--${verdict.tier.toLowerCase()}`}>
                  {verdict.tier}
                </span>
              </div>
              <div className="verdict__stat">
                <span className="verdict__stat-label">Track</span>
                <span className="verdict__stat-value">{verdict.track}</span>
              </div>
            </div>
            {verdict.controls.length > 0 && (
              <p className="verdict__controls">Controls required: {verdict.controls.join(', ')}</p>
            )}
          </section>
        )}
      </div>

      <section className="card register-card">
        <h2>Register</h2>
        <table>
          <tbody>
            {registerRows.map((row) => (
              <tr key={row.use_case_id}>
                <td>{row.label}</td>
                <td>{row.tier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
