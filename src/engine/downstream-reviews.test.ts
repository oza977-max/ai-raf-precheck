import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../store/policy';
import { firmRequiredReviews } from './downstream-reviews';
import { evaluate } from './evaluate';
import type { DataFlowGraph, PolicyFile } from './types';

// Round 4 — CS-3. The verdict must list downstream reviews triggered by the
// use case's characteristics: InfoSec review, vendor risk assessment, cloud
// security approval, "or other bank-configured processes", as steps separate
// from the AI risk pre-check.
//
// Build verification 003 found this had no implementation at all. Reviews
// could only come from a jurisdiction pack's `required_review` effect or from
// an unregistered platform/vendor — the FIRM'S OWN policy had no way to
// require one. An MNPI-handling use case triggered no InfoSec review because
// no such rule could be expressed.

let policy: PolicyFile;

beforeAll(() => {
  const yaml = readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8');
  const result = loadPolicy(yaml);
  if (!result.valid) throw new Error(`fixture policy invalid: ${JSON.stringify(result.errors)}`);
  policy = result.policy;
});

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

const mnpiGraph = () =>
  graph({
    input_nodes: [{ id: 'i1', label: 'deal notes', data_class: 'MNPI', data_zone: 'Zone C' }],
    processing_nodes: [
      {
        id: 'p1',
        label: 'summariser',
        model_type: 'llm',
        autonomy_level: 1,
        data_zone: 'Zone C',
        vendor: 'internal',
        replaces_prior_model: false,
      },
    ],
    output_nodes: [
      {
        id: 'o1',
        label: 'summary',
        action_type: 'recommend',
        exposure: 'internal-only',
        decision_bindingness: 'advisory',
        output_reversibility: 'reversible',
        scale: 'limited',
      },
    ],
    edges: [
      { from: 'i1', to: 'p1' },
      { from: 'p1', to: 'o1' },
    ],
  });

