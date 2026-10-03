import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContradictionReview from '../ContradictionReview';
import type { Contradiction } from '../../engine/types';

// R16-E §6 (D-105, DR7-30/F1B-3). Plain words, no quotation marks, no claim
// to quote the person, and no field code or label on the screen.

const CONTRADICTIONS: Contradiction[] = [
  {
    statement1: 'Your description says no personal information is involved.',
    statement2: 'but your answers say it uses information about people.',
    field: 'data_class',
  },
];

describe('ContradictionReview — plain words, no quoting framing (R16-E §6, D-105)', () => {
  it('TC-R16-E-60: the heading reads "Your description and your answers don\'t match"', () => {
    render(<ContradictionReview contradictions={CONTRADICTIONS} onResolve={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /your description and your answers don.t match/i })).toBeInTheDocument();
  });

  it('TC-R16-E-61: both statements render as independent sentences — no "You said" / "but also" quoting wrapper', () => {
    render(<ContradictionReview contradictions={CONTRADICTIONS} onResolve={vi.fn()} />);
    expect(screen.getByText('Your description says no personal information is involved.')).toBeInTheDocument();
    expect(screen.getByText('but your answers say it uses information about people.')).toBeInTheDocument();
    expect(screen.queryByText(/you said/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/but also/i)).not.toBeInTheDocument();
  });

  it('TC-R16-E-62: no field code or label renders anywhere on the screen', () => {
    const { container } = render(<ContradictionReview contradictions={CONTRADICTIONS} onResolve={vi.fn()} />);
    expect(container.textContent).not.toMatch(/\bdata_class\b/);
    expect(container.querySelector('code')).toBeNull();
  });

  it('TC-R16-E-63: the field label reads "Which is right, and why?" and the button reads "Continue"', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    render(<ContradictionReview contradictions={CONTRADICTIONS} onResolve={onResolve} />);
    const field = screen.getByLabelText(/which is right, and why\?/i);
    await user.type(field, 'The form is right.');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(onResolve).toHaveBeenCalledWith('The form is right.');
  });
});

// §8's guard test for this screen: the full banned-word list, not just the
// field-code check above.
describe('ContradictionReview — guard: no engine vocabulary reaches this screen (§8)', () => {
  it('TC-R16-E-62b: renders with none of the banned words, for either signal pair', () => {
    const BANNED = /\bZone A\b|\bZone B\b|\bZone C\b|\bdata_class\b|\bDATA_ZONE\b|\bautonomy\b|\bLLM\b|\bHITL\b|\bbinding\b|\bgraph\b|\bextract\w*|model proposed|\bguess(?:ed|ing)\b|local model|\bunregistered\b|parse-error|no-key/i;
    const both: Contradiction[] = [
      ...CONTRADICTIONS,
      {
        statement1: 'Your description says a person approves everything it does.',
        statement2: 'but your answers say it acts by itself.',
        field: 'autonomy_level',
      },
    ];
    const { container } = render(<ContradictionReview contradictions={both} onResolve={vi.fn()} />);
    expect(container.textContent).not.toMatch(BANNED);
  });
});
