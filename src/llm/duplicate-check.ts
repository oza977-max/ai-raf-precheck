import { getApiKey, createClient } from './client';

// UC-2 semantic confirmation — only called when src/engine/duplicate.ts's
// keyword-overlap fallback already flagged a candidate. This is a
// confirmation step on top of the always-available fallback, not a
// replacement for it (rule 2, cross-cutting.md §7 — src/llm/* is the only
// Anthropic SDK importer).
export async function confirmSemanticDuplicate(description: string, candidateLabel: string): Promise<boolean> {
  const apiKey = getApiKey();
  if (!apiKey) return false;

  try {
    const client = createClient(apiKey);
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 64,
      tools: [
        {
          name: 'confirm_duplicate',
          description: 'Report whether two AI use case descriptions describe the same underlying use case',
          input_schema: {
            type: 'object',
            properties: { is_duplicate: { type: 'boolean' } },
            required: ['is_duplicate'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'confirm_duplicate' },
      messages: [
        {
          role: 'user',
          content: `Description A: ${description}\n\nDescription B: ${candidateLabel}\n\nDo these describe the same underlying AI use case?`,
        },
      ],
    });

    const toolUseBlock = response.content.find(
      (block): block is Extract<typeof block, { type: 'tool_use' }> => block.type === 'tool_use',
    );
    if (!toolUseBlock || typeof toolUseBlock.input !== 'object' || toolUseBlock.input === null) return false;
    const input = toolUseBlock.input as Record<string, unknown>;
    return input.is_duplicate === true;
  } catch {
    // Confirmation is an enhancement on top of the keyword fallback — a
    // network/parse failure here must not block intake, just skip confirmation.
    return false;
  }
}
