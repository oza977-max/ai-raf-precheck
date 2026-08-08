import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../store/policy';
import { loadPacks } from '../store/packs';
import { getPackSources } from '../store/pack-source';
import { evaluate } from './evaluate';
import { solvControls } from './greedy-solver';
import type { Control, DataFlowGraph, PolicyFile } from './types';

// TC-PE-PROPERTY-01 … -04.
//
// Four MUST test cases specified generative tests against fast-check and were
// never written. Build verification 003 did not walk them at all; 004 walked
// them and recorded them as STUB. The behaviours were covered by example
// tests — what was missing is the universal quantifier, which is exactly the
// claim this engine makes: deterministic over a bounded input space.
//
// An example test says "this input gives that answer". These say "no input in
// the whole space breaks this rule", which is the only kind of evidence that
// supports the product's actual pitch.
//
// The engine is a pure island (CLAUDE.md §1), so it can be driven directly at
// volume with no I/O and no fixtures beyond the shipped policy.

let policy: PolicyFile;
let packs: ReturnType<typeof loadPacks>['packs'];

beforeAll(() => {
  const yaml = readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8');
  const result = loadPolicy(yaml);
  if (!result.valid) throw new Error(`fixture policy invalid: ${JSON.stringify(result.errors)}`);
  policy = result.policy;
  // The REAL shipped packs. Passing [] here made the jurisdiction property
  // vacuous: with no packs loaded a jurisdiction cannot change anything, so
  // the monotonicity assertion held trivially over 300 runs without ever
  // exercising the code it names.
  const p = loadPacks(getPackSources());
  if (p.errors.length > 0) throw new Error(`pack errors: ${JSON.stringify(p.errors)}`);
  packs = p.packs;
});

// ── Generators over the canonical vocabulary ──────────────────────────────
// Drawn from the exported unions in types.ts rather than invented, so a new
// vocabulary member is a compile error here rather than a silent coverage gap.

const dataClass = fc.constantFrom('Public', 'Internal', 'Confidential', 'Client PII', 'MNPI' as const);
const dataZone = fc.constantFrom('Zone A', 'Zone B', 'Zone C' as const);
const modelType = fc.constantFrom(
  'statistical',
  'traditional-ml',
  'ml',
  'deep-learning',
  'llm',
  'generative-ai',
  'agentic' as const,
);
const actionType = fc.constantFrom('read', 'draft', 'recommend', 'execute', 'trade', 'approve' as const);
const exposure = fc.constantFrom('internal-only', 'internal-shared', 'client-facing', 'market-facing' as const);
const bindingness = fc.constantFrom('non-binding', 'advisory', 'material', 'binding' as const);
const reversibility = fc.constantFrom('reversible', 'irreversible', 'unknown' as const);
const scale = fc.constantFrom('limited', 'at_scale' as const);
const decisionType = fc.constantFrom(
  'credit-decision',
  'lending-decision',
  'fraud-detection',
  'trading',
  'pricing',
  'hiring',
  'regulatory-reporting',
  'operational' as const,
);
const JURISDICTIONS = ['UK', 'US', 'EU', 'CA', 'SG', 'JP'] as const;

const arbGraph = (jurisdictions: string[] = []): fc.Arbitrary<DataFlowGraph> =>
  fc.record({
    dc: dataClass,
    dz: dataZone,
    mt: modelType,
    autonomy: fc.constantFrom(0, 1, 2, 3, 4 as const),
    pz: dataZone,
    at: actionType,
    ex: exposure,
    bind: bindingness,
    rev: reversibility,
    sc: scale,
    dt: fc.option(decisionType, { nil: undefined }),
  }).map((v) => ({
    id: 'g1',
    version: 1,
    input_nodes: [{ id: 'i1', label: 'in', data_class: v.dc, data_zone: v.dz }],
    processing_nodes: [
      {
        id: 'p1',
        label: 'model',
        model_type: v.mt,
        autonomy_level: v.autonomy,
        data_zone: v.pz,
        vendor: 'internal',
        replaces_prior_model: false,
      },
    ],
    output_nodes: [
      {
        id: 'o1',
        label: 'out',
        action_type: v.at,
        exposure: v.ex,
        decision_bindingness: v.bind,
        output_reversibility: v.rev,
        scale: v.sc,
        decision_type: v.dt,
      },
    ],
    edges: [
      { from: 'i1', to: 'p1' },
      { from: 'p1', to: 'o1' },
    ],
    jurisdictions,
    intake_method: 'structured_form' as const,
    extracted_at: '2026-01-01T00:00:00.000Z',
  }));

const TIER_RANK: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };
const rank = (t: string): number => TIER_RANK[t] ?? 0;
const RUNS = 300;

