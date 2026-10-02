import { describe, it, expect } from 'vitest';
import { graphSummaryRows } from './graph-summary';
import type { DataFlowGraph } from '../engine/types';

function graph(overrides: Partial<DataFlowGraph> = {}): DataFlowGraph {
  return {
    id: 'g1',
    version: 1,
    intake_method: 'structured_form',
    extracted_at: '2026-01-01T00:00:00.000Z',
    jurisdictions: [],
    input_nodes: [{ id: 'i1', label: 'in', data_class: 'Internal', data_zone: 'Zone B' }],
    processing_nodes: [
      {
        id: 'p1',
        label: 'agent',
        model_type: 'agentic',
        autonomy_level: 2,
        data_zone: 'Zone B',
        vendor: 'internal',
        replaces_prior_model: false,
      },
    ],
    output_nodes: [
      {
        id: 'o1',
        label: 'out',
        action_type: 'draft',
        exposure: 'internal-only',
        decision_bindingness: 'non-binding',
        output_reversibility: 'reversible',
        scale: 'limited',
      },
    ],
    edges: [],
    ...overrides,
  };
}

// R16-A1 (PE-9 §1.1, D-03): graph-summary.ts is one of the renderers that
// must handle a list value for system_access_scope without crashing —
// before this chunk, `SYSTEM_ACCESS_LABELS[arrayValue]` was undefined and
// plainWithCode(undefined) threw.
describe('graphSummaryRows — system access (list-valued)', () => {
  it('TC-R16-A1-24: a single system_access_scope value renders one row, unchanged', () => {
    const g = graph({
      processing_nodes: [
        { ...graph().processing_nodes[0]!, system_access_scope: 'shared_infrastructure' },
      ],
    });
    const row = graphSummaryRows(g).find((r) => r.label === 'System access');
    expect(row?.value).toMatch(/shared infrastructure/i);
  });

  it('TC-R16-A1-25: a list of system_access_scope values does not crash and names every value', () => {
    const g = graph({
      processing_nodes: [
        {
          ...graph().processing_nodes[0]!,
          system_access_scope: ['shared_infrastructure', 'credentialed_systems'],
        },
      ],
    });
    expect(() => graphSummaryRows(g)).not.toThrow();
    const row = graphSummaryRows(g).find((r) => r.label === 'System access');
    expect(row?.value).toMatch(/shared infrastructure/i);
    expect(row?.value).toMatch(/credentialed systems/i);
  });

  it('is absent entirely when system_access_scope was never answered', () => {
    const row = graphSummaryRows(graph()).find((r) => r.label === 'System access');
    expect(row).toBeUndefined();
  });
});
