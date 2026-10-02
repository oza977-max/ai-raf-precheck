import { describe, it, expect } from 'vitest';
import { graphSummaryRows, destinationDescription, dataClassesBySeverity } from './graph-summary';
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

// R16-C (§3, D-03). UC-10's tick-all input kinds mean a confirmed graph can
// carry more than one input node. graphSummaryRows() must list every one of
// them, not just the first — the single-input case must stay byte-identical
// to before (ConfirmationStep.test.tsx's exact-string assertion depends on
// it), and a new row must appear for each additional input node.
describe('graphSummaryRows — every input node is listed (TC-R16-C-01)', () => {
  it('TC-R16-C-01: a single input node renders exactly as before (unchanged label and value)', () => {
    const rows = graphSummaryRows(graph());
    const inputRows = rows.filter((r) => r.label.startsWith('Input data'));
    expect(inputRows).toHaveLength(1);
    expect(inputRows[0]!.label).toBe('Input data');
  });

  it('two input nodes produce two rows, one per node, each with its own class', () => {
    const g = graph({
      input_nodes: [
        { id: 'i1', label: 'People data', data_class: 'Client PII', data_zone: 'Zone B' },
        { id: 'i2', label: 'Firm documents', data_class: 'Confidential', data_zone: 'Zone B' },
      ],
    });
    const rows = graphSummaryRows(g);
    const inputRows = rows.filter((r) => r.label.startsWith('Input data'));
    expect(inputRows).toHaveLength(2);
    expect(inputRows.map((r) => r.value)).toEqual([
      'People data · Personal details of clients · Client PII',
      'Firm documents · Confidential business information · Confidential',
    ]);
  });

  it('handles zero input nodes without crashing', () => {
    const g = graph({ input_nodes: [] });
    expect(() => graphSummaryRows(g)).not.toThrow();
    expect(graphSummaryRows(g).filter((r) => r.label.startsWith('Input data'))).toEqual([
      { label: 'Input data', value: '—' },
    ]);
  });
});

// R16-C (§1.2, §3). destinationDescription resolves the {destination}
// placeholder's own token-rendering rule (zones run most exposed -> most
// contained as A, B, C) in plain words, with no zone letter in the output —
// UnderstoodSummary (chunk C) and the verdict first screen's plain_reason
// substitution both need this reading; chunk C owns this implementation.
describe('destinationDescription (§1.2 {destination} token)', () => {
  it('TC-R16-C-03: Zone A -> an outside website or service', () => {
    expect(destinationDescription('Zone A')).toBe('an outside website or service');
  });
  it('Zone B -> the supplier’s systems, outside the firm’s own', () => {
    expect(destinationDescription('Zone B')).toMatch(/supplier.s systems/i);
  });
  it('Zone C -> your firm’s own systems', () => {
    expect(destinationDescription('Zone C')).toMatch(/your firm.s own systems/i);
  });
  it('never contains a bare zone letter', () => {
    for (const z of ['Zone A', 'Zone B', 'Zone C'] as const) {
      expect(destinationDescription(z)).not.toMatch(/Zone [ABC]/);
    }
  });
});

describe('dataClassesBySeverity (§3 "most sensitive first")', () => {
  it('TC-R16-C-04: ranks distinct input data classes most-sensitive first, using the same ranking as DATA_CLASS_RANK', () => {
    const g = graph({
      input_nodes: [
        { id: 'i1', label: 'a', data_class: 'Internal', data_zone: 'Zone B' },
        { id: 'i2', label: 'b', data_class: 'MNPI', data_zone: 'Zone B' },
        { id: 'i3', label: 'c', data_class: 'Client PII', data_zone: 'Zone B' },
      ],
    });
    expect(dataClassesBySeverity(g)).toEqual(['MNPI', 'Client PII', 'Internal']);
  });

  it('de-duplicates repeated classes', () => {
    const g = graph({
      input_nodes: [
        { id: 'i1', label: 'a', data_class: 'Internal', data_zone: 'Zone B' },
        { id: 'i2', label: 'b', data_class: 'Internal', data_zone: 'Zone B' },
      ],
    });
    expect(dataClassesBySeverity(g)).toEqual(['Internal']);
  });

  it('returns an empty list for zero input nodes, without crashing', () => {
    expect(dataClassesBySeverity(graph({ input_nodes: [] }))).toEqual([]);
  });
});
