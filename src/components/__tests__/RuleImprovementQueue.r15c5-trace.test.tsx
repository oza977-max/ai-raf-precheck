import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import RuleImprovementQueue from '../RuleImprovementQueue';
import { addNode } from '../../store/register';
import { append } from '../../store/audit';
import type { RegisterNode } from '../../store/types';

// R15-C5 (proposal §3.9 + §3.10 note): traceability tests for the
// rule-improvement queue's source tag and its untouched intro/caveat copy.
// See test-cases/test-cases-015.md's R15-C5 section for the exact case text
// each test below proves — neither C5-10 nor C5-12 had a prior automated
// test.

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
  filedByName: string,
) {
  await append({
    event_id: crypto.randomUUID(),
    use_case_id: useCaseId,
    event_type: 'rule_dissent_filed',
    occurred_at: occurredAt,
    actor: '2LoD',
    payload: {
      type: 'rule_dissent_filed',
      verdict_id: 'v-r15c5-source-tag',
      rule_id: ruleId,
      dissent,
      filed_by_name: filedByName,
    },
  });
}

describe('TC-R15-C5-10 — the source tag distinguishes a reviewer filing from a risk-knowledge-lens filing', () => {
  it('TC-R15-C5-10: filed_by_name containing "(risk-knowledge lens" tags the entry "filed by the risk-knowledge lens"; any other name tags it "filed by a reviewer"', async () => {
    const ucReviewer = crypto.randomUUID();
    const ucLens = crypto.randomUUID();
    await seedUseCase(ucReviewer, 'Loan pre-screener');
    await seedUseCase(ucLens, 'Client email drafter');
    await fileDissent(
      ucReviewer,
      'INV-R15C5-10',
      'A human-typed objection.',
      '2026-04-01T00:00:00.000Z',
      'Priya Nair',
    );
    await fileDissent(
      ucLens,
      'INV-R15C5-10',
      'An automatically filed objection.',
      '2026-04-02T00:00:00.000Z',
      '2LoD (risk-knowledge lens, coverage gap)',
    );

    render(<RuleImprovementQueue />);
    const heading = await screen.findByRole('heading', { level: 3, name: /INV-R15C5-10/ });
    const group = heading.closest('li')!;
    const tags = Array.from(group.querySelectorAll('.rule-queue__source-tag')).map((t) => t.textContent);
    // Newest first within the rule: the lens-filed entry (04-02) precedes
    // the reviewer-filed one (04-01).
    expect(tags).toEqual(['filed by the risk-knowledge lens', 'filed by a reviewer']);
  });
});

describe('TC-R15-C5-12 — the advisory intro and append-only caveat are pinned verbatim', () => {
  it('TC-R15-C5-12: .rule-queue__intro and .rule-queue__caveat render their exact current copy, unchanged by the R15-C5 relabel', async () => {
    const { container } = render(<RuleImprovementQueue />);
    // Settle the async load regardless of what this file's other test left
    // in the shared per-file store — the intro/caveat render unconditionally
    // either way, but this avoids asserting mid-flight.
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());

    const intro = container.querySelector('.rule-queue__intro');
    const caveat = container.querySelector('.rule-queue__caveat');
    expect(intro).not.toBeNull();
    expect(caveat).not.toBeNull();

    expect(intro!.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Challenges filed against rules — not against use cases. When a 2LoD reviewer thinks a rule is wrong, too broad, or missing a distinction, the challenge lands here for the people who author the rulebook. It is advisory by construction: a dissent never changes a verdict, and nothing in this queue feeds back into the engine. Rule changes happen the same way they always do — a human edits the appetite framework or a pack, and signs it off.',
    );
    expect(caveat!.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Derived from the append-only audit trail, so filing a challenge is permanent. Today the challengers are people; the queue is also where an advisory machine reviewer would file, if one is ever added — through the same event, marked as such, with no more authority than a human dissent has here: none over the verdict.',
    );
  });
});
