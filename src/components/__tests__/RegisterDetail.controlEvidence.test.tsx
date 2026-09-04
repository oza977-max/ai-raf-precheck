import { describe, it, expect, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterDetail from '../RegisterDetail';
import { addNode } from '../../store/register';
import { append, getAll } from '../../store/audit';
import type { RegisterNode, LifecycleStage } from '../../store/types';
import type { Verdict } from '../../types/verdict';
import type { PolicyFile } from '../../engine/types';

// RG-7 — control-evidence attestation. The invariant every test defends: a
// reviewer can attest a control is IN PLACE on the record, with an evidence
// note, and it is rendered as a human claim ("not verified"), never as
// machine-verified. This is what lets "approved with controls" reach "all
// controls addressed" from inside the app.

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    status: 'approved_with_controls',
    tier: 'High',
    track: 'II',
    binding_constraint: 'INV-DATA-01',
    binding_path: 'a → b',
    controls: ['CTRL-ENC-01'],
    downstream_reviews: [],
    conditions: { hypotheses: [] },
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
      tier_rationale: { rule_id: 'TIER-PII-01', rule_name: 'Personal data forces High tier' },
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
          graph_path: 'a → b',
        },
      ],
      binding_reason: null,
      binding_regulatory_basis: null,
      regulatory_chain: [],
    },
    id: 'v-ev-1',
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

function makePolicy(): PolicyFile {
  return {
    version: '1.3',
    hard_lines: [],
    invariants: [],
    tracks: [],
    tiers: [],
    controls: [
      {
        id: 'CTRL-ENC-01',
        name: 'Encrypt client notes at rest',
        description: 'Client notes must be encrypted at rest using firm-approved keys.',
        resolves: ['INV-DATA-01'],
        burden: 2,
        verification: 'Storage config shows encryption enabled.',
      },
    ],
  } as unknown as PolicyFile;
}

async function seed(useCaseId: string, verdict: Verdict | null, stage: LifecycleStage = 'pre_checked') {
  await addNode({
    node_id: useCaseId,
    node_type: 'use_case',
    label: 'Client email drafter',
    created_at: '2026-01-01T00:00:00.000Z',
    metadata: {
      node_type: 'use_case',
      submitted_by: '1LoD',
      lifecycle_stage: stage,
      current_verdict_id: null,
      tier: 'High',
      track: 'II',
    },
  } as RegisterNode);
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
      <RegisterDetail useCaseId={useCaseId} role={role} onBack={vi.fn()} policy={makePolicy()} />
    </StrictMode>,
  );
}

const attestations = async (id: string) =>
  (await getAll(id)).filter((e) => e.payload.type === 'control_evidence_attested');

async function openOutstandingControl() {
  const user = userEvent.setup();
  const headings = await screen.findAllByText('Encrypt client notes at rest');
  await user.click(headings[0]!);
  return user;
}

describe('RegisterDetail — attesting a control is in place (RG-7)', () => {
  it('records the attester and evidence note against the current verdict', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ id: 'v-seen', use_case_id: id }));
    renderDetail(id);

    const user = await openOutstandingControl();
    await user.type(screen.getByLabelText(/attested by/i), 'Priya Nair');
    await user.type(screen.getByLabelText(/^evidence$/i), 'JIRA-4821, TLS export attached');
    await user.click(screen.getByRole('button', { name: /^attest in place$/i }));

    await waitFor(async () => expect((await attestations(id)).length).toBe(1));
    const [written] = (await attestations(id)) as [import('../../store/types').AuditEvent];
    const p = written.payload as Extract<typeof written.payload, { type: 'control_evidence_attested' }>;
    expect(p.control_id).toBe('CTRL-ENC-01');
    expect(p.attested_by_name).toBe('Priya Nair');
    expect(p.evidence_note).toBe('JIRA-4821, TLS export attached');
    expect(p.verdict_id).toBe('v-seen');
  });

  it('renders an attested control as a human claim, not machine-verified', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: id,
      event_type: 'control_evidence_attested',
      occurred_at: '2026-01-03T00:00:00.000Z',
      actor: '2LoD',
      payload: {
        type: 'control_evidence_attested',
        verdict_id: 'v-ev-1',
        control_id: 'CTRL-ENC-01',
        attested_by_name: 'Priya Nair',
        evidence_note: 'config export on file',
      },
    });
    renderDetail(id);

    await openOutstandingControl();
    const line = await screen.findByText((_, el) => Boolean(el?.classList.contains('verdict__todo-attested')));
    expect(line.textContent).toMatch(/priya nair/i);
    expect(line.textContent).toMatch(/name not verified/i);
    expect(line.textContent).toMatch(/config export on file/i);
    // The chip on the summary says "attested", not "in place".
    const chip = document.querySelector('.verdict__todo-chip--attested');
    expect(chip?.textContent).toMatch(/attested/i);
    expect(document.querySelector('.verdict__todo-chip--in')).toBeNull();
  });

  it('the sign-off checklist counts an attestation as addressed but keeps it separate from machine-verified', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: id,
      event_type: 'control_evidence_attested',
      occurred_at: '2026-01-03T00:00:00.000Z',
      actor: '2LoD',
      payload: {
        type: 'control_evidence_attested',
        verdict_id: 'v-ev-1',
        control_id: 'CTRL-ENC-01',
        attested_by_name: 'Priya Nair',
        evidence_note: 'config export',
      },
    });
    renderDetail(id, '2LoD'); // 2LoD sees the sign-off checklist

    // "0 outstanding" — the one control is addressed; and the evidence line
    // names it as reviewer-attested, not machine-verified.
    expect(await screen.findByText(/0 outstanding · 1 in place/i)).toBeInTheDocument();
    expect(screen.getByText(/1 attested by a reviewer \(not verified\)/i)).toBeInTheDocument();
    expect(screen.getByText(/0 machine-verified/i)).toBeInTheDocument();
  });

  it('a double-click attests once, not twice (append-only discipline)', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);

    const user = await openOutstandingControl();
    await user.type(screen.getByLabelText(/attested by/i), 'Priya Nair');
    await user.type(screen.getByLabelText(/^evidence$/i), 'evidence');
    const btn = screen.getByRole('button', { name: /^attest in place$/i });
    await user.click(btn);
    await user.click(btn).catch(() => {});

    await waitFor(async () => expect((await attestations(id)).length).toBeGreaterThan(0));
    expect(await attestations(id)).toHaveLength(1);
  });
});
