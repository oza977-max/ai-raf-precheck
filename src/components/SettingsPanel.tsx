import { useMemo, useState } from 'react';
import { getApiKey } from '../llm/client';
import { loadPacks } from '../store/packs';
import { getPackSources } from '../store/pack-source';
import { loadPolicy } from '../store/policy';
import { getCurrentPolicyYaml } from '../store/policy-source';
import { clearAllLocalData } from '../store/reset';
import { sampleCount, seedSampleRegister } from '../seeds/sample-register';

type Busy = 'none' | 'seeding' | 'clearing';

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
  const [busy, setBusy] = useState<Busy>('none');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const policyResult = useMemo(() => loadPolicy(getCurrentPolicyYaml()), []);
  const packs = useMemo(() => loadPacks(getPackSources()).packs, []);

  function handleSave() {
    if (!key.trim()) return;
    localStorage.setItem('aigate:api-key', key.trim());
    setKey('');
    setSaved(true);
  }

  function handleClearKey() {
    localStorage.removeItem('aigate:api-key');
    setSaved(false);
  }

  async function handleSeed() {
    if (!policyResult.valid) {
      setMessage('Cannot load samples — the current policy is invalid.');
      return;
    }
    setBusy('seeding');
    setMessage(null);
    try {
      const seeded = await seedSampleRegister(policyResult.policy, packs);
      setMessage(
        seeded === 0
          ? 'Samples are already loaded — nothing added.'
          : `Added ${seeded} sample use ${seeded === 1 ? 'case' : 'cases'}. Open the register to see them.`
      );
    } catch {
      setMessage('Loading samples failed. See the browser console for details.');
    } finally {
      setBusy('none');
    }
  }

  async function handleClearAll() {
    setBusy('clearing');
    try {
      await clearAllLocalData();
      // Reload rather than reset React state: src/store/db.ts caches its
      // open-database handles at module scope, so only a fresh page load
      // guarantees the app is really looking at empty databases.
      window.location.reload();
    } catch {
      setBusy('none');
      setMessage('Clearing data failed. See the browser console for details.');
    }
  }

  return (
    <>
      <details>
        <summary>Demo data</summary>
        <div>
          <p>
            Loads {sampleCount()} example use cases — spanning in-appetite, in-appetite-with-controls
            and out-of-appetite outcomes — so the register, duplicate check and verdict screens have
            something realistic in them. Each is scored by the real engine against the policy
            currently loaded, so the outcomes are genuine, not canned. All are prefixed [SAMPLE].
          </p>
          <button type="button" onClick={handleSeed} disabled={busy !== 'none'}>
            {busy === 'seeding' ? 'Loading…' : 'Load sample use cases'}
          </button>

          {!confirmingClear && (
            <button type="button" onClick={() => setConfirmingClear(true)} disabled={busy !== 'none'}>
              Clear all data and start over
            </button>
          )}
          {confirmingClear && (
            <div role="alert">
              <p>
                This permanently deletes every use case, verdict and audit event in this browser.
                AIGate has no server, so there is no copy to restore from. Export anything you want
                to keep first. Your saved API key is not affected.
              </p>
              <button type="button" onClick={handleClearAll} disabled={busy !== 'none'}>
                {busy === 'clearing' ? 'Clearing…' : 'Yes, delete everything'}
              </button>
              <button type="button" onClick={() => setConfirmingClear(false)} disabled={busy !== 'none'}>
                Cancel
              </button>
            </div>
          )}

          {message && <p role="status">{message}</p>}
        </div>
      </details>

      <details>
        <summary>Settings (local testing only — not production-safe key storage)</summary>
        <div>
          <label htmlFor="api-key-input">Anthropic API key</label>
          <p>
            Optional. AIGate scores use cases without it — the key only enables plain-language
            intake, smarter duplicate matching, and the narrative summary of a verdict. With no key
            you use the guided-questions route, which is the deterministic path either way.
          </p>
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
            <button type="button" onClick={handleClearKey}>
              Clear saved key
            </button>
          )}
        </div>
      </details>
    </>
  );
}
