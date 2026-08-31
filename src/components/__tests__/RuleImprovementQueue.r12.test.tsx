import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import RuleImprovementQueue, { deriveFiredCounts } from '../RuleImprovementQueue';
import { addNode } from '../../store/register';
import { append } from '../../store/audit';
import type { RegisterNode } from '../../store/types';
import type { Verdict } from '../../types/verdict';

// R12-AB-2: the challenge-rate instrument — a read-only derivation, no new
// writes, over events already loaded by the queue screen.

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    status: 'approved_with_controls',
    tier: 'High',
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
      tripped_invariants: [{ id: 'INV-DATA-01', description: 'x', severity: 'High', required_controls: [], graph_path: '' }],
      binding_reason: null,
      binding_regulatory_basis: null,
      regulatory_chain: [],
    },
    id: 'v-fired-1',
    use_case_id: 'uc-fired',
    living_status: 'approved',
    living_status_updated_at: '2026-01-01T00:00:00.000Z',
    attested_by: '1LoD',
    attested_at: '2026-01-01T00:00:00.000Z',
    graph_version: 1,
    corrections: [],
    ...overrides,
  };
}

describe('deriveFiredCounts (R12-AB-2)', () => {
  it('counts one decided case per verdict-bearing use case that fired the rule, using only the latest verdict', () => {
    const events = [
      {
        event_id: '1',
        use_case_id: 'uc-1',
        event_type: 'verdict_produced' as const,
        occurred_at: '2026-01-01T00:00:00.000Z',
        actor: 'system',
        payload: { type: 'verdict_produced' as const, verdict: makeVerdict({ use_case_id: 'uc-1', id: 'v1' }) },
        prev_hash: null,
        hash: 'test-hash-1',
      },
      // A correction supersedes — the same case must count once, not twice.
      {
        event_id: '2',
        use_case_id: 'uc-1',
        event_type: 'verdict_corrected' as const,
        occurred_at: '2026-01-02T00:00:00.000Z',
        actor: 'system',
        payload: {
          type: 'verdict_corrected' as const,
          original_verdict_id: 'v1',
          new_verdict: makeVerdict({ use_case_id: 'uc-1', id: 'v1b' }),
        },
        prev_hash: 'test-hash-1',
        hash: 'test-hash-2',
      },
      {
        event_id: '3',
        use_case_id: 'uc-2',
        event_type: 'verdict_produced' as const,
        occurred_at: '2026-01-01T00:00:00.000Z',
        actor: 'system',
        payload: { type: 'verdict_produced' as const, verdict: makeVerdict({ use_case_id: 'uc-2', id: 'v2' }) },
        prev_hash: 'test-hash-2',
        hash: 'test-hash-3',
      },
    ];
    const counts = deriveFiredCounts(events);
    expect(counts.get('INV-DATA-01')).toBe(2);
  });
});

async function seedUseCaseWithVerdict(id: string, label: string) {
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
  await append({
    event_id: crypto.randomUUID(),
    use_case_id: id,
    event_type: 'verdict_produced',
    occurred_at: '2026-01-01T00:00:00.000Z',
    actor: 'system',
    payload: { type: 'verdict_produced', verdict: makeVerdict({ use_case_id: id, id: `v-${id}` }) },
  });
  await append({
    event_id: crypto.randomUUID(),
    use_case_id: id,
    event_type: 'rule_dissent_filed',
    occurred_at: '2026-02-01T00:00:00.000Z',
    actor: '2LoD',
    payload: {
      type: 'rule_dissent_filed',
      verdict_id: `v-${id}`,
      rule_id: 'INV-DATA-01',
      dissent: 'Too broad.',
      filed_by_name: 'Priya Nair',
    },
  });
}

describe('RuleImprovementQueue — challenge-rate instrument (R12-AB-2)', () => {
  it('TC-R12-AB-2-01: renders "challenged N times · has applied to M decided cases" per rule', async () => {
    const id = crypto.randomUUID();
    await seedUseCaseWithVerdict(id, 'Client email drafter');
    render(<RuleImprovementQueue />);

    const heading = await screen.findByRole('heading', { level: 3, name: /INV-DATA-01/ });
    const group = heading.closest('li')!;
    // R15-C5 (proposal §3.9): "fired on N decided cases" → "has applied to
    // N decided cases".
    expect(within(group).getByText(/challenged 1 time · has applied to 1 decided case/i)).toBeInTheDocument();
  });
});
