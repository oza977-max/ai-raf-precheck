import { matchesCondition, describeGraphPath } from './condition';
import type {
  AppliedOverride,
  ConfidenceCaveat,
  DataFlowGraph,
  JurisdictionEntry,
  JurisdictionPack,
  PackRule,
  RegulatoryChainEntry,
  Tier,
  Track,
} from './types';

// V2-A: REAL pack resolution and override application, replacing the
// P3-C01 pass-through stubs. Rule 1: pure — active packs and rules are
// sorted by id; effects are a pure function of (graph, tier, packs).

const TIER_RANK: Record<Tier, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

// NF-7: a reviewer_name OR sign_off_date still carrying a [..]
// placeholder is UNSIGNED — an un-dated sign-off is not a sign-off
// (review finding, pass 1). The rule is a proposed interpretation, and
// any verdict relying on it must surface as provisional (BC-V2A-03).
export function isUnsigned(rule: PackRule): boolean {
  return /\[[^\]]*\]/.test(rule.reviewer_name) || /\[[^\]]*\]/.test(rule.sign_off_date);
}

export function resolveActivePacks(
  jurisdictions: string[],
  _jurisdictionRegistry: JurisdictionEntry[],
  loadedPacks: JurisdictionPack[] = [],
): JurisdictionPack[] {
  return loadedPacks
    .filter((p) => jurisdictions.includes(p.jurisdiction))
    .sort((a, b) => a.pack_id.localeCompare(b.pack_id));
}

export function caveatForFiredRule(rule: PackRule): ConfidenceCaveat | null {
  const cite = `${rule.source.document} ${rule.source.section}`;
  if (isUnsigned(rule)) {
    return {
      ruleId: rule.id,
      field: 'jurisdiction_pack',
      confidence: 'low',
      reason: `${cite} — proposed interpretation, pending firm adoption (rule is unsigned; NF-7)`,
    };
  }
  if (rule.confidence === 'Low') {
    return {
      ruleId: rule.id,
      field: 'jurisdiction_pack',
      confidence: 'low',
      reason: `${cite} — low-confidence interpretation. Verify with Compliance before relying on it (RA-11).`,
    };
  }
  if (rule.confidence === 'Medium') {
    return {
      ruleId: rule.id,
      field: 'jurisdiction_pack',
      confidence: 'medium',
      reason: `${cite} involves interpretive judgment. Verify with Compliance before relying on it (RA-11).`,
    };
  }
  return null;
}

export function chainEntryFor(rule: PackRule, derived: string): RegulatoryChainEntry {
  return {
    rule_id: rule.id,
    document: rule.source.document,
    section: rule.source.section,
    source_text: rule.source.text,
    confidence: rule.confidence,
    derived,
    sign_off: isUnsigned(rule)
      ? `${rule.reviewer_name} · pending firm adoption`
      : `${rule.reviewer_name} · ${rule.sign_off_date}`,
  };
}

export interface PackHardLineHit {
  rule: PackRule;
  packId: string;
  graphPath: string;
}

// Pack-level hard lines: graph-only conditions, evaluated right after the
// base hard lines (before tier/track exist). First hit in sorted order.
export function evaluatePackHardLines(graph: DataFlowGraph, activePacks: JurisdictionPack[]): PackHardLineHit | null {
  for (const pack of activePacks) {
    const rules = [...pack.rules].sort((a, b) => a.id.localeCompare(b.id));
    for (const rule of rules) {
      if (rule.effect.type !== 'hard_line') continue;
      if (matchesCondition(rule.condition, graph)) {
        return { rule, packId: pack.pack_id, graphPath: describeGraphPath(graph) };
      }
    }
  }
  return null;
}

export interface JurisdictionOverrideResult {
  finalTrack: Track;
  finalTier: Tier;
  appliedOverrides: AppliedOverride[];
  addedControls: string[];
  addedReviews: string[];
  chain: RegulatoryChainEntry[];
  caveats: ConfidenceCaveat[];
}

export function applyJurisdictionOverrides(
  graph: DataFlowGraph,
  baseTier: Tier,
  baseTrack: Track,
  activePacks: JurisdictionPack[] = [],
): JurisdictionOverrideResult {
  let finalTier = baseTier;
  const appliedOverrides: AppliedOverride[] = [];
  const addedControls: string[] = [];
  const addedReviews: string[] = [];
  const chain: RegulatoryChainEntry[] = [];
  const caveats: ConfidenceCaveat[] = [];

  for (const pack of activePacks) {
    const rules = [...pack.rules].sort((a, b) => a.id.localeCompare(b.id));
    for (const rule of rules) {
      if (rule.effect.type === 'hard_line') continue; // handled pre-tier
      if (!matchesCondition(rule.condition, graph)) continue;

      let derived: string;
      if (rule.effect.type === 'tier_floor') {
        // BC-V2A-01: most-demanding-standard — a floor only ever raises.
        const floor = rule.effect.minimum_tier;
        if (TIER_RANK[floor] > TIER_RANK[finalTier]) {
          derived = `Tier forced to ${floor} (was ${finalTier}) — most demanding standard applies.`;
          finalTier = floor;
        } else {
          derived = `Tier floor ${floor} already satisfied by ${finalTier}.`;
        }
      } else if (rule.effect.type === 'required_control') {
        addedControls.push(rule.effect.control_id);
        derived = `Added required control ${rule.effect.control_id}.`;
      } else {
        addedReviews.push(rule.effect.review);
        derived = `Added downstream review "${rule.effect.review}".`;
      }

      appliedOverrides.push({ packCode: pack.pack_id, ruleId: rule.id, effect: derived });
      chain.push(chainEntryFor(rule, derived));
      const caveat = caveatForFiredRule(rule);
      if (caveat) caveats.push(caveat);
    }
  }

  // Track is never changed by packs — obligations supplement, they do not
  // reclassify (repo-updates §4.2 decision; grounding §C).
  return {
    finalTrack: baseTrack,
    finalTier,
    appliedOverrides,
    addedControls: [...new Set(addedControls)].sort(),
    addedReviews: [...new Set(addedReviews)].sort(),
    chain,
    caveats,
  };
}
