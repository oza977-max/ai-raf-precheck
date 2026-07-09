import type { Control } from './types';

export type SolverResult = { ok: true; controls: string[] } | { ok: false; unsatisfiableInvariant: string };

// Stub for P3-C01 — real greedy set-cover algorithm (evaluation-engine.md
// §4.2) lands in P3-C02, which replaces this function body. This stub
// always reports every invariant satisfied with an empty control set so
// P3-C01's pipeline can be exercised end-to-end ahead of the solver landing.
export function solvControls(
  _trippedInvariants: string[],
  _controlLibrary: Control[],
  _inheritedControls: string[],
  _margin: number,
): SolverResult {
  return { ok: true, controls: [] };
}
