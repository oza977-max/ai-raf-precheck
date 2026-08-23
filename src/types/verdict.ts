// Verdict envelope (evaluation-engine.md §3.9). Added by the caller — never
// by evaluate(), which returns the pure EvaluationResult only.
import type { AppliedOverride, ConfidenceCaveat, EvaluationResult, StaleSource, VerdictConditions } from '../engine/types';

export interface VerdictCorrection {
  correctedAt: string;
  correctedBy: string;
  reason: string;
}

export interface Verdict extends EvaluationResult {
  id: string;
  use_case_id: string;
  living_status: 'approved' | 'amber' | 'breached' | 'revoked';
  living_status_updated_at: string;
  attested_by: string;
  attested_at: string;
  graph_version: number;
  corrections: VerdictCorrection[];
  // R12-ST-1 (ADR-EE-R12-1): computed alongside evaluate() by the caller,
  // never inside EvaluationResult — optional because legacy persisted
  // verdicts predate staleness computation and lack this field.
  stale_sources?: StaleSource[];
}

export type { VerdictConditions, ConfidenceCaveat, AppliedOverride, StaleSource };
