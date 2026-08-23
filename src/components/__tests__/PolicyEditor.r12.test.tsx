import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PolicyEditor from '../PolicyEditor';

// R12-ST-2: the pack list shows each pack's age and an overdue state,
// styled like the existing invalid-pack state.
describe('R12-ST-2 — pack age on the Appetite framework screen', () => {
  it('TC-R12-ST-2-01: a real loaded pack shows retrieved-N-days-ago / review-window text', () => {
    render(<PolicyEditor />);
    expect(screen.getAllByText(/retrieved \d+ days? ago · review window \d+ days/i).length).toBeGreaterThan(0);
  });

  it('TC-R12-ST-2-02: an overdue pack renders the overdue state', async () => {
    vi.resetModules();
    vi.doMock('../../store/packs', async () => {
      const actual = await vi.importActual<typeof import('../../store/packs')>('../../store/packs');
      return {
        ...actual,
        loadPacks: () => ({
          packs: [
            {
              pack_id: 'TEST-PACK',
              version: '1.0',
              jurisdiction: 'UK',
              regulator: 'Test regulator',
              document: 'Test doc',
              effective_date: '2026-01-01',
              reviewer_name: 'Reviewer',
              reviewer_role: 'Role',
              sign_off_date: '2026-01-01',
              rules: [],
              retrieved_date: '2020-01-01',
              max_staleness_days: 30,
            },
          ],
          errors: [],
        }),
      };
    });
    const { default: FreshPolicyEditor } = await import('../PolicyEditor');
    render(<FreshPolicyEditor />);
    expect(screen.getAllByText(/review overdue/i).length).toBeGreaterThan(0);
    vi.doUnmock('../../store/packs');
    vi.resetModules();
  });
});
