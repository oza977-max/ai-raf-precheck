import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPanel from '../SettingsPanel';

describe('SettingsPanel (local-testing-only key storage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves a pasted key to localStorage under aigate:api-key', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByText(/settings/i));
    await user.type(screen.getByLabelText(/anthropic api key/i), 'sk-ant-test-key');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(localStorage.getItem('aigate:api-key')).toBe('sk-ant-test-key');
  });

  it('clears a saved key', async () => {
    localStorage.setItem('aigate:api-key', 'sk-ant-existing');
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByText(/settings/i));
    await user.click(screen.getByRole('button', { name: /clear saved key/i }));

    expect(localStorage.getItem('aigate:api-key')).toBeNull();
  });
});
