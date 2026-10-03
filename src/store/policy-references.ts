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

// CR7-26. {audience} and {destination} are filled in only plain_reason and
// plain_change (verified: src/components/verdict-view-model.ts:257, :700,
// :715, :792). `filled` says whether the field is one of those; in every
// other plain-language field any {placeholder} prints literally, so the
// message must not call even a known one "recognised" there.
function placeholderWarnings(context: string, text: string | undefined, filled = false): string[] {
  if (!text) return [];
  const warnings: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    const name = m[1] ?? '';
    if (!filled) {
      warnings.push(
        `${context}: "{${name}}" will render literally — placeholders are filled in only plain_reason and plain_change, not in this field`,
      );
    } else if (!KNOWN_PLACEHOLDERS.has(name)) {
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

// W-7 (R16-W §5, D-77): referential, like covers_reviews — an applies_to id
// that doesn't resolve against the policy's OWN platform/vendor registries
// is always checkable here (unlike covers_reviews, which may name a pack
// rule id that only exists once packs are loaded), so this is always an
// error, never a warning.
// A-5: platforms[].vendor_id is never checked. Referential, like
// appliesToErrors below — always checkable (platforms/vendors are part of
// THIS policy file, never a pack) — so this is always an error, never
// gated on packs being loaded.
function platformVendorIdErrors(policy: PolicyFile): string[] {
  const validVendorIds = new Set((policy.vendors ?? []).map((v) => v.id));
  return sortedById(policy.platforms ?? [])
    .filter((p) => p.vendor_id !== undefined && !validVendorIds.has(p.vendor_id))
    .map((p) => `platform ${p.id}: vendor_id '${p.vendor_id}' is not a registered vendor id.`);
}

// CR7-27. Three id references the loader never resolved. Error level, knowing
// the effect: checkPolicyReferences is a hard gate, so a saved policy with a
// dangling reference stops evaluating until it is fixed — every message names
// the bad reference.
function controlResolvesErrors(policy: PolicyFile): string[] {
  const validTargets = new Set([...policy.invariants.map((i) => i.id), ...policy.hard_lines.map((h) => h.id)]);
  return sortedById(policy.controls).flatMap((c) =>
    (c.resolves ?? [])
      .filter((id) => !validTargets.has(id))
      .map((id) => `${c.id} resolves: no invariant or hard line with id '${id}'.`),
  );
}

function registryControlReferenceErrors(kind: 'platform' | 'vendor', entries: RegistryEntry[] | undefined, validControlIds: Set<string>): string[] {
  return sortedById(entries ?? []).flatMap((e) => [
    ...(e.satisfies_controls ?? [])
      .filter((id) => !validControlIds.has(id))
      .map((id) => `${kind} ${e.id} satisfies_controls: no control with id '${id}'.`),
    ...(e.coupled_clusters ?? [])
      .flat()
      .filter((id) => !validControlIds.has(id))
      .map((id) => `${kind} ${e.id} coupled_clusters: no control with id '${id}'.`),
  ]);
}

function packRequiredControlErrors(packs: JurisdictionPack[], validControlIds: Set<string>): string[] {
  const out: string[] = [];
  for (const pack of [...packs].sort((a, b) => a.pack_id.localeCompare(b.pack_id))) {
    for (const rule of sortedById(pack.rules)) {
      if (rule.effect.type === 'required_control' && !validControlIds.has(rule.effect.control_id)) {
        out.push(`${pack.pack_id}:${rule.id} required_control: no control with id '${rule.effect.control_id}'.`);
      }
    }
  }
  return out;
}

// C-5: a rule id is unique WITHIN one pack's own rules, never guaranteed
// unique ACROSS every pack a firm loads together — two different packs can
// reuse the same id by coincidence (no cross-pack authoring coordination).
// That let two downstream_review_sources entries sharing a rule_id reach a
// verdict (fixed in evaluate.ts's combineReviewSources); this warns the
// reviewer at load time instead of leaving it to be noticed there.
function duplicatePackRuleIdWarnings(packs: JurisdictionPack[]): string[] {
  const packIdsByRuleId = new Map<string, string[]>();
  for (const pack of [...packs].sort((a, b) => a.pack_id.localeCompare(b.pack_id))) {
    for (const rule of sortedById(pack.rules)) {
      const packIds = packIdsByRuleId.get(rule.id) ?? [];
      packIds.push(pack.pack_id);
      packIdsByRuleId.set(rule.id, packIds);
    }
  }
  return [...packIdsByRuleId.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, packIds]) => packIds.length > 1)
    .map(
      ([ruleId, packIds]) =>
        `rule id '${ruleId}' is used by more than one loaded pack (${packIds.join(', ')}) — each pack rule's id should be unique across every pack a firm loads together.`,
    );
}

