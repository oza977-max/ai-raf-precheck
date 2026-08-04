import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getUseCase, updateLifecycleStage, findLatestVerdictEvent } from '../store/register';
import { getAll as getAuditEvents, append as appendAuditEvent } from '../store/audit';
import VerdictDisplay from './VerdictDisplay';
import type { AuditEvent, UseCaseSummary } from '../store/types';
import type { PolicyFile } from '../engine/types';

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
      return `Attested. Graph v${p.graph_version}, ${p.corrections_count} correction${p.corrections_count === 1 ? '' : 's'}.`;
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
      return `${p.action.replace('_', ' ')}${p.notes ? ` — ${p.notes}` : ''}`;
    case 'reasoning_trace_generated':
      return 'Plain-English reasoning trace generated and stored with the verdict (VD-8).';
  }
}

export default function RegisterDetail({ useCaseId, role, policy, onBack }: RegisterDetailProps) {
  const [summary, setSummary] = useState<UseCaseSummary | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [notes, setNotes] = useState('');
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Review finding, pass 1: a double-click fires the async handler twice
  // before React re-renders the disabled state, writing DUPLICATE events
  // into the append-only audit trail — which cannot be cleaned up by
  // design (VD-4/NF-2). A ref is synchronous where state is not (same
  // lesson as P7-C01's in-flight seed guard).
  const inFlight = useRef(false);

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

  const load = useCallback(async () => {
    const [s, evs] = await Promise.all([getUseCase(useCaseId), getAuditEvents(useCaseId)]);
    setSummary(s ?? null);
    setEvents(evs);
  }, [useCaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  // LC-2/LC-3: decision event first, then the stage change it causes
  // (updateLifecycleStage itself appends lifecycle_stage_changed).
  async function handleApprove() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await appendAuditEvent({
        event_id: crypto.randomUUID(),
        use_case_id: useCaseId,
        event_type: 'twoloD_reviewed',
        occurred_at: new Date().toISOString(),
        actor: role,
        payload: { type: 'twoloD_reviewed', action: 'approved', ...(notes.trim() ? { notes: notes.trim() } : {}) },
      });
      await updateLifecycleStage(useCaseId, 'approved', role);
      setActionResult('Approved by 2LoD — lifecycle advanced to Approved. Recorded in the audit trail.');
      setNotes('');
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
      await appendAuditEvent({
        event_id: crypto.randomUUID(),
        use_case_id: useCaseId,
        event_type: 'twoloD_reviewed',
        occurred_at: new Date().toISOString(),
        actor: role,
        payload: {
          type: 'twoloD_reviewed',
          action: 'correction_requested',
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });
      setActionResult('Correction requested — recorded in the audit trail. The submitter re-runs intake to correct and re-evaluate.');
      setNotes('');
      await load();
    } catch (err) {
      setActionError(`Action failed: ${err instanceof Error ? err.message : String(err)}. Check the timeline below for what was recorded.`);
      await load();
    } finally {
      inFlight.current = false;
      setBusy(false);
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
        <span className={`register-stage register-stage--${summary.lifecycle_stage}`}>{summary.lifecycle_stage}</span>
      </div>

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
          <VerdictDisplay
            verdict={latestVerdict}
            auditEvents={events}
            policy={policy}
            registerStage={summary.lifecycle_stage}
          />
        </>
      ) : (
        <p className="register-detail__no-verdict" role="status">
          No verdict is recorded for this use case. Nothing has been evaluated against the appetite
          rules, so there is no decision, no control set and no citation to review. Sign-off remains
          available, but it attests to the record as it stands — which is empty.
        </p>
      )}

      {showActionBar && (
        <div className="register-detail__actionbar">
          <p className="register-detail__actionbar-title">
            {summary.tier ?? 'This'} tier — awaiting 2LoD action (LC-2). This use case cannot advance to Approved
            until you sign off.
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
