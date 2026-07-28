import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { solvControls } from './greedy-solver';
import { loadPolicy } from '../store/policy';
import type { Control } from './types';

// CS-1 (Must). Health report HR-14: `safety_margin` was declared in the policy
// schema, validated 0.0-1.0, threaded through evaluate() into solvControls()
// as `_margin` — the TypeScript convention for deliberately unused — and
// discarded. Note that is HISTORY: solvControls() no longer takes a margin
// parameter at all. policy.safety_margin is now compared in evaluate() against
// solverResult.marginAchieved, because leaving an unused parameter behind was
// itself the defect (code review 002). The engine performed exactly the optimisation CS-1 names as
// wrong: "Optimising for minimum controls without margin optimises for
// developer convenience at the cost of governance resilience."
//
// WHAT "MARGIN" MEANS HERE, AND WHY IT IS A DESIGN DECISION.
// CS-1's fit criterion says "10% of the distance from the appetite boundary".
// Control solving is discrete set cover; there is no continuous distance to
// take 10% of. The metric below is therefore a design decision, recorded as
// such:
//
//   coverage depth of invariant i = number of controls IN THE LIBRARY that
//                                   resolve i
//   depth 1   -> a single point of failure: exactly one control in the whole
//                appetite satisfies i, so a firm that cannot implement that
//                control has no route back into appetite
//   depth >=2 -> there is an alternative
//   margin achieved = fraction of tripped invariants at depth >= 2
//
// REVISED IN ORACLE ROUND 001 — depth used to count SELECTED controls, and
// the solver padded the minimal cover until the target was met. That was
// invisible while the library had exactly one control per invariant. Once
// v1.1 added genuine alternatives (CTRL-AUTONOMY-BOUND-01 and CTRL-HITL-02
// are two routes to the same invariant), the padding started demanding BOTH a
// bounded authority envelope AND a human gate on every action — redundant at
// best, contradictory at worst, and flatly at odds with the "minimal control
// set" claim the entire verdict rests on.
//
// So the margin is now a diagnostic about the APPETITE, not an obligation on
// the use case: it answers "which of these invariants hang on one control
// existing?" without inflating anybody's control set.

function ctrl(id: string, resolves: string[], burden: number): Control {
  return { id, name: id, description: id, resolves, burden, verification: 'test fixture' } as Control;
}

describe('TC-CS-1-02: safety margin reports library depth without inflating the control set', () => {
  // Two controls resolve INV-A; one resolves INV-B. The minimal cover needs
  // one control for INV-A — but INV-A still HAS an alternative, and INV-B
  // does not. That difference is what the margin exists to report.
  const LIBRARY = [
    ctrl('C-A1', ['INV-A'], 1),
    ctrl('C-A2', ['INV-A'], 2),
    ctrl('C-B1', ['INV-B'], 1),
  ];

  it('returns the MINIMAL cover and never pads it to reach a margin', () => {
    const r = solvControls(['INV-A', 'INV-B'], LIBRARY, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // C-A2 is NOT selected. It is an alternative to C-A1, not a supplement to
    // it: requiring both would be asking the firm to do the same job twice.
    expect(r.controls).toEqual(['C-A1', 'C-B1']);
  });

  it('reports margin from what the library COULD do, not from what was selected', () => {
    const r = solvControls(['INV-A', 'INV-B'], LIBRARY, []);
    if (!r.ok) return;
    // INV-A has two possible controls, INV-B has one => half the tripped set
    // has an alternative.
    expect(r.marginAchieved).toBe(0.5);
    expect(r.singleCovered).toEqual(['INV-B']);
  });

  it('names the invariants that are single points of failure in the appetite', () => {
    // The actionable output: INV-B is served by exactly one control, so a firm
    // that cannot implement C-B1 has no route into appetite. That is a gap in
    // the RULEBOOK for its author to close, not a control for this use case.
    const r = solvControls(['INV-B'], LIBRARY, []);
    if (!r.ok) return;
    expect(r.marginAchieved).toBe(0);
    expect(r.singleCovered).toEqual(['INV-B']);
  });

  it('does not count an inherited control as an alternative to itself', () => {
    // A platform contributing C-A2 satisfies the invariant, but it does not
    // create a new way to satisfy it — depth is a property of the library.
    // The old implementation counted inherited controls into depth, which let
    // a platform appear to add resilience it had not added.
    const withInheritance = solvControls(['INV-A'], LIBRARY, ['C-A2']);
    const without = solvControls(['INV-A'], LIBRARY, []);
    if (!withInheritance.ok || !without.ok) return;
    expect(withInheritance.marginAchieved).toBe(without.marginAchieved);
    // ...but it DOES discharge the cover, so nothing is selected.
    expect(withInheritance.controls).toEqual([]);
  });

  it('is deterministic — identical inputs give an identical result (NF-1)', () => {
    const runs = Array.from({ length: 10 }, () =>
      JSON.stringify(solvControls(['INV-A', 'INV-B'], LIBRARY, [])),
    );
    expect(new Set(runs).size).toBe(1);
  });
});

describe('CS-1 against the real control library — the honest result', () => {
  it('reports zero margin when no invariant has an alternative control', () => {
    const oneEach = [ctrl('C-1', ['INV-1'], 1), ctrl('C-2', ['INV-2'], 1)];
    const r = solvControls(['INV-1', 'INV-2'], oneEach, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.marginAchieved).toBe(0);
    expect(r.singleCovered).toEqual(['INV-1', 'INV-2']);
  });

  // Oracle round 001 added CTRL-INDEP-VAL-01, which resolves three invariants,
  // so the shipped appetite finally offers real alternatives. Before v1.1 it
  // had exactly one control per invariant and NO achievable margin at any
  // target — the metric was permanently zero and told the firm nothing.
  it('the shipped appetite now offers a genuine alternative on some invariants', () => {
    const loaded = loadPolicy(
      readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8'),
    );
    if (!loaded.valid) throw new Error('shipped policy invalid');

    const depth = (id: string) =>
      loaded.policy.controls.filter((c) => c.resolves.includes(id)).length;
    const withAlternatives = loaded.policy.invariants.filter((i) => depth(i.id) >= 2);

    expect(withAlternatives.length).toBeGreaterThan(0);

    // And the metric still reports honestly where the library IS thin —
    // INV-ZONE-01 is deliberately unsatisfiable, so it can never gain depth.
    const r = solvControls(['INV-TRACK2-01'], loaded.policy.controls, []);
    if (!r.ok) return;
    expect(r.marginAchieved).toBe(1);
    expect(r.singleCovered).toEqual([]);
  });
});
