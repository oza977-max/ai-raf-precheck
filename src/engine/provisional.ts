// Provisional determination (evaluation-engine.md §13, ADR-EE-R3-1).
// Rule 1 (cross-cutting.md §7): engine island — engine types and stdlib only.
//
// Before round 3, "Provisional" was derived independently by two consumers
// from the same expression: `VerdictDisplay.tsx:161` (`lowCaveats.length > 0`)
// and `store/register.ts:55` (`confidence_caveats.some(c => c.confidence ===
// 'low')`) — both verified at commit 90c5d3c, the state this chunk replaced.
// One rule, two layers, no shared definition, and round 3 adds a second cause.
// The determination now lives here and both consumers read it.
import type { ConfidenceCaveat, EvaluationResult } from './types';

/** Declaration order IS the emission order (§13.2, NF-1) — never discovery
 *  order, so two runs over identical inputs produce identical collections. */
export const PROVISIONAL_REASONS = ['unsigned_pack_rules', 'no_regulatory_basis'] as const;

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
): ProvisionalReason[] {
  const raised = new Set<ProvisionalReason>();

  // NF-7: a fired unsigned pack rule emits its caveat at low confidence. The
  // caveat says WHICH rule is unadopted and keeps its own RA-11 rendering;
  // this says why the verdict AS A WHOLE is provisional (§13.1a).
  if (caveats.some((c) => c.confidence === 'low')) raised.add('unsigned_pack_rules');

  // No pack activated at all — not "no rule fired". A pack that activates and
  // matches nothing still supplies a regulatory basis that was checked.
  if (Object.keys(packVersions).length === 0) raised.add('no_regulatory_basis');

  return PROVISIONAL_REASONS.filter((r) => raised.has(r));
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
