import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from './policy';
import { loadPacks } from './packs';
import { getPackSources } from './pack-source';
import { checkPolicyReferences } from './policy-references';
import type { JurisdictionPack, PackRule, PolicyFile } from '../engine/types';

// R16 chunk A2 (build/prompts/R16.md v2.1 §1.6; test-cases/test-cases-018.md
// "Chunk A2"). Chunk A1 added the CF-6 schema fields; this chunk fills them,
// on the SHIPPED starter policy and its packs, with the owner-approved text.
// These tests read policy/appetite.yaml and policy/packs/*.yaml straight off
// disk — the same files the app ships — so a plain field going missing, or
// a covers_reviews link breaking, fails here rather than on a synthetic
// fixture that could drift from what actually ships.
let policy: PolicyFile;
let packs: JurisdictionPack[];

beforeAll(() => {
  const yaml = readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8');
  const result = loadPolicy(yaml);
  if (!result.valid) throw new Error('shipped policy invalid: ' + JSON.stringify(result.errors));
  policy = result.policy;

  const packResult = loadPacks(getPackSources());
  if (packResult.errors.length > 0) throw new Error('shipped packs invalid: ' + JSON.stringify(packResult.errors));
  packs = packResult.packs;
});

// The three pack rules CF-6 reaches (R16.md §1.6's reviews table: SS1/23
// independent validation, DORA concentration, SR 26-2 AI governance).
const PACK_REVIEW_RULE_IDS = ['SS1-UK-REV-01', 'DORA-EU-REV-01', 'SR262-US-REV-01'];

function findPackRule(id: string): PackRule | undefined {
  for (const pack of packs) {
    const rule = pack.rules.find((r) => r.id === id);
    if (rule) return rule;
  }
  return undefined;
}

