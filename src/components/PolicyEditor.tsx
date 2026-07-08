import { useState } from 'react';
import { loadPolicy } from '../store/policy';
import type { PolicyValidationError } from '../engine/types';

// Rule 4 (cross-cutting.md §7): presentation-only. No business logic inline —
// calls store/policy.ts's loadPolicy(). Minimal textarea + Load button; file
// upload and IntakeFlow.tsx wiring are out of scope for this chunk.
export default function PolicyEditor() {
  const [yaml, setYaml] = useState('');
  const [result, setResult] = useState<
    | { status: 'idle' }
    | { status: 'success'; warnings: string[] }
    | { status: 'error'; errors: PolicyValidationError[] }
  >({ status: 'idle' });

  function handleLoad() {
    const outcome = loadPolicy(yaml);
    if (outcome.valid) {
      setResult({ status: 'success', warnings: outcome.warnings });
    } else {
      setResult({ status: 'error', errors: outcome.errors });
    }
  }

  return (
    <div>
      <label htmlFor="policy-yaml-input">Policy YAML</label>
      <textarea
        id="policy-yaml-input"
        value={yaml}
        onChange={(e) => setYaml(e.target.value)}
      />
      <button type="button" onClick={handleLoad}>
        Load
      </button>

      {result.status === 'success' && (
        <div role="status">
          <p>Policy loaded successfully.</p>
          {result.warnings.length > 0 && (
            <ul>
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
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
