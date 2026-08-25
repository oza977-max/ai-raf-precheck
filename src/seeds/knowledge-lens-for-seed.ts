import { matchKnowledgeLens } from '../engine/knowledge-lens';
import { loadKnowledgeLens } from '../store/knowledge-lens-loader';
import { getCurrentKnowledgeLensYaml } from '../store/knowledge-lens-source';
import type { DataFlowGraph } from '../engine/types';
import type { Verdict } from '../types/verdict';

// Bug found 2026-08-25: seeded verdicts (this file's callers) never carried
// knowledge_lens_matched_entry_ids on their verdict_produced event, because
// only the live intake flow (IntakeFlow.tsx) computed it — R13-UI-4 reads
// that field's absence as "decided before the lens existed" (a real, older
// case), so every seeded demo case rendered as if it predated R13, and a
// fresh visitor's register never showed the risk-knowledge lens at all.
// Mirrors IntakeFlow.tsx's computation exactly (same rule-id extraction,
// same matchKnowledgeLens call) so a seeded verdict is indistinguishable
// from one a live submission would have produced.
export function knowledgeLensMatchedEntryIdsFor(graph: DataFlowGraph, verdict: Verdict): string[] {
  const ruleIds = new Set<string>();
  const ex = verdict.explanation;
  if (ex) {
    if (ex.tier_rationale?.rule_id) ruleIds.add(ex.tier_rationale.rule_id);
    if (ex.track_rationale?.rule_id) ruleIds.add(ex.track_rationale.rule_id);
    for (const t of ex.tripped_invariants) ruleIds.add(t.id);
    for (const r of ex.regulatory_chain ?? []) ruleIds.add(r.rule_id);
  }
  if (verdict.binding_constraint) ruleIds.add(verdict.binding_constraint);

  const lensResult = loadKnowledgeLens(getCurrentKnowledgeLensYaml());
  const entries = lensResult.valid ? lensResult.entries : [];
  return matchKnowledgeLens(graph, entries, [...ruleIds]).map((m) => m.entry.id);
}
