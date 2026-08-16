import { useMemo, useState } from 'react';
import { getApiKey } from '../llm/client';
import {
  DEFAULT_LOCAL_LLM_MODEL,
  DEFAULT_LOCAL_LLM_URL,
  disableLocalLlm,
  enableLocalLlm,
  getLocalLlmModel,
  getLocalLlmUrl,
  localLlmEnabled,
  probeLocalLlm,
} from '../llm/local-provider';
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
  // Local open-model provider (2026-08-16). URL presence IS the enabled flag.
  const [localUrl, setLocalUrl] = useState(getLocalLlmUrl() ?? DEFAULT_LOCAL_LLM_URL);
  const [localModel, setLocalModel] = useState(getLocalLlmModel());
  const [localSaved, setLocalSaved] = useState(localLlmEnabled());
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
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
      const result = await clearAllLocalData();
      if (!result.complete) {
        // Code review 001, I-3: a blocked delete used to resolve as success
        // and the UI reported a clean reset over surviving data. Say so.
        setBusy('none');
        setMessage(
          `Not everything could be deleted: ${result.incomplete.join(', ')}. ` +
            'This usually means AIGate is open in another tab — close the others and try again.'
        );
        return;
      }
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

          <label htmlFor="local-llm-url">Local model (free, no API key)</label>
          <p>
            Alternative to the key above: a small open model running on this machine via Ollama.
            Enables the same plain-language intake — your description goes to a local process, never
            to the internet. It proposes; you confirm every field before anything is scored. Expect
            rougher first drafts than a frontier model, and a 10–20 second wait on the first request
            while the model loads. If both this and a key are saved, the key is used.
          </p>
          <input
            id="local-llm-url"
            type="text"
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            placeholder={DEFAULT_LOCAL_LLM_URL}
          />
          <label htmlFor="local-llm-model">Model name</label>
          <input
            id="local-llm-model"
            type="text"
            value={localModel}
            onChange={(e) => setLocalModel(e.target.value)}
            placeholder={DEFAULT_LOCAL_LLM_MODEL}
          />
          <button
            type="button"
            disabled={probing || !localUrl.trim() || !localModel.trim()}
            onClick={() => {
              void (async () => {
                setProbing(true);
                setLocalStatus(null);
                const probe = await probeLocalLlm(localUrl, localModel);
                if (probe.ok) {
                  enableLocalLlm(localUrl, localModel);
                  setLocalSaved(true);
                  setLocalStatus(`Saved. ${probe.detail}`);
                } else {
                  // Refuse-rather-than-record: a URL that does not answer is
                  // not saved, so the intake path never silently degrades.
                  setLocalStatus(probe.detail);
                }
                setProbing(false);
              })();
            }}
          >
            {probing ? 'Testing…' : 'Test & save'}
          </button>
          {localSaved && (
            <button
              type="button"
              onClick={() => {
                disableLocalLlm();
                setLocalSaved(false);
                setLocalStatus('Local model disabled — the guided form is the intake path again.');
              }}
            >
              Disable local model
            </button>
          )}
          {localStatus && <p role="status">{localStatus}</p>}
        </div>
      </details>
    </>
  );
}
