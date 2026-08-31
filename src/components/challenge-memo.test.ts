// TC-R10-CM-1-xx (requirements-010.md R10-CM-1, ADR-VA-R10-1).
import { describe, it, expect } from 'vitest';
import { buildChallengeMemo } from './challenge-memo';
import type { Verdict } from '../types/verdict';
import type { AuditEvent } from '../store/types';

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    status: 'approved_with_controls',
    tier: 'High',
    track: 'II',
    binding_constraint: 'INV-DATA-01',
    binding_path: 'client notes → drafting model → drafted email',
    controls: ['CTRL-ENC-01'],
    downstream_reviews: [],
    conditions: { hypotheses: [] },
    policy_version: '1.3',
    pack_versions: { 'UK-FCA': '2.1' },
    applied_overrides: [],
    confidence_caveats: [],
    provisional_reasons: ['no_regulatory_basis'],
    boundary_proximity: false,
    margin_achieved: 0,
    margin_target: 0.1,
    single_covered_invariants: ['INV-DATA-01'],
    explanation: {
      tier_rationale: { rule_id: 'TIER-PII-01', rule_name: 'Personal data forces High tier' },
      track_rationale: null,
      hard_lines_checked: 4,
      invariants_checked: 6,
      tripped_invariants: [
        {
          id: 'INV-DATA-01',
          description: 'Client PII may not cross into a disallowed zone.',
          severity: 'High',
          regulatory_basis: 'SS1/23 §3.4',
          required_controls: ['CTRL-ENC-01'],
          graph_path: 'client notes → drafting model',
        },
      ],
      binding_reason: 'PII crossed into a disallowed zone.',
      binding_regulatory_basis: 'SS1/23 §3.4',
      regulatory_chain: [
        {
          rule_id: 'UK-FCA-01',
          document: 'SS1/23',
          section: '3.4',
          source_text: 'Firms must control the movement of personal data. [FIRM] must document the control.',
          basis: 'verbatim',
          derived: 'Encryption required for cross-zone PII movement.',
          sign_off: '[FIRM] Risk Committee — pending',
        },
      ],
    },
    id: 'v-memo-1',
    use_case_id: 'uc-test',
    living_status: 'approved',
    living_status_updated_at: '2026-01-01T00:00:00.000Z',
    attested_by: '1LoD',
    attested_at: '2026-01-01T00:00:00.000Z',
    graph_version: 1,
    corrections: [],
    ...overrides,
  };
}

function makeEvents(): AuditEvent[] {
  return [
    {
      event_id: 'e1',
      use_case_id: 'uc-test',
      event_type: 'graph_confirmed',
      occurred_at: '2026-01-01T00:00:00.000Z',
      actor: '1LoD',
      payload: {
        type: 'graph_confirmed',
        graph_id: 'g1',
        graph_version: 1,
        corrections_count: 0,
        submitter_note: 'Client data stays encrypted in transit.',
        answer_contexts: ['Vendor confirmed SOC2 coverage.'],
      },
      prev_hash: null,
      hash: 'test-hash-e1',
    },
    {
      event_id: 'e2',
      use_case_id: 'uc-test',
      event_type: 'twoloD_reviewed',
      occurred_at: '2026-01-02T00:00:00.000Z',
      actor: '2LoD',
      payload: {
        type: 'twoloD_reviewed',
        action: 'approved',
        verdict_id: 'v-memo-1',
        attested_by_name: 'Jane Reviewer',
        notes: 'Looks fine given the controls.',
      },
      prev_hash: 'test-hash-e1',
      hash: 'test-hash-e2',
    },
    {
      event_id: 'e3',
      use_case_id: 'uc-test',
      event_type: 'rule_dissent_filed',
      occurred_at: '2026-01-03T00:00:00.000Z',
      actor: '2LoD',
      payload: {
        type: 'rule_dissent_filed',
        verdict_id: 'v-memo-1',
        rule_id: 'UK-FCA-01',
        dissent: 'This rule seems stricter than the source text requires.',
        filed_by_name: 'Jane Reviewer',
      },
      prev_hash: 'test-hash-e2',
      hash: 'test-hash-e3',
    },
  ];
}

