import { describe, it, expect } from 'vitest';
import { detectContradictions } from './contradiction';
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
    intake_method: 'llm',
    extracted_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('detectContradictions', () => {
  it('TC-UC-5-01: flags a contradiction when description denies client data but the graph has a Client PII node', () => {
    const g = graph({
      input_nodes: [{ id: 'i1', label: 'notes', data_class: 'Client PII', data_zone: 'Zone A' }],
    });
    const result = detectContradictions('This tool processes no client data at all.', [], g);
    expect(result).toHaveLength(1);
    expect(result[0]?.field).toBe('data_class');
  });

  it('flags a contradiction when description denies autonomy but the graph has autonomy_level >= 3', () => {
    const g = graph({
      processing_nodes: [
        {
          id: 'p1',
          label: 'x',
          model_type: 'agentic',
          autonomy_level: 4,
          data_zone: 'Zone A',
          vendor: 'internal',
          replaces_prior_model: false,
        },
      ],
    });
    const result = detectContradictions('A human approves every action, no autonomy.', [], g);
    expect(result).toHaveLength(1);
    expect(result[0]?.field).toBe('autonomy_level');
  });

  it('TC-UC-5-02 (no contradiction case): returns [] when description and graph agree', () => {
    const g = graph({
      input_nodes: [{ id: 'i1', label: 'notes', data_class: 'Internal', data_zone: 'Zone C' }],
    });
    const result = detectContradictions('This tool processes internal data only.', [], g);
    expect(result).toEqual([]);
  });

  it('returns [] when description has no recognized negation pattern', () => {
    const g = graph({
      input_nodes: [{ id: 'i1', label: 'notes', data_class: 'Client PII', data_zone: 'Zone A' }],
    });
    expect(detectContradictions('This tool drafts emails.', [], g)).toEqual([]);
  });
});

// Traceability close-out (2026-08-15). The existing cases each produce one
// contradiction; UC-5-03's claim is that BOTH are surfaced together rather
// than one at a time with the second hidden.
it('returns every contradiction at once, not just the first [TC-UC-5-03]', () => {
  // Phrasings reused from the two single-contradiction cases above, so this
  // fails only if MULTIPLE detection breaks — not if a pattern rewords.
  const description = 'This tool processes no client data at all. A human approves every action, no autonomy.';
  const g = graph({
    input_nodes: [{ id: 'i1', label: 'in', data_class: 'Client PII', data_zone: 'Zone C' }],
    processing_nodes: [
      { id: 'p1', label: 'm', model_type: 'ml', autonomy_level: 3, data_zone: 'Zone C', vendor: 'internal', replaces_prior_model: false },
    ],
  });
  const found = detectContradictions(description, [], g);
  expect(found.length).toBeGreaterThanOrEqual(2);
  const fields = found.map((c) => c.field);
  expect(fields).toContain('data_class');
  expect(fields).toContain('autonomy_level');
});
