import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../store/policy';
import { loadPacks } from '../store/packs';
import { evaluate } from './evaluate';
import { buildGraphFromForm } from './build-graph-from-form';
import type { StructuredFormValues } from './build-graph-from-form';
import type { JurisdictionPack, PolicyFile } from './types';

// Pins every outcome printed in `docs/try-these.md`.
//
// That page tells a reader what to expect from eleven specific cases. Without
// this, a policy edit would silently make the page wrong — and a document that
// confidently describes behaviour the product no longer has is exactly the
// drift that let `track_floor` survive four review rounds (FN-007).
//
// Same pattern as `backtest-predictions.test.ts`, which pins the committee
// back-test pack for the same reason.
//
// If a policy change fails one of these: decide whether the NEW behaviour is
// right. If it is, update the expectation AND the prose in try-these.md
// together. Never update one alone.

const dir = resolve(__dirname, '../../policy');
let policy: PolicyFile;
let packs: JurisdictionPack[];

beforeAll(() => {
  const res = loadPolicy(readFileSync(resolve(dir, 'appetite.yaml'), 'utf-8'));
  if (!res.valid) throw new Error(`policy invalid: ${JSON.stringify(res.errors)}`);
  policy = res.policy;
  packs = loadPacks({
    'ss1-23': readFileSync(resolve(dir, 'packs/ss1-23.yaml'), 'utf-8'),
    'sr-26-2': readFileSync(resolve(dir, 'packs/sr-26-2.yaml'), 'utf-8'),
    'eu-ai-act': readFileSync(resolve(dir, 'packs/eu-ai-act.yaml'), 'utf-8'),
    dora: readFileSync(resolve(dir, 'packs/dora.yaml'), 'utf-8'),
  }).packs;
});

const base = { useCaseName: 'x', description: 'x', replacesPriorModel: false } as const;

function run(v: StructuredFormValues) {
  const r = evaluate(buildGraphFromForm(v), policy, packs);
  if (!r.ok) throw new Error(`engine error: ${JSON.stringify(r.error)}`);
  return r.value;
}

