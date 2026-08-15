import { describe, it, expect } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, within } from '@testing-library/react';
import RuleImprovementQueue from '../RuleImprovementQueue';
import { addNode } from '../../store/register';
import { append, getAllForExport } from '../../store/audit';
import type { RegisterNode } from '../../store/types';

// Rule-improvement queue (FN-009): the receiving end of rule_dissent_filed.
// Derived from the audit trail, grouped by rule, advisory-only and says so.

async function seedUseCase(id: string, label: string) {
  await addNode({
    node_id: id,
    node_type: 'use_case',
    label,
    created_at: '2026-01-01T00:00:00.000Z',
    metadata: {
      node_type: 'use_case',
      submitted_by: '1LoD',
      lifecycle_stage: 'pre_checked',
      current_verdict_id: null,
      tier: 'High',
      track: 'II',
    },
  } as RegisterNode);
}

async function fileDissent(
  useCaseId: string,
  ruleId: string,
  dissent: string,
  occurredAt: string,
  ruleLabel?: string,
) {
  await append({
    event_id: crypto.randomUUID(),
    use_case_id: useCaseId,
    event_type: 'rule_dissent_filed',
    occurred_at: occurredAt,
    actor: '2LoD',
    payload: {
      type: 'rule_dissent_filed',
      verdict_id: 'v-queue-test',
      rule_id: ruleId,
      ...(ruleLabel ? { rule_label: ruleLabel } : {}),
      dissent,
      filed_by_name: 'Priya Nair',
    },
  });
}

const renderQueue = () =>
  render(
    <StrictMode>
      <RuleImprovementQueue />
    </StrictMode>,
  );

describe('RuleImprovementQueue', () => {
  it('with no dissents, says so and points at where one is filed from', async () => {
    renderQueue();
    expect(await screen.findByRole('status')).toHaveTextContent(/no rule challenges have been filed/i);
    expect(screen.getByRole('status')).toHaveTextContent(/sign-off page/i);
  });

  it('groups dissents by rule, newest first within a rule, and names the challenger and use case', async () => {
    const ucA = crypto.randomUUID();
    const ucB = crypto.randomUUID();
    await seedUseCase(ucA, 'Client email drafter');
    await seedUseCase(ucB, 'Loan pre-screener');
    await fileDissent(ucA, 'INV-DATA-01', 'Older objection.', '2026-02-01T00:00:00.000Z', 'Client PII rule');
    await fileDissent(ucB, 'INV-DATA-01', 'Newer objection.', '2026-03-01T00:00:00.000Z');
    await fileDissent(ucA, 'TIER-PII-01', 'Tier objection.', '2026-02-15T00:00:00.000Z');

    renderQueue();

    const groups = await screen.findAllByRole('heading', { level: 3 });
    // Sorted by rule id — deterministic, matching the product's ordering
    // discipline everywhere else.
    expect(groups.map((h) => h.textContent)).toEqual(['INV-DATA-01 — Client PII rule', 'TIER-PII-01']);

    const invGroup = groups[0]!.closest('li')!;
    expect(within(invGroup).getByText(/2 challenges/i)).toBeInTheDocument();
    const bodies = within(invGroup).getAllByText(/objection/i).map((n) => n.textContent);
    expect(bodies[0]).toContain('Newer objection.');
    expect(bodies[1]).toContain('Older objection.');
    // The use case is named, not just an id — the rule authors need to see
    // the case that provoked the challenge.
    expect(within(invGroup).getByText(/Loan pre-screener/)).toBeInTheDocument();
    expect(within(invGroup).getAllByText(/Priya Nair \(name not verified\)/).length).toBe(2);
  });

  it('states its advisory posture: a dissent never changes a verdict', async () => {
    renderQueue();
    // The posture statements are static copy — present regardless of what the
    // shared per-file DB holds by the time this test runs.
    expect(await screen.findByText(/never changes a verdict/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing in this queue feeds back into the engine/i)).toBeInTheDocument();
  });

  it('never renders /approved|rejected/i — the reserved-words trap (lesson 2)', async () => {
    const uc = crypto.randomUUID();
    await seedUseCase(uc, 'Client email drafter');
    await fileDissent(uc, 'INV-DATA-01', 'A perfectly ordinary objection.', '2026-02-01T00:00:00.000Z');
    const { container } = renderQueue();
    await screen.findAllByRole('heading', { level: 3 });
    // Static copy only — dissent TEXT is user-authored and may contain
    // anything; this guards the strings this screen itself contributes.
    expect(container.textContent).not.toMatch(/approved|rejected/i);
  });

  it('renders a hostile dissent as text, never as markup [SECURITY]', async () => {
    const uc = crypto.randomUUID();
    await seedUseCase(uc, 'Client email drafter');
    await fileDissent(uc, 'INV-DATA-01', 'Fine because <img src=x onerror="alert(1)"> handles it.', '2026-02-01T00:00:00.000Z');

    const { container } = renderQueue();
    await screen.findAllByRole('heading', { level: 3 });
    expect(screen.getByText(/<img src=x onerror=/)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('rendering must not write (R3-NF-2): opening twice leaves the trail unchanged', async () => {
    const uc = crypto.randomUUID();
    await seedUseCase(uc, 'Client email drafter');
    await fileDissent(uc, 'INV-DATA-01', 'An objection.', '2026-02-01T00:00:00.000Z');
    const before = (await getAllForExport()).length;

    const first = renderQueue();
    await screen.findAllByRole('heading', { level: 3 });
    first.unmount();
    const second = renderQueue();
    await screen.findAllByRole('heading', { level: 3 });
    second.unmount();

    expect((await getAllForExport()).length).toBe(before);
  });
});
