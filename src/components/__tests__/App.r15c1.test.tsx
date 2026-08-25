import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { addNode } from '../../store/register';
import type { RegisterNode } from '../../store/types';

// R15-C1 (requirements-015.md; proposal §3.8). Role switcher relabelled
// "Viewing as", visible honesty note, glossed option labels, and the
// reworded 1LoD register scope note.

describe('App — R15-C1 role switcher honesty', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('TC-R15-C1-08: role switcher is labelled "Viewing as" and shows a visible honesty note', () => {
    render(<App />);
    expect(screen.getByLabelText('Viewing as')).toBeInTheDocument();
    expect(screen.getByText(/a view preference — this build has no sign-in/i)).toBeInTheDocument();
  });

  it('TC-R15-C1-09: role options carry a first-mention gloss', () => {
    render(<App />);
    expect(screen.getByRole('option', { name: '1LoD — James · Dev (first line — submitter)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '2LoD — Priya · AI Risk (second line — reviewer)' })).toBeInTheDocument();
  });

  it('TC-R15-C1-10: the 1LoD register scope note is reworded to the honest view-preference wording', async () => {
    // The empty-register state shows "No use cases submitted yet." instead
    // of the scope note, so seed one 1LoD-submitted node first.
    const node: RegisterNode = {
      node_id: crypto.randomUUID(),
      node_type: 'use_case',
      label: 'Scope note probe',
      created_at: new Date().toISOString(),
      metadata: {
        node_type: 'use_case',
        submitted_by: '1LoD',
        lifecycle_stage: 'pre_checked',
        current_verdict_id: null,
        tier: 'High',
        track: 'II',
      },
    };
    await addNode(node);

    render(<App />);
    const registerItem = screen.getByText('▤ Register').closest('div');
    expect(registerItem).not.toBeNull();
    await userEvent.click(registerItem as HTMLElement);

    expect(
      await screen.findByText("You're viewing as 1LoD — a view preference, not a permission; this build has no sign-in."),
    ).toBeInTheDocument();
  });
});
