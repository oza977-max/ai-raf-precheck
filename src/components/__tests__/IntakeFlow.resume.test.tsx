import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { addNode } from '../../store/register';

// explore-005 D-001 / D-002. The draft restore persists IntakeState and
// nothing else, so a step whose screen depends on component state written by
// the handler that normally enters it comes back broken. These tests drive
// the restore the way a reload does — a fresh render over a populated
// sessionStorage draft — rather than asserting on the reducer alone, because
// the defect lives in the gap between the two.
//
// TDD-2 mock budget = 1: the Anthropic SDK boundary only. sessionStorage is
// the real jsdom one (npm test sets --no-experimental-webstorage).
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: vi.fn() };
    },
  };
});

const DRAFT_KEY = 'aigate:intake-draft';
const FORM_DRAFT_KEY = 'aigate:intake-form-draft';

describe('IntakeFlow — resuming a restored draft', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('resolves the duplicate check when the flow is restored at duplicate_check (D-001)', async () => {
    // Exactly what a reload on step 2 leaves behind: the step, and no record
    // of the check that step's screen is waiting on.
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ step: 'duplicate_check', description: 'A tool that drafts client emails' }),
    );

    render(<App />);

    // The way out of the step must appear without the user re-entering
    // anything. Before the fix this never resolves and no button is rendered.
    expect(await screen.findByRole('button', { name: /this is a new use case/i })).toBeInTheDocument();
    expect(screen.queryByText(/checking the existing inventory/i)).not.toBeInTheDocument();
  });

  it('waits for the register to load before resolving the restored check (D-001)', async () => {
    // A row that exists BEFORE the render, so the count is not at the mercy
    // of App's fire-and-forget self-assessment seeding (explore-005 O-002).
    await addNode({
      node_id: 'existing-row',
      node_type: 'use_case',
      label: 'An existing register entry',
      created_at: '2026-07-29T00:00:00.000Z',
      metadata: {
        node_type: 'use_case',
        submitted_by: '1LoD',
        lifecycle_stage: 'idea',
        current_verdict_id: null,
        tier: null,
        track: null,
      },
    });

    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ step: 'duplicate_check', description: 'A tool that drafts client emails' }),
    );

    render(<App />);
    await screen.findByRole('button', { name: /this is a new use case/i });

    // Without the registerLoaded guard the restored check resolves against
    // an empty array and reports having checked nothing — a wrong answer
    // rendered as a confident one. Not an exact count: the seeding race in
    // O-002 can add a row, and pinning the number would make this flaky.
    expect(screen.queryByText(/checked 0 register/i)).not.toBeInTheDocument();
  });

  it('returns to a blank description entry when Start over instead is clicked (D-002)', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ step: 'duplicate_check', description: 'A tool that drafts client emails' }),
    );
    sessionStorage.setItem(FORM_DRAFT_KEY, JSON.stringify({ name: 'left over from the abandoned draft' }));

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /start over instead/i }));

    const input = await screen.findByLabelText(/describe your ai use case/i);
    expect(input).toHaveValue('');
    // Both drafts, not just the reducer's: a start-over that leaves the
    // guided form's answers behind has not started over.
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(sessionStorage.getItem(FORM_DRAFT_KEY)).toBeNull();
  });
});
