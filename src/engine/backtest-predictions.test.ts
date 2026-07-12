import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../store/policy';
import { evaluate } from './evaluate';
import type { DataFlowGraph, PolicyFile } from './types';

// Living verification of backtest/use-cases.md: every predicted verdict
// in the Phase C back-test pack is asserted against the real engine +
// starter policy, so a policy edit that silently changes a predicted
// outcome fails here and the pack gets corrected instead of poisoning
// the back-test.
let policy: PolicyFile;
beforeAll(() => {
  const yaml = readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8');
  const r = loadPolicy(yaml);
  if (!r.valid) throw new Error('policy invalid');
  policy = r.policy;
});

function g(dataClass: string, inZone: string, model: string, autonomy: number, procZone: string, action: string, exposure: string, bindingness: string, reversibility: string, scale: string): DataFlowGraph {
  return {
    id: 'bt', version: 1, intake_method: 'structured_form', extracted_at: '2026-01-01T00:00:00Z', jurisdictions: [],
    input_nodes: [{ id: 'i1', label: 'in', data_class: dataClass as never, data_zone: inZone as never }],
    processing_nodes: [{ id: 'p1', label: 'model', model_type: model as never, autonomy_level: autonomy as never, data_zone: procZone as never, vendor: 'internal', replaces_prior_model: false }],
    output_nodes: [{ id: 'o1', label: 'out', action_type: action as never, exposure: exposure as never, decision_bindingness: bindingness as never, output_reversibility: reversibility as never, scale: scale as never }],
    edges: [{ from: 'i1', to: 'p1' }, { from: 'p1', to: 'o1' }],
  };
}

const cases: Array<[string, DataFlowGraph, { status: string; tier?: string; track?: string; binding?: string }]> = [
  ['UC-1 VaR commentary', g('Confidential','Zone B','llm',1,'Zone B','draft','internal-shared','advisory','reversible','at_scale'), { status: 'approved', tier: 'Medium', track: 'II' }],
  ['UC-2 MNPI commentary', g('MNPI','Zone B','llm',1,'Zone B','draft','internal-shared','advisory','reversible','at_scale'), { status: 'rejected', binding: 'INV-ZONE-01' }],
  ['UC-3 credit review', g('Client PII','Zone B','llm',1,'Zone B','recommend','internal-shared','material','reversible','at_scale'), { status: 'approved_with_controls', tier: 'High', track: 'II', binding: 'INV-DATA-01' }],
  ['UC-4 auto line cut', g('Client PII','Zone C','traditional-ml',4,'Zone C','execute','client-facing','binding','irreversible','at_scale'), { status: 'rejected', binding: 'HL-001' }],
  ['UC-5 op risk events', g('Internal','Zone B','llm',1,'Zone B','recommend','internal-shared','advisory','reversible','at_scale'), { status: 'approved', tier: 'Medium', track: 'II' }],
  ['UC-6a deal memo Zone B', g('MNPI','Zone B','llm',1,'Zone B','draft','internal-shared','material','reversible','limited'), { status: 'rejected', binding: 'INV-ZONE-01' }],
  ['UC-6b deal memo Zone C', g('MNPI','Zone C','llm',1,'Zone C','draft','internal-shared','material','reversible','limited'), { status: 'approved', tier: 'High', track: 'II' }],
  ['UC-7 Claude Code', g('Internal','Zone B','agentic',1,'Zone B','draft','internal-only','non-binding','reversible','at_scale'), { status: 'approved', tier: 'Low', track: 'III' }],
  ['UC-8 reg reporting', g('Confidential','Zone B','llm',1,'Zone B','draft','internal-shared','material','reversible','limited'), { status: 'approved', tier: 'Medium', track: 'II' }],
];

describe('backtest pack predictions', () => {
  for (const [name, graph, expected] of cases) {
    it(name, () => {
      const r = evaluate(graph, policy);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.status).toBe(expected.status);
      if (expected.tier) expect(r.value.tier).toBe(expected.tier);
      if (expected.track) expect(r.value.track).toBe(expected.track);
      if (expected.binding) expect(r.value.binding_constraint).toBe(expected.binding);
    });
  }
});
