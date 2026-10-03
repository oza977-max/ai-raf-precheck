import { useState } from 'react';
import type { Contradiction } from '../engine/types';

// UC-5 (intake-flow.md §7). Rule 4 (cross-cutting.md §7): presentation-only.
// The flow cannot advance while any contradiction is unresolved
// (BC-P4C03-03) — onResolve requires a non-empty explanation.
//
// R16-E §6 (D-105, DR7-30/F1B-3). `detectContradictions` now returns plain
// sentences with no claim to quote the person (contradiction.ts) — this
// screen renders them as two independent statements, not "You said X...
// but also Y", and drops the field-name line entirely (principle 1: no
// field code or label on this screen, even a resolved one).
interface ContradictionReviewProps {
  contradictions: Contradiction[];
  onResolve: (explanation: string) => void;
}

export default function ContradictionReview({ contradictions, onResolve }: ContradictionReviewProps) {
  const [explanation, setExplanation] = useState('');

  return (
    <section aria-label="Contradiction review">
      {/* design-review round 4 (Panel G — Intake: Contradiction review,
          Critical), reworded again for R16-E §6. Reframed as a helpful
          catch (Cooper) rather than an accusation. */}
      <h2>Your description and your answers don&rsquo;t match</h2>
      <p className="field-help">
        This isn&rsquo;t a result yet — we can&rsquo;t tell which is right, so we&rsquo;re asking
        before working one out.
      </p>
      {contradictions.map((c, i) => (
        <div key={i} className="contradiction" role="alert">
          <p>{c.statement1}</p>
          <p>{c.statement2}</p>
        </div>
      ))}
      <label htmlFor="contradiction-explanation">Which is right, and why?</label>
      <textarea
        id="contradiction-explanation"
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
      />
      <button type="button" onClick={() => onResolve(explanation)} disabled={!explanation.trim()}>
        Continue
      </button>
    </section>
  );
}
