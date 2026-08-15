import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';

// FN-006 — user-reported after the v0.1.0 tag: "after describing, if I go to
// the next step it doesn't go back, there is no back option."
//
// These drive the real UI rather than the reducer, because the reducer tests
// already pin the transitions and the defect the user hit was the absence of
// a *control*. A reducer that can step back with no button to press is still
// a forward-only flow to the person using it.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn() };
  },
}));

const DRAFT_KEY = 'aigate:intake-draft';

describe('IntakeFlow — going back (FN-006)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('offers a back control on the duplicate check that returns the typed description', async () => {
    const typed = 'A model that scores retail credit applications';
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 'duplicate_check', description: typed }));

    render(<App />);
    const back = await screen.findByRole('button', { name: /back/i });
    await userEvent.click(back);

    // Back to the description step, with what was typed still in the box.
    // Losing it here would make the control useless for the case that
    // prompted it — fixing a typo.
    const box = await screen.findByRole('textbox', { name: /describe your ai use case/i });
    expect(box).toHaveValue(typed);
  });

  it('does not offer a back control on the confirmation step — that is an attestation', async () => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        step: 'confirmation',
        description: 'A model that scores retail credit applications',
        graph: {
          id: 'g1',
          version: 1,
          input_nodes: [],
          processing_nodes: [],
          output_nodes: [],
          edges: [],
          jurisdictions: ['UK'],
          intake_method: 'form',
          extracted_at: '2026-01-01T00:00:00.000Z',
        },
        graphVersion: 1,
        corrections: [],
        answers: [],
        useCaseId: 'uc-1',
      }),
    );

    render(<App />);
    await screen.findByRole('button', { name: /confirm and evaluate/i });
    expect(screen.queryByRole('button', { name: /^back$|← back/i })).toBeNull();
  });

  it('the back control is reachable by its accessible name, not only by sight', async () => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ step: 'duplicate_check', description: 'A tool that drafts client emails' }),
    );
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: /back/i })).toBeEnabled());
  });
});

// Traceability close-out (2026-08-15) — the UC-1 boundary cases had no UI
// tests carrying their ids; the reducer accepts any non-empty string, so the
// blocking behaviour lives in the disabled button and must be asserted there.
describe('IntakeFlow — description boundaries (UC-1)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('an empty description leaves Read & extract disabled [TC-UC-1-03]', async () => {
    render(<App />);
    const btn = await screen.findByRole('button', { name: /read & extract/i });
    expect(btn).toBeDisabled();
  });

  it('a five-sentence description is accepted and advances [TC-UC-1-02]', async () => {
    const user = userEvent.setup();
    render(<App />);
    const box = await screen.findByRole('textbox', { name: /describe your ai use case/i });
    await user.type(
      box,
      'We want an assistant that reads CRM notes. It summarises client activity. It recommends an action. It runs internally. The RM approves everything.',
    );
    const btn = screen.getByRole('button', { name: /read & extract/i });
    expect(btn).toBeEnabled();
    await user.click(btn);
    // Advanced to the duplicate check — the description was accepted.
    await screen.findAllByText(/duplicate check/i);
  });

  it('HTML in a description is literal text, never markup [TC-UC-1-04]', async () => {
    const user = userEvent.setup();
    const hostile = 'Ein Tool für Kundendaten — parses <img src=x onerror="alert(1)"> fields.';
    render(<App />);
    const box = await screen.findByRole('textbox', { name: /describe your ai use case/i });
    await user.click(box);
    await user.paste(hostile);
    await user.click(screen.getByRole('button', { name: /read & extract/i }));
    await screen.findAllByText(/duplicate check/i);
    await user.click(await screen.findByRole('button', { name: /this is a new use case/i }));
    // The guided form's own description field is prefilled from what was
    // typed; whatever renders it must render TEXT. No <img> may exist.
    expect(document.querySelector('img')).toBeNull();
  });
});

