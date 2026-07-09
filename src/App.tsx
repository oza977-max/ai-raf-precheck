import IntakeFlow from './components/IntakeFlow';
import SettingsPanel from './components/SettingsPanel';
import './App.css';

export default function App() {
  return (
    <div className="app">
      <h1>AIGate</h1>
      <SettingsPanel />
      <IntakeFlow />
    </div>
  );
}
