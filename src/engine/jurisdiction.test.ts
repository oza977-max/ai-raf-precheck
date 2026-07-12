import { describe, it, expect } from 'vitest';
import {
  applyJurisdictionOverrides,
  caveatForFiredRule,
  evaluatePackHardLines,
  isUnsigned,
  resolveActivePacks,
} from './jurisdiction';
import type { DataFlowGraph, JurisdictionPack, PackRule } from './types';

// V2-A: rewritten from the P3-C01 stub tests — the pass-through is gone.

function graph(overrides: Partial<DataFlowGraph> = {}): DataFlowGraph {
  return {
    id: 'g1',
    version: 1,
    input_nodes: [],
    processing_nodes: [
      { id: 'p1', label: 'x', model_type: 'ml', autonomy_level: 1, data_zone: 'Zone B', vendor: 'internal', replaces_prior_model: false },
    ],
    output_nodes: [
      { id: 'o1', label: 'y', action_type: 'recommend', exposure: 'internal-shared', decision_bindingness: 'material', output_reversibility: 'reversible', scale: 'limited', decision_type: 'hiring' },
    ],
    edges: [],
    jurisdictions: ['EU'],
    intake_method: 'structured_form',
    extracted_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function rule(overrides: Partial<PackRule> = {}): PackRule {
  return {
    id: 'EU-AIACT-TIER-02',
    title: 'Annex III employment screening',
    source: { document: 'EU AI Act', section: 'Annex III §4(a)', text: 'recruitment or selection of natural persons…' },
    effect: { type: 'tier_floor', minimum_tier: 'Critical' },
    condition: { decision_type: { in: ['hiring'] } },
    confidence: 'Medium',
    reviewer_name: '[FIRM] — Legal/Compliance',
    reviewer_role: 'Head of Compliance',
    sign_off_date: '[DATE]',
    ...overrides,
  };
}

function pack(rules: PackRule[], overrides: Partial<JurisdictionPack> = {}): JurisdictionPack {
  return {
    pack_id: 'EU-AIACT',
    version: '1.0',
    jurisdiction: 'EU',
    regulator: 'European Commission',
    document: 'EU AI Act (Reg. 2024/1689)',
    effective_date: '2024-08-01',
    reviewer_name: '[FIRM] — Legal/Compliance',
    reviewer_role: 'Head of Compliance',
    sign_off_date: '[DATE]',
    rules,
    ...overrides,
  };
}

describe('resolveActivePacks (V2-A)', () => {
  it('activates only packs whose jurisdiction is on the graph, sorted by pack_id', () => {
    const eu = pack([rule()]);
    const uk = pack([rule({ id: 'UK-1' })], { pack_id: 'SS1-23', jurisdiction: 'UK' });
    expect(resolveActivePacks(['EU'], [], [uk, eu]).map((p) => p.pack_id)).toEqual(['EU-AIACT']);
    expect(resolveActivePacks(['EU', 'UK'], [], [uk, eu]).map((p) => p.pack_id)).toEqual(['EU-AIACT', 'SS1-23']);
    expect(resolveActivePacks([], [], [uk, eu])).toEqual([]);
  });
});

describe('applyJurisdictionOverrides (V2-A)', () => {
  it('BC-V2A-01: a tier_floor raises the tier and never lowers it', () => {
    const raised = applyJurisdictionOverrides(graph(), 'Medium', 'II', [pack([rule()])]);
    expect(raised.finalTier).toBe('Critical');
    expect(raised.appliedOverrides).toHaveLength(1);
    expect(raised.chain[0]?.derived).toMatch(/forced to Critical \(was Medium\)/);

    const lowFloor = rule({ effect: { type: 'tier_floor', minimum_tier: 'Low' } });
    const notLowered = applyJurisdictionOverrides(graph(), 'High', 'II', [pack([lowFloor])]);
    expect(notLowered.finalTier).toBe('High');
    expect(notLowered.chain[0]?.derived).toMatch(/already satisfied/);
  });

  it('track is never changed; obligations supplement (controls + reviews deduped, sorted)', () => {
    const r1 = rule({ id: 'A-1', effect: { type: 'required_review', review: 'Independent model validation (2LoD)' } });
    const r2 = rule({ id: 'A-2', effect: { type: 'required_control', control_id: 'CTRL-LOG-01' } });
    const result = applyJurisdictionOverrides(graph(), 'Medium', 'III', [pack([r2, r1])]);
    expect(result.finalTrack).toBe('III');
    expect(result.addedReviews).toEqual(['Independent model validation (2LoD)']);
    expect(result.addedControls).toEqual(['CTRL-LOG-01']);
    // rules applied in id order regardless of array order
    expect(result.chain.map((c) => c.rule_id)).toEqual(['A-1', 'A-2']);
  });

  it('a non-matching condition fires nothing', () => {
    const r = rule({ condition: { decision_type: { in: ['trading'] } } });
    const result = applyJurisdictionOverrides(graph(), 'Medium', 'II', [pack([r])]);
    expect(result.finalTier).toBe('Medium');
    expect(result.chain).toEqual([]);
    expect(result.caveats).toEqual([]);
  });
});

describe('NF-7 / RA-11 caveats (V2-A)', () => {
  it('BC-V2A-03: an unsigned fired rule yields a LOW caveat naming pending adoption', () => {
    const caveat = caveatForFiredRule(rule());
    expect(isUnsigned(rule())).toBe(true);
    expect(caveat?.confidence).toBe('low');
    expect(caveat?.reason).toMatch(/pending firm adoption/i);
  });

  it('review fix, pass 1: a real reviewer name with a [DATE] placeholder is still UNSIGNED — an un-dated sign-off is not a sign-off', () => {
    const undated = rule({ reviewer_name: 'A. Mensah', sign_off_date: '[DATE]' });
    expect(isUnsigned(undated)).toBe(true);
    expect(caveatForFiredRule(undated)?.confidence).toBe('low');
  });

  it('a signed Medium rule yields a medium caveat; signed High yields none', () => {
    const signed = rule({ reviewer_name: 'A. Mensah', sign_off_date: '2026-05-14' });
    expect(caveatForFiredRule(signed)?.confidence).toBe('medium');
    expect(caveatForFiredRule({ ...signed, confidence: 'High' })).toBeNull();
  });
});

describe('evaluatePackHardLines (V2-A)', () => {
  it('a matching pack hard_line rule is hit with the graph path; non-matching is not', () => {
    const hl = rule({
      id: 'EU-AIACT-HL-01',
      effect: { type: 'hard_line', reason: 'Prohibited practice.' },
      condition: { decision_type: { in: ['hiring'] } },
    });
    const hit = evaluatePackHardLines(graph(), [pack([hl])]);
    expect(hit?.rule.id).toBe('EU-AIACT-HL-01');
    expect(hit?.graphPath.length).toBeGreaterThan(0);
    expect(evaluatePackHardLines(graph({ jurisdictions: ['EU'], output_nodes: [] }), [pack([hl])])).toBeNull();
  });
});
