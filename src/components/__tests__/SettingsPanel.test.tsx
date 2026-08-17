import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPanel from '../SettingsPanel';

describe('SettingsPanel (local-testing-only key storage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // v0.8.1 (user decision): the vendor-specific key field is gone — one
  // generic model slot remains. The demo shows the thing that has actually
  // run live; the cloud-SDK code path is dormant with no UI.
  it('offers no vendor API key field, and frames the single model slot honestly', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByText(/settings/i));
    expect(screen.queryByLabelText(/anthropic api key/i)).toBeNull();
    expect(screen.getByLabelText(/model for plain-language intake/i)).toBeInTheDocument();
    // The footnote the user asked for: frontier models draft better; the
    // demo was tested with an open-source model.
    expect(screen.getByText(/frontier models produce noticeably better/i)).toBeInTheDocument();
    expect(screen.getByText(/qwen/i)).toBeInTheDocument();
  });
});
