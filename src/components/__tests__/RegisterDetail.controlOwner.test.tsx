import { describe, it, expect, vi } from 'vitest';
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterDetail from '../RegisterDetail';
import { addNode } from '../../store/register';
import { append, getAll } from '../../store/audit';
import type { RegisterNode, LifecycleStage } from '../../store/types';
import type { Verdict } from '../../types/verdict';
import type { PolicyFile } from '../../engine/types';

// design-vision.md L-6 / explore-007 D-003 follow-up: completion tracking on
// outstanding controls. The invariant every test here defends: assignment is
// scoped honestly — a name, a target date, an age, an overdue flag — and
// nothing that would imply automation (no reminders, no notifications).

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
          graph_path: 'client notes → drafting model',
        },
      ],
      binding_reason: null,
      binding_regulatory_basis: null,
      regulatory_chain: [],
    },
    id: 'v-owner-1',
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
        // No verification_evidence — ABSENT = unverified/outstanding (BC-V13-02).
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

const ownerships = async (id: string) =>
  (await getAll(id)).filter((e) => e.payload.type === 'control_ownership_assigned');

// The control name renders twice on this page — once in the "What you need
// to do" todo list (the one with the assign form), once in the read-only
// controls summary further down. The todo-list copy is the first match.
async function openOutstandingControl() {
  const user = userEvent.setup();
  const [heading] = await screen.findAllByText('Encrypt client notes at rest');
  await user.click(heading);
  return user;
}

describe('RegisterDetail — assigning an owner to an outstanding control', () => {
  it('TC-L6-01: records the owner, target date, control and verdict id', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ id: 'v-seen', use_case_id: id }));
    renderDetail(id);

    const user = await openOutstandingControl();
    await user.type(screen.getByPlaceholderText(/name \(not verified\)/i), 'Priya Nair');
    fireEvent.change(screen.getByLabelText(/target date/i), { target: { value: '2026-09-15' } });
    await user.click(screen.getByRole('button', { name: /^assign$/i }));

    await waitFor(async () => expect((await ownerships(id)).length).toBe(1));
    const [written] = (await ownerships(id)) as [import('../../store/types').AuditEvent];
    const p = written.payload as Extract<typeof written.payload, { type: 'control_ownership_assigned' }>;
    expect(p.control_id).toBe('CTRL-ENC-01');
    expect(p.owner_name).toBe('Priya Nair');
    expect(p.target_date).toBe('2026-09-15');
    expect(p.verdict_id).toBe('v-seen');
  });

  it('TC-L6-02: renders the assignment with age, and flags an overdue target date', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: id,
      event_type: 'control_ownership_assigned',
      occurred_at: '2026-01-03T00:00:00.000Z',
      actor: '2LoD',
      payload: {
        type: 'control_ownership_assigned',
        verdict_id: 'v-owner-1',
        control_id: 'CTRL-ENC-01',
        owner_name: 'Priya Nair',
        target_date: '2020-01-01',
      },
    });
    renderDetail(id);

    await openOutstandingControl();
    const owner = await screen.findByText((_, el) => Boolean(el?.classList.contains('verdict__todo-owner')));
    expect(owner.textContent).toMatch(/priya nair/i);
    expect(owner.textContent).toMatch(/overdue/i);
  });

  it('TC-L6-03: re-assigning writes a new event and the UI shows the latest', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ id: 'v-seen', use_case_id: id }));
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: id,
      event_type: 'control_ownership_assigned',
      occurred_at: '2026-01-03T00:00:00.000Z',
      actor: '2LoD',
      payload: {
        type: 'control_ownership_assigned',
        verdict_id: 'v-seen',
        control_id: 'CTRL-ENC-01',
        owner_name: 'Priya Nair',
        target_date: '2026-06-01',
      },
    });
    renderDetail(id);

    const user = await openOutstandingControl();
    await user.click(await screen.findByRole('button', { name: /reassign/i }));
    await user.clear(screen.getByPlaceholderText(/name \(not verified\)/i));
    await user.type(screen.getByPlaceholderText(/name \(not verified\)/i), 'Marcus Lee');
    fireEvent.change(screen.getByLabelText(/target date/i), { target: { value: '2026-12-01' } });
    await user.click(screen.getByRole('button', { name: /^assign$/i }));

    await waitFor(async () => expect((await ownerships(id)).length).toBe(2));
    const owner = await screen.findByText((_, el) => Boolean(el?.classList.contains('verdict__todo-owner')));
    expect(owner.textContent).toMatch(/marcus lee/i);
  });

  it('TC-L6-04: a double-click assigns one owner, not two (append-only discipline)', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);

    const user = await openOutstandingControl();
    await user.type(screen.getByPlaceholderText(/name \(not verified\)/i), 'Priya Nair');
    fireEvent.change(screen.getByLabelText(/target date/i), { target: { value: '2026-09-15' } });
    const button = screen.getByRole('button', { name: /^assign$/i });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(async () => expect((await ownerships(id)).length).toBeGreaterThan(0));
    expect(await ownerships(id)).toHaveLength(1);
  });
});
