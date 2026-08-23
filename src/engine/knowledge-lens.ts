// R11-KL (requirements-011.md), policy-schema.md §10b, evaluation-engine.md
// §14 (ADR-EE-R11-1/2). The knowledge lens: a curated, honest, ADVISORY-ONLY
// mapping from graph shapes to external risk-taxonomy domains (MIT AI Risk
// Repository). It is a second, independent function — never called from
// inside evaluate() (see src/engine/evaluate.ts, which does not import this
// module). That is what makes R11-NF-1 ("evaluate()'s decision output is
// byte-identical with and without the knowledge lens loaded") true by
// construction: this module cannot reach evaluate()'s inputs or outputs
// because it never receives them.
//
// Rule 1 (cross-cutting.md §7): pure island. This file imports only engine
// types, the existing condition evaluator, and zod — a pure validation
// library with no I/O, the same discipline src/store/policy.ts already
// applies to schema validation (that file is store-layer only because it
// also does file/YAML I/O; the schema-and-match logic here has none).
import { z } from 'zod';
import type { Condition, DataFlowGraph } from './types';
import { matchesCondition } from './condition';

// policy-schema.md §10b: deliberately NOT part of PolicyFile, deliberately
// not called a "pack" — its own type, own schema, own file, so the
// "knowledge never decides" boundary is structural, not a naming
// convention someone could quietly erode. No field here can express a
// tier, control, hard line, or verdict effect.
export interface KnowledgeLensEntry {
  id: string;
  /** src/engine/types.ts Condition — the SAME condition language hard
   *  lines/invariants use (ADR-002), reused via matchesCondition, not
   *  reinvented. */
  condition: Condition;
  risk_domain: string; // MIT taxonomy domain
  risk_subdomain: string;
  description: string; // one line, plain English
  source_attribution: string; // e.g. "MIT AI Risk Repository, CC BY 4.0"
  /** Static, hand-curated list of policy rule ids (hard line / invariant /
   *  pack rule ids) that genuinely overlap this risk domain today. Empty
   *  array is a valid, honest answer — "nothing in the current policy
   *  covers this" is the gap this lens exists to surface, not something to
   *  paper over with a false match. */
  covering_rule_ids: string[];
}

export interface KnowledgeMatch {
  entry: KnowledgeLensEntry;
  /** True when this entry's covering_rule_ids intersects the rule ids that
   *  actually fired for the verdict being viewed (supplied by the caller —
   *  never recomputed against the graph or policy here). */
  covered: boolean;
}

// zod: .strict() is the structural guarantee from policy-schema.md §10b —
// an unrecognised key (e.g. a smuggled `effect`, `tier`, or `control`
// field) fails validation rather than silently passing through.
const ConditionValueSchema: z.ZodType<unknown> = z.union([
  z.object({ gte: z.number() }).strict(),
  z.object({ lte: z.number() }).strict(),
  z.object({ in: z.array(z.unknown()) }).strict(),
  z.object({ not_in: z.array(z.unknown()) }).strict(),
  z.string(),
  z.number(),
  z.boolean(),
]);

const KnowledgeLensEntrySchema = z
  .object({
    id: z.string().min(1),
    condition: z.record(z.string(), ConditionValueSchema),
    risk_domain: z.string().min(1),
    risk_subdomain: z.string().min(1),
    description: z.string().min(1),
    source_attribution: z.string().min(1),
    covering_rule_ids: z.array(z.string()),
  })
  .strict();

// R12-ST-3 (ADR-PS-R12-1): the file's own staleness/provenance header —
// "who curated this snapshot, against what taxonomy version, and how
// stale is too stale." .strict() so a smuggled/unknown meta key rejects
// the whole file rather than passing through silently, the same
// discipline KnowledgeLensEntrySchema already applies to entries.
export interface KnowledgeLensMeta {
  curated_by: string;
  curated_date: string;
  taxonomy_version_reviewed: string;
  review_owner: string;
  max_staleness_days: number;
}

