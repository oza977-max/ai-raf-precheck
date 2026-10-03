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

// B-15: the timestamp is now a required parameter (see below) — this fixed
// value is passed to every pre-existing call in this file so none of them
// depend on the removed internal clock.
const TS = '2026-01-01T00:00:00.000Z';

describe('buildGraphFromForm', () => {
  // R16-A1 (PE-9 §1.1): buildGraphFromForm accepts a list for
  // systemAccessScope and runs it through normaliseAccessScope — the single
  // implementation of the validate/canonicalise rule.
  it('TC-R16-A1-18: a single systemAccessScope value is stored unchanged (shape preserved)', () => {
    const graph = buildGraphFromForm({ ...VALID_VALUES, systemAccessScope: 'shared_infrastructure' }, TS);
    expect(graph.processing_nodes[0]?.system_access_scope).toBe('shared_infrastructure');
  });

  it('TC-R16-A1-19: a list of systemAccessScope values is stored in canonical order, regardless of tick order', () => {
    const a = buildGraphFromForm(
      { ...VALID_VALUES, systemAccessScope: ['deployment_authority', 'shared_infrastructure'] },
      TS,
    );
    const b = buildGraphFromForm(
      { ...VALID_VALUES, systemAccessScope: ['shared_infrastructure', 'deployment_authority'] },
      TS,
    );
    expect(a.processing_nodes[0]?.system_access_scope).toEqual(['shared_infrastructure', 'deployment_authority']);
    // Shuffled ticks produce a byte-identical graph on every field OTHER
    // than the random id field buildGraphFromForm itself mints.
    expect(a.processing_nodes[0]?.system_access_scope).toEqual(b.processing_nodes[0]?.system_access_scope);
  });

  it('TC-R16-A1-20: an invalid systemAccessScope (e.g. "none" combined with another value) is omitted, not fabricated', () => {
    const graph = buildGraphFromForm({ ...VALID_VALUES, systemAccessScope: ['none', 'shared_infrastructure'] }, TS);
    expect(graph.processing_nodes[0]?.system_access_scope).toBeUndefined();
  });

  it('omits systemAccessScope entirely when not stated (absence is not a claim)', () => {
    const graph = buildGraphFromForm(VALID_VALUES, TS);
    expect('system_access_scope' in graph.processing_nodes[0]!).toBe(false);
  });

  it('TC-UC-3a-01: produces a valid DataFlowGraph with one node per category', () => {
    const graph = buildGraphFromForm(VALID_VALUES, TS);

    expect(graph.input_nodes).toHaveLength(1);
    expect(graph.processing_nodes).toHaveLength(1);
    expect(graph.output_nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(2);
    expect(graph.input_nodes[0]?.data_class).toBe('Client PII');
    expect(graph.processing_nodes[0]?.model_type).toBe('llm');
    expect(graph.output_nodes[0]?.action_type).toBe('draft');
  });

  it('TC-UC-3a-02: sets intake_method to structured_form', () => {
    const graph = buildGraphFromForm(VALID_VALUES, TS);
    expect(graph.intake_method).toBe('structured_form');
  });

  it('carries jurisdictions through unchanged', () => {
    const graph = buildGraphFromForm({ ...VALID_VALUES, jurisdictions: ['UK', 'US'] }, TS);
    expect(graph.jurisdictions).toEqual(['UK', 'US']);
  });

  it('connects nodes with edges in input → processing → output order', () => {
    const graph = buildGraphFromForm(VALID_VALUES, TS);
    const [inputId] = graph.input_nodes.map((n) => n.id);
    const [processingId] = graph.processing_nodes.map((n) => n.id);
    const [outputId] = graph.output_nodes.map((n) => n.id);
    expect(graph.edges).toEqual([
      { from: inputId, to: processingId },
      { from: processingId, to: outputId },
    ]);
  });

  // B-15 (clock call inside the engine). buildGraphFromForm minted its own
  // `new Date().toISOString()` — a real I/O-adjacent call inside src/engine/*,
  // which cross-cutting.md §7 Rule 1 forbids (no Date.now() anywhere in the
  // engine's call graph). The timestamp is now a parameter; every caller
  // mints it and passes it in.
  it('TC-CR6-B15: extracted_at is exactly the timestamp parameter, not the engine\'s own clock — identical inputs + timestamp produce an identical graph', () => {
    const ts = '2020-01-01T00:00:00.000Z';
    const a = buildGraphFromForm(VALID_VALUES, ts);
    expect(a.extracted_at).toBe(ts);

    const otherTs = '2031-06-15T12:00:00.000Z';
    const b = buildGraphFromForm(VALID_VALUES, otherTs);
    expect(b.extracted_at).toBe(otherTs);

    // Identical inputs + identical timestamp -> identical extracted_at
    // (ids are still randomised per call, same as before this fix — only
    // the timestamp's SOURCE changed, not the graph's other determinism
    // properties).
    const c = buildGraphFromForm(VALID_VALUES, ts);
    expect(c.extracted_at).toBe(a.extracted_at);
  });
});
