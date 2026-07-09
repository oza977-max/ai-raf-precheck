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

  it('falls back to a structured summary in the reasoning-trace details when no LLM trace is available (P5-C02 not built yet)', () => {
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} onCorrect={vi.fn()} />);
    expect(screen.getByText(/no reasoning trace available/i)).toBeInTheDocument();
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
