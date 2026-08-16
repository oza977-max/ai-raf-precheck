import { describe, it, expect } from 'vitest';
import { plausibilityWarnings } from './plausibility';
import type { DataFlowGraph, InputNode, ProcessingNode, OutputNode } from './types';

function makeGraph(overrides: Partial<DataFlowGraph> = {}): DataFlowGraph {
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

function makeInput(overrides: Partial<InputNode> = {}): InputNode {
  return { id: 'i1', label: 'notes', data_class: 'Internal', data_zone: 'Zone C', ...overrides };
}

function makeProcessing(overrides: Partial<ProcessingNode> = {}): ProcessingNode {
  return {
    id: 'p1',
    label: 'model',
    model_type: 'ml',
    autonomy_level: 2,
    data_zone: 'Zone C',
    vendor: 'internal',
    replaces_prior_model: false,
    ...overrides,
  };
}

function makeOutput(overrides: Partial<OutputNode> = {}): OutputNode {
  return {
    id: 'o1',
    label: 'draft',
    action_type: 'draft',
    exposure: 'internal-only',
    decision_bindingness: 'non-binding',
    output_reversibility: 'reversible',
    scale: 'limited',
    hitl: true,
    ...overrides,
  };
}

describe('plausibilityWarnings', () => {
  // TC-R5-GR-4-01: internal-platform description vs Zone A/B node.
  it('TC-R5-GR-4-01a: fires when description sounds internal but node is Zone A (motivating live case)', () => {
    const g = makeGraph({
      processing_nodes: [makeProcessing({ id: 'p1', data_zone: 'Zone A' })],
    });
    const result = plausibilityWarnings('The drafting model runs on our approved internal platform.', g);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      node_id: 'p1',
      field: 'data_zone',
      message:
        "Your description sounds like internal systems, but this is marked Zone A (outside the firm). Check it — the zone drives several rules.",
    });
  });

  it('TC-R5-GR-4-01b: does not fire on a neutral description', () => {
    const g = makeGraph({
      processing_nodes: [makeProcessing({ id: 'p1', data_zone: 'Zone A' })],
    });
    const result = plausibilityWarnings('This tool drafts client emails.', g);
    expect(result).toEqual([]);
  });

  // TC-R5-GR-4-02: training language vs any output node.
  it('TC-R5-GR-4-02a: fires per output node when description mentions training (motivating live case)', () => {
    const g = makeGraph({
      output_nodes: [makeOutput({ id: 'o1' }), makeOutput({ id: 'o2' })],
    });
    const result = plausibilityWarnings(
      'train open source model on firms data. NLP to sql for risk analysts',
      g,
    );
    expect(result).toHaveLength(2);
    expect(result.map((w) => w.node_id)).toEqual(['o1', 'o2']);
    for (const w of result) {
      expect(w.field).toBe('action_type');
      expect(w.message).toMatch(/training is not an action type/i);
    }
  });

  it('TC-R5-GR-4-02b: does not fire on a neutral description', () => {
    const g = makeGraph({ output_nodes: [makeOutput({ id: 'o1' })] });
    const result = plausibilityWarnings('This tool summarizes emails for analysts.', g);
    expect(result).toEqual([]);
  });

  // TC-R5-GR-4-03: human-review language vs hitl===false output or autonomy_level>=3 processing.
  it('TC-R5-GR-4-03a: fires when description says a human reviews but output hitl is false', () => {
    const g = makeGraph({ output_nodes: [makeOutput({ id: 'o1', hitl: false })] });
    const result = plausibilityWarnings('Every recommendation is reviewed by a person before use.', g);
    expect(result).toHaveLength(1);
    expect(result[0]?.node_id).toBe('o1');
    expect(result[0]?.field).toBe('hitl');
  });

  it('TC-R5-GR-4-03b: fires when description says a human reviews but processing autonomy_level >= 3', () => {
    const g = makeGraph({ processing_nodes: [makeProcessing({ id: 'p1', autonomy_level: 3 })] });
    const result = plausibilityWarnings('A manager reviews every output before it goes out.', g);
    expect(result).toHaveLength(1);
    expect(result[0]?.node_id).toBe('p1');
    expect(result[0]?.field).toBe('autonomy_level');
  });

  it('TC-R5-GR-4-03c: does not fire on a neutral description', () => {
    const g = makeGraph({
      output_nodes: [makeOutput({ id: 'o1', hitl: false })],
      processing_nodes: [makeProcessing({ id: 'p1', autonomy_level: 4 })],
    });
    const result = plausibilityWarnings('This tool drafts client emails.', g);
    expect(result).toEqual([]);
  });

  // TC-R5-GR-4-04: autonomous language vs autonomy_level<=1 processing node.
  it('TC-R5-GR-4-04a: fires when description sounds autonomous but processing autonomy_level <= 1', () => {
    const g = makeGraph({ processing_nodes: [makeProcessing({ id: 'p1', autonomy_level: 1 })] });
    const result = plausibilityWarnings('This runs fully automated, without any human in the loop.', g);
    expect(result).toHaveLength(1);
    expect(result[0]?.node_id).toBe('p1');
    expect(result[0]?.field).toBe('autonomy_level');
  });

  it('TC-R5-GR-4-04b: does not fire on a neutral description', () => {
    const g = makeGraph({ processing_nodes: [makeProcessing({ id: 'p1', autonomy_level: 0 })] });
    const result = plausibilityWarnings('This tool drafts client emails.', g);
    expect(result).toEqual([]);
  });

  it('TC-R5-GR-4-05: never fires on an empty description', () => {
    const g = makeGraph({
      input_nodes: [makeInput({ id: 'i1', data_zone: 'Zone A' })],
      processing_nodes: [makeProcessing({ id: 'p1', autonomy_level: 4 })],
      output_nodes: [makeOutput({ id: 'o1', hitl: false })],
    });
    expect(plausibilityWarnings('', g)).toEqual([]);
  });

  it('TC-R5-GR-4-06: multiple signal pairs can fire together, in table order', () => {
    const g = makeGraph({
      processing_nodes: [makeProcessing({ id: 'p1', data_zone: 'Zone B', autonomy_level: 2 })],
      output_nodes: [makeOutput({ id: 'o1' })],
    });
    const result = plausibilityWarnings(
      'This runs on our own infrastructure and we train the model regularly.',
      g,
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.field).toBe('data_zone');
    expect(result[0]?.node_id).toBe('p1');
    expect(result[1]?.field).toBe('action_type');
    expect(result[1]?.node_id).toBe('o1');
  });
});
