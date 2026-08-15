import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../store/policy';
import { evaluate } from './evaluate';
import { isVerdictProvisional, PROVISIONAL_REASONS } from './provisional';
import type { DataFlowGraph, JurisdictionPack, PolicyFile } from './types';

// P8-C04 — evaluation-engine.md §13 / ADR-EE-R3-1. The engine determines
// Provisional and names its causes; the verdict screen and the register row
// read that determination and never re-derive it.

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

// Carries a [FIRM] placeholder in its reviewer field, so its rules are
// unsigned and a fired rule emits a low-confidence caveat (NF-7).
const euPack: JurisdictionPack = {
  pack_id: 'EU-AIACT',
  version: '0.1',
  jurisdiction: 'EU',
  regulator: 'EC',
  document: 'EU AI Act',
  effective_date: '2024-08-01',
  reviewer_name: '[FIRM] — Legal',
  reviewer_role: 'Head',
  sign_off_date: '[DATE]',
  rules: [
    {
      id: 'EU-AIACT-TIER-02',
      title: 'Annex III employment',
      source: {
        document: 'EU AI Act',
        section: 'Annex III §4(a)',
        text: 'recruitment or selection of natural persons…',
      },
      effect: { type: 'tier_floor' as const, minimum_tier: 'Critical' as const },
      condition: { decision_type: { in: ['hiring'] } },
      basis: 'derived' as const,
      reviewer_name: '[FIRM] — Legal',
      reviewer_role: 'Head',
      sign_off_date: '[DATE]',
    },
  ],
};

/** Fires the unsigned pack rule (decision_type hiring). */
const hiringGraph = (jurisdictions: string[]) =>
  graph({
    processing_nodes: [
      {
        id: 'p1',
        label: 'cv screener',
        model_type: 'ml',
        autonomy_level: 1,
        data_zone: 'Zone B',
        vendor: 'internal',
        replaces_prior_model: false,
      },
    ],
    output_nodes: [
      {
        id: 'o1',
        label: 'shortlist',
        action_type: 'recommend',
        exposure: 'internal-shared',
        decision_bindingness: 'material',
        output_reversibility: 'reversible',
        scale: 'at_scale',
        decision_type: 'hiring' as const,
      },
    ],
    jurisdictions,
  });

/** Fires no pack rule at all. */
const plainGraph = (jurisdictions: string[]) =>
  graph({
    processing_nodes: [
      {
        id: 'p1',
        label: 'summariser',
        model_type: 'ml',
        autonomy_level: 1,
        data_zone: 'Zone C',
        vendor: 'internal',
        replaces_prior_model: false,
      },
    ],
    output_nodes: [
      {
        id: 'o1',
        label: 'summary',
        action_type: 'recommend',
        exposure: 'internal-shared',
        decision_bindingness: 'advisory',
        output_reversibility: 'reversible',
        scale: 'limited',
      },
    ],
    jurisdictions,
  });

function reasonsFor(g: DataFlowGraph, packs: JurisdictionPack[] = []) {
  const result = evaluate(g, policy, packs);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('evaluate failed');
  return result.value;
}

