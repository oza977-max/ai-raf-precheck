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

  it('TC-UC-3-01: calls the Anthropic API with a forced tool_use and returns a correctly structured DataFlowGraph', async () => {
    localStorage.setItem('aigate:api-key', 'test-key');

    const result = await extractGraph('drafts client emails using relationship notes');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.input_nodes).toHaveLength(1);
      expect(result.value.processing_nodes).toHaveLength(1);
      expect(result.value.output_nodes).toHaveLength(1);
      expect(result.value.edges).toHaveLength(2);
      expect(result.value.intake_method).toBe('llm');
    }
  });

  it('TC-UC-3-02: preserves uncertain: true on nodes the LLM flagged as low-confidence', async () => {
    localStorage.setItem('aigate:api-key', 'test-key');

    const result = await extractGraph('drafts client emails');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.processing_nodes[0]?.uncertain).toBe(true);
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

  it('rejects a response whose node uses a near-miss value outside the canonical vocabulary', async () => {
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
