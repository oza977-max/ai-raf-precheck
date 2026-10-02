import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UnderstoodSummary from '../UnderstoodSummary';
import type { DataFlowGraph } from '../../engine/types';
import type { Assumption } from '../plain-copy';

// The collapsed "Show the details the rules use" grid legitimately repeats
// raw engine codes (zone letters, model-type codes) for the reviewer — that
// is its documented job (§3: "its grid stays under ... collapsed"). Several
// assertions below must therefore be scoped to the PLAIN summary section
// they are checking, not the whole page, or they would collide with that
// grid's own, deliberately-coded text.
function sectionFor(headingText: RegExp): HTMLElement {
  return screen.getByText(headingText).closest('section') as HTMLElement;
}

// R16-C (UC-9, UC-12; build/prompts/R16.md v2.1 §3). A presentation
// component (Rule 4, cross-cutting.md §7) — everything it renders is
// derived from the graph via graph-summary.ts's pure helpers, or passed in
// as props; no business logic here.

function graph(overrides: Partial<DataFlowGraph> = {}): DataFlowGraph {
  return {
    id: 'g1',
    version: 1,
    intake_method: 'structured_form',
    extracted_at: '2026-01-01T00:00:00.000Z',
    jurisdictions: [],
    input_nodes: [{ id: 'i1', label: 'Client notes', data_class: 'Client PII', data_zone: 'Zone B' }],
    processing_nodes: [
      {
        id: 'p1',
        label: 'Drafting model',
        model_type: 'llm',
        autonomy_level: 1,
        data_zone: 'Zone B',
        vendor: 'internal',
        replaces_prior_model: false,
      },
    ],
    output_nodes: [
      {
        id: 'o1',
        label: 'Draft email',
        action_type: 'draft',
        exposure: 'internal-only',
        decision_bindingness: 'non-binding',
        output_reversibility: 'reversible',
        scale: 'limited',
      },
    ],
    edges: [],
    ...overrides,
  };
}

describe('UnderstoodSummary — where the information goes (§3)', () => {
  it('TC-R16-C-05: Zone C reads as "your firm’s own systems", with no zone letter anywhere', () => {
    render(
      <UnderstoodSummary
        graph={graph({ processing_nodes: [{ ...graph().processing_nodes[0]!, data_zone: 'Zone C' }] })}
        onChangeAnswer={vi.fn()}
      />,
    );
    expect(screen.getByText(/your firm’s own systems/i)).toBeInTheDocument();
    expect(sectionFor(/where your information will go/i).textContent).not.toMatch(/Zone [ABC]/);
  });

  it('names the supplier when the vendor resolves to a registered one', () => {
    const g = graph({
      processing_nodes: [{ ...graph().processing_nodes[0]!, vendor: 'VENDOR-X', data_zone: 'Zone B' }],
    });
    render(
      <UnderstoodSummary
        graph={g}
        policy={
          {
            vendors: [{ id: 'VENDOR-X', name: 'raw', approved_envelope: {}, satisfies_controls: [], plain_name: 'Acme Supplier' }],
          } as never
        }
        onChangeAnswer={vi.fn()}
      />,
    );
    expect(screen.getByText(/Acme Supplier/)).toBeInTheDocument();
  });
});

describe('UnderstoodSummary — every kind of information, most sensitive first (D-03)', () => {
  it('TC-R16-C-06: lists every distinct data class, most sensitive first, with no bare code', () => {
    const g = graph({
      input_nodes: [
        { id: 'i1', label: 'a', data_class: 'Internal', data_zone: 'Zone B' },
        { id: 'i2', label: 'b', data_class: 'MNPI', data_zone: 'Zone B' },
      ],
    });
    render(<UnderstoodSummary graph={g} onChangeAnswer={vi.fn()} />);
    const section = sectionFor(/the information it will use/i);
    const items = within(section).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(items.some((t) => /price-sensitive/i.test(t))).toBe(true);
    const mnpiIndex = items.findIndex((t) => /price-sensitive/i.test(t));
    const internalIndex = items.findIndex((t) => /everyday business information/i.test(t));
    expect(internalIndex).toBeGreaterThan(mnpiIndex);
    expect(section.textContent).not.toMatch(/\(MNPI\)/);
  });
});

describe('UnderstoodSummary — behaviour, decisions, scale', () => {
  it('describes what it does without naming the model type', () => {
    render(<UnderstoodSummary graph={graph()} onChangeAnswer={vi.fn()} />);
    expect(document.body.textContent).not.toMatch(/\bLLM\b/);
    expect(document.body.textContent).not.toMatch(/\bagentic\b/i);
  });

  it('shows the countries involved when the graph names jurisdictions', () => {
    render(<UnderstoodSummary graph={graph({ jurisdictions: ['UK'] })} onChangeAnswer={vi.fn()} />);
    expect(sectionFor(/how widely it.s used, and where/i).textContent).toMatch(/UK/);
  });

  it('states plainly whether it replaces something', () => {
    const { rerender } = render(
      <UnderstoodSummary
        graph={graph({ processing_nodes: [{ ...graph().processing_nodes[0]!, replaces_prior_model: true }] })}
        onChangeAnswer={vi.fn()}
      />,
    );
    expect(screen.getByText(/replaces something you already use/i)).toBeInTheDocument();
    rerender(<UnderstoodSummary graph={graph()} onChangeAnswer={vi.fn()} />);
    expect(screen.getByText(/doesn’t replace/i)).toBeInTheDocument();
  });
});

