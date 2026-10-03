import { describe, it, expect } from 'vitest';
import { formCorrections } from './form-corrections';
import { buildGraphFromForm } from '../engine/build-graph-from-form';
import type { StructuredFormValues } from '../engine/build-graph-from-form';
import type { DataFlowGraph, OutputNode, ProcessingNode } from '../engine/types';

// R16-D2 §5 (D-82, DR7-22). formCorrections() is a pure diff of two form-
// built graphs — never how a graph is evaluated. ids are injected
// (ctx.newId) so the tests can assert exactly which ids were minted.

const BASE_VALUES: StructuredFormValues = {
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

let counter = 0;
function ctx() {
  counter = 0;
  return {
    by: '1LoD',
    at: '2026-10-03T00:00:00.000Z',
    newId: () => `correction-${++counter}`,
  };
}

// B-15: buildGraphFromForm's timestamp is now a parameter — fixed here since
// nothing in this file's assertions depends on its value.
const TS = '2026-01-01T00:00:00.000Z';

function graph(overrides: Partial<StructuredFormValues> = {}): DataFlowGraph {
  return buildGraphFromForm({ ...BASE_VALUES, ...overrides }, TS, () => crypto.randomUUID());
}

describe('formCorrections — TC-R16-D2-10..18 (D-82, DR7-22)', () => {
  it('TC-R16-D2-10: two identical submissions produce no corrections at all', () => {
    const original = graph();
    const corrected = graph();
    expect(formCorrections(original, corrected, ctx())).toEqual([]);
  });

  it('TC-R16-D2-11: a changed processing-node field is recorded against the ORIGINAL node id, not the rebuilt graph\'s fresh one', () => {
    const original = graph({ modelType: 'llm' });
    const corrected = graph({ modelType: 'generative-ai' });
    expect(original.processing_nodes[0]!.id).not.toBe(corrected.processing_nodes[0]!.id);
    const corrections = formCorrections(original, corrected, ctx());
    expect(corrections).toEqual([
      expect.objectContaining({
        node_id: original.processing_nodes[0]!.id,
        field: 'model_type',
        original_value: 'llm',
        corrected_value: 'generative-ai',
        correction_source: 'form',
        corrected_by: '1LoD',
        corrected_at: '2026-10-03T00:00:00.000Z',
        correction_id: 'correction-1',
      }),
    ]);
  });

  it('TC-R16-D2-12: a changed output-node field is recorded against the original output node id', () => {
    const original = graph({ outputActionType: 'draft' });
    const corrected = graph({ outputActionType: 'recommend' });
    const corrections = formCorrections(original, corrected, ctx());
    expect(corrections).toEqual([
      expect.objectContaining({ node_id: original.output_nodes[0]!.id, field: 'action_type', original_value: 'draft', corrected_value: 'recommend' }),
    ]);
  });

  it('TC-R16-D2-13: a cleared optional field (declared_model_id) is recorded with corrected_value null, not undefined', () => {
    const original = graph({ declaredModelId: 'gpt-4o' });
    const corrected = graph({});
    expect(original.processing_nodes[0]!.declared_model_id).toBe('gpt-4o');
    expect(corrected.processing_nodes[0]!.declared_model_id).toBeUndefined();
    const corrections = formCorrections(original, corrected, ctx());
    const c = corrections.find((x) => x.field === 'declared_model_id');
    expect(c).toBeDefined();
    expect(c!.original_value).toBe('gpt-4o');
    expect(c!.corrected_value).toBeNull();
  });

  it('TC-R16-D2-13b: a field set FROM absent is recorded with original_value null (symmetric with clearing)', () => {
    const original = graph({});
    const corrected = graph({ platform: 'PLAT-X' });
    const corrections = formCorrections(original, corrected, ctx());
    const c = corrections.find((x) => x.field === 'platform');
    expect(c).toBeDefined();
    expect(c!.original_value).toBeNull();
    expect(c!.corrected_value).toBe('PLAT-X');
  });

  it('TC-R16-D2-14: inputs are diffed as ONE correction on node id "inputs", field "data_classes" — the sorted set, not a per-node id', () => {
    const original = graph({ inputDataClasses: ['Internal'] });
    const corrected = graph({ inputDataClasses: ['Client PII', 'Confidential'] });
    const corrections = formCorrections(original, corrected, ctx());
    const c = corrections.find((x) => x.node_id === 'inputs');
    expect(c).toEqual(
      expect.objectContaining({
        node_id: 'inputs',
        field: 'data_classes',
        original_value: ['Internal'],
        corrected_value: ['Client PII', 'Confidential'],
      }),
    );
  });

  it('TC-R16-D2-14b: ticking the SAME input classes in a different order is not a correction (sorted comparison)', () => {
    const original = graph({ inputDataClasses: ['Client PII', 'Confidential'] });
    const corrected = graph({ inputDataClasses: ['Confidential', 'Client PII'] });
    const corrections = formCorrections(original, corrected, ctx());
    expect(corrections.find((x) => x.node_id === 'inputs')).toBeUndefined();
  });

  it('TC-R16-D2-15: jurisdictions are diffed as one correction on node id "graph", field "jurisdictions"', () => {
    const original = graph({ jurisdictions: ['UK'] });
    const corrected = graph({ jurisdictions: ['UK', 'EU'] });
    const corrections = formCorrections(original, corrected, ctx());
    expect(corrections.find((x) => x.node_id === 'graph')).toEqual(
      expect.objectContaining({ node_id: 'graph', field: 'jurisdictions', original_value: ['UK'], corrected_value: ['EU', 'UK'] }),
    );
  });

  it('TC-R16-D2-15b: the same jurisdictions ticked in a different order is not a correction', () => {
    const original = graph({ jurisdictions: ['UK', 'EU'] });
    const corrected = graph({ jurisdictions: ['EU', 'UK'] });
    expect(formCorrections(original, corrected, ctx())).toEqual([]);
  });

  it('TC-R16-D2-16: several changed fields across processing, output, inputs and jurisdictions each produce their own correction, all against the same graph version pair', () => {
    const original = graph({ modelType: 'llm', outputActionType: 'draft', inputDataClasses: ['Internal'], jurisdictions: ['UK'] });
    const corrected = graph({ modelType: 'agentic', outputActionType: 'execute', inputDataClasses: ['Confidential'], jurisdictions: ['EU'] });
    const corrections = formCorrections(original, corrected, ctx());
    const fields = corrections.map((c) => c.field).sort();
    expect(fields).toEqual(['action_type', 'data_classes', 'jurisdictions', 'model_type'].sort());
    for (const c of corrections) {
      expect(c.graph_version_before).toBe(original.version);
      expect(c.graph_version_after).toBe(corrected.version);
      expect(c.correction_source).toBe('form');
    }
  });

  it('TC-R16-D2-17: never diffs node ids — two submissions that differ only because buildGraphFromForm minted fresh ids produce no spurious correction', () => {
    const original = graph();
    const corrected = graph();
    // Confirm the premise: every node id really did change between calls.
    expect(original.processing_nodes[0]!.id).not.toBe(corrected.processing_nodes[0]!.id);
    expect(original.output_nodes[0]!.id).not.toBe(corrected.output_nodes[0]!.id);
    expect(formCorrections(original, corrected, ctx())).toEqual([]);
  });

  // DR7-22's own fit criterion: the helper diffs EVERY ProcessingNode and
  // OutputNode key (bar `id`, which is never diffable by construction —
  // see the module comment). Hand-built node literals, not routed through
  // buildGraphFromForm, so every key — including ones the form itself
  // never varies independently (`label`, `uncertain`) — is exercised.
  const PROCESSING_NODE_BEFORE: ProcessingNode = {
    id: 'p-original',
    label: 'Before',
    model_type: 'llm',
    autonomy_level: 1,
    data_zone: 'Zone B',
    vendor: 'internal',
    platform: 'PLAT-A',
    replaces_prior_model: false,
    uncertain: false,
    declared_model_id: 'model-a',
    system_access_scope: 'none',
    multi_instance_coordination: 'no',
  };
  const PROCESSING_NODE_AFTER: ProcessingNode = {
    ...PROCESSING_NODE_BEFORE,
    id: 'p-rebuilt',
    label: 'After',
    model_type: 'generative-ai',
    autonomy_level: 2,
    data_zone: 'Zone C',
    vendor: 'VENDOR-X',
    platform: 'PLAT-B',
    replaces_prior_model: true,
    uncertain: true,
    declared_model_id: 'model-b',
    system_access_scope: 'deployment_authority',
    multi_instance_coordination: 'yes',
  };
  const OUTPUT_NODE_BEFORE: OutputNode = {
    id: 'o-original',
    label: 'Before',
    action_type: 'read',
    exposure: 'internal-only',
    decision_bindingness: 'non-binding',
    output_reversibility: 'reversible',
    scale: 'limited',
    decision_type: 'operational',
    decision_type_other: 'x',
    hitl: false,
  };
  const OUTPUT_NODE_AFTER: OutputNode = {
    ...OUTPUT_NODE_BEFORE,
    id: 'o-rebuilt',
    label: 'After',
    action_type: 'execute',
    exposure: 'market-facing',
    decision_bindingness: 'binding',
    output_reversibility: 'irreversible',
    scale: 'at_scale',
    decision_type: 'trading',
    decision_type_other: 'y',
    hitl: true,
  };

  function graphOf(processing: ProcessingNode, output: OutputNode, version: number): DataFlowGraph {
    return {
      id: 'g',
      version,
      input_nodes: [],
      processing_nodes: [processing],
      output_nodes: [output],
      edges: [],
      jurisdictions: [],
      intake_method: 'structured_form',
      extracted_at: '2026-01-01T00:00:00.000Z',
    };
  }

  const PROCESSING_KEYS = Object.keys(PROCESSING_NODE_BEFORE).filter((k) => k !== 'id') as Array<keyof ProcessingNode>;
  const OUTPUT_KEYS = Object.keys(OUTPUT_NODE_BEFORE).filter((k) => k !== 'id') as Array<keyof OutputNode>;

  it('TC-R16-D2-18: every ProcessingNode key (bar id) is diffed when changed alone', () => {
    for (const key of PROCESSING_KEYS) {
      const before = graphOf(PROCESSING_NODE_BEFORE, OUTPUT_NODE_BEFORE, 1);
      const after = graphOf({ ...PROCESSING_NODE_BEFORE, [key]: PROCESSING_NODE_AFTER[key] }, OUTPUT_NODE_BEFORE, 2);
      const corrections = formCorrections(before, after, ctx());
      expect(corrections, `key ${key}`).toHaveLength(1);
      expect(corrections[0]!.field, `key ${key}`).toBe(key);
      expect(corrections[0]!.node_id).toBe('p-original');
    }
  });

  it('TC-R16-D2-18b: every OutputNode key (bar id) is diffed when changed alone', () => {
    for (const key of OUTPUT_KEYS) {
      const before = graphOf(PROCESSING_NODE_BEFORE, OUTPUT_NODE_BEFORE, 1);
      const after = graphOf(PROCESSING_NODE_BEFORE, { ...OUTPUT_NODE_BEFORE, [key]: OUTPUT_NODE_AFTER[key] }, 2);
      const corrections = formCorrections(before, after, ctx());
      expect(corrections, `key ${key}`).toHaveLength(1);
      expect(corrections[0]!.field, `key ${key}`).toBe(key);
      expect(corrections[0]!.node_id).toBe('o-original');
    }
  });

  it('TC-R16-D2-18c: changing every key on both nodes at once reports exactly one correction per key — no cross-talk between processing and output', () => {
    const before = graphOf(PROCESSING_NODE_BEFORE, OUTPUT_NODE_BEFORE, 1);
    const after = graphOf(PROCESSING_NODE_AFTER, OUTPUT_NODE_AFTER, 2);
    const corrections = formCorrections(before, after, ctx());
    expect(corrections).toHaveLength(PROCESSING_KEYS.length + OUTPUT_KEYS.length);
    expect(new Set(corrections.map((c) => c.field))).toEqual(new Set([...PROCESSING_KEYS, ...OUTPUT_KEYS]));
  });
});
