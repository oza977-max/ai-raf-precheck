import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../store/policy';
import { loadPacks } from '../store/packs';
import { getPackSources } from '../store/pack-source';
import { evaluate } from './evaluate';
import { buildGraphFromForm } from './build-graph-from-form';
import { plainAnswersToFormValues } from './plain-intake';
import type { PlainAnswers } from '../components/plain-copy';
import type { DataFlowGraph, DecisionType, PolicyFile } from './types';

// R16-B (§2.3): "For UC-9..UC-13 (no stories), add a separate, clearly-
// labelled NON-blind test that translates their recorded form values into
// answers." Unlike backtest-parity.test.ts, this file's answers are
// constructed BY THIS CHUNK'S BUILDER directly from UC-9..13's already-
// recorded field values (backtest/use-cases.md "Jurisdictional cases"
// section) — there is no narrative to stay blind to, and no separate
// author. Every answer choice below is the most literal, least-interpretive
// translation of the recorded field into the new question's options (e.g.
// a recorded data_class of 'Client PII' -> Q5 "Information about people").

let policy: PolicyFile;
let packs: ReturnType<typeof loadPacks>['packs'];

beforeAll(() => {
  const yaml = readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8');
  const r = loadPolicy(yaml);
  if (!r.valid) throw new Error('policy invalid');
  policy = r.policy;
  const packResult = loadPacks(getPackSources());
  if (packResult.errors.length > 0) throw new Error('pack load errors: ' + JSON.stringify(packResult.errors));
  packs = packResult.packs;
});

interface OriginalOpts {
  dataClass: string;
  inZone: string;
  model: string;
  autonomy: number;
  procZone: string;
  action: string;
  exposure: string;
  bindingness: string;
  reversibility: string;
  scale: string;
  decisionType?: DecisionType;
  hitl?: boolean;
  jurisdictions: string[];
}

// Reconstructed exactly as backtest-predictions.test.ts's own `g2()` helper
// builds the jurisdictional cases (that file's helper is a module-local
// function, not exported).
function originalGraph(o: OriginalOpts): DataFlowGraph {
  return {
    id: 'bt',
    version: 1,
    intake_method: 'structured_form',
    extracted_at: '2026-01-01T00:00:00Z',
    jurisdictions: o.jurisdictions,
    input_nodes: [{ id: 'i1', label: 'in', data_class: o.dataClass as never, data_zone: o.inZone as never }],
    processing_nodes: [
      {
        id: 'p1',
        label: 'model',
        model_type: o.model as never,
        autonomy_level: o.autonomy as never,
        data_zone: o.procZone as never,
        vendor: 'internal',
        replaces_prior_model: false,
      },
    ],
    output_nodes: [
      {
        id: 'o1',
        label: 'out',
        action_type: o.action as never,
        exposure: o.exposure as never,
        decision_bindingness: o.bindingness as never,
        output_reversibility: o.reversibility as never,
        scale: o.scale as never,
        ...(o.decisionType ? { decision_type: o.decisionType } : {}),
        ...(o.hitl !== undefined ? { hitl: o.hitl } : {}),
      },
    ],
    edges: [
      { from: 'i1', to: 'p1' },
      { from: 'p1', to: 'o1' },
    ],
  };
}

interface NamedSubset {
  status: string;
  tier?: string;
  track?: string;
  binding?: string;
  controls: string[];
  downstream_reviews: string[];
  tripped: string[];
}

function evalNamedSubset(graph: DataFlowGraph): NamedSubset {
  const r = evaluate(graph, policy, packs);
  if (!r.ok) throw new Error(`evaluate() failed: ${r.error.kind}`);
  return {
    status: r.value.status,
    tier: r.value.tier,
    track: r.value.track,
    binding: r.value.binding_constraint,
    controls: [...r.value.controls].sort(),
    downstream_reviews: [...r.value.downstream_reviews].sort(),
    tripped: [...r.value.explanation.tripped_invariants.map((t) => t.id)].sort(),
  };
}

function translatedResult(answers: PlainAnswers): NamedSubset {
  const { values } = plainAnswersToFormValues(answers, policy);
  return evalNamedSubset(buildGraphFromForm(values));
}

