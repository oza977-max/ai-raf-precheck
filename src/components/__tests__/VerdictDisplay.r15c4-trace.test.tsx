import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VerdictDisplay from '../VerdictDisplay';
import type { Verdict } from '../../types/verdict';

// Local fixture, deliberately duplicated rather than imported from
// VerdictDisplay.test.tsx — that file (and VerdictDisplay.r15c2.test.tsx)
// is owned by another chunk's agent in this build round, and this repo's
// existing convention is already one local makeVerdict() per test file
// (see VerdictDisplay.r12.test.tsx, RegisterView.r12.test.tsx, etc.).
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

// R15-C2 added this sign-off checklist line (verdict-audit.md §5); R15-C4
// touched only the HEADER fidelity chip in App.tsx, leaving this line
// untouched — confirmed by diff per test-cases-015.md's TC-R15-C4-07 row.
// No automated test named this exact line before this chunk, so it is
// written fresh here rather than renegotiated from an existing test.
describe('VerdictDisplay — sign-off checklist rulebook-translation line (TC-R15-C4-07)', () => {
  it('TC-R15-C4-07: the "Rulebook translation: unattested" checklist line renders verbatim when a verdict carries the unsigned_pack_rules provisional reason', () => {
    render(
      <VerdictDisplay
        verdict={makeVerdict({ provisional_reasons: ['unsigned_pack_rules'] })}
        auditEvents={[]}
        showSignOffChecklist
      />,
    );
    expect(
      screen.getByText(
        'Rulebook translation: unattested — the jurisdiction pack rules used here are proposed readings your firm has not yet adopted.',
      ),
    ).toBeInTheDocument();
  });
});
