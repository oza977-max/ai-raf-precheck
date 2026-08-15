import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App from '../../App';

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn() };
  },
}));

// The live link drops visitors into "New pre-check" with zero context —
// repo readers get a README and diagrams, app visitors got nothing
// (2026-08-15 review: the majority audience had the least orientation).
describe('About — the app explains itself', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('offers About in the sidebar, and it answers the three first questions', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText(/about/i));
    // What is it, who wrote the rules, is an AI deciding.
    expect(screen.getAllByText(/risk appetite/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/no AI (is )?in(volved in)? the decision/i).length).toBeGreaterThan(0);
    // 'board-approved' would itself contain the reserved substring — the
    // copy says 'signed off at board level' for exactly that reason.
    expect(screen.getByText(/board level/i)).toBeInTheDocument();
    // The fastest explainer the product has: it judged itself.
    expect(screen.getByText(/assessed itself|its own gate|submitted itself/i)).toBeInTheDocument();
  });

  it('shows a first-visit pointer on the intake screen, dismissible for good', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    expect(screen.getByText(/first time here/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /got it/i }));
    expect(screen.queryByText(/first time here/i)).toBeNull();
    first.unmount();
    // A fresh mount — the dismissal must persist, or every visit nags.
    render(<App />);
    expect(screen.queryByText(/first time here/i)).toBeNull();
  });

  it('the new copy never uses the two reserved verdict words', async () => {
    // BC-V12B-03: the acceptance suite holds a single-match /approved|rejected/i
    // guard. This session has walked into it three times; this pins the
    // About surfaces out of the blast radius permanently.
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText(/first time here/i).closest('.app-welcome')?.textContent).not.toMatch(/approved|rejected/i);
    await user.click(screen.getByText(/about/i));
    const main = document.querySelector('.app-main');
    expect(main?.textContent).not.toMatch(/approved|rejected/i);
  });
});
