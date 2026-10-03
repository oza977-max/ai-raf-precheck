import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import VerdictDisplay from '../VerdictDisplay';
import type { Verdict } from '../../types/verdict';
import type { JurisdictionPack, PolicyFile } from '../../engine/types';
import type { Assumption } from '../plain-copy';

// R16-D2 §2 (VD-10). The "No" screen's rendering on the real component —
// see src/components/verdict-view-model.test.ts for the exhaustive,
// per-kind coverage of the TEXT COMPUTATION itself (TC-R16-D2-01..09);
// this file covers what only rendering can prove: the DOM structure, the
// single correction control, the reserved-word guard, and the reviewer
// section's new assumptions list.

const NO_RESERVED_WORDS = /\b(approved|rejected)\b/i;

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    status: 'rejected',
    tier: 'Critical',
    track: 'I',
    binding_constraint: 'HL-002',
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
      binding_reason: 'r',
      binding_regulatory_basis: 'rb',
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
    kri_thresholds: {},
    jurisdictions: [],
    roles: {},
    tier_workflow: { Critical: 'x', High: 'x', Medium: 'x', Low: 'x' },
    safety_margin: 0.1,
    ...overrides,
  } as PolicyFile;
}

function makeAssumption(overrides: Partial<Assumption> = {}): Assumption {
  return {
    questionId: '3platformZone',
    question: 'Does your information stay on your firm’s own systems the whole time?',
    shortLabel: 'whether your information stays on your firm’s systems',
    assumption: 'it may pass your information to an outside supplier — the stricter case.',
    fields: ['data_zone'],
    ...overrides,
  };
}

