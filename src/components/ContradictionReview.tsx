import { useState } from 'react';
import type { Contradiction } from '../engine/types';
import { GRAPH_FIELD_LABELS } from './field-copy';

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
      {/* design-review round 4 (Panel G — Intake: Contradiction review,
          Critical). Was: a bare "UC-5" tag (NF-11 leak, dropped — no
          reader-facing purpose), a blocking "Resolve contradictions"
          heading with no reassurance, and two bolded statements with no
          connective language, no source, and a raw engine field name.
          Reframed as a helpful catch (Cooper) rather than an accusation,
          and the field name now resolves through the same GRAPH_FIELD_LABELS
          lookup the verdict screen uses. */}
      <h2>Two of your answers don&rsquo;t agree</h2>
      <p className="field-help">
        Nothing is wrong with the use case — we just can&rsquo;t tell which of these two answers is
        right, so we&rsquo;re asking before scoring anything.
      </p>
      {contradictions.map((c, i) => (
        <div key={i} className="contradiction" role="alert">
          <p className="contradiction__field">
            About {GRAPH_FIELD_LABELS[c.field] ?? 'this'}
            {GRAPH_FIELD_LABELS[c.field] && <code className="verdict__id-quiet"> {c.field}</code>}:
          </p>
          <p>
            You said <strong>{c.statement1}</strong>
          </p>
          <p>
            but also <strong>{c.statement2}</strong>
          </p>
        </div>
      ))}
      <label htmlFor="contradiction-explanation">
        Tell us which one is right (or explain why both are, if they genuinely both apply)
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
