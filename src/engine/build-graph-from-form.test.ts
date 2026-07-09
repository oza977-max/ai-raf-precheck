import { describe, it, expect } from 'vitest';
import { buildGraphFromForm } from './build-graph-from-form';
import type { StructuredFormValues } from './build-graph-from-form';

const VALID_VALUES: StructuredFormValues = {
  useCaseName: 'Client email drafting tool',
  description: 'Drafts client emails from relationship manager notes.',
  inputDataClass: 'Client PII',
  inputDataZone: 'Zone B',
  modelType: 'llm',
  autonomyLevel: 1,
  processingDataZone: 'Zone B',
  outputActionType: 'draft',
  outputExposure: 'internal-only',
  decisionBindingness: 'non-binding',
  outputReversibility: 'reversible',
  outputScale: 'limited',
  replacesPriorModel: false,
  jurisdictions: ['UK'],
};

describe('buildGraphFromForm', () => {
  it('TC-UC-3a-01: produces a valid DataFlowGraph with one node per category', () => {
    const graph = buildGraphFromForm(VALID_VALUES);

    expect(graph.input_nodes).toHaveLength(1);
    expect(graph.processing_nodes).toHaveLength(1);
    expect(graph.output_nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(2);
    expect(graph.input_nodes[0]?.data_class).toBe('Client PII');
    expect(graph.processing_nodes[0]?.model_type).toBe('llm');
    expect(graph.output_nodes[0]?.action_type).toBe('draft');
  });

  it('TC-UC-3a-02: sets intake_method to structured_form', () => {
    const graph = buildGraphFromForm(VALID_VALUES);
    expect(graph.intake_method).toBe('structured_form');
  });

  it('carries jurisdictions through unchanged', () => {
    const graph = buildGraphFromForm({ ...VALID_VALUES, jurisdictions: ['UK', 'US'] });
    expect(graph.jurisdictions).toEqual(['UK', 'US']);
  });

  it('connects nodes with edges in input → processing → output order', () => {
    const graph = buildGraphFromForm(VALID_VALUES);
    const [inputId] = graph.input_nodes.map((n) => n.id);
    const [processingId] = graph.processing_nodes.map((n) => n.id);
    const [outputId] = graph.output_nodes.map((n) => n.id);
    expect(graph.edges).toEqual([
      { from: inputId, to: processingId },
      { from: processingId, to: outputId },
    ]);
  });
});
