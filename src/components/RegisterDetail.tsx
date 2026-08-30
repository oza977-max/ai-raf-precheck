import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getUseCase, updateLifecycleStage, findLatestVerdictEvent } from '../store/register';
import { getAll as getAuditEvents, append as appendAuditEvent } from '../store/audit';
import VerdictDisplay from './VerdictDisplay';
import type { AuditEvent, UseCaseSummary } from '../store/types';
import type { PolicyFile } from '../engine/types';
import type { Verdict } from '../types/verdict';
import { TIER_MEANINGS, TRACK_MEANINGS, STAGE_LABELS } from './field-copy';
import { findPrecedents } from '../engine/precedent';
import type { PrecedentCandidate } from '../engine/precedent';
import SimilarCases from './SimilarCases';
import type { EnrichedPrecedent } from './SimilarCases';
import { getUseCases } from '../store/register';
import type { KnowledgeMatch } from '../engine/knowledge-lens';
import { loadKnowledgeLens } from '../store/knowledge-lens-loader';
import { getCurrentKnowledgeLensYaml } from '../store/knowledge-lens-source';
import KnowledgeLensPanel from './KnowledgeLensPanel';

// V1.2-A (design-gap-audit B3/B4/B5/B6). Rule 4 (cross-cutting.md §7):
// presentation-only — renders the REAL audit store via getAll()
// (BC-V12A-01), and wires the 2LoD actions to existing store functions
// (BC-V12A-02/-04: append + updateLifecycleStage, no hand-rolled writes).
interface RegisterDetailProps {
  useCaseId: string;
  role: string;
  // P8-C07 (§15.1a). Threaded App -> RegisterView -> RegisterDetail. Optional
  // because control evidence status degrades to "unknown" without it —
  // absence of a policy is not evidence of absent evidence.
  policy?: PolicyFile;
  onBack: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  approved: 'Approved',
  approved_with_controls: 'Approved with controls',
  rejected: 'Rejected',
};

// Per-type detail lines derived from the real payload union — never a
// generic JSON dump (build/prompts/V1.2-A.md scope decision 6).
function eventDetail(event: AuditEvent): string {
  const p = event.payload;
  switch (p.type) {
    case 'use_case_created':
      return `${p.description} (intake: ${p.intake_method})`;
    case 'graph_confirmed':
      return `Attested. Graph v${p.graph_version}, ${p.corrections_count} correction${p.corrections_count === 1 ? '' : 's'}.${
        p.contradiction_resolutions && p.contradiction_resolutions.length > 0
          ? ` ${p.contradiction_resolutions.length} contradiction${p.contradiction_resolutions.length === 1 ? '' : 's'} resolved: ${p.contradiction_resolutions.map((n) => `“${n}”`).join(' · ')}`
          : ''
      }`;
    case 'graph_corrected':
      return `${p.correction.field} corrected: ${String(p.correction.original_value)} → ${String(p.correction.corrected_value)}`;
    case 'verdict_produced':
      return `${STATUS_LABEL[p.verdict.status] ?? p.verdict.status} · ${p.verdict.tier} · Track ${p.verdict.track}.${
        p.verdict.binding_constraint ? ` Binding: ${p.verdict.binding_constraint}.` : ''
      } Policy v${p.verdict.policy_version}.`;
    case 'verdict_corrected':
      return `${STATUS_LABEL[p.new_verdict.status] ?? p.new_verdict.status} · ${p.new_verdict.tier} · Track ${
        p.new_verdict.track
      }. Supersedes verdict ${p.original_verdict_id.slice(0, 8)}…`;
    case 'lifecycle_stage_changed':
      return `${p.from_stage} → ${p.to_stage}`;
    case 're_evaluation_queued':
      return `Policy updated to v${p.policy_version} — re-evaluation queued. Stage unchanged.`;
    case 'twoloD_reviewed':
      // The name is what makes this attributable rather than anonymous, so it
      // leads. "(name not verified)" is not a hedge — this build has no
      // sign-in, and a trail that implied otherwise would claim more than it
      // can support.
      return `${p.action.replace('_', ' ')}${
        p.attested_by_name ? ` by ${p.attested_by_name} (name not verified)` : ' — no name recorded'
      }${p.notes ? ` — ${p.notes}` : ''}`;
    case 'reasoning_trace_generated':
      return 'Plain-English reasoning trace generated and stored with the verdict (VD-8).';
    case 'duplicate_dismissed':
      return `Similar use case reviewed and dismissed: ${p.candidate_label} (${p.candidate_use_case_id.slice(0, 8)}…).`;
    case 'classification_adopted':
      return `Classification adopted from ${p.adopted_from_label} (${p.adopted_from_use_case_id.slice(0, 8)}…) — tier ${
        p.tier ?? '—'
      }, track ${p.track ?? '—'}. No evaluation was run for this record.`;
    case 'rule_dissent_filed':
      // "name not verified" for the same reason as twoloD_reviewed: no sign-in.
      return `Rule ${p.rule_id} challenged by ${p.filed_by_name} (name not verified): “${p.dissent}” Advisory — the verdict stands unchanged; the challenge goes to the rule-improvement queue.`;
    case 'sampling_reviewed':
      // R12-AB-1: the automation-bias countermeasure — a deterministically
      // sampled self-served verdict got its human spot review.
      return `Sampling review of verdict ${p.verdict_id.slice(0, 8)}… by ${p.reviewed_by_name} (name not verified)${p.outcome_note ? ` — ${p.outcome_note}` : ''}. Spot check of a self-served case; the verdict stands unchanged unless separately corrected.`;
  }
}

