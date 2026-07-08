import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractGraphSkeleton } from './graph-extractor';

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'tool_use',
              name: 'extract_graph_skeleton',
              input: { summary: 'Skeleton extraction of: drafts client emails' },
            },
          ],
        }),
      };
    },
  };
});

describe('extractGraphSkeleton', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Happy path: real tool_use call shape, parsed structured response.
  it('calls the Anthropic API with a forced tool_use and returns the parsed summary', async () => {
    localStorage.setItem('aigate:api-key', 'test-key');

    const result = await extractGraphSkeleton('drafts client emails');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary).toContain('drafts client emails');
    }
  });

  // Realistic-fixture variant (TDD-3, "API" domain: missing required credential).
  // Must return a clean Result, not throw — this is the UC-3a fallback signal.
  it('returns no-api-key error cleanly when no key is configured (realistic-fixture variant)', async () => {
    const result = await extractGraphSkeleton('drafts client emails');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('no-api-key');
    }
  });
});
