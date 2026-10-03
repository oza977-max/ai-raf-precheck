import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPacks } from '../store/packs';
import { buildVerdictView } from './verdict-view-model';
import type { DataFlowGraph, JurisdictionPack, PolicyFile } from '../engine/types';
import type { Verdict } from '../types/verdict';
import type { Assumption } from './plain-copy';

// R16 chunk D1 (build/prompts/R16.md v2.1, §4.1/§4.2/§4.4). This is the ONE
// pure computation behind the verdict's first screen AND the four existing
// readers (WhatToDo, SignOffChecklist, the evidence panel, and this new
// first screen) — see test-cases/test-cases-020.md for the TC-R16-D1-NN
// mapping onto these tests.

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    status: 'approved_with_controls',
    tier: 'High',
    track: 'II',
    binding_constraint: 'INV-DATA-01',
    binding_path: 'client notes → drafting model → drafted email',
    controls: [],
    downstream_reviews: [],
    conditions: { hypotheses: [] },
    policy_version: '1.0',
    pack_versions: {},
    applied_overrides: [],
    confidence_caveats: [],
    provisional_reasons: [],
    boundary_proximity: false,
    margin_achieved: 0,
    margin_target: 0.1,
    single_covered_invariants: [],
    explanation: {
      tier_rationale: null,
      track_rationale: null,
      hard_lines_checked: 5,
      invariants_checked: 20,
      tripped_invariants: [],
      binding_reason: null,
      binding_regulatory_basis: null,
    },
    id: 'verdict-1',
    use_case_id: 'uc-1',
    living_status: 'approved',
    living_status_updated_at: '2026-01-01T00:00:00.000Z',
    attested_by: '1LoD',
    attested_at: '2026-01-01T00:00:00.000Z',
    graph_version: 1,
    corrections: [],
    ...overrides,
  } as Verdict;
}

function makePolicy(overrides: Partial<PolicyFile> = {}): PolicyFile {
  return {
    version: '1.0',
    policy_id: 'p',
    firm_name: 'f',
    translation_attestation: { attested_by: 'x', role: 'x', date: 'x', raf_version_checked: 'x' },
    hard_lines: [],
    tracks: [],
    tiers: [],
    invariants: [],
    controls: [],
    downstream_reviews: [],
    kri_thresholds: {},
    jurisdictions: [],
    roles: {},
    tier_workflow: { Critical: 'self-service', High: 'self-service', Medium: 'self-service', Low: 'self-service' },
    safety_margin: 0.1,
    ...overrides,
  } as PolicyFile;
}

function makeGraph(overrides: Partial<DataFlowGraph> = {}): DataFlowGraph {
  return {
    id: 'g1',
    version: 1,
    input_nodes: [],
    processing_nodes: [{ id: 'p1', label: 'Model', model_type: 'llm', autonomy_level: 1, data_zone: 'Zone B', vendor: 'internal', replaces_prior_model: false }],
    output_nodes: [{ id: 'o1', label: 'Out', action_type: 'draft', exposure: 'internal-only', decision_bindingness: 'advisory', output_reversibility: 'reversible', scale: 'limited' }],
    edges: [],
    jurisdictions: [],
    intake_method: 'structured_form',
    extracted_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as DataFlowGraph;
}

describe('buildVerdictView — TC-R16-D1-01: headline', () => {
  it('TC-R16-D1-01a: rejected verdict always headlines "No — not as described."', () => {
    const view = buildVerdictView(makeVerdict({ status: 'rejected', controls: [] }), undefined, undefined, undefined, undefined, undefined);
    expect(view.headline).toBe('No — not as described.');
    expect(view.isRejected).toBe(true);
  });

  it('TC-R16-D1-01b: sign-off needed, N=0 — drops the safeguards clause entirely', () => {
    const view = buildVerdictView(makeVerdict({ controls: [] }), undefined, undefined, undefined, undefined, 'pre_checked');
    expect(view.headline).toBe('Not yet. You can start once your AI risk team has signed it off.');
  });

  it('TC-R16-D1-01c: sign-off needed, N=1 — singular safeguard', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'C1', description: 'd', resolves: [], burden: 1, verification: 'v' }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, undefined, undefined, undefined, 'pre_checked');
    expect(view.headline).toBe('Not yet. You can start once your AI risk team has signed it off and 1 safeguard is in place.');
  });

  it('TC-R16-D1-01d: sign-off needed, N=2 — plural, "all N"', () => {
    const policy = makePolicy({
      controls: [
        { id: 'C1', name: 'C1', description: 'd', resolves: [], burden: 1, verification: 'v' },
        { id: 'C2', name: 'C2', description: 'd', resolves: [], burden: 1, verification: 'v' },
      ],
    });
    const view = buildVerdictView(makeVerdict({ controls: ['C1', 'C2'] }), policy, undefined, undefined, undefined, 'pre_checked');
    expect(view.headline).toBe('Not yet. You can start once your AI risk team has signed it off and all 2 safeguards are in place.');
  });

  // CR8-02 (deliberate change, code review 008): the self-service fixtures below now carry a policy
  // whose tier_workflow is self-service AND an explicit stage, because "you can start" is only said
  // for a case where self-service is DETERMINED (P4). The undetermined cases are TC-CR8-02b/-02c.
  it('TC-R16-D1-01e: self-service, N=0 — "Yes — you can start."', () => {
    const view = buildVerdictView(makeVerdict({ controls: [] }), makePolicy(), undefined, undefined, undefined, 'approved');
    expect(view.headline).toBe('Yes — you can start.');
  });

  it('TC-R16-D1-01f: self-service, N=1 — singular', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'C1', description: 'd', resolves: [], burden: 1, verification: 'v' }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, undefined, undefined, undefined, 'approved');
    expect(view.headline).toBe('Nearly. You can start once 1 safeguard is in place — no sign-off needed.');
  });

  it('TC-R16-D1-01g: self-service, N=2 — plural', () => {
    const policy = makePolicy({
      controls: [
        { id: 'C1', name: 'C1', description: 'd', resolves: [], burden: 1, verification: 'v' },
        { id: 'C2', name: 'C2', description: 'd', resolves: [], burden: 1, verification: 'v' },
      ],
    });
    const view = buildVerdictView(makeVerdict({ controls: ['C1', 'C2'] }), policy, undefined, undefined, undefined, 'approved');
    expect(view.headline).toBe('Nearly. You can start once 2 safeguards are in place — no sign-off needed.');
  });

  it('TC-R16-D1-01h: a VERIFIED or ATTESTED safeguard does not count toward N', () => {
    const policy = makePolicy({
      controls: [
        { id: 'C1', name: 'C1', description: 'd', resolves: [], burden: 1, verification: 'v', verification_evidence: { status: 'verified' } },
        { id: 'C2', name: 'C2', description: 'd', resolves: [], burden: 1, verification: 'v' },
      ],
    });
    const view = buildVerdictView(
      makeVerdict({ controls: ['C1', 'C2'] }),
      policy,
      undefined,
      undefined,
      { C2: { attested_by_name: 'Sam', evidence_note: 'note' } },
      'approved',
    );
    expect(view.headline).toBe('Yes — you can start.');
    expect(view.outstandingCount).toBe(0);
  });

  it('TC-R16-D1-01i: no stage passed at all makes no sign-off claim (needsSignOff false, cautious headline — CR8-02)', () => {
    const view = buildVerdictView(makeVerdict({ controls: [] }), undefined, undefined, undefined, undefined, undefined);
    expect(view.headline).toBe("We can't tell from this screen whether your AI risk team must sign this off — confirm with them before you start.");
    expect(view.needsSignOff).toBe(false);
  });
});