describe('UnderstoodSummary — agent-specific sections, only when applicable', () => {
  it('shows what it can reach and whether copies coordinate only when those fields are present', () => {
    const { rerender } = render(<UnderstoodSummary graph={graph()} onChangeAnswer={vi.fn()} />);
    expect(screen.queryByText(/what it can reach by itself/i)).not.toBeInTheDocument();

    const agentGraph = graph({
      processing_nodes: [
        {
          ...graph().processing_nodes[0]!,
          model_type: 'agentic',
          system_access_scope: ['shared_infrastructure'],
          multi_instance_coordination: 'yes',
        },
      ],
    });
    rerender(<UnderstoodSummary graph={agentGraph} onChangeAnswer={vi.fn()} />);
    expect(screen.getByText(/what it can reach by itself/i)).toBeInTheDocument();
    expect(screen.getByText(/whether copies of it work together/i)).toBeInTheDocument();
  });
});

describe('UnderstoodSummary — assumptions (form path) vs uncertain nodes (description path), UC-9', () => {
  const ASSUMPTIONS: Assumption[] = [
    { questionId: '9', question: 'Can the mistake be caught?', assumption: 'it can’t be undone — the strictest case' },
  ];

  it('TC-R16-C-07: form path — every assumption appears under "Things we assumed because you weren’t sure"', () => {
    render(<UnderstoodSummary graph={graph()} assumptions={ASSUMPTIONS} onChangeAnswer={vi.fn()} />);
    expect(screen.getByText(/things we assumed because you weren’t sure/i)).toBeInTheDocument();
    expect(screen.getByText(/it can’t be undone — the strictest case/)).toBeInTheDocument();
    expect(screen.queryByText(/things we couldn’t tell from your description/i)).not.toBeInTheDocument();
  });

  it('TC-R16-C-08: description path — uncertain nodes appear under "Things we couldn’t tell from your description"', () => {
    render(
      <UnderstoodSummary graph={graph()} uncertainNodeIds={['p1']} onChangeAnswer={vi.fn()} />,
    );
    const section = sectionFor(/things we couldn’t tell from your description/i);
    expect(within(section).getByText(/Drafting model/)).toBeInTheDocument();
    expect(screen.queryByText(/things we assumed because you weren’t sure/i)).not.toBeInTheDocument();
  });

  it('neither heading renders when nothing was assumed or uncertain', () => {
    render(<UnderstoodSummary graph={graph()} onChangeAnswer={vi.fn()} />);
    expect(screen.queryByText(/things we assumed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/things we couldn’t tell/i)).not.toBeInTheDocument();
  });
});

describe('UnderstoodSummary — "Change an answer" navigates only, no write (§3)', () => {
  it('TC-R16-C-09: calls onChangeAnswer and performs no write of its own', async () => {
    const user = userEvent.setup();
    const onChangeAnswer = vi.fn();
    render(<UnderstoodSummary graph={graph()} onChangeAnswer={onChangeAnswer} />);
    await user.click(screen.getByRole('button', { name: /change an answer/i }));
    expect(onChangeAnswer).toHaveBeenCalledTimes(1);
  });
});

describe('UnderstoodSummary — the details grid stays collapsed (§3)', () => {
  it('TC-R16-C-10: "Show the details the rules use" holds the existing graphSummaryRows grid', () => {
    render(<UnderstoodSummary graph={graph()} onChangeAnswer={vi.fn()} />);
    expect(screen.getByText(/show the details the rules use/i)).toBeInTheDocument();
    // graphSummaryRows() content is present in the DOM (collapsed <details>
    // still renders its children — same pattern VerdictDisplay's Fold uses).
    expect(screen.getByText(/Client notes/)).toBeInTheDocument();
  });
});

describe('UnderstoodSummary — reserved words (CLAUDE.md)', () => {
  it('renders neither "approved" nor "rejected" anywhere', () => {
    render(
      <UnderstoodSummary
        graph={graph()}
        assumptions={ASSUMPTIONS_FOR_RESERVED_TEST}
        uncertainNodeIds={['p1']}
        onChangeAnswer={vi.fn()}
      />,
    );
    expect(document.body.textContent).not.toMatch(/approved|rejected/i);
  });
});

const ASSUMPTIONS_FOR_RESERVED_TEST: Assumption[] = [
  { questionId: '6', question: 'What happens with the output?', assumption: 'it acts entirely by itself — the strictest case' },
];

describe('UnderstoodSummary — handles a sparse/hand-built graph without crashing', () => {
  it('a graph with no processing or output node renders without throwing', () => {
    expect(() =>
      render(
        <UnderstoodSummary
          graph={{ ...graph(), processing_nodes: [], output_nodes: [], input_nodes: [] }}
          onChangeAnswer={vi.fn()}
        />,
      ),
    ).not.toThrow();
  });
});
