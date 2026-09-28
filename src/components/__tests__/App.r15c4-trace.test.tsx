import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { loadPolicy } from '../../store/policy';
import { getCurrentPolicyYaml } from '../../store/policy-source';
import { translationAttestationStatus } from '../../engine/attestation';

// R15-C4 (proposal §3.8). TC-R15-C4-06: the header's translation-fidelity
// chip used to carry its explanation in a title= tooltip (hover-only
// meaning, a G3 violation). It now drops title= entirely and instead uses a
// button with aria-expanded that toggles a <p> carrying the same
// attestation.reason text verbatim. The expected reason is computed here
// the same way App.tsx computes it (loadPolicy + translationAttestationStatus)
// rather than hardcoded, so this doesn't couple to the starter policy's
// current wording.
describe('App header — R15-C4 fidelity chip disclosure (TC-R15-C4-06)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('TC-R15-C4-06: the fidelity toggle carries no title= attribute, and its aria-expanded button reveals a <p> with attestation.reason verbatim', async () => {
    const user = userEvent.setup();
    render(<App />);

    const policyResult = loadPolicy(getCurrentPolicyYaml());
    if (!policyResult.valid) {
      throw new Error('expected the starter policy to be valid for this test to be meaningful');
    }
    const expectedReason = translationAttestationStatus(
      policyResult.policy.translation_attestation,
      new Date().toISOString().slice(0, 10),
    ).reason;

    const toggle = await screen.findByRole('button', { name: /details/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).not.toHaveAttribute('title');
    expect(toggle.closest('.app-header__fidelity')).not.toHaveAttribute('title');
    expect(screen.queryByText(expectedReason)).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const detail = await screen.findByText(expectedReason);
    expect(detail.tagName).toBe('P');
  });
});
