import { useState } from 'react';
import type { KnowledgeMatch, KnowledgeLensMeta } from '../engine/knowledge-lens';

// R11-KL-2/-3 (requirements-011.md). Rule 4 (cross-cutting.md §7):
// presentation-only — matches arrive already computed by the caller
// (engine/knowledge-lens.ts#matchKnowledgeLens), nothing here writes or
// feeds the engine. Deliberately its OWN component with its OWN styling
// (R11-UI-1) — never interleaved with SimilarCases or the verdict's
// invariant/regulatory-chain rendering, so the "third lever" reads as
// visibly subordinate: it informs, it does not decide.
//
// R13-UI (practical-judgment review, 2026-08-18): the practitioner's
// live-drive found 8 identical "already covered" lines burying one
// visually-identical gap — "a real 2LoD team would not keep this panel on
// past month one." Gaps now render FIRST in a distinct treatment; covered
// entries collapse to a one-line summary, expandable — nothing hidden,
// attention directed. Filing feedback is a persistent "Filed" state
// derived from the audit trail (filedRiskDomains), never local-only state
// that a reload would forget.
export interface KnowledgeLensPanelProps {
  matches: KnowledgeMatch[];
  onFileCoverageGap?: (match: KnowledgeMatch) => void;
  gapBusyEntryId?: string | null;
  // R13-UI-3: risk domains for which a coverage-gap filing already exists
  // on this case's audit trail (rule_dissent_filed with rule_id = the risk
  // domain). Derived by the caller from events it already has on screen.
  filedRiskDomains?: string[];
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

function MatchBody({ m }: { m: KnowledgeMatch }) {
  return (
    <>
      <span className="knowledge-lens__domain">
        {m.entry.risk_domain} <span className="knowledge-lens__subdomain">· {m.entry.risk_subdomain}</span>
      </span>
      <span className="knowledge-lens__description">{m.entry.description}</span>
      <span className="knowledge-lens__attribution">{m.entry.source_attribution}</span>
    </>
  );
}

export default function KnowledgeLensPanel({
  matches,
  onFileCoverageGap,
  gapBusyEntryId,
  filedRiskDomains = [],
  meta,
}: KnowledgeLensPanelProps) {
  const [showCovered, setShowCovered] = useState(false);
  if (matches.length === 0) return null;
  const age = meta ? daysSince(meta.curated_date) : null;
  const overdue = meta && age !== null && age > meta.max_staleness_days;
  // R13-UI-1: gaps first — the actionable signal leads. Order within each
  // group stays the caller's (entry-id order, deterministic).
  const gaps = matches.filter((m) => !m.covered);
  const covered = matches.filter((m) => m.covered);
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

      {gaps.length > 0 && (
        <ul className="knowledge-lens__list">
          {gaps.map((m) => {
            const filed = filedRiskDomains.includes(m.entry.risk_domain);
            return (
              <li key={m.entry.id} className="knowledge-lens__item knowledge-lens__item--gap">
                <MatchBody m={m} />
                <div className="knowledge-lens__gap">
                  <span className="knowledge-lens__gap-label">
                    No firm or pack rule currently addresses this risk domain.
                  </span>
                  {filed ? (
                    // R13-UI-3: the persistent post-filing state — read from
                    // the trail, so it survives reloads and blocks re-filing.
                    <span className="knowledge-lens__gap-filed" role="status">
                      Filed — on the rule-improvement queue.
                    </span>
                  ) : (
                    onFileCoverageGap && (
                      <button
                        type="button"
                        className="knowledge-lens__gap-button"
                        disabled={gapBusyEntryId === m.entry.id}
                        onClick={() => onFileCoverageGap(m)}
                      >
                        File as coverage gap
                      </button>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {gaps.length === 0 && (
        <p className="knowledge-lens__no-gaps">
          No coverage gaps for this case — every matched risk domain has a firm or pack rule addressing it.
        </p>
      )}

      {covered.length > 0 && (
        // R13-UI-2: collapsed by default — the sameness that trained
        // reviewers to skip the panel now costs one line, and the expand
        // keeps every detail one click away (nothing hidden).
        <div className="knowledge-lens__covered-block">
          <button
            type="button"
            className="knowledge-lens__covered-toggle"
            aria-expanded={showCovered}
            onClick={() => setShowCovered((v) => !v)}
          >
            {covered.length} known risk domain{covered.length === 1 ? '' : 's'} already addressed by firm or pack
            rules — {showCovered ? 'hide' : 'show'}
          </button>
          {showCovered && (
            <ul className="knowledge-lens__list">
              {covered.map((m) => (
                <li key={m.entry.id} className="knowledge-lens__item">
                  <MatchBody m={m} />
                  <span className="knowledge-lens__covered">Firm/pack rule already covers this domain.</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
