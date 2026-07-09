import type { AppliedOverride, JurisdictionEntry, Tier, Track } from './types';

// resolveActivePacks (evaluation-engine.md §3.2): looks up a loaded pack per
// jurisdiction code. No pack-loading chunk exists yet (P2-C03 is human-led
// pack authoring, not yet built) — every jurisdiction currently resolves to
// "no pack registered", which is spec-mandated warning behavior, not an
// error. Returns [] until a pack-loading chunk wires in `loadedPacks`.
export function resolveActivePacks(
  jurisdictions: string[],
  _jurisdictionRegistry: JurisdictionEntry[],
): { code: string; warning: string }[] {
  return jurisdictions.map((code) => ({
    code,
    warning: `no jurisdiction pack loaded for "${code}" — no override applied`,
  }));
}

export interface JurisdictionOverrideResult {
  finalTrack: Track;
  finalTier: Tier;
  appliedOverrides: AppliedOverride[];
}

// applyJurisdictionOverrides (evaluation-engine.md §3.6): pass-through until
// a pack-loading chunk provides real JurisdictionPack objects. Documented
// deviation, not a silent no-op — see build/prompts/P3-C01.md deliverable 3.
export function applyJurisdictionOverrides(baseTrack: Track, baseTier: Tier): JurisdictionOverrideResult {
  return { finalTrack: baseTrack, finalTier: baseTier, appliedOverrides: [] };
}
