import { useState, useEffect, useCallback } from 'react';
import { extractGraphSkeleton } from '../llm/graph-extractor';
import { evaluate } from '../engine/evaluate';
import { loadPolicy } from '../store/policy';
import { addNode, getUseCases } from '../store/register';
import type { EvaluationResult } from '../engine/types';
import type { UseCaseSummary } from '../store/types';

// Rule 4 (cross-cutting.md §7): presentation-only. No business logic inline —
// calls engine/store/llm functions. Minimal 3-step wizard per P1-C01 scope;
// full 9-state machine (intake-flow.md §3) lands in P4-C01.
type Step = 'description_entry' | 'evaluating' | 'verdict';

export default function IntakeFlow() {
  const [step, setStep] = useState<Step>('description_entry');
  const [description, setDescription] = useState('');
  const [verdict, setVerdict] = useState<EvaluationResult | null>(null);
  const [registerRows, setRegisterRows] = useState<UseCaseSummary[]>([]);

  const refreshRegister = useCallback(async () => {
    const rows = await getUseCases('all');
    setRegisterRows(rows);
  }, []);

  useEffect(() => {
    void refreshRegister();
  }, [refreshRegister]);

  async function handleSubmit() {
    setStep('evaluating');

    // Real Anthropic call (or clean no-api-key fallback — UC-3a signal).
    // This chunk does not yet use the extraction result to build a real graph
    // (that's P4-C01) — it proves the boundary fires, then proceeds with the
    // stub policy/evaluate pipeline either way.
    await extractGraphSkeleton(description);

    const policy = loadPolicy();
    const result = evaluate({}, policy);
    setVerdict(result);

    await addNode({
      node_id: crypto.randomUUID(),
      node_type: 'use_case',
      label: description,
      created_at: new Date().toISOString(),
      metadata: {
        node_type: 'use_case',
        submitted_by: 'current-user',
        lifecycle_stage: 'idea',
        current_verdict_id: null,
        tier: result.tier,
        track: result.track,
      },
    });
    await refreshRegister();
    setStep('verdict');
  }

  return (
    <div>
      {step === 'description_entry' && (
        <div>
          <label htmlFor="description-input">Describe your AI use case</label>
          <textarea
            id="description-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button type="button" onClick={handleSubmit} disabled={!description.trim()}>
            Submit
          </button>
        </div>
      )}

      {step === 'evaluating' && <p>Evaluating…</p>}

      {step === 'verdict' && verdict && (
        <section>
          <h2>Verdict: {verdict.status}</h2>
          <p>Tier: {verdict.tier}</p>
        </section>
      )}

      <section>
        <h2>Register</h2>
        <table>
          <tbody>
            {registerRows.map((row) => (
              <tr key={row.use_case_id}>
                <td>{row.label}</td>
                <td>{row.tier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
