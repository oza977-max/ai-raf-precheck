// Minimal AuditEvent shape to prove the boundary in P1-C01.
// Full AuditEventType union (verdict_produced, graph_confirmed, etc. per
// verdict-audit.md §4.3) arrives in P2-C02/P4-C04.
export interface AuditEvent {
  event_id: string;
  use_case_id: string;
  event_type: 'skeleton_test';
  occurred_at: string;
}

export interface RegisterRow {
  use_case_id: string;
  label: string;
  tier: string;
}
