import { useMemo, useState } from 'react';
import { loadPolicy, onPolicyUpdated } from '../store/policy';
import { getCurrentPolicyYaml, setCurrentPolicyYaml } from '../store/policy-source';
import type { PolicyValidationError } from '../engine/types';

interface PolicyEditorProps {
  onSaved?: () => void;
}

// Rule 4 (cross-cutting.md §7): presentation-only. No business logic inline —
// calls store/policy.ts's loadPolicy()/onPolicyUpdated() and
// store/policy-source.ts's setCurrentPolicyYaml(). P7-C03: real Save flow,
// pre-filled with the currently active policy.
export default function PolicyEditor({ onSaved }: PolicyEditorProps) {
  const [yaml, setYaml] = useState(() => getCurrentPolicyYaml());
  const [result, setResult] = useState<
    | { status: 'idle' }
    | { status: 'validated'; warnings: string[] }
    | { status: 'saved'; queuedCount: number }
    | { status: 'error'; errors: PolicyValidationError[] }
  >({ status: 'idle' });

  // V1.2-C (design-gap D1-D4): header/banner/packs/hard-lines panels
  // derive live from the CURRENT textarea content — loadPolicy is pure.
  const parsed = useMemo(() => loadPolicy(yaml), [yaml]);
  const livePolicy = parsed.valid ? parsed.policy : null;
  // NF-10: the starter template's own convention — [FIRM] markers mean
  // the framework has not been adopted by the firm's CRO. Review finding
  // (pass 1): the template's instructional COMMENTS also mention [FIRM]
  // ("Search for [FIRM] markers below…"), so the check strips comment
  // lines first — otherwise a genuinely adopted framework that kept the
  // template header would be branded "provisional" forever, an integrity
  // defect in a product built on honest status claims.
  const hasFirmMarkers = yaml
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
    .includes('[FIRM]');

  function handleValidate() {
    const outcome = loadPolicy(yaml);
    if (outcome.valid) {
      setResult({ status: 'validated', warnings: outcome.warnings });
    } else {
      setResult({ status: 'error', errors: outcome.errors });
    }
  }

  async function handleSave() {
    // BC-P7C03-02: invalid YAML must never reach setCurrentPolicyYaml()/
    // onPolicyUpdated() — validate first, gate the save on success.
    const outcome = loadPolicy(yaml);
    if (!outcome.valid) {
      setResult({ status: 'error', errors: outcome.errors });
      return;
    }

    setCurrentPolicyYaml(yaml);
    // BC-P7C03-01: a real call, queuing real re_evaluation_queued audit
    // events for real active use cases — not a simulated message.
    const { queuedCount } = await onPolicyUpdated(outcome.policy.version);
    setResult({ status: 'saved', queuedCount });
    onSaved?.();
  }

  return (
    <div className="policy-view">
      <h2>Appetite framework</h2>
      <p className="policy-view__meta">
        {livePolicy
          ? `policy v${livePolicy.version} · ${livePolicy.jurisdictions.length} jurisdiction pack${
              livePolicy.jurisdictions.length === 1 ? '' : 's'
            } declared`
          : 'panels unavailable — YAML invalid'}
      </p>
      <p className="policy-view__framing">
        The bank&apos;s rules, machine-readable and versioned. Every verdict traces back to a rule in here. The
        engine enforces it — it does not invent it.
      </p>

      {hasFirmMarkers && (
        <div className="policy-view__action-required" role="alert">
          <strong>ACTION REQUIRED</strong> — Starter config in use. <code>[FIRM]</code> markers and
          translation-fidelity attestation are unfilled — verdicts are provisional until your CRO adopts this
          framework (NF-10).
        </div>
      )}

      <label htmlFor="policy-yaml-input">Policy YAML</label>
      <textarea
        id="policy-yaml-input"
        className="policy-view__yaml"
        value={yaml}
        onChange={(e) => setYaml(e.target.value)}
        spellCheck={false}
      />
      <button type="button" onClick={handleValidate}>
        Validate
      </button>
      <button type="button" onClick={() => void handleSave()}>
        Save
      </button>

      {result.status === 'validated' && (
        <div role="status">
          <p>Policy is valid.</p>
          {result.warnings.length > 0 && (
            <ul>
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result.status === 'saved' && (
        <div role="status">
          <p>
            Policy saved — {result.queuedCount} active use case{result.queuedCount === 1 ? '' : 's'} queued for
            re-evaluation.
          </p>
        </div>
      )}

      {result.status === 'error' && (
        <div role="alert">
          <p>Policy is invalid.</p>
          <ul>
            {result.errors.map((e, i) => (
              <li key={`${e.field}-${i}`}>
                <strong>{e.field}</strong>: {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {livePolicy && (
        <div className="policy-view__panel">
          <h3>Jurisdiction packs</h3>
          <ul className="policy-view__packs">
            {livePolicy.jurisdictions.map((j) => (
              <li key={j.code}>
                <code className="policy-view__pack-code">{j.code}</code>
                <span className="policy-view__pack-name">{j.name}</span>
                {/* BC-V12C-01: the V1 engine does not load packs — the
                    chip says so plainly, never "loaded"/"fired". */}
                <span className="policy-view__pack-state">declared — not loaded by V1 engine</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {livePolicy && (
        <div className="policy-view__panel">
          <h3>Hard lines — no control set can fix</h3>
          <p className="policy-view__panel-sub">
            Checked first. A use case crossing one is rejected immediately (PE-4).
          </p>
          <ul className="policy-view__hardlines">
            {livePolicy.hard_lines.map((hl) => (
              <li key={hl.id}>
                <code>{hl.id}</code> — {hl.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