describe('TC-PE-PROPERTY-01 — jurisdiction monotonicity', () => {
  it('adding a jurisdiction never lowers the tier and never relaxes the track', () => {
    fc.assert(
      fc.property(arbGraph(), fc.constantFrom(...JURISDICTIONS), (base, added) => {
        const before = evaluate(base, policy, packs);
        const after = evaluate({ ...base, jurisdictions: [added] }, policy, packs);
        if (!before.ok || !after.ok) return true; // engine errors are PROPERTY-03's business

        expect(rank(after.value.tier)).toBeGreaterThanOrEqual(rank(before.value.tier));
        // Track is never moved by a jurisdiction at all — the supplement model
        // (PE-6). Equality is the stronger claim, so assert it rather than >=.
        expect(after.value.track).toBe(before.value.track);
        return true;
      }),
      { numRuns: RUNS },
    );
  });

  // The property above holds over the whole space, but a census showed only
  // ~1 case in 300 actually moved the tier — most random graphs trigger no
  // pack rule at all, so the assertion was nearly always trivially true.
  // This narrows the generator to the shapes that DO fire a jurisdiction tier
  // floor, so the monotonic direction is exercised rather than assumed.
  it('exercises the raising path: a pack tier floor only ever moves the tier up', () => {
    const floorTriggering = fc.record({
      dt: fc.constantFrom('credit-decision', 'lending-decision', 'hiring' as const),
      bind: fc.constantFrom('material', 'binding' as const),
      ex: fc.constantFrom('client-facing', 'internal-shared' as const),
      j: fc.constantFrom('EU', 'UK', 'US' as const),
    });

    let observedARaise = false;
    fc.assert(
      fc.property(arbGraph(), floorTriggering, (base, v) => {
        const shaped: DataFlowGraph = {
          ...base,
          output_nodes: [{ ...base.output_nodes[0]!, decision_type: v.dt, decision_bindingness: v.bind, exposure: v.ex }],
        };
        const without = evaluate({ ...shaped, jurisdictions: [] }, policy, packs);
        const with_ = evaluate({ ...shaped, jurisdictions: [v.j] }, policy, packs);
        if (!without.ok || !with_.ok) return true;

        expect(rank(with_.value.tier)).toBeGreaterThanOrEqual(rank(without.value.tier));
        expect(with_.value.track).toBe(without.value.track);
        if (rank(with_.value.tier) > rank(without.value.tier)) observedARaise = true;
        return true;
      }),
      { numRuns: RUNS },
    );

    // Guards against this property going quietly vacuous if the packs change:
    // if no generated case ever raises a tier, the assertion above proves
    // nothing and this test should fail loudly rather than stay green.
    expect(observedARaise).toBe(true);
  });
});

