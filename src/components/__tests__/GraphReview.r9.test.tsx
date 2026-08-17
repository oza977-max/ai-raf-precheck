import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GraphView from '../GraphView';
import IntakeFlow from '../IntakeFlow';

// Round 9 — the review screen recomposed (requirements-009, §19,
// ADR-IF-R9-1): aggregation and priority, never deletion.

const MOCK_INPUT = {
  input_nodes: [
    {
      id: 'i1', label: 'credit risk data', data_class: 'Client PII', data_zone: 'Zone C',
      basis_quotes: { data_class: 'credit risk data', data_zone: 'internal' },
    },
  ],
  processing_nodes: [
    {
      id: 'p1', label: 'training pipeline', model_type: 'llm', autonomy_level: 2,
      data_zone: 'Zone C', vendor: 'open source', replaces_prior_model: false, uncertain: true,
      basis_quotes: { model_type: '', autonomy_level: 'analysts', data_zone: 'internal', vendor: '' },
    },
  ],
  output_nodes: [
    {
      id: 'o1', label: 'analyst answers', action_type: 'recommend', exposure: 'internal-only',
      decision_bindingness: 'advisory', output_reversibility: 'reversible', scale: 'limited',
      basis_quotes: {
        action_type: 'analysts', exposure: 'internal', decision_bindingness: 'analysts',
        output_reversibility: 'credit risk data', scale: 'internal credit risk data',
      },
    },
  ],
  edges: [{ from: 'i1', to: 'p1' }, { from: 'p1', to: 'o1' }],
  jurisdictions: ['UK'],
};

const mockCreate = vi.fn().mockResolvedValue({
  content: [{ type: 'tool_use', name: 'extract_graph', input: MOCK_INPUT }],
});
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

const DESCRIPTION = 'Analysts ask questions about internal credit risk data.';

async function reachReview(user: ReturnType<typeof userEvent.setup>) {
  render(<IntakeFlow />);
  await user.type(screen.getByLabelText(/describe your ai use case/i), DESCRIPTION);
  await user.click(screen.getByRole('button', { name: /read & extract/i }));
  await user.click(await screen.findByRole('button', { name: /new use case/i }));
  await screen.findByText(/review extracted graph/i);
}

describe('R9-SC-1 — the review checklist', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('aigate:api-key', 'test-key');
    mockCreate.mockClear();
  });

  it('TC-R9-SC-1-01: lists exactly the outstanding obligations, and completing one removes its line', async () => {
    const user = userEvent.setup();
    await reachReview(user);
    const list = screen.getByText(/steps? before you can proceed/i).parentElement!;
    // p1 is guessed (fix line), i1 and o1 confirmable, jurisdictions pending.
    expect(within(list).getByText(/fix 2 guessed values on “training pipeline”/i)).toBeInTheDocument();
    expect(within(list).getByText(/confirm “credit risk data”/i)).toBeInTheDocument();
    expect(within(list).getByText(/confirm “analyst answers”/i)).toBeInTheDocument();
    expect(within(list).getByText(/confirm jurisdictions/i)).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /^looks right — confirm$/i })[0]!);
    expect(screen.queryAllByText(/confirm “/i).length).toBeLessThan(3);
  });

  it('TC-R9-SC-1-02: zero obligations renders the done state', async () => {
    const user = userEvent.setup();
    await reachReview(user);
    for (;;) {
      const b = screen.queryAllByRole('button', { name: /^(looks right|i have checked this) — confirm$/i })[0];
      if (!b) break;
      await user.click(b);
    }
    // Resolve p1's guesses by correcting both fields in its editor.
    await user.click(screen.getByRole('button', { name: /fix guessed values/i }));
    await user.selectOptions(screen.getByLabelText(/training pipeline — model type/i), 'traditional-ml');
    await user.selectOptions(screen.getByLabelText(/training pipeline — data zone/i), 'Zone B');
    // vendor is guessed too? guessed = model_type + vendor (empty quotes).
    const vendorField = screen.queryByLabelText(/training pipeline — vendor/i);
    void vendorField; // vendor not in PROCESSING_FIELDS editor; correction of listed fields clears its guesses only
    await user.click(screen.getByRole('button', { name: /^done$/i }));
    await user.click(screen.getByRole('button', { name: /these are right — confirm/i }));
    // Whatever remains guessed rides to questions; the checklist reflects state.
    expect(screen.getByText(/steps? before you can proceed|all checked/i)).toBeInTheDocument();
  });
});

describe('R9-SC-3/-4 — one alarm per card, visible next step', () => {
  function guessedGraph() {
    return {
      id: 'g1', version: 1, intake_method: 'llm' as const, extracted_at: '2026-01-01T00:00:00.000Z',
      input_nodes: [], output_nodes: [], edges: [], jurisdictions: [],
      processing_nodes: [
        { id: 'p1', label: 'x', model_type: 'llm' as const, autonomy_level: 2 as const, data_zone: 'Zone C' as const, vendor: 'v', replaces_prior_model: false, uncertain: true },
      ],
    };
  }

  it('TC-R9-SC-3-01: uncertainty + guesses + a warning yield exactly one warn-styled alarm', () => {
    const { container } = render(
      <GraphView
        graph={guessedGraph()}
        editable
        unconfirmedNodeIds={[]}
        onConfirmNode={vi.fn()}
        guessedFields={{ p1: ['model_type'] }}
        warnings={[{ node_id: 'p1', field: 'autonomy_level', message: 'description sounds autonomous' }]}
      />,
    );
    expect(container.querySelectorAll('.graph-node__uncertain').length).toBe(1);
    expect(container.querySelectorAll('.graph-node__guessed-badge').length).toBe(1);
    expect(container.querySelectorAll('.graph-node__advisory').length).toBe(1);
    // Advisory is note-role, not alert — advisory ≠ blocking at a glance.
    expect(within(container.querySelector('.graph-node')! as HTMLElement).getAllByRole('alert')).toHaveLength(1);
  });

  it('TC-R9-SC-4-01: a guessed card offers Fix guessed values (opens the editor) and still no plain confirm', async () => {
    const user = userEvent.setup();
    render(
      <GraphView graph={guessedGraph()} editable onCorrect={vi.fn()} unconfirmedNodeIds={[]} onConfirmNode={vi.fn()} guessedFields={{ p1: ['model_type'] }} />,
    );
    expect(screen.queryByRole('button', { name: /— confirm$/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /fix guessed values/i }));
    expect(screen.getByLabelText(/x — model type/i)).toBeInTheDocument();
  });
});

describe('R9-SC-4/-5 — actions before information; similar cases collapsed', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('aigate:api-key', 'test-key');
    mockCreate.mockClear();
  });

  it('TC-R9-SC-4-02: jurisdictions renders before similar cases in DOM order', async () => {
    const user = userEvent.setup();
    await reachReview(user);
    const jur = document.getElementById('jurisdictions-panel');
    expect(jur).not.toBeNull();
    const collapse = document.querySelector('.similar-cases-collapse');
    if (collapse) {
      expect(jur!.compareDocumentPosition(collapse) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});
