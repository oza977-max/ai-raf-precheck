// Shared engine types. Rule 1 (cross-cutting.md §7): this file and evaluate.ts
// import only from here and stdlib TS types — no React, no idb, no Anthropic SDK.

import type { ProvisionalReason } from './provisional';

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
  // CS-3 (code review round 3, Panel B). The reviews above are the prose a
  // reader sees; this is which rule produced each one and the citation behind
  // it, where there is one. `firmRequiredReviews` computed both and every call
  // site discarded them — the same computed-but-never-consumed defect that
  // lost this product its regulatory citations for the whole of V1. Optional
  // so verdicts persisted before this change stay readable.
  downstream_review_sources?: DownstreamReviewSource[];
  conditions: VerdictConditions;
  policy_version: string;
  pack_versions: Record<string, string>;
  applied_overrides: AppliedOverride[];
  confidence_caveats: ConfidenceCaveat[];
  // R3-JU-2 / R3-JU-6 (ADR-EE-R3-1). Empty when the verdict is not
  // provisional; a verdict is Provisional if and only if this is non-empty.
  // Consumers read it and never re-derive from confidence_caveats.
  provisional_reasons: ProvisionalReason[];
  /** Decision types the submitter typed that the policy has no rule for.
   *  Empty in the normal case. Named rather than merely counted, because the
   *  firm needs to know WHICH decision type its framework does not cover.
   *
   *  OPTIONAL, and unlike `provisional_reasons` reading absent-as-empty is
   *  safe here: a verdict persisted before this field existed was produced
   *  when free-text decision types could not be entered at all, so "absent"
   *  and "none" are genuinely the same claim about that record. That is the
   *  test `provisional_reasons` failed — an absent one there could hide a
   *  Provisional verdict somebody had already signed. */
  unclassified_decision_types?: string[];
  boundary_proximity: boolean;
  // CS-1 (HR-14): the margin actually achieved, its target, and the
  // invariants left at coverage depth 1. Reporting the number rather than a
  // boolean is what makes the gap visible — with one control per invariant
  // the achieved margin is 0 and no control set can improve it.
  margin_achieved: number;
  margin_target: number;
  single_covered_invariants: string[];
  explanation: VerdictExplanation;
  // PV-6: absent when no platform or vendor was declared.
  inheritance?: InheritanceChain;

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
  // V2-A (RA-9): fired jurisdiction-pack rules with verbatim source text
  // + sign-off. Optional: verdicts persisted before V2-A lack it.
  regulatory_chain?: RegulatoryChainEntry[];
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
  // Populated since V2-A by caveatForFiredRule() in jurisdiction.ts,
// rendered by VerdictDisplay, asserted by evaluate.test.ts. The prior
// comment said this was 'always []' — stale, and a reader trusting it
// could have deleted the mechanism that makes verdicts provisional
// (code review 001, I-4).
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
  // PV-1: the approved platform this runs on, if declared. Optional so every
  // pre-PV graph remains valid.
  platform?: string;
  replaces_prior_model: boolean;
  uncertain?: boolean;
  // R11-MG-2: which model this node declares, sourced from the policy's
  // approved_models registry (or free-text "not listed — name it" on the
  // form path). Optional so every pre-R11 graph remains valid. The engine
  // resolves this against policy.approved_models the same way vendor/
  // platform declarations resolve against their registries — an absent or
  // unapproved entry is reported, never silently accepted.
  declared_model_id?: string;
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
  // User report (2026-08-09): the decision-type list is a closed vocabulary
  // and a bank's real decision types have a long tail — "collections
  // prioritisation", "AML alert triage", "suitability assessment". Free text
  // alone would be dangerous: `decision_type` gates HL-003, HL-004,
  // TIER-CRITICAL, TIER-HIGH and EU AI Act Annex III, so an unmatched value
  // silently under-classifies. So the typed text lands HERE, `decision_type`
  // stays undefined (nothing matches, which is the truth), and the engine
  // raises `unclassified_decision_type` so the gap is stated on the verdict
  // rather than hidden.
  decision_type_other?: string;
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
  // R6-CX-1: optional context for the 2LoD reviewer. Human-read ONLY —
  // never engine input (the reviewer-note rule: closed vocabularies stay
  // closed). evaluate() must not read this field.
  context?: string;
}

export interface Contradiction {
  statement1: string;
  statement2: string;
  field: string;
}

