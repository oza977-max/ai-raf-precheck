import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GraphView from '../GraphView';
import { GRAPH_FIELD_LABELS, DATA_CLASS_LABELS } from '../field-copy';
import type { DataFlowGraph } from '../../engine/types';

// R15-C5 (proposal §3.6): traceability tests for the graph-review label,
// badge, disclosure and quote-truncation behaviour this chunk built or
// renegotiated. See test-cases/test-cases-015.md's R15-C5 section for the
// exact case text each test below proves — these four (C5-01, C5-03, C5-06,
// C5-07) had no prior automated test to renegotiate.

function makeFullGraph(): DataFlowGraph {
  return {
    id: 'g1',
    version: 1,
    intake_method: 'llm',
    extracted_at: '2026-01-01T00:00:00.000Z',
    input_nodes: [{ id: 'i1', label: 'credit risk data', data_class: 'Client PII', data_zone: 'Zone C' }],
    processing_nodes: [
      {
        id: 'p1',
        label: 'training pipeline',
        model_type: 'llm',
        autonomy_level: 3,
        data_zone: 'Zone C',
        vendor: 'open source',
        replaces_prior_model: false,
      },
    ],
    output_nodes: [
      {
        id: 'o1',
        label: 'analyst answers',
        action_type: 'recommend',
        exposure: 'internal-only',
        decision_bindingness: 'material',
        output_reversibility: 'irreversible',
        scale: 'limited',
      },
    ],
    edges: [
      { from: 'i1', to: 'p1' },
      { from: 'p1', to: 'o1' },
    ],
    jurisdictions: [],
  };
}

describe('TC-R15-C5-01 — graph field rows use the guided-form plain label, engine name kept as quiet code', () => {
  it('TC-R15-C5-01: data_class, decision_bindingness, output_reversibility and autonomy_level render their GRAPH_FIELD_LABELS text, with the engine field name still present in a <code class="graph-node__field-code">', () => {
    render(<GraphView graph={makeFullGraph()} />);

    for (const field of ['data_class', 'decision_bindingness', 'output_reversibility', 'autonomy_level'] as const) {
      // The engine field name is its own <code> element, not folded into the
      // plain-label text — getByText's default matcher only matches an
      // element's own direct text nodes, so this uniquely finds the code tag.
      const code = screen.getByText(field, { selector: 'code.graph-node__field-code' });
      const row = code.closest('dt');
      expect(row).not.toBeNull();
      expect(row).toHaveTextContent(GRAPH_FIELD_LABELS[field]!);
    }
  });
});

describe('TC-R15-C5-03 — guessed and no-basis badges share a base class but keep distinct modifiers and text', () => {
  function makeGraph(): DataFlowGraph {
    return {
      id: 'g2',
      version: 1,
      intake_method: 'llm',
      extracted_at: '2026-01-01T00:00:00.000Z',
      input_nodes: [{ id: 'i1', label: 'x', data_class: 'Client PII', data_zone: 'Zone C' }],
      processing_nodes: [],
      output_nodes: [],
      edges: [],
      jurisdictions: [],
    };
  }

  it('TC-R15-C5-03: a guessed field renders .graph-node__badge.graph-node__badge--guessed and an unguessed, unquoted field renders .graph-node__badge.graph-node__badge--no-basis, with different text', () => {
    // data_class is guessed; data_zone has no quote and is not guessed and
    // the node itself is not flagged uncertain — the no-basis branch.
    const { container } = render(
      <GraphView
        graph={makeGraph()}
        editable
        unconfirmedNodeIds={[]}
        onConfirmNode={vi.fn()}
        guessedFields={{ i1: ['data_class'] }}
      />,
    );

    const guessedBadge = container.querySelector('.graph-node__badge--guessed');
    const noBasisBadge = container.querySelector('.graph-node__badge--no-basis');
    expect(guessedBadge).not.toBeNull();
    expect(noBasisBadge).not.toBeNull();

    // Both share the base badge class (same shape/visual family)...
    expect(guessedBadge!.classList.contains('graph-node__badge')).toBe(true);
    expect(noBasisBadge!.classList.contains('graph-node__badge')).toBe(true);
    // ...but keep their own, mutually exclusive modifier class...
    expect(guessedBadge!.classList.contains('graph-node__badge--no-basis')).toBe(false);
    expect(noBasisBadge!.classList.contains('graph-node__badge--guessed')).toBe(false);
    // ...and their own, distinct text — never merged into one label.
    expect(guessedBadge!.textContent).toMatch(/guessed — the description does not say/i);
    expect(noBasisBadge!.textContent).toMatch(/not found in your text — worth a second look/i);
    expect(guessedBadge!.textContent).not.toBe(noBasisBadge!.textContent);
  });
});

describe('TC-R15-C5-06 — the "Why these values matter" disclosure is an accessible toggle', () => {
  it('TC-R15-C5-06: the button carries aria-expanded and aria-controls pointing at the node\'s <dl id="why-<nodeId>">, and toggling flips aria-expanded', async () => {
    const user = userEvent.setup();
    render(<GraphView graph={makeFullGraph()} />);

    // First card is the input node, id "i1".
    const button = screen.getAllByRole('button', { name: /why these values matter/i })[0]!;
    expect(button).toHaveAttribute('aria-expanded', 'false');

    const controlsId = button.getAttribute('aria-controls');
    expect(controlsId).toBe('why-i1');
    const dl = document.getElementById(controlsId!);
    expect(dl).not.toBeNull();
    expect(dl!.tagName).toBe('DL');

    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /hide why these matter/i })).toBe(button);
  });
});

describe('TC-R15-C5-07 — provenance quote truncation never touches the field value', () => {
  function makeGraph(): DataFlowGraph {
    return {
      id: 'g3',
      version: 1,
      intake_method: 'llm',
      extracted_at: '2026-01-01T00:00:00.000Z',
      input_nodes: [{ id: 'i1', label: 'x', data_class: 'Client PII', data_zone: 'Zone C' }],
      processing_nodes: [],
      output_nodes: [],
      edges: [],
      jurisdictions: [],
    };
  }

  it('TC-R15-C5-07: a quote over 90 characters truncates behind a "show full quote" toggle carrying aria-expanded; the field value beside it always renders in full', async () => {
    const user = userEvent.setup();
    const LONG_QUOTE =
      'The quick brown fox jumps over the lazy dog while processing personal client data for review.';
    expect(LONG_QUOTE.length).toBeGreaterThan(90);

    const { container } = render(
      <GraphView
        graph={makeGraph()}
        editable
        unconfirmedNodeIds={[]}
        onConfirmNode={vi.fn()}
        provenance={{ i1: { data_class: LONG_QUOTE } }}
      />,
    );

    // Before expansion: the value renders in full, the quote does not.
    const meaningBefore = container.querySelector('.graph-node__meaning');
    expect(meaningBefore).not.toBeNull();
    expect(meaningBefore!.textContent).toBe(DATA_CLASS_LABELS['Client PII']);
    expect(container.textContent).not.toContain(LONG_QUOTE);

    const expandButton = screen.getByRole('button', { name: /show full quote/i });
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(expandButton);

    // After expansion: the quote is now shown in full, and the value beside
    // it is unaffected — same text as before the quote ever expanded.
    expect(container.textContent).toContain(LONG_QUOTE);
    expect(screen.getByRole('button', { name: /show less/i })).toHaveAttribute('aria-expanded', 'true');
    const meaningAfter = container.querySelector('.graph-node__meaning');
    expect(meaningAfter!.textContent).toBe(DATA_CLASS_LABELS['Client PII']);
  });
});
