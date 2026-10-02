import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../store/policy';
import { loadPacks } from '../store/packs';
import { getPackSources } from '../store/pack-source';
import { evaluate } from './evaluate';
import { buildGraphFromForm } from './build-graph-from-form';
import { plainAnswersToFormValues } from './plain-intake';
import { optionKeyForText, findQuestion } from '../components/plain-copy';
import type { PlainAnswers, QuestionId } from '../components/plain-copy';
import type { DataFlowGraph, PolicyFile } from './types';

// R16-B parity test (§2.3, UC-8 fit criterion 5). The answers in
// backtest/worked-case-answers.json were written BLIND — from each worked
// case's narrative only, by a separate agent, never from the recorded form
// values or the predicted verdict (see that file's own "note" field and
// R16.md §2.3). This test:
//   1. translates that blind text into option keys (never the reverse —
//      the mapping table in plain-intake.ts never sees narrative prose);
//   2. runs answers -> plainAnswersToFormValues -> buildGraphFromForm ->
//      evaluate, with the REAL shipped policy and packs;
//   3. compares the named subset (status, tier, track, binding constraint,
//      controls, downstream reviews, tripped invariant ids) against the
//      SAME graphs backtest-predictions.test.ts pins (reconstructed here
//      rather than imported, since that file's `cases` array is a local
//      const) run through the identical evaluate() call.
// Every difference is asserted explicitly, with its reason, never silently
// normalised away — see the per-case blocks below. The answers file and
// plain-intake.ts are NEVER edited to make a case match.
//
// R16-W (D-72): three embedded downstream-review strings below changed
// ONLY in wording, not in computation — the unresolved-vendor review text
// used to interpolate the vendor string verbatim, and that string used to
// read "unregistered (where this AI comes from was not sure)" (engine
// vocabulary reaching an audit-trail string). It now reads "an AI service
// you weren't sure about". Same rule firing, same case classification;
// listed here once rather than annotated at each of the three sites,
// since the change is identical and mechanical at all three.

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

// ---- the ORIGINAL recorded graphs, reconstructed exactly as
// backtest-predictions.test.ts's own `g()` helper builds them (that file's
// `cases` array is a module-local const, not exported) ----
function originalGraph(
  dataClass: string,
  inZone: string,
  model: string,
  autonomy: number,
  procZone: string,
  action: string,
  exposure: string,
  bindingness: string,
  reversibility: string,
  scale: string,
): DataFlowGraph {
  return {
    id: 'bt',
    version: 1,
    intake_method: 'structured_form',
    extracted_at: '2026-01-01T00:00:00Z',
    jurisdictions: [],
    input_nodes: [{ id: 'i1', label: 'in', data_class: dataClass as never, data_zone: inZone as never }],
    processing_nodes: [
      {
        id: 'p1',
        label: 'model',
        model_type: model as never,
        autonomy_level: autonomy as never,
        data_zone: procZone as never,
        vendor: 'internal',
        replaces_prior_model: false,
      },
    ],
    output_nodes: [
      {
        id: 'o1',
        label: 'out',
        action_type: action as never,
        exposure: exposure as never,
        decision_bindingness: bindingness as never,
        output_reversibility: reversibility as never,
        scale: scale as never,
      },
    ],
    edges: [
      { from: 'i1', to: 'p1' },
      { from: 'p1', to: 'o1' },
    ],
  };
}

