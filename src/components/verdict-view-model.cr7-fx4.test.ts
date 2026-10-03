import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildVerdictView } from './verdict-view-model';
import { resolveApprovedModel } from '../engine/evaluate';
import { loadPolicy } from '../store/policy';
import appetiteYaml from '../../policy/appetite.yaml?raw';
import type { ApprovedModel, JurisdictionPack, PolicyFile } from '../engine/types';
import type { Verdict } from '../types/verdict';
import type { AuditEvent } from '../store/types';

// FX7-4 / code review 007: CR7-09 (sign-off wording), CR7-29 (shared review id),
// CR7-39 (review-overdue line) and the wave-1 follow-up (one approved-model
// resolution rule). Every BC-005 test renders the case where the claim would
// be FALSE and asserts the claim is absent.

function realPolicy(): PolicyFile {
  const loaded = loadPolicy(appetiteYaml);
  if (!loaded.valid) throw new Error('shipped policy failed to load');
  return loaded.policy;
}

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    status: 'approved_with_controls',
    tier: 'High',
    track: 'II',
    binding_constraint: 'INV-DATA-01',
    binding_path: 'a → b → c',
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

function review(verdictId: string, action: 'approved' | 'rejected' | 'correction_requested'): AuditEvent {
  return {
    event_id: crypto.randomUUID(),
    use_case_id: 'uc-1',
    event_type: 'twoloD_reviewed',
    occurred_at: '2026-01-02T00:00:00.000Z',
    actor: '2LoD',
    payload: { type: 'twoloD_reviewed', action, verdict_id: verdictId, attested_by_name: 'Reviewer' },
    prev_hash: null,
    hash: 'h',
  } as unknown as AuditEvent;
}

const SELF_SERVICE_WORDS = /nobody|no sign-off needed|self-service/i;

describe('CR7-09 — a signed-off case is not described as needing no sign-off', () => {
  const policy = realPolicy();

  it('TC-CR7-09a: signed-off Track II case (stage approved, 2LoD review event) names the sign-off and never says self-service', () => {
    const verdict = makeVerdict({ tier: 'High', controls: [] });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, 'approved', {
      auditEvents: [review('verdict-1', 'approved')],
    });
    expect(view.signedOff).toBe(true);
    expect(view.needsSignOff).toBe(false);
    expect(view.whoSignsOff).toMatch(/signed off by your AI risk team/i);
    for (const text of [view.headline, view.whoSignsOff, ...view.nextSteps]) {
      expect(text).not.toMatch(SELF_SERVICE_WORDS);
    }
    expect(view.headline).toMatch(/signed off/i);
    // not the pending wording either
    expect(view.headline).not.toMatch(/^Not yet/);
  });

  it('TC-CR7-09b: a genuine self-service case (Low tier, stage approved) is unchanged — nobody signs off', () => {
    const verdict = makeVerdict({ tier: 'Low', track: 'I', controls: [] });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, 'approved', { auditEvents: [] });
    expect(view.signedOff).toBe(false);
    expect(view.needsSignOff).toBe(false);
    expect(view.whoSignsOff).toMatch(/^nobody/);
    expect(view.headline).toBe('Yes — you can start.');
  });

  it('TC-CR7-09c: a correction requested is not a sign-off — the case still needs one and never claims it was signed off', () => {
    const verdict = makeVerdict({ tier: 'High', controls: [] });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, 'pre_checked', {
      auditEvents: [review('verdict-1', 'correction_requested')],
    });
    expect(view.signedOff).toBe(false);
    expect(view.needsSignOff).toBe(true);
    for (const text of [view.headline, view.whoSignsOff, ...view.nextSteps]) {
      expect(text).not.toMatch(/has signed|have signed|signed off by/i);
    }
  });

  it('TC-CR7-09d: signed off, then corrected — the new verdict is not "signed off"', () => {
    const corrected = makeVerdict({ id: 'verdict-2', tier: 'High', controls: [] });
    const view = buildVerdictView(corrected, policy, undefined, undefined, undefined, 'pre_checked', {
      auditEvents: [review('verdict-1', 'approved')],
    });
    expect(view.signedOff).toBe(false);
    expect(view.needsSignOff).toBe(true);
    expect(view.headline).toMatch(/^Not yet/);
    expect(view.whoSignsOff).not.toMatch(/signed off by/i);
  });

  it('TC-CR7-09e: a rejected review is not a sign-off either', () => {
    const verdict = makeVerdict({ tier: 'High', controls: [] });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, 'pre_checked', {
      auditEvents: [review('verdict-1', 'rejected')],
    });
    expect(view.signedOff).toBe(false);
    expect(view.needsSignOff).toBe(true);
  });
});

