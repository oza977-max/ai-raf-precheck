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

// O-8 (FX7-1, BC-005). The confirm notice said the recorded answers "can't be
// edited". The trail is append-only and hash-chained but client-side with no
// external anchor (the verdict screen's own caveat, VerdictDisplay.tsx), so a
// person with local access could still rewrite it — the notice now says what
// the trail actually promises, in the same words as that caveat.
describe('ConfirmationStep — the notice promises no more than the audit trail does (O-8)', () => {
  it('TC-CR7-O8: does not claim the record "can\'t be edited"; says a change would show, and that it is kept in this browser with no outside check', () => {
    render(<ConfirmationStep graph={g} corrections={[]} onChangeAnswer={vi.fn()} onConfirm={vi.fn()} />);
    const notice = document.querySelector('.confirmation__notice')!.textContent ?? '';
    expect(notice).not.toMatch(/can.t be edited/i);
    expect(notice).toMatch(/recorded with the date and time/i);
    expect(notice).toMatch(/change|altered|edit/i);
    expect(notice).toMatch(/in this browser/i);
    expect(notice).toMatch(/no outside check|no external/i);
    // Still says a later correction is possible and recorded.
    expect(notice).toMatch(/correct it/i);
  });
});

// CR8-04 (P5 — no surface claims the audit check detects more than linkage and
// hashes of the events present). The notice derives its claim from the chain
// check's real behaviour (audit.ts verifyChain): an edited earlier event breaks
// the chain; deleting the NEWEST events leaves the remaining chain intact.
describe('ConfirmationStep — the notice says what the chain check cannot see (CR8-04, P5)', () => {
  it('TC-CR8-04a: no "a later change … would show"; it says an edit to an earlier entry would show, removing the newest entries would not, and there is no outside check', () => {
    render(<ConfirmationStep graph={g} corrections={[]} onChangeAnswer={vi.fn()} onConfirm={vi.fn()} />);
    const notice = (document.querySelector('.confirmation__notice')!.textContent ?? '').replace(/\s+/g, ' ');
    expect(notice).not.toMatch(/a later change[^.]*would show/i);
    expect(notice).toMatch(/a later edit to an earlier entry would show as a break in the record/i);
    expect(notice).toMatch(/removing the newest entries would not/i);
    expect(notice).toMatch(/kept in this browser with no outside check/i);
  });
});
