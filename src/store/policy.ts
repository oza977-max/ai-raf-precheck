import { load } from 'js-yaml';
import { z } from 'zod';
import type {
  ActionType,
  Control,
  DataClass,
  DataZone,
  DecisionBindingness,
  DecisionType,
  HardLine,
  Invariant,
  ModelType,
  PolicyFile,
  PolicyValidationError,
  PolicyValidationResult,
  Tier,
  TierRule,
  TrackRule,
  Exposure,
} from '../engine/types';

// Rule 3 (cross-cutting.md §7): persistence-only — no React, no LLM imports.
// Real YAML + Zod validation loader (policy-schema.md §3-6), replacing the
// P1-C01 hardcoded stub.

// --- Zod schema: single source of truth for both runtime validation and the
// TypeScript type (Vanderkam — Effective TypeScript). Mirrors the PolicyFile
// interface in src/engine/types.ts.

const ConditionValueSchema: z.ZodType<unknown> = z.union([
  z.object({ gte: z.number() }).strict(),
  z.object({ lte: z.number() }).strict(),
  z.object({ in: z.array(z.unknown()) }).strict(),
  z.object({ not_in: z.array(z.unknown()) }).strict(),
  z.string(),
  z.number(),
  z.boolean(),
]);

const ConditionRecordSchema = z.record(z.string(), z.unknown());

const HardLineSchema = z.object({
  id: z.string(),
  description: z.string(),
  condition: ConditionRecordSchema,
  reason: z.string(),
  regulatory_basis: z.string(),
});

const TrackConditionSchema = z.object({
  field: z.string(),
  value: ConditionValueSchema,
});

const TrackRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  conditions: z.array(TrackConditionSchema),
  short_circuit: z.boolean(),
  regulatory_basis: z.string(),
});

const TierTriggerSchema = z.object({
  field: z.string(),
  value: ConditionValueSchema,
  regulatory_basis: z.string().optional(),
});

const TierRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  triggers: z.array(TierTriggerSchema),
});

const InvariantSchema = z.object({
  id: z.string(),
  description: z.string(),
  condition: ConditionRecordSchema,
  required_controls: z.array(z.string()),
  severity: z.string(),
});

const ControlSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  resolves: z.array(z.string()),
  burden: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  verification: z.string(),
  platform_satisfies: z.array(z.string()),
});

const JurisdictionEntrySchema = z.object({
  code: z.string(),
  name: z.string(),
  pack_files: z.array(z.string()),
});

const RoleConfigSchema = z.object({ access: z.string() });

const TranslationAttestationSchema = z.object({
  attested_by: z.string(),
  role: z.string(),
  date: z.string(),
  raf_version_checked: z.string(),
});

const PolicyFileSchema = z.object({
  version: z.string(),
  policy_id: z.string(),
  firm_name: z.string(),
  translation_attestation: TranslationAttestationSchema,
  hard_lines: z.array(HardLineSchema),
  tracks: z.array(TrackRuleSchema),
  tiers: z.array(TierRuleSchema),
  invariants: z.array(InvariantSchema),
  controls: z.array(ControlSchema),
  kri_thresholds: z.record(z.string(), z.record(z.string(), z.unknown())),
  jurisdictions: z.array(JurisdictionEntrySchema),
  roles: z.record(z.string(), RoleConfigSchema),
  tier_workflow: z.record(z.string(), z.string()),
  safety_margin: z.number(),
});

// --- ADR-002 (policy-schema.md §8): only these operator keys are valid inside
// a condition-value object. Bare equality (string/number/boolean) is separate.
const ALLOWED_CONDITION_OPERATORS = new Set(['gte', 'lte', 'in', 'not_in']);

// --- Canonical vocabulary (policy-schema.md §3.0). Only fields whose values
// are drawn from a closed enum are checked; unrecognised fields pass through
// (forward compatibility — Kleppmann Ch. 4).
const CANONICAL_VOCABULARY: Record<string, readonly string[]> = {
  data_class: ['Public', 'Internal', 'Confidential', 'Client PII', 'MNPI'] satisfies DataClass[],
  data_zone: ['Zone A', 'Zone B', 'Zone C'] satisfies DataZone[],
  model_type: [
    'statistical',
    'traditional-ml',
    'ml',
    'deep-learning',
    'llm',
    'generative-ai',
    'agentic',
  ] satisfies ModelType[],
  exposure: [
    'internal-only',
    'internal-shared',
    'client-facing',
    'market-facing',
  ] satisfies Exposure[],
  decision_bindingness: [
    'non-binding',
    'advisory',
    'material',
    'binding',
  ] satisfies DecisionBindingness[],
  action_type: ['read', 'draft', 'recommend', 'execute', 'trade', 'approve'] satisfies ActionType[],
  decision_type: [
    'credit-decision',
    'lending-decision',
    'fraud-detection',
    'trading',
    'pricing',
    'hiring',
    'regulatory-reporting',
    'operational',
  ] satisfies DecisionType[],
};

const REQUIRED_TIERS: Tier[] = ['Critical', 'High', 'Medium', 'Low'];

