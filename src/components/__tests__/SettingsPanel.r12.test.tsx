import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPanel from '../SettingsPanel';

// R12-MG-2: the local-model probe surfaces the Ollama digest next to the
// model name, so a firm deployment has something to diff against a
// benchmarked build.
describe('SettingsPanel — local model digest (R12-MG-2)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('TC-R12-MG-2-01: a successful probe renders a truncated digest with help text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [{ name: 'qwen3:4b', digest: 'sha256:abcdef0123456789abcdef0123456789' }],
        }),
      }),
    );
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByText(/settings — plain-language model/i));
    await user.click(screen.getByRole('button', { name: /test & save/i }));

    const help = await screen.findByText((_, el) => el?.textContent === 'digest: sha256:abcdef012345… — compare against the digest of the build you benchmarked');
    expect(help).toBeInTheDocument();
  });
});
