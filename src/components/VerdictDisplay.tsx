import type { DataFlowGraph, PolicyFile, RuleRationale, VerdictExplanation } from '../engine/types';
import { findRuleDescription } from '../engine/find-rule-description';
import { graphSummaryRows } from './graph-summary';
import { isVerdictProvisional } from '../engine/provisional';
import type { ProvisionalReason } from '../engine/provisional';
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


// V2-E: replaces the CONFIDENCE: HIGH/MEDIUM/LOW chip. That grade was
// subjective — nobody could say what MEDIUM obliged a reader to do. This
// says what the rule does to its own quoted text, which the reader can
// check against the quote shown directly below it.
const BASIS_LABELS: Record<string, string> = {
  verbatim: 'STATES THE QUOTED TEXT',
  derived: 'INFERRED FROM THE TEXT',
  judgement: 'LEGAL JUDGEMENT',
};

const BASIS_HELP: Record<string, string> = {
  verbatim: 'This rule restates the quoted passage. Nothing was read into it.',
  derived: 'This rule is an inference from the quoted passage, not something it says outright. Check the inference holds for your case.',
  judgement: 'This rule rests on a reading of the law that the quoted passage does not settle. A qualified person has to stand behind it.',
};

// R3-JU-6: the labelled cause, addressed to a later reader of the record. The
// two reasons are different claims and must not collapse into one badge
// (evaluation-engine.md §13.1) — "no regulatory basis" says none exists;
// "unsigned rules" says one exists that the firm has not adopted. Neither
// string contains the words "approved" or "rejected" (HR3-08).
const PROVISIONAL_REASON_LABEL: Record<ProvisionalReason, string> = {
  unsigned_pack_rules:
    'Rules from a jurisdiction pack were applied, but they are proposed readings of the law that your firm has not yet adopted.',
  no_regulatory_basis:
    'No jurisdiction pack applied to this use case, so no regulatory rules were used and no citations are available. It was assessed against your firm\u2019s own policy only.',
};