// C-5 (TC-CR6-C5d): the same collision between a FIRM downstream-review id
// and a loaded pack rule id — both surface as `rule_id` on a verdict.
function firmPackRuleIdWarnings(policy: PolicyFile, packs: JurisdictionPack[]): string[] {
  const firmIds = new Set((policy.downstream_reviews ?? []).map((r) => r.id));
  const out: string[] = [];
  for (const pack of [...packs].sort((a, b) => a.pack_id.localeCompare(b.pack_id))) {
    for (const rule of sortedById(pack.rules)) {
      if (firmIds.has(rule.id)) {
        out.push(
          `rule id '${rule.id}' is used by a firm downstream review and by pack ${pack.pack_id} — each rule's id should be unique across the firm policy and every pack loaded with it.`,
        );
      }
    }
  }
  return out;
}

function appliesToErrors(
  controlId: string,
  appliesTo: { platforms?: string[]; vendors?: string[] } | undefined,
  policy: PolicyFile,
): string[] {
  if (!appliesTo) return [];
  const validPlatformIds = new Set((policy.platforms ?? []).map((p) => p.id));
  const validVendorIds = new Set((policy.vendors ?? []).map((v) => v.id));
  return [
    ...(appliesTo.platforms ?? [])
      .filter((id) => !validPlatformIds.has(id))
      .map((id) => `${controlId} verification_evidence.applies_to: no platform with id '${id}'.`),
    ...(appliesTo.vendors ?? [])
      .filter((id) => !validVendorIds.has(id))
      .map((id) => `${controlId} verification_evidence.applies_to: no vendor with id '${id}'.`),
  ];
}

// R16-F §6 (DR7-14). A review's plain_name must be a noun phrase
// (grounding/PACK-AUTHORING.md's R16-W §5 checklist line) — the exact
// mistake W-6 found and fixed by hand: "the supplier is assessed" breaks
// "Doing this also completes {list} — one piece of work." grammatically,
// the way "Doing this also completes the supplier is assessed" reads.
// Grammar is not a condition a loader can prove right, so this is a
// best-effort WARNING, never an error — it catches the SHAPE of the
// mistake (an article followed by a finite verb two words later), not
// every ungrammatical name.
const CLAUSE_LIKE_RE = /^(the|a|an)\s+[\w-]+\s+(is|are|was|were|has|have)\b/i;

function clauseLikePlainNameWarning(context: string, plainName: string | undefined): string[] {
  if (!plainName || !CLAUSE_LIKE_RE.test(plainName)) return [];
  return [
    `${context}: "${plainName}" reads as a clause, not a noun phrase — it is rendered inside "Doing this also completes {list}", which needs a noun phrase (grounding/PACK-AUTHORING.md)`,
  ];
}

function registryPlainNameWarnings(kind: 'platform' | 'vendor', entries: RegistryEntry[] | undefined): string[] {
  return sortedById(entries ?? [])
    .filter((e) => !e.plain_name)
    .map(
      (e) =>
        `${kind} ${e.id}: no plain_name set — shown as a neutral label on the form ("Your firm's AI service"/"Supplier" + a number) until one is added`,
    );
}

// CR7-35a: a listed model with no plain_name is shown as "Model n", never its id.
function modelPlainNameWarnings(models: PolicyFile['approved_models']): string[] {
  return (models ?? [])
    .filter((m) => !m.is_family && !m.plain_name?.trim())
    .map((m) => `approved_models ${m.model_id}: no plain_name set — shown as a neutral label ("Model" + a number) on the form until one is added`);
}