describe('docs/try-these.md — every printed outcome', () => {
  it('case 1: a clean internal dashboard is approved at Low with nothing attached [TC-PE-8-01]', () => {
    const v = run({ ...base, inputDataClass: 'Internal', inputDataZone: 'Zone C', modelType: 'statistical',
      autonomyLevel: 0, processingDataZone: 'Zone C', outputActionType: 'read', outputExposure: 'internal-only',
      decisionBindingness: 'non-binding', outputReversibility: 'reversible', outputScale: 'limited', jurisdictions: ['UK'] });
    expect(v.status).toBe('approved');
    expect(v.tier).toBe('Low');
    expect(v.controls).toHaveLength(0);
    expect(v.downstream_reviews).toHaveLength(0);
    expect(v.provisional_reasons).toHaveLength(0);
  });

  it('case 2: MNPI outside Zone C is rejected on HL-002 with NO controls proposed', () => {
    const v = run({ ...base, inputDataClass: 'MNPI', inputDataZone: 'Zone B', modelType: 'llm', autonomyLevel: 1,
      processingDataZone: 'Zone B', outputActionType: 'draft', outputExposure: 'internal-only',
      decisionBindingness: 'advisory', outputReversibility: 'reversible', outputScale: 'limited', jurisdictions: ['UK'] });
    expect(v.status).toBe('rejected');
    expect(v.binding_constraint).toBe('HL-002');
    // PE-4: hard lines are evaluated before control solving, so a rejection
    // never proposes mitigations. This is the assertion that would catch it.
    expect(v.controls).toHaveLength(0);
  });

  it('case 3: autonomous lending with no human is rejected on HL-003', () => {
    const v = run({ ...base, inputDataClass: 'Client PII', inputDataZone: 'Zone C', modelType: 'traditional-ml',
      autonomyLevel: 4, processingDataZone: 'Zone C', outputActionType: 'approve', outputExposure: 'client-facing',
      decisionBindingness: 'binding', outputReversibility: 'reversible', outputScale: 'at_scale',
      decisionType: 'credit-decision', hitl: false, jurisdictions: ['UK'] });
    expect(v.status).toBe('rejected');
    expect(v.binding_constraint).toBe('HL-003');
  });

  it('case 4: an agentic system with binding authority at L4 is rejected on HL-006', () => {
    const v = run({ ...base, inputDataClass: 'Internal', inputDataZone: 'Zone C', modelType: 'agentic',
      autonomyLevel: 4, processingDataZone: 'Zone C', outputActionType: 'execute', outputExposure: 'internal-shared',
      decisionBindingness: 'binding', outputReversibility: 'reversible', outputScale: 'at_scale', jurisdictions: ['UK'] });
    expect(v.status).toBe('rejected');
    expect(v.binding_constraint).toBe('HL-006');
  });

  it('case 5: two hard lines apply and the FIRST in rule order is the one named', () => {
    const irreversible: StructuredFormValues = { ...base, inputDataClass: 'Confidential', inputDataZone: 'Zone C',
      modelType: 'ml', autonomyLevel: 4, processingDataZone: 'Zone C', outputActionType: 'trade',
      outputExposure: 'market-facing', decisionBindingness: 'binding', outputReversibility: 'irreversible',
      outputScale: 'at_scale', decisionType: 'trading', jurisdictions: ['UK'] };
    // HL-001 (L4 + irreversible + market-facing) and HL-004 (autonomous
    // trading) both apply. The page tells the reader HL-001 is named.
    expect(run(irreversible).binding_constraint).toBe('HL-001');

    // …and that making it reversible leaves HL-004 as the named reason. The
    // page invites the reader to try exactly this, so it is pinned too.
    expect(run({ ...irreversible, outputReversibility: 'reversible' }).binding_constraint).toBe('HL-004');
  });

  it('case 6: a use case inside the platform envelope inherits its three controls [TC-PV-1-01] [TC-PV-8-01] [TC-PV-3-03]', () => {
    const v = run({ ...base, inputDataClass: 'Confidential', inputDataZone: 'Zone C', modelType: 'ml',
      autonomyLevel: 2, processingDataZone: 'Zone C', outputActionType: 'recommend', outputExposure: 'internal-shared',
      decisionBindingness: 'advisory', outputReversibility: 'reversible', outputScale: 'limited',
      platform: 'PLAT-INTERNAL-ML', jurisdictions: ['UK'] });
    expect(v.tier).toBe('Medium');
    expect(v.inheritance?.inherited_controls).toEqual(['CTRL-DRIFT-01', 'CTRL-ENC-01', 'CTRL-FINGERPRINT-01']);
    expect(v.controls).toHaveLength(0);
  });

  it('case 7: the same idea outside the envelope inherits nothing and costs 8 controls [TC-PV-8-01]', () => {
    const v = run({ ...base, inputDataClass: 'Client PII', inputDataZone: 'Zone B', modelType: 'llm',
      autonomyLevel: 1, processingDataZone: 'Zone B', outputActionType: 'draft', outputExposure: 'client-facing',
      decisionBindingness: 'advisory', outputReversibility: 'reversible', outputScale: 'at_scale',
      platform: 'PLAT-CLOUD-LLM', jurisdictions: ['UK'] });
    expect(v.tier).toBe('High');
    expect(v.inheritance?.inherited_controls ?? []).toHaveLength(0);
    // The contrast with case 6 is the whole point of the pair — if this ever
    // stops being 8, the page's "eight controls is the cost" line is wrong.
    expect(v.controls).toHaveLength(8);
  });

  it('case 8: hiring tiers High for the firm and is floored to Critical by the EU pack', () => {
    const eu: StructuredFormValues = { ...base, inputDataClass: 'Client PII', inputDataZone: 'Zone C',
      modelType: 'traditional-ml', autonomyLevel: 2, processingDataZone: 'Zone C', outputActionType: 'recommend',
      outputExposure: 'internal-shared', decisionBindingness: 'material', outputReversibility: 'reversible',
      outputScale: 'at_scale', decisionType: 'hiring', jurisdictions: ['EU'] };
    const v = run(eu);
    expect(v.tier).toBe('Critical');
    expect(v.provisional_reasons).toContain('unsigned_pack_rules');

    // The page invites the reader to re-run as UK-only and watch the tier
    // drop. If that stops happening the invitation is a lie.
    expect(run({ ...eu, jurisdictions: ['UK'] }).tier).toBe('High');
  });

  it('case 9: an unlisted decision type produces TWO provisional reasons, both named', () => {
    const v = run({ ...base, inputDataClass: 'Client PII', inputDataZone: 'Zone C', modelType: 'traditional-ml',
      autonomyLevel: 2, processingDataZone: 'Zone C', outputActionType: 'recommend', outputExposure: 'client-facing',
      decisionBindingness: 'material', outputReversibility: 'reversible', outputScale: 'at_scale',
      decisionTypeOther: 'collections prioritisation', jurisdictions: ['UK'] });
    expect(v.provisional_reasons).toEqual(['unsigned_pack_rules', 'unclassified_decision_type']);
    expect(v.unclassified_decision_types).toEqual(['collections prioritisation']);
  });

  it('case 10: the demo case — Critical, 7 controls, 2 reviews, bound by autonomy [TC-PE-3-01]', () => {
    const v = run({ ...base, inputDataClass: 'Client PII', inputDataZone: 'Zone C', modelType: 'traditional-ml',
      autonomyLevel: 3, processingDataZone: 'Zone C', outputActionType: 'approve', outputExposure: 'client-facing',
      decisionBindingness: 'binding', outputReversibility: 'reversible', outputScale: 'at_scale',
      decisionType: 'credit-decision', hitl: false, platform: 'PLAT-INTERNAL-ML', jurisdictions: ['UK', 'EU'] });
    expect(v.status).toBe('approved_with_controls');
    expect(v.tier).toBe('Critical');
    expect(v.track).toBe('I');
    expect(v.binding_constraint).toBe('INV-AUTONOMY-01');
    // v1.5: also trips INV-ACT-LOG-01 (approve + autonomy 3), adding
    // CTRL-LOG-01 — 6 -> 7. See docs/try-these.md's updated prose.
    expect(v.controls).toHaveLength(7);
    expect(v.downstream_reviews).toHaveLength(2);
    expect(v.provisional_reasons).toContain('unsigned_pack_rules');
  });
});
