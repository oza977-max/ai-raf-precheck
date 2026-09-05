import { describe, it, expect, vi } from 'vitest';
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterDetail from '../RegisterDetail';
import { addNode } from '../../store/register';
import { append, getAll } from '../../store/audit';
import type { RegisterNode, LifecycleStage } from '../../store/types';
import type { Verdict } from '../../types/verdict';

// Rule dissent (FN-009). A 2LoD reviewer can challenge a RULE the verdict
// relied on. The invariant every test here defends from a different angle:
// ADVISORY BY CONSTRUCTION — filing a dissent writes exactly one
// rule_dissent_filed event and nothing else. No lifecycle change, no
// attestation, no verdict mutation. The dissent-panel design lives or dies
// on that property, because the moment a dissent can move a decision it is
// an override channel, not a dissent.
//
// §11.1 discipline as in RegisterDetail.test.tsx: queries scoped or exact —
// this page renders "Approved with controls".

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
    id: 'v-dissent-1',
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
      <RegisterDetail useCaseId={useCaseId} role={role} onBack={vi.fn()} />
    </StrictMode>,
  );
}

const toggle = () => screen.findByRole('button', { name: /challenge a rule/i });

async function openAndFill(opts: { rule?: string; text?: string; name?: string }) {
  const user = userEvent.setup();
  await user.click(await toggle());
  if (opts.rule) await user.selectOptions(screen.getByLabelText(/rule being challenged/i), opts.rule);
  if (opts.text) await user.type(screen.getByLabelText(/why the rule is wrong/i), opts.text);
  if (opts.name) await user.type(screen.getByLabelText(/filed by/i), opts.name);
  return user;
}

const dissents = async (id: string) => (await getAll(id)).filter((e) => e.payload.type === 'rule_dissent_filed');

