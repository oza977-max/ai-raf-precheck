import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assignTrack } from './track';
import { loadPolicy } from '../store/policy';
import type { DataFlowGraph, TrackRule } from './types';

function graph(overrides: Partial<DataFlowGraph> = {}): DataFlowGraph {
  return {
    id: 'g1',
    version: 1,
    input_nodes: [],
    processing_nodes: [],
    output_nodes: [],
    edges: [],
    jurisdictions: [],
    intake_method: 'structured_form',
    extracted_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const TRACKS: TrackRule[] = [
  {
    id: 'TRACK-I',
    name: 'Track I',
    description: 'Traditional MRM',
    conditions: [{ field: 'model_type', value: { in: ['statistical', 'traditional-ml'] } }],
    short_circuit: true,
    regulatory_basis: 'SS1/23 §3.4',
  },
  {
    id: 'TRACK-II',
    name: 'Track II',
    description: 'AI on MRM',
    conditions: [{ field: 'model_type', value: { in: ['ml', 'llm'] } }],
    short_circuit: true,
    regulatory_basis: 'SS1/23 §3.4',
  },
  {
    id: 'TRACK-III',
    name: 'Track III',
    description: 'AI Governance',
    conditions: [{ field: 'model_type', value: { in: ['generative-ai', 'agentic'] } }],
    short_circuit: true,
    regulatory_basis: 'SR 26-2 §III.C',
  },
];

function withModelType(modelType: string) {
  return graph({
    processing_nodes: [
      { id: 'p1', label: 'x', model_type: modelType as never, autonomy_level: 1, data_zone: 'Zone A', vendor: 'internal', replaces_prior_model: false },
    ],
  });
}

describe('assignTrack', () => {
  it('matches the first rule in order (short-circuit)', () => {
    const result = assignTrack(withModelType('statistical'), TRACKS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.track).toBe('I');
  });

  it('parses Track III from the rule id correctly (not confused by substring "II")', () => {
    const result = assignTrack(withModelType('generative-ai'), TRACKS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.track).toBe('III');
  });

  it('returns a no-track-match error when nothing matches', () => {
    const result = assignTrack(withModelType('deep-learning'), TRACKS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('no-track-match');
  });
});

// Oracle round 001. The shipped track list must be TOTAL over the field space:
// every model_type x decision_bindingness pair must route somewhere. Before
// this round 9 of 28 pairs matched no track and the engine returned no verdict
// at all — including `agentic` on advisory, material AND binding decisions, the
// highest-risk shape in the taxonomy falling straight through the routing.
//
// This enumerates the cross-product rather than sampling it, because sampling
// is exactly what missed the hole for two months.
describe('track totality (oracle round 001)', () => {
  const MODEL_TYPES = [
    'statistical', 'traditional-ml', 'ml', 'deep-learning', 'llm', 'generative-ai', 'agentic',
  ] as const;
  const BINDINGNESS = ['non-binding', 'advisory', 'material', 'binding'] as const;

  it('routes every model_type x decision_bindingness pair at autonomy 0-2, replacement or not', () => {
    const policyFile = loadPolicy(
      readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8'),
    );
    if (!policyFile.valid) throw new Error('shipped policy invalid');
    const tracks = policyFile.policy.tracks;

    const unrouted: string[] = [];
    for (const model_type of MODEL_TYPES) {
      for (const decision_bindingness of BINDINGNESS) {
        for (const autonomy_level of [0, 1, 2] as const) {
          for (const replaces_prior_model of [false, true]) {
            const g = graph({
              processing_nodes: [{
                id: 'p1', label: 'x', model_type, autonomy_level,
                data_zone: 'Zone C', vendor: 'internal', replaces_prior_model,
              }],
              output_nodes: [{
                id: 'o1', label: 'y', action_type: 'recommend', exposure: 'internal-shared',
                decision_bindingness, output_reversibility: 'reversible', scale: 'limited',
              }],
            });
            if (!assignTrack(g, tracks).ok) {
              unrouted.push(`${model_type} + ${decision_bindingness} (autonomy ${autonomy_level}, replaces=${replaces_prior_model})`);
            }
          }
        }
      }
    }
    expect(unrouted).toEqual([]);
  });

  // The assertion above was VACUOUS until code review 002 caught it: it read
  // `if (!assignTrack(g, tracks))`, and assignTrack returns a Result OBJECT,
  // which is always truthy. `unrouted` could never be populated, so the test
  // passed against ANY policy — including one with TRACK-I deleted entirely.
  // A test guarding the exact defect class that had already shipped twice was
  // guarding nothing, and its green tick was cited in the policy comments, the
  // commit message and the round-002 report as evidence of totality.
  //
  // This is the mutation check that makes that impossible to repeat: break the
  // routing on purpose and require the checker to notice. A totality test that
  // cannot go red is worse than no test, because it is quoted as proof.
  it('the totality check itself goes red when routing is broken (mutation guard)', () => {
    const policyFile = loadPolicy(
      readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8'),
    );
    if (!policyFile.valid) throw new Error('shipped policy invalid');

    // Drop TRACK-I: statistical and traditional-ml are then routed only by the
    // special tracks, so anything at autonomy < 3 that is not a replacement
    // falls through.
    const holed = policyFile.policy.tracks.filter((t) => t.id !== 'TRACK-I');

    const unrouted = MODEL_TYPES.flatMap((model_type) =>
      BINDINGNESS.filter(
        (decision_bindingness) =>
          !assignTrack(
            graph({
              processing_nodes: [{
                id: 'p1', label: 'x', model_type, autonomy_level: 1,
                data_zone: 'Zone C', vendor: 'internal', replaces_prior_model: false,
              }],
              output_nodes: [{
                id: 'o1', label: 'y', action_type: 'recommend', exposure: 'internal-shared',
                decision_bindingness, output_reversibility: 'reversible', scale: 'limited',
              }],
            }),
            holed,
          ).ok,
      ).map((b) => `${model_type} + ${b}`),
    );

    expect(unrouted.length).toBeGreaterThan(0);
    expect(unrouted).toContain('statistical + advisory');
  });
});
