import { matchesCondition } from './condition';
import type { DataFlowGraph, EngineError, Result, Track, TrackRule } from './types';

export interface TrackAssignment {
  track: Track;
  ruleId: string;
  ruleName: string;
}

// First-match short-circuit (evaluation-engine.md §3.4). Rules are evaluated
// in array order; within one rule all `conditions` entries are ANDed.
export function assignTrack(graph: DataFlowGraph, trackRules: TrackRule[]): Result<TrackAssignment, EngineError> {
  for (const rule of trackRules) {
    const condition = Object.fromEntries(rule.conditions.map((c) => [c.field, c.value]));
    if (matchesCondition(condition, graph)) {
      const trackMatch = /^TRACK-(III|II|I)/.exec(rule.id);
      const track = (trackMatch?.[1] ?? 'I') as Track;
      return { ok: true, value: { track, ruleId: rule.id, ruleName: rule.name } };
    }
  }
  return {
    ok: false,
    error: { kind: 'no-track-match', reason: 'no track rule matched this graph' },
  };
}
