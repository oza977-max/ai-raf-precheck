import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import VerdictDisplay from '../VerdictDisplay';
import type { Verdict } from '../../types/verdict';

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
    policy_version: '1.0',
    pack_versions: {},
    applied_overrides: [],
    confidence_caveats: [],
    boundary_proximity: false,
    explanation: {
      tier_rationale: null,
      track_rationale: null,
      hard_lines_checked: 0,
      invariants_checked: 0,
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
  };
}

describe('VerdictDisplay', () => {
  it('TC-VD-1-01: verdict status is visible above the fold as an h2', () => {
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} onCorrect={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /approved with controls/i })).toBeInTheDocument();
  });

  it('TC-VD-2-01: binding constraint renders as <code> with the graph path shown', () => {
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} onCorrect={vi.fn()} />);
    expect(screen.getByText('INV-DATA-01').tagName).toBe('CODE');
    expect(screen.getByText(/client notes → drafting model → drafted email/)).toBeInTheDocument();
  });

  it('TC-RA-11-01: a Medium confidence caveat renders inline, verdict stays non-provisional', () => {
    const verdict = makeVerdict({
      confidence_caveats: [
        { ruleId: 'PE-JUR-EU-2', field: 'jurisdiction', reason: 'Interpretive judgment required.', confidence: 'medium' },
      ],
    });
    render(<VerdictDisplay verdict={verdict} auditEvents={[]} onCorrect={vi.fn()} />);
    expect(screen.getByText(/interpretive judgment required/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /approved with controls/i })).toBeInTheDocument();
    expect(screen.queryByText(/provisional/i)).not.toBeInTheDocument();
  });

  it('TC-RA-11-02: a Low confidence caveat shows "Provisional — legal review required" as a full-page warning', () => {
    const verdict = makeVerdict({
      confidence_caveats: [
        { ruleId: 'HL-003', field: 'decision_type', reason: 'Ambiguous regulatory text.', confidence: 'low' },
      ],
    });
    render(<VerdictDisplay verdict={verdict} auditEvents={[]} onCorrect={vi.fn()} />);
    expect(screen.getByText(/provisional — legal review required/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /provisional/i })).toBeInTheDocument();
    // The verdict body is still visible, not hidden, just clearly marked.
    expect(screen.getByText('INV-DATA-01')).toBeInTheDocument();
  });

  it('High confidence caveats are not shown (no caveat needed)', () => {
    const verdict = makeVerdict({
      confidence_caveats: [{ ruleId: 'HL-001', field: 'autonomy_level', reason: 'n/a', confidence: 'high' }],
    });
    render(<VerdictDisplay verdict={verdict} auditEvents={[]} onCorrect={vi.fn()} />);
    expect(screen.queryByText(/n\/a/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/provisional/i)).not.toBeInTheDocument();
  });

  it('clicking "Correct this classification?" calls onCorrect', async () => {
    const onCorrect = vi.fn();
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} onCorrect={onCorrect} />);
    await user.click(screen.getByRole('button', { name: /correct this classification/i }));
    expect(onCorrect).toHaveBeenCalledTimes(1);
  });

  it('shows the exact §7 fallback message when no LLM trace and no policy-based structured summary is available', () => {
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} onCorrect={vi.fn()} />);
    expect(
      screen.getByText(/reasoning trace unavailable — configure an anthropic api key/i),
    ).toBeInTheDocument();
  });

  it('renders the LLM-generated reasoning trace from the matching audit event when present', () => {
    const verdict = makeVerdict();
    const auditEvents = [
      {
        event_id: 'e1',
        use_case_id: 'uc-1',
        event_type: 'verdict_produced' as const,
        occurred_at: '2026-01-01T00:00:00.000Z',
        actor: 'system',
        payload: { type: 'verdict_produced' as const, verdict, reasoning_trace: 'Track II per SS1/23 §3.4.' },
      },
    ];
    render(<VerdictDisplay verdict={verdict} auditEvents={auditEvents} onCorrect={vi.fn()} />);
    expect(screen.getByText(/track ii per ss1\/23 §3\.4/i)).toBeInTheDocument();
  });
});

