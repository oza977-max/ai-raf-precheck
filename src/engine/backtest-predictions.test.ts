import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../store/policy';
import { loadPacks } from '../store/packs';
import { getPackSources } from '../store/pack-source';
import { evaluate } from './evaluate';
import type { DataFlowGraph, PolicyFile } from './types';

// Living verification of backtest/use-cases.md: every predicted verdict
// in the Phase C back-test pack is asserted against the real engine +
// starter policy, so a policy edit that silently changes a predicted
// outcome fails here and the pack gets corrected instead of poisoning
// the back-test.
let policy: PolicyFile;
let packs: ReturnType<typeof loadPacks>['packs'];
beforeAll(() => {
  const yaml = readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8');
  const r = loadPolicy(yaml);
  if (!r.valid) throw new Error('policy invalid');
  policy = r.policy;
  const packResult = loadPacks(getPackSources());
  if (packResult.errors.length > 0) throw new Error('pack load errors: ' + JSON.stringify(packResult.errors));
  packs = packResult.packs;
});

function g(dataClass: string, inZone: string, model: string, autonomy: number, procZone: string, action: string, exposure: string, bindingness: string, reversibility: string, scale: string): DataFlowGraph {
  return {
    id: 'bt', version: 1, intake_method: 'structured_form', extracted_at: '2026-01-01T00:00:00Z', jurisdictions: [],
    input_nodes: [{ id: 'i1', label: 'in', data_class: dataClass as never, data_zone: inZone as never }],
    processing_nodes: [{ id: 'p1', label: 'model', model_type: model as never, autonomy_level: autonomy as never, data_zone: procZone as never, vendor: 'internal', replaces_prior_model: false }],
    output_nodes: [{ id: 'o1', label: 'out', action_type: action as never, exposure: exposure as never, decision_bindingness: bindingness as never, output_reversibility: reversibility as never, scale: scale as never }],
    edges: [{ from: 'i1', to: 'p1' }, { from: 'p1', to: 'o1' }],
  };
}

const cases: Array<[string, DataFlowGraph, { status: string; tier?: string; track?: string; binding?: string }]> = [
  ['UC-1 VaR commentary', g('Confidential','Zone B','llm',1,'Zone B','draft','internal-shared','advisory','reversible','at_scale'), { status: 'approved_with_controls', tier: 'Medium', track: 'II', binding: 'INV-TRACK2-01' }],
  // HL-002 since oracle round 001. Its condition previously read
  // `data_zone: Zone A` while its own reason said "MNPI outside Zone C", so
  // MNPI on a Zone B vendor service missed the bright line and rejected via
  // the deliberately-unsatisfiable INV-ZONE-01 instead. Same outcome, far
  // better audit story: "you crossed a named hard line under MAR Article 8".
  ['UC-2 MNPI commentary', g('MNPI','Zone B','llm',1,'Zone B','draft','internal-shared','advisory','reversible','at_scale'), { status: 'rejected', binding: 'HL-002' }],
  ['UC-3 credit review', g('Client PII','Zone B','llm',1,'Zone B','recommend','internal-shared','material','reversible','at_scale'), { status: 'approved_with_controls', tier: 'High', track: 'II', binding: 'INV-HALLUC-01' }],
  ['UC-4 auto line cut', g('Client PII','Zone C','traditional-ml',4,'Zone C','execute','client-facing','binding','irreversible','at_scale'), { status: 'rejected', binding: 'HL-001' }],
  ['UC-5 op risk events', g('Internal','Zone B','llm',1,'Zone B','recommend','internal-shared','advisory','reversible','at_scale'), { status: 'approved_with_controls', tier: 'Medium', track: 'II', binding: 'INV-TRACK2-01' }],
  ['UC-6a deal memo Zone B', g('MNPI','Zone B','llm',1,'Zone B','draft','internal-shared','material','reversible','limited'), { status: 'rejected', binding: 'HL-002' }],
  ['UC-6b deal memo Zone C', g('MNPI','Zone C','llm',1,'Zone C','draft','internal-shared','material','reversible','limited'), { status: 'approved_with_controls', tier: 'High', track: 'II', binding: 'INV-HALLUC-01' }],
  ['UC-7 Claude Code', g('Internal','Zone B','agentic',1,'Zone B','draft','internal-only','non-binding','reversible','at_scale'), { status: 'approved_with_controls', tier: 'Low', track: 'III', binding: 'INV-AGENT-01' }],
  ['UC-8 reg reporting', g('Confidential','Zone B','llm',1,'Zone B','draft','internal-shared','material','reversible','limited'), { status: 'approved_with_controls', tier: 'Medium', track: 'II', binding: 'INV-HALLUC-01' }],
];

