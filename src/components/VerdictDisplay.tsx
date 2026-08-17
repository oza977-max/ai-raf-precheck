import type { DataFlowGraph, PolicyFile, RuleRationale, VerdictExplanation } from '../engine/types';
import { findControlName, findRuleDescription } from '../engine/find-rule-description';
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
  // Optional since P8-C06. register-lifecycle.md §15.1b: the sign-off page
  // reuses this component, and correction is a submitter action
  // (verdict-audit.md §6.1), not a reviewer one. Required-with-a-no-op would
  // have left a control on the reviewer's page that still invites the click.
  onCorrect?: () => void;
}

// BC-V12B-03: wording avoids the words "approved"/"rejected" — existing
// acceptance tests assert a single match on /approved|rejected/i.
const STAGE_NOTE: Partial<Record<LifecycleStage, string>> = {
  pre_checked: 'Saved to register — awaiting active 2LoD sign-off (LC-2).',
  approved: 'Saved to register — self-service final.',
  in_production: 'Saved to register — in production.',
};

// Display labels for living_status — 'approved' maps to wording without the
// word itself (see the comment at the render site).
const LIVING_STATUS_LABEL: Record<Verdict['living_status'], string> = {
  approved: 'in good standing',
  amber: 'amber — condition under strain',
  breached: 'breached — a condition has been crossed',
  revoked: 'revoked',
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

function WhyThisVerdict({
  verdict,
  explanation,
  policy,
}: {
  verdict: Verdict;
  explanation: VerdictExplanation;
  policy?: PolicyFile;
}) {
  const isHardLineRejection = verdict.status === 'rejected' && explanation.binding_reason !== null;

  return (
    <div className="verdict__why">
      <h3>Why this verdict</h3>

      {/* User-reported: the panel listed rule IDs and never said what kind of
          rule they were or where they came from. The product's whole claim is
          that a verdict traces to a rule — which is worth nothing if the
          reader cannot tell the three kinds apart. Plain language, per the
          house rule; no jargon that is not immediately unpacked. */}
      <p className="verdict__why-primer">
        Every line below is a rule this use case was measured against. There are three kinds, and they behave
        differently:{' '}
        <strong>hard lines</strong> are checked first and are absolute — no control set can bring a use case back
        inside appetite once one is crossed. <strong>Invariants</strong> are your firm's risk appetite rules; each
        one names the controls that satisfy it, which is why a use case can come back inside appetite once those
        controls are in place.{' '}
        <strong>Jurisdiction-pack rules</strong> come from regulation rather than from your firm, and are set out
        separately in the regulatory reasoning chain below.
      </p>

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
        <>
          <p className="verdict__tripped-label">
            Appetite invariants triggered — rules from your firm's risk appetite that this use case does not yet
            satisfy. Each names the controls that would close it.
          </p>
          <ul className="verdict__tripped">
          {explanation.tripped_invariants.map((t) => (
            <li key={t.id}>
              <code>{t.id}</code>{' '}
              <span className={`verdict__severity verdict__severity--${t.severity.toLowerCase()}`}>{t.severity}</span>{' '}
              — {t.description}
              <Citation text={t.regulatory_basis} />
              {t.required_controls.length > 0 && (
                <span className="verdict__tripped-controls">
                  {' '}
                  Closed by:{' '}
                  {t.required_controls.map((cid, i) => {
                    const name = findControlName(policy, cid);
                    return (
                      <span key={cid}>
                        {i > 0 && '; '}
                        {name ?? cid}
                        {name && <code className="verdict__id-quiet">{cid}</code>}
                      </span>
                    );
                  })}
                </span>
              )}
            </li>
            ))}
          </ul>
        </>
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

/** The plain-language answer to "so what do I actually have to do?".
 *
 *  Deliberately NOT a new computation — every item here is read from the
 *  verdict the engine already produced. A second derivation of what is
 *  required would be a second source of truth about an appetite decision,
 *  which is the defect ADR-EE-R3-1 exists to prevent. */
function WhatToDo({
  verdict,
  policy,
  registerStage,
}: {
  verdict: Verdict;
  policy?: PolicyFile;
  registerStage?: LifecycleStage;
}) {
  const rejected = verdict.status === 'rejected';
  const controls = verdict.controls ?? [];
  const reviews = verdict.downstream_reviews ?? [];
  const needsSignOff = registerStage === 'pre_checked';

  return (
    <div className="verdict__todo">
      <h3>What you need to do</h3>

      {rejected ? (
        <>
          <p className="verdict__todo-lead">
            This use case is outside appetite as described, and no set of controls changes that — it crosses a
            hard line. There is nothing to implement.
          </p>
          <p className="verdict__todo-lead">
            Your options are to change the use case so it no longer crosses that line, or to take it to the
            accountable committee as a deliberate exception. The rule it crossed, and the regulation behind it,
            are set out below.
          </p>
        </>
      ) : controls.length === 0 && reviews.length === 0 ? (
        <p className="verdict__todo-lead">
          Nothing. This use case sits inside appetite as described, with no controls required and no further
          reviews triggered.
          {needsSignOff && ' It still needs a second-line sign-off before it is final.'}
        </p>
      ) : (
        <>
          <p className="verdict__todo-lead">
            To bring this use case inside appetite, the following must be in place. Each item is required by a
            rule — the rule is named against it below.
          </p>
          <ol className="verdict__todo-list">
            {controls.map((id) => {
              const control = policy?.controls.find((c) => c.id === id);
              // Three states, not two. Without a policy loaded we cannot know
              // whether evidence exists, and saying "no evidence recorded yet"
              // would be a fabricated claim about a control nobody looked at —
              // the exact defect BC-V13-03 pins for the chip below. The first
              // draft of this panel had two states and got it wrong.
              // A short chip rather than a sentence per row. The first cut
              // repeated "no evidence recorded yet, so treat this as
              // outstanding" eight times down the list, which buried the
              // control names it was meant to support. The full meaning lives
              // once, in the footnote below.
              const status = !policy
                ? 'evidence unknown'
                : control?.verification_evidence?.status === 'verified'
                  ? 'in place'
                  : 'outstanding';
              return (
                <li key={id}>
                  <strong>{control?.name ?? id}</strong>
                  {control?.name && <code className="verdict__id-quiet">{id}</code>}
                  <span className={`verdict__todo-chip verdict__todo-chip--${status.split(' ')[0]}`}>
                    {status}
                  </span>
                </li>
              );
            })}
            {reviews.map((r) => (
              <li key={r}>
                <strong>{r}</strong>
                <span className="verdict__todo-chip verdict__todo-chip--review">separate review</span>
                <span className="verdict__todo-status"> — another team owns this; the verdict does not replace it</span>
              </li>
            ))}
            {needsSignOff && (
              <li>
                <strong>Second-line sign-off</strong>
                <span className="verdict__todo-status">
                  {' '}
                  — this use case is above the self-service threshold, so it is not final until 2LoD approves it
                </span>
              </li>
            )}
          </ol>
          <p className="verdict__todo-foot">
            <strong>Outstanding</strong> means the policy file carries no attestation that this control exists —{' '}
            <em>not</em> that someone checked and found it missing. In this version those statuses are attested by
            hand; machine-checked evidence is a later release.
          </p>
        </>
      )}
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
  // Terse on purpose. This is the labelled cause for the record; the full
  // explanation of the consequence is the body panel below (R3-JU-3), and
  // review pass 1 rightly flagged that near-identical wording in both places
  // reads as the same sentence printed twice.
  // "no regulatory rules were used" was the same overclaim as the body panel's
  // earlier drafts, just terser — the firm's own rules cite SS1/23, MAR, the
  // EU AI Act and more, and those citations render on this very screen. Seen
  // by reading the rendered page against its own citation list, not by a test.
  no_regulatory_basis: 'Cause: no jurisdiction pack applied, so no country rulebook was used.',
  // Names the consequence, not just the fact. A reader needs to know that the
  // tier they are looking at was set WITHOUT any decision-type rule, because
  // that is what determines whether they should trust it.
  unclassified_decision_type:
    'Cause: the decision type entered is not one your policy has a rule for, so no decision-type rule could be applied. The tier and track above rest on the other answers alone. This is a gap in the risk appetite policy — one for whoever owns it, not a legal question.',
};

export default function VerdictDisplay({ verdict, auditEvents, policy, graph, registerStage, onCorrect }: VerdictDisplayProps) {
  // §13.1a: the caveats remain the per-rule DETAIL rendered underneath the
  // banner — which rule is unadopted. They are no longer what determines
  // Provisional; that is `provisional_reasons`, read below. Filtering them
  // here is presentation, not a second derivation of the status.
  const lowCaveats = verdict.confidence_caveats.filter((c) => c.confidence === 'low');

  // Presentation-only (rule 4): reads the sign-off strings the engine already
  // produced. "[FIRM] — Technology Risk · pending firm adoption" → the role is
  // the segment between the em-dash and the dot separator. Distinct + sorted
  // so the list is stable (NF-1 discipline applies to rendering too).
  const pendingReviewers = [
    ...new Set(
      (verdict.explanation?.regulatory_chain ?? [])
        .filter((e) => e.sign_off.includes('pending firm adoption'))
        .map((e) => {
          const m = e.sign_off.match(/—\s*([^·]+)/);
          return m?.[1] ? m[1].trim() : null;
        })
        .filter((r): r is string => Boolean(r)),
    ),
  ].sort();
  const mediumCaveats = verdict.confidence_caveats.filter((c) => c.confidence === 'medium');
  // ADR-EE-R3-1: the engine determines Provisional and names its causes. This
  // was `lowCaveats.length > 0` — one of two independent derivations of the
  // same rule, the other in store/register.ts. Both are now reads.
  const isProvisional = isVerdictProvisional(verdict);

  // register-lifecycle.md §15.1b excludes BOTH the correction affordance and
  // the reasoning-trace disclosure from the reviewer's page: they belong to
  // the submitter's flow (verdict-audit.md §6.1). They are gated together and
  // named as one concept, because `onCorrect &&` in front of a trace
  // disclosure reads as though the trace were a correction concern, which it
  // is not. Review of P8-C06 raised this; the honest fix is the name, not a
  // second prop with no consumer — see FN-004 for when to split them.
  const showSubmitterAffordances = onCorrect !== undefined;

  const reasoningTrace = findReasoningTrace(verdict, auditEvents);
  const fallbackDescription = findRuleDescription(policy, verdict.binding_constraint);
  // BC-V11C01-04: verdicts persisted before V1.1-C01 lack `explanation` —
  // the type says required, but old audit-trail data may resurface.
  const explanation: VerdictExplanation | undefined = verdict.explanation ?? undefined;

  return (
    <section className={`verdict verdict--${verdict.status}`} aria-label="Verdict">
      {isProvisional && (
        <div className="verdict__provisional-banner" role="alert">
          {/* User report (2026-08-15): "why do we always say legal review
              required — is it always legal?" It is not. Packs are signed by
              Legal/Compliance, Model Risk and Technology Risk depending on
              the regulation, and an unlisted decision type is an appetite
              question, not a legal one. The heading stopped presuming; where
              the chain's sign-off lines say WHO is pending, they are named. */}
          <strong>Provisional — review required before this is final</strong>
          {pendingReviewers.length > 0 && (
            <p className="verdict__provisional-owners">
              Waiting on: {pendingReviewers.join(', ')} — each named against its rule in the reasoning chain
              below.
            </p>
          )}
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
              {/* Name the decision type, don't just say one was unrecognised.
                  The engine computed `unclassified_decision_types` and the
                  first cut of this banner never rendered it — the
                  computed-but-never-consumed defect CLAUDE.md warns about,
                  walked into again. A cause with no subject cannot be acted
                  on: the firm needs to know WHICH decision type it has no
                  position on, because that is the hole in its framework. */}
              {reason === 'unclassified_decision_type' &&
                (verdict.unclassified_decision_types ?? []).length > 0 && (
                  <>
                    {' '}
                    Entered:{' '}
                    {(verdict.unclassified_decision_types ?? []).map((d, i) => (
                      <span key={d}>
                        {i > 0 && ', '}
                        <q>{d}</q>
                      </span>
                    ))}
                    .
                  </>
                )}
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

      {/* User report (2026-08-15): "the engine might be working but the verdict
          should be something a business user understands — how it's derived and
          WHAT THEY NEED TO DO". Everything needed for that list was already on
          this screen, scattered across three panels and written in identifiers.
          This assembles it. Nothing below is removed: the reviewer still signs
          off against the full basis, and the audit trail still records that
          they saw it. */}
      <WhatToDo verdict={verdict} policy={policy} registerStage={registerStage} />

      {explanation && <WhyThisVerdict verdict={verdict} explanation={explanation} policy={policy} />}

      {explanation && explanation.tripped_invariants.length > 0 && (
        <div className="verdict__chain">
          <h3>How fragile is this approval?</h3>
          <p className="verdict__chain-sub">
            Some of the rules below are satisfied by exactly one control. If that control fails or is
            removed, the use case falls outside appetite immediately — there is no second control
            holding it. Those are the ones to watch.
          </p>
          <p className="verdict__chain-derived">
            → HEADROOM&ensp;
            {Math.round(verdict.margin_achieved * 100)}% of the triggered rules have more than one control
            available; your firm&rsquo;s target is {Math.round(verdict.margin_target * 100)}%
            {verdict.boundary_proximity && ' — below target'}
          </p>
          {verdict.single_covered_invariants.length > 0 && (
            <>
              <p className="verdict__chain-derived">
                → RESTING ON A SINGLE CONTROL&ensp;({verdict.single_covered_invariants.length})
              </p>
              {/* Was a bare comma-separated list of ids — "INV-CITE-01,
                  INV-CONDUCT-01, INV-SEC-01, INV-SYNTHMARK-01" — which the
                  reader had to scroll up and cross-reference one at a time.
                  The descriptions were already in the policy. */}
              <ul className="verdict__fragile">
                {verdict.single_covered_invariants.map((id) => {
                  const desc = findRuleDescription(policy, id);
                  return (
                    <li key={id}>
                      {desc ?? id}
                      {desc && <code className="verdict__id-quiet">{id}</code>}
                    </li>
                  );
                })}
              </ul>
              <p className="verdict__chain-basis-help">
                {verdict.margin_achieved === 0
                  ? 'No rule here has an alternative control in the library, so no control set can create headroom. That is a limit of the rulebook, not of this use case.'
                  : 'Each of these is held by one control and nothing else.'}
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

      {/* R3-JU-3 / verdict-audit.md §13.1. The chain panel below renders only
          when there is a chain, so a verdict with no active pack used to show
          nothing here at all — and "no regulation applies", "we did not check"
          and "the panel failed to render" are indistinguishable when all three
          look like nothing (Leveson). The explanation must be PRESENT, not the
          panel merely absent.

          Gated on the engine's own determination rather than on the chain
          being empty, because those are different facts: a verdict persisted
          before V1.1-C01 has no `explanation` at all, and describing that
          record as having no regulatory basis would be a claim about history
          nobody checked. */}
      {(verdict.provisional_reasons ?? []).includes('no_regulatory_basis') && (
        <div className="verdict__chain" data-no-regulatory-basis>
          <h3>No jurisdiction rulebook was applied</h3>
          <p className="verdict__chain-sub">
            No jurisdiction pack applied to this use case, so no country rulebook was used and
            there is no regulatory reasoning chain — no quoted source text, and none of the
            citations a pack would supply. Your firm&rsquo;s own policy still applied in full,
            including the regulatory citations it carries itself, shown above where they bear on
            this case.
          </p>
          <p className="verdict__chain-basis-help">
            If this use case does touch a country your firm has a rulebook for, say so on the
            intake form and evaluate it again.
          </p>
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

      {/* Rendered only where correction is actually available. Absence here
          is the requirement, not an oversight (TC-R3-RD-8-01). */}
      {showSubmitterAffordances && onCorrect && (
        <button type="button" onClick={onCorrect}>
          Correct this classification?
        </button>
      )}

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
            {/* §15.1a (C-2). The verdict above is a historical record — what was
                decided and attested. These statuses are CURRENT: whether the
                evidence exists today. The two are deliberately different
                sources, and a reader who cannot tell which is which could sign
                off believing an old VERIFIED still holds. Saying so is the
                whole point of the split. */}
            <p className="verdict__controlset-asof">
              Evidence status is read from today&rsquo;s policy, not from the evaluation. The verdict
              above is the record of what was decided on{' '}
              {new Date(verdict.attested_at).toLocaleDateString()}.
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
          // BC-V13-03: no policy, so no fabricated chips. §15.1a is explicit
          // that the status renders as UNKNOWN rather than UNVERIFIED —
          // absence of a policy is not evidence of absent evidence. Saying
          // nothing at all would be the same defect in the other direction:
          // a reader cannot distinguish "not checked" from "nothing to show".
          <div className="verdict__controlset">
            <h3>Minimal control set (CS-1)</h3>
            <ul>
              {verdict.controls.map((id) => (
                <li key={id}>
                  <div className="verdict__control-head">
                    <code>{id}</code>
                    <span className="verdict__vchip verdict__vchip--unknown">EVIDENCE UNKNOWN</span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="verdict__controlset-asof">
              No policy is loaded, so whether evidence exists for these controls could not be
              checked. That is not the same as having no evidence.
            </p>
          </div>
        ))}

      {/* CS-3. On an approved verdict these are obligations the submitter owes
          alongside the pre-check. On a REJECTED one they are not owed at all —
          the pre-check said don't do this — so they are labelled as the
          forward path: what this shape of use case would still require if it
          were re-scoped to come inside appetite. Same data, different claim,
          and presenting the second as the first would be an instruction nobody
          is under (user decision, 2026-08-05). */}
      {verdict.downstream_reviews.length > 0 &&
        (verdict.status === 'rejected' ? (
          <div className="verdict__downstream verdict__downstream--forward">
            <p className="verdict__downstream-label">If this use case is re-scoped</p>
            <p>
              Nothing here is required of you now — this verdict is out of appetite. Kept for
              whoever takes it forward: a use case of this shape would also need{' '}
              {verdict.downstream_reviews.join(', ')}. Those are separate from the appetite
              question, so bringing this inside appetite would not remove them.
            </p>
          </div>
        ) : (
          <div className="verdict__downstream">
            <p>Downstream reviews: {verdict.downstream_reviews.join(', ')}</p>
            {/* CS-3's fit criterion: "with the policy rule that triggered each
                one named". A required review with no traceable cause is an
                instruction with no author — a reviewer cannot check it, argue
                with it, or tell a firm rule from a regulatory one. The engine
                computed this from the start and every call site threw it away
                (code review round 3, Panel B). */}
            {(verdict.downstream_review_sources ?? []).length > 0 && (
              <ul className="verdict__downstream-sources">
                {(verdict.downstream_review_sources ?? []).map((s) => (
                  <li key={s.rule_id}>
                    {s.review} — required by <code>{s.rule_id}</code>
                    {s.regulatory_basis ? <Citation text={s.regulatory_basis} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

      {verdict.conditions.hypotheses.length > 0 && (
        <div className="verdict__conditions">
          <h3>What would make this verdict expire</h3>
          <p className="verdict__conditions-sub">
            <strong>Nothing to do today.</strong> This verdict was reached on the assumption that the system
            stays inside the bounds below. If it drifts outside any of them — or the deployment moves to a
            different data zone, or is given more autonomy — <strong>the approval no longer holds and the use
            case has to come back through this gate.</strong>
          </p>
          <p className="verdict__conditions-sub">
            <strong>Who checks, and when:</strong> nobody automatically. In this version these are read at the
            next scheduled re-review — whoever owns the model is responsible for noticing sooner. Continuous
            monitoring against these thresholds is a later release, and until it exists this list is a
            statement of assumptions rather than an alarm.
          </p>
          {/* The last two entries restate the data zone and autonomy already
              shown in Record & provenance below. Reported as duplication, and
              it read that way because nothing said the two were making
              different claims: provenance records what was DECLARED, these
              record the bound the verdict DEPENDS ON. Same value, different
              force. Labelled rather than deleted — dropping them would remove
              the expiry condition, which is the part that matters. */}
          <ul>
            {verdict.conditions.hypotheses.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      {graph && (
        <div className="verdict__provenance">
          <h3>What you told us</h3>
          {/* Reported as duplicating the standing conditions. It does repeat
              the data zone and autonomy level — deliberately, because the two
              panels make different claims about the same value: this is what
              was DECLARED and attested to, that is the bound the verdict
              DEPENDS ON. Saying so is cheaper than removing either. */}
          <p className="verdict__conditions-sub">
            The answers this verdict was computed from, as attested at submission. The data zone and autonomy
            level also appear above as expiry conditions — same values, different purpose: here they are what
            you declared, there they are the bounds the approval depends on.
          </p>
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

      {/* VD-6. The engine wrote living_status on every verdict since V1 and
          nothing ever rendered it — found 2026-08-15 by the traceability
          close-out, not by a test, which is the ninth instance of the
          computed-but-never-consumed defect this repo documents. In V1 it is
          always "approved" at issue (the other states arrive with live
          monitoring in V2), so the copy says what the field is FOR rather
          than pretending it is being watched. */}
      <p className="verdict__living-status">
        {/* The RAW value 'approved' cannot render here: the acceptance suite
            holds a single-match /approved|rejected/i guard over the verdict
            (BC-V12B-03), and this word broke it — the third time this session
            the trap in CLAUDE.md has fired. Display labels; the raw value
            stays on the stored verdict untouched. */}
        Living status: <strong>{LIVING_STATUS_LABEL[verdict.living_status]}</strong> · as of{' '}
        {new Date(verdict.living_status_updated_at).toLocaleDateString()} — this is the verdict's standing
        against its expiry conditions above. In this version it only changes at re-review.
      </p>

      {registerStage && STAGE_NOTE[registerStage] && (
        <p className="verdict__stage-note" role="status">
          {STAGE_NOTE[registerStage]}
        </p>
      )}

      {showSubmitterAffordances && (
      <details className="verdict__trace">
        <summary>Reasoning trace</summary>
        {reasoningTrace ? (
          <>
            {/* Jailbreak-review gap (2026-08-15): the LLM's retelling rendered
                with no provenance label, so a reader could take AI prose as
                the verdict's official reasoning. The verdict's authority is
                the deterministic panels above; this is commentary. */}
            <p className="verdict__trace-provenance">
              Written by the optional AI model as a plain-English retelling. It is not part of the
              verdict: the authoritative reasoning is the rule-by-rule panels above, and if this
              prose ever disagrees with them, the panels win.
            </p>
            <p>{reasoningTrace}</p>
          </>
        ) : fallbackDescription ? (
          <p>
            <code>{verdict.binding_constraint}</code> — {fallbackDescription}
          </p>
        ) : (
          <p>
            Narrative summary not generated — this optional plain-English retelling needs a
            configured model (Settings). It adds nothing to the outcome above: the rules, citations
            and required controls shown on this page are the complete basis for the decision.
          </p>
        )}
      </details>
      )}

      <p className="verdict__caveat">
        Audit trail is append-only. V1 is client-side — proof-of-concept grade for audit purposes (NF-2).
      </p>
    </section>
  );
}
