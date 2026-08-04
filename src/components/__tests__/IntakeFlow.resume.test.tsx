import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { addNode, getUseCases } from '../../store/register';
import { getAll } from '../../store/audit';

/** A register entry the duplicate check will match on, seeded before render so
 *  the row is present regardless of App's fire-and-forget seeding. */
async function seedExistingUseCase(label: string) {
  const node = {
    node_id: crypto.randomUUID(),
    node_type: 'use_case' as const,
    label,
    created_at: '2026-07-29T00:00:00.000Z',
    metadata: {
      node_type: 'use_case' as const,
      submitted_by: '1LoD',
      lifecycle_stage: 'approved' as const,
      current_verdict_id: null,
      tier: 'High',
      track: 'II',
    },
  };
  await addNode(node);
  return node;
}

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

// Round 4 — UC-2. The duplicate check surfaced a match and offered exactly one
// action: "This is a new use case". The requirement's fit criterion says the
// submitter "may adopt the existing classification OR confirm their use case
// is genuinely new" — only the second half was built. And dismissing a match
// wrote nothing to the audit trail, so nobody could afterwards tell a genuine
// new use case from a duplicate waved through.
describe('Duplicate gate — both decisions exist and both are recorded (UC-2)', () => {
  it('TC-UC-2-03: dismissing a match records it in the audit trail', async () => {
    const existing = await seedExistingUseCase('Mortgage servicing assistant');
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/describe your ai use case/i), 'Mortgage servicing assistant');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));
    await user.click(await screen.findByRole('button', { name: /this is a new use case/i }));

    await screen.findByText(/guided intake — answer the fields below/i);

    const events = await getAll(existing.node_id);
    const dismissal = events.find((e) => e.payload.type === 'duplicate_dismissed');
    expect(dismissal, 'no duplicate_dismissed event written').toBeDefined();
  });

  it('TC-UC-2-02: adopting the classification creates a linked record and asks no intake questions', async () => {
    const existing = await seedExistingUseCase('Mortgage servicing assistant');
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/describe your ai use case/i), 'Mortgage servicing assistant');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));

    const adopt = await screen.findByRole('button', { name: /adopt this classification/i });
    await user.click(adopt);

    // The submitter is NOT asked intake questions — that is the point of
    // adopting.
    expect(screen.queryByText(/guided intake — answer the fields below/i)).not.toBeInTheDocument();

    // A new record exists, linked to the original, and the link says where the
    // classification came from.
    const rows = await getUseCases('all');
    const adopted = rows.find((r) => r.use_case_id !== existing.node_id);
    expect(adopted, 'no new register record created').toBeDefined();
    expect(adopted!.tier).toBe('High');

    const events = await getAll(adopted!.use_case_id);
    const adoption = events.find((e) => e.payload.type === 'classification_adopted');
    expect(adoption).toBeDefined();
    expect(adoption && 'adopted_from_use_case_id' in adoption.payload && adoption.payload.adopted_from_use_case_id).toBe(
      existing.node_id,
    );

    // And it carries no verdict of its own, because nothing was evaluated.
    // The sign-off page states that plainly (register-lifecycle.md §15.2).
    expect(adopted!.current_verdict_status).toBeNull();
  });
});
