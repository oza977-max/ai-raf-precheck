import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GraphView from '../GraphView';
import type { DataFlowGraph } from '../../engine/types';

// R12-BD-1: the quote-affordance copy stops implying validation, and a
// confident-but-unverified field renders one combined marker rather than
// silence.
function makeGraph(): DataFlowGraph {
  return {
    id: 'g1',
    version: 1,
    intake_method: 'llm',
    extracted_at: '2026-01-01T00:00:00.000Z',
    input_nodes: [{ id: 'i1', label: 'credit risk data', data_class: 'Client PII', data_zone: 'Zone C' }],
    processing_nodes: [],
    output_nodes: [],
    edges: [],
    jurisdictions: [],
  };
}

describe('R12-BD-1 — badge recalibration', () => {
  it('TC-R12-BD-1-01: a quoted field carries a check-it-supports-the-value title, and still shows the quote', () => {
    render(
      <GraphView
        graph={makeGraph()}
        editable
        unconfirmedNodeIds={[]}
        onConfirmNode={vi.fn()}
        provenance={{ i1: { data_class: 'credit risk data' } }}
      />,
    );
    const basis = screen.getByText(/based on: “credit risk data”/);
    expect(basis).toHaveAttribute('title', expect.stringMatching(/found word-for-word.*check it supports the value/i));
  });

  it('TC-R12-BD-1-02: a field with no quote and not guessed (model not marked uncertain) renders the combined marker', () => {
    render(
      <GraphView
        graph={makeGraph()}
        editable
        unconfirmedNodeIds={[]}
        onConfirmNode={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/model confident — no verified basis/i).length).toBeGreaterThan(0);
  });

  it('TC-R12-BD-1-03: a quoted field does not also render the combined marker', () => {
    render(
      <GraphView
        graph={makeGraph()}
        editable
        unconfirmedNodeIds={[]}
        onConfirmNode={vi.fn()}
        provenance={{ i1: { data_class: 'credit risk data', data_zone: 'Zone C' } }}
      />,
    );
    expect(screen.queryByText(/model confident — no verified basis/i)).not.toBeInTheDocument();
  });
});