describe('R16-B parity (§2.3) — NON-blind: UC-9..13 recorded form values translated into answers', () => {
  it('TC-R16-B-28 (UC-9, EU retail credit scoring): matches in full — "the firm’s in-house model platform" (Zone B, vendor internal) reproduces the recorded Zone B / internal vendor exactly', () => {
    const translated = translatedResult({
      '1': 'EU retail credit scoring',
      '2': 'x',
      '3': 'PLAT-INTERNAL-ML',
      '4': 'score',
      '4a': 'unexplainable',
      '5': ['people'],
      '6': 'suggests',
      '6a': 'usually-basis',
      '7': 'other-teams',
      '8': 'credit',
      '9': 'yes',
      '10': 'team',
      '11': ['UK', 'EU'],
      '12': 'no',
    });
    const original = evalNamedSubset(
      originalGraph({
        dataClass: 'Client PII',
        inZone: 'Zone B',
        model: 'ml',
        autonomy: 1,
        procZone: 'Zone B',
        action: 'recommend',
        exposure: 'internal-shared',
        bindingness: 'material',
        reversibility: 'reversible',
        scale: 'at_scale',
        decisionType: 'credit-decision',
        hitl: true,
        jurisdictions: ['UK', 'EU'],
      }),
    );
    expect(translated).toEqual(original);
  });

  it('TC-R16-B-29 (UC-10, EU CV screening): DIFFERS, verdict-neutral — declaring the in-house platform here genuinely FITS its approved envelope (Internal <= Confidential, internal-shared <= internal-shared, autonomy 1 <= 2, Zone B, EU), so CTRL-DRIFT-01/CTRL-FINGERPRINT-01 are now satisfied by PV-3 inheritance instead of solved for directly — the minimal-set solver then picks the cheaper CTRL-EXPLAIN-01 alone for the one invariant inheritance does not cover (INV-EXPLAIN-01), where the undeclared-platform original needed the multi-resolving CTRL-INDEP-VAL-01. Same tripped invariants, same status/tier/track/binding/downstream reviews — only which control discharges INV-EXPLAIN-01 differs, and it differs because this answer path legitimately earns an inheritance the original recording never claimed.', () => {
    const translated = translatedResult({
      '1': 'EU CV screening',
      '2': 'x',
      '3': 'PLAT-INTERNAL-ML',
      '4': 'score',
      '4a': 'unexplainable',
      '5': ['everyday'],
      '6': 'suggests',
      '6a': 'usually-basis',
      '7': 'other-teams',
      '8': 'hiring',
      '9': 'yes',
      '10': 'team',
      '11': ['EU'],
      '12': 'no',
    });
    const original = evalNamedSubset(
      originalGraph({
        dataClass: 'Internal',
        inZone: 'Zone B',
        model: 'ml',
        autonomy: 1,
        procZone: 'Zone B',
        action: 'recommend',
        exposure: 'internal-shared',
        bindingness: 'material',
        reversibility: 'reversible',
        scale: 'at_scale',
        decisionType: 'hiring',
        jurisdictions: ['EU'],
      }),
    );
    expect(translated.status).toBe(original.status);
    expect(translated.tier).toBe('Critical');
    expect(translated.tier).toBe(original.tier);
    expect(translated.track).toBe(original.track);
    expect(translated.binding).toBe(original.binding);
    expect(translated.tripped).toEqual(original.tripped);
    expect(translated.downstream_reviews).toEqual(original.downstream_reviews);
    expect(original.controls).toEqual(['CTRL-BIAS-01', 'CTRL-INDEP-VAL-01', 'CTRL-SAMPLE-01']);
    expect(translated.controls).toEqual(['CTRL-BIAS-01', 'CTRL-EXPLAIN-01', 'CTRL-SAMPLE-01']);
  });

  it('TC-R16-B-30 (UC-11, UK-only quant VaR model): matches in full — "something a team in your firm built" (Zone C, vendor internal) reproduces the recorded graph exactly; the "suggests" branch’s fixed autonomy level 1 (vs the original’s recorded 0) is verdict-neutral here, same as UC-4/UC-7’s documented autonomy-level differences — no invariant in this corpus keys on the 0-vs-1 boundary', () => {
    const translated = translatedResult({
      '1': 'UK VaR model',
      '2': 'x',
      '3': 'firm-built',
      '4': 'score',
      '4a': 'rules',
      '5': ['everyday'],
      '6': 'suggests',
      '6a': 'usually-basis',
      '7': 'me-or-team',
      '8': 'operational',
      '9': 'yes',
      '10': 'team',
      '11': ['UK'],
      '12': 'no',
    });
    const original = evalNamedSubset(
      originalGraph({
        dataClass: 'Internal',
        inZone: 'Zone C',
        model: 'statistical',
        autonomy: 0,
        procZone: 'Zone C',
        action: 'recommend',
        exposure: 'internal-only',
        bindingness: 'material',
        reversibility: 'reversible',
        scale: 'at_scale',
        jurisdictions: ['UK'],
      }),
    );
    expect(translated).toEqual(original);
  });

  it('TC-R16-B-31 (UC-12, Canada model): matches in full — the "suggests" branch’s fixed autonomy level 1 (vs the original’s recorded 2) is verdict-neutral: TIER-MEDIUM’s own "autonomy_level in [2]" trigger is not the only Medium trigger here (exposure internal-shared also fires it independently), and no invariant in this corpus’s tripped set keys on autonomy_level at all', () => {
    const translated = translatedResult({
      '1': 'Canada model',
      '2': 'x',
      '3': 'firm-built',
      '4': 'score',
      '4a': 'unexplainable',
      '5': ['everyday'],
      '6': 'suggests',
      '6a': 'one-input',
      '7': 'other-teams',
      '8': 'operational',
      '9': 'yes',
      '10': 'small',
      '11': ['CA'],
      '12': 'no',
    });
    const original = evalNamedSubset(
      originalGraph({
        dataClass: 'Internal',
        inZone: 'Zone C',
        model: 'ml',
        autonomy: 2,
        procZone: 'Zone C',
        action: 'recommend',
        exposure: 'internal-shared',
        bindingness: 'advisory',
        reversibility: 'reversible',
        scale: 'limited',
        jurisdictions: ['CA'],
      }),
    );
    expect(translated).toEqual(original);
  });

  it('TC-R16-B-32 (UC-13, SG+JP client-facing assistant): matches in full', () => {
    const translated = translatedResult({
      '1': 'SG+JP assistant',
      '2': 'x',
      '3': 'PLAT-INTERNAL-ML',
      '4': 'language',
      '5': ['everyday'],
      '6': 'suggests',
      '6a': 'one-input',
      '7': 'clients',
      '8': 'operational',
      '9': 'yes',
      '10': 'team',
      '11': ['SG', 'JP'],
      '12': 'no',
    });
    const original = evalNamedSubset(
      originalGraph({
        dataClass: 'Internal',
        inZone: 'Zone B',
        model: 'llm',
        autonomy: 1,
        procZone: 'Zone B',
        action: 'recommend',
        exposure: 'client-facing',
        bindingness: 'advisory',
        reversibility: 'reversible',
        scale: 'at_scale',
        jurisdictions: ['SG', 'JP'],
      }),
    );
    expect(translated).toEqual(original);
  });
});