describe('backtest pack predictions', () => {
  for (const [name, graph, expected] of cases) {
    it(name, () => {
      const r = evaluate(graph, policy);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.status).toBe(expected.status);
      if (expected.tier) expect(r.value.tier).toBe(expected.tier);
      if (expected.track) expect(r.value.track).toBe(expected.track);
      if (expected.binding) expect(r.value.binding_constraint).toBe(expected.binding);
    });
  }
});

// ── V2-A: jurisdictional back-test cases (packs loaded from the real files) ──

function g2(opts: {
  dataClass: string; inZone: string; model: string; autonomy: number; procZone: string;
  action: string; exposure: string; bindingness: string; reversibility: string; scale: string;
  decisionType?: string; hitl?: boolean; jurisdictions: string[];
}): DataFlowGraph {
  const base = g(opts.dataClass, opts.inZone, opts.model, opts.autonomy, opts.procZone, opts.action, opts.exposure, opts.bindingness, opts.reversibility, opts.scale);
  base.jurisdictions = opts.jurisdictions;
  if (opts.decisionType) (base.output_nodes[0] as { decision_type?: string }).decision_type = opts.decisionType;
  if (opts.hitl !== undefined) (base.output_nodes[0] as { hitl?: boolean }).hitl = opts.hitl;
  return base;
}

