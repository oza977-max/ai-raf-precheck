import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import QuestionnaireStep from '../QuestionnaireStep';
import type { IntakeQuestion } from '../../engine/types';
import { QUESTIONNAIRE_COPY } from '../plain-copy';

// R15-C3 (proposal §3.7) — test-cases-015.md TC-R15-C3-04. This screen used
// to carry a raw internal-id tag ("UC-4 · TARGETED QUESTIONS") next to the
// user-facing heading, the same class of leaked internal vocabulary R15-C3
// removed from the Confirm & attest screen (TC-R15-C3-03, see
// ConfirmationStep.test.tsx).
//
// R16-E §2 (DR7-31): `IntakeQuestion.text` is retired — the question's
// words now come from QUESTIONNAIRE_COPY, keyed by `field`, so this
// fixture no longer carries its own text at all.
const QUESTION: IntakeQuestion = {
  id: 'q1',
  field: 'data_class',
  triggered_by: [],
  answer_type: 'boolean',
};

describe('QuestionnaireStep — no internal-id tag on the targeted-questions screen (TC-R15-C3-04)', () => {
  it('TC-R15-C3-04: the "UC-4 · TARGETED QUESTIONS" internal-id tag does not render', () => {
    render(<QuestionnaireStep questions={[QUESTION]} answeredCount={0} onAnswer={vi.fn()} />);

    // The screen itself renders — QUESTIONNAIRE_COPY's own words for the
    // field, not a bare id or a fixture-supplied string.
    expect(screen.getByText(/question 1 of 1/i)).toBeInTheDocument();
    expect(screen.getByText(QUESTIONNAIRE_COPY.data_class!.question)).toBeInTheDocument();
    // ...but the old raw use-case-id tag is gone.
    expect(screen.queryByText(/UC-4/)).not.toBeInTheDocument();
    expect(screen.queryByText(/TARGETED QUESTIONS/i)).not.toBeInTheDocument();
  });
});
