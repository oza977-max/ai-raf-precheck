import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GraphView from '../GraphView';
import type { DataFlowGraph } from '../../engine/types';

// R16-A1 (PE-9 §1.1, D-03): every renderer that displays system_access_scope
// must handle a list without crashing. This covers GraphView's DISPLAY path
// only (the per-field meaning row) — the editing <select> control stays a
// single-value control in this chunk (chunk E replaces it with a tick-all).
function makeGraph(systemAccessScope: unknown): DataFlowGraph {
  return {
    id: 'g1',
    version: 1,
    intake_method: 'llm',
    extracted_at: '2026-01-01T00:00:00.000Z',
    input_nodes: [],
    processing_nodes: [
      {
        id: 'p1',
        label: 'agent',
        model_type: 'agentic',
        autonomy_level: 2,
        data_zone: 'Zone C',
        vendor: 'internal',
        replaces_prior_model: false,
        // @ts-expect-error — exercising a list value deliberately.
        system_access_scope: systemAccessScope,
      },
    ],
    output_nodes: [],
    edges: [],
    jurisdictions: [],
  };
}

describe('GraphView — system access display (list-valued, R16-A1)', () => {
  it('TC-R16-A1-26: a single system_access_scope value renders its meaning, as before', () => {
    render(<GraphView graph={makeGraph('shared_infrastructure')} />);
    expect(screen.getByText(/shared infrastructure/i)).toBeInTheDocument();
  });

  it('TC-R16-A1-27: a list of system_access_scope values renders without crashing and names every value', () => {
    expect(() =>
      render(<GraphView graph={makeGraph(['shared_infrastructure', 'credentialed_systems'])} />),
    ).not.toThrow();
    expect(screen.getByText(/shared infrastructure/i)).toBeInTheDocument();
    expect(screen.getByText(/credentialed systems/i)).toBeInTheDocument();
  });

  it('does not crash in the editable/editing state either, with a list value', () => {
    expect(() =>
      render(
        <GraphView
          graph={makeGraph(['shared_infrastructure', 'credentialed_systems'])}
          editable
          onCorrect={vi.fn()}
        />,
      ),
    ).not.toThrow();
  });
});