// Copeland decision table. The two conditions are independent, so all four
// pairs are exercised — this is what stops the causes collapsing into one
// indistinguishable badge.
describe('provisional reasons — the four condition pairs (ADR-EE-R3-1)', () => {
  it('TC-R3-JU-2-01: no pack activated yields the no-regulatory-basis reason, and it is neither empty nor absent', () => {
    const value = reasonsFor(plainGraph([]));

    expect(value.provisional_reasons).toEqual(['no_regulatory_basis']);
    // "MUST NOT contain: an empty or absent provisional-reason value" — the
    // status is only honest if the cause is actually carried.
    expect(value.provisional_reasons).not.toEqual([]);
    expect(value.provisional_reasons[0]).toBeTruthy();
    expect(isVerdictProvisional(value)).toBe(true);
  });

  it('unsigned pack rules alone yield the unsigned reason and NOT the no-basis one', () => {
    const value = reasonsFor(hiringGraph(['EU']), [euPack]);

    // A basis exists and is pending firm adoption. Saying "no basis" here
    // would claim less than the engine knows, and the two are different
    // claims (§13.1).
    expect(value.provisional_reasons).toEqual(['unsigned_pack_rules']);
    expect(value.provisional_reasons).not.toContain('no_regulatory_basis');
  });

  it('TC-R3-JU-2-02: a jurisdiction whose pack activated and fires nothing unsigned is NOT provisional', () => {
    const value = reasonsFor(plainGraph(['EU']), [euPack]);

    expect(value.pack_versions).toEqual({ 'EU-AIACT': '0.1' });
    expect(value.provisional_reasons).toEqual([]);
    expect(isVerdictProvisional(value)).toBe(false);
  });

  // The fourth pair — BOTH conditions at once — is UNREACHABLE, and that is a
  // property of the triggers rather than of this policy. `no_regulatory_basis`
  // is raised when no pack activated; `unsigned_pack_rules` is raised when a
  // fired pack RULE is unsigned. A rule cannot fire from a pack that never
  // activated, so the two are mutually exclusive by construction.
  //
  // ADR-EE-R3-1 states "the two conditions can co-occur and both are then
  // listed", which its own trigger definitions contradict. Recorded rather
  // than quietly satisfied by a test that cannot fail — an earlier draft of
  // this test appended the second reason by hand and asserted length 2, which
  // would have passed against any implementation whatsoever.
  it('the two conditions are mutually exclusive by construction, so no verdict carries both [TC-R3-JU-6-03]', () => {
    const noPack = reasonsFor(plainGraph([]));
    const activated = reasonsFor(hiringGraph(['EU']), [euPack]);

    expect(noPack.provisional_reasons).toEqual(['no_regulatory_basis']);
    expect(activated.provisional_reasons).toEqual(['unsigned_pack_rules']);
    for (const value of [noPack, activated]) {
      expect(value.provisional_reasons.length).toBeLessThanOrEqual(1);
    }
  });

  it('the reason order is fixed by declaration, so a multi-reason verdict could never vary (R3-NF-1)', () => {
    // The ordering contract is asserted directly on the constant rather than
    // on a verdict, because the first two cannot co-occur. The THIRD can
    // co-occur with either — an unclassified decision type is independent of
    // whether a pack activated — so a genuinely multi-reason verdict is now
    // reachable and this order is the one it must emit in.
    expect([...PROVISIONAL_REASONS]).toEqual([
      'unsigned_pack_rules',
      'no_regulatory_basis',
      'unclassified_decision_type',
    ]);
  });
});

describe('provisional reasons — determinism and shape (R3-NF-1)', () => {
  it('TC-R3-NF-1-01: the new field is byte-identical across 10 runs', () => {
    const results = Array.from({ length: 10 }, () => evaluate(hiringGraph(['EU']), policy, [euPack]));
    const first = JSON.stringify(results[0]);
    for (const r of results) expect(JSON.stringify(r)).toBe(first);
  });

  it('every return path carries the field — including a hard-line rejection', () => {
    // The field is derived at the single construction choke point, so no
    // early return can omit it. A rejection that silently lacked the field
    // would read as "not provisional" to every consumer.
    const rejected = reasonsFor(
      graph({
        input_nodes: [
          { id: 'i1', label: 'mnpi', data_class: 'MNPI', data_zone: 'Zone A' },
        ],
        processing_nodes: [
          {
            id: 'p1',
            label: 'x',
            model_type: 'llm',
            autonomy_level: 4,
            data_zone: 'Zone B',
            vendor: 'external',
            replaces_prior_model: false,
          },
        ],
        output_nodes: [
          {
            id: 'o1',
            label: 'y',
            action_type: 'execute',
            exposure: 'client-facing',
            decision_bindingness: 'binding',
            output_reversibility: 'irreversible',
            scale: 'at_scale',
          },
        ],
        edges: [
          { from: 'i1', to: 'p1' },
          { from: 'p1', to: 'o1' },
        ],
      }),
    );

    expect(Array.isArray(rejected.provisional_reasons)).toBe(true);
    expect(rejected.provisional_reasons).toContain('no_regulatory_basis');
  });
});

// REALISTIC-FIXTURE VARIANT (TDD-3). A verdict persisted before this chunk has
// no `provisional_reasons` field at all. Treating absent as empty would
// silently downgrade a historical Provisional verdict to plain — a false
// statement about a record someone may have signed.
describe('provisional reasons — verdicts persisted before this chunk', () => {
  it('a legacy verdict with a low-confidence caveat and no reasons field still reads as provisional', () => {
    const legacy = {
      ...reasonsFor(plainGraph(['EU']), [euPack]),
      confidence_caveats: [{ field: 'tier', confidence: 'low' as const, reason: 'unsigned pack rule' }],
    } as Record<string, unknown>;
    delete legacy.provisional_reasons;

    expect(isVerdictProvisional(legacy as never)).toBe(true);
  });

  it('a legacy verdict with no caveats and no reasons field reads as not provisional', () => {
    const legacy = { ...reasonsFor(plainGraph(['EU']), [euPack]) } as Record<string, unknown>;
    delete legacy.provisional_reasons;

    expect(isVerdictProvisional(legacy as never)).toBe(false);
  });
});

