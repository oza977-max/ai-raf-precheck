import { describe, it, expect } from 'vitest';
import { applyJurisdictionOverrides, resolveActivePacks } from './jurisdiction';

describe('resolveActivePacks', () => {
  it('returns a warning for every jurisdiction — no pack-loading chunk exists yet', () => {
    const result = resolveActivePacks(['UK', 'US'], []);
    expect(result).toHaveLength(2);
    expect(result[0]?.warning).toContain('no jurisdiction pack loaded');
  });

  it('returns [] for an empty jurisdiction list', () => {
    expect(resolveActivePacks([], [])).toEqual([]);
  });
});

describe('applyJurisdictionOverrides', () => {
  it('is a documented pass-through — base track/tier unchanged, no overrides applied', () => {
    const result = applyJurisdictionOverrides('II', 'High');
    expect(result).toEqual({ finalTrack: 'II', finalTier: 'High', appliedOverrides: [] });
  });
});
