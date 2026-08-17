import { load } from 'js-yaml';
import { parseKnowledgeLens } from '../engine/knowledge-lens';
import type { KnowledgeLensParseResult } from '../engine/knowledge-lens';

// Rule 3 (cross-cutting.md §7): persistence-only — no React, no evaluation
// logic. The YAML/file I/O for the risk-knowledge lens lives here rather
// than in src/engine/knowledge-lens.ts, which stays a pure island
// (parseKnowledgeLens there validates already-parsed JS values only).
export function loadKnowledgeLens(yaml: string): KnowledgeLensParseResult {
  let parsed: unknown;
  try {
    parsed = load(yaml);
  } catch (err) {
    return { valid: false, errors: [err instanceof Error ? err.message : String(err)] };
  }
  return parseKnowledgeLens(parsed);
}
