import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import VerdictDisplay from '../VerdictDisplay';
import type { Verdict } from '../../types/verdict';
import type { PolicyFile } from '../../engine/types';

// Round 10 — speaking the reviewer's language (requirements-010.md,
// verdict-audit.md §15). R10-IR labels, R10-CE two-axis chips, R10-CM
// export affordance. R10-NF-1: none of this changes a decision.

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
      hard_lines_checked: 0,
      invariants_checked: 1,
      tripped_invariants: [
        {
          id: 'INV-DATA-01',
          description: 'Client PII must not leave the firm zone without encryption controls',
          severity: 'HIGH',
          regulatory_basis: 'RAF §4.2',
          graph_path: 'client notes → drafting model → drafted email',
          required_controls: ['CTRL-ENC-01'],
        },
      ],
      binding_reason: null,
      binding_regulatory_basis: null,
    },
    id: 'verdict-1',
    use_case_id: 'uc-r10-1',
    living_status: 'approved',
    living_status_updated_at: '2026-01-01T00:00:00.000Z',
    attested_by: '1LoD',
    attested_at: '2026-01-01T00:00:00.000Z',
    graph_version: 1,
    corrections: [],
    ...overrides,
  };
}

function makePolicy(evidence?: NonNullable<PolicyFile['controls'][number]['verification_evidence']>): PolicyFile {
  return {
    version: '1.0',
    hard_lines: [],
    tier_rules: [],
    track_rules: [],
    invariants: [],
    controls: [
      {
        id: 'CTRL-ENC-01',
        name: 'Encryption in transit',
        description: 'TLS 1.3 pinned',
        resolves: ['INV-DATA-01'],
        burden: 2,
        verification: 'Platform attestation',
        verification_evidence: evidence,
      },
    ],
    jurisdictions: [],
  } as unknown as PolicyFile;
}

describe('R10-IR — inherent/residual labels', () => {
  it('TC-R10-IR-1-01: tripped invariants are framed as the inherent position, controls as the residual position', () => {
    render(
      <VerdictDisplay verdict={makeVerdict()} auditEvents={[]} policy={makePolicy()} onCorrect={vi.fn()} />,
    );
    expect(screen.getByText(/the inherent position — the risk before any controls/i)).toBeInTheDocument();
    expect(screen.getByText(/the residual position — where the risk lands once these controls are in place/i)).toBeInTheDocument();
  });
});

describe('R10-CE — two-axis effectiveness chips', () => {
  it('TC-R10-CE-1-01: legacy single-status evidence renders exactly as before — no axis chips', () => {
    const { container } = render(
      <VerdictDisplay
        verdict={makeVerdict()}
        auditEvents={[]}
        policy={makePolicy({ status: 'verified', detail: 'attestation on file' })}
        onCorrect={vi.fn()}
      />,
    );
    expect(screen.getByText('VERIFIED')).toBeInTheDocument();
    expect(container.querySelector('.verdict__axischip')).toBeNull();
  });

  it('TC-R10-CE-1-02: evidence carrying both axes renders both chips with plain wording', () => {
    render(
      <VerdictDisplay
        verdict={makeVerdict()}
        auditEvents={[]}
        policy={makePolicy({
          status: 'verified',
          design: { status: 'effective' },
          operating: { status: 'not_assessed' },
        })}
        onCorrect={vi.fn()}
      />,
    );
    expect(screen.getByText(/design:\s*effective/i)).toBeInTheDocument();
    expect(screen.getByText(/operating:\s*not assessed/i)).toBeInTheDocument();
  });
});

describe('R10-CM — memo export affordance', () => {
  it('TC-R10-CM-2-01: the download control and its restates-the-record posture render with any verdict', () => {
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} onCorrect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /download effective-challenge memo/i })).toBeInTheDocument();
    expect(screen.getByText(/it restates the record; it does not strengthen it/i)).toBeInTheDocument();
  });
});
