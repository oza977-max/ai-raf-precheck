import { useEffect, useCallback, useReducer, useState } from 'react';
import { extractGraph } from '../llm/graph-extractor';
import { confirmSemanticDuplicate } from '../llm/duplicate-check';
import { getApiKey } from '../llm/client';
import { evaluate } from '../engine/evaluate';
import { findPossibleDuplicates } from '../engine/duplicate';
import { loadPolicy } from '../store/policy';
import { addNode, getUseCases } from '../store/register';
import type { EvaluationResult, GraphCorrection } from '../engine/types';
import type { UseCaseSummary } from '../store/types';
import { intakeReducer } from './intake-state';
import type { IntakeState } from './intake-state';
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

  const refreshRegister = useCallback(async () => {
    const rows = await getUseCases('all');
    setRegisterRows(rows);
  }, []);

  useEffect(() => {
    void refreshRegister();
  }, [refreshRegister]);

  async function handleSubmitDescription() {
    if (state.step !== 'description_entry') return;
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

    dispatch({ type: 'NO_DUPLICATE_FOUND' });

    const extraction = await extractGraph(state.description);
    if (!extraction.ok) {
      // No-key / network / parse failure: P4-C02's structured-form
      // fallback UI isn't built yet — documented gap (build/prompts/P4-C01.md),
      // surfaced here as a plain message rather than silently stalling.
      setExtractionError(
        extraction.error.kind === 'no-api-key'
          ? 'No Anthropic API key configured — structured-form fallback is not available yet in this build.'
          : `Graph extraction failed: ${extraction.error.kind}`,
      );
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

  async function handleProceedToEvaluation() {
    if (state.step !== 'graph_review') return;
    const graph = state.graph;
    dispatch({ type: 'PROCEED_TO_EVALUATION_PASSTHROUGH' });

    const policyResult = loadPolicy(appetiteYaml);
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

  return (
    <div>
      {state.step === 'description_entry' && (
        <div>
          <label htmlFor="description-input">Describe your AI use case</label>
          <textarea
            id="description-input"
            value={state.description}
            onChange={(e) => dispatch({ type: 'DESCRIPTION_CHANGED', description: e.target.value })}
          />
          <button type="button" onClick={handleSubmitDescription} disabled={!state.description.trim()}>
            Submit
          </button>
        </div>
      )}

      {state.step === 'duplicate_check' && <p>Checking for similar use cases…</p>}

      {state.step === 'graph_extraction' && (
        <div>
          <p>Extracting graph…</p>
          {extractionError && <p role="alert">{extractionError}</p>}
        </div>
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
          <button type="button" onClick={handleProceedToEvaluation}>
            Proceed
          </button>
        </section>
      )}

      {state.step === 'evaluation_pending' && <p>Evaluating…</p>}

      {state.step === 'verdict' && verdict && (
        <section>
          <h2>Verdict: {verdict.status}</h2>
          <p>Tier: {verdict.tier}</p>
        </section>
      )}

      <section>
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
