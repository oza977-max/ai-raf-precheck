import { getApiKey, createClient } from './client';
import type { LlmResult } from './types';

interface GraphSkeleton {
  summary: string;
}

// Trivial skeleton extraction — proves the Anthropic boundary is real and wired,
// not real parsing logic. The full DataFlowGraph JSON schema (intake-flow.md §4.2)
// is P4-C01's job.
export async function extractGraphSkeleton(description: string): Promise<LlmResult<GraphSkeleton>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, error: { kind: 'no-api-key' } };
  }

  try {
    const client = createClient(apiKey);
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      tools: [
        {
          name: 'extract_graph_skeleton',
          description: 'Trivial skeleton extraction — proves the boundary, not real parsing logic',
          input_schema: {
            type: 'object',
            properties: { summary: { type: 'string' } },
            required: ['summary'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'extract_graph_skeleton' },
      messages: [{ role: 'user', content: description }],
    });

    const toolUseBlock = response.content.find(
      (block): block is Extract<typeof block, { type: 'tool_use' }> => block.type === 'tool_use'
    );

    if (!toolUseBlock || typeof toolUseBlock.input !== 'object' || toolUseBlock.input === null) {
      return { ok: false, error: { kind: 'parse-error', raw: response } };
    }

    const input = toolUseBlock.input as Record<string, unknown>;
    if (typeof input.summary !== 'string') {
      return { ok: false, error: { kind: 'parse-error', raw: response } };
    }

    return { ok: true, value: { summary: input.summary } };
  } catch (err) {
    return { ok: false, error: { kind: 'network-error', message: err instanceof Error ? err.message : String(err) } };
  }
}
