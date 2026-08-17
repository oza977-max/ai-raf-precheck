import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SimilarCases from '../SimilarCases';
import type { EnrichedPrecedent } from '../SimilarCases';

// R8-SC-1/-2 (requirements-008). The reserved-words check is load-bearing:
// this panel renders ON THE INTAKE PATH, where the suite holds a
// single-match /approved|rejected/i guard.
const match = (over: Partial<EnrichedPrecedent> = {}): EnrichedPrecedent => ({
  id: 'p1', label: 'Deals drafting assistant', description: 'drafts deal memos',
  status: 'approved_with_controls', tier: 'High', track: 'II',
  decided_at: '2026-01-05T00:00:00.000Z', policy_version: '1.3',
  score: 0.5, controls: ['CTRL-ENC-01'],
  ...over,
});

describe('SimilarCases', () => {
  it('TC-R8-SC-1-01: renders outcome in appetite vocabulary with tier, controls and policy version', () => {
    render(<SimilarCases matches={[match()]} />);
    expect(screen.getByText('inside appetite with controls')).toBeInTheDocument();
    expect(screen.getByText(/tier high · track ii · decided under policy v1\.3/i)).toBeInTheDocument();
    expect(screen.getByText(/Controls required: CTRL-ENC-01/)).toBeInTheDocument();
  });

  it('TC-R8-NF-1-01: never renders /approved|rejected/i, for any status', () => {
    const { container } = render(
      <SimilarCases
        matches={[match({ id: 'x', status: 'approved' }), match({ id: 'y', status: 'rejected' })]}
      />,
    );
    expect(container.textContent).not.toMatch(/approved|rejected/i);
    expect(screen.getByText('inside appetite')).toBeInTheDocument();
    expect(screen.getByText('outside appetite')).toBeInTheDocument();
  });

  it('TC-R8-SC-2-01: states the advisory posture; renders nothing with no matches', () => {
    const empty = render(<SimilarCases matches={[]} />);
    expect(empty.container.firstChild).toBeNull();
    empty.unmount();
    render(<SimilarCases matches={[match()]} />);
    expect(screen.getByText(/precedent informs, the rules decide/i)).toBeInTheDocument();
  });
});
