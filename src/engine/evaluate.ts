import type { EvaluationResult, PolicyFile } from './types';

// Rule 1 (cross-cutting.md §7): engine is a pure island — no React, no idb, no SDK.
// Hardcoded stub — real 8-step pipeline (evaluation-engine.md §3.1) lands in P3-C01.
export function evaluate(_graph: unknown, _policy: PolicyFile): EvaluationResult {
  return {
    status: 'approved',
    tier: 'Low',
    track: 'III',
    binding_constraint: 'STUB-NO-INVARIANTS-TRIPPED',
    binding_path: 'stub-path',
    controls: [],
    downstream_reviews: [],
  };
}
