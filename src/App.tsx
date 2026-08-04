import { useEffect, useMemo, useState } from 'react';
import IntakeFlow from './components/IntakeFlow';
import RegisterView from './components/RegisterView';
import PolicyEditor from './components/PolicyEditor';
import SettingsPanel from './components/SettingsPanel';
import { getRole, setRole } from './store/role';
import { getUseCases } from './store/register';
import { loadPolicy } from './store/policy';
import { getCurrentPolicyYaml } from './store/policy-source';
import { translationAttestationStatus } from './engine/attestation';
import { loadPacks } from './store/packs';
import { getPackSources } from './store/pack-source';
import { seedAigateSelfAssessment } from './seeds/aigate-self-assessment';
import './App.css';

// App shell visual language taken from a Claude Design export
// ("AIGate Demo.dc.html") — dark header, warm-paper workspace, IBM Plex
// Sans/Mono. Sidebar "Register" nav item switches the main view to
// RegisterView.tsx (P6-C01). "Appetite framework" now routes to
// PolicyEditor.tsx (P7-C03) — a real Save flow, no longer a disabled
// placeholder.
export default function App() {
  const [view, setView] = useState<'intake' | 'register' | 'policyEditor'>('intake');
  const [role, setRoleState] = useState(getRole());
  // Bumped by PolicyEditor's onSaved callback so a saved policy change is
  // immediately reflected in the header badge and RegisterView's
  // currentPolicyVersion prop, without a full page reload (P7-C03).
  const [policyRevision, setPolicyRevision] = useState(0);
  // V1.2-B (design-gap E2): register count badge — refreshed on
  // navigation, an accepted staleness window.
  const [registerCount, setRegisterCount] = useState<number | null>(null);

  const policyResult = useMemo(() => loadPolicy(getCurrentPolicyYaml()), [policyRevision]);
  const currentPolicyVersion = policyResult.valid ? policyResult.policy.version : '0.1-starter';

  // NF-10. Recomputed when the policy changes; the date is taken once per
  // render of the shell, which is the only place a clock belongs.
  const attestation = useMemo(
    () =>
      policyResult.valid
        ? translationAttestationStatus(
            policyResult.policy.translation_attestation,
            new Date().toISOString().slice(0, 10),
          )
        : { status: 'unattested' as const, reason: 'No valid policy is loaded, so nothing can be attested.' },
    [policyResult],
  );

  function handleRoleChange(next: string) {
    setRole(next);
    setRoleState(next);
  }

  useEffect(() => {
    let cancelled = false;
    getUseCases('all')
      .then((rows) => {
        if (!cancelled) setRegisterCount(rows.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [view, policyRevision]);

  // register-lifecycle.md §9 (LC-6): AIGate evaluates itself through its
  // own engine on first launch. Best-effort — a failure here (e.g.
  // invalid policy) must not block the app from rendering (same pattern
  // as VD-8's reasoning-trace generation). Runs once per app lifetime —
  // seedAigateSelfAssessment() is idempotent and race-safe (P7-C01).
  // P8-C04: seeded WITHOUT packs until now, so AIGate's own self-assessment
  // was scored ignoring the UK pack its graph declares.
  const loadedPacks = useMemo(() => loadPacks(getPackSources()).packs, []);

  useEffect(() => {
    if (!policyResult.valid) return;
    seedAigateSelfAssessment(policyResult.policy, loadedPacks).catch((err) => {
      console.warn('AIGate self-assessment seeding failed:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo" aria-hidden="true">
            ◈
          </span>
          <span className="app-header__name">AIGate</span>
          <span className="app-header__badge">PRE-CHECK ENGINE</span>
        </div>
        <div className="app-header__status">
          <span className="app-header__dot" aria-hidden="true" />
          <span>policy v{currentPolicyVersion}</span>
          <span className="app-header__sep">·</span>
          {/* NF-10: computed, not asserted. This was a hardcoded string — true
              of the shipped starter policy, and it would have kept saying so
              after somebody attested. The engine is pure, so today's date is
              supplied here rather than read inside it. */}
          <span
            className={attestation.status === 'attested' ? 'app-header__ok' : 'app-header__warn'}
            title={attestation.reason}
          >
            translation fidelity: {attestation.status}
          </span>
          <span className="app-header__sep">·</span>
          <label htmlFor="role-switcher" className="app-header__role-label">
            Role
          </label>
          <select
            id="role-switcher"
            className="app-header__role-select"
            value={role}
            onChange={(e) => handleRoleChange(e.target.value)}
          >
            <option value="1LoD">1LoD — James · Dev</option>
            <option value="2LoD">2LoD — Priya · AI Risk</option>
          </select>
        </div>
      </header>

      <div className="app-body">
        <nav className="app-sidebar" aria-label="Workspace navigation">
          <div className="app-sidebar__label">Workspace</div>
          <div
            className={view === 'intake' ? 'app-sidebar__item app-sidebar__item--active' : 'app-sidebar__item'}
            onClick={() => setView('intake')}
          >
            + New pre-check
          </div>
          <div
            className={view === 'register' ? 'app-sidebar__item app-sidebar__item--active' : 'app-sidebar__item'}
            onClick={() => setView('register')}
          >
            <span>▤ Register</span>
            {registerCount !== null && registerCount > 0 && (
              <span className="app-sidebar__count">{registerCount}</span>
            )}
          </div>
          <div
            className={view === 'policyEditor' ? 'app-sidebar__item app-sidebar__item--active' : 'app-sidebar__item'}
            onClick={() => setView('policyEditor')}
          >
            § Appetite framework
          </div>
          <div className="app-sidebar__settings">
            <SettingsPanel />
          </div>
        </nav>

        <main className="app-main">
          {view === 'intake' && <IntakeFlow />}
          {view === 'register' && (
            <RegisterView
              role={role}
              currentPolicyVersion={currentPolicyVersion}
              policy={policyResult.valid ? policyResult.policy : undefined}
            />
          )}
          {view === 'policyEditor' && <PolicyEditor onSaved={() => setPolicyRevision((r) => r + 1)} />}
        </main>
      </div>
    </div>
  );
}
