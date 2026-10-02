import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';

// R16-F §3 (DR7-10, design-review-007.html). The five sidebar items were
// clickable <div>s — no native keyboard handling, no accessible role, so a
// keyboard or screen-reader user could not reach "+ New pre-check",
// "▤ Register", "§ Appetite framework", "? About" or (2LoD) "⚑ Rule
// challenges" at all. Now real <button type="button">s, same classes, same
// look (App.css resets the browser's own chrome); aria-current="page"
// names the active one.

describe('App — sidebar navigation is keyboard-reachable (R16-F §3, DR7-10)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('TC-R16-F-42: every sidebar item has an accessible button role, reachable by name', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /\+ New pre-check/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /▤ Register/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /§ Appetite framework/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\? About/ })).toBeInTheDocument();
  });

  it('TC-R16-F-43: the active item carries aria-current="page"; the others do not', () => {
    render(<App />);
    const intakeItem = screen.getByRole('button', { name: /\+ New pre-check/ });
    const registerItem = screen.getByRole('button', { name: /▤ Register/ });
    expect(intakeItem).toHaveAttribute('aria-current', 'page');
    expect(registerItem).not.toHaveAttribute('aria-current');
  });

  it('TC-R16-F-44: pressing Enter on a focused sidebar button activates it — real keyboard activation, not a mouse-only onClick', async () => {
    const user = userEvent.setup();
    render(<App />);
    const registerItem = screen.getByRole('button', { name: /▤ Register/ });
    registerItem.focus();
    expect(registerItem).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: /^register$/i })).toBeInTheDocument();
  });

  it('TC-R16-F-45: pressing Space on a focused sidebar button activates it', async () => {
    const user = userEvent.setup();
    render(<App />);
    const aboutItem = screen.getByRole('button', { name: /\? About/ });
    aboutItem.focus();
    await user.keyboard(' ');
    expect(await screen.findByRole('heading', { name: /^what this is$/i })).toBeInTheDocument();
  });
});
