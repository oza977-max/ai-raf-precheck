import type { PolicyFile } from './types';

// Shared between VerdictDisplay.tsx (fallback summary, P5-C01) and
// reasoning-trace.ts (LLM prompt grounding, P5-C02) — a rule/invariant's
// human-written description, looked up by id. Pure data lookup, not
// business logic (rule 4, cross-cutting.md §7 — presentation-only, but
// this lives in src/engine/* since it operates on PolicyFile shapes).
export function findRuleDescription(policy: PolicyFile | undefined, ruleId: string): string | null {
  if (!policy || !ruleId) return null;
  const hardLine = policy.hard_lines.find((h) => h.id === ruleId);
  if (hardLine) return hardLine.description;
  const invariant = policy.invariants.find((i) => i.id === ruleId);
  if (invariant) return invariant.description;
  return null;
}
