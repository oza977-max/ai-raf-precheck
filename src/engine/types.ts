// Shared engine types. Rule 1 (cross-cutting.md §7): this file and evaluate.ts
// import only from here and stdlib TS types — no React, no idb, no Anthropic SDK.

export type Tier = 'Critical' | 'High' | 'Medium' | 'Low';
export type Track = 'I' | 'II' | 'III';
export type VerdictStatus = 'approved' | 'approved_with_controls' | 'rejected';

// Pure result shape (evaluation-engine.md §3.9) — no identity/time fields at this layer.
export interface EvaluationResult {
  status: VerdictStatus;
  tier: Tier;
  track: Track;
  binding_constraint: string;
  binding_path: string;
  controls: string[];
  downstream_reviews: string[];
  conditions: VerdictConditions;
  policy_version: string;
  pack_versions: Record<string, string>;
  applied_overrides: AppliedOverride[];
  confidence_caveats: ConfidenceCaveat[];
  boundary_proximity: boolean;
  explanation: VerdictExplanation;
}

// V1.1-C01: the "why" behind a verdict, wired from data the engine was
// already computing and previously discarding at assembly (tier/track
// rationale, hard-line reason + regulatory citation, tripped-invariant
// details). Deterministic — a pure function of the same sorted inputs
// as the rest of the result (NF-1 holds unchanged).
export interface RuleRationale {
  rule_id: string;
  rule_name?: string;
  matched_field?: string;
  regulatory_basis?: string;
}

export interface TrippedInvariantDetail {
  id: string;
  description: string;
  severity: string;
  regulatory_basis?: string;
  required_controls: string[];
  graph_path: string;
}

export interface VerdictExplanation {
  // null on a hard-line rejection, where tier/track assignment is
  // skipped by design (§3.1 step order) and ceiling values are reported.
  tier_rationale: RuleRationale | null;
  track_rationale: RuleRationale | null;
  hard_lines_checked: number;
  invariants_checked: number;
  // The FULL tripped set — closes P5-C02's documented one-element
  // approximation (binding_constraint remains the single binding rule).
  tripped_invariants: TrippedInvariantDetail[];
  binding_reason: string | null;
  binding_regulatory_basis: string | null;
}

// VD-7: hypothesis schema for V2 monitoring — empty in V1, structure locked now.
export interface VerdictConditions {
  hypotheses: string[];
}

export interface ConfidenceCaveat {
  ruleId: string;
  field: string;
  reason: string;
  // RA-11 (verdict-audit.md §5.3) — P5-C01 addition. Note: evaluate()
  // does not yet populate confidence_caveats with real data (always []);
  // this field exists so VerdictDisplay.tsx can render correctly once a
  // future engine chunk starts producing real caveats.
  confidence: 'low' | 'medium' | 'high';
}

export interface AppliedOverride {
  packCode: string;
  ruleId: string;
  effect: string;
}

// DataFlowGraph (intake-flow.md §4.2, post build-prep field-drift fix
// commit 51c829b). Locked contract as of this chunk — P4-C01 imports, does
// not redefine.
export interface DataFlowGraph {
  id: string;
  version: number;
  input_nodes: InputNode[];
  processing_nodes: ProcessingNode[];
  output_nodes: OutputNode[];
  edges: GraphEdge[];
  jurisdictions: string[];
  intake_method: 'llm' | 'structured_form';
  extracted_at: string;
}

export interface InputNode {
  id: string;
  label: string;
  data_class: DataClass;
  data_zone: DataZone;
}

export interface ProcessingNode {
  id: string;
  label: string;
  model_type: ModelType;
  autonomy_level: 0 | 1 | 2 | 3 | 4;
  data_zone: DataZone;
  vendor: string;
  replaces_prior_model: boolean;
  uncertain?: boolean;
}

export interface OutputNode {
  id: string;
  label: string;
  action_type: ActionType;
  exposure: Exposure;
  decision_bindingness: DecisionBindingness;
  output_reversibility: 'reversible' | 'irreversible' | 'unknown';
  scale: 'limited' | 'at_scale';
  decision_type?: DecisionType;
  hitl?: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
}

// Condition language (ADR-002, policy-schema.md §8). Minimal operator set —
// no and/or/nested chains, the real appetite.yaml never needs them.
export type ConditionValue =
  | { gte: number }
  | { lte: number }
  | { in: unknown[] }
  | { not_in: unknown[] }
  | string
  | number
  | boolean;

export type Condition = Record<string, ConditionValue>;

// UC-4/UC-5 (intake-flow.md §6-7). Relocated here from
// src/components/intake-state.ts (P4-C03) — src/engine/question-generator.ts
// and src/engine/contradiction.ts must return these types without importing
// from src/components/* (one-way dependency, cross-cutting.md §7).
export interface IntakeQuestion {
  id: string;
  text: string;
  field: string;
  node_id?: string;
  triggered_by: string[];
  answer_type: 'boolean' | 'select' | 'text';
  options?: string[];
}

export interface QuestionAnswer {
  questionId: string;
  value: unknown;
}

export interface Contradiction {
  statement1: string;
  statement2: string;
  field: string;
}

// Placeholder — no pack-loading chunk exists yet (same P3-C01 deviation).
// generateQuestions() always receives [] for activePacks until a future
// chunk lands real jurisdiction pack loading.
export interface JurisdictionPack {
  code: string;
  rules: never[];
}

// UC-7 correction recording (intake-flow.md §8).
export interface GraphCorrection {
  correction_id: string;
  graph_version_before: number;
  graph_version_after: number;
  node_id: string;
  field: string;
  original_value: unknown;
  corrected_value: unknown;
  corrected_by: string;
  corrected_at: string;
  reason?: string;
}

// Result<T, E> pattern (cross-cutting.md §5) — engine functions never throw.
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type EngineError =
  | { kind: 'policy-invalid'; field: string; reason: string }
  | { kind: 'hard-line-tripped'; invariantId: string; path: string }
  | { kind: 'no-control-set'; unsatisfiableInvariant: string }
  | { kind: 'jurisdiction-conflict'; packs: string[]; reason: string }
  | { kind: 'no-track-match'; reason: string };

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
  condition: Condition;
  reason: string;
  regulatory_basis: string;
}

export interface TrackRule {
  id: string;
  name: string;
  description: string;
  conditions: Array<{ field: string; value: ConditionValue }>;
  short_circuit: boolean;
  regulatory_basis: string;
}

export interface TierRule {
  id: string;
  name: string;
  description?: string;
  triggers: Array<{ field: string; value: ConditionValue; regulatory_basis?: string }>;
}

export interface Invariant {
  id: string;
  description: string;
  condition: Condition;
  required_controls: string[];
  severity: string;
  // V1.1-C01: optional — hard lines/tracks always carry a citation, but
  // invariants may not have one; the UI shows nothing rather than a
  // fabricated citation (BC-V11C01-02).
  regulatory_basis?: string;
}

export interface Control {
  id: string;
  name: string;
  description: string;
  resolves: string[];
  burden: 1 | 2 | 3 | 4 | 5;
  verification: string;
  platform_satisfies: string[];
  // V1.3 (design-vision decision #3, proof-carrying controls): current
  // verification status + evidence binding. ABSENT = unverified — the
  // honest default (BC-V13-02). V1 statuses are attested by hand in the
  // policy file; machine-checked evidence binding is V1.5.
  verification_evidence?: ControlVerificationEvidence;
}

export interface ControlVerificationEvidence {
  status: 'verified' | 'unverified';
  detail?: string;
  attested_by?: string;
  attested_at?: string;
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