describe('buildChallengeMemo', () => {
  it('TC-R10-CM-1-01: includes every required section heading', () => {
    const memo = buildChallengeMemo({
      label: 'Client email drafter',
      useCaseId: 'uc-test',
      description: 'Drafts client emails from notes.',
      verdict: makeVerdict(),
      events: makeEvents(),
    });
    expect(memo).toContain('# Effective challenge memo — Client email drafter');
    expect(memo).toContain('## The verdict');
    expect(memo).toContain('## Inherent position');
    expect(memo).toContain('## Residual position');
    expect(memo).toContain('## The regulatory chain');
    expect(memo).toContain('## Risk knowledge (advisory — informs, never decides)');
    expect(memo).toContain('## Provisional causes');
    expect(memo).toContain('## Sign-offs on the record');
    expect(memo).toContain('## Standing conditions');
    expect(memo).toContain('restates the record; it does not strengthen it');
  });

  it('TC-R10-CM-1-02: uses appetite vocabulary for status', () => {
    const memo = buildChallengeMemo({
      label: 'Client email drafter',
      useCaseId: 'uc-test',
      verdict: makeVerdict(),
      events: [],
    });
    expect(memo).toContain('inside appetite with controls');
  });

  it('TC-R10-CM-1-03: never emits the reserved words approved/rejected, even with a 2LoD approved action and rejected dissent-adjacent text', () => {
    const memo = buildChallengeMemo({
      label: 'Client email drafter',
      useCaseId: 'uc-test',
      verdict: makeVerdict({ status: 'rejected' }),
      events: makeEvents(),
    });
    expect(memo).not.toMatch(/approved|rejected/i);
  });

  it('TC-R10-CM-1-03b: reserved-words check also holds for approved and approved_with_controls statuses with a rejected 2LoD action', () => {
    const events = makeEvents();
    const twoLoD = events[1]!;
    if (twoLoD.payload.type === 'twoloD_reviewed') {
      twoLoD.payload = { ...twoLoD.payload, action: 'rejected' };
    }
    for (const status of ['approved', 'approved_with_controls', 'rejected'] as const) {
      const memo = buildChallengeMemo({
        label: 'Client email drafter',
        useCaseId: 'uc-test',
        verdict: makeVerdict({ status }),
        events,
      });
      expect(memo).not.toMatch(/approved|rejected/i);
    }
  });

  it('TC-R10-CM-1-04: maps provisional causes to plain language', () => {
    const memo = buildChallengeMemo({
      label: 'Client email drafter',
      useCaseId: 'uc-test',
      verdict: makeVerdict({
        provisional_reasons: ['no_regulatory_basis', 'unsigned_pack_rules', 'unclassified_decision_type'],
      }),
      events: [],
    });
    expect(memo).toContain("no jurisdiction pack applied — the firm's own appetite only");
    expect(memo).toContain('relies on pack rules no one at the firm has signed');
    expect(memo).toContain('a decision type the policy has no rule for');
  });

  it('TC-R10-CM-1-05: preserves [FIRM] placeholders verbatim', () => {
    const memo = buildChallengeMemo({
      label: 'Client email drafter',
      useCaseId: 'uc-test',
      verdict: makeVerdict(),
      events: [],
    });
    expect(memo).toContain('[FIRM]');
  });

  it('TC-R10-CM-1-06: quotes source_text in a blockquote', () => {
    const memo = buildChallengeMemo({
      label: 'Client email drafter',
      useCaseId: 'uc-test',
      verdict: makeVerdict(),
      events: [],
    });
    expect(memo).toMatch(/^\s*>\s*Firms must control the movement of personal data\./m);
  });

  it('TC-R10-CM-1-07: carries the name-not-verified caveat and note/context text from events', () => {
    const memo = buildChallengeMemo({
      label: 'Client email drafter',
      useCaseId: 'uc-test',
      verdict: makeVerdict(),
      events: makeEvents(),
    });
    expect(memo).toContain('Jane Reviewer (name not verified)');
    expect(memo).toContain('Client data stays encrypted in transit.');
    expect(memo).toContain('Vendor confirmed SOC2 coverage.');
    expect(memo).toContain('Looks fine given the controls.');
    expect(memo).toContain('Open challenge');
  });

  it('TC-R10-CM-1-08: renders standing conditions when hypotheses are present', () => {
    const memo = buildChallengeMemo({
      label: 'Client email drafter',
      useCaseId: 'uc-test',
      verdict: makeVerdict({ conditions: { hypotheses: ['Volume stays under 10k/month.'] } }),
      events: [],
    });
    expect(memo).toContain('Volume stays under 10k/month.');
  });

  it('TC-R10-CM-1-09: renders gracefully with empty regulatory_chain and no events — sections say none recorded rather than vanishing', () => {
    const verdict = makeVerdict({
      explanation: {
        ...makeVerdict().explanation,
        regulatory_chain: [],
        tripped_invariants: [],
        tier_rationale: null,
        track_rationale: null,
        binding_reason: null,
        binding_regulatory_basis: null,
      },
      controls: [],
      provisional_reasons: [],
      pack_versions: {},
    });
    const memo = buildChallengeMemo({
      label: 'Empty case',
      useCaseId: 'uc-empty',
      verdict,
      events: [],
    });
    expect(memo).toContain('## The regulatory chain');
    expect(memo).toContain('## Sign-offs on the record');
    expect(memo).toContain('## Standing conditions');
    // Every optional section falls back to explicit "none recorded" text.
    const noneRecordedCount = (memo.match(/none recorded/g) || []).length;
    expect(noneRecordedCount).toBeGreaterThanOrEqual(5);
    expect(memo).not.toMatch(/approved|rejected/i);
  });

  it('TC-R12-CM-HASH-01: prints "not computed" when policyHash is absent', () => {
    const memo = buildChallengeMemo({
      label: 'Client email drafter',
      useCaseId: 'uc-test',
      verdict: makeVerdict(),
      events: [],
    });
    expect(memo).toContain('Policy content hash: not computed');
  });

  it('TC-R12-CM-HASH-02: prints the given hash when policyHash is present', () => {
    const memo = buildChallengeMemo({
      label: 'Client email drafter',
      useCaseId: 'uc-test',
      verdict: makeVerdict(),
      events: [],
      policyHash: 'ab12cd34ef56',
    });
    expect(memo).toContain('Policy content hash: ab12cd34ef56');
    expect(memo).not.toContain('Policy content hash: not computed');
  });

  it('TC-R10-CM-1-10: title includes the label', () => {
    const memo = buildChallengeMemo({
      label: 'Some Use Case',
      useCaseId: 'uc-x',
      verdict: makeVerdict(),
      events: [],
    });
    expect(memo.startsWith('# Effective challenge memo — Some Use Case')).toBe(true);
  });
});

