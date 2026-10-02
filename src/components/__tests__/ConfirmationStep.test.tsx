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
  it('offers an OPTIONAL note and says in terms who reads it — your AI risk team, not the rules (R16-W §3, D-73)', () => {
    render(<ConfirmationStep graph={g} corrections={[]} onChangeAnswer={vi.fn()} onConfirm={vi.fn()} />);
    const note = screen.getByLabelText(/anything your ai risk team should know/i);
    expect(note).toBeInTheDocument();
    // The label of the mechanism IS the mechanism: without this sentence a
    // submitter reasonably assumes the engine weighed their words.
    expect(screen.getByText(/your ai risk team reads this when they review it/i)).toBeInTheDocument();
    expect(screen.getByText(/it doesn.t change the result/i)).toBeInTheDocument();
  });

  it('passes a trimmed note to onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmationStep graph={g} corrections={[]} onChangeAnswer={vi.fn()} onConfirm={onConfirm} />);
    await user.type(screen.getByLabelText(/anything your ai risk team should know/i), '  The PII is pseudonymised first.  ');
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    expect(onConfirm).toHaveBeenCalledWith('The PII is pseudonymised first.');
  });

  it('passes undefined — not an empty string — when nothing was written', async () => {
    // An empty note must not be persisted as a note: the attestation record
    // is permanent, and "note: ''" reads as a note somebody chose to leave.
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmationStep graph={g} corrections={[]} onChangeAnswer={vi.fn()} onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('confirming stays possible with the note untouched — it is genuinely optional', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmationStep graph={g} corrections={[]} onChangeAnswer={vi.fn()} onConfirm={onConfirm} />);
    const btn = screen.getByRole('button', { name: /confirm and evaluate/i });
    expect(btn).toBeEnabled();
    await user.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

// R15-C3 (proposal §3.5, skeptic amendment S1b) — test-cases-015.md
// TC-R15-C3-01/02/03. The screen used to render a raw internal-id tag
// ("UC-6 · CONFIRM & ATTEST") and feed the attest grid raw engine vocabulary
// directly. Both are fixed at graph-summary.ts's graphSummaryRows(), the one
// shared source this screen and VerdictDisplay's "What you told us" fold both
// call (see VerdictDisplay.test.tsx's paired assertion on the same shape).
describe('ConfirmationStep — plain-English attest grid, no internal-id tag (R15-C3)', () => {
  it('TC-R15-C3-03: the "UC-6 · CONFIRM & ATTEST" internal-id tag does not render on the Confirm and evaluate screen', () => {
    render(<ConfirmationStep graph={g} corrections={[]} onChangeAnswer={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /confirm and evaluate/i })).toBeInTheDocument();
    expect(screen.queryByText(/UC-6/)).not.toBeInTheDocument();
    expect(screen.queryByText(/CONFIRM & ATTEST/i)).not.toBeInTheDocument();
  });

  it('TC-R15-C3-01, TC-R15-C3-02: the attest grid renders graphSummaryRows() in the plain-phrase-then-code shape — the same shared function and row shape VerdictDisplay\'s "What you told us" fold uses', () => {
    const graph: DataFlowGraph = {
      id: 'g2',
      version: 1,
      input_nodes: [{ id: 'i1', label: 'Client notes', data_class: 'Client PII', data_zone: 'Zone B' }],
      processing_nodes: [
        {
          id: 'p1',
          label: 'Drafting model',
          model_type: 'llm',
          autonomy_level: 1,
          data_zone: 'Zone B',
          vendor: 'Anthropic',
          replaces_prior_model: false,
        },
      ],
      output_nodes: [
        {
          id: 'o1',
          label: 'Draft email',
          action_type: 'draft',
          exposure: 'internal-only',
          decision_bindingness: 'advisory',
          output_reversibility: 'reversible',
          scale: 'limited',
        },
      ],
      edges: [],
      jurisdictions: ['UK'],
      intake_method: 'structured_form',
      extracted_at: '2026-01-01T00:00:00.000Z',
    };
    render(<ConfirmationStep graph={graph} corrections={[]} onChangeAnswer={vi.fn()} onConfirm={vi.fn()} />);
    // Not the raw enum alone ("Client PII", "llm") — plainWithCode() leads with
    // a short plain phrase and keeps the code quiet beside it, matching the
    // VerdictDisplay assertion on the identical string this pairs with.
    expect(screen.getByText('Client notes · Personal details of clients · Client PII')).toBeInTheDocument();
    expect(screen.getByText('Drafting model · A chatbot or writing assistant · LLM')).toBeInTheDocument();
  });
});