const ORIGINAL_GRAPHS: Record<string, DataFlowGraph> = {
  'UC-1': originalGraph('Confidential', 'Zone B', 'llm', 1, 'Zone B', 'draft', 'internal-shared', 'advisory', 'reversible', 'at_scale'),
  'UC-2': originalGraph('MNPI', 'Zone B', 'llm', 1, 'Zone B', 'draft', 'internal-shared', 'advisory', 'reversible', 'at_scale'),
  'UC-3': originalGraph('Client PII', 'Zone B', 'llm', 1, 'Zone B', 'recommend', 'internal-shared', 'material', 'reversible', 'at_scale'),
  'UC-4': originalGraph('Client PII', 'Zone C', 'traditional-ml', 4, 'Zone C', 'execute', 'client-facing', 'binding', 'irreversible', 'at_scale'),
  'UC-5': originalGraph('Internal', 'Zone B', 'llm', 1, 'Zone B', 'recommend', 'internal-shared', 'advisory', 'reversible', 'at_scale'),
  'UC-6a': originalGraph('MNPI', 'Zone B', 'llm', 1, 'Zone B', 'draft', 'internal-shared', 'material', 'reversible', 'limited'),
  'UC-6b': originalGraph('MNPI', 'Zone C', 'llm', 1, 'Zone C', 'draft', 'internal-shared', 'material', 'reversible', 'limited'),
  'UC-7': originalGraph('Internal', 'Zone B', 'agentic', 1, 'Zone B', 'draft', 'internal-only', 'non-binding', 'reversible', 'at_scale'),
  'UC-8': originalGraph('Confidential', 'Zone B', 'llm', 1, 'Zone B', 'draft', 'internal-shared', 'material', 'reversible', 'limited'),
};
// UC-8's narrative ("regulatory returns ... Pillar 3") answers Q8 with
// "Figures or statements sent to a regulator" (regulatory-reporting),
// which backtest-predictions.test.ts's own UC-8 entry leaves blank —
// reproducing its separate "UC-8b" pinned verdict instead (§2.3, named in
// the contract as a known, expected difference).
const UC8B_BASE = originalGraph('Confidential', 'Zone B', 'llm', 1, 'Zone B', 'draft', 'internal-shared', 'material', 'reversible', 'limited');
const UC8B_ORIGINAL: DataFlowGraph = {
  ...UC8B_BASE,
  output_nodes: [{ ...UC8B_BASE.output_nodes[0]!, decision_type: 'regulatory-reporting' as never }],
};

// ---- blind text -> option key resolution (test-only; never used by the
// product). The product's mapping (plain-intake.ts) only ever sees keys —
// this is purely how the TEST recovers which key the blind prose maps to,
// per §2.3: "map text -> option keys". ----
function resolveKey(id: QuestionId, text: string): string {
  const q = findQuestion(id);
  if (q?.freeText) return text;
  const staticKey = optionKeyForText(id, text);
  if (staticKey) return staticKey;
  if (id === '3') {
    const platform = (policy.platforms ?? []).find((p) => p.plain_name === text);
    if (platform) return platform.id;
  }
  if (id === '3supplier') {
    const vendor = (policy.vendors ?? []).find((v) => (v.kind ?? 'supplier') === 'supplier' && v.plain_name === text);
    if (vendor) return vendor.id;
  }
  if (id === '3aWhich') {
    const vendor = (policy.vendors ?? []).find((v) => v.kind === 'company_assistant' && v.plain_name === text);
    if (vendor) return vendor.id;
  }
  if (id === '11') {
    const j = (policy.jurisdictions ?? []).find((j) => j.name === text);
    if (j) return j.code;
  }
  throw new Error(`backtest-parity: no key found for Q${id} text "${text}" — is the answers file or the policy out of sync?`);
}