// Found by walking the product as a user (2026-08-15): describe "no client
// data at all, no autonomy", then declare Client PII and L3 in the guided
// form — and reach attestation with no contradiction shown. The engine's
// detector works (contradiction.test.ts); the UI only invoked it per
// questionnaire ANSWER, and the guided form marks nothing uncertain, so zero
// questions are generated and the check was skipped with the questionnaire.
// The honesty feature was unreachable on the primary, verified path.
describe('IntakeFlow — contradictions are caught on the zero-questions path (UC-5)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('a description denying what the form declares blocks the skip to confirmation', async () => {
    const user = userEvent.setup();
    render(<App />);
    const box = await screen.findByRole('textbox', { name: /describe your ai use case/i });
    await user.click(box);
    await user.paste('This tool processes no client data at all. A human approves every action, no autonomy.');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));
    await user.click(await screen.findByRole('button', { name: /this is a new use case/i }));

    // Declare the opposite of the description.
    await user.type(await screen.findByLabelText(/what do you want to call it/i), 'Contradictor');
    await user.type(screen.getByLabelText(/in a sentence or two/i), 'x');
    await user.selectOptions(screen.getByLabelText(/what kind of information does it use/i), 'Client PII');
    await user.selectOptions(screen.getByLabelText(/where does that information sit today/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/what kind of ai is it/i), 'llm');
    await user.selectOptions(screen.getByLabelText(/how much can it do without a person/i), '3');
    await user.selectOptions(screen.getByLabelText(/where does the ai itself run/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/what does it actually produce or do/i), 'draft');
    await user.selectOptions(screen.getByLabelText(/who sees what it produces/i), 'internal-shared');
    await user.selectOptions(screen.getByLabelText(/how much weight does its output carry/i), 'advisory');
    await user.selectOptions(screen.getByLabelText(/if it gets something wrong/i), 'reversible');
    await user.selectOptions(screen.getByLabelText(/how widely is it used/i), 'limited');
    await user.click(screen.getByLabelText(/united kingdom/i));
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await user.click(await screen.findByRole('button', { name: /proceed/i }));

    // The old behaviour sailed to "Confirm and evaluate". The fix surfaces
    // the contradiction review instead — both statements, resolution required.
    expect((await screen.findAllByText(/contradiction/i)).length).toBeGreaterThan(0);
    // Both halves of the contradiction are stated, per UC-5.
    expect(screen.getAllByText(/no client\/personal data/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /confirm and evaluate/i })).toBeNull();
  });
});

// The second half of the same walk (2026-08-15): resolve the contradiction
// and the flow returned to a zero-question questionnaire reading "All
// questions answered." with NO forward control — a dead end. Pre-existing on
// the normal path too: any contradiction raised on the FINAL answer landed in
// the same trap once resolved.
describe('IntakeFlow — resolving a contradiction cannot dead-end (UC-5)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('after resolution with no questions left, the flow reaches confirmation', async () => {
    const user = userEvent.setup();
    render(<App />);
    const box = await screen.findByRole('textbox', { name: /describe your ai use case/i });
    await user.click(box);
    await user.paste('This tool processes no client data at all.');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));
    await user.click(await screen.findByRole('button', { name: /this is a new use case/i }));

    await user.type(await screen.findByLabelText(/what do you want to call it/i), 'Resolver');
    await user.type(screen.getByLabelText(/in a sentence or two/i), 'x');
    await user.selectOptions(screen.getByLabelText(/what kind of information does it use/i), 'Client PII');
    await user.selectOptions(screen.getByLabelText(/where does that information sit today/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/what kind of ai is it/i), 'llm');
    await user.selectOptions(screen.getByLabelText(/how much can it do without a person/i), '1');
    await user.selectOptions(screen.getByLabelText(/where does the ai itself run/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/what does it actually produce or do/i), 'draft');
    await user.selectOptions(screen.getByLabelText(/who sees what it produces/i), 'internal-shared');
    await user.selectOptions(screen.getByLabelText(/how much weight does its output carry/i), 'advisory');
    await user.selectOptions(screen.getByLabelText(/if it gets something wrong/i), 'reversible');
    await user.selectOptions(screen.getByLabelText(/how widely is it used/i), 'limited');
    await user.click(screen.getByLabelText(/united kingdom/i));
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await user.click(await screen.findByRole('button', { name: /proceed/i }));

    // Contradiction review appears; resolve it.
    const explain = await screen.findByRole('textbox', { name: /explain|resolution|why/i });
    await user.type(explain, 'The description was wrong; the form is right.');
    await user.click(screen.getByRole('button', { name: /resolve and continue/i }));

    // The old behaviour stranded the user at "All questions answered." with
    // no control. The flow must reach the attestation.
    expect(await screen.findByRole('button', { name: /confirm and evaluate/i })).toBeInTheDocument();
  });
});
