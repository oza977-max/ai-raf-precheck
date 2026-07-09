import { describe, it, expect } from 'vitest';
import { matchesCondition } from './condition';
import type { DataFlowGraph } from './types';

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

describe('matchesCondition', () => {
  it('matches gte operator', () => {
    const g = graph({
      processing_nodes: [
        { id: 'p1', label: 'x', model_type: 'llm', autonomy_level: 4, data_zone: 'Zone A', vendor: 'internal', replaces_prior_model: false },
      ],
    });
    expect(matchesCondition({ autonomy_level: { gte: 4 } }, g)).toBe(true);
    expect(matchesCondition({ autonomy_level: { gte: 5 } }, g)).toBe(false);
  });

  it('matches lte operator', () => {
    const g = graph({
      processing_nodes: [
        { id: 'p1', label: 'x', model_type: 'llm', autonomy_level: 1, data_zone: 'Zone A', vendor: 'internal', replaces_prior_model: false },
      ],
    });
    expect(matchesCondition({ autonomy_level: { lte: 1 } }, g)).toBe(true);
    expect(matchesCondition({ autonomy_level: { lte: 0 } }, g)).toBe(false);
  });

  it('matches in operator', () => {
    const g = graph({
      output_nodes: [
        { id: 'o1', label: 'y', action_type: 'execute', exposure: 'client-facing', decision_bindingness: 'binding', output_reversibility: 'irreversible', scale: 'at_scale' },
      ],
    });
    expect(matchesCondition({ exposure: { in: ['client-facing', 'market-facing'] } }, g)).toBe(true);
    expect(matchesCondition({ exposure: { in: ['internal-only'] } }, g)).toBe(false);
  });

  it('matches not_in operator', () => {
    const g = graph({
      input_nodes: [{ id: 'i1', label: 'z', data_class: 'MNPI', data_zone: 'Zone C' }],
    });
    expect(matchesCondition({ data_zone: { not_in: ['Zone A'] } }, g)).toBe(true);
    expect(matchesCondition({ data_zone: { not_in: ['Zone C'] } }, g)).toBe(false);
  });

  it('matches bare equality', () => {
    const g = graph({
      output_nodes: [
        { id: 'o1', label: 'y', action_type: 'execute', exposure: 'internal-only', decision_bindingness: 'advisory', output_reversibility: 'irreversible', scale: 'limited', hitl: false },
      ],
    });
    expect(matchesCondition({ hitl: false }, g)).toBe(true);
    expect(matchesCondition({ hitl: true }, g)).toBe(false);
  });

  it('ANDs all keys within one condition', () => {
    const g = graph({
      processing_nodes: [
        { id: 'p1', label: 'x', model_type: 'llm', autonomy_level: 4, data_zone: 'Zone A', vendor: 'internal', replaces_prior_model: false },
      ],
      output_nodes: [
        { id: 'o1', label: 'y', action_type: 'execute', exposure: 'client-facing', decision_bindingness: 'binding', output_reversibility: 'irreversible', scale: 'at_scale' },
      ],
    });
    expect(
      matchesCondition(
        { autonomy_level: { gte: 4 }, output_reversibility: 'irreversible', exposure: { in: ['client-facing'] } },
        g,
      ),
    ).toBe(true);
    expect(
      matchesCondition(
        { autonomy_level: { gte: 4 }, output_reversibility: 'reversible' },
        g,
      ),
    ).toBe(false);
  });

  it('matches across any node on the graph (multi-node semantics)', () => {
    const g = graph({
      input_nodes: [{ id: 'i1', label: 'z', data_class: 'Client PII', data_zone: 'Zone B' }],
      processing_nodes: [
        { id: 'p1', label: 'x', model_type: 'llm', autonomy_level: 1, data_zone: 'Zone A', vendor: 'internal', replaces_prior_model: false },
      ],
    });
    expect(matchesCondition({ data_class: { in: ['Client PII'] }, autonomy_level: { gte: 1 } }, g)).toBe(true);
  });

  it('returns false when field is absent from every node', () => {
    const g = graph();
    expect(matchesCondition({ autonomy_level: { gte: 1 } }, g)).toBe(false);
  });
});