// V2-A: REAL jurisdiction pack schema (policy-schema.md §4), replacing
// the P3-C01 placeholder. track_floor is intentionally absent — the
// supplement model was decided instead (repo-updates §4.2): obligations
// are only ever ADDED, tier floors only ever RAISE (BC-V2A-01).
// V2-E (user feedback: "who signed off on that interpretation, and how
// confident they were — I don't know how this will work, don't think it's
// practically implementable").
//
// Replaces the old `confidence: High | Medium | Low`. That score was
// subjective and uncalibrated: two reviewers would grade the same rule
// differently and nobody could say what "Medium" obliged them to do —
// fabricated precision, which is the one thing this product must not do.
//
// `basis` asks an objectively checkable question instead: does the rule
// restate the quoted regulatory text, infer from it, or rest on legal
// judgement? A reviewer can verify that by reading the rule against its
// own source quote, without inventing a confidence number.
export type PackBasis =
  | 'verbatim'   // rule restates the quoted text; nothing inferred
  | 'derived'    // a direct inference from the quoted text
  | 'judgement'; // rests on legal interpretation — needs a named human

// PV-1/PV-2. An approved platform or vendor records the envelope its
// approval covers and the controls that approval already satisfies.
export interface Envelope {
  max_data_class?: DataClass;
  max_exposure?: Exposure;
  max_autonomy_level?: 0 | 1 | 2 | 3 | 4;
  data_zones?: DataZone[];
  jurisdictions?: string[];
}

export interface RegistryEntry {
  id: string;
  name: string;
  approved_envelope: Envelope;
  satisfies_controls: string[];
  // PV-3: controls whose justification stands or falls together. Exceeding
  // any dimension named in a cluster drops every control in it.
  coupled_clusters?: string[][];
}

// PV-3: one per dimension the envelope constrains. Never collapsed to a
// single boolean — inheritance is per-dimension.
export interface EnvelopeDimensionFit {
  dimension: string;
  fits: boolean;
  // Renamed from `approved` (code review 001, C-6): the banned word must
  // not re-enter the verdict screen through interpolated data.
  ceiling: string;
  observed?: string;
}

// PV-6: the chain that justifies any inheritance. Present only when a
// platform or vendor was declared — absent means nothing was claimed.
export interface InheritanceChain {
  declared_platform?: string;
  declared_vendor?: string;
  resolved: boolean;
  // C-3: every declared component that is absent from the registry. `resolved`
  // is now `unresolved_components.length === 0`, so an approved platform can
  // no longer mask an unapproved vendor.
  unresolved_components: string[];
  inherited_controls: string[];
  dimensions: EnvelopeDimensionFit[];
}

export interface PackRuleSource {
  document: string;
  section: string;
  text: string;
  // V2-F: a reviewer's first question is "is this quote real?". Without a
  // link they have to go and find the provision themselves, which is the
  // step that makes pack sign-off feel like reading the whole regulation.
  // Optional so pre-V2-F packs still load.
  source_url?: string;
  retrieved_date?: string;
}

export type PackRuleEffect =
  | { type: 'tier_floor'; minimum_tier: Tier }
  | { type: 'required_control'; control_id: string }
  | { type: 'required_review'; review: string }
  | { type: 'hard_line'; reason: string };

export interface PackRule {
  id: string;
  title: string;
  source: PackRuleSource;
  effect: PackRuleEffect;
  condition: Condition;
  basis: PackBasis;
  // V2-E: sign-off is a PACK-level act, not a per-rule one. Legal issues a
  // position on a regulation; they do not countersign each line of a YAML
  // file, and asking them to made adoption a task no firm would finish.
  // These optional fields exist only for the rare rule a firm signs off
  // separately from its pack (a local deviation) — when absent, the pack's
  // sign-off governs.
  reviewer_name?: string;
  reviewer_role?: string;
  sign_off_date?: string;
}

export interface JurisdictionPack {
  pack_id: string;
  version: string;
  jurisdiction: string;
  regulator: string;
  document: string;
  effective_date: string;
  // The unit of adoption (NF-7). A [..] placeholder in either field means
  // the pack is UNADOPTED — every verdict relying on one of its rules is
  // provisional.
  reviewer_name: string;
  reviewer_role: string;
  sign_off_date: string;
  rules: PackRule[];
  // R12-ST (ADR-PS-R12-1): PACK-level (not per-rule) freshness header —
  // distinct from PackRuleSource.retrieved_date, which is per-rule/per-quote.
  // This pair says "as a whole, this pack's regulatory reading was last
  // checked on this date, and is due another look after this many days."
  // Both optional so every pre-R12 pack still loads unchanged.
  retrieved_date?: string;
  max_staleness_days?: number;
}

