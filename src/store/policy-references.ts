import { LIST_VALUED_FIELDS, isInOnlyCondition } from './policy';
import type { Condition, ConditionValue, DownstreamReviewRule, HardLine, Invariant, JurisdictionPack, PolicyFile, RegistryEntry } from '../engine/types';

// R16-A1 (§1.4, D-05, D-23, D-39, D-51, D-60). Rule 3 (cross-cutting.md §7):
// store-side, no I/O — a pure function of an already-loaded PolicyFile and
// the packs loaded alongside it.
//
// This is deliberately NOT a re-run of what loadPolicy()/loadPacks() already
// check at parse time (shape, operator legality, canonical vocabulary — see
// src/store/policy.ts). Those checks are per-file and happen before a
// PolicyFile object exists to reference. This check is REFERENTIAL: it only
// makes sense once the whole policy and the packs loaded beside it both
// exist, because a covers_reviews id has to resolve against the UNION of
// the firm's own reviews and every loaded pack's review rules. It is called
// at every site that loads policy and packs together or evaluates — see the
// call sites listed in grounding/PACK-AUTHORING.md's reviewer checklist.
//
// The check is referential only: a covers_reviews id that resolves to a
// REAL review is not itself proof that the control's action actually
// satisfies that review — that is a rule-review judgement a human makes
// (grounding/PACK-AUTHORING.md), not something this function can verify.
export interface PolicyReferenceCheckResult {
  errors: string[];
  warnings: string[];
}

// The two sentinel review-source producers (evaluate.ts) that a firm author
// cannot name a specific instance of in advance — see DownstreamReviewSource
// in src/engine/types.ts for why the BASE id (no ":<detail>" suffix) is what
// a covers_reviews entry writes.
const REVIEW_SENTINELS = ['PV-UNREGISTERED', 'MODEL-REGISTRY'];

// {audience} and {destination} (CF-6 §1.2) are the only placeholders a
// plain-language field may use; the view-model (chunk D1) resolves them.
const KNOWN_PLACEHOLDERS = new Set(['audience', 'destination']);
const PLACEHOLDER_RE = /\{([^}]*)\}/g;

// @submitter and @model_owner (CF-6 §1.2) are the only owner tokens a
// plain_owner field may use; the view-model (chunk D1) resolves them.
const KNOWN_OWNER_TOKENS = new Set(['@submitter', '@model_owner']);
const OWNER_TOKEN_RE = /@[A-Za-z_]+/g;

function sortedById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

function placeholderWarnings(context: string, text: string | undefined): string[] {
  if (!text) return [];
  const warnings: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    const name = m[1] ?? '';
    if (!KNOWN_PLACEHOLDERS.has(name)) {
      warnings.push(
        `${context}: unknown placeholder "{${name}}" — only {audience} and {destination} are recognised and will render literally`,
      );
    }
  }
  return warnings;
}

function ownerTokenWarnings(context: string, text: string | undefined): string[] {
  if (!text) return [];
  const warnings: string[] = [];
  for (const m of text.matchAll(OWNER_TOKEN_RE)) {
    const token = m[0];
    if (!KNOWN_OWNER_TOKENS.has(token)) {
      warnings.push(
        `${context}: unknown owner token "${token}" — only @submitter and @model_owner are recognised and will render literally`,
      );
    }
  }
  return warnings;
}

// R16-A1 (§1.1, §1.4): defense-in-depth re-check of the "list-valued fields
// support only the in operator" rule, reusing policy.ts's own field set and
// predicate — so this function is correct standing alone, not merely
// correct because loadPolicy()/loadPacks() already filtered out every
// violation before a PolicyFile could exist. It additionally covers
// policy.downstream_reviews[] conditions, which loadPolicy()'s own
// runSemanticChecks does not walk (a separate, pre-existing gap outside
// this chunk's scope).
function conditionOperatorErrors(ruleId: string, condition: Condition): string[] {
  return Object.entries(condition).flatMap(([field, value]) => conditionOperatorErrorsForFieldValue(ruleId, field, value));
}

function conditionOperatorErrorsForFieldValue(ruleId: string, field: string, value: ConditionValue): string[] {
  if (!LIST_VALUED_FIELDS.has(field) || isInOnlyCondition(value)) return [];
  return [`${ruleId} condition "${field}": list-valued fields support only the "in" operator.`];
}

