import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dump, load } from 'js-yaml';
import QuestionnaireStep from '../QuestionnaireStep';
import { loadPolicy } from '../../store/policy';
import type { IntakeQuestion, PolicyFile } from '../../engine/types';

// CR6-19 (code review 006): the description-path model buttons and the
// "Recorded:" line used the raw model id. ApprovedModel gains an optional
// plain_name; labels use `plain_name ?? model_id`.

function minimalPolicy(overrides: Partial<PolicyFile> = {}): PolicyFile {
  return {
    version: '1',
    policy_id: 'P',
    firm_name: 'Test',
    translation_attestation: { attested_by: 'x', role: 'x', date: '2026-01-01', raf_version_checked: 'x' },
    hard_lines: [],
    tracks: [],
    tiers: [],
    invariants: [],
    controls: [],
    kri_thresholds: {},
    jurisdictions: [],
    roles: {},
    tier_workflow: { Critical: 'x', High: 'x', Medium: 'x', Low: 'x' },
    safety_margin: 0,
    ...overrides,
  };
}

function question(overrides: Partial<IntakeQuestion> = {}): IntakeQuestion {
  return { id: 'Q1', field: 'declared_model_id', node_id: 'n1', triggered_by: [], answer_type: 'text', ...overrides };
}

const policy = minimalPolicy({
  approved_models: [
    { model_id: 'VENDOR-LLM-v1', vendor: 'V', provenance_class: 'vendor_hosted', is_approved: true, plain_name: "Your firm's approved writing assistant" },
    { model_id: 'gpt-4o', vendor: 'V', provenance_class: 'vendor_hosted', is_approved: true },
  ],
});

describe('QuestionnaireStep — CR6-19: a model with a plain name is shown by it', () => {
  it('TC-CR6-19: button label and the Recorded line use plain_name, falling back to a neutral "Model n" (CR7-35: never the raw id)', () => {
    const { rerender } = render(
      <QuestionnaireStep questions={[question()]} answeredCount={0} onAnswer={vi.fn()} policy={policy} />,
    );
    expect(screen.getByRole('button', { name: /^your firm.s approved writing assistant$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^VENDOR-LLM-v1$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Model 1$/ })).toBeInTheDocument(); // no plain_name: neutral label, not the id (CR7-35)
    expect(screen.queryByRole('button', { name: /gpt-4o/ })).not.toBeInTheDocument();

    rerender(
      <QuestionnaireStep
        questions={[question({ id: 'Q1' }), question({ id: 'Q2', field: 'data_class', answer_type: 'select' })]}
        answeredCount={1}
        lastAnswer={{ questionId: 'Q1', value: 'VENDOR-LLM-v1' }}
        onAnswer={vi.fn()}
        policy={policy}
      />,
    );
    const recorded = screen.getByText(/^recorded:/i).closest('p')!;
    expect(recorded).toHaveTextContent(/your firm.s approved writing assistant/i);
    expect(recorded).not.toHaveTextContent('VENDOR-LLM-v1');
  });

  it('TC-CR6-19b: the policy schema accepts and keeps an approved model\'s plain_name', () => {
    const raw = load(readFileSync(resolve(__dirname, '../../../policy/appetite.yaml'), 'utf-8')) as {
      approved_models: Array<Record<string, unknown>>;
    };
    raw.approved_models[0]!.plain_name = 'A plain name';
    const result = loadPolicy(dump(raw));
    if (!result.valid) throw new Error(JSON.stringify(result));
    expect(result.policy.approved_models!.find((m) => m.plain_name === 'A plain name')).toBeDefined();
  });
});
