import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../store/policy';
import { evaluate } from './evaluate';
import type { DataFlowGraph, PolicyFile } from './types';

let policy: PolicyFile;

beforeAll(() => {
  const yaml = readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8');
  const result = loadPolicy(yaml);
  if (!result.valid) throw new Error(`fixture policy invalid: ${JSON.stringify(result.errors)}`);
  policy = result.policy;
});

function graph(overrides: Partial<DataFlowGraph> = {}): DataFlowGraph {
  return {
    id: 'g1',
    version: 1,
    input_nodes: [],
    processing_nodes: [],
    output_nodes: [],
    edges: [],
    jurisdictions: [],
    intake_method: 'structured_form',
    extracted_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('evaluate — TC-PE-1-01 determinism', () => {
  it('produces an identical result across 10 runs for the same inputs', () => {
    const g = graph({
      processing_nodes: [
        { id: 'p1', label: 'x', model_type: 'ml', autonomy_level: 2, data_zone: 'Zone B', vendor: 'internal', replaces_prior_model: false },
      ],
      output_nodes: [
        { id: 'o1', label: 'y', action_type: 'recommend', exposure: 'internal-shared', decision_bindingness: 'advisory', output_reversibility: 'reversible', scale: 'limited' },
      ],
    });
    const results = Array.from({ length: 10 }, () => evaluate(g, policy));
    const first = JSON.stringify(results[0]);
    for (const r of results) expect(JSON.stringify(r)).toBe(first);
  });
});

describe('evaluate — TC-PE-4-01 hard line trip', () => {
  it('returns immediate rejected with no controls solved when a hard line trips', () => {
    const g = graph({
      processing_nodes: [
        { id: 'p1', label: 'x', model_type: 'agentic', autonomy_level: 4, data_zone: 'Zone A', vendor: 'internal', replaces_prior_model: false },
      ],
      output_nodes: [
        { id: 'o1', label: 'y', action_type: 'execute', exposure: 'client-facing', decision_bindingness: 'binding', output_reversibility: 'irreversible', scale: 'at_scale' },
      ],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('rejected');
      expect(result.value.binding_constraint).toBe('HL-001');
      expect(result.value.controls).toEqual([]);
    }
  });
});

const TRACK_I_PROCESSING = {
  id: 'p1',
  label: 'x',
  model_type: 'traditional-ml' as const,
  autonomy_level: 0 as const,
  data_zone: 'Zone C' as const,
  vendor: 'internal',
  replaces_prior_model: false,
};
const TRACK_I_OUTPUT = {
  id: 'o1',
  label: 'y',
  action_type: 'recommend' as const,
  exposure: 'internal-only' as const,
  decision_bindingness: 'material' as const,
  output_reversibility: 'reversible' as const,
  scale: 'limited' as const,
};

describe('evaluate — jurisdiction pass-through (TC-PE-5-01 structure)', () => {
  it('does not crash with jurisdictions present and applies no overrides', () => {
    const g = graph({
      processing_nodes: [TRACK_I_PROCESSING],
      output_nodes: [TRACK_I_OUTPUT],
      jurisdictions: ['UK', 'US'],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.applied_overrides).toEqual([]);
  });
});

describe('evaluate — approved path', () => {
  it('returns approved when no invariants trip', () => {
    const g = graph({
      processing_nodes: [TRACK_I_PROCESSING],
      output_nodes: [TRACK_I_OUTPUT],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('approved');
      expect(result.value.tier).toBe('Low');
    }
  });

  it('leaves binding_constraint empty when nothing tripped (P3-C01 review finding: must not leak the track rule id)', () => {
    const g = graph({
      processing_nodes: [TRACK_I_PROCESSING],
      output_nodes: [TRACK_I_OUTPUT],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.binding_constraint).toBe('');
  });
});

describe('evaluate — approved_with_controls path', () => {
  it('returns approved_with_controls with a real solved control set (P3-C02: no longer the stub)', () => {
    const g = graph({
      input_nodes: [{ id: 'i1', label: 'client notes', data_class: 'Client PII', data_zone: 'Zone A' }],
      processing_nodes: [TRACK_I_PROCESSING],
      output_nodes: [TRACK_I_OUTPUT],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('approved_with_controls');
      // INV-DATA-01 trips (Client PII into Zone A); appetite.yaml's
      // CTRL-ENC-01 is the only control that resolves it — the real
      // greedy solver must select it now that P3-C02 replaced the stub.
      expect(result.value.controls).toEqual(['CTRL-ENC-01']);
    }
  });

  it('sets boundary_proximity when a tripped invariant has exactly one resolving control selected (P3-C02 CS-4)', () => {
    const g = graph({
      input_nodes: [{ id: 'i1', label: 'client notes', data_class: 'Client PII', data_zone: 'Zone A' }],
      processing_nodes: [TRACK_I_PROCESSING],
      output_nodes: [TRACK_I_OUTPUT],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    // appetite.yaml's INV-DATA-01 is resolved by exactly one control
    // (CTRL-ENC-01) — zero redundant coverage, so boundary_proximity is true.
    if (result.ok) expect(result.value.boundary_proximity).toBe(true);
  });

  it('leaves boundary_proximity false on the plain approved path (nothing tripped)', () => {
    const g = graph({
      processing_nodes: [TRACK_I_PROCESSING],
      output_nodes: [TRACK_I_OUTPUT],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.boundary_proximity).toBe(false);
  });
});

describe('evaluate — no-track-match', () => {
  it('surfaces a no-track-match EngineError when no track rule matches', () => {
    const g = graph({
      processing_nodes: [
        { id: 'p1', label: 'x', model_type: 'deep-learning', autonomy_level: 1, data_zone: 'Zone A', vendor: 'internal', replaces_prior_model: false },
      ],
    });
    const result = evaluate(g, policy);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('no-track-match');
  });
});
