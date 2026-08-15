// Provisional determination (evaluation-engine.md §13, ADR-EE-R3-1).
// Rule 1 (cross-cutting.md §7): engine island — engine types and stdlib only.
//
// Before round 3, "Provisional" was derived independently by two consumers
// from the same expression: `VerdictDisplay.tsx:161` (`lowCaveats.length > 0`)
// and `store/register.ts:55` (`confidence_caveats.some(c => c.confidence ===
// 'low')`) — both verified at commit 90c5d3c, the state this chunk replaced.
// One rule, two layers, no shared definition, and round 3 adds a second cause.
// The determination now lives here and both consumers read it.
import type { ConfidenceCaveat, DataFlowGraph, EvaluationResult } from './types';

/** Declaration order IS the emission order (§13.2, NF-1) — never discovery
 *  order, so two runs over identical inputs produce identical collections. */
export const PROVISIONAL_REASONS = ['unsigned_pack_rules', 'no_regulatory_basis', 'unclassified_decision_type'] as const;

export type ProvisionalReason = (typeof PROVISIONAL_REASONS)[number];

/** The two reasons are different claims and the distinction is the point of
 *  R3-JU-6. `unsigned_pack_rules`: a basis exists and the firm has not adopted
 *  it yet. `no_regulatory_basis`: there is no basis. Presenting the second as
 *  the first would claim more than the engine can support.
 *
 *  They are mutually exclusive by construction: a rule cannot fire from a pack
 *  that never activated. ADR-EE-R3-1 says the two "can co-occur", which its own
 *  trigger definitions rule out — recorded in the chunk handover rather than
 *  papered over here. The collection stays ordered and plural so a future
 *  third reason needs no consumer change. */
export function provisionalReasons(
  caveats: readonly ConfidenceCaveat[],
  packVersions: Readonly<Record<string, string>>,
  graph?: DataFlowGraph,
): ProvisionalReason[] {
  const raised = new Set<ProvisionalReason>();

  // NF-7: a fired unsigned pack rule emits its caveat at low confidence. The
  // caveat says WHICH rule is unadopted and keeps its own RA-11 rendering;
  // this says why the verdict AS A WHOLE is provisional (§13.1a).
  if (caveats.some((c) => c.confidence === 'low')) raised.add('unsigned_pack_rules');

  // No pack activated at all — not "no rule fired". A pack that activates and
  // matches nothing still supplies a regulatory basis that was checked.
  if (Object.keys(packVersions).length === 0) raised.add('no_regulatory_basis');

  // The third reason the header above anticipated. A submitter typed a
  // decision type the policy has no rule for, so every decision-type trigger
  // — two hard lines and two tier rules — sat out. The tier that came back
  // rests on the other answers alone, and saying so is the difference between
  // a gap and a silent under-classification.
  //
  // Blank is NOT this. Leaving the question unanswered says no decision type
  // applies; typing one says a decision type applies and the firm's framework
  // does not cover it. Only the second is a hole in the policy.
  if (unclassifiedDecisionTypes(graph).length > 0) raised.add('unclassified_decision_type');

  return PROVISIONAL_REASONS.filter((r) => raised.has(r));
}

/** The decision types a submitter typed that the policy has no rule for.
 *  Sorted and deduplicated so the collection is byte-stable across runs (NF-1).
 *  A reason with no subject is not actionable — the firm needs to know WHICH
 *  decision type it has no position on, and over time this is the list of
 *  holes its own framework has. */
export function unclassifiedDecisionTypes(graph?: DataFlowGraph): string[] {
  if (!graph) return [];
  const typed = graph.output_nodes
    .map((n) => n.decision_type_other?.trim())
    .filter((v): v is string => Boolean(v));
  return [...new Set(typed)].sort();
}

/** The single predicate both consumers call. A verdict is Provisional if and
 *  only if it carries at least one reason.
 *
 *  The legacy branch is deliberate and narrow. A verdict persisted before this
 *  chunk has no `provisional_reasons` field, and reading absent-as-empty would
 *  silently downgrade a historical Provisional verdict to plain — a false
 *  statement about a record someone may already have signed. That is worse
 *  than the duplication this chunk removes. It stays a legacy READ path only:
 *  it is confined to this one function, so there is still a single definition
 *  of Provisional, which is what ADR-EE-R3-1 was protecting. */
export function isVerdictProvisional(
  verdict: Pick<EvaluationResult, 'confidence_caveats'> & {
    provisional_reasons?: readonly ProvisionalReason[];
  },
): boolean {
  if (verdict.provisional_reasons !== undefined) return verdict.provisional_reasons.length > 0;
  return verdict.confidence_caveats.some((c) => c.confidence === 'low');
}