describe('backtest pack predictions — jurisdictional (V2-A)', () => {
  it('UC-9 EU retail credit scoring: Critical (base + Annex III floor), controls + UK/EU reviews, provisional', () => {
    const r = evaluate(g2({ dataClass: 'Client PII', inZone: 'Zone B', model: 'ml', autonomy: 1, procZone: 'Zone B', action: 'recommend', exposure: 'internal-shared', bindingness: 'material', reversibility: 'reversible', scale: 'at_scale', decisionType: 'credit-decision', hitl: true, jurisdictions: ['UK', 'EU'] }), policy, packs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe('approved_with_controls');
    expect(r.value.tier).toBe('Critical');
    expect(r.value.track).toBe('II');
    expect(r.value.controls).toContain('CTRL-ENC-01');
    // Round 4 (CS-3): the firm can now require its own downstream processes,
    // and this use case handles Client PII, so DR-INFOSEC-02 fires. The
    // prediction changed because the product gained a capability it was
    // missing, not because the engine drifted — the backtest catching it is
    // the corpus doing its job.
    expect(r.value.downstream_reviews).toEqual([
      'ICT third-party concentration review (DORA Art. 28/29)',
      'Independent model validation (2LoD)',
      'Information security review',
    ]);
    const chain = r.value.explanation.regulatory_chain ?? [];
    expect(chain.map((c) => c.rule_id)).toEqual(['DORA-EU-REV-01', 'EU-AIACT-TIER-01', 'SS1-UK-REV-01']);
    // NF-7: unsigned pack rules -> provisional verdict.
    expect(r.value.confidence_caveats.some((c) => c.confidence === 'low')).toBe(true);
  });

  it('UC-10 EU CV screening: FORCED High -> Critical by Annex III 4(a) — the visible pack-force demo', () => {
    const r = evaluate(g2({ dataClass: 'Internal', inZone: 'Zone B', model: 'ml', autonomy: 1, procZone: 'Zone B', action: 'recommend', exposure: 'internal-shared', bindingness: 'material', reversibility: 'reversible', scale: 'at_scale', decisionType: 'hiring', jurisdictions: ['EU'] }), policy, packs);
    if (!r.ok) return;
    expect(r.value.status).toBe('approved_with_controls');
    expect(r.value.tier).toBe('Critical');
    const forced = (r.value.explanation.regulatory_chain ?? []).find((c) => c.rule_id === 'EU-AIACT-TIER-02');
    expect(forced?.derived).toMatch(/forced to Critical \(was High\)/);
    expect(forced?.source_text).toMatch(/recruitment or selection of natural persons/);
  });

  it('UC-11 UK-only quant VaR model: Medium tier (materiality now tiers) + SS1/23 independent validation', () => {
    const r = evaluate(g2({ dataClass: 'Internal', inZone: 'Zone C', model: 'statistical', autonomy: 0, procZone: 'Zone C', action: 'recommend', exposure: 'internal-only', bindingness: 'material', reversibility: 'reversible', scale: 'at_scale', jurisdictions: ['UK'] }), policy, packs);
    if (!r.ok) return;
    expect(r.value.status).toBe('approved_with_controls');
    // Medium, not Low, since oracle round 001. Tiering keyed on exposure,
    // decision_type, autonomy and data_class but never on how much weight the
    // output carried, so a model binding a MATERIAL capital decision tiered
    // identically to an advisory one. `decision_bindingness: material` now
    // triggers Medium.
    expect(r.value.tier).toBe('Medium');
    expect(r.value.track).toBe('I');
    expect(r.value.downstream_reviews).toEqual(['Independent model validation (2LoD)']);
  });

  // v1.3 DELETED the CA/SG/JP packs — they emitted real controls from
  // "[ILLUSTRATIVE — NOT VERBATIM]" text with "[NOT RETRIEVED]" dates. These
  // two tests now pin the HONEST replacement behaviour: a declared
  // jurisdiction with no pack applies the firm's own appetite and claims no
  // jurisdictional coverage at all. That is a weaker verdict and a truthful
  // one, and it must not silently regress back into fabricated obligations.
  it('UC-12 Canada: the CA pack is gone, so the firm appetite stands alone and NO pack obligation is invented', () => {
    const r = evaluate(g2({ dataClass: 'Internal', inZone: 'Zone C', model: 'ml', autonomy: 2, procZone: 'Zone C', action: 'recommend', exposure: 'internal-shared', bindingness: 'advisory', reversibility: 'reversible', scale: 'limited', jurisdictions: ['CA'] }), policy, packs);
    if (!r.ok) return;
    expect(r.value.status).toBe('approved_with_controls');
    expect(r.value.controls).toEqual(['CTRL-FINGERPRINT-01']);
    // The load-bearing assertions: no pack rule applied, and nothing was
    // added to the verdict on Canada's behalf.
    expect(r.value.applied_overrides).toEqual([]);
    expect(r.value.downstream_reviews).toEqual([]);
    expect(r.value.pack_versions).toEqual({});
  });

  it('UC-13 SG+JP: both packs are gone, so the tier still holds but no review is claimed', () => {
    const r = evaluate(g2({ dataClass: 'Internal', inZone: 'Zone B', model: 'llm', autonomy: 1, procZone: 'Zone B', action: 'recommend', exposure: 'client-facing', bindingness: 'advisory', reversibility: 'reversible', scale: 'at_scale', jurisdictions: ['SG', 'JP'] }), policy, packs);
    if (!r.ok) return;
    // The firm's own appetite still tiers this High on client-facing exposure —
    // deleting a pack must not weaken the firm-level position.
    expect(r.value.tier).toBe('High');
    expect(r.value.downstream_reviews).toEqual([]);
    expect(r.value.applied_overrides).toEqual([]);
    // And no confidence caveat, because there is no unsigned pack rule to
    // caveat any more. The honesty now lives in the absence, not in a footnote.
    expect(r.value.confidence_caveats).toEqual([]);
  });

  it('UC-8b regulatory reporting WITH decision_type (now form-selectable): tiers High as grounding requires', () => {
    const r = evaluate(g2({ dataClass: 'Confidential', inZone: 'Zone B', model: 'llm', autonomy: 1, procZone: 'Zone B', action: 'draft', exposure: 'internal-shared', bindingness: 'material', reversibility: 'reversible', scale: 'limited', decisionType: 'regulatory-reporting', jurisdictions: [] }), policy, packs);
    if (!r.ok) return;
    expect(r.value.tier).toBe('High');
  });
});