describe('RegisterDetail — filing a rule dissent (FN-009)', () => {
  it('TC-R4-RC-1-01: records the rule, the reasoning, the name and the rendered verdict id', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ id: 'v-seen', use_case_id: id }));
    renderDetail(id);

    const user = await openAndFill({
      rule: 'INV-DATA-01',
      text: 'Pseudonymised data should not trip this invariant.',
      name: 'Priya Nair',
    });
    await user.click(screen.getByRole('button', { name: /file the challenge/i }));

    // "File the challenge" is fire-and-forget (`() => void handleFileDissent()`),
    // so `user.click` resolves once the synchronous dispatch is done, not once
    // the async write lands. Reading the trail immediately after the click
    // races the write under load (intermittent full-suite-only failure — CI
    // flake fix, 2026-09-01).
    const filed = await waitFor(async () => {
      const [found] = await dissents(id);
      expect(found).toBeDefined();
      return found!;
    });
    const p = filed.payload as Extract<typeof filed.payload, { type: 'rule_dissent_filed' }>;
    expect(p.rule_id).toBe('INV-DATA-01');
    expect(p.rule_label).toBe('Client PII may not cross into an unapproved zone.');
    expect(p.dissent).toBe('Pseudonymised data should not trip this invariant.');
    expect(p.filed_by_name).toBe('Priya Nair');
    // The id of the verdict the challenger was shown — threaded from the
    // render, the same discipline as the attestation's verdict_id (§13.4).
    expect(p.verdict_id).toBe('v-seen');
    expect(filed.actor).toBe('2LoD');
  });

  it('TC-R4-RC-2-01: ADVISORY BY CONSTRUCTION — filing writes the dissent event and nothing else', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    const before = (await getAll(id)).length;
    renderDetail(id);

    const user = await openAndFill({ rule: 'INV-DATA-01', text: 'Too broad.', name: 'Priya Nair' });
    await user.click(screen.getByRole('button', { name: /file the challenge/i }));
    await screen.findByText(/challenge recorded/i);

    const after = await getAll(id);
    // Exactly one new event — no lifecycle_stage_changed, no twoloD_reviewed,
    // no verdict_corrected riding along. A dissent that moves anything else
    // is an override channel, which is the one thing this must never be.
    expect(after.length).toBe(before + 1);
    expect(after.filter((e) => e.payload.type === 'lifecycle_stage_changed')).toHaveLength(0);
    expect(after.filter((e) => e.payload.type === 'twoloD_reviewed')).toHaveLength(0);
    // And the page says so.
    expect(screen.getByText(/never overrides/i)).toBeInTheDocument();
  });

  it('TC-R4-RC-3-01: offers the rules THIS verdict relied on, from its own explanation', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);
    const user = userEvent.setup();
    await user.click(await toggle());

    const select = screen.getByLabelText<HTMLSelectElement>(/rule being challenged/i);
    const values = [...select.options].map((o) => o.value);
    expect(values).toContain('TIER-PII-01');
    expect(values).toContain('INV-DATA-01');
    expect(values).toContain('__other__');
  });

  it('TC-R4-RC-3-02: a free-typed rule reference is recorded without a resolved label', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);

    const user = await openAndFill({ rule: '__other__', text: 'This rule should exist and does not.', name: 'Priya Nair' });
    await user.type(screen.getByLabelText(/rule reference/i), '  INV-MISSING-9  ');
    await user.click(screen.getByRole('button', { name: /file the challenge/i }));

    // Same fire-and-forget race as TC-R4-RC-1-01 above (CI flake fix, 2026-09-01).
    const filed = await waitFor(async () => {
      const [found] = await dissents(id);
      expect(found).toBeDefined();
      return found!;
    });
    const p = filed.payload as Extract<typeof filed.payload, { type: 'rule_dissent_filed' }>;
    expect(p.rule_id).toBe('INV-MISSING-9');
    // A typed reference was never resolved against the rulebook, so carrying
    // a label would claim a match that was not made.
    expect(p.rule_label).toBeUndefined();
  });

  it.each([
    ['no rule picked', { text: 'Reasoning.', name: 'Priya Nair' }, /name the rule/i],
    ['no reasoning', { rule: 'INV-DATA-01', name: 'Priya Nair' }, /nothing to act on/i],
    ['no name', { rule: 'INV-DATA-01', text: 'Reasoning.' }, /enter your name/i],
  ])('TC-R4-RC-4-01: refuses to file with %s, and records nothing', async (_label, fill, message) => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);

    const user = await openAndFill(fill);
    await user.click(screen.getByRole('button', { name: /file the challenge/i }));

    // Text query, not findByRole('alert'): VerdictDisplay already renders an
    // alert on this page, so a bare role query is ambiguous (§11.1 spirit).
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(await dissents(id)).toHaveLength(0);
  });

  it('TC-R4-NF-2-02: a double-click files one dissent, not two (append-only discipline)', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);

    await openAndFill({ rule: 'INV-DATA-01', text: 'Too broad.', name: 'Priya Nair' });
    const file = screen.getByRole('button', { name: /file the challenge/i });
    fireEvent.click(file);
    fireEvent.click(file);

    await waitFor(async () => expect((await dissents(id)).length).toBeGreaterThan(0));
    expect(await dissents(id)).toHaveLength(1);
  });
});

describe('RegisterDetail — where the dissent affordance appears', () => {
  it('TC-R4-RC-6-01: is offered to 2LoD even after the case advanced past sign-off', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }), 'approved');
    renderDetail(id);
    // Deliberately not stage-gated: a rule can be wrong on a case that
    // already advanced, and catching that is the queue's whole point.
    expect(await toggle()).toBeInTheDocument();
  });

  it('TC-R4-RC-6-02: is not offered to 1LoD', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id, '1LoD');
    await screen.findByRole('region', { name: /verdict/i });
    expect(screen.queryByRole('button', { name: /challenge a rule/i })).toBeNull();
  });

  it('TC-R4-RC-6-03: is not offered when no verdict exists — no rule was applied, nothing to challenge', async () => {
    const id = crypto.randomUUID();
    await seed(id, null);
    renderDetail(id);
    await screen.findByText(/no verdict is recorded/i);
    expect(screen.queryByRole('button', { name: /challenge a rule/i })).toBeNull();
  });
});

// R5 follow-up (user: "how would a user know what is Zone A? what is ML?").
// Tier and track were the last untranslated values on this page.
describe('RegisterDetail — tier and track explained in plain words', () => {
  it('renders the meanings for the tier and track on the record', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);
    await screen.findByRole('region', { name: /verdict/i });
    expect(screen.getByText(/a lot could go wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/replaces a prior model or acts with high autonomy/i)).toBeInTheDocument();
  });
});