describe('R16 chunk A2 — plain-language policy text (CF-6 fit)', () => {
  it('TC-R16-A2-01: every control in the shipped policy has plain_action and plain_owner set', () => {
    expect(policy.controls.length).toBeGreaterThan(0);
    for (const c of policy.controls) {
      expect(c.plain_action, `${c.id} plain_action`).toBeTruthy();
      expect(c.plain_owner, `${c.id} plain_owner`).toBeTruthy();
    }
  });

  it('TC-R16-A2-02: every invariant in the shipped policy has plain_reason set', () => {
    expect(policy.invariants.length).toBeGreaterThan(0);
    for (const inv of policy.invariants) {
      expect(inv.plain_reason, `${inv.id} plain_reason`).toBeTruthy();
    }
  });

  it('TC-R16-A2-03: every hard line in the shipped policy has plain_reason and plain_change set', () => {
    expect(policy.hard_lines.length).toBeGreaterThan(0);
    for (const hl of policy.hard_lines) {
      expect(hl.plain_reason, `${hl.id} plain_reason`).toBeTruthy();
      expect(hl.plain_change, `${hl.id} plain_change`).toBeTruthy();
    }
  });

  it("TC-R16-A2-04: the firm's three downstream review rules each have plain_name and plain_owner", () => {
    const reviews = policy.downstream_reviews ?? [];
    expect(reviews.map((r) => r.id)).toEqual(['DR-INFOSEC-01', 'DR-INFOSEC-02', 'DR-VENDOR-01']);
    for (const dr of reviews) {
      expect(dr.plain_name, `${dr.id} plain_name`).toBeTruthy();
      expect(dr.plain_owner, `${dr.id} plain_owner`).toBeTruthy();
    }
  });

  it('TC-R16-A2-05: the three pack required_review rules this chunk reaches each have plain_name and plain_owner', () => {
    for (const id of PACK_REVIEW_RULE_IDS) {
      const rule = findPackRule(id);
      expect(rule, `pack rule ${id} exists`).toBeDefined();
      if (!rule || rule.effect.type !== 'required_review') throw new Error(`${id} is not a required_review rule`);
      expect(rule.effect.plain_name, `${id} plain_name`).toBeTruthy();
      expect(rule.effect.plain_owner, `${id} plain_owner`).toBeTruthy();
    }
  });

  it('TC-R16-A2-06: both platforms have plain_name; PLAT-CLOUD-LLM carries vendor_id, PLAT-INTERNAL-ML carries none', () => {
    const platforms = policy.platforms ?? [];
    const cloud = platforms.find((p) => p.id === 'PLAT-CLOUD-LLM');
    const internal = platforms.find((p) => p.id === 'PLAT-INTERNAL-ML');
    expect(cloud?.plain_name).toBeTruthy();
    expect(internal?.plain_name).toBeTruthy();
    expect(cloud?.vendor_id).toBe('VENDOR-APPROVED-LLM');
    expect(internal?.vendor_id).toBeUndefined();
  });

  it('TC-R16-A2-07: vendor VENDOR-APPROVED-LLM has plain_name and kind: company_assistant', () => {
    const vendor = (policy.vendors ?? []).find((v) => v.id === 'VENDOR-APPROVED-LLM');
    expect(vendor?.plain_name).toBeTruthy();
    expect(vendor?.kind).toBe('company_assistant');
  });

  it('TC-R16-A2-08: covers_reviews is set exactly where the contract specifies, and nowhere else', () => {
    const withCovers = policy.controls.filter((c) => c.covers_reviews && c.covers_reviews.length > 0);
    const byId = new Map(withCovers.map((c) => [c.id, c.covers_reviews]));
    expect(byId.get('CTRL-INDEP-VAL-01')).toEqual(['SS1-UK-REV-01']);
    expect(byId.get('CTRL-TPRM-01')).toEqual(['DR-VENDOR-01', 'PV-UNREGISTERED']);
    expect(withCovers.map((c) => c.id).sort()).toEqual(['CTRL-INDEP-VAL-01', 'CTRL-TPRM-01']);
  });

  it('TC-R16-A2-09: checkPolicyReferences on the shipped policy + packs returns no errors and no warnings', () => {
    const result = checkPolicyReferences(policy, packs);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('TC-R16-A2-10: no plain-language field in the shipped policy or its packs contains a banned word', () => {
    // CLAUDE.md: the verdict screen is asserted with a single-match
    // /approved|rejected/i query, and "fired" is reserved for a per-verdict
    // concept, never a static policy/pack string (appetite.yaml's own
    // "THREE BANNED WORDS" note). Mechanical guard over every plain-language
    // field this chunk writes.
    const banned = /approved|rejected|fired/i;
    const offenders: string[] = [];
    const check = (context: string, text: string | undefined) => {
      if (text && banned.test(text)) offenders.push(`${context}: "${text}"`);
    };

    for (const c of policy.controls) {
      check(`${c.id} plain_action`, c.plain_action);
      check(`${c.id} plain_owner`, c.plain_owner);
      check(`${c.id} plain_owner_with`, c.plain_owner_with);
    }
    for (const inv of policy.invariants) check(`${inv.id} plain_reason`, inv.plain_reason);
    for (const hl of policy.hard_lines) {
      check(`${hl.id} plain_reason`, hl.plain_reason);
      check(`${hl.id} plain_change`, hl.plain_change);
    }
    for (const dr of policy.downstream_reviews ?? []) {
      check(`${dr.id} plain_name`, dr.plain_name);
      check(`${dr.id} plain_owner`, dr.plain_owner);
    }
    for (const p of policy.platforms ?? []) check(`platform ${p.id} plain_name`, p.plain_name);
    for (const v of policy.vendors ?? []) check(`vendor ${v.id} plain_name`, v.plain_name);
    for (const pack of packs) {
      for (const rule of pack.rules) {
        if (rule.effect.type === 'required_review') {
          check(`${rule.id} plain_name`, rule.effect.plain_name);
          check(`${rule.id} plain_owner`, rule.effect.plain_owner);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('TC-R16-A2-11: the shipped policy version is 1.8 (R16-W bumped it from 1.7 — text/evidence-scope only)', () => {
    expect(policy.version).toBe('1.8');
  });
});
