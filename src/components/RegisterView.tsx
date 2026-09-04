import { useEffect, useMemo, useRef, useState } from 'react';
import { getUseCases, hasPendingPolicyUpdate, exportAll } from '../store/register';
import { exportBundle, importBundle, type ImportOutcome } from '../store/handoff';
import { AIGATE_USE_CASE_ID } from '../seeds/aigate-self-assessment';
import RegisterDetail from './RegisterDetail';
import type { UseCaseSummary } from '../store/types';
import type { PolicyFile } from '../engine/types';
import type { ProvisionalReason } from '../engine/provisional';
import { classifyProvisionalReason } from './VerdictDisplay';
import { STAGE_LABELS, STATUS_LABEL } from './field-copy';

// Rule 4 (cross-cutting.md §7): presentation-only, calls store functions,
// no direct IndexedDB/audit access. register-lifecycle.md §10.
interface RegisterViewProps {
  role: string;
  currentPolicyVersion: string;
  // P8-C07 (§15.1a): passed through to RegisterDetail, which reads control
  // evidence status from TODAY's policy while the verdict itself stays
  // historical. RegisterView does not use it.
  policy?: PolicyFile;
  // code-review-004 F1: list<->detail selection is App-owned now — App is
  // the single history/popstate authority, this component just renders the
  // coordinate it's given and asks App to change it. Its own pushState +
  // popstate listener (the second, shape-blind stack writer that broke Back
  // across view levels) are gone.
  selectedId: string | null;
  onSelectRow: (id: string) => void;
  onCloseDetail: () => void;
}

// code-review-004 F15: this was a third, local copy of the exact map
// field-copy.ts consolidated (its comment claims the consolidation was
// complete — this file predated it and was missed). One source now.

