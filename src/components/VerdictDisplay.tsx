import type { DataFlowGraph, PolicyFile, RuleRationale, VerdictExplanation } from '../engine/types';
import { findRuleDescription } from '../engine/find-rule-description';
import { graphSummaryRows } from './graph-summary';
import type { Verdict } from '../types/verdict';
import type { AuditEvent, LifecycleStage } from '../store/types';

// verdict-audit.md §5. Rule 4 (cross-cutting.md §7): presentation-only —
// static policy-description lookup for the reasoning-trace fallback is
// data lookup, not business logic.
interface VerdictDisplayProps {
  verdict: Verdict;
  auditEvents: AuditEvent[];
  policy?: PolicyFile;
  // V1.2-B: provenance panel + register status note — both optional so
  // older render paths (and tests) without them stay valid.
  graph?: DataFlowGraph;
  registerStage?: LifecycleStage;
  onCorrect: () => void;
}

// BC-V12B-03: wording avoids the words "approved"/"rejected" — existing
// acceptance tests assert a single match on /approved|rejected/i.
const STAGE_NOTE: Partial<Record<LifecycleStage, string>> = {
  pre_checked: 'Saved to register — awaiting active 2LoD sign-off (LC-2).',
  approved: 'Saved to register — self-service final.',
  in_production: 'Saved to register — in production.',
};

const STATUS_LABEL: Record<Verdict['status'], string> = {
  approved: 'Approved',
  approved_with_controls: 'Approved with controls',
  rejected: 'Rejected',
};

function Citation({ text }: { text?: string }) {
  if (!text) return null;
  return <span className="verdict__citation">{text}</span>;
}

function rationaleLine(kind: 'Tier' | 'Track', value: string, rationale: RuleRationale) {
  if (rationale.rule_id === 'TIER-LOW-DEFAULT') {
    return (
      <p>
        {kind} {value} — no tier trigger matched (default).
      </p>
    );
  }
  // Rule names often begin with the same "Track II — " prefix this line
  // already renders — strip it rather than reading "Track II — Track II — …".
  const prefix = `${kind} ${value} — `.toLowerCase();
  const ruleName = rationale.rule_name?.toLowerCase().startsWith(prefix)
    ? rationale.rule_name.slice(prefix.length)
    : rationale.rule_name;
  return (
    <p>
      {kind} {value} —{' '}
      {rationale.matched_field ? (
        <>
          triggered by <code>{rationale.matched_field}</code>{' '}
        </>
      ) : ruleName ? (
        <>{ruleName} </>
      ) : null}
      (<code>{rationale.rule_id}</code>)
      <Citation text={rationale.regulatory_basis} />
    </p>
  );
}

