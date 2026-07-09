import type {
  ActionType,
  DataClass,
  DataZone,
  DecisionBindingness,
  DecisionType,
  Exposure,
  ModelType,
} from './types';

// Canonical attribute vocabulary (policy-schema.md §3.0) — single runtime
// source of truth shared by src/store/policy.ts (condition-value validation)
// and src/llm/graph-extractor.ts (tool schema + response validation), so
// the two can't silently drift apart (P4-C01 review finding #2).
export const DATA_CLASSES = ['Public', 'Internal', 'Confidential', 'Client PII', 'MNPI'] satisfies DataClass[];
export const DATA_ZONES = ['Zone A', 'Zone B', 'Zone C'] satisfies DataZone[];
export const MODEL_TYPES = [
  'statistical',
  'traditional-ml',
  'ml',
  'deep-learning',
  'llm',
  'generative-ai',
  'agentic',
] satisfies ModelType[];
export const EXPOSURES = [
  'internal-only',
  'internal-shared',
  'client-facing',
  'market-facing',
] satisfies Exposure[];
export const DECISION_BINDINGNESS = ['non-binding', 'advisory', 'material', 'binding'] satisfies DecisionBindingness[];
export const ACTION_TYPES = ['read', 'draft', 'recommend', 'execute', 'trade', 'approve'] satisfies ActionType[];
export const DECISION_TYPES = [
  'credit-decision',
  'lending-decision',
  'fraud-detection',
  'trading',
  'pricing',
  'hiring',
  'regulatory-reporting',
  'operational',
] satisfies DecisionType[];

export const CANONICAL_VOCABULARY: Record<string, readonly string[]> = {
  data_class: DATA_CLASSES,
  data_zone: DATA_ZONES,
  model_type: MODEL_TYPES,
  exposure: EXPOSURES,
  decision_bindingness: DECISION_BINDINGNESS,
  action_type: ACTION_TYPES,
  decision_type: DECISION_TYPES,
};
