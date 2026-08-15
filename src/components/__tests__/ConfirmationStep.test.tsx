import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmationStep from '../ConfirmationStep';
import type { DataFlowGraph } from '../../engine/types';

// The reviewer note (2026-08-15). Design decision from the dropdown review:
// closed vocabularies stay closed — the escape valve for nuance is ONE
// optional note at the attestation point, read by the 2LoD reviewer, never
// by the rules. A deterministic engine cannot read prose, and pretending
// otherwise would give the submitter false comfort that "they know".
const g: DataFlowGraph = {
  id: 'g1', version: 1, input_nodes: [], processing_nodes: [], output_nodes: [],
  edges: [], jurisdictions: ['UK'], intake_method: 'structured_form',
  extracted_at: '2026-01-01T00:00:00.000Z',
};

describe('ConfirmationStep — the note for the reviewer', () => {
  it('offers an OPTIONAL note and says in terms who reads it — the reviewer, not the rules', () => {
    render(<ConfirmationStep graph={g} corrections={[]} onConfirm={vi.fn()} />);
    const note = screen.getByLabelText(/anything the reviewer should know/i);
    expect(note).toBeInTheDocument();
    // The label of the mechanism IS the mechanism: without this sentence a
    // submitter reasonably assumes the engine weighed their words.
    expect(screen.getByText(/read by the reviewer.*not by the rules/i)).toBeInTheDocument();
  });

  it('passes a trimmed note to onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmationStep graph={g} corrections={[]} onConfirm={onConfirm} />);
    await user.type(screen.getByLabelText(/anything the reviewer should know/i), '  The PII is pseudonymised first.  ');
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    expect(onConfirm).toHaveBeenCalledWith('The PII is pseudonymised first.');
  });

  it('passes undefined — not an empty string — when nothing was written', async () => {
    // An empty note must not be persisted as a note: the attestation record
    // is permanent, and "note: ''" reads as a note somebody chose to leave.
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmationStep graph={g} corrections={[]} onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('confirming stays possible with the note untouched — it is genuinely optional', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmationStep graph={g} corrections={[]} onConfirm={onConfirm} />);
    const btn = screen.getByRole('button', { name: /confirm and evaluate/i });
    expect(btn).toBeEnabled();
    await user.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