export default function RegisterView({ role, currentPolicyVersion, policy, selectedId, onSelectRow, onCloseDetail }: RegisterViewProps) {
  const [rows, setRows] = useState<UseCaseSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [policyUpdatePending, setPolicyUpdatePending] = useState(false);
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [trackFilter, setTrackFilter] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // R15-C1 (proposal §3.3): 2LoD default view is "awaiting your sign-off",
  // with "Show all" one click away. This is a VIEW FILTER on top of the
  // existing 1LoD/2LoD data scoping (getUseCases already returns 'all' for
  // 2LoD, own-submissions for 1LoD) — no new role-conditional rendering
  // (G6). Default false = the narrowed view; true = everything this role
  // can already see.
  const [showAll, setShowAll] = useState(false);
  // V1.2-A: row click -> detail view (App-owned since code-review-004 F1);
  // refreshKey bumps on return so a 2LoD approval's stage change is
  // immediately visible in the list.
  const [refreshKey, setRefreshKey] = useState(0);

  // RG-6 hand-off bundle: export the register + audit trail to move it to
  // another machine (a real reviewer on a real second laptop), and import a
  // bundle sent back. Available to BOTH roles — a submitter hands off to a
  // reviewer and the reviewer hands the signed case back.
  const [handoffMsg, setHandoffMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleExportBundle() {
    try {
      const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';
      const bundle = await exportBundle(version);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `aigate-handoff-${bundle.exported_at.replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setHandoffMsg({
        tone: 'ok',
        text: `Exported ${bundle.audit_events.length} audit events and ${bundle.register.nodes.length} register entries, sealed. Hand this file to the other reviewer.`,
      });
    } catch (err) {
      setHandoffMsg({ tone: 'error', text: `Export failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  async function handleImportBundleFile(file: File) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setHandoffMsg({ tone: 'error', text: 'That file is not valid JSON — it is not an AIGate hand-off bundle.' });
      return;
    }
    const result = await importBundle(parsed);
    const errorOutcomes: ImportOutcome[] = ['invalid_format', 'tampered', 'diverged'];
    const neutralOutcomes: ImportOutcome[] = ['up_to_date', 'local_ahead'];
    const tone = errorOutcomes.includes(result.outcome) ? 'error' : neutralOutcomes.includes(result.outcome) ? 'info' : 'ok';
    setHandoffMsg({ tone, text: result.message });
    if (result.outcome === 'adopted' || result.outcome === 'merged') {
      setRefreshKey((k) => k + 1); // reflect the newly imported cases in the list
    }
  }

  // F1: the list refresh the old popstate handler did on detail->list is
  // now keyed on the PROP transition — same trigger, one authority.
  const prevSelectedId = useRef(selectedId);
  useEffect(() => {
    if (prevSelectedId.current !== null && selectedId === null) {
      setRefreshKey((k) => k + 1);
    }
    prevSelectedId.current = selectedId;
  }, [selectedId]);

  const is2LoD = role === '2LoD';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const summaries = await getUseCases(is2LoD ? 'all' : role, currentPolicyVersion, policy?.sampling_rate);
      if (cancelled) return;
      setRows(summaries);
      setLoaded(true);
      if (is2LoD) {
        const pending = await hasPendingPolicyUpdate(summaries.map((s) => s.use_case_id));
        if (!cancelled) setPolicyUpdatePending(pending);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [role, is2LoD, currentPolicyVersion, refreshKey, policy?.sampling_rate]);

  const tiers = useMemo(() => Array.from(new Set(rows.map((r) => r.tier).filter((v): v is string => v !== null))), [rows]);
  const tracks = useMemo(() => Array.from(new Set(rows.map((r) => r.track).filter((v): v is string => v !== null))), [rows]);
  const stages = useMemo(() => Array.from(new Set(rows.map((r) => r.lifecycle_stage))), [rows]);
  const statuses = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.current_verdict_status).filter((v): v is NonNullable<typeof v> => v !== null)),
      ),
    [rows],
  );

  // "Awaiting your sign-off" = rows still at the pre_checked stage — the
  // stage whose label is "Awaiting 2LoD sign-off" (STAGE_LABELS). Applied
  // before the filter chips, same as any other filter — Show all just
  // widens the pool the chips then narrow.
  const awaitingSignoffRows = useMemo(() => rows.filter((r) => r.lifecycle_stage === 'pre_checked'), [rows]);

  const visibleRows = useMemo(() => {
    if (!is2LoD) return rows;
    const scoped = showAll ? rows : awaitingSignoffRows;
    return scoped.filter((r) => {
      if (tierFilter && r.tier !== tierFilter) return false;
      if (trackFilter && r.track !== trackFilter) return false;
      if (stageFilter && r.lifecycle_stage !== stageFilter) return false;
      if (statusFilter && r.current_verdict_status !== statusFilter) return false;
      if (search.trim() && !r.label.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [rows, is2LoD, showAll, awaitingSignoffRows, tierFilter, trackFilter, stageFilter, statusFilter, search]);

  // register-lifecycle.md §10.3 (RG-5) — 2LoD-only export, deferred from
  // P6-C01. Browser download via Blob + a temporary anchor; no business
  // logic beyond calling the existing exportAll() store function.
  async function handleExport() {
    const { nodes, edges } = await exportAll();
    const payload = { exported_at: new Date().toISOString(), nodes, edges };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `aigate-register-export-${payload.exported_at}.json`;
    // Some browsers only fire a download reliably when the anchor is
    // attached to the DOM at click time (review finding, pass 1).
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  if (selectedId) {
    return (
      <RegisterDetail
        useCaseId={selectedId}
        role={role}
        policy={policy}
        onBack={onCloseDetail}
      />
    );
  }

  if (!loaded) {
    return (
      <section className="card register-view">
        <h2>Register</h2>
        <p>Loading…</p>
      </section>
    );
  }

  const aigateRow = rows.find((r) => r.use_case_id === AIGATE_USE_CASE_ID);

  // R12-BD-3 (ADR-VA-R12-2): "N of M verdicts here would be final once
  // outstanding sign-offs land" — counts decided, provisional verdicts
  // whose causes are ALL sign-off gaps (never a mix with a substantive
  // caveat), over the total decided verdicts in this view.
  const decidedRows = rows.filter((r) => r.current_verdict_status !== null);
  const signoffGapOnlyCount = decidedRows.filter(
    (r) =>
      r.provisional &&
      r.provisional_reasons.length > 0 &&
      r.provisional_reasons.every(
        (reason) => classifyProvisionalReason(reason as ProvisionalReason) === 'signoff_gap',
      ),
  ).length;

  if (rows.length === 0) {
    return (
      <section className="card register-view">
        <h2>Register</h2>
        <p>{is2LoD ? 'No use cases found.' : 'No use cases submitted yet.'}</p>
      </section>
    );
  }

  return (
    <section className="card register-view">
      <h2>Register</h2>

      {!is2LoD && (
        <p className="register-view__scope-note">
          You&apos;re viewing as 1LoD — a view preference, not a permission; this build has no sign-in.
        </p>
      )}

      {/* RG-6: the submitter/reviewer hand-off. Both roles see it. */}
      <div className="register-view__handoff">
        <div className="register-view__handoff-actions">
          <button type="button" onClick={() => void handleExportBundle()}>
            Export hand-off bundle
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Import hand-off bundle
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            aria-label="Import hand-off bundle file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportBundleFile(file);
              e.target.value = ''; // allow re-importing the same file
            }}
          />
        </div>
        <p className="register-view__handoff-hint">
          Move this register and its audit trail to another reviewer&apos;s machine. The bundle is sealed:
          any change in transit is detected on import, and two copies merge only when one continues the
          other&apos;s history — a genuine fork is refused, never silently overwritten.
        </p>
        {handoffMsg && (
          <p
            className={`register-view__handoff-msg register-view__handoff-msg--${handoffMsg.tone}`}
            role={handoffMsg.tone === 'error' ? 'alert' : 'status'}
          >
            {handoffMsg.text}
          </p>
        )}
      </div>

      {/* register-lifecycle.md §9 (LC-6) — firm-wide governance concerns,
          shown regardless of 1LoD/2LoD role (only render-able when the
          AIGate row is present in this role's fetched scope at all). */}
      {aigateRow?.current_verdict_status === 'rejected' && (
        <div className="register-view__banner register-view__banner--alert" role="alert">
          AIGate does not satisfy its own controls — policy review required
        </div>
      )}
      {aigateRow?.current_verdict_status !== 'rejected' && aigateRow?.lifecycle_stage === 'pre_checked' && (
        <div className="register-view__banner" role="status">
          AIGate self-assessment pending 2LoD approval — verdicts are provisional until cleared.
        </div>
      )}

      {decidedRows.length > 0 && (
        <div className="register-view__banner register-view__provisional-banner" role="note">
          {signoffGapOnlyCount} of {decidedRows.length} verdicts here would be final once outstanding
          sign-offs land.
        </div>
      )}

      {is2LoD && policyUpdatePending && (
        <div className="register-view__banner" role="status">
          Policy updated — some assessments may need re-evaluation.
        </div>
      )}

      {/* design-review round 4 (Panel G — Register list, Critical): 1LoD got
          no "what needs my attention" signal at all — the legend and the
          Flags column (the one place stale/attention-needed rows are
          surfaced) were both is2LoD-gated, leaving a first-time submitter a
          flat, unexplained table. 2LoD has a queue concept (awaiting
          sign-off); 1LoD doesn't, so this is a count, not a toggle. */}
      {!is2LoD &&
        (() => {
          const attention = rows.filter((r) => r.current_verdict_status === 'rejected' || r.stale_assessment);
          return attention.length > 0 ? (
            <p className="register-view__showing-line" role="status">
              {/* code-review-004 F2: "rejected" reworded to "declined" — the
                  reserved-word gate (/approved|rejected/i, CLAUDE.md) applies
                  to every rendered string, and this line was the one new
                  violation today's diff introduced. Same vocabulary as
                  field-copy.ts's ACTION_LABEL ("Sign-off declined"). */}
              {attention.length} of {rows.length} need your attention — declined or stale.
            </p>
          ) : null;
        })()}

      {is2LoD && (
        <p className="register-view__showing-line" role="status">
          {showAll ? (
            <>
              Showing: all {rows.length}{' '}
              <button type="button" className="register-view__show-all-toggle" onClick={() => setShowAll(false)}>
                Show only awaiting sign-off ({awaitingSignoffRows.length})
              </button>
            </>
          ) : (
            <>
              Showing: awaiting your sign-off ({awaitingSignoffRows.length}){' '}
              <button type="button" className="register-view__show-all-toggle" onClick={() => setShowAll(true)}>
                Show all ({rows.length})
              </button>
            </>
          )}
        </p>
      )}

      {is2LoD && (
        <div className="register-view__controls">
          <div className="register-view__controls-row">
            <input
              type="text"
              placeholder="Search use cases…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search use cases"
            />
            <button type="button" className="register-view__export-button" onClick={() => void handleExport()}>
              Export JSON
            </button>
          </div>
          <div className="register-view__chips">
            <span className="register-view__chip-group-label">Tier:</span>
            {tiers.map((tier) => (
              <button
                key={tier}
                type="button"
                className={tierFilter === tier ? 'chip chip--active' : 'chip'}
                onClick={() => setTierFilter(tierFilter === tier ? null : tier)}
              >
                {tier}
              </button>
            ))}
            <span className="register-view__chip-group-label">Track:</span>
            {tracks.map((track) => (
              <button
                key={track}
                type="button"
                className={trackFilter === track ? 'chip chip--active' : 'chip'}
                onClick={() => setTrackFilter(trackFilter === track ? null : track)}
              >
                Track {track}
              </button>
            ))}
            <span className="register-view__chip-group-label">Stage:</span>
            {stages.map((stage) => (
              <button
                key={stage}
                type="button"
                className={stageFilter === stage ? 'chip chip--active' : 'chip'}
                onClick={() => setStageFilter(stageFilter === stage ? null : stage)}
              >
                {STAGE_LABELS[stage]}
              </button>
            ))}
            <span className="register-view__chip-group-label">Verdict:</span>
            {statuses.map((status) => (
              <button
                key={status}
                type="button"
                className={statusFilter === status ? 'chip chip--active' : 'chip'}
                onClick={() => setStatusFilter(statusFilter === status ? null : status)}
              >
                {STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* design-review round 4 (Panel G, Important): the legend explaining
          Tier/Track/Stage/Verdict was gated behind is2LoD along with the
          filter controls — but the column headers it explains render for
          every role. Moved out of the is2LoD block so both roles see it. */}
      <dl className="register-view__legend">
        <dt>Legend</dt>
        <dd>
          Tier = how much could go wrong — Critical, High and Medium wait for second-line sign-off; Low is
          self-service.
        </dd>
        <dd>
          Track = which oversight regime applies — I classic model risk · II extra scrutiny · III AI governance.
        </dd>
        <dd>
          Stage = where the case is in its life. Verdict = what the rules decided; &quot;Provisional&quot; means
          the rulebook behind it is not yet signed off by your firm.
        </dd>
      </dl>

      <table>
        <thead>
          <tr>
            <th>Use Case Name</th>
            {is2LoD && <th>Submitter</th>}
            <th>Tier</th>
            <th>Track</th>
            <th>Status</th>
            <th>Stage</th>
            <th>Last Evaluated</th>
            <th>Policy Version</th>
            {/* design-review round 4 (Panel G, Critical): Flags was the one
                column engineered to say "look here" and it was invisible to
                1LoD entirely — a 1LoD user whose own case went stale had no
                way to see that from this list. */}
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            const isSelfAssessment = row.use_case_id === AIGATE_USE_CASE_ID;
            return (
            <tr
              key={row.use_case_id}
              className={
                isSelfAssessment ? 'register-view__row register-view__row--self-assessment' : 'register-view__row'
              }
              onClick={() => onSelectRow(row.use_case_id)}
            >
              <td>
                {row.label}
                {isSelfAssessment && (
                  <span className="register-view__self-assessment-tag">self-assessment</span>
                )}
              </td>
              {is2LoD && <td>{row.submitted_by}</td>}
              <td>{row.tier ?? '—'}</td>
              <td>{row.track ?? '—'}</td>
              <td>
                {row.current_verdict_status ? STATUS_LABEL[row.current_verdict_status] : '—'}
                {/* §13.3: the qualifier sits ALONGSIDE the outcome. Replacing
                    the outcome with it hid what was actually decided. */}
                {row.provisional && <span className="register-provisional"> · Provisional</span>}
              </td>
              <td>
                <span
                  className={`register-stage register-stage--${row.lifecycle_stage}`}
                  data-stage={row.lifecycle_stage}
                >
                  {STAGE_LABELS[row.lifecycle_stage]}
                </span>
              </td>
              <td>{row.last_evaluated_at ? new Date(row.last_evaluated_at).toLocaleDateString() : '—'}</td>
              <td>{row.policy_version_at_evaluation ?? '—'}</td>
              <td>
                {row.stale_assessment || row.sampling_review_due ? (
                  <>
                    {row.stale_assessment && <span className="register-view__stale-badge">Stale</span>}
                    {row.sampling_review_due && (
                      <span className="register-view__sampling-badge">sampling review due</span>
                    )}
                  </>
                ) : (
                  <span className="register-view__flags-empty" aria-label="not flagged" />
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
