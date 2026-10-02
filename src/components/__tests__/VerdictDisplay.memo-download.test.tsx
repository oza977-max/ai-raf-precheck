import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VerdictDisplay from '../VerdictDisplay';
import * as challengeMemoModule from '../challenge-memo';
import type { Verdict } from '../../types/verdict';

// code-review-005, R3-3 (round 3) — second half. downloadMemo() is wired to
// its button as `onClick={() => void downloadMemo()}`, a void-ed promise: a
// throw anywhere inside it (buildChallengeMemo on a verdict missing
// `explanation` was the reproducing case this file's sibling,
// challenge-memo.test.ts's TC-RG-8-47, fixes at the source — this proves the
// OTHER half, that the button path itself no longer fails silently if memo
// generation throws for any reason) used to vanish: nothing downloaded,
// nothing shown, no error anywhere a user could see.
//
// vi.spyOn on the sibling module's own named export — not vi.mock — the same
// pattern src/store/handoff.test.ts and RegisterView.handoff.test.tsx already
// rely on to inject one failure into a function the component under test
// imports directly, without touching that module's source.

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
      tripped_invariants: [],
      binding_reason: null,
      binding_regulatory_basis: null,
    },
    id: 'verdict-memo-dl-1',
    use_case_id: 'uc-memo-dl-1',
    living_status: 'approved',
    living_status_updated_at: '2026-01-01T00:00:00.000Z',
    attested_by: '1LoD',
    attested_at: '2026-01-01T00:00:00.000Z',
    graph_version: 1,
    corrections: [],
    ...overrides,
  };
}

describe('VerdictDisplay memo download — visible error on failure (code-review-005, R3-3)', () => {
  it('TC-RG-8-48: clicking "Download effective-challenge memo" shows a visible error instead of failing silently when memo generation throws', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(challengeMemoModule, 'buildChallengeMemo').mockImplementationOnce(() => {
      throw new Error('simulated memo generation failure');
    });
    try {
      render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} />);

      await user.click(screen.getByRole('button', { name: /download effective-challenge memo/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't generate the memo/i);
    } finally {
      spy.mockRestore();
    }
  });

  it('TC-RG-8-48b: a later successful download clears the earlier error', async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(challengeMemoModule, 'buildChallengeMemo')
      .mockImplementationOnce(() => {
        throw new Error('simulated memo generation failure');
      });
    // jsdom has no real URL.createObjectURL — mocked the same way
    // RegisterView.handoff.test.tsx's download tests do, so the RETRY
    // click's real (successful) buildChallengeMemo call can reach the end
    // of downloadMemo without tripping over an unrelated jsdom gap.
    const OriginalBlob = globalThis.Blob;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    globalThis.Blob = class MockBlob {
      constructor() {
        /* no-op — content not inspected in this test */
      }
    } as unknown as typeof Blob;
    URL.createObjectURL = (() => 'blob:mock-url') as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
    try {
      render(<VerdictDisplay verdict={makeVerdict()} auditEvents={[]} />);
      const button = screen.getByRole('button', { name: /download effective-challenge memo/i });

      await user.click(button);
      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't generate the memo/i);

      // The mocked failure only fires once — this click calls through to
      // the real buildChallengeMemo and succeeds.
      await user.click(button);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      spy.mockRestore();
      globalThis.Blob = OriginalBlob;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });
});
