import type { GraphCorrection } from '../engine/types';
import type { Verdict } from '../types/verdict';

// Full AuditEventType union per verdict-audit.md §4.3.
export type AuditEventType =
  | 'use_case_created'
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
  | { type: 'graph_confirmed'; graph_id: string; graph_version: number; corrections_count: number }
  | { type: 'verdict_produced'; verdict: Verdict; reasoning_trace?: string }
  | { type: 'graph_corrected'; correction: GraphCorrection }
  | { type: 'verdict_corrected'; original_verdict_id: string; new_verdict: Verdict; reasoning_trace?: string }
  | { type: 'lifecycle_stage_changed'; from_stage: LifecycleStage; to_stage: LifecycleStage }
  | { type: 're_evaluation_queued'; policy_version: string }
  | { type: 'twoloD_reviewed'; action: 'approved' | 'rejected' | 'correction_requested'; notes?: string }
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
  current_verdict_status: 'approved' | 'approved_with_controls' | 'rejected' | 'provisional' | null;
  last_evaluated_at: string | null;
  policy_version_at_evaluation: string | null;
  stale_assessment: boolean;
}
