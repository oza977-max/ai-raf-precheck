import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VerdictDisplay, { classifyProvisionalReason } from '../VerdictDisplay';
import type { Verdict } from '../../types/verdict';
import type { ProvisionalReason } from '../../engine/provisional';

// R12-ST-1/R12-BD-2/R12-BD-3/R12-MISC-1. Same minimal-verdict factory
// pattern as RegisterDetail.dissent.test.tsx — only the fields these tests
// actually exercise vary between cases.
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
    policy_version: '1.3',
    pack_versions: {},
    applied_overrides: [],
    confidence_caveats: [],
    provisional_reasons: [],
    boundary_proximity: false,
    margin_achieved: 0,
    margin_target: 0.1,
    single_covered_invariants: [],
    explanation: {
      tier_rationale: { rule_id: 'TIER-PII-01', rule_name: 'Personal data forces High tier' },
      track_rationale: null,
      hard_lines_checked: 4,
      invariants_checked: 6,
      tripped_invariants: [],
      binding_reason: null,
      binding_regulatory_basis: null,
      regulatory_chain: [],
    },
    id: 'v-r12-1',
    use_case_id: 'uc-r12-1',
    living_status: 'approved',
    living_status_updated_at: '2026-01-01T00:00:00.000Z',
    attested_by: '1LoD',
    attested_at: '2026-01-01T00:00:00.000Z',
    graph_version: 1,
    corrections: [],
    ...overrides,
  };
}

describe('R12-ST-1 — staleness marker', () => {
  it('TC-R12-ST-1-01: renders an undismissable alert when stale_sources is present, naming the pack', () => {
    render(
      <VerdictDisplay
        verdict={makeVerdict({
          stale_sources: [{ pack_id: 'UK-SS1-23', retrieved_date: '2026-01-01', max_staleness_days: 90, days_overdue: 15 }],
        })}
        auditEvents={[]}
      />,
    );
    const alert = document.querySelector('.verdict__stale-banner[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert).toHaveTextContent(/UK-SS1-23/);
    expect(alert).toHaveTextContent(/15/);
  });

  it('TC-R12-ST-1-02: absent when stale_sources is empty or missing', () => {
    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} />);
    expect(screen.queryByText(/Review overdue/i)).not.toBeInTheDocument();
  });
});

describe('R12-BD-2 — derived-basis salience', () => {
  it('TC-R12-BD-2-01: a derived-basis regulatory-chain entry states the regulator has not confirmed the reading', () => {
    render(
      <VerdictDisplay
        verdict={makeVerdict({
          explanation: {
            tier_rationale: null,
            track_rationale: null,
            hard_lines_checked: 1,
            invariants_checked: 1,
            tripped_invariants: [],
            binding_reason: null,
            binding_regulatory_basis: null,
            regulatory_chain: [
              {
                rule_id: 'PACK-01',
                document: 'SS1/23',
                section: '3.4',
                source_text: 'quoted text',
                basis: 'derived',
                derived: 'a derived reading',
                sign_off: 'Legal — pending firm adoption',
              },
            ],
          },
        })}
        auditEvents={[]}
      />,
    );
    expect(screen.getByText(/has not confirmed this reading/i)).toBeInTheDocument();
  });
});

describe('R12-BD-3 — provisional cause families', () => {
  it('classifyProvisionalReason groups causes correctly', () => {
    expect(classifyProvisionalReason('unsigned_pack_rules' as ProvisionalReason)).toBe('signoff_gap');
    expect(classifyProvisionalReason('no_regulatory_basis' as ProvisionalReason)).toBe('substantive');
    expect(classifyProvisionalReason('unclassified_decision_type' as ProvisionalReason)).toBe('substantive');
  });

  it('TC-R12-BD-3-01: the banner groups causes under the two headings', () => {
    render(
      <VerdictDisplay
        verdict={makeVerdict({
          provisional_reasons: ['unsigned_pack_rules', 'no_regulatory_basis'],
          confidence_caveats: [{ ruleId: 'PACK-01', field: 'PACK-01', reason: 'unadopted', confidence: 'low' }],
        })}
        auditEvents={[]}
      />,
    );
    expect(screen.getByText(/Sign-off gaps — paperwork that would close these/)).toBeInTheDocument();
    expect(screen.getByText(/Substantive caveats — real open questions/)).toBeInTheDocument();
  });
});

describe('R12-MISC-1 — memo hash', () => {
  it('TC-R12-MISC-1-01: the downloaded memo carries a policy content hash', async () => {
    const user = userEvent.setup();
    let capturedBlob: Blob | null = null;
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:mock';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();

    render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} />);
    await user.click(screen.getByRole('button', { name: /download effective-challenge memo/i }));

    // The handler awaits crypto.subtle.digest before creating the blob —
    // assert after it lands, not synchronously after the click (this was a
    // 1-in-3 flake, caught by the 3x ritual on 2026-08-18).
    await waitFor(() => expect(capturedBlob).not.toBeNull());
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(capturedBlob as unknown as Blob);
    });
    expect(text).toMatch(/Policy content hash: [0-9a-f]{64}/);

    URL.createObjectURL = originalCreate;
  });
});