function operatorErrors(field: string, value: unknown): PolicyValidationError[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  const keys = Object.keys(value as Record<string, unknown>);
  const invalidKeys = keys.filter((k) => !ALLOWED_CONDITION_OPERATORS.has(k));
  if (invalidKeys.length === 0) {
    return [];
  }
  return invalidKeys.map((k) => ({
    kind: 'policy-invalid' as const,
    field,
    reason: `condition operator "${k}" is not one of gte, lte, in, not_in`,
  }));
}

function vocabularyErrors(field: string, value: unknown): PolicyValidationError[] {
  const allowed = CANONICAL_VOCABULARY[field];
  if (!allowed) return [];

  const errors: PolicyValidationError[] = [];
  const checkValue = (v: unknown) => {
    if (typeof v === 'string' && !allowed.includes(v)) {
      errors.push({
        kind: 'policy-invalid',
        field,
        reason: `condition value "${v}" is not in canonical vocabulary for ${field}`,
      });
    }
  };

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.in)) obj.in.forEach(checkValue);
    if (Array.isArray(obj.not_in)) obj.not_in.forEach(checkValue);
  } else {
    checkValue(value);
  }
  return errors;
}

function validateConditionFieldValue(field: string, value: unknown): PolicyValidationError[] {
  return [...operatorErrors(field, value), ...vocabularyErrors(field, value)];
}

function validateConditionRecord(record: Record<string, unknown>): PolicyValidationError[] {
  return Object.entries(record).flatMap(([field, value]) =>
    validateConditionFieldValue(field, value),
  );
}

function validateHardLines(hardLines: HardLine[]): PolicyValidationError[] {
  return hardLines.flatMap((hl) => validateConditionRecord(hl.condition));
}

function validateTracks(tracks: TrackRule[]): PolicyValidationError[] {
  return tracks.flatMap((t) =>
    t.conditions.flatMap((c) => validateConditionFieldValue(c.field, c.value)),
  );
}

function validateTiers(tiers: TierRule[]): PolicyValidationError[] {
  return tiers.flatMap((t) =>
    t.triggers.flatMap((trig) => validateConditionFieldValue(trig.field, trig.value)),
  );
}

function validateInvariants(invariants: Invariant[]): PolicyValidationError[] {
  return invariants.flatMap((inv) => validateConditionRecord(inv.condition));
}

// Explicit semantic checks (policy-schema.md §6) — beyond what the Zod shape
// already guarantees (e.g. non-empty arrays, tier_workflow completeness).
function runSemanticChecks(policy: PolicyFile): {
  errors: PolicyValidationError[];
  warnings: string[];
} {
  const errors: PolicyValidationError[] = [];
  const warnings: string[] = [];

  if (!policy.version || policy.version.trim().length === 0) {
    errors.push({ kind: 'policy-invalid', field: 'version', reason: 'version field missing' });
  }

  if (policy.firm_name === '[FIRM]') {
    warnings.push('firm_name is still [FIRM] placeholder');
  }

  if (!Array.isArray(policy.hard_lines)) {
    errors.push({
      kind: 'policy-invalid',
      field: 'hard_lines',
      reason: 'hard_lines section missing',
    });
  }

  if (!Array.isArray(policy.controls) || policy.controls.length === 0) {
    errors.push({
      kind: 'policy-invalid',
      field: 'controls',
      reason: 'controls section is empty — at least one control required',
    });
  }

  if (!Array.isArray(policy.tracks) || policy.tracks.length === 0) {
    errors.push({
      kind: 'policy-invalid',
      field: 'tracks',
      reason: 'tracks section has no rules',
    });
  }

  if (!Array.isArray(policy.tiers) || policy.tiers.length === 0) {
    errors.push({
      kind: 'policy-invalid',
      field: 'tiers',
      reason: 'tiers section has no rules',
    });
  }

  for (const tier of REQUIRED_TIERS) {
    if (!policy.tier_workflow || !(tier in policy.tier_workflow)) {
      errors.push({
        kind: 'policy-invalid',
        field: 'tier_workflow',
        reason: `tier_workflow missing entry for ${tier}`,
      });
    }
  }

  if (
    typeof policy.safety_margin !== 'number' ||
    policy.safety_margin < 0 ||
    policy.safety_margin > 1
  ) {
    errors.push({
      kind: 'policy-invalid',
      field: 'safety_margin',
      reason: 'safety_margin must be 0.0–1.0',
    });
  }

  errors.push(...validateHardLines(policy.hard_lines ?? []));
  errors.push(...validateTracks(policy.tracks ?? []));
  errors.push(...validateTiers(policy.tiers ?? []));
  errors.push(...validateInvariants(policy.invariants ?? []));

  return { errors, warnings };
}

export function loadPolicy(yaml: string): PolicyValidationResult {
  let parsed: unknown;
  try {
    parsed = load(yaml);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      errors: [{ kind: 'policy-invalid', field: 'yaml', reason }],
      warnings: [],
    };
  }

  const zodResult = PolicyFileSchema.safeParse(parsed);
  if (!zodResult.success) {
    const errors: PolicyValidationError[] = zodResult.error.issues.map((issue) => ({
      kind: 'policy-invalid',
      field: issue.path.join('.') || '(root)',
      reason: issue.message,
    }));
    return { valid: false, errors, warnings: [] };
  }

  const policy = zodResult.data as PolicyFile;
  const { errors, warnings } = runSemanticChecks(policy);

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  return { valid: true, policy, warnings };
}
