import type { Control } from './types';

export type SolverResult = { ok: true; controls: string[] } | { ok: false; unsatisfiableInvariant: string };

// Greedy set-cover (evaluation-engine.md §4.2, ADR-004). Deterministic:
// candidates are always sorted explicitly (coverage desc, burden asc, id
// asc) before picking — never relies on Set/object iteration order (NF-1).
export function solvControls(
  trippedInvariants: string[],
  controlLibrary: Control[],
  inheritedControls: string[],
  _margin: number,
): SolverResult {
  if (trippedInvariants.length === 0) {
    return { ok: true, controls: [] };
  }

  const controlsById = new Map(controlLibrary.map((c) => [c.id, c]));

  let unsatisfied = trippedInvariants.filter((invariantId) => {
    const coveredByInherited = inheritedControls.some((controlId) =>
      controlsById.get(controlId)?.resolves.includes(invariantId),
    );
    return !coveredByInherited;
  });

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

  return { ok: true, controls: selected };
}
