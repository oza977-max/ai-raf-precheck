import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterDetail from '../RegisterDetail';
import { addNode } from '../../store/register';
import { append, getAll } from '../../store/audit';
import type { RegisterNode, LifecycleStage, AuditEvent } from '../../store/types';
import type { Verdict } from '../../types/verdict';
import type { PolicyFile } from '../../engine/types';

// R12-AB-1 (ADR-VA-R12-1): the sampling spot-review panel. A self-served
// Low-tier decided verdict, deterministically selected (K=1 always
// selects), gets a human spot review recorded as exactly one audit event —
// even under a double-click, the same append-only discipline every other
// 2LoD write in this file defends.
function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    status: 'approved',
    tier: 'Low',
    track: 'II',
    binding_constraint: '',
    binding_path: '',
    controls: [],
    downstream_reviews: [],
    conditions: { hypotheses: [] },
    policy_version: '1.0',
    pack_versions: {},
    applied_overrides: [],
    confidence_caveats: [],
    provisional_reasons: [],
    boundary_proximity: false,
    margin_achieved: 0,
    margin_target: 0.1,
    single_covered_invariants: [],
    explanation: {
      tier_rationale: null,
      track_rationale: null,
      hard_lines_checked: 0,
      invariants_checked: 0,
      tripped_invariants: [],
      binding_reason: null,
      binding_regulatory_basis: null,
      regulatory_chain: [],
    },
    id: 'v-sampling-1',
    use_case_id: 'uc-sampling',
    living_status: 'approved',
    living_status_updated_at: '2026-01-01T00:00:00.000Z',
    attested_by: '1LoD',
    attested_at: '2026-01-01T00:00:00.000Z',
    graph_version: 1,
    corrections: [],
    ...overrides,
  };
}

async function seed(useCaseId: string, verdict: Verdict, stage: LifecycleStage = 'approved') {
  await addNode({
    node_id: useCaseId,
    node_type: 'use_case',
    label: 'Self-served Low case',
    created_at: '2026-01-01T00:00:00.000Z',
    metadata: {
      node_type: 'use_case',
      submitted_by: '1LoD',
      lifecycle_stage: stage,
      current_verdict_id: null,
      tier: 'Low',
      track: 'II',
    },
  } as RegisterNode);
  await append({
    event_id: crypto.randomUUID(),
    use_case_id: useCaseId,
    event_type: 'verdict_produced',
    occurred_at: '2026-01-02T00:00:00.000Z',
    actor: '1LoD',
    payload: { type: 'verdict_produced', verdict },
  });
}

const policy = { sampling_rate: 1 } as unknown as PolicyFile;

function renderDetail(useCaseId: string) {
  return render(<RegisterDetail useCaseId={useCaseId} role="2LoD" policy={policy} onBack={vi.fn()} />);
}

const samplingReviews = async (id: string) => (await getAll(id)).filter((e) => e.payload.type === 'sampling_reviewed');

describe('RegisterDetail — sampling spot review (R12-AB-1)', () => {
  it('TC-R12-AB-1-03: renders the panel for a sampled self-served Low-tier case', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id, id: 'v-sampled' }));
    renderDetail(id);

    expect(await screen.findByText(/Sampling spot review due/i)).toBeInTheDocument();
    expect(screen.getByText(/deterministically selected \(1 in 1\)/i)).toBeInTheDocument();
  });

  it('TC-R12-AB-1-04: recording the review appends exactly one sampling_reviewed event and clears the panel', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id, id: 'v-sampled-2' }));
    renderDetail(id);

    await screen.findByText(/Sampling spot review due/i);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/your name/i), 'Priya Nair');
    await user.click(screen.getByRole('button', { name: /record spot review/i }));

    await waitFor(async () => expect((await samplingReviews(id)).length).toBe(1));
    const [review] = (await samplingReviews(id)) as [AuditEvent];
    const p = review.payload as Extract<AuditEvent['payload'], { type: 'sampling_reviewed' }>;
    expect(p.reviewed_by_name).toBe('Priya Nair');
    expect(p.verdict_id).toBe('v-sampled-2');

    await waitFor(() => expect(screen.queryByText(/Sampling spot review due/i)).not.toBeInTheDocument());
  });

  it('TC-R12-AB-1-05: a double-click records exactly one sampling_reviewed event (append-only discipline)', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id, id: 'v-sampled-3' }));
    renderDetail(id);

    await screen.findByText(/Sampling spot review due/i);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/your name/i), 'Priya Nair');
    const button = screen.getByRole('button', { name: /record spot review/i });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(async () => expect((await samplingReviews(id)).length).toBeGreaterThan(0));
    expect(await samplingReviews(id)).toHaveLength(1);
  });
});
