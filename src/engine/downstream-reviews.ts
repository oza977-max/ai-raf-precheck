// Firm-required downstream reviews (CS-3).
// Rule 1 (cross-cutting.md §7): engine island — engine types and stdlib only.
//
// CS-3 requires the verdict to list downstream reviews triggered by the use
// case's characteristics — information security review, vendor risk
// assessment, cloud security approval, "or other bank-configured processes" —
// as mandatory steps separate from the AI risk pre-check.
//
// Build verification 003 found this had no implementation. Reviews could only
// arrive from a jurisdiction pack's `required_review` effect
// (jurisdiction.ts) or from an unregistered platform/vendor
// (evaluate.ts unapprovedComponentReviews). The FIRM'S OWN policy had no way
// to require one, so an MNPI-handling use case triggered no information
// security review — not because the rule was wrong, but because it could not
// be written.
//
// The condition vocabulary is the one already used by hard lines, tiers,
// tracks and invariants. A firm that can write an invariant can write one of
// these without learning anything new, which is CF-1's whole point.
import { matchesCondition } from './condition';
import type { DataFlowGraph, PolicyFile } from './types';

export interface TriggeredReview {
  /** The policy rule that triggered it — CS-3's fit criterion asks for this by
   *  name. A required review with no traceable cause is an instruction with no
   *  author, and nobody can argue with it or check it. */
  rule_id: string;
  review: string;
  regulatory_basis?: string;
}

/** Pure. Sorted by rule id so the collection is deterministic (NF-1), like
 *  every other policy collection this engine iterates. */
export function firmRequiredReviews(graph: DataFlowGraph, policy: PolicyFile): TriggeredReview[] {
  const rules = policy.downstream_reviews ?? [];

  return [...rules]
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter((rule) => matchesCondition(rule.condition, graph))
    .map((rule) => ({
      rule_id: rule.id,
      review: rule.review,
      ...(rule.regulatory_basis ? { regulatory_basis: rule.regulatory_basis } : {}),
    }));
}