describe('CR7-29 — a firm review and a pack review sharing an id', () => {
  it('TC-CR7-29: the verdict recorded the PACK rule\'s review text, so the pack\'s plain words show, not the firm\'s', () => {
    const policy = {
      ...realPolicy(),
      downstream_reviews: [
        { id: 'SHARED-01', review: 'Firm review text', condition: {}, plain_name: 'the firm words', plain_owner: 'the firm team' },
      ],
    } as PolicyFile;
    const pack = {
      pack_id: 'A-PACK', version: '1', jurisdiction: 'XX', regulator: 'r', document: 'd', effective_date: '2026-01-01',
      reviewer_name: 'n', reviewer_role: 'r', sign_off_date: '2026-01-01',
      rules: [{ id: 'SHARED-01', effect: { type: 'required_review', review: 'Pack review text', plain_name: 'the pack words', plain_owner: 'the pack team' } }],
    } as unknown as JurisdictionPack;
    const verdict = makeVerdict({
      downstream_reviews: ['Pack review text'],
      downstream_review_sources: [{ review: 'Pack review text', rule_id: 'SHARED-01' }],
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined, { packs: [pack] });
    expect(view.owedReviews[0]!.plainName).toBe('the pack words');
    expect(view.owedReviews[0]!.ownerText).toBe('the pack team');
    expect(view.owedReviews[0]!.plainName).not.toMatch(/firm words/);
  });

  it('TC-CR7-29-1: when the verdict recorded the firm rule\'s own review text, the firm\'s words still show', () => {
    const policy = {
      ...realPolicy(),
      downstream_reviews: [
        { id: 'SHARED-01', review: 'Firm review text', condition: {}, plain_name: 'the firm words', plain_owner: 'the firm team' },
      ],
    } as PolicyFile;
    const verdict = makeVerdict({
      downstream_reviews: ['Firm review text'],
      downstream_review_sources: [{ review: 'Firm review text', rule_id: 'SHARED-01' }],
    });
    const view = buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined, { packs: [] });
    expect(view.owedReviews[0]!.plainName).toBe('the firm words');
  });
});

describe('CR7-39 — a stale source is on the first screen', () => {
  it('TC-CR7-39: stale_sources non-empty adds a "Could still change" line about overdue regulatory text', () => {
    const verdict = makeVerdict({
      stale_sources: [{ pack_id: 'EU-PACK', days_overdue: 12, max_staleness_days: 90 }],
    } as Partial<Verdict>);
    const view = buildVerdictView(verdict, undefined, undefined, undefined, undefined, undefined);
    expect(view.couldStillChange.some((l) => /overdue/i.test(l))).toBe(true);
    // no bare pack id on the first screen (no-bare-code rule)
    expect(view.couldStillChange.join(' ')).not.toMatch(/EU-PACK/);
  });

  it('TC-CR7-39-1: no stale sources (absent or empty) — no overdue line (BC-005 false case)', () => {
    for (const stale of [undefined, []]) {
      const verdict = makeVerdict(stale === undefined ? {} : ({ stale_sources: stale } as Partial<Verdict>));
      const view = buildVerdictView(verdict, undefined, undefined, undefined, undefined, undefined);
      expect(view.couldStillChange.join(' ')).not.toMatch(/overdue/i);
    }
  });
});

describe('wave-1 follow-up — one approved-model resolution rule', () => {
  const models = [
    { model_id: 'claude-fam', is_family: true, version_pattern: 'claude-x-', is_approved: true },
    { model_id: 'exact-one', is_approved: false },
  ] as unknown as ApprovedModel[];
  const policy = { ...realPolicy(), approved_models: models } as PolicyFile;

  function reviewNameFor(modelId: string): string {
    const verdict = makeVerdict({
      downstream_reviews: ['Model review'],
      downstream_review_sources: [{ review: 'Model review', rule_id: `MODEL-REGISTRY:${modelId}` }],
    });
    return buildVerdictView(verdict, policy, undefined, undefined, undefined, undefined).owedReviews[0]!.plainName;
  }

  it('TC-FX7-4-MODEL-1: a family member, an exact entry and an unlisted id resolve on this screen exactly as the engine resolves them', () => {
    for (const id of ['claude-x-4', 'exact-one', 'nothing-like-it']) {
      const engineListed = resolveApprovedModel(models, id) !== undefined;
      expect(reviewNameFor(id)).toBe(engineListed ? 'your AI risk team accepting this model' : "adding the model to your firm's list of known models");
    }
  });

  it('TC-FX7-4-MODEL-2: the view model calls the engine\'s resolveApprovedModel and keeps no copy of the rule', () => {
    const src = readFileSync(resolve(__dirname, 'verdict-view-model.ts'), 'utf-8');
    expect(src).toMatch(/resolveApprovedModel/);
    expect(src).not.toMatch(/version_pattern/);
  });
});
