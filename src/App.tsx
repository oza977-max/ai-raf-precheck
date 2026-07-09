import IntakeFlow from './components/IntakeFlow';
import SettingsPanel from './components/SettingsPanel';
import './App.css';

// App shell visual language taken from a Claude Design export
// ("AIGate Demo.dc.html") — dark header, warm-paper workspace, IBM Plex
// Sans/Mono. Sidebar nav items for Register/Appetite framework are
// present because the design shows them, but only "New pre-check" is
// wired to real content in this phase — Register is a real, working
// feature (P2-C02/P4-C01) shown inline below the wizard for now;
// "Appetite framework" is marked coming soon since PolicyEditor.tsx isn't
// wired into the intake flow yet (P2-C01 handover note).
export default function App() {
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
          <span>policy v0.1-starter</span>
          <span className="app-header__sep">·</span>
          <span className="app-header__warn">translation fidelity: unattested</span>
        </div>
      </header>

      <div className="app-body">
        <nav className="app-sidebar" aria-label="Workspace navigation">
          <div className="app-sidebar__label">Workspace</div>
          <div className="app-sidebar__item app-sidebar__item--active">+ New pre-check</div>
          <div className="app-sidebar__item">▤ Register</div>
          <div className="app-sidebar__item app-sidebar__item--disabled" title="Coming soon — PolicyEditor.tsx isn't wired into the intake flow yet">
            § Appetite framework
          </div>
          <div className="app-sidebar__settings">
            <SettingsPanel />
          </div>
        </nav>

        <main className="app-main">
          <IntakeFlow />
        </main>
      </div>
    </div>
  );
}