describe('buildVerdictView — TC-R16-D1-02: Why (plain reasons)', () => {
  it('TC-R16-D1-02a: empty when nothing tripped', () => {
    const view = buildVerdictView(makeVerdict(), undefined, undefined, undefined, undefined, undefined);
    expect(view.whyReasons).toEqual([]);
    expect(view.whyHasMore).toBe(false);
  });

  it('TC-R16-D1-02b: resolves plain_reason with placeholders, binding constraint first', () => {
    const policy = makePolicy({
      invariants: [
        { id: 'INV-A', description: 'formal A', condition: {}, required_controls: [], severity: 'Medium', plain_reason: 'it sends personal details about people to {destination}' },
        { id: 'INV-B', description: 'formal B', condition: {}, required_controls: [], severity: 'High', plain_reason: '{audience} deal with it directly' },
      ],
    });
    const graph = makeGraph({
      processing_nodes: [{ id: 'p1', label: 'M', model_type: 'llm', autonomy_level: 1, data_zone: 'Zone A', vendor: 'internal', replaces_prior_model: false }],
      output_nodes: [{ id: 'o1', label: 'O', action_type: 'inform', exposure: 'client-facing', decision_bindingness: 'advisory', output_reversibility: 'reversible', scale: 'limited' }],
    });
    const verdict = makeVerdict({
      binding_constraint: 'INV-B',
      explanation: {
        tier_rationale: null, track_rationale: null, hard_lines_checked: 5, invariants_checked: 20,
        tripped_invariants: [
          { id: 'INV-A', description: 'formal A', severity: 'Medium', required_controls: [], graph_path: 'x' },
          { id: 'INV-B', description: 'formal B', severity: 'High', required_controls: [], graph_path: 'x' },
        ],
        binding_reason: null, binding_regulatory_basis: null,
      },
    });
    const view = buildVerdictView(verdict, policy, graph, undefined, undefined, undefined);
    expect(view.whyReasons[0]).toBe('clients deal with it directly');
    expect(view.whyReasons[1]).toBe('it sends personal details about people to an outside website or service');
    expect(view.whyHasMore).toBe(false);
  });

  it('TC-R16-D1-02c: caps at two distinct reasons and flags "more"', () => {
    const policy = makePolicy({
      invariants: [
        { id: 'INV-A', description: 'a', condition: {}, required_controls: [], severity: 'Low', plain_reason: 'reason A' },
        { id: 'INV-B', description: 'b', condition: {}, required_controls: [], severity: 'Low', plain_reason: 'reason B' },
        { id: 'INV-C', description: 'c', condition: {}, required_controls: [], severity: 'Low', plain_reason: 'reason C' },
      ],
    });
    const verdict = makeVerdict({
      binding_constraint: 'INV-A',
      explanation: {
        tier_rationale: null, track_rationale: null, hard_lines_checked: 5, invariants_checked: 20,
        tripped_invariants: [
          { id: 'INV-A', description: 'a', severity: 'Low', required_controls: [], graph_path: 'x' },
          { id: 'INV-B', description: 'b', severity: 'Low', required_controls: [], graph_path: 'x' },
          { id: 'INV-C', description: 'c', severity: 'Low', required_controls: [], graph_path: 'x' },
        ],
        binding_reason: null, binding_regulatory_basis: null,
      },
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.whyReasons).toEqual(['reason A', 'reason B']);
    expect(view.whyHasMore).toBe(true);
  });

  it('TC-R16-D1-02d: distinct reasons are deduplicated by resolved text', () => {
    const policy = makePolicy({
      invariants: [
        { id: 'INV-A', description: 'a', condition: {}, required_controls: [], severity: 'Low', plain_reason: 'same reason' },
        { id: 'INV-B', description: 'b', condition: {}, required_controls: [], severity: 'Low', plain_reason: 'same reason' },
      ],
    });
    const verdict = makeVerdict({
      explanation: {
        tier_rationale: null, track_rationale: null, hard_lines_checked: 5, invariants_checked: 20,
        tripped_invariants: [
          { id: 'INV-A', description: 'a', severity: 'Low', required_controls: [], graph_path: 'x' },
          { id: 'INV-B', description: 'b', severity: 'Low', required_controls: [], graph_path: 'x' },
        ],
        binding_reason: null, binding_regulatory_basis: null,
      },
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.whyReasons).toEqual(['same reason']);
    expect(view.whyHasMore).toBe(false);
  });

  it('TC-R16-D1-02e: falls back to the formal description + pointer line when plain_reason is absent (§4.4)', () => {
    const policy = makePolicy({ invariants: [{ id: 'INV-A', description: 'formal description', condition: {}, required_controls: [], severity: 'Low' }] });
    const verdict = makeVerdict({
      binding_constraint: 'INV-A',
      explanation: {
        tier_rationale: null, track_rationale: null, hard_lines_checked: 5, invariants_checked: 20,
        tripped_invariants: [{ id: 'INV-A', description: 'formal description', severity: 'Low', required_controls: [], graph_path: 'x' }],
        binding_reason: null, binding_regulatory_basis: null,
      },
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.whyReasons[0]).toBe('formal description. Ask your AI risk team what this means for you.');
  });

  it('TC-R16-D1-02f: falls back the same way with no policy loaded at all', () => {
    const verdict = makeVerdict({
      explanation: {
        tier_rationale: null, track_rationale: null, hard_lines_checked: 5, invariants_checked: 20,
        tripped_invariants: [{ id: 'INV-A', description: 'captured description', severity: 'Low', required_controls: [], graph_path: 'x' }],
        binding_reason: null, binding_regulatory_basis: null,
      },
    });
    const view = buildVerdictView(verdict, undefined, undefined, undefined, undefined, undefined);
    expect(view.whyReasons[0]).toBe('captured description. Ask your AI risk team what this means for you.');
  });
});

describe('buildVerdictView — TC-R16-D1-03: safeguard status (one computation, four readers)', () => {
  it('TC-R16-D1-03a: verified beats attested — machine evidence wins', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', verification_evidence: { status: 'verified' } }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, undefined, undefined, { C1: { attested_by_name: 'Sam', evidence_note: 'n' } }, undefined);
    expect(view.safeguards[0]!.status).toBe('verified');
  });

  it('TC-R16-D1-03b: attested when not machine-verified but a reviewer attested it', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v' }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, undefined, undefined, { C1: { attested_by_name: 'Sam', evidence_note: 'a note' } }, undefined);
    expect(view.safeguards[0]!.status).toBe('attested');
    expect(view.safeguards[0]!.attestedByName).toBe('Sam');
    expect(view.safeguards[0]!.evidenceNote).toBe('a note');
  });

  it('TC-R16-D1-03c: outstanding when policy is loaded, control exists, neither verified nor attested', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v' }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.status).toBe('outstanding');
  });

  it('TC-R16-D1-03d: unknown when no policy is loaded and no attestation exists', () => {
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), undefined, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.status).toBe('unknown');
  });

  it('TC-R16-D1-03e: attested (not unknown) with no policy loaded, when an attestation exists', () => {
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), undefined, undefined, undefined, { C1: { attested_by_name: 'Robin', evidence_note: 'x' } }, undefined);
    expect(view.safeguards[0]!.status).toBe('attested');
  });

  it('TC-R16-D1-03f: outstandingSafeguards/inPlaceSafeguards/attestedSafeguards partition safeguards correctly', () => {
    const policy = makePolicy({
      controls: [
        { id: 'C1', name: 'n1', description: 'd', resolves: [], burden: 1, verification: 'v', verification_evidence: { status: 'verified' } },
        { id: 'C2', name: 'n2', description: 'd', resolves: [], burden: 1, verification: 'v' },
        { id: 'C3', name: 'n3', description: 'd', resolves: [], burden: 1, verification: 'v' },
      ],
    });
    const view = buildVerdictView(
      makeVerdict({ controls: ['C1', 'C2', 'C3'] }),
      policy,
      undefined,
      undefined,
      { C2: { attested_by_name: 'Robin', evidence_note: 'x' } },
      undefined,
    );
    expect(view.inPlaceSafeguards.map((s) => s.id)).toEqual(['C1']);
    expect(view.attestedSafeguards.map((s) => s.id)).toEqual(['C2']);
    expect(view.outstandingSafeguards.map((s) => s.id)).toEqual(['C3']);
    expect(view.outstandingCount).toBe(1);
  });
});

describe('buildVerdictView — TC-R16-D1-04: plain action fallback chain (§4.4) — never a bare code', () => {
  it('TC-R16-D1-04a: uses plain_action when present', () => {
    const policy = makePolicy({ controls: [{ id: 'CTRL-X', name: 'formal name', description: 'formal description', resolves: [], burden: 1, verification: 'v', plain_action: 'Plain text for the submitter.' }] });
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-X'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.plainAction).toBe('Plain text for the submitter.');
  });

  it('TC-R16-D1-04b: falls back to formal name + description + pointer when plain_action is absent', () => {
    const policy = makePolicy({ controls: [{ id: 'CTRL-X', name: 'formal name', description: 'formal description', resolves: [], burden: 1, verification: 'v' }] });
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-X'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.plainAction).toContain('formal name');
    expect(view.safeguards[0]!.plainAction).toContain('formal description');
    expect(view.safeguards[0]!.plainAction).toContain('Ask your AI risk team what this means for you.');
  });

  it('TC-R16-D1-04c: a control id absent from the loaded policy renders "Safeguard {n}" — never the bare code', () => {
    const policy = makePolicy({ controls: [] });
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-UNKNOWN'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.plainAction).toContain('Safeguard 1');
    expect(view.safeguards[0]!.plainAction).not.toContain('CTRL-UNKNOWN');
    expect(view.safeguards[0]!.plainAction).toContain('Ask your AI risk team what this involves.');
  });

  it('TC-R16-D1-04d: with no policy loaded at all, every safeguard renders "Safeguard {n}" by position — never the bare code', () => {
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-A', 'CTRL-B'] }), undefined, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.plainAction).toContain('Safeguard 1');
    expect(view.safeguards[1]!.plainAction).toContain('Safeguard 2');
    expect(view.safeguards.map((s) => s.plainAction).join(' ')).not.toContain('CTRL-A');
    expect(view.safeguards.map((s) => s.plainAction).join(' ')).not.toContain('CTRL-B');
  });

  it('TC-R16-D1-04e: numbering is by overall position, not by position among only the unresolved ones', () => {
    const policy = makePolicy({ controls: [{ id: 'CTRL-KNOWN', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_action: 'known action' }] });
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-KNOWN', 'CTRL-UNKNOWN'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[1]!.plainAction).toContain('Safeguard 2');
  });
});