// R11-KL follow-up: the memo shipped in R10, before the knowledge lever
// existed, and was never updated — found by the user comparing a generated
// memo against the live verdict screen, which does show the panel.
describe('buildChallengeMemo — R11-KL knowledge-lens section', () => {
  it('TC-R11-KL-CM-1: renders matched entries with domain, description, source and coverage status', () => {
    const memo = buildChallengeMemo({
      label: 'Client email drafter',
      useCaseId: 'uc-test',
      verdict: makeVerdict(),
      events: [],
      knowledgeLensMatches: [
        {
          entry: {
            id: 'KL-PRIV-01',
            risk_domain: 'Privacy & Security',
            risk_subdomain: 'Sensitive personal data exposure via model I/O',
            description: 'Confidential or client PII flowing to a model endpoint can leak.',
            source_attribution: 'MIT AI Risk Repository (Slattery et al., MIT FutureTech), CC BY 4.0',
            condition: {},
            covering_rule_ids: ['INV-DATA-01'],
          },
          covered: true,
        },
        {
          entry: {
            id: 'KL-MALUSE-02',
            risk_domain: 'Malicious Use',
            risk_subdomain: 'AI-assisted fraud',
            description: 'Generative systems lower the cost of convincing fraud.',
            source_attribution: 'MIT AI Risk Repository (Slattery et al., MIT FutureTech), CC BY 4.0',
            condition: {},
            covering_rule_ids: [],
          },
          covered: false,
        },
      ],
    });
    expect(memo).toContain('## Risk knowledge (advisory — informs, never decides)');
    expect(memo).toContain('Privacy & Security');
    expect(memo).toContain('covered by a firm/pack rule');
    expect(memo).toContain('Malicious Use');
    expect(memo).toContain('coverage gap');
    expect(memo).toContain('MIT AI Risk Repository');
  });

  it('TC-R11-KL-CM-2: absent matches render "none recorded", not a missing section', () => {
    const memo = buildChallengeMemo({
      label: 'Client email drafter',
      useCaseId: 'uc-test',
      verdict: makeVerdict(),
      events: [],
    });
    expect(memo).toContain('## Risk knowledge (advisory — informs, never decides)\nnone recorded');
  });
});
