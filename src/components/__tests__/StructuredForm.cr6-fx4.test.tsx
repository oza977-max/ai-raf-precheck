import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StructuredForm from '../StructuredForm';
import type { PolicyFile } from '../../engine/types';

// CR6-07 (code review 006): required questions must be announced as required
// to assistive technology, not only drawn with a visual asterisk.
beforeEach(() => {
  sessionStorage.clear();
});

function policy(): PolicyFile {
  return {
    version: '1.0',
    policy_id: 'TEST',
    firm_name: 'Test',
    translation_attestation: { attested_by: 'x', role: 'x', date: 'x', raf_version_checked: 'x' },
    hard_lines: [],
    tracks: [],
    tiers: [],
    invariants: [],
    controls: [],
    kri_thresholds: {},
    jurisdictions: [{ code: 'UK', name: 'United Kingdom', pack_files: [] }],
    roles: {},
    tier_workflow: { Critical: 'x', High: 'x', Medium: 'x', Low: 'x' },
    safety_margin: 0.1,
  };
}

describe('StructuredForm — CR6-07 required questions are announced', () => {
  it('TC-CR6-07a: the free-text controls and radio groups carry required/aria-required; tick-all legends say so; the asterisk has hidden text', () => {
    const { container } = render(<StructuredForm policy={policy()} onSubmit={vi.fn()} />);

    // Free text (Q1 name, Q2 description).
    for (const re of [/what do you want to call it/i, /in a sentence or two/i]) {
      const el = screen.getByLabelText(re);
      expect(el).toBeRequired();
      expect(el).toHaveAttribute('aria-required', 'true');
    }

    // Every required single-select is a real radiogroup with aria-required.
    const groups = screen.getAllByRole('radiogroup');
    expect(groups.length).toBeGreaterThanOrEqual(7);
    for (const g of groups) expect(g).toHaveAttribute('aria-required', 'true');

    // Tick-all groups say "(tick at least one)" in their legend.
    const legends = [...container.querySelectorAll('fieldset.plain-form__question > legend')].filter((l) =>
      /tick at least one/i.test(l.textContent ?? ''),
    );
    expect(legends.length).toBeGreaterThanOrEqual(2); // Q5 and Q11

    // The visual asterisk carries visually hidden text.
    const markers = container.querySelectorAll('.required-marker');
    expect(markers.length).toBeGreaterThanOrEqual(12);
    for (const m of markers) {
      expect(m.querySelector('.visually-hidden')?.textContent).toMatch(/\(required\)/i);
    }
  });

  it('TC-CR6-07b: a visible line by Continue says what is still missing and is tied to the button with aria-describedby; it goes when complete', async () => {
    const user = userEvent.setup();
    render(<StructuredForm policy={policy()} onSubmit={vi.fn()} />);
    const button = screen.getByRole('button', { name: /continue/i });
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const note = document.getElementById(describedBy!)!;
    expect(note).toBeVisible();
    expect(note.textContent).toMatch(/still to answer/i);
    expect(note.textContent).toMatch(/what do you want to call it/i);

    // Answering the first question removes it from the list.
    await user.type(screen.getByLabelText(/what do you want to call it/i), 'Test tool');
    expect(document.getElementById(describedBy!)!.textContent).not.toMatch(/what do you want to call it/i);
    expect(within(document.body).queryAllByText(/still to answer/i).length).toBe(1);
  });
});
