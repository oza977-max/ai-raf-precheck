import { describeGraphPath, matchesCondition } from './condition';
import type { DataFlowGraph, HardLine } from './types';

export type HardLineResult =
  | { tripped: false }
  | { tripped: true; hardLineId: string; reason: string; regulatoryBasis: string; graphPath: string };

// evaluation-engine.md §3.3: first trip returns immediately, in array order.
export function evaluateHardLines(graph: DataFlowGraph, hardLines: HardLine[]): HardLineResult {
  for (const hl of hardLines) {
    if (matchesCondition(hl.condition, graph)) {
      return {
        tripped: true,
        hardLineId: hl.id,
        reason: hl.reason,
        regulatoryBasis: hl.regulatory_basis,
        graphPath: describeGraphPath(graph),
      };
    }
  }
  return { tripped: false };
}
