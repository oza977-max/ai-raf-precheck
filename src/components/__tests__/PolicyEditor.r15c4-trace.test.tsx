import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';

// R15-C4 (proposal §3.4). TC-R15-C4-05: no role prop is read by
// PolicyEditor, and its call site in App.tsx (`<PolicyEditor onSaved=
// {...} />`) is unconditional — confirmed by reading both files. This test
// proves that structural fact behaviourally rather than just by reading the
// source: the Appetite framework screen must show the same readable panels
// and the same closed-by-default YAML-editor disclosure regardless of which
// role the "Viewing as" switcher is set to. Rendered through <App /> (not
// <PolicyEditor /> directly) because the role signal and the switcher live
// in App, matching the pattern App.r15c1.test.tsx uses for role switching.
describe('PolicyEditor — R15-C4 not role-gated (TC-R15-C4-05)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('TC-R15-C4-05: the Appetite framework screen shows the same readable panels and YAML-editor disclosure for 1LoD and 2LoD', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('§ Appetite framework'));

    // Default role is 1LoD (store/role.ts's DEFAULT_ROLE) since localStorage
    // was just cleared.
    expect(await screen.findByText('Jurisdiction packs', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByText(/hard lines — no control set can fix/i)).toBeInTheDocument();
    const disclosureFor1LoD = screen.getByText(/edit the rulebook as yaml/i);
    expect(disclosureFor1LoD).toBeInTheDocument();
    // Closed by default (TC-R15-C4-01 covers the mechanism in detail; here
    // it's confirming the same closed disclosure appears regardless of role).
    expect(disclosureFor1LoD.closest('details')).not.toHaveAttribute('open');

    await user.selectOptions(screen.getByLabelText('Viewing as'), '2LoD');

    // Same screen, same panels, same disclosure — nothing changes on role
    // switch, because PolicyEditor never reads the role at all.
    expect(await screen.findByText('Jurisdiction packs', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByText(/hard lines — no control set can fix/i)).toBeInTheDocument();
    const disclosureFor2LoD = screen.getByText(/edit the rulebook as yaml/i);
    expect(disclosureFor2LoD).toBeInTheDocument();
    expect(disclosureFor2LoD.closest('details')).not.toHaveAttribute('open');
  });
});
