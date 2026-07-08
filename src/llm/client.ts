import Anthropic from '@anthropic-ai/sdk';

// Rule 2 (cross-cutting.md §7): src/llm/* is the ONLY place the Anthropic SDK is imported.
// Key management (cross-cutting.md §9): read from localStorage at call time, never in
// React state, never hardcoded.

export function getApiKey(): string | null {
  return localStorage.getItem('aigate:api-key');
}

export function createClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true, // deliberate — user's key choice determines data handling
  });
}
