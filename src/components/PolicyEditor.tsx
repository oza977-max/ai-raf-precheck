import { useState } from 'react';
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
    <div>
      <label htmlFor="policy-yaml-input">Policy YAML</label>
      <textarea
        id="policy-yaml-input"
        value={yaml}
        onChange={(e) => setYaml(e.target.value)}
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
    </div>
  );
}
