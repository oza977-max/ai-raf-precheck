// Rule 3 (cross-cutting.md §7): persistence-only, no React, no engine logic.
// Same shape as policy-source.ts — centralizes "what risk-knowledge YAML is
// currently active" so every caller (IntakeFlow, RegisterDetail) reads from
// one place. R11-KL-1: deliberately a separate source from policy-source.ts
// — the knowledge lens is not a pack and is not editable through
// PolicyEditor.
import riskKnowledgeYaml from '../../grounding/risk-knowledge.yaml?raw';

export function getCurrentKnowledgeLensYaml(): string {
  return riskKnowledgeYaml;
}
