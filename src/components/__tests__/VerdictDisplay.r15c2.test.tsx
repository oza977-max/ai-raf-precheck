import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VerdictDisplay from '../VerdictDisplay';
import type { Verdict } from '../../types/verdict';

// R15-C2 (requirements-015.md; proposal §3.1). This chunk FINISHES R14's
// partial R9-idiom pass on the verdict/sign-off screen (skeptic amendment
// S1) — it does not claim the screen was untouched before. New coverage:
// the "Before you sign off" checklist, the section nav (with no direct
// Sign-off entry, S2), and the controls "summary-then-detail, Expand all"
// pattern.

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
    provisional_reasons: [],
    boundary_proximity: false,
    margin_achieved: 0,
    margin_target: 0.1,
    single_covered_invariants: [],
    explanation: {
      tier_rationale: null,
      track_rationale: null,
      hard_lines_checked: 5,
      invariants_checked: 2,
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
    ...overrides,
  } as Verdict;
}

describe('VerdictDisplay — R15-C2 sign-off checklist and section nav', () => {
  it('TC-R15-C2-01: does not render the checklist when showSignOffChecklist is not passed', () => {
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} />);
    expect(screen.queryByText(/before you sign off/i)).not.toBeInTheDocument();
  });

  it('TC-R15-C2-02: renders the checklist, with jump links (not checkboxes), when showSignOffChecklist is true', () => {
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} showSignOffChecklist />);
    expect(screen.getByText(/before you sign off/i)).toBeInTheDocument();
    // Jump-link affordance: an <a href="#..."> element, never a checkbox.
    const controlsLink = screen.getByText(/control.*named/i).closest('a');
    expect(controlsLink).toBeInTheDocument();
    expect(controlsLink).toHaveAttribute('href', '#verdict-controls-section');
    expect(document.querySelectorAll('.verdict__signoff-checklist input[type="checkbox"]').length).toBe(0);
  });

  it('TC-R15-C2-03 (S2, Must): the section nav has no direct Sign-off entry', () => {
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} showSignOffChecklist />);
    const nav = document.querySelector('.verdict__section-nav');
    expect(nav).toBeInTheDocument();
    expect(nav?.textContent).not.toMatch(/sign-off/i);
    // The nav does still point at reasoning sections.
    expect(screen.getByRole('link', { name: /why/i })).toHaveAttribute('href', '#verdict-why-section');
  });

  it('TC-R15-C2-04: jurisdiction and translation-fidelity checklist lines appear only when their provisional reason is present', () => {
    render(
      <VerdictDisplay
        verdict={makeVerdict({ provisional_reasons: ['no_regulatory_basis'] })}
        auditEvents={[]}
        showSignOffChecklist
      />,
    );
    expect(screen.getByText(/no country rulebook applied/i)).toBeInTheDocument();
    expect(screen.queryByText(/rulebook translation: unattested/i)).not.toBeInTheDocument();
  });

  it('TC-R15-C2-05: risk-knowledge checklist and nav lines appear only when the caller says that section exists', () => {
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} showSignOffChecklist hasRiskKnowledgeSection />);
    expect(screen.getByRole('link', { name: /risk knowledge/i })).toHaveAttribute('href', '#risk-knowledge-section');
  });

  it('TC-R15-C2-06: "firm rules (invariants)" wording replaces the bare "invariants" stat', () => {
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} />);
    expect(screen.getByText(/2 firm rules \(invariants\)/i)).toBeInTheDocument();
  });
});

describe('VerdictDisplay — R15-C2 controls summary-then-detail', () => {
  it('TC-R15-C2-07: each control renders as a closed disclosure with the status chip on the always-visible summary line', () => {
    render(
      <VerdictDisplay
        verdict={makeVerdict({ controls: ['CTRL-ENC-01'] })}
        auditEvents={[]}
        policy={
          {
            controls: [
              {
                id: 'CTRL-ENC-01',
                name: 'Encryption at rest',
                resolves: [],
                description: 'Encrypts data at rest',
                verification_evidence: { status: 'verified' },
              },
            ],
            hard_lines: [],
            invariants: [],
          } as unknown as Parameters<typeof VerdictDisplay>[0]['policy']
        }
      />,
    );
    const details = document.querySelector('.verdict__todo-item details');
    expect(details).toBeInTheDocument();
    expect(details).not.toHaveAttribute('open');
    // Status chip is on the summary line, always visible regardless of
    // open/closed state (Governance's "items move to addressed, never
    // vanish" clarification).
    expect(details?.querySelector('summary')?.textContent).toMatch(/in place/i);
  });

  it('TC-R15-C2-08: "Expand all" opens every control disclosure at once, programmatically (aria via native <details>)', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(
      <VerdictDisplay
        verdict={makeVerdict({ controls: ['CTRL-ENC-01', 'CTRL-CONDUCT-01'] })}
        auditEvents={[]}
        policy={
          {
            controls: [
              { id: 'CTRL-ENC-01', name: 'Encryption at rest', resolves: [], verification_evidence: { status: 'verified' } },
              { id: 'CTRL-CONDUCT-01', name: 'Conduct testing', resolves: [], verification_evidence: { status: 'unverified' } },
            ],
            hard_lines: [],
            invariants: [],
          } as unknown as Parameters<typeof VerdictDisplay>[0]['policy']
        }
      />,
    );
    const allDetails = document.querySelectorAll('.verdict__todo-item details');
    expect(allDetails.length).toBe(2);
    expect([...allDetails].every((d) => !d.hasAttribute('open'))).toBe(true);

    await user.click(screen.getByRole('button', { name: /expand all/i }));
    expect([...document.querySelectorAll('.verdict__todo-item details')].every((d) => d.hasAttribute('open'))).toBe(
      true,
    );

    await user.click(screen.getByRole('button', { name: /collapse all/i }));
    expect([...document.querySelectorAll('.verdict__todo-item details')].every((d) => !d.hasAttribute('open'))).toBe(
      true,
    );
  });
});
