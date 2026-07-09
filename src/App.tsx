import { useState } from 'react';
import IntakeFlow from './components/IntakeFlow';
import RegisterView from './components/RegisterView';
import SettingsPanel from './components/SettingsPanel';
import { getRole, setRole } from './store/role';
import { loadPolicy } from './store/policy';
import appetiteYaml from '../policy/appetite.yaml?raw';
import './App.css';

// App shell visual language taken from a Claude Design export
// ("AIGate Demo.dc.html") — dark header, warm-paper workspace, IBM Plex
// Sans/Mono. Sidebar "Register" nav item now switches the main view to
// RegisterView.tsx (P6-C01) — a real, working feature (P2-C02/P4-C01/
// P6-C01). "Appetite framework" is marked coming soon since
// PolicyEditor.tsx isn't wired into the intake flow yet (P2-C01 handover
// note).
const policyResult = loadPolicy(appetiteYaml);
const currentPolicyVersion = policyResult.valid ? policyResult.policy.version : '0.1-starter';

export default function App() {
  const [view, setView] = useState<'intake' | 'register'>('intake');
  const [role, setRoleState] = useState(getRole());

  function handleRoleChange(next: string) {
    setRole(next);
    setRoleState(next);
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
          <span className="app-header__warn">translation fidelity: unattested</span>
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
            <option value="1LoD">1LoD</option>
            <option value="2LoD">2LoD</option>
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
            ▤ Register
          </div>
          <div className="app-sidebar__item app-sidebar__item--disabled" title="Coming soon — PolicyEditor.tsx isn't wired into the intake flow yet">
            § Appetite framework
          </div>
          <div className="app-sidebar__settings">
            <SettingsPanel />
          </div>
        </nav>

        <main className="app-main">
          {view === 'intake' ? (
            <IntakeFlow />
          ) : (
            <RegisterView role={role} currentPolicyVersion={currentPolicyVersion} />
          )}
        </main>
      </div>
    </div>
  );
}
