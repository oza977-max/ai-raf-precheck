import type { PolicyFile } from './types';

// Shared between VerdictDisplay.tsx (fallback summary, P5-C01) and
// reasoning-trace.ts (LLM prompt grounding, P5-C02) — a rule/invariant's
// human-written description, looked up by id. Pure data lookup, not
// business logic (rule 4, cross-cutting.md §7 — presentation-only, but
// this lives in src/engine/* since it operates on PolicyFile shapes).
/** A control's human name, looked up by id — "Output fingerprinting + version
 *  pinning" for CTRL-FINGERPRINT-01.
 *
 *  User report (2026-08-15): "a business user won't understand most of it.
 *  Things like CTRL-FINGERPRINT-01". The names already existed in the policy
 *  and the verdict rendered them in exactly one panel; every other place that
 *  mentioned a control showed the bare id. This exists so no consumer has to
 *  reach into `policy.controls` itself and quietly forget to. */
export function findControlName(policy: PolicyFile | undefined, controlId: string): string | null {
  if (!policy || !controlId) return null;
  return policy.controls.find((c) => c.id === controlId)?.name ?? null;
}

export function findRuleDescription(policy: PolicyFile | undefined, ruleId: string): string | null {
  if (!policy || !ruleId) return null;
  const hardLine = policy.hard_lines.find((h) => h.id === ruleId);
  if (hardLine) return hardLine.description;
  const invariant = policy.invariants.find((i) => i.id === ruleId);
  if (invariant) return invariant.description;
  return null;
}
