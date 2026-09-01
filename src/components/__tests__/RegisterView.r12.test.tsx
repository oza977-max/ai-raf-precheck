import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import RegisterView from '../RegisterView';
import { addNode } from '../../store/register';
import { append } from '../../store/audit';
import { isSampledForReview } from '../../engine/temporal';
import type { RegisterNode, RegisterNodeMetadata } from '../../store/types';
import type { Verdict } from '../../types/verdict';
import type { PolicyFile } from '../../engine/types';

// code-review-004 F1: RegisterView is a controlled component now — App owns
// selection + history. This harness supplies the minimal controlled wiring
// (plain state, no history) so these behavioural tests keep exercising the
// row-click -> detail -> back flow; the HISTORY semantics live in App and
// are covered by App.browserBack.test.tsx.
function RegisterViewHarness(props: Omit<ComponentProps<typeof RegisterView>, 'selectedId' | 'onSelectRow' | 'onCloseDetail'>) {
  const [sel, setSel] = useState<string | null>(null);
  return (
    <RegisterView {...props} selectedId={sel} onSelectRow={setSel} onCloseDetail={() => setSel(null)} />
  );
}


function makeUseCaseMetadata(
  overrides: Partial<Extract<RegisterNodeMetadata, { node_type: 'use_case' }>> = {},
): RegisterNodeMetadata {
  return {
    node_type: 'use_case',
    submitted_by: '1LoD',
    lifecycle_stage: 'approved',
    current_verdict_id: null,
    tier: 'Low',
    track: 'II',
    ...overrides,
  };
}

function makeUseCaseNode(overrides: Partial<RegisterNode> = {}): RegisterNode {
  return {
    node_id: overrides.node_id ?? crypto.randomUUID(),
    node_type: 'use_case',
    label: 'A tool that drafts client emails',
    created_at: new Date().toISOString(),
    metadata: makeUseCaseMetadata(),
    ...overrides,
  };
}

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  const id = overrides.id ?? crypto.randomUUID();
  return {
    status: 'approved',
    tier: 'Low',
    track: 'II',
    binding_constraint: 'INV-01',
    binding_path: 'a → b',
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
    id,
    use_case_id: 'uc',
    living_status: 'approved',
    living_status_updated_at: '2026-01-01T00:00:00.000Z',
    attested_by: '1LoD',
    attested_at: '2026-01-01T00:00:00.000Z',
    graph_version: 1,
    corrections: [],
    ...overrides,
  };
}

async function seedVerdict(useCaseId: string, verdict: Verdict) {
  await append({
    event_id: crypto.randomUUID(),
    use_case_id: useCaseId,
    event_type: 'verdict_produced',
    occurred_at: new Date().toISOString(),
    actor: 'system',
    payload: { type: 'verdict_produced', verdict },
  });
}

// Find a verdict id the deterministic hash actually selects at K=1 (always
// selected) so the sampling test does not depend on hash luck.
const SAMPLING_RATE = 1;

describe('R12-BD-3 — pilot-mode line', () => {
  it('TC-R12-BD-3-02: counts only verdicts whose causes are ALL sign-off gaps', async () => {
    // High tier, deliberately, so these fixtures never overlap the R12-AB-1
    // sampling tests below (which need Low-tier self-served rows) — the
    // same in-memory db persists across tests in this file.
    const signoffOnly = makeUseCaseNode({
      node_id: crypto.randomUUID(),
      label: 'Signoff gap only',
      metadata: makeUseCaseMetadata({ tier: 'High' }),
    });
    const substantive = makeUseCaseNode({
      node_id: crypto.randomUUID(),
      label: 'Substantive case',
      metadata: makeUseCaseMetadata({ tier: 'High' }),
    });
    const clean = makeUseCaseNode({
      node_id: crypto.randomUUID(),
      label: 'Clean case',
      metadata: makeUseCaseMetadata({ tier: 'High' }),
    });
    await addNode(signoffOnly);
    await addNode(substantive);
    await addNode(clean);
    await seedVerdict(
      signoffOnly.node_id,
      makeVerdict({ use_case_id: signoffOnly.node_id, provisional_reasons: ['unsigned_pack_rules'] }),
    );
    await seedVerdict(
      substantive.node_id,
      makeVerdict({
        use_case_id: substantive.node_id,
        provisional_reasons: ['unsigned_pack_rules', 'no_regulatory_basis'],
      }),
    );
    await seedVerdict(clean.node_id, makeVerdict({ use_case_id: clean.node_id, provisional_reasons: [] }));

    render(<RegisterViewHarness role="2LoD" currentPolicyVersion="1.0" />);

    expect(await screen.findByText(/1 of 3 verdicts here would be final once outstanding sign-offs land\./)).toBeInTheDocument();
  });
});

describe('R12-AB-1 — sampling queue chip', () => {
  it('TC-R12-AB-1-01: a self-served Low-tier sampled verdict shows a sampling-review-due chip for 2LoD', async () => {
    const node = makeUseCaseNode({ node_id: crypto.randomUUID(), label: 'Self-served low tier' });
    await addNode(node);
    const verdict = makeVerdict({ use_case_id: node.node_id });
    expect(isSampledForReview(verdict.id, SAMPLING_RATE)).toBe(true);
    await seedVerdict(node.node_id, verdict);

    const policy = { sampling_rate: SAMPLING_RATE } as unknown as PolicyFile;
    render(<RegisterViewHarness role="2LoD" currentPolicyVersion="1.0" policy={policy} />);

    // R15-C1 renegotiation: this row is self-served Low tier ("Cleared" /
    // 'approved' stage), so it sits outside the new 2LoD default "awaiting
    // your sign-off" view — reveal it with Show all, preserving the test's
    // original intent (assert the sampling chip on this row).
    await userEvent.click(await screen.findByRole('button', { name: /show all/i }));
    const label = await screen.findByText('Self-served low tier');
    const row = label.closest('tr')!;
    expect(row).toHaveTextContent(/sampling review due/i);
  });

  it('TC-R12-AB-1-02: no chip once a sampling_reviewed event exists for the verdict', async () => {
    const node = makeUseCaseNode({ node_id: crypto.randomUUID(), label: 'Already reviewed' });
    await addNode(node);
    const verdict = makeVerdict({ use_case_id: node.node_id });
    await seedVerdict(node.node_id, verdict);
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: node.node_id,
      event_type: 'sampling_reviewed',
      occurred_at: new Date().toISOString(),
      actor: '2LoD',
      payload: { type: 'sampling_reviewed', verdict_id: verdict.id, reviewed_by_name: 'Priya Nair' },
    });

    const policy = { sampling_rate: SAMPLING_RATE } as unknown as PolicyFile;
    render(<RegisterViewHarness role="2LoD" currentPolicyVersion="1.0" policy={policy} />);

    // R15-C1 renegotiation: same self-served Low-tier ('approved' stage)
    // row, outside the new default view — see TC-R12-AB-1-01 above.
    await userEvent.click(await screen.findByRole('button', { name: /show all/i }));
    const label = await screen.findByText('Already reviewed');
    const row = label.closest('tr')!;
    expect(row).not.toHaveTextContent(/sampling review due/i);
  });
});
