import { describe, it, expect, vi } from 'vitest';
import { StrictMode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import RegisterDetail from '../RegisterDetail';
import { addNode } from '../../store/register';
import { append } from '../../store/audit';
import type { RegisterNode } from '../../store/types';
import type { Verdict } from '../../types/verdict';
import type { PolicyFile } from '../../engine/types';

// R15-C2 (requirements-015.md; proposal §3.1). Skeptic amendment S3 (Must):
// the self-asserted-name caveat already sits at the sign-off block (G5,
// verbatim, untouched here) — this covers the ADDITION: the role indicator
// carries the same no-sign-in honesty AT the point of approval, matching
// App.tsx's "Viewing as" note (R15-C1), not only in the page header. Also
// covers the checklist/section-nav wiring RegisterDetail owns (role + stage
// gating, and the cross-component risk-knowledge anchor).

function makeNode(useCaseId: string): RegisterNode {
  return {
    node_id: useCaseId,
    node_type: 'use_case',
    label: 'Client email drafting assistant',
    created_at: '2026-01-01T00:00:00.000Z',
    metadata: {
      node_type: 'use_case',
      submitted_by: '1LoD',
      lifecycle_stage: 'pre_checked',
    },
  } as RegisterNode;
}

const POLICY = {
  version: '1.3',
  hard_lines: [],
  invariants: [],
  controls: [{ id: 'CTRL-ENC-01', name: 'Encryption at rest', resolves: [] }],
} as unknown as PolicyFile;

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    status: 'approved_with_controls',
    tier: 'High',
    track: 'II',
    binding_constraint: 'INV-DATA-01',
    binding_path: 'client notes → drafting model → drafted email',
    controls: ['CTRL-ENC-01'],
    downstream_reviews: [],
    conditions: { hypotheses: [] },
    policy_version: '1.3',
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
      hard_lines_checked: 4,
      invariants_checked: 6,
      tripped_invariants: [],
      binding_reason: null,
      binding_regulatory_basis: null,
    },
    id: 'v-1',
    use_case_id: useCaseId(),
    living_status: 'approved',
    living_status_updated_at: '2026-01-01T00:00:00.000Z',
    attested_by: '1LoD',
    attested_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Verdict;
}

let lastUseCaseId = 'uc-placeholder';
function useCaseId() {
  return lastUseCaseId;
}

async function seed(useCaseId: string, verdict: Verdict | null) {
  lastUseCaseId = useCaseId;
  await addNode(makeNode(useCaseId));
  await append({
    event_id: crypto.randomUUID(),
    use_case_id: useCaseId,
    event_type: 'use_case_created',
    occurred_at: '2026-01-01T00:00:00.000Z',
    actor: '1LoD',
    payload: { type: 'use_case_created', description: 'Drafts client emails.', intake_method: 'structured_form' },
  });
  if (verdict) {
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: useCaseId,
      event_type: 'verdict_produced',
      occurred_at: '2026-01-02T00:00:00.000Z',
      actor: '1LoD',
      payload: { type: 'verdict_produced', verdict },
    });
  }
}

function renderDetail(useCaseId: string, role: '1LoD' | '2LoD' = '2LoD') {
  return render(
    <StrictMode>
      <RegisterDetail useCaseId={useCaseId} role={role} policy={POLICY} onBack={vi.fn()} />
    </StrictMode>,
  );
}

async function verdictRegion() {
  return await screen.findByRole('region', { name: /verdict/i });
}

describe('RegisterDetail — R15-C2 sign-off honesty and checklist wiring (S3, S2)', () => {
  it('TC-R15-C2-09 (S3, Must): the sign-off block carries a role honesty note at the point of approval', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id, '2LoD');
    await verdictRegion();

    expect(await screen.findByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(
      screen.getByText(/signing off as 2lod — a view preference, not a permission; this build has no sign-in/i),
    ).toBeInTheDocument();

    // G5: the existing self-asserted-name caveat is untouched, verbatim.
    expect(
      screen.getByText(/self-asserted — this build has no sign-in, so the name is not verified/i),
    ).toBeInTheDocument();
  });

  it('TC-R15-C2-10: the "Before you sign off" checklist renders for 2LoD awaiting sign-off, and not for 1LoD', async () => {
    const id2 = crypto.randomUUID();
    await seed(id2, makeVerdict({ use_case_id: id2 }));
    renderDetail(id2, '2LoD');
    await verdictRegion();
    expect(await screen.findByText(/before you sign off/i)).toBeInTheDocument();

    cleanup();

    const id1 = crypto.randomUUID();
    await seed(id1, makeVerdict({ use_case_id: id1 }));
    renderDetail(id1, '1LoD');
    await verdictRegion();
    expect(screen.queryByText(/before you sign off/i)).not.toBeInTheDocument();
  });

  it('TC-R15-C2-11: the risk-knowledge anchor sits outside VerdictDisplay, next to the knowledge-lens content', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id, '2LoD');
    await verdictRegion();

    const anchor = document.getElementById('risk-knowledge-section');
    expect(anchor).toBeInTheDocument();
  });
});
