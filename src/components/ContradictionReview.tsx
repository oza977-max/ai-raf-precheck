import { useState } from 'react';
import type { Contradiction } from '../engine/types';

// UC-5 (intake-flow.md §7). Rule 4 (cross-cutting.md §7): presentation-only.
// The flow cannot advance while any contradiction is unresolved
// (BC-P4C03-03) — onResolve requires a non-empty explanation.
interface ContradictionReviewProps {
  contradictions: Contradiction[];
  onResolve: (explanation: string) => void;
}

export default function ContradictionReview({ contradictions, onResolve }: ContradictionReviewProps) {
  const [explanation, setExplanation] = useState('');

  return (
    <section aria-label="Contradiction review">
      <div className="questionnaire__tag">UC-5 · CONTRADICTION REVIEW</div>
      <h2>Resolve contradictions before continuing</h2>
      {contradictions.map((c, i) => (
        <div key={i} className="contradiction" role="alert">
          <p>
            <strong>{c.statement1}</strong>
          </p>
          <p>
            <strong>{c.statement2}</strong>
          </p>
          <p className="contradiction__field">field: {c.field}</p>
        </div>
      ))}
      <label htmlFor="contradiction-explanation">
        Correct one of the values above, or confirm both are correct and explain why
      </label>
      <textarea
        id="contradiction-explanation"
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
      />
      <button type="button" onClick={() => onResolve(explanation)} disabled={!explanation.trim()}>
        Resolve and continue
      </button>
    </section>
  );
}
