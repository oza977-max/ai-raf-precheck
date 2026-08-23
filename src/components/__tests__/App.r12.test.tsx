import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';

// R12-AD-2: the 1LoD role's sidebar hides the reviewer-only "Rule
// challenges" surface. 2LoD keeps seeing everything unchanged.
describe('App — 1LoD nav surface (R12-AD-2)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('TC-R12-AD-2-01: 1LoD does not see "Rule challenges" in the sidebar', () => {
    render(<App />);
    expect(screen.queryByText(/rule challenges/i)).not.toBeInTheDocument();
  });

  it('TC-R12-AD-2-02: 2LoD sees "Rule challenges" in the sidebar', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText(/role/i), '2LoD');
    expect(screen.getByText(/rule challenges/i)).toBeInTheDocument();
  });

  it('TC-R12-AD-2-03: switching from 2LoD to 1LoD while on the rule-queue view falls back to intake', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText(/role/i), '2LoD');
    await user.click(screen.getByText(/rule challenges/i));
    expect(await screen.findByText(/rule-improvement queue/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/role/i), '1LoD');
    expect(screen.queryByText(/rule-improvement queue/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rule challenges/i)).not.toBeInTheDocument();
  });
});