describe('VerdictDisplay — R16-D2: the "No" screen (VD-10, §2)', () => {
  it('TC-R16-D2-29: a firm hard line\'s Why, change and "who to talk to" all render; no safeguards list, no next steps, no who-signs-off', () => {
    const policy = makePolicy({
      hard_lines: [
        {
          id: 'HL-002',
          description: 'd',
          condition: { data_class: { in: ['MNPI'] } },
          reason: 'r',
          regulatory_basis: 'rb',
          plain_reason: 'price-sensitive information would leave your firm’s own systems',
          plain_change: 'Keep it inside your firm’s own systems.',
        },
      ],
    });
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} policy={policy} onCorrect={vi.fn()} />);
    const firstScreen = document.querySelector<HTMLElement>('.verdict__first-screen')!;
    expect(within(firstScreen).getByText('No — not as described.')).toBeInTheDocument();
    expect(firstScreen.querySelector('.verdict__first-why')!.textContent).toMatch(
      /Why: price-sensitive information would leave your firm’s own systems\. That's a line your firm never crosses/,
    );
    expect(firstScreen.querySelector('.verdict__no-change')!.textContent).toMatch(
      /What would change the answer: Keep it inside your firm’s own systems\. Then check again\./,
    );
    expect(firstScreen.querySelector('.verdict__no-who-to-talk-to')!.textContent).toMatch(
      /Who to talk to: your AI risk team.*if you think this is wrong/,
    );
    expect(within(firstScreen).queryByText(/Safeguards that must be in place/)).not.toBeInTheDocument();
    expect(within(firstScreen).queryByText(/Your next steps/)).not.toBeInTheDocument();
    expect(within(firstScreen).queryByText(/Who signs off:/)).not.toBeInTheDocument();
    expect(firstScreen.textContent).not.toMatch(NO_RESERVED_WORDS);
  });

  it('TC-R16-D2-30: exactly one correction control renders on a "No" — the first screen\'s own, reworded; the lower reviewer-section one does not render', () => {
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} policy={makePolicy()} onCorrect={vi.fn()} reasoningDefaultOpen />);
    expect(
      screen.getByRole('button', { name: /if we.ve misunderstood how you.d use it, correct your answers and check again/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^correct this classification\?$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^think we got something wrong/i })).not.toBeInTheDocument();
  });

  it('TC-R16-D2-31: on a non-rejected verdict, neither the wording nor the omission changes — both correction controls still render with their usual text', () => {
    render(
      <VerdictDisplay
        verdict={makeVerdict({ status: 'approved_with_controls', explanation: { tier_rationale: null, track_rationale: null, hard_lines_checked: 5, invariants_checked: 20, tripped_invariants: [], binding_reason: null, binding_regulatory_basis: null } })}
        auditEvents={[]}
        policy={makePolicy()}
        onCorrect={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /^think we got something wrong/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^correct this classification\?$/i })).toBeInTheDocument();
  });

  it('TC-R16-D2-32: the contributing-assumptions line appears only when one of the case\'s assumptions meets the binding rule\'s condition, joined "a, b and c", with the pointer clause when other assumptions exist', () => {
    const policy = makePolicy({
      hard_lines: [{ id: 'HL-002', description: 'd', condition: { data_zone: { not_in: ['Zone C'] } }, reason: 'r', regulatory_basis: 'rb' }],
    });
    const contributing = makeAssumption({ questionId: '3platformZone', shortLabel: 'whether your information stays on your firm’s systems', fields: ['data_zone'] });
    const other = makeAssumption({ questionId: '9', shortLabel: 'whether a mistake can be put right', fields: ['output_reversibility'] });
    render(
      <VerdictDisplay verdict={makeVerdict()} auditEvents={[]} policy={policy} onCorrect={vi.fn()} assumptions={[contributing, other]} />,
    );
    const firstScreen = document.querySelector<HTMLElement>('.verdict__first-screen')!;
    expect(
      within(firstScreen).getByText(
        /This is based on answers you weren.t sure about: whether your information stays on your firm.s systems\. If any of them is wrong, change it and check again\./,
      ),
    ).toBeInTheDocument();
    expect(within(firstScreen).getByText(/You weren.t sure about other answers too/)).toBeInTheDocument();
  });

  it('TC-R16-D2-33: no contributing assumption — the line does not render at all, even though the case has assumptions', () => {
    const policy = makePolicy({
      hard_lines: [{ id: 'HL-002', description: 'd', condition: { data_zone: { not_in: ['Zone C'] } }, reason: 'r', regulatory_basis: 'rb' }],
    });
    const nonContributing = makeAssumption({ questionId: '9', shortLabel: 'whether a mistake can be put right', fields: ['output_reversibility'] });
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} policy={policy} onCorrect={vi.fn()} assumptions={[nonContributing]} />);
    const firstScreen = document.querySelector<HTMLElement>('.verdict__first-screen')!;
    expect(within(firstScreen).queryByText(/This is based on answers/)).not.toBeInTheDocument();
  });

  it('TC-R16-D2-34: a pack hard line resolves against the loaded packs, naming the jurisdiction', () => {
    const packs: JurisdictionPack[] = [
      {
        pack_id: 'PACK-UK', version: '1.0', jurisdiction: 'UK', regulator: 'FCA', document: 'd',
        effective_date: '2026-01-01', reviewer_name: 'x', reviewer_role: 'x', sign_off_date: '2026-01-01',
        rules: [
          {
            id: 'SS1-UK-HL-01', title: 't', source: { document: 'd', section: 's', text: 't' },
            effect: { type: 'hard_line', reason: 'r', plain_reason: 'it would decide entirely by itself' },
            condition: { autonomy_level: { gte: 4 } }, basis: 'verbatim',
          },
        ],
      },
    ];
    render(
      <VerdictDisplay
        verdict={makeVerdict({ binding_constraint: 'SS1-UK-HL-01' })}
        auditEvents={[]}
        policy={makePolicy({ jurisdictions: [{ code: 'UK', name: 'United Kingdom', pack_files: [] }] })}
        onCorrect={vi.fn()}
        packs={packs}
      />,
    );
    const firstScreen = document.querySelector<HTMLElement>('.verdict__first-screen')!;
    expect(within(firstScreen).getByText(/it would decide entirely by itself\. It.s one of the rules your firm has adopted for the United Kingdom/)).toBeInTheDocument();
  });

  it('TC-R16-D2-35: an id found nowhere loaded renders the generic fallback, never the bare id, on the first screen', () => {
    render(<VerdictDisplay verdict={makeVerdict({ binding_constraint: 'ID-NOWHERE-LOADED' })} auditEvents={[]} policy={makePolicy()} onCorrect={vi.fn()} />);
    const firstScreen = document.querySelector<HTMLElement>('.verdict__first-screen')!;
    expect(within(firstScreen).getByText(/one of your firm.s rules rules this out/)).toBeInTheDocument();
    expect(firstScreen.textContent).not.toMatch(/ID-NOWHERE-LOADED/);
    // No "what would change" line for this kind — nothing honest to say.
    expect(within(firstScreen).queryByText(/What would change the answer:/)).not.toBeInTheDocument();
  });

  it('TC-R16-D2-36 (DR7-34): the "already in place" note names the platform this case uses, once, never doubled', () => {
    const policy = makePolicy({
      status: undefined,
      controls: [
        {
          id: 'CTRL-ENC-01', name: 'Encryption in transit', description: 'd', resolves: [], burden: 1, verification: 'v',
          plain_action: 'Platform encrypts in transit',
          verification_evidence: { status: 'verified', detail: 'd', applies_to: { platforms: ['PLAT-X'] } },
        },
      ],
      platforms: [{ id: 'PLAT-X', name: 'raw', approved_envelope: {}, satisfies_controls: [], plain_name: 'Firm Platform' }],
    } as Partial<PolicyFile>);
    const graph = {
      id: 'g', version: 1, input_nodes: [],
      processing_nodes: [{ id: 'p1', label: 'x', model_type: 'llm' as const, autonomy_level: 1 as const, data_zone: 'Zone B' as const, vendor: 'internal', platform: 'PLAT-X', replaces_prior_model: false }],
      output_nodes: [{ id: 'o1', label: 'x', action_type: 'draft' as const, exposure: 'internal-only' as const, decision_bindingness: 'advisory' as const, output_reversibility: 'reversible' as const, scale: 'limited' as const }],
      edges: [], jurisdictions: [], intake_method: 'structured_form' as const, extracted_at: '2026-01-01T00:00:00.000Z',
    };
    render(
      <VerdictDisplay
        verdict={makeVerdict({ status: 'approved_with_controls', controls: ['CTRL-ENC-01'], explanation: { tier_rationale: null, track_rationale: null, hard_lines_checked: 1, invariants_checked: 1, tripped_invariants: [], binding_reason: null, binding_regulatory_basis: null } })}
        auditEvents={[]}
        policy={policy}
        graph={graph}
        onCorrect={vi.fn()}
      />,
    );
    const firstScreen = document.querySelector<HTMLElement>('.verdict__first-screen')!;
    const note = within(firstScreen).getByText(/Already in place:/);
    expect(note.textContent).toMatch(/your firm.s records show this for Firm Platform\)/);
    // Never doubled: the parenthetical appears exactly once in the note.
    expect(note.textContent?.match(/records show this/g)).toHaveLength(1);
  });
});

