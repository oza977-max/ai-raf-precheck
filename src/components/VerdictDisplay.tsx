import type { PolicyFile } from '../engine/types';
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