describe('buildVerdictView — TC-R16-D1-05: owner tokens (§1.2)', () => {
  it('TC-R16-D1-05a: @submitter resolves to the submitter/manager text, marked yours', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@submitter' }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.ownerText).toBe('you or your manager (as the person responsible for this use)');
    expect(view.safeguards[0]!.yours).toBe(true);
  });

  it('TC-R16-D1-05b: @model_owner with a non-internal vendor on the processing node — "bought", marked yours', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@model_owner' }] });
    const graph = makeGraph({ processing_nodes: [{ id: 'p1', label: 'M', model_type: 'llm', autonomy_level: 1, data_zone: 'Zone B', vendor: 'VENDOR-APPROVED-LLM', replaces_prior_model: false }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, graph, undefined, undefined, undefined);
    expect(view.safeguards[0]!.ownerText).toBe('you or your manager (as the person responsible for this use), working with the supplier');
    expect(view.safeguards[0]!.yours).toBe(true);
  });

  it('TC-R16-D1-05c: @model_owner with vendor "internal" — "built", not marked yours', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@model_owner' }] });
    const graph = makeGraph({ processing_nodes: [{ id: 'p1', label: 'M', model_type: 'llm', autonomy_level: 1, data_zone: 'Zone B', vendor: 'internal', replaces_prior_model: false }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, graph, undefined, undefined, undefined);
    expect(view.safeguards[0]!.ownerText).toBe('the team that built the model');
    expect(view.safeguards[0]!.yours).toBe(false);
  });

  it('TC-R16-D1-05d: @model_owner with no graph at all (a case reopened from the register) — neither bought nor built is claimed, not yours', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@model_owner' }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.ownerText).toBe('the team responsible for the model');
    expect(view.safeguards[0]!.yours).toBe(false);
  });

  it('TC-R16-D1-05e: free-text plain_owner renders verbatim, not marked yours', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: 'your IT team (or whoever sets the tool up)' }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.ownerText).toBe('your IT team (or whoever sets the tool up)');
    expect(view.safeguards[0]!.yours).toBe(false);
  });

  it('TC-R16-D1-05f: plain_owner_with appends ", with {x}" after a plain free-text or @submitter owner', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@submitter', plain_owner_with: 'your AI risk team' }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.ownerText).toBe('you or your manager (as the person responsible for this use), with your AI risk team');
  });

  it('TC-R16-D1-05g: plain_owner_with appends " and {x}" after the @model_owner "working with the supplier" branch', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@model_owner', plain_owner_with: 'your AI risk team' }] });
    const graph = makeGraph({ processing_nodes: [{ id: 'p1', label: 'M', model_type: 'llm', autonomy_level: 1, data_zone: 'Zone B', vendor: 'VENDOR-X', replaces_prior_model: false }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, graph, undefined, undefined, undefined);
    expect(view.safeguards[0]!.ownerText).toBe(
      'you or your manager (as the person responsible for this use), working with the supplier and your AI risk team',
    );
  });

  it('TC-R16-D1-05h: a register-assigned owner overrides the default, with no "not verified" wording, and is not marked yours', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@submitter' }] });
    const view = buildVerdictView(
      makeVerdict({ controls: ['C1'] }),
      policy,
      undefined,
      { C1: { owner_name: 'Priya Nair', target_date: '2026-11-01' } },
      undefined,
      undefined,
    );
    expect(view.safeguards[0]!.ownerText).toBe("Priya Nair (assigned on your firm's register), due 2026-11-01");
    expect(view.safeguards[0]!.ownerText).not.toMatch(/not verified/i);
    expect(view.safeguards[0]!.yours).toBe(false);
  });

  it('TC-R16-D1-05i: no owner text at all when the control cannot be resolved (no policy) — the "Who" line is omittable', () => {
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-UNKNOWN'] }), undefined, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.ownerText).toBe('');
    expect(view.safeguards[0]!.yours).toBe(false);
  });
});