// R12-ST (ADR-EE-R12-1): computeStaleSources()'s pure output shape. Rides
// beside the Verdict wrapper (like attested_at), never inside
// EvaluationResult — that is what keeps evaluate() byte-identical (NF-1 /
// TC-PE-1-01) whether or not staleness is computed.
export interface StaleSource {
  pack_id: string;
  retrieved_date: string;
  max_staleness_days: number;
  days_overdue: number;
}

// RA-9: one entry per FIRED pack rule — the regulatory reasoning chain.
export interface RegulatoryChainEntry {
  rule_id: string;
  document: string;
  section: string;
  source_text: string;
  basis: PackBasis;
  derived: string;
  sign_off: string;
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
export type ActionType = 'read' | 'inform' | 'draft' | 'recommend' | 'execute' | 'trade' | 'approve';
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
  // CS-3: optional so an existing policy file stays valid — a firm with no
  // configured processes simply has none, which is different from the
  // mechanism not existing.
  downstream_reviews?: DownstreamReviewRule[];
  kri_thresholds: KriThresholds;
  jurisdictions: JurisdictionEntry[];
  roles: Record<string, RoleConfig>;
  tier_workflow: Record<Tier, WorkflowType>;
  safety_margin: number;
  binding_constraint_order?: Array<'severity' | 'control_burden' | 'id'>;
  // PV-1/PV-2: optional so every existing policy still loads unchanged.
  platforms?: RegistryEntry[];
  vendors?: RegistryEntry[];
  // R11-MG-1 (ADR-PS-R11-1, policy-schema.md §10a): the approved-model
  // registry. Optional so every pre-R11 policy still loads unchanged.
  approved_models?: ApprovedModel[];
  // R12-AB (ADR-VA-R12-1): 1-in-K deterministic sampling rate for the 2LoD
  // spot-review queue over self-served Low-tier verdicts. Optional — a
  // policy without it samples nothing (isSampledForReview's degenerate
  // "never" case), which is what keeps every pre-R12 policy valid.
  sampling_rate?: number;
}

// R11-MG-1 (policy-schema.md §10a). `is_approved: false` entries are valid
// and expected — provenance class is an attribute the firm's rules judge,
// never itself a hardcoded penalty (requirements-011.md R11-MG-2).
export interface ApprovedModel {
  model_id: string;
  vendor: string;
  provenance_class: 'vendor_hosted' | 'open_weights_self_hosted' | 'fine_tuned_in_house';
  is_approved: boolean;
  license_note?: string;
  benchmark_evidence?: {
    suite: string;
    date: string;
    finance_domain: boolean;
    detail?: string;
  };
  // R11-MG-1a (mid-build amendment): mutually exclusive with an entry
  // keyed purely by model_id — a FAMILY entry approves a version pattern
  // rather than one pinned string. model_id on a family entry is the
  // family's own label (e.g. "gpt-4o-*"), not a real model string.
  is_family?: boolean;
  version_pattern?: string; // prefix match, e.g. "gpt-4o-" — no regex, no dynamic code (ADR-002 discipline)
  // R12-MG (ADR-PS-R12-1): meaningful for FAMILY entries — an ISO date past
  // which the family confers no approval (routes to unlisted/model-
  // governance review instead). Optional so pinned (non-family) entries and
  // every pre-R12 entry stay valid; applyReattestExpiry() is the pure
  // engine transform that acts on it.
  reattest_by?: string;
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

/** CS-3 (round 4). A firm-configured downstream process — information
 *  security review, vendor risk assessment, cloud security approval — required
 *  by a use case's characteristics and separate from the AI risk pre-check
 *  itself. The condition vocabulary is the same one hard lines, tiers, tracks
 *  and invariants already use. */
/** Which rule required a given review, carried onto the verdict so a 2LoD
 *  reviewer can check the obligation against the policy rather than taking it
 *  on trust. */
export interface DownstreamReviewSource {
  review: string;
  rule_id: string;
  regulatory_basis?: string;
}

export interface DownstreamReviewRule {
  id: string;
  review: string;
  condition: Condition;
  /** Optional, like an invariant's: shown where it exists, never fabricated
   *  where it does not (BC-V11C01-02). */
  regulatory_basis?: string;
}

export interface Control {
  id: string;
  name: string;
  description: string;
  resolves: string[];
  burden: 1 | 2 | 3 | 4 | 5;
  verification: string;
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
  // R10-CE (ADR-VA-R10-3): optional COSO-style axes. Legacy single-status
  // evidence stays valid and renders unchanged; where axes are present the
  // UI shows both. They refine the evidence — they never change a verdict.
  design?: ControlEffectivenessAssessment;
  operating?: ControlEffectivenessAssessment;
}

export interface ControlEffectivenessAssessment {
  status: 'effective' | 'deficient' | 'not_assessed';
  detail?: string;
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
