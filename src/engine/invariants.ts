import { describeGraphPath, matchesCondition } from './condition';
import type { DataFlowGraph, Invariant } from './types';

export interface TrippedInvariant {
  invariantId: string;
  description: string;
  graphPath: string;
}

// evaluation-engine.md §3.7: all invariants evaluated, no short-circuit —
// the solver needs the complete tripped set.
export function evaluateInvariants(graph: DataFlowGraph, invariants: Invariant[]): TrippedInvariant[] {
  const tripped: TrippedInvariant[] = [];
  for (const inv of invariants) {
    if (matchesCondition(inv.condition, graph)) {
      tripped.push({ invariantId: inv.id, description: inv.description, graphPath: describeGraphPath(graph) });
    }
  }
  return tripped;
}