export default function RegisterDetail({ useCaseId, role, policy, onBack }: RegisterDetailProps) {
  const [summary, setSummary] = useState<UseCaseSummary | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [notes, setNotes] = useState('');
  const [attestedByName, setAttestedByName] = useState('');
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Review finding, pass 1: a double-click fires the async handler twice
  // before React re-renders the disabled state, writing DUPLICATE events
  // into the append-only audit trail — which cannot be cleaned up by
  // design (VD-4/NF-2). A ref is synchronous where state is not (same
  // lesson as P7-C01's in-flight seed guard).
  const inFlight = useRef(false);

  // Rule dissent (FN-009). Separate state and a separate in-flight ref from
  // the sign-off actions: a dissent is not a sign-off, and sharing the guard
  // would let a slow dissent write block an Approve (or vice versa) for no
  // data-integrity reason. The same double-click hazard applies, though —
  // a duplicate dissent in an append-only trail cannot be cleaned up.
  const [dissentOpen, setDissentOpen] = useState(false);
  const [dissentRuleId, setDissentRuleId] = useState('');
  const [dissentOtherRef, setDissentOtherRef] = useState('');
  const [dissentText, setDissentText] = useState('');
  const [dissentByName, setDissentByName] = useState('');
  const [dissentResult, setDissentResult] = useState<string | null>(null);
  const [dissentError, setDissentError] = useState<string | null>(null);
  const [dissentBusy, setDissentBusy] = useState(false);
  const dissentInFlight = useRef(false);

  // ADR-RL-R3-1: READ the verdict from the audit trail the page already
  // loads. Never recompute — the verdict a reviewer signs must be the one
  // that was produced and attested, not a fresh one against today's policy,
  // which would silently show something different after any policy change.
  // The scan is the exported helper (P8-C06), not a third copy of it.
  const latestVerdict = useMemo(() => {
    const payload = findLatestVerdictEvent(events);
    if (!payload) return null;
    return payload.type === 'verdict_produced' ? payload.verdict : payload.new_verdict;
  }, [events]);

  // The rules a challenge can point at: the ones THIS verdict relied on,
  // read from its own explanation — never recomputed against today's policy
  // (same reasoning as ADR-RL-R3-1 for the verdict itself). A challenger who
  // wants a rule outside this list types its reference explicitly, so a
  // free-typed id is a visible choice rather than a silent fallback.
  const challengeableRules = useMemo(() => {
    if (!latestVerdict) return [];
    const seen = new Map<string, string>();
    const add = (id?: string | null, label?: string) => {
      if (id && !seen.has(id)) seen.set(id, label ?? id);
    };
    const ex = latestVerdict.explanation;
    if (ex) {
      add(ex.tier_rationale?.rule_id, ex.tier_rationale?.rule_name);
      add(ex.track_rationale?.rule_id, ex.track_rationale?.rule_name);
      for (const t of ex.tripped_invariants) add(t.id, t.description);
      for (const r of ex.regulatory_chain ?? []) add(r.rule_id);
    }
    add(latestVerdict.binding_constraint || null);
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [latestVerdict]);

  // R11-KL-2/-3 (requirements-011.md; evaluation-engine.md §14
  // ADR-EE-R11-1/-2). Advisory-only, read-only until the reviewer taps
  // "file as coverage gap" — never fed into evaluate() and never derived
  // from it. The full graph is not persisted on the register entry
  // (ADR-RL-R3-1 consequences, same reason `graph` is not passed to
  // VerdictDisplay above), so condition-matching against the graph cannot
  // be redone here; instead this reads the entry ids the lens matched AT
  // EVALUATION TIME (IntakeFlow, which does have the graph), carried
  // beside the verdict on the verdict_produced/verdict_corrected event, and
  // resolves them against the currently-loaded lens entries. `covered` is
  // recomputed fresh here (not persisted) against THIS verdict's own rule
  // ids, exactly like `challengeableRules` above.
  const knowledgeLensResult = useMemo(() => loadKnowledgeLens(getCurrentKnowledgeLensYaml()), []);
  const knowledgeLensEntries = useMemo(
    () => (knowledgeLensResult.valid ? knowledgeLensResult.entries : []),
    [knowledgeLensResult],
  );
  const knowledgeLensMeta = knowledgeLensResult.valid ? knowledgeLensResult.meta : undefined;
  const knowledgeLensMatches = useMemo<KnowledgeMatch[]>(() => {
    if (!latestVerdict) return [];
    const payload = findLatestVerdictEvent(events);
    const matchedIds = payload
      ? payload.type === 'verdict_produced'
        ? payload.knowledge_lens_matched_entry_ids
        : payload.knowledge_lens_matched_entry_ids
      : undefined;
    if (!matchedIds || matchedIds.length === 0) return [];
    const ruleIds = new Set(challengeableRules.map((r) => r.id));
    return knowledgeLensEntries
      .filter((entry) => matchedIds.includes(entry.id))
      .map((entry) => ({
        entry,
        covered: entry.covering_rule_ids.some((id) => ruleIds.has(id)),
      }))
      .sort((a, b) => a.entry.id.localeCompare(b.entry.id));
  }, [latestVerdict, events, knowledgeLensEntries, challengeableRules]);

  const [gapBusyEntryId, setGapBusyEntryId] = useState<string | null>(null);
  const [gapError, setGapError] = useState<string | null>(null);
  const gapInFlight = useRef(false);

  // R13-UI-3: gap filings already on this case's trail — the persistent
  // "Filed" state the panel renders. Derived from events (re-read after
  // each write), never local-only state a reload would forget.
  const filedRiskDomains = useMemo(
    () =>
      events
        .filter((e) => e.payload.type === 'rule_dissent_filed')
        .map((e) => (e.payload.type === 'rule_dissent_filed' ? e.payload.rule_id : ''))
        .filter(Boolean),
    [events],
  );

  // R13-UI-4: a verdict stored BEFORE the lens existed carries no
  // knowledge_lens_matched_entry_ids field at all — a different claim from
  // "matched nothing", and the reader must be able to tell them apart.
  const lensNotEvaluated = useMemo(() => {
    const payload = findLatestVerdictEvent(events);
    return !!payload && payload.knowledge_lens_matched_entry_ids === undefined;
  }, [events]);

  // R12-AB-1 (ADR-VA-R12-1): the sampling spot-review panel. Same
  // double-click hazard as every other append-only write here — a
  // synchronous ref guard, copying handleFileDissent's exact pattern.
  const [samplingReviewerName, setSamplingReviewerName] = useState('');
  const [samplingNote, setSamplingNote] = useState('');
  const [samplingBusy, setSamplingBusy] = useState(false);
  const [samplingError, setSamplingError] = useState<string | null>(null);
  const [samplingResult, setSamplingResult] = useState<string | null>(null);
  const samplingInFlight = useRef(false);

  async function handleSamplingReview() {
    if (samplingInFlight.current) return;
    samplingInFlight.current = true;
    setSamplingBusy(true);
    setSamplingError(null);
    try {
      if (!latestVerdict) {
        setSamplingError('There is no verdict here, so there is nothing to spot-review.');
        return;
      }
      if (!samplingReviewerName.trim()) {
        setSamplingError('Enter your name. The spot review is recorded permanently, so the record says who did it.');
        return;
      }
      await appendAuditEvent({
        event_id: crypto.randomUUID(),
        use_case_id: useCaseId,
        event_type: 'sampling_reviewed',
        occurred_at: new Date().toISOString(),
        actor: role,
        payload: {
          type: 'sampling_reviewed',
          verdict_id: latestVerdict.id,
          reviewed_by_name: samplingReviewerName.trim(),
          ...(samplingNote.trim() ? { outcome_note: samplingNote.trim() } : {}),
        },
      });
      setSamplingResult('Sampling review recorded in the audit trail.');
      setSamplingReviewerName('');
      setSamplingNote('');
      await load();
    } catch (err) {
      setSamplingError(`Recording the review failed: ${err instanceof Error ? err.message : String(err)}.`);
      await load();
    } finally {
      samplingInFlight.current = false;
      setSamplingBusy(false);
    }
  }

  // ADR-EE-R11-2: reuses handleFileDissent's exact write path — the same
  // event type (`rule_dissent_filed`), the same appendAuditEvent call
  // shape, no new event type. `rule_id` carries the risk_domain (not a
  // rule id) so the record is honest about what is being filed. One click
  // writes exactly one event (R4's advisory-by-construction guarantee).
  async function handleFileKnowledgeGap(match: KnowledgeMatch) {
    if (gapInFlight.current) return;
    gapInFlight.current = true;
    setGapBusyEntryId(match.entry.id);
    setGapError(null);
    try {
      if (!latestVerdict) return;
      await appendAuditEvent({
        event_id: crypto.randomUUID(),
        use_case_id: useCaseId,
        event_type: 'rule_dissent_filed',
        occurred_at: new Date().toISOString(),
        actor: role,
        payload: {
          type: 'rule_dissent_filed',
          verdict_id: latestVerdict.id,
          rule_id: match.entry.risk_domain,
          dissent: `Coverage gap: no firm or pack rule currently addresses ${match.entry.risk_domain} (${match.entry.risk_subdomain}).`,
          filed_by_name: `${role} (risk-knowledge lens, ${match.entry.source_attribution})`,
        },
      });
      await load();
    } catch (err) {
      setGapError(`Filing the coverage gap failed: ${err instanceof Error ? err.message : String(err)}.`);
    } finally {
      gapInFlight.current = false;
      setGapBusyEntryId(null);
    }
  }

  // R8-SC-4: the reviewer sees precedent where they sign. Same derivation
  // as the intake panel; presentation-only, never engine input.
  const [precedents, setPrecedents] = useState<EnrichedPrecedent[]>([]);
  useEffect(() => {
    if (!summary) return;
    let cancelled = false;
    void (async () => {
      const rows = await getUseCases('all');
      const candidates: PrecedentCandidate[] = rows
        .filter((r) => r.current_verdict_status !== null)
        .map((r) => ({
          id: r.use_case_id,
          label: r.label,
          description: r.description,
          status: r.current_verdict_status!,
          tier: r.tier,
          track: r.track,
          decided_at: r.last_evaluated_at,
          policy_version: r.policy_version_at_evaluation,
        }));
      const matches = findPrecedents(
        { label: summary.label, description: summary.description },
        candidates,
        summary.use_case_id,
      );
      const enriched: EnrichedPrecedent[] = [];
      for (const m of matches) {
        const evs = await getAuditEvents(m.id);
        const payload = findLatestVerdictEvent(evs);
        const verdict = payload ? (payload.type === 'verdict_produced' ? payload.verdict : payload.new_verdict) : null;
        enriched.push({ ...m, controls: verdict?.controls ?? [] });
      }
      if (!cancelled) setPrecedents(enriched);
    })();
    return () => {
      cancelled = true;
    };
    // Delta review 005 finding 2: keyed on the fields the search READS, not
    // object identity — load() rebuilds `summary` after every 2LoD action,
    // and re-reading the whole register to redraw an unchanged list is
    // waste. eslint disabled deliberately for the same reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary?.use_case_id, summary?.label, summary?.description]);

  const load = useCallback(async () => {
    const [s, evs] = await Promise.all([
      getUseCase(useCaseId, undefined, policy?.sampling_rate),
      getAuditEvents(useCaseId),
    ]);
    setSummary(s ?? null);
    setEvents(evs);
  }, [useCaseId, policy?.sampling_rate]);

  useEffect(() => {
    void load();
  }, [load]);

  // LC-2/LC-3: decision event first, then the stage change it causes
  // (updateLifecycleStage itself appends lifecycle_stage_changed).
  /** §13.4. Read the trail at write time to DETECT a change, and compare it
   *  against what was rendered. That is not the same as deriving the id to
   *  write: a second "latest event" lookup used as the value would record an
   *  attestation against a verdict the reviewer never saw, which is precisely
   *  the race this closes. Returns true when it is safe to proceed. */
  async function verdictToAttest(): Promise<Verdict | null> {

    // Code review round 3, Panel B. Both writers fell back to
    // `verdict_id: ''` when there was no verdict — an attestation that
    // satisfies the type and points at nothing, which is the hole P8-C08's
    // verdict_id was added to close. Refusing is the honest answer: there is
    // nothing to attest to, so nothing is recorded.
    if (!latestVerdict) {
      setActionError(
        'There is no verdict to attest to for this use case, so nothing was recorded. Run a pre-check first, then sign off against the verdict it produces.',
      );
      return null;
    }

    // An attestation nobody is named on is the defect this closes. Refusing is
    // the honest answer; recording an anonymous one is not.
    if (!attestedByName.trim()) {
      setActionError('Enter your name before signing off. The attestation records who accepted this verdict.');
      return null;
    }

    const fresh = await getAuditEvents(useCaseId);
    const payload = findLatestVerdictEvent(fresh);
    const currentId = payload
      ? payload.type === 'verdict_produced'
        ? payload.verdict.id
        : payload.new_verdict.id
      : null;
    if (currentId === latestVerdict.id) return latestVerdict;

    setActionError(
      'The verdict changed while you were reading it, so nothing was recorded. Someone corrected and re-evaluated this use case after you opened the page. Reload to see the current verdict, then sign off against that.',
    );
    await load();
    return null;
  }

  async function handleApprove() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const attesting = await verdictToAttest();
      if (!attesting) return;
      await appendAuditEvent({
        event_id: crypto.randomUUID(),
        use_case_id: useCaseId,
        event_type: 'twoloD_reviewed',
        occurred_at: new Date().toISOString(),
        actor: role,
        payload: {
          type: 'twoloD_reviewed',
          action: 'approved',
          verdict_id: attesting.id,
          attested_by_name: attestedByName.trim(),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });
      await updateLifecycleStage(useCaseId, 'approved', role);
      setActionResult('Approved by 2LoD — lifecycle advanced to Approved. Recorded in the audit trail.');
      setNotes('');
      setAttestedByName('');
      await load();
    } catch (err) {
      setActionError(`Action failed: ${err instanceof Error ? err.message : String(err)}. Check the timeline below for what was recorded.`);
      await load();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function handleRequestCorrection() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const attesting = await verdictToAttest();
      if (!attesting) return;
      await appendAuditEvent({
        event_id: crypto.randomUUID(),
        use_case_id: useCaseId,
        event_type: 'twoloD_reviewed',
        occurred_at: new Date().toISOString(),
        actor: role,
        payload: {
          type: 'twoloD_reviewed',
          action: 'correction_requested',
          verdict_id: attesting.id,
          attested_by_name: attestedByName.trim(),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });
      setActionResult('Correction requested — recorded in the audit trail. The submitter re-runs intake to correct and re-evaluate.');
      setNotes('');
      setAttestedByName('');
      await load();
    } catch (err) {
      setActionError(`Action failed: ${err instanceof Error ? err.message : String(err)}. Check the timeline below for what was recorded.`);
      await load();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function handleFileDissent() {
    if (dissentInFlight.current) return;
    dissentInFlight.current = true;
    setDissentBusy(true);
    setDissentError(null);
    try {
      // Same refuse-rather-than-record posture as the sign-off actions: a
      // dissent that names nobody, no rule, or no reason is noise on an
      // append-only record that cannot be cleaned up.
      if (!latestVerdict) {
        setDissentError('There is no verdict here, so there is no rule application to challenge. Run a pre-check first.');
        return;
      }
      const fromList = dissentRuleId && dissentRuleId !== '__other__';
      const ruleRef = fromList ? dissentRuleId : dissentOtherRef.trim();
      if (!ruleRef) {
        setDissentError('Name the rule you are challenging — pick one the verdict relied on, or type its reference.');
        return;
      }
      if (!dissentText.trim()) {
        setDissentError('Say why the rule is wrong, too broad, or missing a distinction. A challenge with no reasoning gives the rule authors nothing to act on.');
        return;
      }
      if (!dissentByName.trim()) {
        setDissentError('Enter your name. The challenge is recorded permanently, so the record says who filed it.');
        return;
      }
      const label = fromList ? challengeableRules.find((r) => r.id === dissentRuleId)?.label : undefined;
      await appendAuditEvent({
        event_id: crypto.randomUUID(),
        use_case_id: useCaseId,
        event_type: 'rule_dissent_filed',
        occurred_at: new Date().toISOString(),
        actor: role,
        payload: {
          type: 'rule_dissent_filed',
          // The verdict the challenger was shown — threaded from the render,
          // like the attestation's verdict_id (§13.4).
          verdict_id: latestVerdict.id,
          rule_id: ruleRef,
          ...(label && label !== ruleRef ? { rule_label: label } : {}),
          dissent: dissentText.trim(),
          filed_by_name: dissentByName.trim(),
        },
      });
      setDissentResult(
        'Challenge recorded in the audit trail and queued for the rule authors. The verdict on this page is unchanged — a dissent never overrides it.',
      );
      setDissentRuleId('');
      setDissentOtherRef('');
      setDissentText('');
      setDissentByName('');
      setDissentOpen(false);
      await load();
    } catch (err) {
      setDissentError(`Filing failed: ${err instanceof Error ? err.message : String(err)}. Check the timeline below for what was recorded.`);
      await load();
    } finally {
      dissentInFlight.current = false;
      setDissentBusy(false);
    }
  }

  if (!summary) {
    return (
      <section className="card register-detail">
        <button type="button" className="register-detail__back" onClick={onBack}>
          ← register
        </button>
        <p>Loading…</p>
      </section>
    );
  }

  // BC-V12A-03: gated on role AND stage in JSX, not CSS.
  const showActionBar = role === '2LoD' && summary.lifecycle_stage === 'pre_checked' && !actionResult;

  return (
    <section className="card register-detail">
      <button type="button" className="register-detail__back" onClick={onBack}>
        ← register
      </button>

      <h2>{summary.label}</h2>
      <p className="register-detail__meta">
        <code>{summary.use_case_id.slice(0, 8)}</code> · submitted by {summary.submitted_by} ·{' '}
        {new Date(summary.submitted_at).toLocaleDateString()}
      </p>
      <div className="register-detail__chips">
        <span className="graph-node__chip">Tier: {summary.tier ?? '—'}</span>
        <span className="graph-node__chip">Track: {summary.track ?? '—'}</span>
        <span className="graph-node__chip">
          {summary.current_verdict_status ? STATUS_LABEL[summary.current_verdict_status] : 'No verdict'}
        </span>
        {/* §13.3: a qualifier, not a fourth status. */}
        {summary.provisional && <span className="graph-node__chip">Provisional</span>}
        <span
          className={`register-stage register-stage--${summary.lifecycle_stage}`}
          data-stage={summary.lifecycle_stage}
        >
          {STAGE_LABELS[summary.lifecycle_stage]}
        </span>
      </div>
      {/* R13-UI-5: a gap must not hide below the fold. Renders ONLY when an
          uncovered risk class exists for this case; no gaps, no notice. */}
      {knowledgeLensMatches.some((m) => !m.covered) && (
        <p className="knowledge-lens__top-notice" role="note">
          {knowledgeLensMatches.filter((m) => !m.covered).length} known risk class
          {knowledgeLensMatches.filter((m) => !m.covered).length === 1 ? ' has' : 'es have'} no covering rule —
          see the risk-knowledge panel below.
        </p>
      )}
      {/* R5 follow-up: tier and track in plain words, from the same shared
          copy file as the form and the graph review. Rendered only when the
          value has a meaning — an unknown value gets no invented sentence. */}
      {(summary.tier && TIER_MEANINGS[summary.tier]) || (summary.track && TRACK_MEANINGS[summary.track]) ? (
        <p className="register-detail__chip-legend">
          {summary.tier && TIER_MEANINGS[summary.tier] && (
            <>
              <strong>{summary.tier} tier</strong> means {TIER_MEANINGS[summary.tier]}{' '}
            </>
          )}
          {summary.track && TRACK_MEANINGS[summary.track] && (
            <>
              <strong>Track {summary.track}</strong> means it is {TRACK_MEANINGS[summary.track]}
            </>
          )}
        </p>
      ) : null}

      {/* ADR-RL-R3-1 / §15.1. The verdict a reviewer is being asked to attest
          to, rendered from the persisted record rather than recomputed.
          `graph` is deliberately not passed: it is not persisted on the
          register entry, so the provenance panel would render empty here
          (ADR-RL-R3-1 consequences). `onCorrect` is not passed either —
          correction is a submitter action (§15.1b, P8-C06). */}
      {latestVerdict ? (
        <>
          {!latestVerdict.explanation && (
            <p className="register-detail__legacy-note" role="status">
              This verdict predates explanation capture, so the binding reason and the triggered
              invariants were not recorded for it. What was recorded is shown below. An empty list
              here would say &ldquo;nothing was triggered&rdquo;, which is a stronger claim than the
              record supports.
            </p>
          )}
          {/* The submitter's optional attestation note (2026-08-15). Placed
              ABOVE the verdict, because the reviewer should read the human
              context before the machine's answer — and framed so it cannot be
              mistaken for something the engine weighed. Most recent
              graph_confirmed wins: a re-attestation supersedes. */}
          {/* R6-CX-1: contexts the submitter typed on question answers —
              rendered with the note, same rules: human-read, never engine
              input, most recent attestation wins. */}
          {(() => {
            const contexts = [...events]
              .reverse()
              .map((ev) => (ev.payload.type === 'graph_confirmed' ? ev.payload.answer_contexts : undefined))
              .find((c) => c && c.length > 0);
            return contexts ? (
              <div className="register-detail__submitter-note">
                <h3>Context from the submitter&rsquo;s answers</h3>
                <ul className="register-detail__submitter-note-body">
                  {contexts.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <p className="register-detail__submitter-note-caveat">
                  Typed alongside individual answers, for you. The rules did not read it.
                </p>
              </div>
            ) : null;
          })()}
          {(() => {
            const note = [...events]
              .reverse()
              .map((ev) => (ev.payload.type === 'graph_confirmed' ? ev.payload.submitter_note : undefined))
              .find((n) => Boolean(n));
            return note ? (
              <div className="register-detail__submitter-note">
                <h3>Note from the submitter</h3>
                <p className="register-detail__submitter-note-body">{note}</p>
                <p className="register-detail__submitter-note-caveat">
                  Written at attestation, for you. The rules did not read it — the verdict below is
                  computed only from the structured answers.
                </p>
              </div>
            ) : null;
          })()}
          <VerdictDisplay
            verdict={latestVerdict}
            auditEvents={events}
            policy={policy}
            registerStage={summary.lifecycle_stage}
            memoLabel={summary.label}
            memoDescription={summary.description}
            knowledgeLensMatches={knowledgeLensMatches}
            // R15-C2 (proposal §3.1, S2): same condition the action bar
            // below already renders on — 2LoD role, stage awaiting sign-off.
            showSignOffChecklist={showActionBar}
            hasRiskKnowledgeSection={knowledgeLensMatches.length > 0 || lensNotEvaluated}
          />
          {/* R15-C2: id target for VerdictDisplay's section nav / sign-off
              checklist "Risk knowledge" jump link — this panel lives outside
              VerdictDisplay, so the anchor has to sit here. */}
          <div id="risk-knowledge-section">
            {knowledgeLensMatches.length > 0 && (
              <KnowledgeLensPanel
                matches={knowledgeLensMatches}
                onFileCoverageGap={(m) => void handleFileKnowledgeGap(m)}
                gapBusyEntryId={gapBusyEntryId}
                filedRiskDomains={filedRiskDomains}
                meta={knowledgeLensMeta}
              />
            )}
            {/* R13-UI-4: silent absence was indistinguishable from "no
                matches". Say which one it is. */}
            {lensNotEvaluated && (
              <p className="knowledge-lens__not-evaluated">
                Not evaluated against the risk-knowledge taxonomy — this case was decided before that check
                existed. A re-evaluation would include it.
              </p>
            )}
          </div>
          {gapError && (
            <p role="alert" className="register-detail__gap-error">
              {gapError}
            </p>
          )}
        </>
      ) : (
        <p className="register-detail__no-verdict" role="status">
          No verdict is recorded for this use case. Nothing has been evaluated against the appetite
          rules, so there is no decision, no control set and no citation to review. Sign-off remains
          available, but it attests to the record as it stands — which is empty.
        </p>
      )}

      <SimilarCases matches={precedents} />

      {showActionBar && (
        <div className="register-detail__actionbar">
          <p className="register-detail__actionbar-title">
            {summary.tier ?? 'This'} tier — awaiting 2LoD action (LC-2). This use case cannot advance to Approved
            until you sign off.
          </p>
          {/* R15-C2, skeptic amendment S3 (Must): the role indicator carries
              the same no-sign-in honesty at the point of approval, not only
              in the header (App.tsx's "Viewing as" note, R15-C1). This is a
              new string, distinct from the "Your name" field's own
              G5-protected caveat below, which is left untouched. */}
          <p className="register-detail__actionbar-role-note">
            Signing off as 2LoD — a view preference, not a permission; this build has no sign-in.
          </p>
          <label htmlFor="twolod-name">Your name</label>
          <input
            id="twolod-name"
            type="text"
            value={attestedByName}
            onChange={(e) => setAttestedByName(e.target.value)}
          />
          {/* The product has no backend to authenticate against. Saying so is
              the same choice it makes about the audit trail being client-side
              and about pack rules being unadopted — state the limit, do not
              let the record imply more than it can support. */}
          <p className="field-help">
            Recorded on the attestation so the trail says who accepted this verdict. It is
            self-asserted — this build has no sign-in, so the name is not verified.
          </p>
          <label htmlFor="twolod-notes">Notes (optional)</label>
          <input
            id="twolod-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="register-detail__actions">
            <button type="button" className="register-detail__approve" disabled={busy} onClick={() => void handleApprove()}>
              Approve
            </button>
            <button type="button" disabled={busy} onClick={() => void handleRequestCorrection()}>
              Request correction
            </button>
          </div>
        </div>
      )}

      {/* R12-AB-1 (ADR-VA-R12-1): the automation-bias countermeasure — a
          deterministically selected self-served Low-tier verdict gets a
          human spot review. 2LoD-only; renders only until the review is
          recorded (summary.sampling_review_due goes false once the
          sampling_reviewed event lands and the row is reloaded). */}
      {role === '2LoD' && summary.sampling_review_due && !samplingResult && (
        <div className="register-detail__sampling">
          <h3>Sampling spot review due</h3>
          <p className="field-help">
            This self-served case was deterministically selected (1 in {policy?.sampling_rate ?? '?'}).
          </p>
          <label htmlFor="sampling-reviewer-name">Your name</label>
          <input
            id="sampling-reviewer-name"
            type="text"
            value={samplingReviewerName}
            onChange={(e) => setSamplingReviewerName(e.target.value)}
          />
          <label htmlFor="sampling-note">Note (optional)</label>
          <input
            id="sampling-note"
            type="text"
            value={samplingNote}
            onChange={(e) => setSamplingNote(e.target.value)}
          />
          <button type="button" disabled={samplingBusy} onClick={() => void handleSamplingReview()}>
            Record spot review
          </button>
          {samplingError && (
            <p role="alert" className="register-detail__error">
              {samplingError}
            </p>
          )}
        </div>
      )}
      {samplingResult && (
        <p className="register-detail__result" role="status">
          {samplingResult}
        </p>
      )}

      {actionResult && (
        <p className="register-detail__result" role="status">
          {actionResult}
        </p>
      )}

      {actionError && (
        <p role="alert" className="register-detail__error">
          {actionError}
        </p>
      )}

      {/* Rule dissent (FN-009). Deliberately NOT gated on lifecycle stage:
          a rule can be wrong on a case that already advanced, and the point
          of the queue is to catch that. Gated on role + a verdict existing —
          without a verdict no rule was applied, so there is nothing to
          challenge. */}
      {role === '2LoD' && latestVerdict && (
        <div className="register-detail__dissent">
          {!dissentOpen && !dissentResult && (
            <button type="button" className="register-detail__dissent-toggle" onClick={() => setDissentOpen(true)}>
              Challenge a rule…
            </button>
          )}
          {dissentOpen && (
            <div className="register-detail__dissent-form">
              <h3>Challenge a rule</h3>
              <p className="field-help">
                This disputes a <strong>rule</strong>, not this use case. The verdict stands unchanged
                — the challenge is recorded permanently and goes to the rule-improvement queue for the
                people who author the rulebook.
              </p>
              <label htmlFor="dissent-rule">Rule being challenged</label>
              <select id="dissent-rule" value={dissentRuleId} onChange={(e) => setDissentRuleId(e.target.value)}>
                <option value="">— pick a rule this verdict relied on —</option>
                {challengeableRules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id === r.label ? r.id : `${r.id} — ${r.label}`}
                  </option>
                ))}
                <option value="__other__">A rule not listed here…</option>
              </select>
              {dissentRuleId === '__other__' && (
                <>
                  <label htmlFor="dissent-rule-ref">Rule reference</label>
                  <input
                    id="dissent-rule-ref"
                    type="text"
                    value={dissentOtherRef}
                    onChange={(e) => setDissentOtherRef(e.target.value)}
                  />
                  <p className="field-help">
                    Typed by you, so it is recorded as a reference — the queue will not resolve it
                    against the rulebook.
                  </p>
                </>
              )}
              <label htmlFor="dissent-text">Why the rule is wrong here</label>
              <textarea
                id="dissent-text"
                rows={3}
                value={dissentText}
                onChange={(e) => setDissentText(e.target.value)}
              />
              {/* "Filed by", not "Your name": the sign-off bar above already
                  has a "Your name" input, and two identical labels on one
                  page are ambiguous for screen readers and label queries. */}
              <label htmlFor="dissent-name">Filed by</label>
              <input
                id="dissent-name"
                type="text"
                value={dissentByName}
                onChange={(e) => setDissentByName(e.target.value)}
              />
              <p className="field-help">
                Self-asserted — this build has no sign-in, so the name is not verified.
              </p>
              <div className="register-detail__actions">
                <button type="button" disabled={dissentBusy} onClick={() => void handleFileDissent()}>
                  File the challenge
                </button>
                <button
                  type="button"
                  disabled={dissentBusy}
                  onClick={() => {
                    setDissentOpen(false);
                    setDissentError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {dissentResult && (
            <p className="register-detail__result" role="status">
              {dissentResult}
            </p>
          )}
          {dissentError && (
            <p role="alert" className="register-detail__error">
              {dissentError}
            </p>
          )}
        </div>
      )}

      <div className="register-detail__timeline">
        <h3>Audit trail (VD-4 / NF-2) · append-only</h3>
        {/* explore-002 observation: the heading previously read "Immutable
            audit trail" with this caveat placed BELOW the event list, so the
            strong word was read first and the qualifier last — if at all, on
            a long trail. "Immutable" also overstates what a browser-held
            store can support. The caveat now sits directly under the heading,
            before any event. */}
        <p className="register-detail__caveat">
          Append-only by construction: nothing here can be edited or deleted through the application.
          But this is V1 — the trail is held in your browser, so it is proof-of-concept grade, not
          tamper-evident against anyone with access to this machine (NF-2).
        </p>
        <ul className="timeline">
          {events.map((event) => (
            <li key={event.event_id} className="timeline__row">
              <span className={`timeline__dot timeline__dot--${event.event_type}`} aria-hidden="true" />
              <div className="timeline__body">
                <div className="timeline__head">
                  <code className="timeline__type">{event.event_type}</code>
                  <span className="timeline__actor">{event.actor}</span>
                  <span className="timeline__time">{new Date(event.occurred_at).toLocaleString()}</span>
                </div>
                <p className="timeline__detail">{eventDetail(event)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
