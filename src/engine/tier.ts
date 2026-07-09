import { matchesCondition } from './condition';
import type { DataFlowGraph, Tier, TierRule } from './types';

export interface TierAssignment {
  tier: Tier;
  triggeringRuleId: string;
  triggeringField: string;
  triggeringValue: unknown;
}

const TIER_ORDER: Record<Tier, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

// Impact-dominant, order-independent (evaluation-engine.md §3.5): every rule
// is evaluated, the highest tier whose trigger fires wins. Never short-circuit.
export function assignTier(graph: DataFlowGraph, tierRules: TierRule[]): TierAssignment {
  let best: TierAssignment | undefined;

  for (const rule of tierRules) {
    // Defense in depth: src/store/policy.ts's loadPolicy() rejects any
    // TierRule whose name isn't a canonical Tier before it ever reaches
    // here (fail-loud at load time). If an unvalidated policy somehow
    // reaches evaluate() anyway, skip the rule rather than silently
    // corrupting the TIER_ORDER comparison below.
    if (!(rule.name in TIER_ORDER)) continue;
    const tier = rule.name as Tier;
    for (const trigger of rule.triggers) {
      const matched = matchesCondition({ [trigger.field]: trigger.value }, graph);
      if (matched && (!best || TIER_ORDER[tier] > TIER_ORDER[best.tier])) {
        best = {
          tier,
          triggeringRuleId: rule.id,
          triggeringField: trigger.field,
          triggeringValue: trigger.value,
        };
      }
    }
  }

  return best ?? { tier: 'Low', triggeringRuleId: 'TIER-LOW-DEFAULT', triggeringField: '', triggeringValue: null };
}
