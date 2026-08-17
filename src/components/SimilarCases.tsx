import type { PrecedentMatch } from '../engine/precedent';

// R8-SC (requirements-008): similar DECIDED cases, rendered wherever a
// human weighs a case. Rule 4: presentation-only — the matches arrive
// computed (engine/precedent.ts) and enriched (controls read from each
// match's own audit trail by the caller); nothing here writes or feeds
// the engine.
//
// Outcome wording is APPETITE vocabulary, never the status enum: the
// intake path carries the suite's single-match /approved|rejected/i guard,
// and "inside appetite" is also simply the better language (About-screen
// rule).
const OUTCOME_WORDING: Record<PrecedentMatch['status'], string> = {
  approved: 'inside appetite',
  approved_with_controls: 'inside appetite with controls',
  rejected: 'outside appetite',
};

export interface EnrichedPrecedent extends PrecedentMatch {
  controls: string[];
}

export default function SimilarCases({ matches }: { matches: EnrichedPrecedent[] }) {
  if (matches.length === 0) return null;
  return (
    <div className="similar-cases">
      <h3>Similar decided cases</h3>
      {/* R8-SC-2 / design-vision guardrail: precedent informs, the rules
          decide. Stated where the precedent is shown, every time. */}
      <p className="similar-cases__posture">
        How similar use cases were decided, from this register. For your information only —
        precedent informs, the rules decide, and nothing here changes the verdict for this case.
      </p>
      <ul className="similar-cases__list">
        {matches.map((m) => (
          <li key={m.id} className="similar-cases__item">
            <span className="similar-cases__label">{m.label}</span>
            <span className="similar-cases__outcome">{OUTCOME_WORDING[m.status]}</span>
            <span className="similar-cases__meta">
              Tier {m.tier ?? '—'} · Track {m.track ?? '—'}
              {m.policy_version ? ` · decided under policy v${m.policy_version}` : ''}
              {m.decided_at ? ` · ${new Date(m.decided_at).toLocaleDateString()}` : ''}
            </span>
            {m.controls.length > 0 && (
              <span className="similar-cases__controls">Controls required: {m.controls.join(', ')}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