function WhyThisVerdict({ verdict, explanation }: { verdict: Verdict; explanation: VerdictExplanation }) {
  const isHardLineRejection = verdict.status === 'rejected' && explanation.binding_reason !== null;

  return (
    <div className="verdict__why">
      <h3>Why this verdict</h3>

      {isHardLineRejection && (
        <p className="verdict__why-reason">
          {explanation.binding_reason}
          <Citation text={explanation.binding_regulatory_basis ?? undefined} />
        </p>
      )}

      {explanation.tier_rationale ? (
        rationaleLine('Tier', verdict.tier, explanation.tier_rationale)
      ) : (
        <p>Tier and track shown are ceiling values — a hard-line rejection skips tier/track assignment.</p>
      )}
      {explanation.track_rationale && rationaleLine('Track', verdict.track, explanation.track_rationale)}

      {explanation.tripped_invariants.length > 0 && (
        <ul className="verdict__tripped">
          {explanation.tripped_invariants.map((t) => (
            <li key={t.id}>
              <code>{t.id}</code>{' '}
              <span className={`verdict__severity verdict__severity--${t.severity.toLowerCase()}`}>{t.severity}</span>{' '}
              — {t.description}
              <Citation text={t.regulatory_basis} />
              {t.required_controls.length > 0 && (
                <span className="verdict__tripped-controls"> Requires: {t.required_controls.join(', ')}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="verdict__checked">
        {isHardLineRejection ? (
          <>
            Evaluated against {explanation.hard_lines_checked} hard lines — <code>{verdict.binding_constraint}</code>{' '}
            tripped; evaluation stopped there.
          </>
        ) : (
          <>
            Evaluated against {explanation.hard_lines_checked} hard lines and {explanation.invariants_checked}{' '}
            invariants —{' '}
            {explanation.tripped_invariants.length === 0
              ? 'none triggered.'
              : `${explanation.tripped_invariants.length} triggered.`}
          </>
        )}
      </p>
    </div>
  );
}

function findReasoningTrace(verdict: Verdict, auditEvents: AuditEvent[]): string | null {
  // Most recent verdict_produced/verdict_corrected event for this verdict.
  const match = [...auditEvents].reverse().find((e) => {
    if (e.payload.type === 'verdict_produced' && e.payload.verdict.id === verdict.id) return true;
    if (e.payload.type === 'verdict_corrected' && e.payload.new_verdict.id === verdict.id) return true;
    return false;
  });
  if (!match) return null;
  if (match.payload.type === 'verdict_produced' || match.payload.type === 'verdict_corrected') {
    return match.payload.reasoning_trace ?? null;
  }
  return null;
}

export default function VerdictDisplay({ verdict, auditEvents, policy, graph, registerStage, onCorrect }: VerdictDisplayProps) {
  const lowCaveats = verdict.confidence_caveats.filter((c) => c.confidence === 'low');
  const mediumCaveats = verdict.confidence_caveats.filter((c) => c.confidence === 'medium');
  const isProvisional = lowCaveats.length > 0;

  const reasoningTrace = findReasoningTrace(verdict, auditEvents);
  const fallbackDescription = findRuleDescription(policy, verdict.binding_constraint);
  // BC-V11C01-04: verdicts persisted before V1.1-C01 lack `explanation` —
  // the type says required, but old audit-trail data may resurface.
  const explanation: VerdictExplanation | undefined = verdict.explanation ?? undefined;

  return (
    <section className={`verdict verdict--${verdict.status}`} aria-label="Verdict">
      {isProvisional && (
        <div className="verdict__provisional-banner" role="alert">
          <strong>Provisional — legal review required</strong>
          {lowCaveats.map((c, i) => (
            <p key={i}>{c.reason}</p>
          ))}
        </div>
      )}

      <p className="verdict__eyebrow">Verdict</p>
      <h2 className="verdict__heading">{isProvisional ? 'Provisional' : STATUS_LABEL[verdict.status]}</h2>
      <p className="verdict__meta">
        <code>{verdict.use_case_id.slice(0, 8)}</code> · evaluated{' '}
        {new Date(verdict.attested_at).toLocaleDateString()}
      </p>
      <p className="verdict__appetite-line">
        {verdict.status === 'rejected'
          ? 'Out of appetite — no control set can bring this use case inside.'
          : `In appetite — ${verdict.controls.length} control${verdict.controls.length === 1 ? '' : 's'} required, ${
              verdict.downstream_reviews.length
            } downstream review${verdict.downstream_reviews.length === 1 ? '' : 's'} triggered.`}
      </p>

      <div className="verdict__cards">
        <div className="verdict__stat">
          <span className="verdict__stat-label">Tier</span>
          <span className={`verdict__stat-value verdict__stat-value--${verdict.tier.toLowerCase()}`}>
            {verdict.tier}
          </span>
        </div>
        <div className="verdict__stat">
          <span className="verdict__stat-label">Track</span>
          <span className="verdict__stat-value">{verdict.track}</span>
        </div>
      </div>

      {mediumCaveats.length > 0 && (
        <div className="verdict__medium-caveat" role="alert">
          {mediumCaveats.map((c, i) => (
            <p key={i}>
              <code>{c.ruleId}</code> — {c.reason}
            </p>
          ))}
        </div>
      )}

      <div className="verdict__binding">
        <p>
          Binding constraint: <code>{verdict.binding_constraint || '—'}</code>
        </p>
        {verdict.binding_path && <p className="verdict__binding-path">{verdict.binding_path}</p>}
      </div>

      {explanation && <WhyThisVerdict verdict={verdict} explanation={explanation} />}

      {explanation?.regulatory_chain && explanation.regulatory_chain.length > 0 && (
        <div className="verdict__chain">
          <h3>Regulatory reasoning chain (RA-9)</h3>
          <p className="verdict__chain-sub">Every pack rule that fired, traceable to source text.</p>
          {explanation.regulatory_chain.map((entry) => (
            <div key={entry.rule_id} className="verdict__chain-entry">
              <div className="verdict__chain-head">
                <code>{entry.rule_id}</code>
                <span className="verdict__chain-doc">
                  {entry.document} · {entry.section}
                </span>
                <span className={`verdict__conf verdict__conf--${entry.confidence.toLowerCase()}`}>
                  CONFIDENCE: {entry.confidence.toUpperCase()}
                </span>
              </div>
              <blockquote className="verdict__chain-quote">“{entry.source_text}”</blockquote>
              <p className="verdict__chain-derived">→ DERIVED&ensp;{entry.derived}</p>
              <p className="verdict__chain-signoff">SIGN-OFF&ensp;{entry.sign_off}</p>
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={onCorrect}>
        Correct this classification?
      </button>

      {verdict.controls.length > 0 &&
        (policy ? (
          // V1.3 (design-vision decision #3): proof-carrying controls —
          // MINIMAL CONTROL SET (CS-1) panel with per-control verification
          // status. BC-V13-02: absent evidence renders UNVERIFIED, never a
          // blank or implied pass.
          <div className="verdict__controlset">
            <h3>Minimal control set (CS-1)</h3>
            <p className="verdict__controlset-sub">
              Smallest set that holds the appetite margin. V1: statuses are attested in the policy file;
              machine-checked evidence binding is V1.5.
            </p>
            <ul>
              {verdict.controls.map((id) => {
                const control = policy.controls.find((c) => c.id === id);
                const evidence = control?.verification_evidence;
                const verified = evidence?.status === 'verified';
                return (
                  <li key={id}>
                    <div className="verdict__control-head">
                      <code>{id}</code>
                      <span className="verdict__control-name">{control?.name ?? ''}</span>
                      <span
                        className={
                          verified ? 'verdict__vchip verdict__vchip--verified' : 'verdict__vchip verdict__vchip--unverified'
                        }
                      >
                        {verified ? 'VERIFIED' : 'UNVERIFIED'}
                      </span>
                    </div>
                    {control && control.resolves.length > 0 && (
                      <p className="verdict__control-patches">Patches: {control.resolves.join(', ')}</p>
                    )}
                    {verified && evidence?.detail && (
                      <p className="verdict__control-evidence">
                        {evidence.detail}
                        {evidence.attested_by ? ` — attested by ${evidence.attested_by}` : ''}
                        {evidence.attested_at ? ` (${evidence.attested_at})` : ''}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          // BC-V13-03: legacy render paths without a policy prop degrade to
          // the plain id list — no fabricated chips.
          <p className="verdict__controls">Controls required: {verdict.controls.join(', ')}</p>
        ))}

      {verdict.downstream_reviews.length > 0 && (
        <p className="verdict__downstream">Downstream reviews: {verdict.downstream_reviews.join(', ')}</p>
      )}

      {verdict.conditions.hypotheses.length > 0 && (
        <div className="verdict__conditions">
          <h3>Standing conditions (VD-7)</h3>
          <p className="verdict__conditions-sub">
            The hypothesis this verdict is conditional on. V2 monitors these live.
          </p>
          <ul>
            {verdict.conditions.hypotheses.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      {graph && (
        <div className="verdict__provenance">
          <h3>Record &amp; provenance</h3>
          <div className="confirmation__grid">
            {graphSummaryRows(graph).map((row) => (
              <div key={row.label} className="confirmation__grid-cell">
                <span className="confirmation__grid-label">{row.label}</span>
                <span className="confirmation__grid-value">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {registerStage && STAGE_NOTE[registerStage] && (
        <p className="verdict__stage-note" role="status">
          {STAGE_NOTE[registerStage]}
        </p>
      )}

      <details className="verdict__trace">
        <summary>Reasoning trace</summary>
        {reasoningTrace ? (
          <p>{reasoningTrace}</p>
        ) : fallbackDescription ? (
          <p>
            <code>{verdict.binding_constraint}</code> — {fallbackDescription}
          </p>
        ) : (
          <p>Reasoning trace unavailable — configure an Anthropic API key to enable plain-English explanations.</p>
        )}
      </details>

      <p className="verdict__caveat">
        Audit trail is append-only. V1 is client-side — proof-of-concept grade for audit purposes (NF-2).
      </p>
    </section>
  );
}