describe('VerdictDisplay — why this verdict (V1.1-C01)', () => {
  it('a hard-line rejection shows the rule reason and its regulatory citation', () => {
    const verdict = makeVerdict({
      status: 'rejected',
      binding_constraint: 'HL-002',
      explanation: {
        tier_rationale: null,
        track_rationale: null,
        hard_lines_checked: 5,
        invariants_checked: 0,
        tripped_invariants: [],
        binding_reason: 'MNPI outside Zone C violates market abuse prevention requirements.',
        binding_regulatory_basis: 'MAR Article 8; MiFID II',
      },
    });
    render(<VerdictDisplay verdict={verdict} auditEvents={[]} onCorrect={vi.fn()} />);

    expect(screen.getByText(/market abuse prevention requirements/i)).toBeInTheDocument();
    expect(screen.getByText('MAR Article 8; MiFID II')).toBeInTheDocument();
    expect(screen.getByText(/ceiling values/i)).toBeInTheDocument();
    expect(screen.getByText(/evaluation stopped there/i)).toBeInTheDocument();
  });

  it('a clean Approved verdict explains tier/track assignment with citations and reports what was checked', () => {
    const verdict = makeVerdict({
      status: 'approved',
      binding_constraint: '',
      controls: [],
      explanation: {
        tier_rationale: { rule_id: 'TIER-MEDIUM', matched_field: 'exposure' },
        track_rationale: { rule_id: 'TRACK-II', rule_name: 'Track II — AI on MRM', regulatory_basis: 'SS1/23 §3.4' },
        hard_lines_checked: 5,
        invariants_checked: 2,
        tripped_invariants: [],
        binding_reason: null,
        binding_regulatory_basis: null,
      },
    });
    render(<VerdictDisplay verdict={verdict} auditEvents={[]} onCorrect={vi.fn()} />);

    expect(screen.getByText('TIER-MEDIUM')).toBeInTheDocument();
    expect(screen.getByText('exposure')).toBeInTheDocument();
    expect(screen.getByText('SS1/23 §3.4')).toBeInTheDocument();
    expect(screen.getByText(/evaluated against 5 hard lines and 2 invariants/i)).toBeInTheDocument();
    expect(screen.getByText(/none triggered/i)).toBeInTheDocument();
  });

  it('tripped invariants render with description, severity, citation, and required controls', () => {
    const verdict = makeVerdict({
      explanation: {
        tier_rationale: { rule_id: 'TIER-HIGH', matched_field: 'data_class' },
        track_rationale: { rule_id: 'TRACK-I', rule_name: 'Track I' },
        hard_lines_checked: 5,
        invariants_checked: 2,
        tripped_invariants: [
          {
            id: 'INV-DATA-01',
            description: 'Client PII must not flow to an external model endpoint without encryption in transit',
            severity: 'High',
            regulatory_basis: 'GDPR Art. 32(1)(a)',
            required_controls: ['CTRL-ENC-01'],
            graph_path: 'a → b',
          },
        ],
        binding_reason: null,
        binding_regulatory_basis: 'GDPR Art. 32(1)(a)',
      },
    });
    render(<VerdictDisplay verdict={verdict} auditEvents={[]} onCorrect={vi.fn()} />);

    expect(screen.getByText(/without encryption in transit/i)).toBeInTheDocument();
    expect(screen.getByText('High', { selector: '.verdict__severity' })).toBeInTheDocument();
    expect(screen.getAllByText('GDPR Art. 32(1)(a)').length).toBeGreaterThan(0);
    expect(screen.getByText(/requires: CTRL-ENC-01/i)).toBeInTheDocument();
    expect(screen.getByText(/1 triggered/i)).toBeInTheDocument();
  });

  it('BC-V11C01-04: a pre-V1.1 verdict without explanation renders without crashing (no why section)', () => {
    const legacy = { ...makeVerdict(), explanation: undefined } as unknown as Parameters<typeof VerdictDisplay>[0]['verdict'];
    render(<VerdictDisplay verdict={legacy} auditEvents={[]} onCorrect={vi.fn()} />);
    expect(screen.getByText('Verdict', { selector: '.verdict__eyebrow' })).toBeInTheDocument();
    expect(screen.queryByText(/why this verdict/i)).not.toBeInTheDocument();
  });
});
