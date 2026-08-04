import type { GraphCorrection } from '../engine/types';
import type { Verdict } from '../types/verdict';

// Full AuditEventType union per verdict-audit.md §4.3.
export type AuditEventType =
  | 'use_case_created'
  | 'duplicate_dismissed'
  | 'classification_adopted'
  | 'graph_confirmed'
  | 'verdict_produced'
  | 'graph_corrected'
  | 'verdict_corrected'
  | 'lifecycle_stage_changed'
  | 're_evaluation_queued'
  | 'twoloD_reviewed'
  | 'reasoning_trace_generated';

export interface AuditEvent {
  event_id: string;
  use_case_id: string;
  event_type: AuditEventType;
  occurred_at: string;
  actor: string;
  payload: AuditEventPayload;
}

export type AuditEventPayload =
  | { type: 'use_case_created'; description: string; intake_method: 'llm' | 'structured_form' }
  // UC-2 (round 4). The duplicate check surfaces a match and the submitter
  // decides. Both outcomes are decisions about the inventory and both are
  // recorded: dismissing a match was previously invisible, so nobody could
  // afterwards tell a genuine new use case from a duplicate waved through.
  | { type: 'duplicate_dismissed'; candidate_use_case_id: string; candidate_label: string }
  // Adoption records where the classification came from. The adopted record
  // deliberately carries NO verdict of its own — nothing was evaluated, and
  // the sign-off page says so (register-lifecycle.md §15.2).
  | {
      type: 'classification_adopted';
      adopted_from_use_case_id: string;
      adopted_from_label: string;
      tier: string | null;
      track: string | null;
    }
  | { type: 'graph_confirmed'; graph_id: string; graph_version: number; corrections_count: number }
  | { type: 'verdict_produced'; verdict: Verdict; reasoning_trace?: string }
  | { type: 'graph_corrected'; correction: GraphCorrection }
  | { type: 'verdict_corrected'; original_verdict_id: string; new_verdict: Verdict; reasoning_trace?: string }
  | { type: 'lifecycle_stage_changed'; from_stage: LifecycleStage; to_stage: LifecycleStage }
  | { type: 're_evaluation_queued'; policy_version: string }
    // verdict-audit.md §13.4 (design review C-1). `verdict_id` follows the
  // pattern the schema already uses (`verdict_corrected.original_verdict_id`,
  // `reasoning_trace_generated.verdict_id`). It is the id of the verdict the
  // page RENDERED, threaded from the render — never re-derived at write time,
  // which would reintroduce the race it closes. Without it, an attestation is
  // recorded against whatever is current and it could never afterwards be
  // established which verdict was actually signed.
  | {
      type: 'twoloD_reviewed';
      action: 'approved' | 'rejected' | 'correction_requested';
      verdict_id: string;
      notes?: string;
    }
  | { type: 'reasoning_trace_generated'; verdict_id: string; trace: string };

// Register types per register-lifecycle.md §4.1–4.2.
export type RegisterNodeType = 'use_case' | 'ai_model' | 'platform' | 'vendor' | 'data_source' | 'control';

export interface RegisterNode {
  node_id: string;
  node_type: RegisterNodeType;
  label: string;
  created_at: string;
  metadata: RegisterNodeMetadata;
}

// Note: tier/track are typed string | null here (not the real Tier/Track union
// from src/engine/types.ts) to avoid a premature cross-import before P3-C01's
// engine lands fully — intentional, minor typing looseness for this chunk.
export type RegisterNodeMetadata =
  | {
      node_type: 'use_case';
      submitted_by: string;
      lifecycle_stage: LifecycleStage;
      current_verdict_id: string | null;
      tier: string | null;
      track: string | null;
    }
  | { node_type: 'ai_model'; model_id: string; vendor: string; is_approved: boolean }
  | { node_type: 'platform'; platform_id: string; approved_envelope_summary: string }
  | { node_type: 'vendor'; vendor_name: string; approval_status: 'approved' | 'unapproved' | 'pending' }
  | { node_type: 'data_source'; data_class: string; data_zone: string }
  | { node_type: 'control'; control_id: string; burden: 1 | 2 | 3 | 4 | 5 };

export type RegisterEdgeType =
  | 'uses_model'
  | 'runs_on_platform'
  | 'provided_by_vendor'
  | 'consumes_data_from'
  | 'requires_control';

export interface RegisterEdge {
  edge_id: string;
  from_node_id: string;
  to_node_id: string;
  edge_type: RegisterEdgeType;
  created_at: string;
}

export type LifecycleStage =
  | 'idea'
  | 'exploring'
  | 'pre_checked'
  | 'approved'
  | 'in_production'
  | 'monitored'
  | 'retired';

export interface UseCaseSummary {
  use_case_id: string;
  label: string;
  submitted_by: string;
  submitted_at: string;
  lifecycle_stage: LifecycleStage;
  tier: string | null;
  track: string | null;
  // evaluation-engine.md §13.3: Provisional is NOT a fourth status — it is a
  // qualifier carried alongside the status. The register used to overwrite the
  // status with 'provisional', which hid what was actually decided. Rare
  // before round 3 (only unsigned pack rules triggered it); universal
  // afterwards, which is what exposed it.
  current_verdict_status: 'approved' | 'approved_with_controls' | 'rejected' | null;
  provisional: boolean;
  last_evaluated_at: string | null;
  policy_version_at_evaluation: string | null;
  stale_assessment: boolean;
}
