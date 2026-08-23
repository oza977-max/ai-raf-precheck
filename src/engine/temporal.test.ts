// TC-R12-* (requirements-012.md; ADR-EE-R12-1, ADR-VA-R12-1). Pure island —
// every date is passed in explicitly, never read from a clock.
import { describe, it, expect } from 'vitest';
import { applyReattestExpiry, computeStaleSources, isSampledForReview } from './temporal';
import type { JurisdictionPack, PolicyFile } from './types';

function makePolicy(overrides: Partial<PolicyFile> = {}): PolicyFile {
  return {
    version: '1.0',
    policy_id: 'RAF-001',
    firm_name: 'Test Bank',
    translation_attestation: { attested_by: 'x', role: 'y', date: '2026-01-01', raf_version_checked: 'v1' },
    hard_lines: [],
    tracks: [],
    tiers: [],
    invariants: [],
    controls: [],
    kri_thresholds: {},
    jurisdictions: [],
    roles: {},
    tier_workflow: { Critical: 'x', High: 'x', Medium: 'x', Low: 'x' } as never,
    safety_margin: 0.1,
    ...overrides,
  };
}

function makePack(overrides: Partial<JurisdictionPack> = {}): JurisdictionPack {
  return {
    pack_id: 'PACK-A',
    version: '1.0',
    jurisdiction: 'UK',
    regulator: 'PRA',
    document: 'Doc',
    effective_date: '2024-01-01',
    reviewer_name: 'X',
    reviewer_role: 'Y',
    sign_off_date: '2024-01-01',
    rules: [],
    ...overrides,
  };
}

describe('applyReattestExpiry (TC-R12-MG)', () => {
  it('TC-R12-MG-01: leaves a family entry unchanged when reattest_by is in the future', () => {
    const policy = makePolicy({
      approved_models: [
        { model_id: 'fam', vendor: 'v', provenance_class: 'vendor_hosted', is_approved: true, is_family: true, reattest_by: '2027-01-01' },
      ],
    });
    const result = applyReattestExpiry(policy, '2026-06-01');
    expect(result.approved_models?.[0]?.is_approved).toBe(true);
  });

  it('TC-R12-MG-02: marks is_approved false once past reattest_by (strictly past the date)', () => {
    const policy = makePolicy({
      approved_models: [
        { model_id: 'fam', vendor: 'v', provenance_class: 'vendor_hosted', is_approved: true, is_family: true, reattest_by: '2026-01-01' },
      ],
    });
    const result = applyReattestExpiry(policy, '2026-01-02');
    expect(result.approved_models?.[0]?.is_approved).toBe(false);
  });

  it('TC-R12-MG-03: boundary — ON the reattest_by date itself is still valid (not yet expired)', () => {
    const policy = makePolicy({
      approved_models: [
        { model_id: 'fam', vendor: 'v', provenance_class: 'vendor_hosted', is_approved: true, is_family: true, reattest_by: '2026-01-01' },
      ],
    });
    const result = applyReattestExpiry(policy, '2026-01-01');
    expect(result.approved_models?.[0]?.is_approved).toBe(true);
  });

  it('TC-R12-MG-04: an entry with no reattest_by is untouched, regardless of is_family', () => {
    const policy = makePolicy({
      approved_models: [
        { model_id: 'fam', vendor: 'v', provenance_class: 'vendor_hosted', is_approved: true, is_family: true },
      ],
    });
    const result = applyReattestExpiry(policy, '2099-01-01');
    expect(result.approved_models?.[0]?.is_approved).toBe(true);
  });

  it('TC-R12-MG-05: a non-family entry with reattest_by set (unusual, but valid data) is left unchanged', () => {
    const policy = makePolicy({
      approved_models: [
        { model_id: 'pinned', vendor: 'v', provenance_class: 'vendor_hosted', is_approved: true, reattest_by: '2020-01-01' },
      ],
    });
    const result = applyReattestExpiry(policy, '2026-01-01');
    expect(result.approved_models?.[0]?.is_approved).toBe(true);
  });

  it('TC-R12-MG-06: does not mutate the input policy object', () => {
    const original = makePolicy({
      approved_models: [
        { model_id: 'fam', vendor: 'v', provenance_class: 'vendor_hosted', is_approved: true, is_family: true, reattest_by: '2020-01-01' },
      ],
    });
    const snapshot = JSON.parse(JSON.stringify(original));
    applyReattestExpiry(original, '2026-01-01');
    expect(original).toEqual(snapshot);
  });

  it('TC-R12-MG-07: no approved_models at all — returns the policy untouched', () => {
    const policy = makePolicy();
    const result = applyReattestExpiry(policy, '2026-01-01');
    expect(result).toBe(policy);
  });
});