describe('VerdictDisplay — R16-D2 §2 item 7: the reviewer section lists every assumption', () => {
  it('TC-R16-D2-37: every assumption the case has renders in the reviewer section, contributing or not, for a REJECTED verdict', () => {
    const policy = makePolicy({ hard_lines: [{ id: 'HL-002', description: 'd', condition: { data_zone: { not_in: ['Zone C'] } }, reason: 'r', regulatory_basis: 'rb' }] });
    const contributing = makeAssumption({ questionId: '3platformZone' });
    const other = makeAssumption({ questionId: '9', question: 'Can the mistake be caught?', shortLabel: 'whether a mistake can be put right', assumption: 'it can’t be undone', fields: ['output_reversibility'] });
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} policy={policy} onCorrect={vi.fn()} assumptions={[contributing, other]} reasoningDefaultOpen />);
    expect(screen.getByText('Answers the submitter wasn’t sure about')).toBeInTheDocument();
    expect(screen.getByText(/Can the mistake be caught\?/)).toBeInTheDocument();
    expect(screen.getByText(/Does your information stay on your firm’s own systems the whole time\?/)).toBeInTheDocument();
  });

  it('TC-R16-D2-38: the list also renders for a NON-rejected verdict with assumptions — this is a case fact, not "No"-specific', () => {
    render(
      <VerdictDisplay
        verdict={makeVerdict({ status: 'approved_with_controls', controls: [], explanation: { tier_rationale: null, track_rationale: null, hard_lines_checked: 1, invariants_checked: 1, tripped_invariants: [], binding_reason: null, binding_regulatory_basis: null } })}
        auditEvents={[]}
        policy={makePolicy()}
        onCorrect={vi.fn()}
        assumptions={[makeAssumption()]}
        reasoningDefaultOpen
      />,
    );
    expect(screen.getByText('Answers the submitter wasn’t sure about')).toBeInTheDocument();
  });

  it('TC-R16-D2-39: no assumptions at all — the fold does not render', () => {
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} policy={makePolicy()} onCorrect={vi.fn()} reasoningDefaultOpen />);
    expect(screen.queryByText('Answers the submitter wasn’t sure about')).not.toBeInTheDocument();
  });
});