// TC-R3-NF-1-02 — the engine island holds (cross-cutting.md §7 rule 1). The
// module this chunk adds is the one most likely to breach it, because both a
// React component and the persistence layer now import from it: the pull is
// towards moving it OUT of the engine to be "closer to its consumers", which
// is exactly what ADR-EE-R3-1 rejected as option 2.
describe('provisional reasons — the engine island (TC-R3-NF-1-02)', () => {
  it('imports only engine types and stdlib, with no clock and no randomness', () => {
    const source = readFileSync(resolve(__dirname, 'provisional.ts'), 'utf-8');

    for (const forbidden of ['react', 'idb', '@anthropic-ai', '../store/', '../components/']) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).not.toContain('Date.now');
    expect(source).not.toContain('Math.random');
  });
});

// User report while using the product: "what kind of decisions does it feed
// into — that question should have a dropdown where the user can type as well,
// right? it's too specific."
//
// The instinct is right and the naive fix is dangerous. `decision_type` is not
// a description field, it is a MATCHING KEY: it gates HL-003 and HL-004 (both
// hard lines), TIER-CRITICAL, TIER-HIGH, and EU AI Act Annex III §5(b)/§4(a).
// A free-text value matches none of them, so a use case with an unlisted
// decision type would come back at a lower tier than it deserves with nothing
// on screen saying why. Silent under-classification is the worst failure this
// product has.
//
// So the free text is captured, and the fact that it matched no rule is stated
// — a third provisional reason, which is precisely the extension this module's
// header anticipated ("the collection stays ordered and plural so a future
// third reason needs no consumer change").
describe('unclassified decision type is stated, never silently ignored', () => {
  const out = {
    id: 'o1',
    label: 'out',
    action_type: 'recommend' as const,
    exposure: 'internal-shared' as const,
    decision_bindingness: 'advisory' as const,
    output_reversibility: 'reversible' as const,
    scale: 'limited' as const,
  };

  it('raises unclassified_decision_type when the submitter typed their own', () => {
    const g = graph({
      processing_nodes: [
        { id: 'p1', label: 'm', model_type: 'ml', autonomy_level: 1, data_zone: 'Zone C', vendor: 'internal', replaces_prior_model: false },
      ],
      output_nodes: [{ ...out, decision_type_other: 'collections prioritisation' }],
    });
    const r = evaluate(g, policy, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.provisional_reasons).toContain('unclassified_decision_type');
    expect(isVerdictProvisional(r.value)).toBe(true);
  });

  it('does NOT raise it when a known decision type was chosen', () => {
    const g = graph({
      processing_nodes: [
        { id: 'p1', label: 'm', model_type: 'ml', autonomy_level: 1, data_zone: 'Zone C', vendor: 'internal', replaces_prior_model: false },
      ],
      output_nodes: [{ ...out, decision_type: 'credit-decision' as const }],
    });
    const r = evaluate(g, policy, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.provisional_reasons).not.toContain('unclassified_decision_type');
  });

  it('does NOT raise it when the question was simply left unanswered', () => {
    // Leaving it blank and typing something the policy does not know are
    // different claims. Blank says "no decision type applies"; free text says
    // "one applies and your policy has no rule for it". Only the second is a
    // gap in the firm's framework, and only the second is worth flagging.
    const g = graph({
      processing_nodes: [
        { id: 'p1', label: 'm', model_type: 'ml', autonomy_level: 1, data_zone: 'Zone C', vendor: 'internal', replaces_prior_model: false },
      ],
      output_nodes: [{ ...out }],
    });
    const r = evaluate(g, policy, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.provisional_reasons).not.toContain('unclassified_decision_type');
  });

  it('the free text is carried on the verdict so the gap is nameable', () => {
    const g = graph({
      processing_nodes: [
        { id: 'p1', label: 'm', model_type: 'ml', autonomy_level: 1, data_zone: 'Zone C', vendor: 'internal', replaces_prior_model: false },
      ],
      output_nodes: [{ ...out, decision_type_other: 'AML alert triage' }],
    });
    const r = evaluate(g, policy, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // A reason with no subject is not actionable — the firm needs to know
    // WHICH decision type its policy does not cover.
    expect(r.value.unclassified_decision_types).toEqual(['AML alert triage']);
  });

  it('declaration order is stable — NF-1 holds with a third reason', () => {
    expect([...PROVISIONAL_REASONS]).toEqual([
      'unsigned_pack_rules',
      'no_regulatory_basis',
      'unclassified_decision_type',
    ]);
  });
});
