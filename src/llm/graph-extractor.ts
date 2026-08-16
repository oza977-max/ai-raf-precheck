import { z } from 'zod';
import { getApiKey, createClient } from './client';
import { localChatJson, localLlmEnabled } from './local-provider';
import type { LlmResult } from './types';
import type { DataFlowGraph } from '../engine/types';
import {
  ACTION_TYPES,
  DATA_CLASSES,
  DATA_ZONES,
  DECISION_BINDINGNESS,
  DECISION_TYPES,
  EXPOSURES,
  MODEL_TYPES,
} from '../engine/canonical-vocabulary';

// Rule 2 (cross-cutting.md §7): src/llm/* is the ONLY place the Anthropic SDK is imported.
//
// Deviation from intake-flow.md §4.1's literal signature: the spec passes a
// `policyPermittedValues` parameter, but the canonical vocabulary
// (policy-schema.md §3.0) is a fixed closed enum set, not derived from a
// per-policy loaded file — so it's baked directly into the tool schema
// below rather than threaded through as an argument. Flagged in the P4-C01
// handover as a product-facing deviation, not just an implementation note:
// a bank that wants to restrict vocabulary further than the canonical set
// (e.g. disallow `agentic` model types firm-wide) cannot do so via policy
// today — that would require this function to accept policy-scoped
// permitted values, a real future requirement, not addressed here.

const EXTRACT_GRAPH_SCHEMA = {
  type: 'object',
  properties: {
    input_nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          data_class: { type: 'string', enum: DATA_CLASSES },
          data_zone: { type: 'string', enum: DATA_ZONES },
        },
        required: ['id', 'label', 'data_class', 'data_zone'],
      },
    },
    processing_nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          model_type: { type: 'string', enum: MODEL_TYPES },
          autonomy_level: { type: 'integer', minimum: 0, maximum: 4 },
          data_zone: { type: 'string', enum: DATA_ZONES },
          vendor: { type: 'string' },
          replaces_prior_model: { type: 'boolean' },
          uncertain: { type: 'boolean' },
        },
        required: ['id', 'label', 'model_type', 'autonomy_level', 'data_zone', 'vendor', 'replaces_prior_model'],
      },
    },
    output_nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          action_type: { type: 'string', enum: ACTION_TYPES },
          exposure: { type: 'string', enum: EXPOSURES },
          decision_bindingness: { type: 'string', enum: DECISION_BINDINGNESS },
          output_reversibility: { type: 'string', enum: ['reversible', 'irreversible', 'unknown'] },
          scale: { type: 'string', enum: ['limited', 'at_scale'] },
          decision_type: { type: 'string', enum: DECISION_TYPES },
          hitl: { type: 'boolean' },
        },
        required: ['id', 'label', 'action_type', 'exposure', 'decision_bindingness', 'output_reversibility', 'scale'],
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' } },
        required: ['from', 'to'],
      },
    },
    jurisdictions: { type: 'array', items: { type: 'string' } },
  },
  required: ['input_nodes', 'processing_nodes', 'output_nodes', 'edges', 'jurisdictions'],
} as const;

function buildExtractionPrompt(description: string): string {
  return [
    'Extract a structured data-flow graph from this AI use case description.',
    'Use ONLY the permitted enum values in the tool schema for classified fields.',
    'If you cannot determine a field with confidence from the description, set',
    'uncertain: true on that node and make a reasonable best-guess value anyway',
    '(the value is still required, but flag your confidence).',
    '',
    `Description: ${description}`,
  ].join('\n');
}

// Real Zod schema (intake-flow.md §4.4 mandates one) — the API's tool_choice
// forcing is best-effort model steering, not a hard contract; a model can
// still emit a near-miss value ("PII" instead of "Client PII") that the
// hand-written JSON schema merely discouraged. This is the actual gate:
// anything outside the canonical vocabulary fails parsing and returns
// parse-error, never silently reaches evaluate() with wrong-shaped data
// (P4-C01 review finding #1).
const InputNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  data_class: z.enum(DATA_CLASSES as [string, ...string[]]),
  data_zone: z.enum(DATA_ZONES as [string, ...string[]]),
});

const ProcessingNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  model_type: z.enum(MODEL_TYPES as [string, ...string[]]),
  autonomy_level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  data_zone: z.enum(DATA_ZONES as [string, ...string[]]),
  vendor: z.string(),
  replaces_prior_model: z.boolean(),
  uncertain: z.boolean().optional(),
});

const OutputNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  action_type: z.enum(ACTION_TYPES as [string, ...string[]]),
  exposure: z.enum(EXPOSURES as [string, ...string[]]),
  decision_bindingness: z.enum(DECISION_BINDINGNESS as [string, ...string[]]),
  output_reversibility: z.enum(['reversible', 'irreversible', 'unknown']),
  scale: z.enum(['limited', 'at_scale']),
  decision_type: z.enum(DECISION_TYPES as [string, ...string[]]).optional(),
  hitl: z.boolean().optional(),
});

const GraphEdgeSchema = z.object({ from: z.string(), to: z.string() });

const ExtractedGraphSchema = z.object({
  input_nodes: z.array(InputNodeSchema),
  processing_nodes: z.array(ProcessingNodeSchema),
  output_nodes: z.array(OutputNodeSchema),
  edges: z.array(GraphEdgeSchema),
  jurisdictions: z.array(z.string()),
});

function parseDataFlowGraph(input: unknown): DataFlowGraph | null {
  const result = ExtractedGraphSchema.safeParse(input);
  if (!result.success) return null;
  // Zod's z.enum(...) infers each enum field as the widened `string` type
  // (the runtime arrays aren't `as const` tuples), so result.data's static
  // type is looser than DataFlowGraph's literal unions even though every
  // value has already been checked at runtime against the exact same
  // canonical-vocabulary arrays. The cast below is a typing formality, not
  // a validation bypass — real runtime enum checking already happened above.
  return {
    id: crypto.randomUUID(),
    version: 1,
    ...(result.data as unknown as Omit<DataFlowGraph, 'id' | 'version' | 'intake_method' | 'extracted_at'>),
    intake_method: 'llm',
    extracted_at: new Date().toISOString(),
  };
}

export async function extractGraph(description: string): Promise<LlmResult<DataFlowGraph>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    // Provider order is a deliberate ranking, not a race: a saved Anthropic
    // key wins (stronger extractor), then a configured local open model
    // (free, on-device), then the guided form (no LLM at all). Both LLM
    // paths exit through the SAME Zod gate below — the local provider's
    // decoder-level schema guarantees shape, but only parseDataFlowGraph
    // guarantees the canonical vocabulary, and nothing reaches evaluate()
    // without it.
    if (localLlmEnabled()) {
      const raw = await localChatJson(buildExtractionPrompt(description), EXTRACT_GRAPH_SCHEMA);
      if (!raw.ok) return raw;
      const graph = parseDataFlowGraph(raw.value);
      if (!graph) return { ok: false, error: { kind: 'parse-error', raw: raw.value } };
      return { ok: true, value: graph };
    }
    return { ok: false, error: { kind: 'no-api-key' } };
  }

  try {
    const client = createClient(apiKey);
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      tools: [
        {
          name: 'extract_graph',
          description: 'Extract a structured data-flow graph from an AI use case description',
          input_schema: EXTRACT_GRAPH_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: 'extract_graph' },
      messages: [{ role: 'user', content: buildExtractionPrompt(description) }],
    });

    const toolUseBlock = response.content.find(
      (block): block is Extract<typeof block, { type: 'tool_use' }> => block.type === 'tool_use',
    );

    if (!toolUseBlock) {
      return { ok: false, error: { kind: 'parse-error', raw: response } };
    }

    const graph = parseDataFlowGraph(toolUseBlock.input);
    if (!graph) {
      return { ok: false, error: { kind: 'parse-error', raw: response } };
    }

    return { ok: true, value: graph };
  } catch (err) {
    return { ok: false, error: { kind: 'network-error', message: err instanceof Error ? err.message : String(err) } };
  }
}
