// Shared engine types. Rule 1 (cross-cutting.md §7): this file and evaluate.ts
// import only from here and stdlib TS types — no React, no idb, no Anthropic SDK.

export type Tier = 'Critical' | 'High' | 'Medium' | 'Low';
export type Track = 'I' | 'II' | 'III';
export type VerdictStatus = 'approved' | 'approved_with_controls' | 'rejected';

// Pure result shape (evaluation-engine.md §3.9) — no identity/time fields at this layer.
// Full shape (conditions, policy_version, pack_versions, applied_overrides,
// confidence_caveats, boundary_proximity) lands with the real engine in P3-C01.
export interface EvaluationResult {
  status: VerdictStatus;
  tier: Tier;
  track: Track;
  binding_constraint: string;
  binding_path: string;
  controls: string[];
  downstream_reviews: string[];
}

// Result<T, E> pattern (cross-cutting.md §5) — engine functions never throw.
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type EngineError =
  | { kind: 'policy-invalid'; field: string; reason: string }
  | { kind: 'hard-line-tripped'; invariantId: string; path: string }
  | { kind: 'no-control-set'; unsatisfiableInvariant: string }
  | { kind: 'jurisdiction-conflict'; packs: string[]; reason: string };

// Canonical attribute vocabulary (policy-schema.md §3.0) — closed enums used to
// validate condition values in hard lines, track rules, tier rules, and invariants.
export type DataClass = 'Public' | 'Internal' | 'Confidential' | 'Client PII' | 'MNPI';
export type DataZone = 'Zone A' | 'Zone B' | 'Zone C';
export type ModelType =
  | 'statistical'
  | 'traditional-ml'
  | 'ml'
  | 'deep-learning'
  | 'llm'
  | 'generative-ai'
  | 'agentic';
export type Exposure = 'internal-only' | 'internal-shared' | 'client-facing' | 'market-facing';
export type DecisionBindingness = 'non-binding' | 'advisory' | 'material' | 'binding';
export type ActionType = 'read' | 'draft' | 'recommend' | 'execute' | 'trade' | 'approve';
export type DecisionType =
  | 'credit-decision'
  | 'lending-decision'
  | 'fraud-detection'
  | 'trading'
  | 'pricing'
  | 'hiring'
  | 'regulatory-reporting'
  | 'operational';

// Real PolicyFile schema (policy-schema.md §5) — replaces the P1-C01 3-field stub.
export interface PolicyFile {
  version: string;
  policy_id: string;
  firm_name: string;
  translation_attestation: TranslationAttestation;
  hard_lines: HardLine[];
  tracks: TrackRule[];
  tiers: TierRule[];
  invariants: Invariant[];
  controls: Control[];
  kri_thresholds: KriThresholds;
  jurisdictions: JurisdictionEntry[];
  roles: Record<string, RoleConfig>;
  tier_workflow: Record<Tier, WorkflowType>;
  safety_margin: number;
}

export interface TranslationAttestation {
  attested_by: string;
  role: string;
  date: string;
  raf_version_checked: string;
}

export interface HardLine {
  id: string;
  description: string;
  condition: Record<string, unknown>;
  reason: string;
  regulatory_basis: string;
}

export interface TrackRule {
  id: string;
  name: string;
  description: string;
  conditions: Array<{ field: string; value: unknown }>;
  short_circuit: boolean;
  regulatory_basis: string;
}

export interface TierRule {
  id: string;
  name: string;
  description?: string;
  triggers: Array<{ field: string; value: unknown; regulatory_basis?: string }>;
}

export interface Invariant {
  id: string;
  description: string;
  condition: Record<string, unknown>;
  required_controls: string[];
  severity: string;
}

export interface Control {
  id: string;
  name: string;
  description: string;
  resolves: string[];
  burden: 1 | 2 | 3 | 4 | 5;
  verification: string;
  platform_satisfies: string[];
}

export interface KriThresholds {
  [dimension: string]: Record<string, unknown>;
}

export interface JurisdictionEntry {
  code: string;
  name: string;
  pack_files: string[];
}

export interface RoleConfig {
  access: string;
}

export type WorkflowType = string;

// Discriminated union — replaces the P1-C01 EngineError-shaped stub.
export interface PolicyValidationError {
  kind: 'policy-invalid' | 'pack-invalid';
  field: string;
  reason: string;
  packId?: string;
}

export type PolicyValidationResult =
  | { valid: true; policy: PolicyFile; warnings: string[] }
  | { valid: false; errors: PolicyValidationError[]; warnings: string[] };
