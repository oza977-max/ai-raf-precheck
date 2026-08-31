import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { addNode } from '../../store/register';
import type { RegisterNode, RegisterNodeMetadata } from '../../store/types';

// explore-010 D-001: neither the top-level view switch (App.tsx) nor the
// register list<->detail switch (RegisterView.tsx) touched the History
// API. The browser's own Back button had no entry of this app's to act on,
// so it left the app entirely instead of returning to the previous screen.
// Every test here drives the REAL browser Back button (history.back(), which
// jsdom fires synchronously against real pushState entries — verified this
// session), not an in-app "back" link — the in-app links were never the
// bug; the hardware/OS-level Back button was.
//
// Labels are unique PER TEST (not a shared fixture constant): this file's
// tests all render <App/>, which shares one fake-indexeddb instance across
// the whole file (no reset between tests, same pattern the rest of this
// suite relies on) — a repeated label would collide across tests and turn
// a real assertion into a "multiple elements found" false failure.

function makeUseCaseMetadata(): RegisterNodeMetadata {
  return {
    node_type: 'use_case',
    submitted_by: '1LoD',
    lifecycle_stage: 'approved',
    current_verdict_id: null,
    tier: 'Low',
    track: 'II',
  };
}

function makeUseCaseNode(label: string): RegisterNode {
  return {
    node_id: crypto.randomUUID(),
    node_type: 'use_case',
    label,
    created_at: new Date().toISOString(),
    metadata: makeUseCaseMetadata(),
  };
}

function goBack() {
  window.history.back();
}

describe('Browser Back button actually navigates within the app (explore-010 D-001)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('TC-D001-01: Register -> browser Back -> returns to the intake screen, not out of the app', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('▤ Register'));
    expect(await screen.findByRole('heading', { name: /^register$/i })).toBeInTheDocument();

    goBack();
    await waitFor(() => {
      expect(screen.getByText(/describe your ai use case/i)).toBeInTheDocument();
    });
  });

  it('TC-D001-02: Register list -> a row -> browser Back -> returns to the register list, not out of the app', async () => {
    const label = 'Back-button fixture — TC-D001-02';
    await addNode(makeUseCaseNode(label));

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText('▤ Register'));
    await screen.findByText(label);

    await user.click(screen.getByText(label));
    expect(await screen.findByText(/← register/i)).toBeInTheDocument();

    goBack();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^register$/i })).toBeInTheDocument();
    });
    // The list is still there, not a blank/errored screen and not the app
    // having navigated away entirely.
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('TC-D001-03: two levels deep (Register -> detail), two Backs return to intake — the whole stack replays, not just one level', async () => {
    const label = 'Back-button fixture — TC-D001-03';
    await addNode(makeUseCaseNode(label));

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText('▤ Register'));
    await screen.findByText(label);
    await user.click(screen.getByText(label));
    expect(await screen.findByText(/← register/i)).toBeInTheDocument();

    goBack();
    await waitFor(() => expect(screen.getByRole('heading', { name: /^register$/i })).toBeInTheDocument());

    goBack();
    await waitFor(() => {
      expect(screen.getByText(/describe your ai use case/i)).toBeInTheDocument();
    });
  });

  it('TC-D001-04: the in-app "← register" link and the browser Back button end up in the same place', async () => {
    const label = 'Back-button fixture — TC-D001-04';
    await addNode(makeUseCaseNode(label));

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText('▤ Register'));
    await screen.findByText(label);
    await user.click(screen.getByText(label));

    await user.click(screen.getByText(/← register/i));
    expect(await screen.findByRole('heading', { name: /^register$/i })).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
