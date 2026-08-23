import type { KnowledgeMatch, KnowledgeLensMeta } from '../engine/knowledge-lens';

// R11-KL-2/-3 (requirements-011.md). Rule 4 (cross-cutting.md §7):
// presentation-only — matches arrive already computed by the caller
// (engine/knowledge-lens.ts#matchKnowledgeLens), nothing here writes or
// feeds the engine. Deliberately its OWN component with its OWN styling
// (R11-UI-1) — never interleaved with SimilarCases or the verdict's
// invariant/regulatory-chain rendering, so the "third lever" reads as
// visibly subordinate: it informs, it does not decide.
export interface KnowledgeLensPanelProps {
  matches: KnowledgeMatch[];
  onFileCoverageGap?: (match: KnowledgeMatch) => void;
  gapBusyEntryId?: string | null;
  // R12-ST-3: the risk-knowledge file's own curation header, threaded from
  // the caller's loadKnowledgeLens() call — absent on a legacy/invalid
  // file, which renders no meta line at all rather than a fabricated one.
  meta?: KnowledgeLensMeta;
}

// R12-ST-3: a clock read at the component layer is fine here (not engine
// code) — this is presentation-only staleness display, not a decision.
function daysSince(isoDate: string): number | null {
  const then = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  const now = Date.now();
  return Math.floor((now - then) / (24 * 60 * 60 * 1000));
}

export default function KnowledgeLensPanel({ matches, onFileCoverageGap, gapBusyEntryId, meta }: KnowledgeLensPanelProps) {
  if (matches.length === 0) return null;
  const age = meta ? daysSince(meta.curated_date) : null;
  const overdue = meta && age !== null && age > meta.max_staleness_days;
  return (
    <div className="knowledge-lens">
      <h3>Risk-knowledge awareness</h3>
      {/* R11-KL-2 / R11-UI-1: exact posture wording, matching the precedent
          panel's idiom (SimilarCases.tsx) but its own distinct phrase per
          the requirement — "informs — the rules decide". */}
      <p className="knowledge-lens__posture">
        What a recognized external risk taxonomy says this shape of use case is known to risk.
        Informs — the rules decide. Nothing here changes the verdict for this case.
      </p>
      {meta && (
        <p className="knowledge-lens__meta">
          Curated by {meta.curated_by} on {meta.curated_date} · review owner: {meta.review_owner}
        </p>
      )}
      {overdue && (
        <p className="knowledge-lens__meta-overdue" role="alert">
          Review overdue — this taxonomy snapshot is {age} days old (review window {meta!.max_staleness_days}{' '}
          days). The list below may not reflect the current taxonomy.
        </p>
      )}
      <ul className="knowledge-lens__list">
        {matches.map((m) => (
          <li key={m.entry.id} className="knowledge-lens__item">
            <span className="knowledge-lens__domain">
              {m.entry.risk_domain} <span className="knowledge-lens__subdomain">· {m.entry.risk_subdomain}</span>
            </span>
            <span className="knowledge-lens__description">{m.entry.description}</span>
            <span className="knowledge-lens__attribution">{m.entry.source_attribution}</span>
            {m.covered ? (
              <span className="knowledge-lens__covered">Firm/pack rule already covers this domain.</span>
            ) : (
              <div className="knowledge-lens__gap">
                <span className="knowledge-lens__gap-label">
                  No firm or pack rule currently addresses this risk domain.
                </span>
                {onFileCoverageGap && (
                  <button
                    type="button"
                    className="knowledge-lens__gap-button"
                    disabled={gapBusyEntryId === m.entry.id}
                    onClick={() => onFileCoverageGap(m)}
                  >
                    File as coverage gap
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
