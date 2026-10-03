import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ContradictionReview from '../ContradictionReview';
import { POLICY_PROBLEM_MESSAGE } from '../plain-copy';
import type { Contradiction } from '../../engine/types';

const CONTRADICTIONS: Contradiction[] = [
  { statement1: 'Your description says no personal information is involved.', statement2: 'but your answers say it uses information about people.', field: 'data_class' },
];

describe('ContradictionReview — O-9 (no severity)', () => {
  it('TC-FX7-4-O9: the reassurance says this is not a result yet, and never "nothing is wrong"', () => {
    const { container } = render(<ContradictionReview contradictions={CONTRADICTIONS} onResolve={vi.fn()} />);
    const note = container.querySelector('.field-help')!.textContent!;
    expect(note).toMatch(/This isn.t a result yet/);
    expect(note).not.toMatch(/nothing is wrong/i);
  });
});

describe('plain-copy — CR7-37 placement', () => {
  it('TC-CR7-37-place: POLICY_PROBLEM_MESSAGE lives in plain-copy.ts (one plain sentence), IntakeFlow imports it and keeps no copy', () => {
    expect(POLICY_PROBLEM_MESSAGE).toMatch(/rules file has a problem/);
    const flow = readFileSync(resolve(__dirname, '../IntakeFlow.tsx'), 'utf-8');
    expect(flow).not.toMatch(/const POLICY_PROBLEM_MESSAGE\s*=/);
    expect(flow).toMatch(/POLICY_PROBLEM_MESSAGE,?\s*\n?[^]*from '\.\/plain-copy'/);
  });
});
