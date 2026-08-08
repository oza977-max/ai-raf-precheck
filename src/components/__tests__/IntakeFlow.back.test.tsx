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