function resolveAnswers(raw: Record<string, string | string[]>): PlainAnswers {
  const out: PlainAnswers = {};
  for (const [qid, value] of Object.entries(raw)) {
    const id = qid as QuestionId;
    out[id] = Array.isArray(value) ? value.map((v) => resolveKey(id, v)) : resolveKey(id, value);
  }
  return out;
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

const worked = JSON.parse(
  readFileSync(resolve(__dirname, '../../backtest/worked-case-answers.json'), 'utf-8'),
) as { cases: Record<string, { answers: Record<string, string | string[]> }> };

function blindResult(ucId: string): NamedSubset {
  const answers = resolveAnswers(worked.cases[ucId]!.answers);
  const { values } = plainAnswersToFormValues(answers, policy);
  const graph = buildGraphFromForm(values);
  return evalNamedSubset(graph);
}

describe('R16-B parity (§2.3) — blind answers vs the worked-case predictions', () => {
  it('TC-R16-B-16 (UC-1): matches in full — status, tier, track and binding constraint are unchanged; the cloud-assistant platform’s vendor_id link (chunk A2) adds "Vendor risk assessment" to downstream reviews, a documented, status-neutral difference (DR-VENDOR-01 now fires because the blind answer resolves the platform’s vendor_id instead of the recorded form’s unset vendor, which defaulted to "internal")', () => {
    const blind = blindResult('UC-1');
    const original = evalNamedSubset(ORIGINAL_GRAPHS['UC-1']!);
    expect(blind.status).toBe(original.status);
    expect(blind.tier).toBe(original.tier);
    expect(blind.track).toBe(original.track);
    expect(blind.binding).toBe(original.binding);
    expect(blind.controls).toEqual(original.controls);
    expect(blind.downstream_reviews).toEqual([...original.downstream_reviews, 'Vendor risk assessment'].sort());
  });

  it('TC-R16-B-17 (UC-2): matches in full — rejected via HL-002, same as the original; the vendor-risk review still attaches to the hard-line rejection (A1’s per-instance review sources fix) exactly as it does for UC-1', () => {
    const blind = blindResult('UC-2');
    const original = evalNamedSubset(ORIGINAL_GRAPHS['UC-2']!);
    expect(blind.status).toBe('rejected');
    expect(blind.binding).toBe(original.binding);
    expect(blind.downstream_reviews).toEqual([...original.downstream_reviews, 'Vendor risk assessment'].sort());
  });

  it('TC-R16-B-18 (UC-3): DIFFERS — the narrative’s own silence on where the AI comes from ("Not sure yet") resolves to an unregistered vendor (INV-VENDOR-01, CTRL-TPRM-01), and the narrative explicitly supports BOTH "personal guarantees... borrower personal data" AND "the firm’s confidential loan-book data" (Q5 ticks both people and confidential), which the single-data-class old form could never express at once — the second tick alone trips INV-CONFDATA-01. The narrative’s own "Whether to lend to someone" (Q8 = credit-decision) is a THIRD new fact the old backtest recording never set at all (it has no decision_type), and forces TIER-CRITICAL + INV-FAIRNESS-01 (Critical severity, now the binding constraint, outranking INV-HALLUC-01’s High). None of this is a mapping bug: UC-3 literally is a lending-terms review, and the new answers capture more of what the narrative actually says than the old single-field recording did.', () => {
    const blind = blindResult('UC-3');
    const original = evalNamedSubset(ORIGINAL_GRAPHS['UC-3']!);
    expect(original.tier).toBe('High');
    expect(original.binding).toBe('INV-HALLUC-01');
    expect(blind.status).toBe('approved_with_controls');
    expect(blind.status).toBe(original.status);
    expect(blind.track).toBe(original.track);
    expect(blind.tier).toBe('Critical');
    expect(blind.binding).toBe('INV-FAIRNESS-01');
    expect(blind.tripped).toEqual(
      [...original.tripped, 'INV-CONFDATA-01', 'INV-FAIRNESS-01', 'INV-VENDOR-01'].sort(),
    );
    expect(blind.controls).toEqual([...original.controls, 'CTRL-BIAS-01', 'CTRL-TPRM-01'].sort());
    expect(blind.downstream_reviews).toEqual([
      'Full vendor/platform risk assessment required — an AI service you weren’t sure about is not on the approved list',
      'Information security review',
      'Vendor risk assessment',
    ]);
  });

  it('TC-R16-B-19 (UC-4): status and binding match (HL-001 rejects regardless of model_type, which the hard line never checks); the form’s own 4a branch resolves model_type to "ml" ("No, or I don’t know"), not the original’s recorded "traditional-ml" — a documented, verdict-neutral difference since track/tier are skipped entirely on a hard-line rejection', () => {
    const blind = blindResult('UC-4');
    const original = evalNamedSubset(ORIGINAL_GRAPHS['UC-4']!);
    expect(blind.status).toBe('rejected');
    expect(blind.status).toBe(original.status);
    expect(blind.binding).toBe('HL-001');
    expect(blind.binding).toBe(original.binding);
  });

  it('TC-R16-B-20 (UC-5): DIFFERS — "Not sure yet" (Q3) again resolves to an unregistered vendor (INV-VENDOR-01, CTRL-TPRM-01); the narrative’s "RCSA control mappings" and "the official loss database" reads as "Confidential firm information" (Q5), not the originally-recorded plain "Internal" — at the resulting Zone A this trips INV-CONFDATA-01 too. The narrative’s own closing line, "the classification is what actually goes into the official loss database", reads as action "drafts" (not "suggests") with weight "usually what a decision is based on" (material, not advisory) — a different, defensible situational judgement that in turn trips INV-HALLUC-01 in place of INV-TRACK2-01 as the binding constraint (both High severity; INV-SAMPLE-01 no longer applies because the action is no longer "recommend"). Tier and track are unaffected.', () => {
    const blind = blindResult('UC-5');
    const original = evalNamedSubset(ORIGINAL_GRAPHS['UC-5']!);
    expect(original.tier).toBe('Medium');
    expect(original.binding).toBe('INV-TRACK2-01');
    expect(blind.status).toBe(original.status);
    expect(blind.tier).toBe(original.tier);
    expect(blind.track).toBe(original.track);
    expect(blind.binding).toBe('INV-HALLUC-01');
    expect(blind.tripped).toEqual([
      'INV-CITE-01',
      'INV-CONFDATA-01',
      'INV-DRIFT-01',
      'INV-EXPLAIN-01',
      'INV-HALLUC-01',
      'INV-SEC-01',
      'INV-TRACK2-01',
      'INV-VENDOR-01',
    ]);
    expect(blind.controls).toEqual([
      'CTRL-CITE-01',
      'CTRL-ENC-01',
      'CTRL-GROUND-01',
      'CTRL-INDEP-VAL-01',
      'CTRL-REDTEAM-01',
      'CTRL-TPRM-01',
    ]);
    expect(blind.downstream_reviews).toEqual([
      'Full vendor/platform risk assessment required — an AI service you weren’t sure about is not on the approved list',
      'Vendor risk assessment',
    ]);
  });

  it('TC-R16-B-21 (UC-6a): matches in full — the cloud-assistant platform again adds "Vendor risk assessment" to the rejected verdict’s downstream reviews, same mechanism as UC-1/UC-2', () => {
    const blind = blindResult('UC-6a');
    const original = evalNamedSubset(ORIGINAL_GRAPHS['UC-6a']!);
    expect(blind.status).toBe('rejected');
    expect(blind.binding).toBe(original.binding);
    expect(blind.downstream_reviews).toEqual([...original.downstream_reviews, 'Vendor risk assessment'].sort());
  });

  it('TC-R16-B-22 (UC-6b): the LISTED (zone-driven) difference disappears — R16-W’s W-9 fix (D-79) adds a platform-zone follow-up when a platform allows more than one zone, so PLAT-INTERNAL-ML no longer defaults to "the earliest letter among its allowed zones" (Zone B) unconditionally; the worked case’s own narrative ("deal content never leaves firm-controlled infrastructure") answers the follow-up with the Zone C option, reproducing the originally-recorded Zone C exactly, so status/track/downstream_reviews now match and the rejected-vs-approved flip R16.md §2.3 documented is gone, as the R16-W contract requires. A SEPARATE, pre-existing difference surfaces now that status no longer short-circuits at a hard-line rejection: this worked case shares UC-6a’s Q8 answer ("Whether to lend to someone, or on what terms", decision_type credit-decision), which the simple ORIGINAL_GRAPHS fixture (no decisionType parameter at all, same gap UC-3/UC-5/UC-7/UC-8 already report) never modelled — so INV-FAIRNESS-01/CTRL-BIAS-01 now fire and tier reads Critical, not High. This is the same class of "the new answers capture more than the old fixture did" difference those other cases document, not a zone-mapping defect; reported per the contract’s "report why rather than adjusting expectations" instruction rather than silently matched away.', () => {
    const blind = blindResult('UC-6b');
    const original = evalNamedSubset(ORIGINAL_GRAPHS['UC-6b']!);
    expect(original.status).toBe('approved_with_controls');
    expect(original.tier).toBe('High');
    expect(original.binding).toBe('INV-HALLUC-01');
    // The zone fix: status, track and downstream reviews now match exactly.
    expect(blind.status).toBe(original.status);
    expect(blind.track).toBe(original.track);
    expect(blind.downstream_reviews).toEqual(original.downstream_reviews);
    // The separate, pre-existing decision_type gap: tier/binding/controls
    // differ because this blind answer set (unlike the simple fixture)
    // actually declares a lending decision.
    expect(blind.tier).toBe('Critical');
    expect(blind.binding).toBe('INV-FAIRNESS-01');
    expect(blind.tripped).toEqual([...original.tripped, 'INV-FAIRNESS-01'].sort());
    expect(blind.controls).toEqual([...original.controls, 'CTRL-BIAS-01'].sort());
  });

  it('TC-R16-B-23 (UC-7): DIFFERS — three narrative-supported facts the old single-field recording never carried: (1) the named-but-unlisted supplier ("Claude Code", "Not on this list") resolves to an unregistered vendor (INV-VENDOR-01, CTRL-TPRM-01) where the recording left vendor unset ("internal"); (2) "it reads internal code repositories and data schemas" reads as "Confidential firm information" (Q5), not the recorded plain "Internal" — Confidential + Zone B (from the specialist-product answer) trips INV-CONFDATA-01 (CTRL-ENC-01); (3) the narrative’s own "needs some standing access" supports ticking "its own logins... for other systems" (Q13), which trips the CRITICAL-severity INV-AGENT-CRED-01 (CTRL-AGENT-CRED-01) — outranking INV-AGENT-01’s High severity, so it replaces it as the binding constraint. Status, tier and track are unaffected (Low / III, as originally).', () => {
    const blind = blindResult('UC-7');
    const original = evalNamedSubset(ORIGINAL_GRAPHS['UC-7']!);
    expect(original.tier).toBe('Low');
    expect(original.track).toBe('III');
    expect(original.binding).toBe('INV-AGENT-01');
    expect(blind.status).toBe(original.status);
    expect(blind.tier).toBe(original.tier);
    expect(blind.track).toBe(original.track);
    expect(blind.binding).toBe('INV-AGENT-CRED-01');
    expect(blind.tripped).toEqual(
      ['INV-AGENT-CRED-01', 'INV-CONFDATA-01', 'INV-VENDOR-01', ...original.tripped].sort(),
    );
    expect(blind.controls).toEqual(['CTRL-AGENT-CRED-01', 'CTRL-ENC-01', 'CTRL-TPRM-01', ...original.controls].sort());
    expect(blind.downstream_reviews).toEqual([
      'Full vendor/platform risk assessment required — Claude Code (not on your firm’s list) is not on the approved list',
      'Vendor risk assessment',
    ]);
  });

  it('TC-R16-B-24 (UC-8): DIFFERS — the narrative’s own words answer Q8 with "Figures or statements sent to a regulator" (regulatory-reporting), reproducing the backtest pack’s separate UC-8b entry rather than UC-8’s own blank-decision-type prediction (the exact difference R16.md §2.3 names in advance: "UC-8’s blank-decision-type variant is unreachable by design, Q8 is required"). Beyond that documented difference, the narrative’s own "ultimately filed with/published to regulators and the market" is read as the widest audience (Q7 = market-facing), which UC-8b’s recording left at "internal-shared" — market-facing alone forces TIER-CRITICAL (not UC-8b’s High) and trips INV-CONDUCT-01 and INV-SYNTHMARK-01, which become the binding constraint. The narrative’s "reporting managers own every submitted word" is read as advisory weight (Q6a), not UC-8b’s recorded material, so INV-HALLUC-01/INV-DRIFT-01/INV-EXPLAIN-01 no longer trip. "Not sure yet" (Q3) again adds the unregistered-vendor review.', () => {
    const blind = blindResult('UC-8');
    const uc8bOriginal = evalNamedSubset(UC8B_ORIGINAL);
    expect(uc8bOriginal.tier).toBe('High');
    expect(uc8bOriginal.binding).toBe('INV-HALLUC-01');
    expect(blind.status).toBe('approved_with_controls');
    expect(blind.status).toBe(uc8bOriginal.status);
    expect(blind.track).toBe(uc8bOriginal.track);
    expect(blind.tier).toBe('Critical');
    expect(blind.binding).toBe('INV-CONDUCT-01');
    expect(blind.tripped).toEqual([
      'INV-CITE-01',
      'INV-CONDUCT-01',
      'INV-CONFDATA-01',
      'INV-SEC-01',
      'INV-SYNTHMARK-01',
      'INV-TRACK2-01',
      'INV-VENDOR-01',
    ]);
    expect(blind.controls).toEqual([
      'CTRL-CITE-01',
      'CTRL-CONDUCT-01',
      'CTRL-ENC-01',
      'CTRL-FINGERPRINT-01',
      'CTRL-REDTEAM-01',
      'CTRL-SYNTHMARK-01',
      'CTRL-TPRM-01',
    ]);
    expect(blind.downstream_reviews).toEqual([
      'Full vendor/platform risk assessment required — an AI service you weren’t sure about is not on the approved list',
      'Vendor risk assessment',
    ]);
  });
});

// §2.3's three named assumption cases — synthetic, not from worked-case-
// answers.json, each asserting the verdict AND the listed assumption.
function run(answers: PlainAnswers): {
  status: string;
  tier?: string;
  binding?: string;
  controls: string[];
  tripped: string[];
  assumptionIds: string[];
} {
  const { values, assumptions } = plainAnswersToFormValues(answers, policy);
  const graph = buildGraphFromForm(values);
  const r = evaluate(graph, policy, packs);
  if (!r.ok) throw new Error(`evaluate() failed: ${r.error.kind}`);
  return {
    status: r.value.status,
    tier: r.value.tier,
    binding: r.value.binding_constraint,
    controls: [...r.value.controls].sort(),
    tripped: [...r.value.explanation.tripped_invariants.map((t) => t.id)].sort(),
    assumptionIds: assumptions.map((a) => a.questionId),
  };
}

const ASSUMPTION_CASE_BASE: PlainAnswers = {
  '1': 'Assumption case',
  '2': 'x',
  '3': 'firm-built',
  '4': 'language',
  '5': ['everyday'],
  '8': 'operational',
  '10': 'small',
  '11': ['elsewhere-not-sure'],
  '12': 'no',
};

describe('R16-B assumption cases (§2.3)', () => {
  it('TC-R16-B-25: Q9 "Not sure" + acting entirely by itself + clients see it -> HL-001 ("No"), with the Q9 assumption listed (D-07)', () => {
    const out = run({
      ...ASSUMPTION_CASE_BASE,
      '6': 'acts-alone',
      '6b': 'something-else',
      '7': 'clients',
      '9': 'not-sure',
    });
    expect(out.status).toBe('rejected');
    expect(out.binding).toBe('HL-001');
    expect(out.assumptionIds).toEqual(['9']);
  });

  it('TC-R16-B-26: Q4 "Not sure" (a tool described as acting on its own) -> agent safeguards present (INV-AGENT-01, CTRL-LOG-01), with the Q4 assumption listed (D-48)', () => {
    const out = run({
      ...ASSUMPTION_CASE_BASE,
      '4': 'not-sure',
      '6': 'read',
      '7': 'me-or-team',
      '9': 'yes',
      '13': ['none'],
      '14': 'no',
    });
    expect(out.status).toBe('approved_with_controls');
    expect(out.tripped).toContain('INV-AGENT-01');
    expect(out.controls).toContain('CTRL-LOG-01');
    expect(out.assumptionIds).toEqual(['4']);
  });

  it('TC-R16-B-27: Q6 + Q7 "Not sure" together -> the strictest graph (acts entirely alone, binding, market-facing — the widest reach and the least oversight at once), with both assumptions listed', () => {
    const out = run({
      ...ASSUMPTION_CASE_BASE,
      '6': 'not-sure',
      '7': 'not-sure',
      '9': 'yes',
    });
    expect(out.status).toBe('approved_with_controls');
    expect(out.tier).toBe('Critical');
    expect(out.binding).toBe('INV-AUTONOMY-01');
    // The strictest-graph claim made concrete: both the "acts alone"
    // autonomy invariants AND the "widest audience" conduct/synthetic-
    // marking invariants trip together, which no single "Not sure" answer
    // alone would produce.
    expect(out.tripped).toEqual([
      'INV-ACT-LOG-01',
      'INV-AUTONOMY-01',
      'INV-AUTONOMY-02',
      'INV-CONDUCT-01',
      'INV-DRIFT-01',
      'INV-EXPLAIN-01',
      'INV-HALLUC-01',
      'INV-SEC-01',
      'INV-SYNTHMARK-01',
      'INV-TRACK2-01',
    ]);
    expect(out.assumptionIds).toEqual(['6', '7']);
  });
});
