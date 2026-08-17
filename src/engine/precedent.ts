// R8-SC (requirements-008, intake-flow.md §18): similar DECIDED cases —
// the corpus-as-moat first slice. Pure island: token-overlap ranking over
// caller-supplied summaries, no store, no I/O, no model. Deliberately the
// duplicate check's own idiom (duplicate.ts), because a precedent the firm
// can audit beats a smarter one it cannot: every match is explainable as
// "these words overlap".

export interface PrecedentCandidate {
  id: string;
  label: string;
  description?: string;
  /** Raw verdict status enum — translated to appetite vocabulary ONLY at
   *  render time (the enum words are reserved on the intake path). */
  status: 'approved' | 'approved_with_controls' | 'rejected';
  tier: string | null;
  track: string | null;
  decided_at: string | null;
  policy_version: string | null;
}

export interface PrecedentMatch extends PrecedentCandidate {
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

// Lower than the duplicate threshold (0.4): a precedent is USEFULLY similar
// well before it is a suspected duplicate. Above zero to keep noise out.
const PRECEDENT_THRESHOLD = 0.15;
const MAX_PRECEDENTS = 3;

/** Rank decided cases by textual similarity to the case under review.
 *  Deterministic: ties break by id. `selfId` is never its own precedent. */
export function findPrecedents(
  subject: { label: string; description?: string },
  candidates: PrecedentCandidate[],
  selfId?: string,
): PrecedentMatch[] {
  const subjectTokens = tokenize(`${subject.label} ${subject.description ?? ''}`);
  return candidates
    .filter((c) => c.id !== selfId)
    .map((c) => ({ ...c, score: jaccard(subjectTokens, tokenize(`${c.label} ${c.description ?? ''}`)) }))
    .filter((c) => c.score >= PRECEDENT_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, MAX_PRECEDENTS);
}