describe('buildVerdictView — TC-R16-D1-06: outstanding safeguards are yours-first ordered', () => {
  it('TC-R16-D1-06a: yours-owned outstanding safeguards sort before not-yours ones, each group keeping its relative order', () => {
    const policy = makePolicy({
      controls: [
        { id: 'C1', name: 'n1', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: 'your IT team' },
        { id: 'C2', name: 'n2', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@submitter' },
        { id: 'C3', name: 'n3', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: 'your IT team' },
        { id: 'C4', name: 'n4', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@submitter' },
      ],
    });
    const view = buildVerdictView(makeVerdict({ controls: ['C1', 'C2', 'C3', 'C4'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.outstandingSafeguards.map((s) => s.id)).toEqual(['C2', 'C4', 'C1', 'C3']);
  });

  it('TC-R16-D1-06b: already-in-place or attested safeguards are excluded from outstandingSafeguards regardless of ownership', () => {
    const policy = makePolicy({
      controls: [
        { id: 'C1', name: 'n1', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@submitter', verification_evidence: { status: 'verified' } },
        { id: 'C2', name: 'n2', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@submitter' },
      ],
    });
    const view = buildVerdictView(makeVerdict({ controls: ['C1', 'C2'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.outstandingSafeguards.map((s) => s.id)).toEqual(['C2']);
  });
});

describe('buildVerdictView — TC-R16-D1-07: covered vs. owed reviews (covers_reviews, per-instance sources)', () => {
  it('TC-R16-D1-07a: a review whose base id is in a safeguard\'s covers_reviews is attached to that safeguard, not owed', () => {
    const policy = makePolicy({
      controls: [{ id: 'CTRL-INDEP-VAL-01', name: 'Independent validation', description: 'd', resolves: [], burden: 1, verification: 'v', covers_reviews: ['SS1-UK-REV-01'] }],
    });
    const verdict = makeVerdict({
      controls: ['CTRL-INDEP-VAL-01'],
      downstream_reviews: ['an independent check of the model by your firm\'s model validation team'],
      downstream_review_sources: [{ review: 'Independent model validation (2LoD)', rule_id: 'SS1-UK-REV-01' }],
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.coveredReviews).toHaveLength(1);
    expect(view.owedReviews).toHaveLength(0);
  });

  it('TC-R16-D1-07b: a review not covered by any safeguard on this verdict is owed, with its plain name and owner resolved from the firm\'s downstream_reviews rule', () => {
    const policy = makePolicy({
      controls: [],
      downstream_reviews: [{ id: 'DR-VENDOR-01', review: 'Vendor risk assessment', condition: {}, plain_name: 'the supplier is assessed', plain_owner: 'your vendor-risk team' }],
    });
    const verdict = makeVerdict({
      controls: [],
      downstream_reviews: ['Vendor risk assessment'],
      downstream_review_sources: [{ review: 'Vendor risk assessment', rule_id: 'DR-VENDOR-01' }],
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.owedReviews).toEqual([{ plainName: 'the supplier is assessed', ownerText: 'your vendor-risk team', baseId: 'DR-VENDOR-01' }]);
  });

  it('TC-R16-D1-07c: two firm review instances sharing the same plain name de-duplicate to one owed entry (D-04)', () => {
    const policy = makePolicy({
      controls: [],
      downstream_reviews: [
        { id: 'DR-INFOSEC-01', review: 'Information security review', condition: {}, plain_name: 'an information-security review', plain_owner: 'your information-security team' },
        { id: 'DR-INFOSEC-02', review: 'Information security review', condition: {}, plain_name: 'an information-security review', plain_owner: 'your information-security team' },
      ],
    });
    const verdict = makeVerdict({
      controls: [],
      downstream_reviews: ['Information security review'],
      downstream_review_sources: [
        { review: 'Information security review', rule_id: 'DR-INFOSEC-01' },
        { review: 'Information security review', rule_id: 'DR-INFOSEC-02' },
      ],
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.owedReviews).toHaveLength(1);
    expect(view.owedReviews[0]!.plainName).toBe('an information-security review');
  });

  it('TC-R16-D1-07d: PV-UNREGISTERED sentinel resolves to its fixed product copy (R16-W W-6: reworded to a noun phrase, D-76), with the component name stripped from the base id', () => {
    const verdict = makeVerdict({
      controls: [],
      downstream_reviews: ['Unapproved component: Zapier'],
      downstream_review_sources: [{ review: 'Unapproved component: Zapier', rule_id: 'PV-UNREGISTERED:Zapier' }],
    });
    const view = buildVerdictView(verdict, undefined, undefined, undefined, undefined, undefined);
    expect(view.owedReviews[0]!.plainName).toBe("adding the supplier to your firm's list");
    expect(view.owedReviews[0]!.ownerText).toBe('your vendor-risk team');
  });

  it('TC-R16-D1-07e: MODEL-REGISTRY sentinel resolves to its fixed product copy (R16-W W-6: reworded to a noun phrase, D-76)', () => {
    const verdict = makeVerdict({
      controls: [],
      downstream_reviews: ['Unlisted model: gpt-5'],
      downstream_review_sources: [{ review: 'Unlisted model: gpt-5', rule_id: 'MODEL-REGISTRY:gpt-5' }],
    });
    const view = buildVerdictView(verdict, undefined, undefined, undefined, undefined, undefined);
    expect(view.owedReviews[0]!.plainName).toBe("adding the model to your firm's list of known models");
    expect(view.owedReviews[0]!.ownerText).toBe('your AI risk team');
  });

  it('TC-R16-D1-07f: a pack-rule-sourced review with no pack data available falls back to the generic pack-review line (§4.4); with the real pack loaded it uses the rule\'s own words (CR6-13)', () => {
    const verdict = makeVerdict({
      controls: [],
      downstream_reviews: ['Independent model validation (2LoD)'],
      downstream_review_sources: [{ review: 'Independent model validation (2LoD)', rule_id: 'SS1-UK-REV-01' }],
    });
    // No packs passed (a caller that cannot supply them): the generic line.
    const view = buildVerdictView(verdict, undefined, undefined, undefined, undefined, undefined);
    expect(view.owedReviews[0]!.plainName).toBe('a regulatory review required for this kind of use — ask your AI risk team which');
    // CR6-13: the REAL pack file (BC-003), not a hand-made fixture.
    const yaml = readFileSync(resolve(__dirname, '../../policy/packs/ss1-23.yaml'), 'utf-8');
    const { packs } = loadPacks({ 'policy/packs/ss1-23.yaml': yaml });
    const withPacks = buildVerdictView(verdict, undefined, undefined, undefined, undefined, undefined, { packs });
    expect(withPacks.owedReviews[0]!.plainName).toBe("an independent check of the model by your firm's model validation team");
    expect(withPacks.owedReviews[0]!.ownerText).toBe("your firm's model validation team");
  });

  it('TC-CR6-13b: two packs sharing a rule id with different review text — the rule whose review matches the verdict source is the one used', () => {
    const mk = (pack_id: string, review: string, plain_name: string, plain_owner: string) =>
      ({
        pack_id, version: '1', jurisdiction: 'XX', regulator: 'r', document: 'd', effective_date: '2026-01-01',
        reviewer_name: 'n', reviewer_role: 'r', sign_off_date: '2026-01-01',
        rules: [{ id: 'SHARED-REV-01', effect: { type: 'required_review', review, plain_name, plain_owner } }],
      }) as unknown as JurisdictionPack;
    const packs = [mk('A-PACK', 'Review Alpha', 'alpha words', 'alpha team'), mk('B-PACK', 'Review Beta', 'beta words', 'beta team')];
    const verdict = makeVerdict({
      controls: [],
      downstream_reviews: ['Review Beta'],
      downstream_review_sources: [{ review: 'Review Beta', rule_id: 'SHARED-REV-01' }],
    });
    const view = buildVerdictView(verdict, undefined, undefined, undefined, undefined, undefined, { packs });
    expect(view.owedReviews[0]!.plainName).toBe('beta words');
    expect(view.owedReviews[0]!.ownerText).toBe('beta team');
  });

  it('TC-R16-D1-07g: a firm review without plain_name falls back to its formal name + pointer (§4.4)', () => {
    const policy = makePolicy({
      downstream_reviews: [{ id: 'DR-X', review: 'Formal review name', condition: {} }],
    });
    const verdict = makeVerdict({
      controls: [],
      downstream_reviews: ['Formal review name'],
      downstream_review_sources: [{ review: 'Formal review name', rule_id: 'DR-X' }],
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.owedReviews[0]!.plainName).toBe('Formal review name Ask your AI risk team what this means for you.');
  });

  it('TC-R16-D1-07i: coveredReviewFormalNames (WhatToDo\'s own filter, formal vocabulary) names a fully-covered formal review once', () => {
    const policy = makePolicy({
      controls: [{ id: 'CTRL-INDEP-VAL-01', name: 'Independent validation', description: 'd', resolves: [], burden: 1, verification: 'v', covers_reviews: ['SS1-UK-REV-01'] }],
    });
    const verdict = makeVerdict({
      controls: ['CTRL-INDEP-VAL-01'],
      downstream_reviews: ['Independent model validation (2LoD)'],
      downstream_review_sources: [{ review: 'Independent model validation (2LoD)', rule_id: 'SS1-UK-REV-01' }],
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.coveredReviewFormalNames).toEqual(['Independent model validation (2LoD)']);
  });

  it('TC-R16-D1-07j: a formal name shared by a covered AND an uncovered instance is NOT fully covered', () => {
    const policy = makePolicy({
      controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', covers_reviews: ['DR-INFOSEC-01'] }],
    });
    const verdict = makeVerdict({
      controls: ['C1'],
      downstream_reviews: ['Information security review'],
      downstream_review_sources: [
        { review: 'Information security review', rule_id: 'DR-INFOSEC-01' },
        { review: 'Information security review', rule_id: 'DR-INFOSEC-02' },
      ],
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.coveredReviewFormalNames).toEqual([]);
  });

  it('TC-R16-D1-07h: an older verdict with no downstream_review_sources at all lists every review separately — nothing folded away', () => {
    const policy = makePolicy({
      controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', covers_reviews: ['DR-VENDOR-01'] }],
    });
    const verdict = makeVerdict({
      controls: ['C1'],
      downstream_reviews: ['Vendor risk assessment', 'Information security review'],
      downstream_review_sources: undefined,
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.owedReviews).toHaveLength(2);
    expect(view.safeguards[0]!.coveredReviews).toHaveLength(0);
    expect(view.coveredReviewFormalNames).toEqual([]);
  });
});

describe('buildVerdictView — R16-W W-6: one "also completes" note per safeguard (D-76)', () => {
  it('TC-R16-W-39: a safeguard covering one review joins with no "and"', () => {
    const policy = makePolicy({
      controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', covers_reviews: ['DR-VENDOR-01'] }],
      downstream_reviews: [{ id: 'DR-VENDOR-01', review: 'Vendor risk assessment', condition: {}, plain_name: 'a supplier assessment', plain_owner: 'your vendor-risk team' }],
    });
    const verdict = makeVerdict({
      controls: ['C1'],
      downstream_reviews: ['Vendor risk assessment'],
      downstream_review_sources: [{ review: 'Vendor risk assessment', rule_id: 'DR-VENDOR-01' }],
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.alsoCompletesNote).toBe('(Doing this also completes a supplier assessment — one piece of work.)');
  });

  it('TC-R16-W-40: a safeguard covering two reviews prints ONE note with "a and b" — never two notes', () => {
    const policy = makePolicy({
      controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', covers_reviews: ['DR-VENDOR-01', 'PV-UNREGISTERED'] }],
      downstream_reviews: [{ id: 'DR-VENDOR-01', review: 'Vendor risk assessment', condition: {}, plain_name: 'a supplier assessment', plain_owner: 'your vendor-risk team' }],
    });
    const verdict = makeVerdict({
      controls: ['C1'],
      downstream_reviews: ['Vendor risk assessment', 'Unapproved component: Zapier'],
      downstream_review_sources: [
        { review: 'Vendor risk assessment', rule_id: 'DR-VENDOR-01' },
        { review: 'Unapproved component: Zapier', rule_id: 'PV-UNREGISTERED:Zapier' },
      ],
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.alsoCompletesNote).toBe(
      "(Doing this also completes a supplier assessment and adding the supplier to your firm's list — one piece of work.)",
    );
  });

  it('TC-R16-W-41: three covered reviews join "a, b and c"', () => {
    const policy = makePolicy({
      controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', covers_reviews: ['DR-A', 'DR-B', 'DR-C'] }],
      downstream_reviews: [
        { id: 'DR-A', review: 'Review A', condition: {}, plain_name: 'review A', plain_owner: 'team' },
        { id: 'DR-B', review: 'Review B', condition: {}, plain_name: 'review B', plain_owner: 'team' },
        { id: 'DR-C', review: 'Review C', condition: {}, plain_name: 'review C', plain_owner: 'team' },
      ],
    });
    const verdict = makeVerdict({
      controls: ['C1'],
      downstream_reviews: ['Review A', 'Review B', 'Review C'],
      downstream_review_sources: [
        { review: 'Review A', rule_id: 'DR-A' },
        { review: 'Review B', rule_id: 'DR-B' },
        { review: 'Review C', rule_id: 'DR-C' },
      ],
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.alsoCompletesNote).toBe('(Doing this also completes review A, review B and review C — one piece of work.)');
  });

  it('TC-R16-W-42: a safeguard covering nothing has no alsoCompletesNote', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v' }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.alsoCompletesNote).toBeUndefined();
  });
});

describe('buildVerdictView — R16-W W-7: evidence scoped to the platforms/vendors it covers (D-77)', () => {
  function policyWithScopedEvidence(appliesTo: { platforms?: string[]; vendors?: string[] }) {
    return makePolicy({
      controls: [
        {
          id: 'CTRL-ENC-01',
          name: 'Encryption in transit',
          description: 'd',
          resolves: [],
          burden: 1,
          verification: 'v',
          verification_evidence: { status: 'verified', detail: 'Platform allow-list pins TLS 1.3', applies_to: appliesTo },
        },
      ],
      platforms: [{ id: 'PLAT-X', name: 'raw', approved_envelope: {}, satisfies_controls: [], plain_name: 'Firm Platform' }],
      vendors: [{ id: 'VENDOR-X', name: 'raw', approved_envelope: {}, satisfies_controls: [], plain_name: 'Firm Vendor' }],
    });
  }

  it('TC-R16-W-43: applies_to absent (unscoped) — verified everywhere, exactly the pre-W-7 behaviour', () => {
    const policy = makePolicy({ controls: [{ id: 'CTRL-ENC-01', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', verification_evidence: { status: 'verified' } }] });
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-ENC-01'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.status).toBe('verified');
    expect(view.safeguards[0]!.evidenceScopeNote).toBeUndefined();
  });

  it('TC-R16-W-44: applies_to present, graph’s platform is in scope — still verified', () => {
    const policy = policyWithScopedEvidence({ platforms: ['PLAT-X'] });
    const graph = { ...makeGraph(), processing_nodes: [{ ...makeGraph().processing_nodes[0]!, platform: 'PLAT-X', vendor: 'internal' }] };
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-ENC-01'] }), policy, graph, undefined, undefined, undefined);
    expect(view.safeguards[0]!.status).toBe('verified');
    expect(view.safeguards[0]!.evidenceScopeNote).toBeUndefined();
  });

  it('TC-R16-W-45: applies_to present, graph’s vendor is in scope — still verified', () => {
    const policy = policyWithScopedEvidence({ vendors: ['VENDOR-X'] });
    const graph = { ...makeGraph(), processing_nodes: [{ ...makeGraph().processing_nodes[0]!, vendor: 'VENDOR-X' }] };
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-ENC-01'] }), policy, graph, undefined, undefined, undefined);
    expect(view.safeguards[0]!.status).toBe('verified');
  });

  it('TC-R16-W-46: applies_to present, graph is OUTSIDE scope — outstanding (counted in the headline’s N), with a "not for this tool" evidence note naming the scoped platforms/vendors by plain name', () => {
    const policy = policyWithScopedEvidence({ platforms: ['PLAT-X'], vendors: ['VENDOR-X'] });
    const graph = { ...makeGraph(), processing_nodes: [{ ...makeGraph().processing_nodes[0]!, vendor: 'an AI service you weren’t sure about' }] };
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-ENC-01'] }), policy, graph, undefined, undefined, 'approved');
    expect(view.safeguards[0]!.status).toBe('outstanding');
    expect(view.outstandingCount).toBe(1);
    expect(view.safeguards[0]!.evidenceScopeNote).toBe(
      "Your firm's records show this for Firm Platform and Firm Vendor — not for this tool.",
    );
  });

  it('TC-R16-W-47: applies_to present, no graph available (reopened from the register) — outstanding, with a "couldn’t check" evidence note', () => {
    const policy = policyWithScopedEvidence({ platforms: ['PLAT-X'] });
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-ENC-01'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.status).toBe('outstanding');
    expect(view.safeguards[0]!.evidenceScopeNote).toBe(
      "Your firm's records show this for Firm Platform — we couldn't check whether that includes this tool.",
    );
  });

  it('TC-R16-W-48: out-of-scope evidence with an attestation on file still reads attested, not outstanding, and carries no scope note (attested beats outstanding)', () => {
    const policy = policyWithScopedEvidence({ platforms: ['PLAT-X'] });
    const graph = { ...makeGraph(), processing_nodes: [{ ...makeGraph().processing_nodes[0]!, vendor: 'unregistered' }] };
    const view = buildVerdictView(
      makeVerdict({ controls: ['CTRL-ENC-01'] }),
      policy,
      graph,
      undefined,
      { 'CTRL-ENC-01': { attested_by_name: 'Sam', evidence_note: 'checked manually' } },
      undefined,
    );
    expect(view.safeguards[0]!.status).toBe('attested');
  });
});

describe('buildVerdictView — TC-R16-D1-08: next steps (combinations and omission)', () => {
  it('TC-R16-D1-08a: self-service, nothing outstanding, nothing owed — only the "Then"-less finish line', () => {
    const view = buildVerdictView(makeVerdict({ controls: [] }), undefined, undefined, undefined, undefined, 'approved');
    expect(view.nextSteps).toEqual(["You can start. It's saved on your firm's register of AI uses, which your AI risk team can see."]);
  });

  it('TC-R16-D1-08b: self-service with outstanding safeguards keeps "Then" because a preceding step rendered', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@submitter' }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, undefined, undefined, undefined, 'approved');
    expect(view.nextSteps.at(-1)).toBe("Then you can start. It's saved on your firm's register of AI uses, which your AI risk team can see.");
  });

  it('TC-R16-D1-08c: sign-off with no outstanding safeguards — "Start once it\'s signed off."', () => {
    const view = buildVerdictView(makeVerdict({ controls: [] }), undefined, undefined, undefined, undefined, 'pre_checked');
    expect(view.nextSteps).toContain("Start once it's signed off.");
  });

  it('TC-R16-D1-08d: sign-off AND outstanding safeguards — the "both" finish line, plus the "not sure who" trailer', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@submitter' }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, undefined, undefined, undefined, 'pre_checked');
    expect(view.nextSteps).toContain("Start only when both are done: it's signed off, and every safeguard below is in place.");
    expect(view.nextSteps.at(-1)).toBe('Not sure who these teams are? Ask your AI risk team when you send them this result.');
  });

  it('TC-R16-D1-08e: all outstanding safeguards are "yours" — singular wording for exactly one', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@submitter' }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.nextSteps).toContain("Put the safeguard below in place — it's yours to arrange (you or your manager).");
  });

  it('TC-R16-D1-08f: all outstanding safeguards are "yours" — plural wording for more than one', () => {
    const policy = makePolicy({
      controls: [
        { id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@submitter' },
        { id: 'C2', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@submitter' },
      ],
    });
    const view = buildVerdictView(makeVerdict({ controls: ['C1', 'C2'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.nextSteps).toContain("Put the safeguards below in place — they're yours to arrange (you or your manager).");
  });

  it('TC-R16-D1-08g: a mix of yours/not-yours outstanding safeguards names the count', () => {
    const policy = makePolicy({
      controls: [
        { id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@submitter' },
        { id: 'C2', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: 'your IT team' },
      ],
    });
    const view = buildVerdictView(makeVerdict({ controls: ['C1', 'C2'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.nextSteps.some((s) => s.includes('1 of them is yours to arrange') && s.includes('marked "yours"'))).toBe(true);
  });

  it('TC-R16-D1-08h: none of the outstanding safeguards is "yours"', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: 'your IT team' }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.nextSteps.some((s) => s.includes('None of them is yours to do yourself'))).toBe(true);
  });

  it('TC-R16-D1-08i: owed reviews produce the "also send this result to" step naming the owning teams', () => {
    const policy = makePolicy({ downstream_reviews: [{ id: 'DR-VENDOR-01', review: 'Vendor risk assessment', condition: {}, plain_name: 'the supplier is assessed', plain_owner: 'your vendor-risk team' }] });
    const verdict = makeVerdict({ controls: [], downstream_reviews: ['Vendor risk assessment'], downstream_review_sources: [{ review: 'Vendor risk assessment', rule_id: 'DR-VENDOR-01' }] });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.nextSteps.some((s) => s.includes('Also send this result to your vendor-risk team'))).toBe(true);
  });

  it('TC-R16-D1-08j: no_regulatory_basis adds the "tell us which countries" step', () => {
    const view = buildVerdictView(makeVerdict({ controls: [], provisional_reasons: ['no_regulatory_basis'] }), undefined, undefined, undefined, undefined, undefined);
    expect(view.nextSteps).toContain('Tell us which countries it involves, then check again — the answer may change.');
  });

  it('TC-R16-D1-08k: a safeguard partnering with "your AI risk team" adds the sign-off clarification once', () => {
    const policy = makePolicy({ controls: [{ id: 'C1', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', plain_owner: '@submitter', plain_owner_with: 'your AI risk team' }] });
    const view = buildVerdictView(makeVerdict({ controls: ['C1'] }), policy, undefined, undefined, undefined, 'pre_checked');
    const occurrences = view.nextSteps.filter((s) => s.includes('Your AI risk team can help you set this up')).length;
    expect(occurrences).toBe(1);
  });

  it('TC-R16-D1-08l: no safeguard, no owed review, no sign-off, no provisional reason — next steps is just the finish line', () => {
    const view = buildVerdictView(makeVerdict({ controls: [], downstream_reviews: [] }), makePolicy(), undefined, undefined, undefined, undefined);
    expect(view.nextSteps).toHaveLength(1);
  });
});

describe('buildVerdictView — TC-R16-D1-09: who signs off', () => {
  it('TC-R16-D1-09a: names the AI risk team when sign-off is needed', () => {
    const view = buildVerdictView(makeVerdict({ controls: [] }), undefined, undefined, undefined, undefined, 'pre_checked');
    expect(view.whoSignsOff).toBe("your AI risk team. Until they do, this result isn't final.");
  });

  it('TC-R16-D1-09b: names nobody for self-service', () => {
    // CR8-02 (deliberate change): re-fixtured with a self-service policy — with no policy it is undetermined.
    const view = buildVerdictView(makeVerdict({ controls: [] }), makePolicy(), undefined, undefined, undefined, 'approved');
    expect(view.whoSignsOff).toBe("nobody — it's low-stakes enough for you to go ahead once the safeguard is in place.");
  });
});

describe('buildVerdictView — TC-R16-D1-10: could still change (isVerdictProvisional gating, RA-11 caveat)', () => {
  it('TC-R16-D1-10a: empty when not provisional and no medium caveats', () => {
    const view = buildVerdictView(makeVerdict({ provisional_reasons: [] }), undefined, undefined, undefined, undefined, undefined);
    expect(view.couldStillChange).toEqual([]);
  });

  it('TC-R16-D1-10b: unsigned_pack_rules line', () => {
    const view = buildVerdictView(makeVerdict({ provisional_reasons: ['unsigned_pack_rules'] }), undefined, undefined, undefined, undefined, undefined);
    expect(view.couldStillChange[0]).toMatch(/haven't been formally adopted/);
  });

  it('TC-R16-D1-10c: unclassified_decision_type line names the typed text', () => {
    const view = buildVerdictView(
      makeVerdict({ provisional_reasons: ['unclassified_decision_type'], unclassified_decision_types: ['collections prioritisation'] }),
      undefined, undefined, undefined, undefined, undefined,
    );
    expect(view.couldStillChange[0]).toContain('"collections prioritisation"');
  });

  it('TC-R16-D1-10d: provisional via the legacy low-caveat path with no named reasons shows the generic fallback line (D-19)', () => {
    const verdict = makeVerdict({
      provisional_reasons: undefined,
      confidence_caveats: [{ ruleId: 'R1', field: 'f', reason: 'r', confidence: 'low' }],
    });
    const view = buildVerdictView(verdict, undefined, undefined, undefined, undefined, undefined);
    expect(view.couldStillChange).toEqual(['This result may still change — your AI risk team can tell you why.']);
  });

  it('TC-R16-D1-10e: a medium-confidence caveat surfaces its own line even when the verdict is NOT provisional (RA-11)', () => {
    const verdict = makeVerdict({
      provisional_reasons: [],
      confidence_caveats: [{ ruleId: 'R1', field: 'f', reason: 'r', confidence: 'medium' }],
    });
    const view = buildVerdictView(verdict, undefined, undefined, undefined, undefined, undefined);
    expect(view.couldStillChange).toEqual(['Some rules it used are worded with less certainty than usual — check this result with your compliance team before relying on it.']);
  });

  it('TC-R16-D1-10f: both a provisional reason and a medium caveat produce both lines', () => {
    const verdict = makeVerdict({
      provisional_reasons: ['unsigned_pack_rules'],
      confidence_caveats: [{ ruleId: 'R1', field: 'f', reason: 'r', confidence: 'medium' }],
    });
    const view = buildVerdictView(verdict, undefined, undefined, undefined, undefined, undefined);
    expect(view.couldStillChange).toHaveLength(2);
  });
});

describe('buildVerdictView — TC-R16-D1-11: placeholders resolve from the graph', () => {
  it('TC-R16-D1-11a: {audience} picks the widest exposure across several output nodes', () => {
    const policy = makePolicy({ invariants: [{ id: 'INV-A', description: 'd', condition: {}, required_controls: [], severity: 'Low', plain_reason: '{audience} deal with it directly' }] });
    const graph = makeGraph({
      output_nodes: [
        { id: 'o1', label: 'a', action_type: 'inform', exposure: 'internal-only', decision_bindingness: 'advisory', output_reversibility: 'reversible', scale: 'limited' },
        { id: 'o2', label: 'b', action_type: 'inform', exposure: 'market-facing', decision_bindingness: 'advisory', output_reversibility: 'reversible', scale: 'limited' },
        { id: 'o3', label: 'c', action_type: 'inform', exposure: 'client-facing', decision_bindingness: 'advisory', output_reversibility: 'reversible', scale: 'limited' },
      ],
    });
    const verdict = makeVerdict({
      binding_constraint: 'INV-A',
      explanation: {
        tier_rationale: null, track_rationale: null, hard_lines_checked: 1, invariants_checked: 1,
        tripped_invariants: [{ id: 'INV-A', description: 'd', severity: 'Low', required_controls: [], graph_path: 'x' }],
        binding_reason: null, binding_regulatory_basis: null,
      },
    });
    const view = buildVerdictView(verdict, policy, graph, undefined, undefined, undefined);
    expect(view.whyReasons[0]).toBe('the public or the market deal with it directly');
  });

  it('TC-R16-D1-11b: {destination} picks the least-controlled zone (A over B over C) across several processing nodes', () => {
    const policy = makePolicy({ invariants: [{ id: 'INV-A', description: 'd', condition: {}, required_controls: [], severity: 'Low', plain_reason: 'it sends data to {destination}' }] });
    const graph = makeGraph({
      processing_nodes: [
        { id: 'p1', label: 'a', model_type: 'llm', autonomy_level: 1, data_zone: 'Zone C', vendor: 'internal', replaces_prior_model: false },
        { id: 'p2', label: 'b', model_type: 'llm', autonomy_level: 1, data_zone: 'Zone A', vendor: 'internal', replaces_prior_model: false },
        { id: 'p3', label: 'c', model_type: 'llm', autonomy_level: 1, data_zone: 'Zone B', vendor: 'internal', replaces_prior_model: false },
      ],
    });
    const verdict = makeVerdict({
      binding_constraint: 'INV-A',
      explanation: {
        tier_rationale: null, track_rationale: null, hard_lines_checked: 1, invariants_checked: 1,
        tripped_invariants: [{ id: 'INV-A', description: 'd', severity: 'Low', required_controls: [], graph_path: 'x' }],
        binding_reason: null, binding_regulatory_basis: null,
      },
    });
    const view = buildVerdictView(verdict, policy, graph, undefined, undefined, undefined);
    expect(view.whyReasons[0]).toBe('it sends data to an outside website or service');
  });

  it('TC-R16-D1-11c: with no graph at all, placeholders resolve to a safe, non-crashing default', () => {
    const policy = makePolicy({
      invariants: [{ id: 'INV-A', description: 'd', condition: {}, required_controls: [], severity: 'Low', plain_reason: '{audience} / {destination}' }],
    });
    const verdict = makeVerdict({
      binding_constraint: 'INV-A',
      explanation: {
        tier_rationale: null, track_rationale: null, hard_lines_checked: 1, invariants_checked: 1,
        tripped_invariants: [{ id: 'INV-A', description: 'd', severity: 'Low', required_controls: [], graph_path: 'x' }],
        binding_reason: null, binding_regulatory_basis: null,
      },
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.whyReasons[0]).not.toContain('{audience}');
    expect(view.whyReasons[0]).not.toContain('{destination}');
    // Never the most reassuring value when the graph is unknown: these
    // placeholders only appear in rules about wider exposure or an outside zone.
    expect(view.whyReasons[0]).toBe("clients or the public / a system outside your firm's own");
  });

  it('TC-R16-D1-11d: {destination} names the least-controlled zone on ANY node — data entering from an outside zone is not described as staying inside the firm', () => {
    const policy = makePolicy({
      invariants: [{ id: 'INV-A', description: 'd', condition: {}, required_controls: [], severity: 'Low', plain_reason: 'it sends personal details about people to {destination}' }],
    });
    const verdict = makeVerdict({
      binding_constraint: 'INV-A',
      explanation: {
        tier_rationale: null, track_rationale: null, hard_lines_checked: 1, invariants_checked: 1,
        tripped_invariants: [{ id: 'INV-A', description: 'd', severity: 'Low', required_controls: [], graph_path: 'x' }],
        binding_reason: null, binding_regulatory_basis: null,
      },
    });
    const graph = {
      id: 'g', version: 1, jurisdictions: [], intake_method: 'structured_form' as const, extracted_at: 'x', edges: [],
      input_nodes: [{ id: 'i', label: 'i', data_class: 'Client PII' as const, data_zone: 'Zone B' as const }],
      processing_nodes: [{ id: 'p', label: 'p', model_type: 'llm' as const, autonomy_level: 1 as const, data_zone: 'Zone C' as const, vendor: 'internal', replaces_prior_model: false }],
      output_nodes: [{ id: 'o', label: 'o', action_type: 'draft' as const, exposure: 'internal-only' as const, decision_bindingness: 'advisory' as const, output_reversibility: 'reversible' as const, scale: 'limited' as const }],
    };
    const view = buildVerdictView(verdict, policy, graph, undefined, undefined, undefined);
    expect(view.whyReasons[0]).toBe("it sends personal details about people to the supplier's systems, which are outside your firm's own");
  });
});

describe('buildVerdictView — TC-R16-D1-12: rejected verdicts stay minimal (the "No" screen is chunk D2)', () => {
  it('TC-R16-D1-12a: a rejected verdict has no safeguards, no next steps, and no could-still-change lines from this view-model', () => {
    const verdict = makeVerdict({ status: 'rejected', controls: [], binding_constraint: 'HL-002' });
    const view = buildVerdictView(verdict, undefined, undefined, undefined, undefined, undefined);
    expect(view.isRejected).toBe(true);
    expect(view.safeguards).toEqual([]);
    expect(view.outstandingSafeguards).toEqual([]);
    expect(view.no).toBeDefined();
  });
});

// R16-D2 §2 (VD-10, D-80). The "No" screen's own composition.
function makeAssumption(overrides: Partial<Assumption> = {}): Assumption {
  return {
    questionId: '9',
    question: 'If it gets something wrong, can the mistake be caught and put right?',
    shortLabel: 'whether a mistake can be put right',
    assumption: 'it can’t be undone — the strictest case',
    fields: ['output_reversibility'],
    ...overrides,
  };
}

// Real shape: a pack names its jurisdiction by CODE, and the policy maps codes
// to names. (Verifying R16-D2: these sample packs used to spell the code out
// as "the United Kingdom", which hid that the screen printed the raw code.)
const COUNTRIES = [
  { code: 'UK', name: 'United Kingdom', pack_files: [] },
  { code: 'EU', name: 'European Union', pack_files: [] },
  { code: 'CA', name: 'Canada', pack_files: [] },
];

function makePack(overrides: Partial<JurisdictionPack> = {}): JurisdictionPack {
  return {
    pack_id: 'PACK-UK',
    version: '1.0',
    jurisdiction: 'UK',
    regulator: 'FCA',
    document: 'doc',
    effective_date: '2026-01-01',
    reviewer_name: 'x',
    reviewer_role: 'x',
    sign_off_date: '2026-01-01',
    rules: [],
    ...overrides,
  };
}

describe('buildVerdictView — TC-R16-D2-01..09: the "No" screen (VD-10, §2)', () => {
  it('TC-R16-D2-01: a firm hard line with plain_reason/plain_change — exact reason and change text', () => {
    const policy = makePolicy({
      hard_lines: [
        {
          id: 'HL-002',
          description: 'MNPI outside the controlled zone',
          condition: { data_class: { in: ['MNPI'] }, data_zone: { not_in: ['Zone C'] } },
          reason: 'r',
          regulatory_basis: 'rb',
          plain_reason: 'price-sensitive information would leave your firm’s own systems',
          plain_change: 'Keep price-sensitive information out of it, or use a service that runs entirely inside your firm’s own systems.',
        },
      ],
    });
    const verdict = makeVerdict({ status: 'rejected', controls: [], binding_constraint: 'HL-002' });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.no?.kind).toBe('hard_line');
    expect(view.no?.reason).toBe(
      "price-sensitive information would leave your firm’s own systems. That's a line your firm never crosses, and no safeguard can make up for it.",
    );
    expect(view.no?.change).toBe(
      'Keep price-sensitive information out of it, or use a service that runs entirely inside your firm’s own systems. Then check again.',
    );
  });

  it('TC-R16-D2-02: a firm hard line with neither field falls back to its description + the §4.4 pointer, both for reason and change', () => {
    const policy = makePolicy({
      hard_lines: [
        { id: 'HL-003', description: 'Autonomous lending decision with no human in the loop', condition: { autonomy_level: { gte: 4 } }, reason: 'r', regulatory_basis: 'rb' },
      ],
    });
    const verdict = makeVerdict({ status: 'rejected', controls: [], binding_constraint: 'HL-003' });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.no?.kind).toBe('hard_line');
    expect(view.no?.reason).toBe(
      "Autonomous lending decision with no human in the loop. That's a line your firm never crosses, and no safeguard can make up for it. Ask your AI risk team what this means for you.",
    );
    expect(view.no?.change).toBe(
      'change how it would be used, then check again. Ask your AI risk team what this means for you.',
    );
  });

  it('TC-R16-D2-03: a pack hard line with plain fields names the pack\'s jurisdiction', () => {
    const packs = [
      makePack({
        rules: [
          {
            id: 'SS1-UK-HL-01',
            title: 't',
            source: { document: 'SS1/23', section: '3.8', text: 'quoted text' },
            effect: { type: 'hard_line', reason: 'r', plain_reason: 'it would decide entirely by itself with no person involved', plain_change: 'Add a human reviewer before it acts.' },
            condition: { autonomy_level: { gte: 4 } },
            basis: 'verbatim',
          },
        ],
      }),
    ];
    const verdict = makeVerdict({ status: 'rejected', controls: [], binding_constraint: 'SS1-UK-HL-01' });
    const view = buildVerdictView(verdict, makePolicy({ jurisdictions: COUNTRIES }), undefined, undefined, undefined, undefined, { packs });
    expect(view.no?.kind).toBe('pack_hard_line');
    expect(view.no?.reason).toBe(
      "it would decide entirely by itself with no person involved. It's one of the rules your firm has adopted for the United Kingdom, and no safeguard can make up for it.",
    );
    expect(view.no?.change).toBe('Add a human reviewer before it acts. Then check again.');
  });

  it('TC-R16-D2-04: a pack hard line with neither field names the jurisdiction in the fallback reason, plus the pointer line', () => {
    const packs = [
      makePack({
        jurisdiction: 'EU',
        rules: [
          { id: 'EU-HL-01', title: 't', source: { document: 'd', section: 's', text: 't' }, effect: { type: 'hard_line', reason: 'r' }, condition: { autonomy_level: { gte: 4 } }, basis: 'verbatim' },
        ],
      }),
    ];
    const verdict = makeVerdict({ status: 'rejected', controls: [], binding_constraint: 'EU-HL-01' });
    const view = buildVerdictView(verdict, makePolicy({ jurisdictions: COUNTRIES }), undefined, undefined, undefined, undefined, { packs });
    expect(view.no?.kind).toBe('pack_hard_line');
    expect(view.no?.reason).toBe(
      'one of the rules your firm has adopted for the European Union rules this out. Ask your AI risk team what this means for you.',
    );
    expect(view.no?.change).toBe(
      'change how it would be used, then check again. Ask your AI risk team what this means for you.',
    );
  });

  it('TC-R16-D2-05: CS-2 (unsatisfiable invariant, no plain_reason) uses the invariant\'s description + pointer, plus the no-safeguard clause and the CS-2 change text', () => {
    const policy = makePolicy({ invariants: [{ id: 'INV-X', description: 'No alternative control exists for this exposure', condition: { exposure: { in: ['market-facing'] } }, required_controls: [], severity: 'High' }] });
    const verdict = makeVerdict({
      status: 'rejected',
      controls: [],
      binding_constraint: 'INV-X',
      explanation: {
        tier_rationale: null,
        track_rationale: null,
        hard_lines_checked: 2,
        invariants_checked: 1,
        tripped_invariants: [{ id: 'INV-X', description: 'No alternative control exists for this exposure', severity: 'High', required_controls: [], graph_path: 'a -> b' }],
        binding_reason: null,
        binding_regulatory_basis: null,
      },
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.no?.kind).toBe('unsatisfiable');
    expect(view.no?.reason).toBe(
      'No alternative control exists for this exposure, and your firm has no safeguard that resolves it. Ask your AI risk team what this means for you.',
    );
    expect(view.no?.change).toBe(
      'change how it would be used, or ask your AI risk team whether the firm can add a safeguard for this.',
    );
  });

  it('TC-R16-D2-05b: CS-2 with a plain_reason present uses it, still with the no-safeguard clause', () => {
    const policy = makePolicy({ invariants: [{ id: 'INV-Y', description: 'd', condition: { exposure: { in: ['market-facing'] } }, required_controls: [], severity: 'High', plain_reason: 'what it produces reaches the public or the market' }] });
    const verdict = makeVerdict({
      status: 'rejected',
      controls: [],
      binding_constraint: 'INV-Y',
      explanation: {
        tier_rationale: null,
        track_rationale: null,
        hard_lines_checked: 2,
        invariants_checked: 1,
        tripped_invariants: [{ id: 'INV-Y', description: 'd', severity: 'High', required_controls: [], graph_path: 'a -> b' }],
        binding_reason: null,
        binding_regulatory_basis: null,
      },
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined);
    expect(view.no?.reason).toBe('what it produces reaches the public or the market, and your firm has no safeguard that resolves it.');
  });

  it('TC-R16-D2-06: an id found nowhere loaded never renders the bare id, and offers no "what would change" line', () => {
    const verdict = makeVerdict({ status: 'rejected', controls: [], binding_constraint: 'SOME-UNKNOWN-ID' });
    const view = buildVerdictView(verdict, makePolicy(), undefined, undefined, undefined, undefined);
    expect(view.no?.kind).toBe('other');
    expect(view.no?.reason).toBe("one of your firm's rules rules this out. Ask your AI risk team what this means for you.");
    expect(view.no?.reason).not.toMatch(/SOME-UNKNOWN-ID/);
    expect(view.no?.change).toBeUndefined();
  });

  it('TC-R16-D2-07: an assumption contributes when any of its fields appears in the binding hard line\'s own condition keys', () => {
    const policy = makePolicy({
      hard_lines: [{ id: 'HL-002', description: 'd', condition: { data_class: { in: ['MNPI'] }, data_zone: { not_in: ['Zone C'] } }, reason: 'r', regulatory_basis: 'rb' }],
    });
    const verdict = makeVerdict({ status: 'rejected', controls: [], binding_constraint: 'HL-002' });
    const contributingOne = makeAssumption({ questionId: '3platformZone', shortLabel: 'whether your information stays on your firm’s systems', fields: ['data_zone'] });
    const nonContributing = makeAssumption({ questionId: '9', shortLabel: 'whether a mistake can be put right', fields: ['output_reversibility'] });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined, {
      assumptions: [contributingOne, nonContributing],
    });
    expect(view.no?.contributingAssumptions).toEqual([contributingOne]);
    expect(view.no?.otherAssumptionCount).toBe(1);
  });

  it('TC-R16-D2-08: for a pack hard line, the PACK rule\'s own condition is checked, not the firm\'s', () => {
    const packs = [
      makePack({
        rules: [{ id: 'SS1-UK-HL-02', title: 't', source: { document: 'd', section: 's', text: 't' }, effect: { type: 'hard_line', reason: 'r' }, condition: { autonomy_level: { gte: 4 } }, basis: 'verbatim' }],
      }),
    ];
    const verdict = makeVerdict({ status: 'rejected', controls: [], binding_constraint: 'SS1-UK-HL-02' });
    const a = makeAssumption({ questionId: '6', shortLabel: 'what it does with what it produces', fields: ['autonomy_level', 'action_type'] });
    const view = buildVerdictView(verdict, makePolicy(), undefined, undefined, undefined, undefined, { packs, assumptions: [a] });
    expect(view.no?.contributingAssumptions).toEqual([a]);
  });

  it('TC-R16-D2-07b: no assumptions at all — contributingAssumptions empty, otherAssumptionCount zero', () => {
    const verdict = makeVerdict({ status: 'rejected', controls: [], binding_constraint: 'HL-002' });
    const view = buildVerdictView(verdict, makePolicy({ hard_lines: [{ id: 'HL-002', description: 'd', condition: { data_class: { in: ['MNPI'] } }, reason: 'r', regulatory_basis: 'rb' }] }), undefined, undefined, undefined, undefined);
    expect(view.no?.contributingAssumptions).toEqual([]);
    expect(view.no?.otherAssumptionCount).toBe(0);
  });
});

describe('buildVerdictView — TC-R16-D2-09: inPlaceScopeName (DR7-34, §7)', () => {
  function policyWithScopedEvidence(appliesTo: { platforms?: string[]; vendors?: string[] }) {
    return makePolicy({
      controls: [
        {
          id: 'CTRL-ENC-01',
          name: 'Encryption in transit',
          description: 'd',
          resolves: [],
          burden: 1,
          verification: 'v',
          verification_evidence: { status: 'verified', detail: 'd', applies_to: appliesTo },
        },
      ],
      platforms: [{ id: 'PLAT-X', name: 'raw', approved_envelope: {}, satisfies_controls: [], plain_name: 'Firm Platform' }],
      vendors: [{ id: 'VENDOR-X', name: 'raw', approved_envelope: {}, satisfies_controls: [], plain_name: 'Firm Vendor' }],
    });
  }

  it('TC-R16-D2-09a: no scoped in-place safeguard — undefined, and the note stays generic', () => {
    const policy = makePolicy({ controls: [{ id: 'CTRL-ENC-01', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', verification_evidence: { status: 'verified' } }] });
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-ENC-01'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.inPlaceScopeName).toBeUndefined();
  });

  it('TC-R16-D2-09b: a scoped, matched in-place safeguard names the platform', () => {
    const policy = policyWithScopedEvidence({ platforms: ['PLAT-X'] });
    const graph = { ...makeGraph(), processing_nodes: [{ ...makeGraph().processing_nodes[0]!, platform: 'PLAT-X' }] };
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-ENC-01'] }), policy, graph, undefined, undefined, undefined);
    expect(view.inPlaceScopeName).toBe('Firm Platform');
  });

  it('TC-R16-D2-09c: scoped to both platform and vendor, the graph matches both — the platform\'s name wins', () => {
    const policy = policyWithScopedEvidence({ platforms: ['PLAT-X'], vendors: ['VENDOR-X'] });
    const graph = { ...makeGraph(), processing_nodes: [{ ...makeGraph().processing_nodes[0]!, platform: 'PLAT-X', vendor: 'VENDOR-X' }] };
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-ENC-01'] }), policy, graph, undefined, undefined, undefined);
    expect(view.inPlaceScopeName).toBe('Firm Platform');
  });

  it('TC-R16-D2-09d: vendor-only match names the vendor', () => {
    const policy = policyWithScopedEvidence({ vendors: ['VENDOR-X'] });
    const graph = { ...makeGraph(), processing_nodes: [{ ...makeGraph().processing_nodes[0]!, vendor: 'VENDOR-X' }] };
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-ENC-01'] }), policy, graph, undefined, undefined, undefined);
    expect(view.inPlaceScopeName).toBe('Firm Vendor');
  });

  it('TC-R16-D2-09e: no graph (the register path) falls back to the options.evidenceScope and still names the match — register and intake agree', () => {
    const policy = policyWithScopedEvidence({ platforms: ['PLAT-X'] });
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-ENC-01'] }), policy, undefined, undefined, undefined, undefined, {
      evidenceScope: { platform: 'PLAT-X' },
    });
    expect(view.safeguards[0]!.status).toBe('verified');
    expect(view.inPlaceScopeName).toBe('Firm Platform');
  });

  it('TC-R16-D2-09f: no graph and no evidenceScope — a legacy event still renders, with the existing "we couldn\'t check" note, and no scope name', () => {
    const policy = policyWithScopedEvidence({ platforms: ['PLAT-X'] });
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-ENC-01'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.status).toBe('outstanding');
    expect(view.safeguards[0]!.evidenceScopeNote).toBe(
      "Your firm's records show this for Firm Platform — we couldn't check whether that includes this tool.",
    );
    expect(view.inPlaceScopeName).toBeUndefined();
  });
});

// Found verifying R16-D2: the "No" screen printed a pack's jurisdiction CODE
// ("EU") where the contract asks for its plain name, and the evidence note fell
// back to a platform's internal id when it had no plain name.
describe('R16-D2 verification — words a person reads, never codes', () => {
  function packHardLine(jurisdiction: string, withPlainReason: boolean) {
    return [
      makePack({
        jurisdiction,
        rules: [
          {
            id: 'PACK-HL-01',
            title: 't',
            source: { document: 'd', section: 's', text: 't' },
            effect: withPlainReason
              ? { type: 'hard_line', reason: 'r', plain_reason: 'it would act with no person involved' }
              : { type: 'hard_line', reason: 'r' },
            condition: { autonomy_level: { gte: 4 } },
            basis: 'verbatim',
          },
        ],
      }),
    ];
  }
  const rejected = () => makeVerdict({ status: 'rejected', controls: [], binding_constraint: 'PACK-HL-01' });

  it('TC-R16-D2-62: a pack country is named in words — "the" where English needs it, none where it does not, and an unlisted code is never shown', () => {
    const policy = makePolicy({ jurisdictions: COUNTRIES });
    const eu = buildVerdictView(rejected(), policy, undefined, undefined, undefined, undefined, { packs: packHardLine('EU', true) });
    expect(eu.no?.reason).toContain('adopted for the European Union, and no safeguard');
    const ca = buildVerdictView(rejected(), policy, undefined, undefined, undefined, undefined, { packs: packHardLine('CA', true) });
    expect(ca.no?.reason).toContain('adopted for Canada, and no safeguard');
    const unlisted = buildVerdictView(rejected(), policy, undefined, undefined, undefined, undefined, { packs: packHardLine('XX', false) });
    expect(unlisted.no?.reason).toBe(
      'one of the rules your firm has adopted for the countries it involves rules this out. Ask your AI risk team what this means for you.',
    );
    expect(unlisted.no?.reason).not.toMatch(/\bXX\b/);
  });

  it('TC-R16-D2-63: a matched platform with no plain name leaves the "already in place" note generic — never its internal id', () => {
    const policy = makePolicy({
      controls: [
        { id: 'CTRL-ENC-01', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', verification_evidence: { status: 'verified', detail: 'd', applies_to: { platforms: ['PLAT-NONAME'] } } },
      ],
      platforms: [{ id: 'PLAT-NONAME', name: 'raw', approved_envelope: {}, satisfies_controls: [] }],
    });
    const graph = { ...makeGraph(), processing_nodes: [{ ...makeGraph().processing_nodes[0]!, platform: 'PLAT-NONAME' }] };
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-ENC-01'] }), policy, graph, undefined, undefined, undefined);
    expect(view.safeguards[0]!.status).toBe('verified');
    expect(view.inPlaceScopeName).toBeUndefined();
  });
});

// Found in the verification ritual: closing a description with a full stop
// crashed the whole sign-off page for a stored control with no description
// (37 tests failed). A missing description must degrade, never crash.
describe('R16-D2 verification — a missing description never crashes the page', () => {
  it('TC-R16-D2-64: a safeguard with no plain wording and no description reads "{name}. {pointer}"', () => {
    const policy = makePolicy({
      controls: [{ id: 'CTRL-NODESC', name: 'Access review', resolves: [], burden: 1, verification: 'v' } as unknown as PolicyFile['controls'][number]],
    });
    const view = buildVerdictView(makeVerdict({ controls: ['CTRL-NODESC'] }), policy, undefined, undefined, undefined, undefined);
    expect(view.safeguards[0]!.plainAction).toBe('Access review. Ask your AI risk team what this means for you.');
  });
});

describe('R16-D2 verification — a registry name reads naturally mid-sentence', () => {
  it('TC-R16-D2-65: a plain name written to start a line ("Your firm\'s …") is lower-cased in the "already in place" note; a proper name is left alone', () => {
    const policyFor = (plain: string) =>
      makePolicy({
        controls: [
          { id: 'CTRL-ENC-01', name: 'n', description: 'd', resolves: [], burden: 1, verification: 'v', verification_evidence: { status: 'verified', detail: 'd', applies_to: { platforms: ['PLAT-C'] } } },
        ],
        platforms: [{ id: 'PLAT-C', name: 'raw', approved_envelope: {}, satisfies_controls: [], plain_name: plain }],
      });
    const graph = { ...makeGraph(), processing_nodes: [{ ...makeGraph().processing_nodes[0]!, platform: 'PLAT-C' }] };
    const yours = buildVerdictView(makeVerdict({ controls: ['CTRL-ENC-01'] }), policyFor("Your firm's cloud AI assistant"), graph, undefined, undefined, undefined);
    expect(yours.inPlaceScopeName).toBe("your firm's cloud AI assistant");
    const proper = buildVerdictView(makeVerdict({ controls: ['CTRL-ENC-01'] }), policyFor('Microsoft Copilot'), graph, undefined, undefined, undefined);
    expect(proper.inPlaceScopeName).toBe('Microsoft Copilot');
  });
});

describe('R16-D2 review pass 1 — "the" before a country name', () => {
  it('TC-R16-D2-66: names shaped "X of Y" take "the" too ("the Republic of Ireland"), and names that take none stay bare', () => {
    const pack = (code: string) => [
      makePack({
        jurisdiction: code,
        rules: [
          { id: 'PACK-HL-02', title: 't', source: { document: 'd', section: 's', text: 't' }, effect: { type: 'hard_line', reason: 'r', plain_reason: 'it would act alone' }, condition: { autonomy_level: { gte: 4 } }, basis: 'verbatim' },
        ],
      }),
    ];
    const policy = makePolicy({
      jurisdictions: [
        { code: 'IE', name: 'Republic of Ireland', pack_files: [] },
        { code: 'SA', name: 'Kingdom of Saudi Arabia', pack_files: [] },
        { code: 'IM', name: 'Isle of Man', pack_files: [] },
        { code: 'SG', name: 'Singapore', pack_files: [] },
      ],
    });
    const reasonFor = (code: string) =>
      buildVerdictView(makeVerdict({ status: 'rejected', controls: [], binding_constraint: 'PACK-HL-02' }), policy, undefined, undefined, undefined, undefined, { packs: pack(code) }).no?.reason;
    expect(reasonFor('IE')).toContain('adopted for the Republic of Ireland,');
    expect(reasonFor('SA')).toContain('adopted for the Kingdom of Saudi Arabia,');
    expect(reasonFor('IM')).toContain('adopted for the Isle of Man,');
    expect(reasonFor('SG')).toContain('adopted for Singapore,');
  });
});

describe('buildVerdictView — CR6-18 / A-2: the "No" screen composes cleanly', () => {
  it('TC-CR6-18: with an empty core reason, no sentence starts with ". " or ", " and none carries a doubled stop', () => {
    const noStrayPunctuation = (s: string | undefined) => {
      expect(s).toBeTruthy();
      expect(s).not.toMatch(/^[\s.,;]/);
      expect(s).not.toMatch(/\.\s*\./);
      expect(s).not.toMatch(/^\s*,|,\s*,/);
    };
    // Firm hard line: no plain_reason and a blank description.
    const hl = makePolicy({
      hard_lines: [{ id: 'HL-E', description: '', condition: {}, reason: 'r', regulatory_basis: 'rb' }],
    });
    const hlView = buildVerdictView(makeVerdict({ status: 'rejected', controls: [], binding_constraint: 'HL-E' }), hl, undefined, undefined, undefined, undefined);
    expect(hlView.no?.kind).toBe('hard_line');
    noStrayPunctuation(hlView.no?.reason);

    // Unsatisfiable invariant: blank description, no plain_reason.
    const inv = makePolicy({
      invariants: [{ id: 'INV-E', description: '', severity: 'High', condition: {}, resolves_with: [] } as never],
    });
    const invView = buildVerdictView(
      makeVerdict({
        status: 'rejected',
        controls: [],
        binding_constraint: 'INV-E',
        explanation: {
          tier_rationale: null,
          track_rationale: null,
          hard_lines_checked: 1,
          invariants_checked: 1,
          tripped_invariants: [{ id: 'INV-E', description: '', severity: 'High', required_controls: [], graph_path: 'x' }],
          binding_reason: null,
          binding_regulatory_basis: null,
        },
      }),
      inv,
      undefined, undefined, undefined, undefined,
    );
    expect(invView.no?.kind).toBe('unsatisfiable');
    noStrayPunctuation(invView.no?.reason);

    // Pack hard line whose plain_reason is only whitespace.
    const pack = makePack({
      jurisdiction: 'UK',
      rules: [
        {
          id: 'PACK-HL-E',
          title: 't',
          source: { document: 'd', section: 's', text: 't' },
          effect: { type: 'hard_line', reason: 'r', plain_reason: '   ' },
          condition: { autonomy_level: { gte: 4 } },
          basis: 'verbatim',
        },
      ],
    });
    const packView = buildVerdictView(
      makeVerdict({ status: 'rejected', controls: [], binding_constraint: 'PACK-HL-E' }),
      makePolicy(), undefined, undefined, undefined, undefined, { packs: [pack] },
    );
    expect(packView.no?.kind).toBe('pack_hard_line');
    noStrayPunctuation(packView.no?.reason);
  });

  it('TC-CR6-A2: plain_change placeholders are filled like plain_reason, for a firm and a pack hard line', () => {
    const policy = makePolicy({
      hard_lines: [
        {
          id: 'HL-P',
          description: 'd',
          condition: {},
          reason: 'r',
          regulatory_basis: 'rb',
          plain_reason: 'it sends things to {destination}',
          plain_change: 'Stop sending things to {destination}, or keep it away from {audience}',
        },
      ],
    });
    const view = buildVerdictView(makeVerdict({ status: 'rejected', controls: [], binding_constraint: 'HL-P' }), policy, undefined, undefined, undefined, undefined);
    expect(view.no?.change).not.toMatch(/[{}]/);
    const pack = makePack({
      jurisdiction: 'UK',
      rules: [
        {
          id: 'PACK-HL-P',
          title: 't',
          source: { document: 'd', section: 's', text: 't' },
          effect: { type: 'hard_line', reason: 'r', plain_reason: 'x', plain_change: 'Keep it away from {audience}' },
          condition: { autonomy_level: { gte: 4 } },
          basis: 'verbatim',
        },
      ],
    });
    const packView = buildVerdictView(
      makeVerdict({ status: 'rejected', controls: [], binding_constraint: 'PACK-HL-P' }),
      makePolicy(), undefined, undefined, undefined, undefined, { packs: [pack] },
    );
    expect(packView.no?.change).not.toMatch(/[{}]/);
  });
});
