import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import QuestionnaireStep from '../QuestionnaireStep';
import GraphView from '../GraphView';
import { buildVerdictView } from '../verdict-view-model';
import { loadPolicy } from '../../store/policy';
import { evaluate } from '../../engine/evaluate';
import { buildGraphFromForm } from '../../engine/build-graph-from-form';
import type { DataFlowGraph, IntakeQuestion, PolicyFile } from '../../engine/types';
import type { Verdict } from '../../types/verdict';

// UNSIGNED-MODEL (owner-approved wording 2026-10-03): a model the firm lists
// but has not accepted says so on the button, the Recorded line and the
// review row, and its owed review names the right action. REAL policy (BC-003).

const SUFFIX = ' — not yet accepted by your firm, so it gets an extra check';
const LOCAL_LABEL = 'A small open model running on your own computer' + SUFFIX;
const VENDOR_NAME = 'A licensed AI model from an outside company (example)';

const result = loadPolicy(readFileSync(resolve(__dirname, '../../../policy/appetite.yaml'), 'utf-8'));
if (!result.valid) throw new Error('shipped policy invalid');
const policy: PolicyFile = result.policy;

const question: IntakeQuestion = { id: 'Q1', field: 'declared_model_id', node_id: 'n1', triggered_by: [], answer_type: 'text' };

function graphWith(modelId: string): DataFlowGraph {
  const g = buildGraphFromForm(
    {
      useCaseName: 'x', description: 'y', inputDataClass: 'Internal', inputDataZone: 'Zone B', modelType: 'llm',
      autonomyLevel: 1, processingDataZone: 'Zone B', outputActionType: 'recommend', outputExposure: 'internal-shared',
      decisionBindingness: 'advisory', outputReversibility: 'reversible', outputScale: 'limited',
      replacesPriorModel: false, jurisdictions: [],
    },
    '2026-01-01T00:00:00.000Z',
    () => 'id-1',
  );
  g.processing_nodes[0]!.declared_model_id = modelId;
  return g;
}

function owedNames(modelId: string): string[] {
  const g = graphWith(modelId);
  const e = evaluate(g, policy);
  if (!e.ok) throw new Error('eval failed');
  const verdict = {
    ...e.value, id: 'v', use_case_id: 'uc', living_status: 'approved' as const,
    living_status_updated_at: '2026-01-01T00:00:00Z', attested_by: '1LoD', attested_at: '2026-01-01T00:00:00Z',
    graph_version: 1, corrections: [],
  } as Verdict;
  return buildVerdictView(verdict, policy, g, undefined, undefined, 'pre_checked').owedReviews.map((r) => r.plainName);
}

describe('UNSIGNED-MODEL', () => {
  it('TC-UM-01: qwen3:4b button and Recorded line carry the suffix; VENDOR-LLM-v1 does not', () => {
    const { rerender } = render(<QuestionnaireStep questions={[question]} answeredCount={0} onAnswer={vi.fn()} policy={policy} />);
    expect(screen.getByRole('button', { name: LOCAL_LABEL })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: VENDOR_NAME })).toBeInTheDocument();
    rerender(
      <QuestionnaireStep
        questions={[question, { ...question, id: 'Q2', field: 'data_class', answer_type: 'select' }]}
        answeredCount={1}
        lastAnswer={{ questionId: 'Q1', value: 'qwen3:4b' }}
        onAnswer={vi.fn()}
        policy={policy}
      />,
    );
    expect(screen.getByText(/^recorded:/i).closest('p')).toHaveTextContent(LOCAL_LABEL);
    rerender(
      <QuestionnaireStep
        questions={[question, { ...question, id: 'Q2', field: 'data_class', answer_type: 'select' }]}
        answeredCount={1}
        lastAnswer={{ questionId: 'Q1', value: 'VENDOR-LLM-v1' }}
        onAnswer={vi.fn()}
        policy={policy}
      />,
    );
    const rec = screen.getByText(/^recorded:/i).closest('p')!;
    expect(rec).toHaveTextContent(VENDOR_NAME);
    expect(rec).not.toHaveTextContent('not yet accepted');
  });

  it('TC-UM-02: the review screen row for qwen3:4b carries the suffix; VENDOR-LLM-v1 and unlisted ids do not', () => {
    const { unmount } = render(<GraphView graph={graphWith('qwen3:4b')} policy={policy} />);
    expect(screen.getByText(LOCAL_LABEL)).toBeInTheDocument();
    unmount();
    const second = render(<GraphView graph={graphWith('VENDOR-LLM-v1')} policy={policy} />);
    expect(screen.getByText(VENDOR_NAME)).toBeInTheDocument();
    second.unmount();
    render(<GraphView graph={graphWith('some-new-model-7')} policy={policy} />);
    expect(screen.getByText('some-new-model-7')).toBeInTheDocument();
  });

  it('TC-UM-03: a real evaluate() of a case declaring qwen3:4b owes "your AI risk team accepting this model", never "adding the model"', () => {
    const names = owedNames('qwen3:4b');
    expect(names).toContain('your AI risk team accepting this model');
    expect(names.join(' | ')).not.toContain("adding the model to your firm's list");
  });

  it('TC-UM-04: a model id not in the policy still owes "adding the model to your firm\'s list of known models"', () => {
    const names = owedNames('some-new-model-7');
    expect(names).toContain("adding the model to your firm's list of known models");
    expect(names.join(' | ')).not.toContain('accepting this model');
  });

  it('TC-UM-05: the new strings contain neither "approved" nor "rejected"', () => {
    expect(SUFFIX).not.toMatch(/approved|rejected/i);
    expect(owedNames('qwen3:4b').join(' ')).not.toMatch(/approved|rejected/i);
  });
});
