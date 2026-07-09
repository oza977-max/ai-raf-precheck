import { describe, it, expect } from 'vitest';
import { intakeReducer } from './intake-state';
import type { IntakeState } from './intake-state';
import type { DataFlowGraph, GraphCorrection } from '../engine/types';

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

describe('intakeReducer', () => {
  it('description_entry → description_entry on DESCRIPTION_CHANGED', () => {
    const state: IntakeState = { step: 'description_entry', description: '' };
    const next = intakeReducer(state, { type: 'DESCRIPTION_CHANGED', description: 'a new AI tool' });
    expect(next).toEqual({ step: 'description_entry', description: 'a new AI tool' });
  });

  it('description_entry → duplicate_check on SUBMIT_DESCRIPTION', () => {
    const state: IntakeState = { step: 'description_entry', description: 'a new AI tool' };
    const next = intakeReducer(state, { type: 'SUBMIT_DESCRIPTION' });
    expect(next).toEqual({ step: 'duplicate_check', description: 'a new AI tool' });
  });

  it('duplicate_check → graph_extraction on NO_DUPLICATE_FOUND', () => {
    const state: IntakeState = { step: 'duplicate_check', description: 'x' };
    const next = intakeReducer(state, { type: 'NO_DUPLICATE_FOUND' });
    expect(next).toEqual({ step: 'graph_extraction', description: 'x', method: 'llm' });
  });

  it('graph_extraction → graph_review on GRAPH_EXTRACTED, carrying the graph version', () => {
    const state: IntakeState = { step: 'graph_extraction', description: 'x', method: 'llm' };
    const g = graph({ version: 1 });
    const next = intakeReducer(state, { type: 'GRAPH_EXTRACTED', graph: g });
    expect(next).toEqual({ step: 'graph_review', graph: g, graphVersion: 1, corrections: [] });
  });

  it('graph_review → graph_review on CORRECTION_APPLIED, appending the correction and bumping graphVersion', () => {
    const g0 = graph({ version: 1 });
    const state: IntakeState = { step: 'graph_review', graph: g0, graphVersion: 1, corrections: [] };
    const g1 = graph({ version: 2 });
    const correction: GraphCorrection = {
      correction_id: 'c1',
      graph_version_before: 1,
      graph_version_after: 2,
      node_id: 'n1',
      field: 'data_class',
      original_value: 'Internal',
      corrected_value: 'Confidential',
      corrected_by: '1LoD',
      corrected_at: '2026-01-01T00:00:00.000Z',
    };
    const next = intakeReducer(state, { type: 'CORRECTION_APPLIED', correction, updatedGraph: g1 });
    expect(next).toEqual({ step: 'graph_review', graph: g1, graphVersion: 2, corrections: [correction] });
  });

  it('graph_review → evaluation_pending on PROCEED_TO_EVALUATION_PASSTHROUGH (documented P4-C01/P4-C04 boundary)', () => {
    const g = graph({ version: 1 });
    const state: IntakeState = { step: 'graph_review', graph: g, graphVersion: 1, corrections: [] };
    const next = intakeReducer(state, { type: 'PROCEED_TO_EVALUATION_PASSTHROUGH' });
    expect(next).toEqual({ step: 'evaluation_pending', graph: g });
  });

  it('evaluation_pending → verdict on VERDICT_READY', () => {
    const g = graph();
    const state: IntakeState = { step: 'evaluation_pending', graph: g };
    const next = intakeReducer(state, { type: 'VERDICT_READY', verdictId: 'v1' });
    expect(next).toEqual({ step: 'verdict', verdictId: 'v1' });
  });

  it('ignores an action that does not apply to the current state (exhaustive guard)', () => {
    const state: IntakeState = { step: 'description_entry', description: 'x' };
    const next = intakeReducer(state, { type: 'NO_DUPLICATE_FOUND' });
    expect(next).toBe(state);
  });
});