describe('computeStaleSources (TC-R12-ST)', () => {
  it('TC-R12-ST-01: a pack past its staleness window is reported with days_overdue', () => {
    const packs = [makePack({ pack_id: 'PACK-A', retrieved_date: '2026-01-01', max_staleness_days: 30 })];
    const result = computeStaleSources(packs, '2026-02-05');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      pack_id: 'PACK-A',
      retrieved_date: '2026-01-01',
      max_staleness_days: 30,
      days_overdue: 5,
    });
  });

  it('TC-R12-ST-02: boundary — exactly at the window is NOT overdue', () => {
    const packs = [makePack({ retrieved_date: '2026-01-01', max_staleness_days: 30 })];
    const result = computeStaleSources(packs, '2026-01-31');
    expect(result).toHaveLength(0);
  });

  it('TC-R12-ST-03: one day past the window IS overdue', () => {
    const packs = [makePack({ retrieved_date: '2026-01-01', max_staleness_days: 30 })];
    const result = computeStaleSources(packs, '2026-02-01');
    expect(result).toHaveLength(1);
    expect(result[0]?.days_overdue).toBe(1);
  });

  it('TC-R12-ST-04: a pack missing retrieved_date or max_staleness_days is skipped, not errored', () => {
    const packs = [
      makePack({ pack_id: 'NO-DATE', max_staleness_days: 30 }),
      makePack({ pack_id: 'NO-WINDOW', retrieved_date: '2020-01-01' }),
      makePack({ pack_id: 'NEITHER' }),
    ];
    const result = computeStaleSources(packs, '2026-01-01');
    expect(result).toEqual([]);
  });

  it('TC-R12-ST-05: sorted by pack_id (NF-1)', () => {
    const packs = [
      makePack({ pack_id: 'ZEBRA', retrieved_date: '2020-01-01', max_staleness_days: 1 }),
      makePack({ pack_id: 'ALPHA', retrieved_date: '2020-01-01', max_staleness_days: 1 }),
    ];
    const result = computeStaleSources(packs, '2026-01-01');
    expect(result.map((s) => s.pack_id)).toEqual(['ALPHA', 'ZEBRA']);
  });

  it('TC-R12-ST-06: empty packs array returns empty', () => {
    expect(computeStaleSources([], '2026-01-01')).toEqual([]);
  });
});

describe('isSampledForReview (TC-R12-AB)', () => {
  it('TC-R12-AB-01: deterministic — same id, same rate, same answer across 100 calls', () => {
    const results = new Set<boolean>();
    for (let i = 0; i < 100; i++) {
      results.add(isSampledForReview('verdict-abc-123', 5));
    }
    expect(results.size).toBe(1);
  });

  it('TC-R12-AB-02: rate <= 0 or non-finite is never sampled', () => {
    expect(isSampledForReview('v1', 0)).toBe(false);
    expect(isSampledForReview('v1', -3)).toBe(false);
    expect(isSampledForReview('v1', NaN)).toBe(false);
    expect(isSampledForReview('v1', Infinity)).toBe(false);
  });

  it('TC-R12-AB-03: rate === 1 samples every id', () => {
    for (const id of ['v1', 'v2', 'some-other-id', 'zzzz']) {
      expect(isSampledForReview(id, 1)).toBe(true);
    }
  });

  it('TC-R12-AB-04: distribution sanity — over many distinct ids, roughly 1/K are selected', () => {
    const K = 5;
    let sampled = 0;
    const total = 5000;
    for (let i = 0; i < total; i++) {
      if (isSampledForReview(`verdict-${i}`, K)) sampled++;
    }
    const fraction = sampled / total;
    // Loose bounds — this is a sanity check on distribution, not a precise
    // statistical test.
    expect(fraction).toBeGreaterThan(0.1);
    expect(fraction).toBeLessThan(0.3);
  });

  it('TC-R12-AB-05: no randomness — repeated instantiation across many ids never disagrees with itself', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `verdict-${i}`);
    const first = ids.map((id) => isSampledForReview(id, 5));
    const second = ids.map((id) => isSampledForReview(id, 5));
    expect(second).toEqual(first);
  });

  it('TC-R12-AB-06: non-integer rate is rounded before use', () => {
    // 5.4 rounds to 5 — same behaviour as an explicit 5.
    const idsA = Array.from({ length: 20 }, (_, i) => `x${i}`);
    for (const id of idsA) {
      expect(isSampledForReview(id, 5.4)).toBe(isSampledForReview(id, 5));
    }
  });
});
