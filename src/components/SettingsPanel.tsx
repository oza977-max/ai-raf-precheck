import { useState } from 'react';
import { getApiKey } from '../llm/client';

// Local-testing-only convenience. NOT the production design — cross-cutting.md
// §9 / NF-3 explicitly scopes AIGate as backend-less, browser-stored-key for
// V1. Storing an API key in localStorage is visible to anyone with access to
// this browser (devtools, extensions) and is not appropriate for a shared
// multi-user deployment. A real rollout needs a backend that holds the key
// server-side and proxies Anthropic calls, so the key never reaches the
// browser at all — flagged as a known productionization gap, not solved here.
export default function SettingsPanel() {
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(getApiKey() !== null);

  function handleSave() {
    if (!key.trim()) return;
    localStorage.setItem('aigate:api-key', key.trim());
    setKey('');
    setSaved(true);
  }

  function handleClear() {
    localStorage.removeItem('aigate:api-key');
    setSaved(false);
  }

  return (
    <details>
      <summary>Settings (local testing only — not production-safe key storage)</summary>
      <div>
        <label htmlFor="api-key-input">Anthropic API key</label>
        <input
          id="api-key-input"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={saved ? 'A key is currently saved in this browser' : 'sk-ant-...'}
        />
        <button type="button" onClick={handleSave} disabled={!key.trim()}>
          Save
        </button>
        {saved && (
          <button type="button" onClick={handleClear}>
            Clear saved key
          </button>
        )}
      </div>
    </details>
  );
}
