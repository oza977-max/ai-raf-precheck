import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import VerdictDisplay from '../VerdictDisplay';
import type { Verdict } from '../../types/verdict';
import type { DataFlowGraph } from '../../engine/types';

// R16-C (§3, D-62). Chunk C owns graph-summary.ts AND its other reader,
// VerdictDisplay's "What you told us" record grid (graphSummaryRows() is
// the one shared source both ConfirmationStep and VerdictDisplay read —
// graph-summary.ts's own header comment). VerdictDisplay.tsx itself is
// untouched by this chunk (owned by chunk D1) — it already maps generically
// over whatever graphSummaryRows() returns, so proving the two-input case
// renders correctly here is a test addition only, not a VerdictDisplay
// source change.

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    status: 'approved_with_controls',
    tier: 'High',
    track: 'II',
    binding_constraint: 'INV-DATA-01',
    binding_path: 'client notes → drafting model → drafted email',
    controls: ['CTRL-ENC-01'],
    downstream_reviews: [],
    conditions: { hypotheses: [] },
    policy_version: '1.0',
    pack_versions: {},
    applied_overrides: [],
    confidence_caveats: [],
    provisional_reasons: [],
    boundary_proximity: false,
    margin_achieved: 0,
    margin_target: 0.1,
    single_covered_invariants: [],
    explanation: {
      tier_rationale: null,
      track_rationale: null,
      hard_lines_checked: 0,
      invariants_checked: 0,
      tripped_invariants: [],
      binding_reason: null,
      binding_regulatory_basis: null,
    },
    id: 'verdict-1',
    use_case_id: 'uc-1',
    living_status: 'approved',
    living_status_updated_at: '2026-01-01T00:00:00.000Z',
    attested_by: '1LoD',
    attested_at: '2026-01-01T00:00:00.000Z',
    graph_version: 1,
    corrections: [],
    ...overrides,
  };
}

const TWO_INPUT_GRAPH: DataFlowGraph = {
  id: 'g1',
  version: 1,
  input_nodes: [
    { id: 'i1', label: 'Client notes', data_class: 'Client PII', data_zone: 'Zone B' },
    { id: 'i2', label: 'Deal documents', data_class: 'MNPI', data_zone: 'Zone B' },
  ],
  processing_nodes: [
    {
      id: 'p1',
      label: 'Drafting model',
      model_type: 'llm',
      autonomy_level: 1,
      data_zone: 'Zone B',
      vendor: 'internal',
      replaces_prior_model: false,
    },
  ],
  output_nodes: [
    {
      id: 'o1',
      label: 'Draft email',
      action_type: 'draft',
      exposure: 'internal-only',
      decision_bindingness: 'advisory',
      output_reversibility: 'reversible',
      scale: 'limited',
    },
  ],
  edges: [
    { from: 'i1', to: 'p1' },
    { from: 'i2', to: 'p1' },
    { from: 'p1', to: 'o1' },
  ],
  jurisdictions: ['UK'],
  intake_method: 'structured_form',
  extracted_at: '2026-01-01T00:00:00.000Z',
};

describe('VerdictDisplay — "What you told us" record grid lists every input node (TC-R16-C-02)', () => {
  it('TC-R16-C-02: a two-input graph renders two "Input data" rows, one per node', () => {
    render(
      <VerdictDisplay verdict={makeVerdict()} auditEvents={[]} onCorrect={vi.fn()} graph={TWO_INPUT_GRAPH} />,
    );
    expect(screen.getByText(/Client notes · Personal details of clients · Client PII/)).toBeInTheDocument();
    expect(
      screen.getByText(/Deal documents · Price-sensitive information · MNPI/),
    ).toBeInTheDocument();
    expect(screen.getByText('Input data 1')).toBeInTheDocument();
    expect(screen.getByText('Input data 2')).toBeInTheDocument();
  });

  it('a single-input graph keeps the unnumbered "Input data" label, unchanged', () => {
    const singleInput: DataFlowGraph = { ...TWO_INPUT_GRAPH, input_nodes: [TWO_INPUT_GRAPH.input_nodes[0]!] };
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} onCorrect={vi.fn()} graph={singleInput} />);
    expect(screen.getByText('Input data')).toBeInTheDocument();
    expect(screen.queryByText('Input data 1')).not.toBeInTheDocument();
  });
});
