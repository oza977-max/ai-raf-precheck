import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractGraph } from './graph-extractor';

const MOCK_GRAPH_INPUT = {
  input_nodes: [{ id: 'i1', label: 'client relationship notes', data_class: 'Client PII', data_zone: 'Zone B' }],
  processing_nodes: [
    {
      id: 'p1',
      label: 'GPT-4 based email drafting model',
      model_type: 'llm',
      autonomy_level: 1,
      data_zone: 'Zone B',
      vendor: 'azure-openai-internal',
      replaces_prior_model: false,
      uncertain: true,
    },
  ],
  output_nodes: [
    {
      id: 'o1',
      label: 'drafted email',
      action_type: 'draft',
      exposure: 'internal-only',
      decision_bindingness: 'non-binding',
      output_reversibility: 'reversible',
      scale: 'limited',
    },
  ],
  edges: [{ from: 'i1', to: 'p1' }, { from: 'p1', to: 'o1' }],
  jurisdictions: [],
};

// Shared, hoisted mock fn so every `new Anthropic()` instance (one per
// extractGraph() call) reuses the same mock — required for per-test
// mockResolvedValueOnce overrides to actually take effect.
const mockCreate = vi.fn().mockResolvedValue({
  content: [{ type: 'tool_use', name: 'extract_graph', input: MOCK_GRAPH_INPUT }],
});

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

describe('extractGraph', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('TC-UC-3-01: calls the Anthropic API with a forced tool_use and returns a correctly structured DataFlowGraph [TC-UC-3-03]', async () => {
    localStorage.setItem('aigate:api-key', 'test-key');

    const result = await extractGraph('drafts client emails using relationship notes');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.graph.input_nodes).toHaveLength(1);
      expect(result.value.graph.processing_nodes).toHaveLength(1);
      expect(result.value.graph.output_nodes).toHaveLength(1);
      expect(result.value.graph.edges).toHaveLength(2);
      expect(result.value.graph.intake_method).toBe('llm');
    }
  });

  it('TC-UC-3-02: preserves uncertain: true on nodes the LLM flagged as low-confidence', async () => {
    localStorage.setItem('aigate:api-key', 'test-key');

    const result = await extractGraph('drafts client emails');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.graph.processing_nodes[0]?.uncertain).toBe(true);
    }
  });

  it('returns no-api-key error cleanly when no key is configured', async () => {
    const result = await extractGraph('drafts client emails');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('no-api-key');
  });
});

describe('extractGraph — response validation (P4-C01 review finding: real Zod validation, not loose array checks)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('aigate:api-key', 'test-key');
  });

  it('rejects a response whose node uses a near-miss value outside the canonical vocabulary [TC-UC-3-04]', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'extract_graph',
          input: {
            ...MOCK_GRAPH_INPUT,
            input_nodes: [{ id: 'i1', label: 'notes', data_class: 'PII', data_zone: 'Zone B' }],
          },
        },
      ],
    });

    const result = await extractGraph('a use case with a malformed field');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('parse-error');
  });

  it('rejects a response missing required node fields', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'extract_graph',
          input: { ...MOCK_GRAPH_INPUT, processing_nodes: [{ id: 'p1', label: 'incomplete node' }] },
        },
      ],
    });

    const result = await extractGraph('a use case with a missing field');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('parse-error');
  });
});

// Local-provider dispatch (2026-08-16). extractGraph's provider ranking:
// Anthropic key wins; with no key but a configured local model, the local
// path runs — and its output passes through the SAME Zod gate, so a local
// model emitting off-vocabulary values fails to parse-error exactly as the
// Claude path would (the gate is the door, whoever knocks).
describe('extractGraph — local open-model provider dispatch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    // The Anthropic mock is shared across this file; clear its history so
    // "the SDK was not called" means THIS test, not the file so far.
    mockCreate.mockClear();
  });

  function stubLocal(content: string) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('aigate:local-llm-url', 'http://localhost:11434');
    localStorage.setItem('aigate:local-llm-model', 'qwen3:4b');
    return fetchMock;
  }

  it('with no key and a local model configured, extracts through the local provider', async () => {
    const fetchMock = stubLocal(JSON.stringify(MOCK_GRAPH_INPUT));

    const result = await extractGraph('drafts client emails using relationship notes');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.graph.intake_method).toBe('llm');
      expect(result.value.graph.input_nodes[0]?.data_class).toBe('Client PII');
    }
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('a saved Anthropic key outranks the local model', async () => {
    const fetchMock = stubLocal(JSON.stringify(MOCK_GRAPH_INPUT));
    localStorage.setItem('aigate:api-key', 'test-key');

    const result = await extractGraph('drafts client emails');

    expect(result.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('off-vocabulary local output fails the Zod gate as parse-error, never reaching the engine', async () => {
    const bad = { ...MOCK_GRAPH_INPUT, input_nodes: [{ id: 'i1', label: 'x', data_class: 'PII', data_zone: 'Zone B' }] };
    stubLocal(JSON.stringify(bad));

    const result = await extractGraph('drafts client emails');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('parse-error');
  });

  it('with neither key nor local model, still returns no-api-key', async () => {
    const result = await extractGraph('drafts client emails');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('no-api-key');
  });
});