export default function VerdictDisplay({ verdict, auditEvents, policy, graph, registerStage, onCorrect }: VerdictDisplayProps) {
  // §13.1a: the caveats remain the per-rule DETAIL rendered underneath the
  // banner — which rule is unadopted. They are no longer what determines
  // Provisional; that is `provisional_reasons`, read below. Filtering them
  // here is presentation, not a second derivation of the status.
  const lowCaveats = verdict.confidence_caveats.filter((c) => c.confidence === 'low');
  const mediumCaveats = verdict.confidence_caveats.filter((c) => c.confidence === 'medium');
  // ADR-EE-R3-1: the engine determines Provisional and names its causes. This
  // was `lowCaveats.length > 0` — one of two independent derivations of the
  // same rule, the other in store/register.ts. Both are now reads.
  const isProvisional = isVerdictProvisional(verdict);

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
          {/* R3-JU-6 / review pass 2. The banner previously rendered only the
              low-confidence caveats, which exist ONLY for the unsigned-rules
              cause. A verdict provisional for the no-regulatory-basis cause
              therefore showed "legal review required" and nothing else — an
              unexplained demand, on the screen someone acts on. The engine had
              computed the cause and no one rendered it: the same
              computed-but-never-consumed defect that lost the regulatory
              citations for all of V1.

              P8-C05 owns the fuller prose statement for the submitter
              (R3-JU-3). This is the labelled cause, and it is here because
              this chunk is what made the empty banner reachable at scale. */}
          {(verdict.provisional_reasons ?? []).map((reason) => (
            <p key={reason} data-provisional-reason={reason}>
              {PROVISIONAL_REASON_LABEL[reason]}
            </p>
          ))}
          {lowCaveats.map((c, i) => (
            <p key={i}>{c.reason}</p>
          ))}
        </div>
      )}

      <p className="verdict__eyebrow">Verdict</p>
      {/* §13.3: Provisional is a qualifier carried ALONGSIDE the status, not a
          fourth status. The heading used to be replaced by the word
          "Provisional", which hid the underlying determination — a reader
          could not tell whether the provisional verdict was in or out of
          appetite. The banner above already states the qualifier and its
          cause; the heading states what was decided. */}
      <h2 className="verdict__heading">
        {STATUS_LABEL[verdict.status]}
        {isProvisional && <span className="verdict__heading-qualifier"> · Provisional</span>}
      </h2>
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

      {explanation && explanation.tripped_invariants.length > 0 && (
        <div className="verdict__chain">
          <h3>Governance margin (CS-1)</h3>
          <p className="verdict__chain-sub">
            How much headroom this control set leaves. An invariant closed by exactly one control
            sits on the appetite boundary — remove that control and the use case falls outside.
          </p>
          <p className="verdict__chain-derived">
            → MARGIN&ensp;{Math.round(verdict.margin_achieved * 100)}% achieved against a{' '}
            {Math.round(verdict.margin_target * 100)}% target
            {verdict.boundary_proximity && ' — below target'}
          </p>
          {verdict.single_covered_invariants.length > 0 && (
            <>
              <p className="verdict__chain-derived">
                → NO HEADROOM&ensp;{verdict.single_covered_invariants.join(', ')}
              </p>
              <p className="verdict__chain-basis-help">
                {verdict.margin_achieved === 0
                  ? 'No invariant here has an alternative control in the library, so no control set can create headroom. This is a limit of the rulebook, not of this use case.'
                  : 'These invariants rest on a single control each.'}
              </p>
            </>
          )}
        </div>
      )}

      {verdict.inheritance && (
        <div className="verdict__chain">
          <h3>Platform &amp; vendor inheritance</h3>
          <p className="verdict__chain-sub">
            What an existing platform or vendor approval already covered, and the envelope that
            justified it. Controls are inherited only where this use case sits inside the covered
            envelope.
          </p>

          <div className="verdict__chain-entry">
            <div className="verdict__chain-head">
              <code>{verdict.inheritance.declared_platform ?? verdict.inheritance.declared_vendor}</code>
              <span
                className={`verdict__conf verdict__conf--${verdict.inheritance.resolved ? 'registered' : 'unregistered'}`}
              >
                {verdict.inheritance.resolved ? 'ON THE COVERED REGISTRY' : 'NOT ON THE REGISTRY'}
              </span>
            </div>

            {verdict.inheritance.resolved ? (
              verdict.inheritance.inherited_controls.length > 0 ? (
                <p className="verdict__chain-derived">
                  → INHERITED&ensp;{verdict.inheritance.inherited_controls.join(', ')} — already
                  satisfied by this approval, so not re-imposed here.
                </p>
              ) : (
                <p className="verdict__chain-derived">
                  → NOTHING INHERITED&ensp;this use case falls outside the covered envelope, so its
                  controls are assessed from scratch.
                </p>
              )
            ) : (
              <p className="verdict__chain-derived">
                → NOTHING INHERITED&ensp;this component is not on the covered registry. A full
                vendor and platform risk assessment is required.
              </p>
            )}

            {verdict.inheritance.dimensions.length > 0 && (
              <ul className="verdict__tripped">
                {verdict.inheritance.dimensions.map((d) => (
                  <li key={d.dimension}>
                    <code>{d.dimension}</code>{' '}
                    <span
                      className={`verdict__severity verdict__severity--${d.fits ? 'low' : 'critical'}`}
                    >
                      {d.fits ? 'WITHIN ENVELOPE' : 'OUTSIDE ENVELOPE'}
                    </span>{' '}
                    — cleared for {d.ceiling}
                    {d.observed !== undefined && <>; this use case has {d.observed}</>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

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
                <span className={`verdict__conf verdict__conf--${entry.basis}`}>
                  {BASIS_LABELS[entry.basis]}
                </span>
              </div>
              <blockquote className="verdict__chain-quote">“{entry.source_text}”</blockquote>
              <p className="verdict__chain-derived">→ DERIVED&ensp;{entry.derived}</p>
              <p className="verdict__chain-signoff">SIGN-OFF&ensp;{entry.sign_off}</p>
              <p className="verdict__chain-basis-help">{BASIS_HELP[entry.basis]}</p>
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
            The operating bounds this verdict assumes — it holds only while the system stays inside them.
            Nothing to action now: they are recorded with the verdict as its expiry conditions. If the system
            later drifts outside any bound (or the deployment changes zone/autonomy), this verdict no longer
            applies and re-assessment is required. V2 monitors these live; in V1 they are checked at re-review.
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
          <p>
            Narrative summary not generated — this optional plain-English retelling needs an
            Anthropic API key (Settings). It adds nothing to the outcome above: the rules, citations
            and required controls shown on this page are the complete basis for the decision.
          </p>
        )}
      </details>

      <p className="verdict__caveat">
        Audit trail is append-only. V1 is client-side — proof-of-concept grade for audit purposes (NF-2).
      </p>
    </section>
  );
}
