import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../store/policy';
import { evaluate } from './evaluate';
import type { DataFlowGraph, PolicyFile } from './types';

let policy: PolicyFile;

beforeAll(() => {
  const yaml = readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8');
  const result = loadPolicy(yaml);
  if (!result.valid) throw new Error(`fixture policy invalid: ${JSON.stringify(result.errors)}`);
  policy = result.policy;
});

function graph(overrides: Partial<DataFlowGraph> = {}): DataFlowGraph {
  return {
    id: 'g1',
    version: 1,
    input_nodes: [],
    processing_nodes: [],
    output_nodes: [],
    edges: [],
    jurisdictions: [],
    intake_method: 'structured_form',
    extracted_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('evaluate — TC-PE-1-01 determinism', () => {
  it('produces an identical result across 10 runs for the same inputs', () => {
    const g = graph({
      processing_nodes: [
        { id: 'p1', label: 'x', model_type: 'ml', autonomy_level: 2, data_zone: 'Zone B', vendor: 'internal', replaces_prior_model: false },
      ],
      output_nodes: [
        { id: 'o1', label: 'y', action_type: 'recommend', exposure: 'internal-shared', decision_bindingness: 'advisory', output_reversibility: 'reversible', scale: 'limited' },
      ],
    });
    const results = Array.from({ length: 10 }, () => evaluate(g, policy));
    const first = JSON.stringify(results[0]);
    for (const r of results) expect(JSON.stringify(r)).toBe(first);
  });
});

describe('evaluate — TC-PE-4-01 hard line trip', () => {
  it('returns immediate rejected with no controls solved when a hard line trips', () => {
    const g = graph({
      processing_nodes: [
        { id: 'p1', label: 'x', model_type: 'agentic', autonomy_level: 4, data_zone: 'Zone A', vendor: 'internal', replaces_prior_model: false },
      ],
      output_nodes: [
        { id: 'o1', label: 'y', action_type: 'execute', exposure: 'client-facing', decision_bindingness: 'binding', output_reversibility: 'irreversible', scale: 'at_scale' },
      ],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('rejected');
      expect(result.value.binding_constraint).toBe('HL-001');
      expect(result.value.controls).toEqual([]);
    }
  });
});

const TRACK_I_PROCESSING = {
  id: 'p1',
  label: 'x',
  model_type: 'traditional-ml' as const,
  autonomy_level: 0 as const,
  data_zone: 'Zone C' as const,
  vendor: 'internal',
  replaces_prior_model: false,
};
const TRACK_I_OUTPUT = {
  id: 'o1',
  label: 'y',
  action_type: 'recommend' as const,
  exposure: 'internal-only' as const,
  decision_bindingness: 'material' as const,
  output_reversibility: 'reversible' as const,
  scale: 'limited' as const,
};

// Oracle round 001 widened INV-CITE-01 from action_type [draft] to
// [read, draft, recommend], because a retrieval-and-summarisation assistant is
// the canonical hallucination surface and previously owed no citations at all.
// A consequence, and an intended one: NO generative model can reach a clean
// `approved` any more — presenting generated text to a human always owes a
// citation. The clean case is therefore now a non-generative model.
const CLEAN_PROCESSING = {
  id: 'p1',
  label: 'internal scorecard',
  model_type: 'statistical' as const,
  autonomy_level: 0 as const,
  data_zone: 'Zone C' as const,
  vendor: 'internal',
  replaces_prior_model: false,
};
const CLEAN_OUTPUT = {
  id: 'o1',
  label: 'suggestion',
  action_type: 'read' as const,
  exposure: 'internal-only' as const,
  decision_bindingness: 'non-binding' as const,
  output_reversibility: 'reversible' as const,
  scale: 'limited' as const,
};

describe('evaluate — jurisdiction pass-through (TC-PE-5-01 structure)', () => {
  it('does not crash with jurisdictions present and applies no overrides', () => {
    const g = graph({
      processing_nodes: [TRACK_I_PROCESSING],
      output_nodes: [TRACK_I_OUTPUT],
      jurisdictions: ['UK', 'US'],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.applied_overrides).toEqual([]);
  });
});

describe('evaluate — approved path', () => {
  it('returns approved when no invariants trip', () => {
    const g = graph({
      processing_nodes: [CLEAN_PROCESSING],
      output_nodes: [CLEAN_OUTPUT],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('approved');
      expect(result.value.tier).toBe('Low');
    }
  });

  it('leaves binding_constraint empty when nothing tripped (P3-C01 review finding: must not leak the track rule id)', () => {
    const g = graph({
      processing_nodes: [CLEAN_PROCESSING],
      output_nodes: [CLEAN_OUTPUT],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.binding_constraint).toBe('');
  });
});

describe('evaluate — approved_with_controls path', () => {
  it('returns approved_with_controls with a real solved control set (P3-C02: no longer the stub)', () => {
    const g = graph({
      input_nodes: [{ id: 'i1', label: 'client notes', data_class: 'Client PII', data_zone: 'Zone A' }],
      processing_nodes: [TRACK_I_PROCESSING],
      output_nodes: [TRACK_I_OUTPUT],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('approved_with_controls');
      // Client PII into Zone A trips INV-DATA-01; the traditional-ml model
      // feeding a material decision also trips INV-DRIFT-01. The real
      // greedy solver must cover both from the control library.
      //
      // Exactly two controls, and no more. CTRL-INDEP-VAL-01 also resolves
      // INV-DRIFT-01, but it is an ALTERNATIVE to CTRL-DRIFT-01, not a
      // supplement — the CS-1 margin reports that the alternative exists
      // without requiring the firm to do both (oracle round 001).
      expect(result.value.controls).toEqual(['CTRL-DRIFT-01', 'CTRL-ENC-01']);
    }
  });

  it('sets boundary_proximity when every tripped invariant has exactly one resolving control (P3-C02 CS-4)', () => {
    // A generative model reading internally trips INV-CITE-01 and nothing
    // else. CTRL-CITE-01 is its only resolver, so coverage depth is 1, the
    // achieved margin is 0, and the verdict sits on the boundary.
    //
    // This fixture moved in oracle round 001: the previous one (Client PII +
    // traditional-ml) now ALSO trips INV-DRIFT-01, which CTRL-INDEP-VAL-01
    // takes to depth 2 — so it achieves margin and is no longer at the
    // boundary. That is the control library getting better, not the test
    // getting weaker.
    const g = graph({
      processing_nodes: [{ ...CLEAN_PROCESSING, model_type: 'llm' as const }],
      output_nodes: [CLEAN_OUTPUT],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.binding_constraint).toBe('INV-CITE-01');
      expect(result.value.margin_achieved).toBe(0);
      expect(result.value.boundary_proximity).toBe(true);
    }
  });

  it('leaves boundary_proximity false on the plain approved path (nothing tripped)', () => {
    const g = graph({
      processing_nodes: [CLEAN_PROCESSING],
      output_nodes: [CLEAN_OUTPUT],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.boundary_proximity).toBe(false);
  });
});

// Code review 002, Panel B. `binding_constraint_order` was declared in the
// policy schema, added to PolicyFile, and read by mostSevere() — and NOTHING
// pinned it. Its consumption was provable by reading the code and by nothing
// else, so a later refactor could quietly make it decorative with the suite
// still green.
//
// That is exactly how the `_margin` parameter of solvControls() survived for
// two months: declared, validated, threaded, discarded, and green throughout.
// RF-1 has eight confirmed instances in this codebase. This test is the guard.
describe('evaluate — binding_constraint_order is honoured (RF-1 guard)', () => {
  // A graph tripping exactly two invariants that rank OPPOSITE ways under the
  // two criteria, so the declared order alone decides the answer:
  //   INV-TRACK2-01  severity High,   cheapest control burden 2
  //   INV-SEC-01     severity Medium, cheapest control burden 3
  const twoWayGraph = () =>
    graph({
      processing_nodes: [
        { id: 'p1', label: 'x', model_type: 'llm', autonomy_level: 1, data_zone: 'Zone C', vendor: 'internal', replaces_prior_model: false },
      ],
      output_nodes: [
        { id: 'o1', label: 'y', action_type: 'execute', exposure: 'internal-shared', decision_bindingness: 'advisory', output_reversibility: 'reversible', scale: 'limited' },
      ],
    });

  it('severity-first (the shipped default) names the higher-severity invariant', () => {
    const r = evaluate(twoWayGraph(), policy);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.explanation.tripped_invariants.map((t) => t.id).sort()).toEqual([
      'INV-SEC-01',
      'INV-TRACK2-01',
    ]);
    expect(r.value.binding_constraint).toBe('INV-TRACK2-01');
  });

  it('burden-first FLIPS the answer — proving the policy field drives the engine', () => {
    const burdenFirst: PolicyFile = {
      ...policy,
      binding_constraint_order: ['control_burden', 'severity', 'id'],
    };
    const r = evaluate(twoWayGraph(), burdenFirst);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Same graph, same invariants tripped, DIFFERENT binding constraint. If
    // this ever equals INV-TRACK2-01 again, the field has stopped being read.
    expect(r.value.binding_constraint).toBe('INV-SEC-01');
  });

  it('omitting the field falls back to the documented default rather than throwing', () => {
    const noOrder: PolicyFile = { ...policy };
    delete (noOrder as { binding_constraint_order?: unknown }).binding_constraint_order;
    const r = evaluate(twoWayGraph(), noOrder);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.binding_constraint).toBe('INV-TRACK2-01');
  });

  it('stays deterministic (NF-1) even when the declared order omits the id tie-break', () => {
    const noIdTieBreak: PolicyFile = { ...policy, binding_constraint_order: ['severity'] };
    const runs = Array.from({ length: 10 }, () => {
      const r = evaluate(twoWayGraph(), noIdTieBreak);
      return r.ok ? r.value.binding_constraint : 'ERR';
    });
    expect(new Set(runs).size).toBe(1);
  });
});

describe('evaluate — no-track-match', () => {
  // The SHIPPED policy can no longer produce this error: oracle round 001 found
  // 9 of 28 model_type x bindingness combinations unrouted and made the track
  // list total (see track.test.ts, which enumerates the cross-product).
  //
  // The error path stays, and stays tested, because a FIRM's edited policy can
  // reintroduce the hole at any time — and returning a wrong verdict would be
  // far worse than returning none. So the fixture now truncates the tracks
  // deliberately rather than relying on the shipped policy being incomplete.
  it('surfaces a no-track-match EngineError when no track rule matches', () => {
    const holed: PolicyFile = {
      ...policy,
      tracks: policy.tracks.filter((t) => t.id === 'TRACK-III'),
    };
    const g = graph({
      processing_nodes: [
        { id: 'p1', label: 'x', model_type: 'deep-learning', autonomy_level: 1, data_zone: 'Zone A', vendor: 'internal', replaces_prior_model: false },
      ],
    });
    const result = evaluate(g, holed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('no-track-match');
  });

  it('the shipped policy routes every model_type / bindingness pair — the hole is closed', () => {
    const result = evaluate(
      graph({
        processing_nodes: [
          { id: 'p1', label: 'x', model_type: 'statistical', autonomy_level: 1, data_zone: 'Zone C', vendor: 'internal', replaces_prior_model: false },
        ],
        output_nodes: [
          { id: 'o1', label: 'y', action_type: 'recommend', exposure: 'internal-shared', decision_bindingness: 'advisory', output_reversibility: 'reversible', scale: 'at_scale' },
        ],
      }),
      policy,
    );
    // Corpus case D-01 — an advisory market-impact model. Returned
    // no-track-match before oracle round 001.
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.track).toBe('I');
  });
});

describe('evaluate — verdict explanation (V1.1-C01)', () => {
  it('hard-line rejection carries the rule reason + regulatory citation, with rationales honestly null', () => {
    const g = graph({
      input_nodes: [{ id: 'i1', label: 'trade intel', data_class: 'MNPI', data_zone: 'Zone A' }],
      processing_nodes: [TRACK_I_PROCESSING],
      output_nodes: [TRACK_I_OUTPUT],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('rejected');
    const ex = result.value.explanation;
    expect(ex.binding_reason).toMatch(/market abuse/i);
    expect(ex.binding_regulatory_basis).toBe('MAR Article 8; MiFID II');
    // Tier/track assignment is skipped on hard-line rejection — the
    // rationale must not fabricate one for the ceiling values.
    expect(ex.tier_rationale).toBeNull();
    expect(ex.track_rationale).toBeNull();
    expect(ex.hard_lines_checked).toBe(policy.hard_lines.length);
  });

  it('a clean approved verdict explains which rules assigned the tier and track, with citations, and reports what was checked', () => {
    const g = graph({
      processing_nodes: [CLEAN_PROCESSING],
      output_nodes: [CLEAN_OUTPUT],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('approved');
    const ex = result.value.explanation;
    expect(ex.tier_rationale?.rule_id).toMatch(/^TIER-/);
    expect(ex.tier_rationale?.matched_field).toBe('exposure');
    // TRACK-I since oracle round 001: the clean fixture is a statistical
    // model, because widening INV-CITE-01 means no generative model is clean.
    expect(ex.track_rationale?.rule_id).toBe('TRACK-I');
    expect(ex.track_rationale?.regulatory_basis).toContain('SR 26-2');
    expect(ex.hard_lines_checked).toBe(policy.hard_lines.length);
    expect(ex.invariants_checked).toBe(policy.invariants.length);
    expect(ex.tripped_invariants).toEqual([]);
    expect(ex.binding_reason).toBeNull();
    expect(ex.binding_regulatory_basis).toBeNull();
  });

  it('approved_with_controls carries the FULL tripped-invariant detail (severity, required controls, citation) — no longer the one-element approximation', () => {
    const g = graph({
      input_nodes: [{ id: 'i1', label: 'client notes', data_class: 'Client PII', data_zone: 'Zone B' }],
      processing_nodes: [TRACK_I_PROCESSING],
      output_nodes: [TRACK_I_OUTPUT],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('approved_with_controls');
    const ex = result.value.explanation;
    // V2-C: Client PII in Zone B trips INV-DATA-01, and the quantitative
    // model on a material decision trips INV-DRIFT-01 — the point of this
    // test is the FULL set, so assert both are present and inspect one.
    expect(ex.tripped_invariants.map((t) => t.id).sort()).toEqual(['INV-DATA-01', 'INV-DRIFT-01']);
    const detail = ex.tripped_invariants.find((t) => t.id === 'INV-DATA-01')!;
    expect(detail.id).toBe('INV-DATA-01');
    expect(detail.severity).toBe('High');
    expect(detail.required_controls).toEqual(['CTRL-ENC-01']);
    expect(detail.regulatory_basis).toBe('GDPR Art. 32(1)(a)');
    // The BINDING invariant is INV-DRIFT-01, not INV-DATA-01. Both are
    // severity High, and oracle round 001 replaced the alphabetical tie-break
    // with one on the cheapest resolving control — the invariant's unavoidable
    // cost. Drift monitoring (burden 3) outweighs encryption in transit
    // (burden 2), so drift is what actually determines this verdict.
    expect(result.value.binding_constraint).toBe('INV-DRIFT-01');
    expect(ex.binding_regulatory_basis).toBe('RAF §8 — drift signals; SS1/23 §3.4');
  });
});

describe('evaluate — VD-7 standing conditions (V1.2-B)', () => {
  it('an approved verdict carries statically-populated hypotheses from kri_thresholds plus graph pins', () => {
    const g = graph({
      processing_nodes: [TRACK_I_PROCESSING],
      output_nodes: [TRACK_I_OUTPUT],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const h = result.value.conditions.hypotheses;
    expect(h.some((l) => /model drift since validation/i.test(l))).toBe(true);
    expect(h.some((l) => l === 'Data zone pinned: Zone C')).toBe(true);
    expect(h.some((l) => /max autonomy level: ≤ L0/i.test(l))).toBe(true);
    // BC-V12B-03: no hypothesis may contain the words approved/rejected.
    expect(h.every((l) => !/approved|rejected/i.test(l))).toBe(true);
  });

  it('High/Critical tiers are held to the tighter high_risk override band; Low uses low_risk', () => {
    const lowG = graph({ processing_nodes: [TRACK_I_PROCESSING], output_nodes: [TRACK_I_OUTPUT] });
    const lowResult = evaluate(lowG, policy);
    if (!lowResult.ok) throw new Error('low fixture failed');
    expect(lowResult.value.conditions.hypotheses.some((l) => /low risk band.*5–40/i.test(l))).toBe(true);

    const highG = graph({
      processing_nodes: [TRACK_I_PROCESSING],
      output_nodes: [{ ...TRACK_I_OUTPUT, exposure: 'client-facing' as const }],
    });
    const highResult = evaluate(highG, policy);
    if (!highResult.ok) throw new Error('high fixture failed');
    expect(highResult.value.tier).toBe('High');
    expect(highResult.value.conditions.hypotheses.some((l) => /high risk band.*5–20/i.test(l))).toBe(true);
  });

  it('a rejection carries no hypotheses — nothing was accepted to condition', () => {
    const g = graph({
      input_nodes: [{ id: 'i1', label: 'trade intel', data_class: 'MNPI', data_zone: 'Zone A' }],
      processing_nodes: [TRACK_I_PROCESSING],
      output_nodes: [TRACK_I_OUTPUT],
    });
    const result = evaluate(g, policy);
    if (!result.ok) return;
    expect(result.value.status).toBe('rejected');
    expect(result.value.conditions.hypotheses).toEqual([]);
  });
});

describe('evaluate — jurisdiction packs (V2-A)', () => {
  const euPack = {
    pack_id: 'EU-AIACT', version: '0.1', jurisdiction: 'EU', regulator: 'EC',
    document: 'EU AI Act', effective_date: '2024-08-01',
    reviewer_name: '[FIRM] — Legal', reviewer_role: 'Head', sign_off_date: '[DATE]',
    rules: [{
      id: 'EU-AIACT-TIER-02', title: 'Annex III employment',
      source: { document: 'EU AI Act', section: 'Annex III §4(a)', text: 'recruitment or selection of natural persons…' },
      effect: { type: 'tier_floor' as const, minimum_tier: 'Critical' as const },
      condition: { decision_type: { in: ['hiring'] } },
      basis: 'derived' as const,
      reviewer_name: '[FIRM] — Legal', reviewer_role: 'Head', sign_off_date: '[DATE]',
    }],
  };

  const hiringGraph = () => graph({
    processing_nodes: [{ id: 'p1', label: 'cv screener', model_type: 'ml', autonomy_level: 1, data_zone: 'Zone B', vendor: 'internal', replaces_prior_model: false }],
    output_nodes: [{ id: 'o1', label: 'shortlist', action_type: 'recommend', exposure: 'internal-shared', decision_bindingness: 'material', output_reversibility: 'reversible', scale: 'at_scale', decision_type: 'hiring' as const }],
    jurisdictions: ['EU'],
  });

  it('an EU hiring case is FORCED from Medium to Critical by the Annex III floor, with the chain + provisional caveat (NF-7 unsigned)', () => {
    const result = evaluate(hiringGraph(), policy, [euPack]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tier).toBe('Critical');
    expect(result.value.applied_overrides).toHaveLength(1);
    expect(result.value.pack_versions).toEqual({ 'EU-AIACT': '0.1' });
    const chain = result.value.explanation.regulatory_chain ?? [];
    expect(chain).toHaveLength(1);
    expect(chain[0]?.source_text).toMatch(/recruitment or selection/);
    expect(chain[0]?.sign_off).toMatch(/pending firm adoption/);
    // BC-V2A-03: unsigned fired rule → low caveat → provisional verdict.
    expect(result.value.confidence_caveats.some((c) => c.confidence === 'low')).toBe(true);
  });

  it('without the pack (or without the jurisdiction) the same case sits at the FIRM tier, and only the pack lifts it', () => {
    // Oracle round 001: decision_type 'hiring' triggered no base tier at all,
    // so a CV screener was Critical only when the EU pack happened to be
    // loaded — the firm had no position of its own on employment decisions.
    // Hiring now sits at High in the firm's own tiers, and the EU pack floors
    // it to Critical under Annex III §4(a). The pack still demonstrably FORCES
    // a change; it is no longer the only thing standing between a CV screener
    // and a Low-tier verdict.
    const noPack = evaluate(hiringGraph(), policy);
    if (!noPack.ok) return;
    expect(noPack.value.tier).toBe('High');
    expect(noPack.value.confidence_caveats).toEqual([]);
    expect(noPack.value.applied_overrides).toEqual([]);

    const wrongJurisdiction = evaluate(graph({ ...hiringGraph(), jurisdictions: ['US'] }), policy, [euPack]);
    if (!wrongJurisdiction.ok) return;
    expect(wrongJurisdiction.value.tier).toBe('High');
  });

  it('is deterministic with packs — byte-identical across 10 runs', () => {
    const results = Array.from({ length: 10 }, () => evaluate(hiringGraph(), policy, [euPack]));
    const first = JSON.stringify(results[0]);
    for (const r of results) expect(JSON.stringify(r)).toBe(first);
  });
});
