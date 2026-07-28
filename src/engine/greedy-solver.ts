import type { Control } from './types';

export type SolverResult =
  | {
      ok: true;
      controls: string[];
      /** Fraction of tripped invariants the LIBRARY can resolve 2+ ways (CS-1). */
      marginAchieved: number;
      /** Tripped invariants only one control in the library can resolve. */
      singleCovered: string[];
    }
  | { ok: false; unsatisfiableInvariant: string };

// Greedy set-cover (evaluation-engine.md §4.2, ADR-004). Deterministic:
// candidates are always sorted explicitly (coverage desc, burden asc, id
// asc) before picking — never relies on Set/object iteration order (NF-1).
//
// CS-1 SAFETY MARGIN (health report HR-14). `margin` was previously named
// `_margin` — read from the policy, validated 0.0-1.0, threaded through
// evaluate(), and discarded. The engine therefore performed exactly the
// optimisation CS-1 names as wrong: "Optimising for minimum controls without
// margin optimises for developer convenience at the cost of governance
// resilience."
//
// WHAT MARGIN MEANS HERE — a design decision, revised in oracle round 001.
// CS-1's fit criterion says "10% of the distance from the appetite boundary".
// Control solving is discrete set cover; there is no continuous distance to
// take a percentage of. The metric used is coverage depth:
//
//   depth(i)  = number of controls IN THE LIBRARY that resolve i
//   depth 1   = a single point of failure: exactly one control in the whole
//               appetite can satisfy this invariant, so a firm that cannot
//               implement it has no route back into appetite
//   depth >=2 = there is an alternative
//   marginAchieved = fraction of tripped invariants at depth >= 2
//
// WHY DEPTH IS MEASURED OVER THE LIBRARY AND NOT THE SELECTION.
// It used to count SELECTED controls, and the solver padded the minimal cover
// with extra controls until the target was met. That was wrong in a way that
// only became visible once the library actually had alternatives (v1.1 added
// CTRL-AUTONOMY-BOUND-01 and CTRL-HITL-02, which are alternative routes to the
// same invariant): the padding made the engine demand BOTH a bounded authority
// envelope AND a human gate on every action. Redundant at best, contradictory
// at worst — and flatly at odds with the product's "minimal control set" claim,
// which is the thing the whole verdict is built on.
//
// Under the current reading the solver returns a true minimal cover and never
// pads, and the margin becomes a diagnostic about the APPETITE rather than an
// obligation on the use case: "these invariants hang on one control existing".
// That is the question a CRO actually wants answered, and it is answerable
// without inflating anybody's control set.
//
// The solver therefore no longer takes a margin target. evaluate() compares
// the achieved figure against policy.safety_margin to set boundary_proximity;
// keeping an unused parameter here is exactly the "declared, threaded, never
// consumed" defect class this codebase has hit eight times.
export function solvControls(
  trippedInvariants: string[],
  controlLibrary: Control[],
  inheritedControls: string[],
): SolverResult {
  if (trippedInvariants.length === 0) {
    return { ok: true, controls: [], marginAchieved: 1, singleCovered: [] };
  }

  const controlsById = new Map(controlLibrary.map((c) => [c.id, c]));

  // Library depth — how many DIFFERENT controls could satisfy this invariant.
  // Independent of what the solver picks, and of what a platform contributes:
  // inheriting a control does not create an alternative to it.
  const depthOf = (invariantId: string): number =>
    controlLibrary.filter((c) => c.resolves.includes(invariantId)).length;

  const coveredByInherited = (invariantId: string) =>
    inheritedControls.some((controlId) => controlsById.get(controlId)?.resolves.includes(invariantId));

  let unsatisfied = trippedInvariants.filter((invariantId) => !coveredByInherited(invariantId));

  const selected: string[] = [];
  const selectedIds = new Set<string>();

  while (unsatisfied.length > 0) {
    const candidates = controlLibrary
      .filter((c) => !selectedIds.has(c.id))
      .map((c) => ({ control: c, coverage: c.resolves.filter((r) => unsatisfied.includes(r)).length }))
      .filter((c) => c.coverage > 0);

    if (candidates.length === 0) {
      return { ok: false, unsatisfiableInvariant: unsatisfied[0]! };
    }

    candidates.sort((a, b) => {
      if (b.coverage !== a.coverage) return b.coverage - a.coverage;
      if (a.control.burden !== b.control.burden) return a.control.burden - b.control.burden;
      return a.control.id.localeCompare(b.control.id);
    });

    const best = candidates[0]!.control;
    selected.push(best.id);
    selectedIds.add(best.id);
    unsatisfied = unsatisfied.filter((invariantId) => !best.resolves.includes(invariantId));
  }

  // The cover above is the answer. No padding pass: adding a control the cover
  // does not need would make `controls` no longer the minimal set the verdict
  // claims it is.
  return {
    ok: true,
    controls: selected,
    marginAchieved:
      trippedInvariants.filter((i) => depthOf(i) >= 2).length / trippedInvariants.length,
    singleCovered: trippedInvariants.filter((i) => depthOf(i) < 2).sort(),
  };
}
