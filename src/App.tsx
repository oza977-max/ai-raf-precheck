import { useEffect, useMemo, useRef, useState } from 'react';
import IntakeFlow from './components/IntakeFlow';
import RegisterView from './components/RegisterView';
import PolicyEditor from './components/PolicyEditor';
import SettingsPanel from './components/SettingsPanel';
import AboutPanel from './components/AboutPanel';
import RuleImprovementQueue from './components/RuleImprovementQueue';
import { getRole, setRole } from './store/role';
import { getUseCases } from './store/register';
import { loadPolicy } from './store/policy';
import { getCurrentPolicyYaml } from './store/policy-source';
import { translationAttestationStatus } from './engine/attestation';
import { loadPacks } from './store/packs';
import { getPackSources } from './store/pack-source';
import { seedAigateSelfAssessment } from './seeds/aigate-self-assessment';
import './fonts.css';
import './App.css';

// App shell visual language taken from a Claude Design export
// ("AIGate Demo.dc.html") — dark header, warm-paper workspace, IBM Plex
// Sans/Mono. Sidebar "Register" nav item switches the main view to
// RegisterView.tsx (P6-C01). "Appetite framework" now routes to
// PolicyEditor.tsx (P7-C03) — a real Save flow, no longer a disabled
// placeholder.
export default function App() {
  const [view, setView] = useState<'intake' | 'register' | 'policyEditor' | 'about' | 'ruleQueue'>('intake');
  // First-visit pointer (2026-08-15). A card, not a takeover: replacing the
  // intake screen on first visit would surprise users and break every test
  // that renders App expecting intake — the card adds, never redirects.
  const [welcomeDismissed, setWelcomeDismissed] = useState(
    () => localStorage.getItem('aigate:welcome-dismissed') === '1',
  );
  const [role, setRoleState] = useState(getRole());
  // Bumped by PolicyEditor's onSaved callback so a saved policy change is
  // immediately reflected in the header badge and RegisterView's
  // currentPolicyVersion prop, without a full page reload (P7-C03).
  const [policyRevision, setPolicyRevision] = useState(0);
  // V1.2-B (design-gap E2): register count badge — refreshed on
  // navigation, an accepted staleness window.
  const [registerCount, setRegisterCount] = useState<number | null>(null);
  // Known-issue close (recorded since v0.3.2): "+ New pre-check" on a
  // COMPLETED flow should start a new one. The nonce tells IntakeFlow the
  // item was clicked; IntakeFlow decides whether that means reset (only a
  // finished flow resets — an in-progress draft keeps its own Start-over).
  const [newPrecheckNonce, setNewPrecheckNonce] = useState(0);
  // R15-C4 (proposal §3.8): the fidelity chip's explanation used to live in
  // a title= tooltip — hover-only meaning, a G3 violation. Now an
  // aria-expanded disclosure carries the same attestation.reason text,
  // visible to keyboard and screen-reader users, not just a mouse hover.
  const [fidelityDetailOpen, setFidelityDetailOpen] = useState(false);

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
    // R12-AD-2: the reviewer-only surface disappears for 1LoD — if it was
    // open when the role switches, fall back to intake rather than leaving
    // a 1LoD user stranded on a view whose nav item just vanished.
    if (next !== '2LoD' && view === 'ruleQueue') {
      setView('intake');
    }
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

  // O-002 (charter 005). Started during the FIRST RENDER, not in an effect.
  // React runs a child's effect before its parent's, so IntakeFlow's register
  // read always beat this — the duplicate check could report "checked 0
  // entries" moments before the self-assessment appeared. Starting here means
  // the in-flight promise exists before any child effect runs, so a consumer
  // can await it.
  //
  // A side effect during render is normally wrong. It is safe here for the
  // specific reason P7-C01 built for: seedAigateSelfAssessment collapses
  // concurrent callers onto one execution via an in-flight promise cache, and
  // StrictMode's double render was the case it was written to survive.
  const seedStarted = useRef(false);
  if (!seedStarted.current && policyResult.valid) {
    seedStarted.current = true;
    seedAigateSelfAssessment(policyResult.policy, loadedPacks).catch((err) => {
      console.warn('AIGate self-assessment seeding failed:', err);
    });
  }

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
          <span className="app-header__fidelity">
            <span className={attestation.status === 'attested' ? 'app-header__ok' : 'app-header__warn'}>
              {attestation.status === 'attested' ? '' : '⚠ '}translation fidelity: {attestation.status}
            </span>
            <button
              type="button"
              className="app-header__fidelity-toggle"
              aria-expanded={fidelityDetailOpen}
              onClick={() => setFidelityDetailOpen((v) => !v)}
            >
              {fidelityDetailOpen ? 'hide' : 'details ▸'}
            </button>
          </span>
          {fidelityDetailOpen && <p className="app-header__fidelity-detail">{attestation.reason}</p>}
          <span className="app-header__sep">·</span>
          {/* R15-C1 (proposal §3.8): relabelled "Viewing as" with a visible
              (not title=) honesty note, and first-mention glosses on the
              options — makes the existing 1LoD/2LoD gating honest about
              being a view preference, not access control (P1). No new
              role-conditional rendering added (G6). */}
          <label htmlFor="role-switcher" className="app-header__role-label">
            Viewing as
          </label>
          <select
            id="role-switcher"
            className="app-header__role-select"
            value={role}
            onChange={(e) => handleRoleChange(e.target.value)}
          >
            <option value="1LoD">1LoD — James · Dev (first line — submitter)</option>
            <option value="2LoD">2LoD — Priya · AI Risk (second line — reviewer)</option>
          </select>
          <span className="app-header__role-note">a view preference — this build has no sign-in</span>
        </div>
      </header>

      <div className="app-body">
        <nav className="app-sidebar" aria-label="Workspace navigation">
          <div className="app-sidebar__label">Workspace</div>
          <div
            className={view === 'intake' ? 'app-sidebar__item app-sidebar__item--active' : 'app-sidebar__item'}
            onClick={() => {
              setView('intake');
              setNewPrecheckNonce((n) => n + 1);
            }}
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
          {/* R12-AD-2: the entry surface stays narrow for 1LoD — the
              reviewer-only queue is hidden, never merely disabled. 2LoD
              keeps seeing everything unchanged. */}
          {role === '2LoD' && (
            <div
              className={view === 'ruleQueue' ? 'app-sidebar__item app-sidebar__item--active' : 'app-sidebar__item'}
              onClick={() => setView('ruleQueue')}
            >
              ⚑ Rule challenges
            </div>
          )}
          <div
            className={view === 'about' ? 'app-sidebar__item app-sidebar__item--active' : 'app-sidebar__item'}
            onClick={() => setView('about')}
          >
            ? About
          </div>
          <div className="app-sidebar__settings">
            <SettingsPanel />
          </div>
        </nav>

        <main className="app-main">
          {view === 'intake' && !welcomeDismissed && (
            <div className="app-welcome" role="note">
              <strong>First time here?</strong> This is a pre-check gate: describe an AI use case and a
              deterministic rule engine — no AI in the decision — tells you whether it sits inside your
              firm&rsquo;s risk appetite, and what would bring it inside.{' '}
              <button type="button" className="about-panel__link" onClick={() => setView('about')}>
                Two-minute overview →
              </button>{' '}
              <button
                type="button"
                className="app-welcome__dismiss"
                onClick={() => {
                  localStorage.setItem('aigate:welcome-dismissed', '1');
                  setWelcomeDismissed(true);
                }}
              >
                Got it
              </button>
            </div>
          )}
          {view === 'intake' && <IntakeFlow newPrecheckNonce={newPrecheckNonce} />}
          {view === 'about' && <AboutPanel onNavigate={setView} />}
          {view === 'register' && (
            <RegisterView
              role={role}
              currentPolicyVersion={currentPolicyVersion}
              policy={policyResult.valid ? policyResult.policy : undefined}
            />
          )}
          {view === 'policyEditor' && <PolicyEditor onSaved={() => setPolicyRevision((r) => r + 1)} />}
          {view === 'ruleQueue' && <RuleImprovementQueue />}
        </main>
      </div>
    </div>
  );
}