describe('firmRequiredReviews (CS-3)', () => {
  it('the firm policy can require a review from a use case characteristic', () => {
    const reviews = firmRequiredReviews(mnpiGraph(), policy);

    // The rule is policy content, not engine content — what the engine
    // guarantees is that a matching rule reaches the verdict.
    expect(reviews.length).toBeGreaterThan(0);
    expect(reviews.some((r) => /information security|infosec/i.test(r.review))).toBe(true);
  });

  it('names the rule that triggered each review, so a reader can check it', () => {
    const reviews = firmRequiredReviews(mnpiGraph(), policy);

    // CS-3's fit criterion: "with the policy rule that triggered each one
    // named". A review with no traceable cause is an instruction with no
    // author.
    for (const r of reviews) {
      expect(r.rule_id).toBeTruthy();
      expect(r.review).toBeTruthy();
    }
  });

  it('does not fire on a use case without the characteristic', () => {
    const benign = graph({
      input_nodes: [{ id: 'i1', label: 'public data', data_class: 'Public', data_zone: 'Zone C' }],
      processing_nodes: [
        {
          id: 'p1',
          label: 'summariser',
          model_type: 'ml',
          autonomy_level: 0,
          data_zone: 'Zone C',
          vendor: 'internal',
          replaces_prior_model: false,
        },
      ],
    });

    expect(firmRequiredReviews(benign, policy).some((r) => /infosec|information security/i.test(r.review))).toBe(
      false,
    );
  });

  it('is pure — no clock, no randomness, no I/O', () => {
    const a = firmRequiredReviews(mnpiGraph(), policy);
    const b = firmRequiredReviews(mnpiGraph(), policy);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('TC-CS-3-01: the triggered review reaches the verdict', () => {
  it('an MNPI-handling use case carries an information security review', () => {
    const result = evaluate(mnpiGraph(), policy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // This is the assertion build verification 003 could not make: the
    // mechanism existed, the rule did not, so nothing reached the verdict.
    expect(result.value.downstream_reviews.some((r) => /information security|infosec/i.test(r))).toBe(true);
  });

  it('the reviews are deterministic and sorted, like every other verdict collection (NF-1)', () => {
    const runs = Array.from({ length: 10 }, () => evaluate(mnpiGraph(), policy));
    const first = JSON.stringify(runs[0]);
    for (const r of runs) expect(JSON.stringify(r)).toBe(first);

    const result = evaluate(mnpiGraph(), policy);
    if (!result.ok) return;
    expect(result.value.downstream_reviews).toEqual([...result.value.downstream_reviews].sort());
  });
});

// Round 4, user decision (2026-08-05): "Rejected can list the reason why and
// then give a path which may have downstream review for future reference."
//
// The pre-check says don't do this, so these are not obligations the submitter
// owes today. They are what the use case's characteristics WOULD require if it
// were re-scoped to come inside appetite — useful to whoever picks it up next,
// and dishonest only if presented as a current instruction.
describe('Downstream reviews survive a rejection, as a forward path (CS-3)', () => {
  it('a hard-line rejection still names the reviews its characteristics trigger', () => {
    // MNPI leaving Zone A to an external LLM: a hard line, rejected outright.
    const rejected = evaluate(
      graph({
        input_nodes: [{ id: 'i1', label: 'deal notes', data_class: 'MNPI', data_zone: 'Zone A' }],
        processing_nodes: [
          {
            id: 'p1',
            label: 'summariser',
            model_type: 'llm',
            autonomy_level: 4,
            data_zone: 'Zone B',
            vendor: 'external-llm-co',
            replaces_prior_model: false,
          },
        ],
        output_nodes: [
          {
            id: 'o1',
            label: 'summary',
            action_type: 'execute',
            exposure: 'client-facing',
            decision_bindingness: 'binding',
            output_reversibility: 'irreversible',
            scale: 'at_scale',
          },
        ],
        edges: [
          { from: 'i1', to: 'p1' },
          { from: 'p1', to: 'o1' },
        ],
      }),
      policy,
    );

    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.value.status).toBe('rejected');

    // The reason is already there — that is the binding constraint.
    expect(rejected.value.binding_constraint).toBeTruthy();

    // And the forward path: what this use case would still need.
    expect(rejected.value.downstream_reviews.length).toBeGreaterThan(0);
    expect(rejected.value.downstream_reviews.some((r) => /information security/i.test(r))).toBe(true);
    expect(rejected.value.downstream_reviews.some((r) => /vendor risk/i.test(r))).toBe(true);
  });

  it('still deterministic and sorted on the rejection path (NF-1)', () => {
    const g = graph({
      input_nodes: [{ id: 'i1', label: 'deal notes', data_class: 'MNPI', data_zone: 'Zone A' }],
      processing_nodes: [
        {
          id: 'p1',
          label: 'x',
          model_type: 'llm',
          autonomy_level: 4,
          data_zone: 'Zone B',
          vendor: 'external-llm-co',
          replaces_prior_model: false,
        },
      ],
      output_nodes: [
        {
          id: 'o1',
          label: 'y',
          action_type: 'execute',
          exposure: 'client-facing',
          decision_bindingness: 'binding',
          output_reversibility: 'irreversible',
          scale: 'at_scale',
        },
      ],
      edges: [
        { from: 'i1', to: 'p1' },
        { from: 'p1', to: 'o1' },
      ],
    });
    const runs = Array.from({ length: 10 }, () => evaluate(g, policy));
    const first = JSON.stringify(runs[0]);
    for (const r of runs) expect(JSON.stringify(r)).toBe(first);

    const one = evaluate(g, policy);
    if (!one.ok) return;
    expect(one.value.downstream_reviews).toEqual([...one.value.downstream_reviews].sort());
  });
});

// Round 4, found while verifying the forward path live. The guided form uses
// `__other__` as its sentinel for "not on the approved list"
// (StructuredForm.tsx:453,478). It was reaching the verdict verbatim:
//
//   "Full vendor/platform risk assessment required — __other__ is not on the
//    approved registry"
//
// An internal sentinel printed at a banker. Nothing asserted the prose, so
// nothing caught it.
describe('The unlisted-component sentinel never reaches the reader', () => {
  it('names an unlisted vendor in words, not as __other__', () => {
    const result = evaluate(
      graph({
        input_nodes: [{ id: 'i1', label: 'notes', data_class: 'Internal', data_zone: 'Zone C' }],
        processing_nodes: [
          {
            id: 'p1',
            label: 'x',
            model_type: 'ml',
            autonomy_level: 1,
            data_zone: 'Zone C',
            vendor: '__other__',
            replaces_prior_model: false,
          },
        ],
        output_nodes: [
          {
            id: 'o1',
            label: 'y',
            action_type: 'recommend',
            exposure: 'internal-only',
            decision_bindingness: 'advisory',
            output_reversibility: 'reversible',
            scale: 'limited',
          },
        ],
        edges: [
          { from: 'i1', to: 'p1' },
          { from: 'p1', to: 'o1' },
        ],
      }),
      policy,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const all = result.value.downstream_reviews.join(' ');
    expect(all).not.toContain('__other__');
    expect(all).toMatch(/not on the approved list/i);
  });
});