function invariantWarnings(inv: Invariant): string[] {
  return [
    ...placeholderWarnings(`${inv.id} plain_reason`, inv.plain_reason, true),
  ];
}

function hardLineWarnings(hl: HardLine): string[] {
  return [
    ...placeholderWarnings(`${hl.id} plain_reason`, hl.plain_reason, true),
    ...placeholderWarnings(`${hl.id} plain_change`, hl.plain_change, true),
  ];
}

function downstreamReviewRuleWarnings(dr: DownstreamReviewRule): string[] {
  return [
    ...placeholderWarnings(`${dr.id} plain_name`, dr.plain_name),
    ...placeholderWarnings(`${dr.id} plain_owner`, dr.plain_owner),
    ...ownerTokenWarnings(`${dr.id} plain_owner`, dr.plain_owner),
    ...clauseLikePlainNameWarning(`${dr.id} plain_name`, dr.plain_name),
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

  errors.push(...platformVendorIdErrors(policy));
  const validControlIds = new Set(policy.controls.map((c) => c.id));
  errors.push(...controlResolvesErrors(policy));
  errors.push(...registryControlReferenceErrors('platform', policy.platforms, validControlIds));
  errors.push(...registryControlReferenceErrors('vendor', policy.vendors, validControlIds));
  // Pack rules are only walked when packs are loaded, like covers_reviews.
  errors.push(...packRequiredControlErrors(packs, validControlIds));
  warnings.push(...duplicatePackRuleIdWarnings(packs));
  warnings.push(...firmPackRuleIdWarnings(policy, packs));

  for (const control of sortedById(policy.controls)) {
    errors.push(...appliesToErrors(control.id, control.verification_evidence?.applies_to, policy));
    const unresolved = coversReviewsErrors(control.id, control.covers_reviews, validCoversReviewsTargets);
    if (packs.length > 0) {
      errors.push(...unresolved);
    } else {
      // No packs loaded at all: an id that is not a firm review or an engine
      // sentinel may name a pack rule, and absence of evidence is not evidence
      // of a typo — "can't check" is the honest state, not "invalid". With
      // packs loaded (every production load site), an id matching nothing is
      // a verified error. A covers entry that matches nothing can only fail
      // to fold a review, never hide one, so this cannot hide an obligation.
      warnings.push(
        ...unresolved.map((e) => `${e.replace(/\.$/, '')} among the firm's own reviews — no rule packs are loaded, so it could not be checked against them.`),
      );
    }
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
  warnings.push(...modelPlainNameWarnings(policy.approved_models));

  for (const pack of [...packs].sort((a, b) => a.pack_id.localeCompare(b.pack_id))) {
    for (const rule of sortedById(pack.rules)) {
      const ruleId = `${pack.pack_id}:${rule.id}`;
      errors.push(...conditionOperatorErrors(ruleId, rule.condition));
      if (rule.effect.type === 'required_review') {
        warnings.push(...placeholderWarnings(`${rule.id} plain_name`, rule.effect.plain_name));
        warnings.push(...placeholderWarnings(`${rule.id} plain_owner`, rule.effect.plain_owner));
        warnings.push(...ownerTokenWarnings(`${rule.id} plain_owner`, rule.effect.plain_owner));
        warnings.push(...clauseLikePlainNameWarning(`${rule.id} plain_name`, rule.effect.plain_name));
      }
      // R16-D2 §2 (DR7-20). Exactly the same two placeholder checks
      // hardLineWarnings runs for a firm hard line's plain_reason/
      // plain_change — a pack hard line's fields use the identical
      // {audience}/{destination} vocabulary.
      if (rule.effect.type === 'hard_line') {
        warnings.push(...placeholderWarnings(`${rule.id} plain_reason`, rule.effect.plain_reason, true));
        warnings.push(...placeholderWarnings(`${rule.id} plain_change`, rule.effect.plain_change, true));
      }
    }
  }

  return { errors, warnings };
}
