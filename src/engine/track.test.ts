import { describe, it, expect } from 'vitest';
import { assignTrack } from './track';
import type { DataFlowGraph, TrackRule } from './types';

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

const TRACKS: TrackRule[] = [
  {
    id: 'TRACK-I',
    name: 'Track I',
    description: 'Traditional MRM',
    conditions: [{ field: 'model_type', value: { in: ['statistical', 'traditional-ml'] } }],
    short_circuit: true,
    regulatory_basis: 'SS1/23 §3.4',
  },
  {
    id: 'TRACK-II',
    name: 'Track II',
    description: 'AI on MRM',
    conditions: [{ field: 'model_type', value: { in: ['ml', 'llm'] } }],
    short_circuit: true,
    regulatory_basis: 'SS1/23 §3.4',
  },
  {
    id: 'TRACK-III',
    name: 'Track III',
    description: 'AI Governance',
    conditions: [{ field: 'model_type', value: { in: ['generative-ai', 'agentic'] } }],
    short_circuit: true,
    regulatory_basis: 'SR 26-2 §III.C',
  },
];

function withModelType(modelType: string) {
  return graph({
    processing_nodes: [
      { id: 'p1', label: 'x', model_type: modelType as never, autonomy_level: 1, data_zone: 'Zone A', vendor: 'internal', replaces_prior_model: false },
    ],
  });
}

describe('assignTrack', () => {
  it('matches the first rule in order (short-circuit)', () => {
    const result = assignTrack(withModelType('statistical'), TRACKS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.track).toBe('I');
  });

  it('parses Track III from the rule id correctly (not confused by substring "II")', () => {
    const result = assignTrack(withModelType('generative-ai'), TRACKS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.track).toBe('III');
  });

  it('returns a no-track-match error when nothing matches', () => {
    const result = assignTrack(withModelType('deep-learning'), TRACKS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('no-track-match');
  });
});
