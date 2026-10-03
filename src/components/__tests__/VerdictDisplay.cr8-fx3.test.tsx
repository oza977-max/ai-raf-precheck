import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../../store/policy';
import { evaluate } from '../../engine/evaluate';
import { buildGraphFromForm } from '../../engine/build-graph-from-form';
import VerdictDisplay from '../VerdictDisplay';
import type { DataFlowGraph, PolicyFile } from '../../engine/types';
import type { Verdict } from '../../types/verdict';

// FX8-3 / code review 008 — what the verdict screen renders. Real shipped policy, real evaluate()
// output (BC-003). BC-005: render the state where the claim would be FALSE and assert it is absent.
function realPolicy(): PolicyFile {
  const r = loadPolicy(readFileSync(resolve(__dirname, '../../../policy/appetite.yaml'), 'utf-8'));
  if (!r.valid) throw new Error('bad policy');
  return r.policy;
}

function graphFor(): DataFlowGraph {
  return buildGraphFromForm(
    {
      useCaseName: 'x', description: 'y', inputDataClass: 'Internal', inputDataZone: 'Zone B', modelType: 'ml',
      autonomyLevel: 1, processingDataZone: 'Zone B', outputActionType: 'recommend', outputExposure: 'internal-shared',
      decisionBindingness: 'advisory', outputReversibility: 'reversible', outputScale: 'limited',
      replacesPriorModel: false, jurisdictions: [],
    },
    '2026-01-01T00:00:00.000Z',
    () => crypto.randomUUID(),
  );
}

function verdictFrom(policy: PolicyFile, over: Partial<Verdict> = {}): Verdict {
  const e = evaluate(graphFor(), policy);
  if (!e.ok) throw new Error('eval failed');
  return {
    ...e.value, id: 'v1', use_case_id: 'uc', living_status: 'approved' as const,
    living_status_updated_at: '2026-01-01T00:00:00Z', attested_by: '1LoD', attested_at: '2026-01-01T00:00:00Z',
    graph_version: 1, corrections: [], ...over,
  } as Verdict;
}

const PERMISSIVE = /you can start|self-service final|nobody —/i;

describe('VerdictDisplay — CR8-02 (P4): every surface for the same state', () => {
  it('TC-CR8-02f: stage approved with NO policy — the stage note, headline and who-signs-off say nothing permissive', () => {
    const policy = realPolicy();
    const verdict = verdictFrom(policy, { tier: 'Low', controls: [] });
    const { container } = render(<VerdictDisplay verdict={verdict} auditEvents={[]} policy={undefined} registerStage="approved" onCorrect={vi.fn()} />);
    expect(container.querySelector('.verdict__stage-note')!.textContent).not.toMatch(PERMISSIVE);
    expect(container.textContent).not.toMatch(/you can start|nobody —/i);
  });

  it('TC-CR8-02g: no stage at all (intake, before saving) — nothing on the screen says the person can start or that nobody signs off', () => {
    const policy = realPolicy();
    const verdict = verdictFrom(policy, { tier: 'Low', controls: [] });
    const { container } = render(<VerdictDisplay verdict={verdict} auditEvents={[]} policy={policy} onCorrect={vi.fn()} />);
    expect(container.textContent).not.toMatch(/you can start|nobody —|no sign-off needed/i);
  });
});
