import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkPolicyReferences } from './policy-references';
import { loadPolicy } from './policy';
import { loadPacks } from './packs';
import { getPackSources } from './pack-source';
import type { Control, JurisdictionPack, PolicyFile } from '../engine/types';

// R16-A1 (§1.4, D-05, D-23, D-39, D-60). checkPolicyReferences is a pure,
// store-side referential check — no I/O — called at every site that loads
// policy and packs together or evaluates. It is deliberately NOT what
// loadPolicy/loadPacks already do at parse time (shape + operator +
// vocabulary validation): it checks REFERENCES that only make sense once a
// whole PolicyFile + its packs exist together (a covers_reviews id that
// must resolve against BOTH the firm's own reviews and the loaded packs'
// rule ids), plus authoring-quality warnings loadPolicy never looked at.

function basePolicy(overrides: Partial<PolicyFile> = {}): PolicyFile {
  return {
    version: '1.0',
    policy_id: 'TEST',
    firm_name: 'Test Bank',
    translation_attestation: { attested_by: 'x', role: 'x', date: '2026-01-01', raf_version_checked: 'x' },
    hard_lines: [],
    tracks: [{ id: 'TRACK-I', name: 'Track I', description: 'd', conditions: [], short_circuit: true, regulatory_basis: 'x' }],
    tiers: [{ id: 'TIER-LOW', name: 'Low', triggers: [] }],
    invariants: [],
    controls: [{ id: 'CTRL-01', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v' }],
    kri_thresholds: {},
    jurisdictions: [],
    roles: {},
    tier_workflow: { Critical: 'x', High: 'x', Medium: 'x', Low: 'x' },
    safety_margin: 0.1,
    ...overrides,
  };
}

function control(overrides: Partial<Control> = {}): Control {
  return { id: 'CTRL-01', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', ...overrides };
}

describe('checkPolicyReferences (R16-A1 §1.4)', () => {
  it('TC-R16-A1-50: a clean policy with no plain-language fields and no covers_reviews has no errors and no warnings', () => {
    const result = checkPolicyReferences(basePolicy(), []);
    expect(result).toEqual({ errors: [], warnings: [] });
  });

  it('TC-R16-A1-51: the real shipped starter policy (no plain-language fields yet) loads with no errors', () => {
    const yaml = readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8');
    const result = loadPolicy(yaml);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    const packs = loadPacks(getPackSources()).packs;
    const check = checkPolicyReferences(result.policy, packs);
    expect(check.errors).toEqual([]);
  });

  it("TC-R16-A1-52: errors — a covers_reviews id that is not a firm review id, a pack review rule id, PV-UNREGISTERED or MODEL-REGISTRY, in the contract's own message shape", () => {
    const policy = basePolicy({
      controls: [control({ id: 'CTRL-TPRM-01', covers_reviews: ["DR-VENDR-01"] })],
    });
    // With packs loaded (every production load site), an unknown id is a
    // verified error. Any loaded pack will do — it just has to exist.
    const anyPack: JurisdictionPack = {
      pack_id: 'P', version: '1', jurisdiction: 'UK', regulator: 'r', document: 'd',
      effective_date: '2026-01-01', reviewer_name: 'x', reviewer_role: 'x', sign_off_date: '2026-01-01', rules: [],
    };
    const result = checkPolicyReferences(policy, [anyPack]);
    expect(result.errors).toContain("CTRL-TPRM-01 covers_reviews: no review with id 'DR-VENDR-01'.");
  });

  it("TC-R16-A2-12: with no rule packs loaded at all, an unresolved covers_reviews id is a warning, not an error — it can't be checked, and an id matching nothing can only fail to fold a review, never hide one", () => {
    const policy = basePolicy({
      controls: [control({ id: 'CTRL-INDEP-VAL-01', covers_reviews: ['SS1-UK-REV-01'] })],
    });
    const result = checkPolicyReferences(policy, []);
    expect(result.errors).toEqual([]);
    expect(result.warnings.join(' ')).toMatch(/CTRL-INDEP-VAL-01 covers_reviews: no review with id 'SS1-UK-REV-01'.*no rule packs are loaded/);
  });

  it('TC-R16-A1-53: covers_reviews accepts a firm review id', () => {
    const policy = basePolicy({
      downstream_reviews: [{ id: 'DR-VENDOR-01', review: 'Vendor risk assessment', condition: {} }],
      controls: [control({ covers_reviews: ['DR-VENDOR-01'] })],
    });
    expect(checkPolicyReferences(policy, []).errors).toEqual([]);
  });

  it('TC-R16-A1-54: covers_reviews accepts a pack required_review rule id, but not a pack rule of a different effect type', () => {
    const pack: JurisdictionPack = {
      pack_id: 'SS1-23', version: '1', jurisdiction: 'UK', regulator: 'PRA', document: 'd',
      effective_date: '2026-01-01', reviewer_name: 'x', reviewer_role: 'x', sign_off_date: '2026-01-01',
      rules: [
        {
          id: 'SS1-UK-REV-01', title: 't', source: { document: 'd', section: 's', text: 't' },
          effect: { type: 'required_review', review: 'Independent model validation' }, condition: {}, basis: 'verbatim',
        },
        {
          id: 'SS1-UK-TIER-01', title: 't', source: { document: 'd', section: 's', text: 't' },
          effect: { type: 'tier_floor', minimum_tier: 'High' }, condition: {}, basis: 'verbatim',
        },
      ],
    };
    const ok = basePolicy({ controls: [control({ covers_reviews: ['SS1-UK-REV-01'] })] });
    expect(checkPolicyReferences(ok, [pack]).errors).toEqual([]);

    const bad = basePolicy({ controls: [control({ covers_reviews: ['SS1-UK-TIER-01'] })] });
    expect(checkPolicyReferences(bad, [pack]).errors).toContain(
      "CTRL-01 covers_reviews: no review with id 'SS1-UK-TIER-01'.",
    );
  });

  it('TC-R16-A1-55: covers_reviews accepts the bare PV-UNREGISTERED and MODEL-REGISTRY sentinels', () => {
    const policy = basePolicy({ controls: [control({ covers_reviews: ['PV-UNREGISTERED', 'MODEL-REGISTRY'] })] });
    expect(checkPolicyReferences(policy, []).errors).toEqual([]);
  });

  it('TC-R16-A1-56: errors — a non-"in" operator on the list-valued system_access_scope field, in an invariant condition, a hard line condition, a downstream_reviews condition, a track condition and a tier trigger', () => {
    const policy = basePolicy({
      invariants: [{ id: 'INV-01', description: 'd', condition: { system_access_scope: { not_in: ['none'] } }, required_controls: [], severity: 'High' }],
      hard_lines: [{ id: 'HL-01', description: 'd', condition: { system_access_scope: 'none' }, reason: 'r', regulatory_basis: 'b' }],
      downstream_reviews: [{ id: 'DR-01', review: 'r', condition: { system_access_scope: { gte: 1 } } }],
      tracks: [{ id: 'TRACK-I', name: 'Track I', description: 'd', conditions: [{ field: 'system_access_scope', value: { lte: 1 } }], short_circuit: true, regulatory_basis: 'x' }],
      tiers: [{ id: 'TIER-LOW', name: 'Low', triggers: [{ field: 'system_access_scope', value: { not_in: ['none'] } }] }],
    });
    const result = checkPolicyReferences(policy, []);
    expect(result.errors.some((e) => /INV-01.*system_access_scope/.test(e))).toBe(true);
    expect(result.errors.some((e) => /HL-01.*system_access_scope/.test(e))).toBe(true);
    expect(result.errors.some((e) => /DR-01.*system_access_scope/.test(e))).toBe(true);
    expect(result.errors.some((e) => /TRACK-I.*system_access_scope/.test(e))).toBe(true);
    expect(result.errors.some((e) => /TIER-LOW.*system_access_scope/.test(e))).toBe(true);
  });

  it('TC-R16-A1-57: a pack rule condition using a non-"in" operator on a list-valued field is also an error', () => {
    const pack: JurisdictionPack = {
      pack_id: 'TEST-PACK', version: '1', jurisdiction: 'UK', regulator: 'x', document: 'd',
      effective_date: '2026-01-01', reviewer_name: 'x', reviewer_role: 'x', sign_off_date: '2026-01-01',
      rules: [{
        id: 'TP-01', title: 't', source: { document: 'd', section: 's', text: 't' },
        effect: { type: 'required_review', review: 'r' }, condition: { system_access_scope: { not_in: ['none'] } }, basis: 'verbatim',
      }],
    };
    const result = checkPolicyReferences(basePolicy(), [pack]);
    expect(result.errors.some((e) => /TP-01.*system_access_scope/.test(e))).toBe(true);
  });

  it('TC-R16-A1-58: warnings — an unknown placeholder in a plain-language field; {audience} and {destination} are recognised and do not warn', () => {
    const policy = basePolicy({
      invariants: [
        { id: 'INV-01', description: 'd', condition: {}, required_controls: [], severity: 'High', plain_reason: 'it reaches {teams}' },
        { id: 'INV-02', description: 'd', condition: {}, required_controls: [], severity: 'High', plain_reason: 'it reaches {audience} via {destination}' },
      ],
    });
    const result = checkPolicyReferences(policy, []);
    expect(result.warnings.some((w) => /INV-01/.test(w) && /teams/.test(w))).toBe(true);
    expect(result.warnings.some((w) => /INV-02/.test(w))).toBe(false);
  });

  it('TC-R16-A1-59: warnings — an unknown @ token in plain_owner; @submitter and @model_owner are recognised and do not warn', () => {
    const policy = basePolicy({
      controls: [
        control({ id: 'CTRL-01', plain_owner: '@compliance_team' }),
        control({ id: 'CTRL-02', plain_owner: '@submitter' }),
        control({ id: 'CTRL-03', plain_owner: '@model_owner' }),
      ],
    });
    const result = checkPolicyReferences(policy, []);
    expect(result.warnings.some((w) => /CTRL-01/.test(w) && /compliance_team/.test(w))).toBe(true);
    expect(result.warnings.some((w) => /CTRL-02/.test(w))).toBe(false);
    expect(result.warnings.some((w) => /CTRL-03/.test(w))).toBe(false);
  });

  it('TC-R16-A1-60: warnings — a platform or vendor with no plain_name; one with plain_name does not warn', () => {
    const policy = basePolicy({
      platforms: [
        { id: 'PLAT-01', name: 'Formal name', approved_envelope: {}, satisfies_controls: [] },
        { id: 'PLAT-02', name: 'Formal name 2', approved_envelope: {}, satisfies_controls: [], plain_name: 'Plain name' },
      ],
      vendors: [{ id: 'VENDOR-01', name: 'Formal vendor', approved_envelope: {}, satisfies_controls: [] }],
    });
    const result = checkPolicyReferences(policy, []);
    expect(result.warnings.some((w) => /PLAT-01/.test(w))).toBe(true);
    expect(result.warnings.some((w) => /PLAT-02/.test(w))).toBe(false);
    expect(result.warnings.some((w) => /VENDOR-01/.test(w))).toBe(true);
  });

  it('TC-R16-A1-61: a pack required_review effect\'s plain_name/plain_owner are scanned for placeholders and tokens too', () => {
    const pack: JurisdictionPack = {
      pack_id: 'TEST-PACK', version: '1', jurisdiction: 'UK', regulator: 'x', document: 'd',
      effective_date: '2026-01-01', reviewer_name: 'x', reviewer_role: 'x', sign_off_date: '2026-01-01',
      rules: [{
        id: 'TP-01', title: 't', source: { document: 'd', section: 's', text: 't' },
        effect: { type: 'required_review', review: 'r', plain_name: 'a check for {region}', plain_owner: '@unknown_team' },
        condition: {}, basis: 'verbatim',
      }],
    };
    const result = checkPolicyReferences(basePolicy(), [pack]);
    expect(result.warnings.some((w) => /TP-01/.test(w) && /region/.test(w))).toBe(true);
    expect(result.warnings.some((w) => /TP-01/.test(w) && /unknown_team/.test(w))).toBe(true);
  });

  it('warnings never block — a policy with only warnings is still otherwise clean of errors', () => {
    const policy = basePolicy({ controls: [control({ plain_owner: '@mystery' })] });
    const result = checkPolicyReferences(policy, []);
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
