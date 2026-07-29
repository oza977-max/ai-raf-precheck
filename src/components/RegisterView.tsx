import { useEffect, useMemo, useState } from 'react';
import { getUseCases, hasPendingPolicyUpdate, exportAll } from '../store/register';
import { AIGATE_USE_CASE_ID } from '../seeds/aigate-self-assessment';
import RegisterDetail from './RegisterDetail';
import type { UseCaseSummary } from '../store/types';

// Rule 4 (cross-cutting.md §7): presentation-only, calls store functions,
// no direct IndexedDB/audit access. register-lifecycle.md §10.
interface RegisterViewProps {
  role: string;
  currentPolicyVersion: string;
}

const STATUS_LABEL: Record<NonNullable<UseCaseSummary['current_verdict_status']>, string> = {
  approved: 'Approved',
  approved_with_controls: 'Approved with controls',
  rejected: 'Rejected',
};

export default function RegisterView({ role, currentPolicyVersion }: RegisterViewProps) {
  const [rows, setRows] = useState<UseCaseSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [policyUpdatePending, setPolicyUpdatePending] = useState(false);
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [trackFilter, setTrackFilter] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // V1.2-A: row click -> detail view; refreshKey bumps on return so a
  // 2LoD approval's stage change is immediately visible in the list.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const is2LoD = role === '2LoD';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const summaries = await getUseCases(is2LoD ? 'all' : role, currentPolicyVersion);
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
  }, [role, is2LoD, currentPolicyVersion, refreshKey]);

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

  const visibleRows = useMemo(() => {
    if (!is2LoD) return rows;
    return rows.filter((r) => {
      if (tierFilter && r.tier !== tierFilter) return false;
      if (trackFilter && r.track !== trackFilter) return false;
      if (stageFilter && r.lifecycle_stage !== stageFilter) return false;
      if (statusFilter && r.current_verdict_status !== statusFilter) return false;
      if (search.trim() && !r.label.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [rows, is2LoD, tierFilter, trackFilter, stageFilter, statusFilter, search]);

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
        onBack={() => {
          setSelectedId(null);
          setRefreshKey((k) => k + 1);
        }}
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
          You&apos;re viewing as 1LoD — you see your own submissions. The full register and 2LoD approval actions
          require the 2LoD role.
        </p>
      )}

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

      {is2LoD && policyUpdatePending && (
        <div className="register-view__banner" role="status">
          Policy updated — some assessments may need re-evaluation.
        </div>
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
            {stages.map((stage) => (
              <button
                key={stage}
                type="button"
                className={stageFilter === stage ? 'chip chip--active' : 'chip'}
                onClick={() => setStageFilter(stageFilter === stage ? null : stage)}
              >
                {stage}
              </button>
            ))}
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
            {is2LoD && <th>Stale</th>}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr
              key={row.use_case_id}
              className="register-view__row"
              onClick={() => setSelectedId(row.use_case_id)}
            >
              <td>{row.label}</td>
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
                <span className={`register-stage register-stage--${row.lifecycle_stage}`}>{row.lifecycle_stage}</span>
              </td>
              <td>{row.last_evaluated_at ? new Date(row.last_evaluated_at).toLocaleDateString() : '—'}</td>
              <td>{row.policy_version_at_evaluation ?? '—'}</td>
              {is2LoD && <td>{row.stale_assessment && <span className="register-view__stale-badge">Stale</span>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