const KnowledgeLensMetaSchema = z
  .object({
    curated_by: z.string().min(1),
    curated_date: z.string().min(1),
    taxonomy_version_reviewed: z.string().min(1),
    review_owner: z.string().min(1),
    max_staleness_days: z.number(),
  })
  .strict();

export type KnowledgeLensParseResult =
  | { valid: true; entries: KnowledgeLensEntry[]; meta?: KnowledgeLensMeta }
  | { valid: false; errors: string[] };

/** Pure parse/validate over an already-parsed JS value (the result of
 *  `js-yaml`'s `load()` on grounding/risk-knowledge.yaml). YAML/file I/O
 *  deliberately lives outside this module (src/store/knowledge-lens-loader.ts),
 *  keeping this file free of any I/O per Rule 1.
 *
 *  Two accepted shapes, both valid:
 *    - `{ meta: {...}, entries: [...] }` — the R12-ST-3 shape, meta parsed
 *      and returned.
 *    - a bare array of entries — the pre-R12 shape, for backward
 *      compatibility; `meta` is simply absent on the result. */
export function parseKnowledgeLens(raw: unknown): KnowledgeLensParseResult {
  let entriesRaw: unknown;
  let metaRaw: unknown;

  if (Array.isArray(raw)) {
    entriesRaw = raw;
  } else if (raw !== null && typeof raw === 'object' && 'entries' in raw) {
    entriesRaw = (raw as Record<string, unknown>).entries;
    metaRaw = (raw as Record<string, unknown>).meta;
  } else {
    return { valid: false, errors: ['risk-knowledge file must be an array of entries, or an object with an "entries" array'] };
  }

  if (!Array.isArray(entriesRaw)) {
    return { valid: false, errors: ['risk-knowledge "entries" must be an array'] };
  }

  const entries: KnowledgeLensEntry[] = [];
  const errors: string[] = [];
  entriesRaw.forEach((item, i) => {
    const result = KnowledgeLensEntrySchema.safeParse(item);
    if (!result.success) {
      const idHint = typeof (item as Record<string, unknown>)?.id === 'string' ? (item as { id: string }).id : `[${i}]`;
      for (const issue of result.error.issues) {
        errors.push(`entry ${idHint}: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
      }
    } else {
      entries.push(result.data as KnowledgeLensEntry);
    }
  });

  let meta: KnowledgeLensMeta | undefined;
  if (metaRaw !== undefined) {
    const metaResult = KnowledgeLensMetaSchema.safeParse(metaRaw);
    if (!metaResult.success) {
      for (const issue of metaResult.error.issues) {
        errors.push(`meta: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
      }
    } else {
      meta = metaResult.data;
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  // NF-1 discipline: sorted by id before returning, same as every other
  // engine/policy collection (evaluate.ts's sortedById()).
  return {
    valid: true,
    entries: [...entries].sort((a, b) => a.id.localeCompare(b.id)),
    ...(meta ? { meta } : {}),
  };
}

/** ADR-EE-R11-1: pure function, never called from evaluate.ts. Matches each
 *  curated entry's condition against the graph using the existing
 *  matchesCondition evaluator (no second condition language), and computes
 *  `covered` from the caller-supplied policyRuleIds — the rule ids that
 *  actually fired for the verdict being displayed alongside this lens, not
 *  recomputed here. */
export function matchKnowledgeLens(
  graph: DataFlowGraph,
  entries: KnowledgeLensEntry[],
  policyRuleIds: string[],
): KnowledgeMatch[] {
  const ruleSet = new Set(policyRuleIds);
  const matches = entries
    .filter((entry) => matchesCondition(entry.condition, graph))
    .map((entry) => ({
      entry,
      covered: entry.covering_rule_ids.some((id) => ruleSet.has(id)),
    }));
  // NF-1 discipline: sorted by entry id.
  return matches.sort((a, b) => a.entry.id.localeCompare(b.entry.id));
}
