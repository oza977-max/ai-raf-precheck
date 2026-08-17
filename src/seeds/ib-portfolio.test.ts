import { describe, it, expect } from 'vitest';
import { seedIbPortfolio, ibCaseCount, IB_PREFIX } from './ib-portfolio';
import { loadPolicy } from '../store/policy';
import { loadPacks } from '../store/packs';
import { getPackSources } from '../store/pack-source';
import { getUseCases } from '../store/register';
import { getAllForExport } from '../store/audit';
import appetiteYaml from '../../policy/appetite.yaml?raw';

// IB portfolio seed (2026-08-17): real engine, real audit shapes, a
// deliberate lifecycle mix. These assertions are about the CONTRACT the
// human test relies on — approved chains exist, the 2LoD queue has work,
// the correction request and the rule challenge are on the record.

describe('seedIbPortfolio', () => {
  it('seeds the full portfolio with a genuine lifecycle mix', async () => {
    const policyResult = loadPolicy(appetiteYaml);
    expect(policyResult.valid).toBe(true);
    if (!policyResult.valid) return;
    const packs = loadPacks(getPackSources()).packs;

    const seeded = await seedIbPortfolio(policyResult.policy, packs);
    expect(seeded).toBe(ibCaseCount());

    const rows = (await getUseCases('all')).filter((r) => r.use_case_id.startsWith(IB_PREFIX));
    expect(rows).toHaveLength(ibCaseCount());

    // The mix the human test needs:
    const approved = rows.filter((r) => r.lifecycle_stage === 'approved');
    const pending = rows.filter((r) => r.lifecycle_stage === 'pre_checked');
    expect(approved.length).toBeGreaterThanOrEqual(4); // full 1LoD→2LoD chains
    expect(pending.length).toBeGreaterThanOrEqual(3);  // real work in the 2LoD queue
    // Genuinely different outcomes across the portfolio:
    const statuses = new Set(rows.map((r) => r.current_verdict_status));
    expect(statuses.size).toBeGreaterThanOrEqual(2);
    expect(statuses.has('rejected')).toBe(true); // the FX agent and/or deal memo

    const events = (await getAllForExport()).filter((e) => e.use_case_id.startsWith(IB_PREFIX));
    // Approvals write the same two events the sign-off page writes.
    const reviews = events.filter((e) => e.payload.type === 'twoloD_reviewed');
    expect(reviews.filter((e) => e.payload.type === 'twoloD_reviewed' && e.payload.action === 'approved').length).toBeGreaterThanOrEqual(4);
    const corrections = reviews.filter((e) => e.payload.type === 'twoloD_reviewed' && e.payload.action === 'correction_requested');
    expect(corrections).toHaveLength(1);
    expect(corrections[0]!.payload.type === 'twoloD_reviewed' && corrections[0]!.payload.notes).toContain('data-processing agreement');
    // Reviewer names are marked as seeded samples — nobody real is implied.
    for (const r of reviews) {
      expect(r.payload.type === 'twoloD_reviewed' && r.payload.attested_by_name).toMatch(/\(seeded sample\)$/);
    }
    // The rule challenge is filed against a rule the verdict relied on.
    const challenges = events.filter((e) => e.payload.type === 'rule_dissent_filed');
    expect(challenges).toHaveLength(1);
    expect(challenges[0]!.payload.type === 'rule_dissent_filed' && challenges[0]!.payload.rule_id).toBeTruthy();

    // Idempotent: a second call adds nothing (append-only trail protected).
    expect(await seedIbPortfolio(policyResult.policy, packs)).toBe(0);
  });
});
