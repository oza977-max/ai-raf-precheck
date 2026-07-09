import type { PolicyFile, RuleRationale, VerdictExplanation } from '../engine/types';
import { findRuleDescription } from '../engine/find-rule-description';
import type { Verdict } from '../types/verdict';
import type { AuditEvent } from '../store/types';

// verdict-audit.md §5. Rule 4 (cross-cutting.md §7): presentation-only —
// static policy-description lookup for the reasoning-trace fallback is
// data lookup, not business logic.
interface VerdictDisplayProps {
  verdict: Verdict;
  auditEvents: AuditEvent[];
  policy?: PolicyFile;
  onCorrect: () => void;
}

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

export default function VerdictDisplay({ verdict, auditEvents, policy, onCorrect }: VerdictDisplayProps) {
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

      <button type="button" onClick={onCorrect}>
        Correct this classification?
      </button>

      {verdict.controls.length > 0 && (
        <p className="verdict__controls">Controls required: {verdict.controls.join(', ')}</p>
      )}

      {verdict.downstream_reviews.length > 0 && (
        <p className="verdict__downstream">Downstream reviews: {verdict.downstream_reviews.join(', ')}</p>
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
    </section>
  );
}
