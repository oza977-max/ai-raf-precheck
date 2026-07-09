import type { PolicyFile, Tier } from './types';

// Rule 1 (cross-cutting.md §7): src/engine/* imports only from
// src/engine/types.ts and standard TS types — no cross-module import of
// src/store/types.ts's LifecycleStage, even though the union is
// identical. The two stages literals are duplicated intentionally to
// respect the engine-is-a-pure-island boundary.
type LifecycleStage =
  | 'idea'
  | 'exploring'
  | 'pre_checked'
  | 'approved'
  | 'in_production'
  | 'monitored'
  | 'retired';

// register-lifecycle.md §7.
//
// Built against the REAL policy schema (`tier_workflow: Record<Tier,
// WorkflowType>`, WorkflowType a bare string — see policy/appetite.yaml
// and src/engine/types.ts), not §7's richer aspirational YAML shape
// (governance_path/verdict_is_final/twoLoD_notification/
// twoLoD_approval_required/twoLoD_review_window_days) which was never
// implemented by P2-C01's Zod schema. Documented in build/prompts/P6-C02.md.
const TWO_LOD_REVIEW_WINDOW_DAYS = 5;

export interface WorkflowAction {
  lifecycle_stage: LifecycleStage;
  requires_twoLoD_action: boolean;
  auto_approves_after_days: number | null;
  notification_message: string;
}

export function routeToWorkflow(tier: Tier, policy: PolicyFile): WorkflowAction {
  const workflowType = policy.tier_workflow[tier];

  switch (workflowType) {
    case 'self-service':
      return {
        lifecycle_stage: 'approved',
        requires_twoLoD_action: false,
        auto_approves_after_days: null,
        notification_message: '',
      };
    case '2LoD-notify':
      return {
        lifecycle_stage: 'pre_checked',
        requires_twoLoD_action: false,
        auto_approves_after_days: TWO_LOD_REVIEW_WINDOW_DAYS,
        notification_message: `New ${tier}-tier use case pending 2LoD review (auto-approves in ${TWO_LOD_REVIEW_WINDOW_DAYS} days if no action)`,
      };
    case '2LoD-approve':
      return {
        lifecycle_stage: 'pre_checked',
        requires_twoLoD_action: true,
        auto_approves_after_days: null,
        notification_message: `${tier}-tier use case requires 2LoD approval before proceeding`,
      };
    default:
      // BC-P6C02-04: an unrecognized WorkflowType must fail SAFE to the
      // strictest path, never silently auto-approve.
      return {
        lifecycle_stage: 'pre_checked',
        requires_twoLoD_action: true,
        auto_approves_after_days: null,
        notification_message: `Unrecognized workflow type "${workflowType}" for tier ${tier} — defaulting to 2LoD approval required`,
      };
  }
}
