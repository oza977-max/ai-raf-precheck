import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, within } from '@testing-library/react';
import RegisterDetail from '../RegisterDetail';
import { addNode } from '../../store/register';
import { append, getAll } from '../../store/audit';
import type { RegisterNode } from '../../store/types';
import type { Verdict } from '../../types/verdict';
import type { PolicyFile } from '../../engine/types';

// P8-C07 — register-lifecycle.md §15. The sign-off page is where a 2LoD
// reviewer approves a High-tier use case, and it did not show the verdict.
// Charter 004 measured the whole page at 779 characters: the reviewer was
// asked to attest to a decision whose basis the page did not present.
//
// §11.1 constraint (HR3-08): every query here is SCOPED — to a container or a
// role — never a bare single-match on verdict text. This page now renders
// "Approved with controls", which a loose /approved|rejected/i query elsewhere
// in the suite would collide with.

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    status: 'approved_with_controls',
    tier: 'High',
    track: 'II',
    binding_constraint: 'INV-DATA-01',
    binding_path: 'client notes → drafting model → drafted email',
    controls: ['CTRL-ENC-01', 'CTRL-LOG-01'],
    downstream_reviews: [],
    conditions: { hypotheses: ['Volume stays under 500 cases a month.'] },
    policy_version: '1.3',
    pack_versions: {},
    applied_overrides: [],
    confidence_caveats: [],
    provisional_reasons: ['no_regulatory_basis'],
    boundary_proximity: false,
    margin_achieved: 0,
    margin_target: 0.1,
    single_covered_invariants: ['INV-DATA-01'],
    explanation: {
      tier_rationale: null,
      track_rationale: null,
      hard_lines_checked: 4,
      invariants_checked: 6,
      tripped_invariants: [
        {
          id: 'INV-DATA-01',
          description: 'Client PII may not cross into an unapproved zone.',
          severity: 'High',
          regulatory_basis: 'SS1/23 §3.4',
          required_controls: ['CTRL-ENC-01'],
          graph_path: 'client notes → drafting model',
        },
      ],
      binding_reason: null,
      binding_regulatory_basis: null,
      regulatory_chain: [],
    },
    id: 'v-test-1',
    use_case_id: 'uc-test',
    living_status: 'approved',
    living_status_updated_at: '2026-01-01T00:00:00.000Z',
    attested_by: '1LoD',
    attested_at: '2026-01-01T00:00:00.000Z',
    graph_version: 1,
    corrections: [],
    ...overrides,
  };
}

function makeNode(id: string, overrides: Partial<RegisterNode> = {}): RegisterNode {
  return {
    node_id: id,
    node_type: 'use_case',
    label: 'Client email drafter',
    created_at: '2026-01-01T00:00:00.000Z',
    metadata: {
      node_type: 'use_case',
      submitted_by: '1LoD',
      lifecycle_stage: 'pre_checked',
      current_verdict_id: null,
      tier: 'High',
      track: 'II',
    },
    ...overrides,
  } as RegisterNode;
}

const POLICY = {
  version: '1.3',
  controls: [
    { id: 'CTRL-ENC-01', name: 'Encryption at rest', verification_evidence: 'Key rotation log, quarterly.' },
    { id: 'CTRL-LOG-01', name: 'Immutable logging' },
  ],
} as unknown as PolicyFile;

