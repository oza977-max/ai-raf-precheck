import type { Control } from './types';

export type SolverResult =
  | {
      ok: true;
      controls: string[];
      /** Fraction of tripped invariants covered by 2+ controls (CS-1). */
      marginAchieved: number;
      /** Tripped invariants sitting at coverage depth 1 — no resilience. */
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
// WHAT MARGIN MEANS HERE — a design decision, recorded as such.
// CS-1's fit criterion says "10% of the distance from the appetite
// boundary". Control solving is discrete set cover; there is no continuous
// distance to take a percentage of. The metric used is coverage depth:
//
//   depth(i)  = number of selected-or-inherited controls that resolve i
//   depth 1   = at the boundary; remove that control and the use case falls
//               out of appetite
//   depth >=2 = has margin
//   marginAchieved = fraction of tripped invariants at depth >= 2
//
// The solver first finds a minimal cover, then adds the lowest-burden
// controls that raise depth on single-covered invariants until the target is
// met or nothing further can help. It never adds beyond the target: CS-1
// asks for resilience, not maximalism.
export function solvControls(
  trippedInvariants: string[],
  controlLibrary: Control[],
  inheritedControls: string[],
  margin: number,
): SolverResult {
  if (trippedInvariants.length === 0) {
    return { ok: true, controls: [], marginAchieved: 1, singleCovered: [] };
  }

  const controlsById = new Map(controlLibrary.map((c) => [c.id, c]));

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

  // CS-1: raise coverage depth until the margin target is met.
  // De-duplicated: a control that is both inherited and selected is one
  // control, not two. Counting it twice would report margin that does not
  // exist — caught by the PV acceptance test, which inherits a control and
  // then saw the solver re-add it as if it were redundancy.
  const effective = new Set<string>([...selectedIds, ...inheritedControls]);

  const depthOf = (invariantId: string): number =>
    [...effective].filter((controlId) => controlsById.get(controlId)?.resolves.includes(invariantId)).length;

  const achieved = () =>
    trippedInvariants.filter((i) => depthOf(i) >= 2).length / trippedInvariants.length;

  // Bounded by the library size: each pass adds at most one control, and a
  // control is never reconsidered, so this cannot loop.
  while (achieved() < margin) {
    const thin = trippedInvariants.filter((i) => depthOf(i) < 2);

    const helpers = controlLibrary
      // Excludes inherited as well as selected: re-selecting an already
      // inherited control adds no depth, it just restates the same control.
      .filter((c) => !effective.has(c.id))
      .map((c) => ({ control: c, gain: c.resolves.filter((r) => thin.includes(r)).length }))
      .filter((c) => c.gain > 0);

    // No control can raise the margin further — report honestly rather than
    // spin. With a library that has one control per invariant this is the
    // normal case, and the caller must not present the result as if the
    // margin had been satisfied.
    if (helpers.length === 0) break;

    helpers.sort((a, b) => {
      if (b.gain !== a.gain) return b.gain - a.gain;
      if (a.control.burden !== b.control.burden) return a.control.burden - b.control.burden;
      return a.control.id.localeCompare(b.control.id);
    });

    const pick = helpers[0]!.control;
    selected.push(pick.id);
    selectedIds.add(pick.id);
    effective.add(pick.id);
  }

  return {
    ok: true,
    controls: selected,
    marginAchieved: achieved(),
    singleCovered: trippedInvariants.filter((i) => depthOf(i) < 2).sort(),
  };
}
