import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GraphView from '../GraphView';
import { FIELD_CONSEQUENCES } from '../field-copy';
import { QUESTIONNAIRE_COPY } from '../plain-copy';
import type { DataFlowGraph } from '../../engine/types';

// FX7-4 / code review 007: CR7-25 (the "replaces something" row) and CR7-02
// (6) (no "no basis" badge on a screen being revisited; an honest badge for a
// migrated draft that kept no record of where values came from).

function makeGraph(replaces = false): DataFlowGraph {
  return {
    id: 'g1',
    version: 1,
    intake_method: 'llm',
    extracted_at: '2026-01-01T00:00:00.000Z',
    input_nodes: [{ id: 'i1', label: 'credit risk data', data_class: 'Client PII', data_zone: 'Zone C' }],
    processing_nodes: [
      { id: 'p1', label: 'drafting model', model_type: 'llm', autonomy_level: 1, data_zone: 'Zone C', vendor: 'internal', replaces_prior_model: replaces },
    ],
    output_nodes: [
      {
        id: 'o1', label: 'draft email', action_type: 'draft', exposure: 'internal-only', decision_bindingness: 'advisory',
        output_reversibility: 'reversible', scale: 'limited',
      },
    ],
    edges: [],
    jurisdictions: [],
  } as DataFlowGraph;
}

const NO_BASIS = 'Not in your description — please check this';
const REPLACES_LABEL = QUESTIONNAIRE_COPY.replaces_prior_model.shortLabel;

describe('GraphView — CR7-25: "replaces something you use?" has a row on the review card', () => {
  it('TC-CR7-25: the processing card shows the row with Yes / No, and a consequence line', async () => {
    for (const [replaces, word] of [[true, 'Yes'], [false, 'No']] as const) {
      const { container, unmount } = render(<GraphView graph={makeGraph(replaces)} editable={false} provenance={{}} guessedFields={{}} />);
      const row = Array.from(container.querySelectorAll('.graph-node__meaning-row')).find((r) => r.querySelector('dt')?.textContent === REPLACES_LABEL);
      expect(row).toBeDefined();
      expect(row!.querySelector('.graph-node__meaning')!.textContent).toBe(word);
      unmount();
    }
    expect(FIELD_CONSEQUENCES.replaces_prior_model).toBeTruthy();
    const user = userEvent.setup();
    render(<GraphView graph={makeGraph(true)} editable provenance={{}} guessedFields={{}} unconfirmedNodeIds={[]} onConfirmNode={vi.fn()} />);
    await user.click(screen.getAllByRole('button', { name: /why these values matter/i })[1]!);
    expect(screen.getByText(FIELD_CONSEQUENCES.replaces_prior_model!)).toBeInTheDocument();
  });

  it('TC-CR7-25-1: the row can be corrected — editing sends a boolean to onCorrect', async () => {
    const user = userEvent.setup();
    const onCorrect = vi.fn();
    const { container } = render(
      <GraphView graph={makeGraph(false)} editable onCorrect={onCorrect} provenance={{}} guessedFields={{}} unconfirmedNodeIds={[]} onConfirmNode={vi.fn()} />,
    );
    const editButtons = container.querySelectorAll('.graph-node__edit');
    await user.click(editButtons[1]!); // the processing card
    const select = Array.from(container.querySelectorAll('select')).find((s) => Array.from(s.options).some((o) => o.value === 'true') && s.closest('.graph-node__field')?.textContent?.includes('replaces_prior_model'));
    expect(select).toBeDefined();
    await user.selectOptions(select!, 'true');
    expect(onCorrect).toHaveBeenCalledWith('p1', 'replaces_prior_model', true);
  });
});

describe('GraphView — CR7-02 (6): no "no basis" badge on a revisited screen', () => {
  it('TC-CR7-02g: with reentry set, a confident-but-unquoted field carries no "Not in your description" badge', () => {
    const { container } = render(
      <GraphView graph={makeGraph()} editable unconfirmedNodeIds={[]} onConfirmNode={vi.fn()} provenance={{}} guessedFields={{}} reentry />,
    );
    expect(container.querySelector('.graph-node__badge--no-basis')).toBeNull();
    expect(container.textContent).not.toContain(NO_BASIS);
    expect(container.textContent).not.toMatch(/Not in your description/);
  });

  it('TC-CR7-02g-1: the same graph on a FIRST read (no reentry, real extraction: provenance recorded, nothing quoted) still shows the badge', () => {
    render(<GraphView graph={makeGraph()} editable unconfirmedNodeIds={[]} onConfirmNode={vi.fn()} provenance={{}} guessedFields={{}} />);
    expect(screen.getAllByText(NO_BASIS).length).toBeGreaterThan(0);
  });

  it('TC-CR7-02g-2: reentry does not hide a field the reader still has to check — a guessed field keeps its badge', () => {
    render(
      <GraphView graph={makeGraph()} editable unconfirmedNodeIds={[]} onConfirmNode={vi.fn()} provenance={{}} guessedFields={{ i1: ['data_class'] }} reentry />,
    );
    expect(screen.getByText('Not in your description — check this, or it becomes a question')).toBeInTheDocument();
  });
});

describe('GraphView — CR7-02 (6) / BC-005: a migrated old draft kept no record of where values came from', () => {
  it('TC-CR7-02h: no provenance and no guessed list at all — no claim about the description, an honest "wasn\'t saved" badge instead', () => {
    const { container } = render(<GraphView graph={makeGraph()} editable unconfirmedNodeIds={['i1', 'p1', 'o1']} onConfirmNode={vi.fn()} />);
    expect(container.textContent).not.toMatch(/Not in your description/);
    expect(container.querySelector('.graph-node__badge--no-basis')).toBeNull();
    const badges = container.querySelectorAll('.graph-node__badge--unrecorded');
    expect(badges.length).toBeGreaterThan(0);
    expect(badges[0]!.textContent).toBe('Where this came from wasn’t saved — please check this');
  });
});