describe('TC-PE-PROPERTY-02 — impact dominance', () => {
  it('permuting the tiers array never changes any verdict', () => {
    fc.assert(
      fc.property(arbGraph(), fc.shuffledSubarray(policy.tiers, { minLength: policy.tiers.length }), (g, shuffled) => {
        const straight = evaluate(g, policy, []);
        const permuted = evaluate(g, { ...policy, tiers: shuffled }, []);

        // The WHOLE serialised result, not just the tier — the same discipline
        // as TC-PE-1-01, so a new field is covered here automatically.
        expect(JSON.stringify(permuted)).toBe(JSON.stringify(straight));
        return true;
      }),
      { numRuns: RUNS },
    );
  });

  // Mutation-testing the property above showed it survives removing
  // `sortedById(policy.tiers)` from evaluate(). That is not a bug: tier
  // selection takes the MAXIMUM tier rather than the first match
  // (tier.ts:30), so it is order-independent by construction. What the sort
  // actually protects is the TIE-BREAK — `>` is strict, so when two rules
  // yield the SAME tier the first one encountered wins and its id lands in
  // the explanation. Random graphs almost never produce that tie, so the
  // property above cannot see it. This one manufactures it.
  it('breaks ties between equal-tier rules deterministically, whatever the array order', () => {
    const critical = policy.tiers.find((t) => t.name === 'Critical');
    if (!critical) throw new Error('fixture policy has no Critical tier rule');

    // Two DIFFERENT rules that both yield Critical on the same trigger — a
    // genuine tie, which the shipped policy does not happen to contain.
    const twin = { ...critical, id: `${critical.id}-TWIN` };

    fc.assert(
      fc.property(arbGraph(), fc.boolean(), (g, twinFirst) => {
        const tiers = twinFirst
          ? [twin, ...policy.tiers]
          : [...policy.tiers, twin];
        const result = evaluate(g, { ...policy, tiers }, []);
        const reference = evaluate(g, { ...policy, tiers: [twin, ...policy.tiers] }, []);
        if (!result.ok || !reference.ok) return true;

        // Same winner regardless of which order they were declared in.
        expect(JSON.stringify(result)).toBe(JSON.stringify(reference));
        return true;
      }),
      { numRuns: RUNS },
    );
  });

  it('permuting the invariants and controls arrays does not change a verdict either', () => {
    fc.assert(
      fc.property(
        arbGraph(),
        fc.shuffledSubarray(policy.invariants, { minLength: policy.invariants.length }),
        fc.shuffledSubarray(policy.controls, { minLength: policy.controls.length }),
        (g, invariants, controls) => {
          const straight = evaluate(g, policy, []);
          const permuted = evaluate(g, { ...policy, invariants, controls }, []);
          expect(JSON.stringify(permuted)).toBe(JSON.stringify(straight));
          return true;
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe('TC-PE-PROPERTY-03 — hard-line supremacy', () => {
  it('a graph that trips a hard line is rejected, whatever controls the library holds', () => {
    // Extra controls are the adversary here: no addition to the library may
    // rescue a hard-line breach. That is what makes a hard line "hard", and
    // it is the property a firm is relying on when it writes one.
    const extraControls = fc.array(
      fc.record({ n: fc.integer({ min: 0, max: 9999 }), inv: fc.constantFrom(...policy.invariants.map((i) => i.id)) }),
      { maxLength: 6 },
    );

    let observedAHardLine = false;
    fc.assert(
      fc.property(arbGraph(), extraControls, (g, extras) => {
        const baseline = evaluate(g, policy, []);
        if (!baseline.ok) return true;
        // A base hard line returns ok:true with status 'rejected' and a
        // non-null binding_reason — it is NOT an EngineError, despite the
        // `hard-line-tripped` kind existing in the error union
        // (evaluate.ts:69-122). Writing this against the error shape made the
        // property vacuous: it skipped all 300 generated cases.
        if (baseline.value.status !== 'rejected') return true;
        if (baseline.value.explanation.binding_reason === null) return true;

        const inflated: Control[] = extras.map((e, idx) => ({
          id: `CTRL-GEN-${idx}-${e.n}`,
          name: `generated ${idx}`,
          description: 'generated for TC-PE-PROPERTY-03',
          resolves: [e.inv],
          burden: 1,
          verification: 'none',
        }));

        const withMoreControls = evaluate(g, { ...policy, controls: [...policy.controls, ...inflated] }, []);
        if (!withMoreControls.ok) return true;

        // No addition to the control library rescues a hard-line breach, the
        // SAME hard line is still the one named, and no control set is offered
        // — controls are never even solved for, by step order (PE-4).
        expect(withMoreControls.value.status).toBe('rejected');
        expect(withMoreControls.value.binding_constraint).toBe(baseline.value.binding_constraint);
        expect(withMoreControls.value.controls).toEqual([]);
        observedAHardLine = true;
        return true;
      }),
      { numRuns: RUNS },
    );

    // Anti-vacuity. The first version of this property was written against the
    // wrong result shape and skipped all 300 generated cases while passing —
    // the exact "green is not evidence" failure. This guard makes that
    // impossible to repeat silently: no hard-line case seen, test fails.
    expect(observedAHardLine).toBe(true);
  });
});

describe('TC-PE-PROPERTY-04 — solver soundness', () => {
  it('every tripped invariant is covered, and no control in the set is redundant', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 40 }), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 1, max: 4 }),
        (invIdxs, breadth) => {
          const tripped = invIdxs.map((n) => `INV-GEN-${n}`);

          // A library where each invariant has `breadth` distinct controls
          // able to satisfy it, plus decoys that resolve nothing relevant.
          const library: Control[] = [];
          for (const inv of tripped) {
            for (let k = 0; k < breadth; k++) {
              library.push({
                id: `CTRL-${inv}-${k}`,
                name: `covers ${inv} (${k})`,
                description: 'generated',
                resolves: [inv],
                burden: ((k % 5) + 1) as 1 | 2 | 3 | 4 | 5,
                verification: 'none',
              });
            }
          }
          library.push({
            id: 'CTRL-DECOY',
            name: 'decoy',
            description: 'resolves nothing tripped',
            resolves: ['INV-NOT-TRIPPED'],
            burden: 1,
            verification: 'none',
          });

          const result = solvControls(tripped, library, []);
          expect(result.ok).toBe(true);
          if (!result.ok) return true;

          const byId = new Map(library.map((c) => [c.id, c]));

          // COVERAGE — every tripped invariant is resolved by something chosen.
          for (const inv of tripped) {
            const covered = result.controls.some((id) => byId.get(id)?.resolves.includes(inv));
            expect(covered).toBe(true);
          }

          // SOUNDNESS — every chosen control does real work.
          for (const id of result.controls) {
            const resolves = byId.get(id)?.resolves ?? [];
            expect(resolves.some((inv) => tripped.includes(inv))).toBe(true);
          }

          // MINIMALITY — dropping any one control leaves something uncovered.
          // This is the claim "minimal control set" makes, tested rather than
          // asserted in prose.
          for (const dropped of result.controls) {
            const remaining = result.controls.filter((id) => id !== dropped);
            const stillCovered = tripped.every((inv) =>
              remaining.some((id) => byId.get(id)?.resolves.includes(inv)),
            );
            expect(stillCovered).toBe(false);
          }

          // The decoy is never selected — it resolves nothing that was tripped.
          expect(result.controls).not.toContain('CTRL-DECOY');
          return true;
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('an empty tripped set needs no controls at all', () => {
    const result = solvControls([], policy.controls, []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.controls).toEqual([]);
  });
});
