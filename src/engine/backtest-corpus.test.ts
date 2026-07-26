import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../store/policy';
import { loadPacks } from '../store/packs';
import { getPackSources } from '../store/pack-source';
import { evaluate } from './evaluate';
import type { DataFlowGraph, PolicyFile } from './types';

// The back-test corpus (backtest/corpus.md, backtest/cases.json) scored
// headlessly. Two jobs:
//
// 1. Emit backtest/engine-verdicts.json — the ENGINE's answer for every case,
//    which the blind oracle panel (backtest/oracle-protocol.md) is compared
//    against AFTER it has independently produced its own.
// 2. Pin the corpus. A policy edit that silently changes a corpus verdict
//    shows up as a diff in the emitted file, not as a quiet drift.
//
// Note this file asserts SHAPE, not expected verdicts. Hand-written expected
// values are what backtest-predictions.test.ts already does, and they are
// authored by the same hand that wrote the engine — the circularity the
// oracle protocol exists to break. Correctness is adjudicated there, not here.

interface CaseSpec {
  id: string;
  title: string;
  graph: {
    jurisdictions: string[];
    input: Record<string, string>;
    processing: Record<string, unknown>;
    output: Record<string, unknown>;
  };
}

function toGraph(c: CaseSpec): DataFlowGraph {
  return {
    id: c.id,
    version: 1,
    intake_method: 'structured_form',
    extracted_at: '2026-01-01T00:00:00Z',
    jurisdictions: c.graph.jurisdictions,
    input_nodes: [{ id: 'i1', label: 'input', ...c.graph.input } as never],
    processing_nodes: [{ id: 'p1', label: 'model', ...c.graph.processing } as never],
    output_nodes: [{ id: 'o1', label: 'output', ...c.graph.output } as never],
    edges: [{ from: 'i1', to: 'p1' }, { from: 'p1', to: 'o1' }],
  };
}

let policy: PolicyFile;
let packs: ReturnType<typeof loadPacks>['packs'];
const specs: CaseSpec[] = JSON.parse(
  readFileSync(resolve(__dirname, '../../backtest/cases.json'), 'utf-8'),
).cases;

beforeAll(() => {
  const r = loadPolicy(readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8'));
  if (!r.valid) throw new Error('policy invalid: ' + JSON.stringify(r.errors));
  policy = r.policy;
  const p = loadPacks(getPackSources());
  if (p.errors.length > 0) throw new Error('pack errors: ' + JSON.stringify(p.errors));
  packs = p.packs;
});

describe('backtest corpus', () => {
  it('scores all 31 cases and emits engine-verdicts.json', () => {
    expect(specs).toHaveLength(31);
    const out: Record<string, unknown> = {};

    for (const spec of specs) {
      const r = evaluate(toGraph(spec), policy, packs);
      if (!r.ok) {
        // Recorded, not thrown. A case the engine CANNOT decide is a result
        // about the rulebook, and hiding it behind a failing assertion would
        // lose exactly the finding the corpus exists to surface (D-01 hit
        // no-track-match: 9 of 28 model_type x bindingness combinations match
        // no track rule at autonomy < 3).
        out[spec.id] = { title: spec.title, status: 'ENGINE-ERROR', error: r.error };
        continue;
      }
      const v = r.value;
      out[spec.id] = {
        title: spec.title,
        status: v.status,
        tier: v.tier,
        track: v.track,
        binding_constraint: v.binding_constraint,
        controls: v.controls,
        downstream_reviews: v.downstream_reviews,
        tripped_invariants: v.explanation.tripped_invariants.map((t) => t.id),
        applied_overrides: v.applied_overrides.map((o) => `${o.packCode}:${o.ruleId}:${o.effect}`),
      };
    }

    writeFileSync(
      resolve(__dirname, '../../backtest/engine-verdicts.json'),
      JSON.stringify({ policy_version: policy.version, verdicts: out }, null, 2) + '\n',
    );
  });

  // Determinism (NF-1) over the whole corpus, not just the sample TC-PE-1-01
  // covers. Byte-identical across runs, or the corpus proves nothing.
  it('is deterministic across the whole corpus', () => {
    const run = () =>
      JSON.stringify(specs.map((s) => { const r = evaluate(toGraph(s), policy, packs); return r.ok ? r.value : null; }));
    expect(run()).toBe(run());
  });
});