function coversReviewsErrors(controlId: string, coversReviews: string[] | undefined, validTargets: Set<string>): string[] {
  if (!coversReviews) return [];
  return coversReviews
    .filter((id) => !validTargets.has(id))
    .map((id) => `${controlId} covers_reviews: no review with id '${id}'.`);
}

function registryPlainNameWarnings(kind: 'platform' | 'vendor', entries: RegistryEntry[] | undefined): string[] {
  return sortedById(entries ?? [])
    .filter((e) => !e.plain_name)
    .map(
      (e) =>
        `${kind} ${e.id}: no plain_name set — shown as a neutral label on the form ("Your firm's AI service"/"Supplier" + a number) until one is added`,
    );
}

function invariantWarnings(inv: Invariant): string[] {
  return [
    ...placeholderWarnings(`${inv.id} plain_reason`, inv.plain_reason),
  ];
}

function hardLineWarnings(hl: HardLine): string[] {
  return [
    ...placeholderWarnings(`${hl.id} plain_reason`, hl.plain_reason),
    ...placeholderWarnings(`${hl.id} plain_change`, hl.plain_change),
  ];
}

function downstreamReviewRuleWarnings(dr: DownstreamReviewRule): string[] {
  return [
    ...placeholderWarnings(`${dr.id} plain_name`, dr.plain_name),
    ...placeholderWarnings(`${dr.id} plain_owner`, dr.plain_owner),
    ...ownerTokenWarnings(`${dr.id} plain_owner`, dr.plain_owner),
  ];
}

export function checkPolicyReferences(policy: PolicyFile, packs: JurisdictionPack[] = []): PolicyReferenceCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const firmReviewIds = (policy.downstream_reviews ?? []).map((r) => r.id);
  const packReviewRuleIds = packs.flatMap((p) =>
    p.rules.filter((r) => r.effect.type === 'required_review').map((r) => r.id),
  );
  const validCoversReviewsTargets = new Set([...firmReviewIds, ...packReviewRuleIds, ...REVIEW_SENTINELS]);

  for (const control of sortedById(policy.controls)) {
    errors.push(...coversReviewsErrors(control.id, control.covers_reviews, validCoversReviewsTargets));
    warnings.push(...placeholderWarnings(`${control.id} plain_action`, control.plain_action));
    warnings.push(...placeholderWarnings(`${control.id} plain_owner`, control.plain_owner));
    warnings.push(...ownerTokenWarnings(`${control.id} plain_owner`, control.plain_owner));
    warnings.push(...placeholderWarnings(`${control.id} plain_owner_with`, control.plain_owner_with));
  }

  for (const inv of sortedById(policy.invariants)) {
    errors.push(...conditionOperatorErrors(inv.id, inv.condition));
    warnings.push(...invariantWarnings(inv));
  }

  for (const hl of sortedById(policy.hard_lines)) {
    errors.push(...conditionOperatorErrors(hl.id, hl.condition));
    warnings.push(...hardLineWarnings(hl));
  }

  for (const dr of sortedById(policy.downstream_reviews ?? [])) {
    errors.push(...conditionOperatorErrors(dr.id, dr.condition));
    warnings.push(...downstreamReviewRuleWarnings(dr));
  }

  for (const t of sortedById(policy.tracks)) {
    for (const c of t.conditions) errors.push(...conditionOperatorErrorsForFieldValue(t.id, c.field, c.value));
  }

  for (const t of sortedById(policy.tiers)) {
    for (const trig of t.triggers) errors.push(...conditionOperatorErrorsForFieldValue(t.id, trig.field, trig.value));
  }

  warnings.push(...registryPlainNameWarnings('platform', policy.platforms));
  warnings.push(...registryPlainNameWarnings('vendor', policy.vendors));

  for (const pack of [...packs].sort((a, b) => a.pack_id.localeCompare(b.pack_id))) {
    for (const rule of sortedById(pack.rules)) {
      const ruleId = `${pack.pack_id}:${rule.id}`;
      errors.push(...conditionOperatorErrors(ruleId, rule.condition));
      if (rule.effect.type === 'required_review') {
        warnings.push(...placeholderWarnings(`${rule.id} plain_name`, rule.effect.plain_name));
        warnings.push(...placeholderWarnings(`${rule.id} plain_owner`, rule.effect.plain_owner));
        warnings.push(...ownerTokenWarnings(`${rule.id} plain_owner`, rule.effect.plain_owner));
      }
    }
  }

  return { errors, warnings };
}
