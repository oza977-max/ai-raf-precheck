// UC-2 duplicate detection — keyword-overlap fallback, always available
// (no LLM, no I/O). Pure island, same rule as the rest of src/engine/*.

export interface DuplicateCandidate {
  id: string;
  score: number;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Threshold 0.4 — documented judgment call (spec doesn't name a precise
// value); tuned to catch near-duplicate descriptions without false-flagging
// unrelated use cases that merely share common words.
const DUPLICATE_THRESHOLD = 0.4;

export function findPossibleDuplicates(
  description: string,
  existing: Array<{ id: string; label: string }>,
): DuplicateCandidate[] {
  const descriptionTokens = tokenize(description);
  return existing
    .map((entry) => ({ id: entry.id, score: jaccard(descriptionTokens, tokenize(entry.label)) }))
    .filter((candidate) => candidate.score >= DUPLICATE_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}
