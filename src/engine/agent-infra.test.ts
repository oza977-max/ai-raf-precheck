import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../store/policy';
import { evaluate } from './evaluate';
import type { DataFlowGraph, PolicyFile, SystemAccessScope } from './types';

// v1.4 agentic infrastructure-access rules (grounding/proposed-rules/
// agentic-infrastructure-access.md). The invariant every test defends:
// answered-risky fires, answered-safe and UNANSWERED fire nothing — an
// absent optional field makes no claim, so no rule may treat absence as
// either safety or danger.

let policy: PolicyFile;
beforeAll(() => {
  const yaml = readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8');
  const r = loadPolicy(yaml);
  if (!r.valid) throw new Error('policy invalid: ' + JSON.stringify(r.errors));
  policy = r.policy;
});

function agenticGraph(extra: {
  system_access_scope?: SystemAccessScope;
  multi_instance_coordination?: 'yes' | 'no' | 'unknown';
}): DataFlowGraph {
  return {
    id: 'ai',
    version: 1,
    intake_method: 'structured_form',
    extracted_at: '2026-01-01T00:00:00Z',
    jurisdictions: [],
    input_nodes: [{ id: 'i1', label: 'in', data_class: 'Internal', data_zone: 'Zone C' }],
    processing_nodes: [
      {
        id: 'p1',
        label: 'agent',
        model_type: 'agentic',
        autonomy_level: 3,
        data_zone: 'Zone C',
        vendor: 'internal',
        replaces_prior_model: false,
        ...extra,
      },
    ],
    output_nodes: [
      {
        id: 'o1',
        label: 'out',
        action_type: 'draft',
        exposure: 'internal-only',
        decision_bindingness: 'non-binding',
        output_reversibility: 'reversible',
        scale: 'limited',
      },
    ],
    edges: [
      { from: 'i1', to: 'p1' },
      { from: 'p1', to: 'o1' },
    ],
  };
}

function trippedIds(graph: DataFlowGraph): string[] {
  const r = evaluate(graph, policy);
  expect(r.ok).toBe(true);
  if (!r.ok) return [];
  return (r.value.explanation?.tripped_invariants ?? []).map((t) => t.id);
}

function controls(graph: DataFlowGraph): string[] {
  const r = evaluate(graph, policy);
  if (!r.ok) return [];
  return r.value.controls;
}

describe('v1.4 agentic infrastructure-access invariants', () => {
  it('INV-AGENT-INFRA-01 fires on shared infrastructure and resolves with CTRL-AGENT-ISO-01', () => {
    const g = agenticGraph({ system_access_scope: 'shared_infrastructure' });
    expect(trippedIds(g)).toContain('INV-AGENT-INFRA-01');
    expect(controls(g)).toContain('CTRL-AGENT-ISO-01');
  });

  it('INV-AGENT-CRED-01 fires on credentialed systems and on deployment authority', () => {
    expect(trippedIds(agenticGraph({ system_access_scope: 'credentialed_systems' }))).toContain(
      'INV-AGENT-CRED-01',
    );
    const deploy = agenticGraph({ system_access_scope: 'deployment_authority' });
    expect(trippedIds(deploy)).toContain('INV-AGENT-CRED-01');
    expect(controls(deploy)).toContain('CTRL-AGENT-CRED-01');
  });

  it("INV-AGENT-COORD-01 fires on 'yes' AND on 'unknown' — asked-but-could-not-say is itself the signal", () => {
    expect(trippedIds(agenticGraph({ multi_instance_coordination: 'yes' }))).toContain(
      'INV-AGENT-COORD-01',
    );
    const unknown = agenticGraph({ multi_instance_coordination: 'unknown' });
    expect(trippedIds(unknown)).toContain('INV-AGENT-COORD-01');
    expect(controls(unknown)).toContain('CTRL-AGENT-EXTLOG-01');
  });

  it('answered-safe fires nothing new', () => {
    const ids = trippedIds(agenticGraph({ system_access_scope: 'none', multi_instance_coordination: 'no' }));
    expect(ids).not.toContain('INV-AGENT-INFRA-01');
    expect(ids).not.toContain('INV-AGENT-CRED-01');
    expect(ids).not.toContain('INV-AGENT-COORD-01');
  });

  it('UNANSWERED fires nothing — absence is not a claim in either direction', () => {
    const ids = trippedIds(agenticGraph({}));
    expect(ids).not.toContain('INV-AGENT-INFRA-01');
    expect(ids).not.toContain('INV-AGENT-CRED-01');
    expect(ids).not.toContain('INV-AGENT-COORD-01');
  });

  it('non-agentic systems never trip these, whatever they answered', () => {
    const g = agenticGraph({ system_access_scope: 'deployment_authority', multi_instance_coordination: 'yes' });
    g.processing_nodes[0]!.model_type = 'llm';
    const ids = trippedIds(g);
    expect(ids).not.toContain('INV-AGENT-INFRA-01');
    expect(ids).not.toContain('INV-AGENT-CRED-01');
    expect(ids).not.toContain('INV-AGENT-COORD-01');
  });
});