async function seed(useCaseId: string, verdict: Verdict | null) {
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

function renderDetail(useCaseId: string, policy: PolicyFile | undefined = POLICY) {
  return render(
    <StrictMode>
      <RegisterDetail useCaseId={useCaseId} role="2LoD" policy={policy} onBack={vi.fn()} />
    </StrictMode>,
  );
}

/** The verdict region, scoped. Never a bare text query (§11.1). */
async function verdictRegion() {
  return await screen.findByRole('region', { name: /verdict/i });
}

describe('RegisterDetail — the sign-off page shows the verdict (P8-C07)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ACCEPTANCE TEST (TDD-1, outside-in — written first).
  it('TC-R3-RD-1-01: the six decision-bearing elements are present on the sign-off page', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);

    const verdict = within(await verdictRegion());

    // 1 — status and tier
    expect(verdict.getByRole('heading', { name: /with controls/i })).toBeInTheDocument();
    expect(verdict.getByText('High')).toBeInTheDocument();
    // 2 — binding constraint id
    expect(verdict.getAllByText('INV-DATA-01').length).toBeGreaterThan(0);
    // 3 — triggered invariant with its citation
    expect(verdict.getByText(/SS1\/23 §3.4/)).toBeInTheDocument();
    // 4 — control ids in the minimal set
    expect(verdict.getByText(/CTRL-ENC-01/)).toBeInTheDocument();
    expect(verdict.getByText(/CTRL-LOG-01/)).toBeInTheDocument();
    // 5 — governance margin, and the id flagged as having no headroom
    expect(verdict.getByText(/MARGIN/i)).toBeInTheDocument();
    expect(verdict.getByText(/NO HEADROOM/i)).toBeInTheDocument();
    // 6 — standing conditions
    expect(verdict.getByText(/500 cases a month/i)).toBeInTheDocument();
  });

  it('TC-R3-RD-1-03: each control carries its evidence status, so nobody signs believing evidence exists', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);

    const verdict = within(await verdictRegion());
    // CTRL-ENC-01 has verification_evidence in the policy; CTRL-LOG-01 does
    // not. An UNVERIFIED control rendered without its status would let a
    // reviewer sign off believing evidence exists (§15.1).
    expect(verdict.getByText(/VERIFIED/)).toBeInTheDocument();
    expect(verdict.getByText(/UNVERIFIED/)).toBeInTheDocument();
  });

  it('TC-R3-RD-7-01: evidence status comes from current policy while the verdict stays historical', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    // Policy edited since evaluation: the evidence for CTRL-ENC-01 has lapsed.
    const lapsed = {
      version: '1.4',
      controls: [{ id: 'CTRL-ENC-01', name: 'Encryption at rest' }, { id: 'CTRL-LOG-01', name: 'Immutable logging' }],
    } as unknown as PolicyFile;
    renderDetail(id, lapsed);

    const verdict = within(await verdictRegion());
    // The verdict itself is unchanged — it is the record of what was decided.
    expect(verdict.getAllByText('INV-DATA-01').length).toBeGreaterThan(0);
    // But evidence status reflects TODAY: nothing is VERIFIED any more.
    expect(verdict.queryByText(/[^N]VERIFIED/)).toBeNull();
  });

  it('TC-R3-RD-6-01: a Provisional verdict states its cause here too', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);

    const verdict = within(await verdictRegion());
    // A Provisional badge with no cause is the defect TC-R3-JU-6-01 rejects,
    // and it is worse on the page where someone signs their name.
    expect(verdict.getByText(/no jurisdiction pack applied/i)).toBeInTheDocument();
  });

  it('TC-R3-RD-8-01: the reclassification affordance and the reasoning trace do not appear here', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);
    await verdictRegion();

    // Correction is a submitter action (verdict-audit.md §6.1), not a
    // reviewer one. P8-C06 made this buildable by reuse.
    expect(screen.queryByRole('button', { name: /correct this classification/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^reasoning trace$/i)).not.toBeInTheDocument();
  });

  it('TC-R3-RD-4-01: sign-off actions remain available alongside the verdict', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);
    await verdictRegion();

    // The verdict is readable without leaving the page, and reading it does
    // not cost the reviewer the actions they came for.
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request correction/i })).toBeInTheDocument();
  });
});

describe('RegisterDetail — the two states where no verdict can be shown (R3-RD-2)', () => {
  it('TC-R3-RD-2-01/-02: no verdict recorded is stated plainly, and sign-off stays available', async () => {
    const id = crypto.randomUUID();
    await seed(id, null);
    renderDetail(id);

    // The seeded AIGate self-assessment is the real case on every install.
    expect(await screen.findByText(/no verdict is recorded/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /verdict/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
  });

  // REALISTIC-FIXTURE VARIANT (TDD-3). The engine has not produced this shape
  // since V1.1-C01, and it is the one where an empty invariant list would make
  // a false claim: "nothing was triggered" is stronger than "we did not record
  // what was".
  it('TC-R3-RD-2-03: a verdict predating explanation capture says so, rather than showing an empty list', async () => {
    const id = crypto.randomUUID();
    const legacy = makeVerdict({ use_case_id: id }) as unknown as Record<string, unknown>;
    delete legacy.explanation;
    await seed(id, legacy as unknown as Verdict);
    renderDetail(id);

    expect(await screen.findByText(/predates explanation capture/i)).toBeInTheDocument();
    const verdict = within(await verdictRegion());
    // The elements it DOES have are still shown.
    expect(verdict.getByRole('heading', { name: /with controls/i })).toBeInTheDocument();
    expect(verdict.getByText(/CTRL-ENC-01/)).toBeInTheDocument();
  });
});

describe('RegisterDetail — rendering must not write (R3-NF-2)', () => {
  it('TC-R3-NF-2-01: opening the page twice leaves the audit trail unchanged', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    const before = (await getAll(id)).length;

    // Two opens, and StrictMode double-invokes each mount effect — a single
    // open would not catch a write on render. The trail is append-only
    // evidence, so a duplicate cannot be cleaned up afterwards by design.
    const first = renderDetail(id);
    await verdictRegion();
    first.unmount();

    const second = renderDetail(id);
    await verdictRegion();
    second.unmount();

    expect((await getAll(id)).length).toBe(before);
  });
});
