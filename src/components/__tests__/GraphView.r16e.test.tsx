import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GraphView from '../GraphView';
import { FIELD_CONSEQUENCES } from '../field-copy';
import type { DataFlowGraph } from '../../engine/types';

// R16-E §4 (D-103, DR7-26/30/33). The review screen's own words: card
// titles, no field code beside any label, reworded provenance/badges/
// confirm buttons/gate note/ignored-jurisdictions note, the description
// path's own plausibility wording, and the narrow-window reflow rule.

function makeGraph(overrides: Partial<DataFlowGraph> = {}): DataFlowGraph {
  return {
    id: 'g1',
    version: 1,
    intake_method: 'llm',
    extracted_at: '2026-01-01T00:00:00.000Z',
    input_nodes: [{ id: 'i1', label: 'credit risk data', data_class: 'Client PII', data_zone: 'Zone C' }],
    processing_nodes: [
      {
        id: 'p1',
        label: 'drafting model',
        model_type: 'llm',
        autonomy_level: 1,
        data_zone: 'Zone C',
        vendor: 'internal',
        replaces_prior_model: false,
      },
    ],
    output_nodes: [
      {
        id: 'o1',
        label: 'draft email',
        action_type: 'draft',
        exposure: 'internal-only',
        decision_bindingness: 'non-binding',
        output_reversibility: 'reversible',
        scale: 'limited',
      },
    ],
    edges: [],
    jurisdictions: [],
    ...overrides,
  };
}

describe('GraphView — card titles (R16-E §4, DR7-26)', () => {
  it('TC-R16-E-40: the three columns are titled "What it uses" / "The AI" / "What comes out"', () => {
    render(<GraphView graph={makeGraph()} />);
    expect(screen.getByText('What it uses')).toBeInTheDocument();
    expect(screen.getByText('The AI')).toBeInTheDocument();
    expect(screen.getByText('What comes out')).toBeInTheDocument();
    expect(screen.queryByText('Input data')).not.toBeInTheDocument();
    expect(screen.queryByText('Processing')).not.toBeInTheDocument();
    expect(screen.queryByText('Output')).not.toBeInTheDocument();
  });
});

describe('GraphView — field rows carry no code beside the label (R16-E §4, "No code beside any label")', () => {
  it('TC-R16-E-41: data_class\'s row label is QUESTIONNAIRE_COPY\'s shortLabel, with no <code> element anywhere on the card', () => {
    const { container } = render(<GraphView graph={makeGraph()} />);
    expect(screen.getByText('what information it uses')).toBeInTheDocument();
    expect(container.querySelector('code.graph-node__field-code')).toBeNull();
    expect(container.querySelector('.graph-node code')).toBeNull();
  });

  it('TC-R16-E-41b: vendor and declared_model_id rows use their own shortLabel, never the bare word "vendor"/"model"', () => {
    render(
      <GraphView
        graph={makeGraph({
          processing_nodes: [{ ...makeGraph().processing_nodes[0]!, vendor: 'Acme', declared_model_id: 'gpt-4o' }],
        })}
      />,
    );
    expect(screen.getByText('which supplier it is')).toBeInTheDocument();
    expect(screen.getByText('which model it is')).toBeInTheDocument();
  });
});

describe('GraphView — provenance and badge wording (R16-E §4, F1B-1)', () => {
  it('TC-R16-E-42: a verified quote reads "From your description: "{quote}""', () => {
    render(
      <GraphView
        graph={makeGraph()}
        editable
        unconfirmedNodeIds={[]}
        onConfirmNode={vi.fn()}
        provenance={{ i1: { data_class: 'credit risk data' } }}
      />,
    );
    expect(screen.getByText(/from your description: “credit risk data”/i)).toBeInTheDocument();
  });

  it('TC-R16-E-43: a guessed field reads "Not in your description — check this, or it becomes a question"', () => {
    render(
      <GraphView graph={makeGraph()} editable unconfirmedNodeIds={[]} onConfirmNode={vi.fn()} guessedFields={{ i1: ['data_class'] }} />,
    );
    expect(screen.getByText('Not in your description — check this, or it becomes a question')).toBeInTheDocument();
  });

  it('TC-R16-E-44: a confident-but-unquoted field reads "Not in your description — please check this"', () => {
    // CR7-02 (6): provenance={{}} = a real extraction with nothing quoted.
    render(<GraphView graph={makeGraph()} editable unconfirmedNodeIds={[]} onConfirmNode={vi.fn()} provenance={{}} />);
    expect(screen.getAllByText('Not in your description — please check this').length).toBeGreaterThan(0);
  });
});

describe('GraphView — the confirm button\'s two forms (R16-E §4, D-103, v2.2)', () => {
  it('TC-R16-E-45: an ordinary card reads "This is right"; an uncertain card reads "I\'ve checked this — it\'s right"', () => {
    const uncertainGraph = makeGraph();
    uncertainGraph.processing_nodes[0]!.uncertain = true;
    render(<GraphView graph={uncertainGraph} editable unconfirmedNodeIds={['i1', 'p1', 'o1']} onConfirmNode={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /^this is right$/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^i.ve checked this — it.s right$/i })).toBeInTheDocument();
  });

  it('TC-R16-E-46: a confirmed card reads "Checked by you." — never "Confirmed by you."', () => {
    render(
      <GraphView graph={makeGraph()} editable unconfirmedNodeIds={[]} onConfirmNode={vi.fn()} />,
    );
    expect(screen.getAllByText('Checked by you.').length).toBeGreaterThan(0);
    expect(screen.queryByText('Confirmed by you.')).not.toBeInTheDocument();
  });
});

describe('GraphView — the gate note and the ignored-jurisdictions note (R16-E §4, D-103)', () => {
  it('TC-R16-E-47: the gate note reads "We read these details from your description — nothing is decided until you\'ve checked or corrected each one."', () => {
    render(<GraphView graph={makeGraph()} editable unconfirmedNodeIds={['i1']} onConfirmNode={vi.fn()} />);
    expect(
      screen.getByText('We read these details from your description — nothing is decided until you’ve checked or corrected each one.'),
    ).toBeInTheDocument();
  });

  it('TC-R16-E-48: a single ignored jurisdiction reads "We ignored "{x}" — it isn\'t one of the countries your firm\'s rules cover."', () => {
    render(<GraphView graph={makeGraph()} ignoredJurisdictions={['Internal']} />);
    expect(screen.getByText(/we ignored “internal” — it isn.t one of the countries your firm.s rules cover/i)).toBeInTheDocument();
  });
});

describe('GraphView — the description path\'s own plausibility wording (R16-E §4, v2.1, F1B-1)', () => {
  it('TC-R16-E-49: names the card and the row — never a form question', () => {
    render(
      <GraphView
        graph={makeGraph()}
        editable
        unconfirmedNodeIds={[]}
        onConfirmNode={vi.fn()}
        warnings={[{ node_id: 'p1', field: 'autonomy_level', signal: 'sounds-autonomous' }]}
      />,
    );
    expect(
      screen.getByText(/we read that a person is involved\. Check “how much it does without a person” on the card “The AI”\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/where does the ai come from/i)).not.toBeInTheDocument();
  });
});

describe('GraphView — narrow windows reflow, never scroll sideways (R16-E §4, v2.1, WCAG 1.4.10)', () => {
  it('TC-R16-E-50: App.css stacks the cards in one column below 480px and no longer lets the graph scroll sideways', () => {
    const css = readFileSync(resolve(__dirname, '../../App.css'), 'utf-8');
    // Exactly the 480px block — up to its own closing brace, not the end of
    // the file (review pass 3: the rule could otherwise match a later block).
    const start = css.indexOf('@media (max-width: 480px)');
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    let end = -1;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
      if (css[i] === '{') depth++;
      if (css[i] === '}' && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    const mediaBlock = css.slice(start, end);
    expect(mediaBlock).toMatch(/\.graph-view\s*\{[^}]*flex-direction:\s*column/);
    // The old escape hatch (sideways scroll, "cannot reflow") is gone.
    expect(css).not.toMatch(/graph-view[^{]*\{\s*overflow-x:\s*auto/);
    expect(css).not.toMatch(/cannot reflow/);
  });
});

// §8's guard test for this screen specifically.
describe('GraphView — guard: no engine vocabulary reaches this screen (§8)', () => {
  it('TC-R16-E-39c: a fully-populated graph renders with no banned word — every card\'s "why" lines opened first', async () => {
    const BANNED = /\bZone A\b|\bZone B\b|\bZone C\b|\bdata_class\b|\bDATA_ZONE\b|\bautonomy\b|\bLLM\b|\bHITL\b|\bbinding\b|\bgraph\b|\bextract\w*|model proposed|\bguess(?:ed|ing)\b|local model|\bunregistered\b|parse-error|no-key/i;
    const g = makeGraph({
      processing_nodes: [
        {
          id: 'p1',
          label: 'agent',
          model_type: 'agentic',
          autonomy_level: 4,
          data_zone: 'Zone A',
          vendor: 'an AI service you weren’t sure about',
          replaces_prior_model: false,
          system_access_scope: ['shared_infrastructure', 'credentialed_systems'],
          multi_instance_coordination: 'unknown',
        },
      ],
      output_nodes: [
        { ...makeGraph().output_nodes[0]!, action_type: 'approve', decision_bindingness: 'binding', output_reversibility: 'unknown' },
      ],
      jurisdictions: [],
    });
    const { container } = render(
      <GraphView
        graph={g}
        editable
        unconfirmedNodeIds={['i1', 'p1', 'o1']}
        onConfirmNode={vi.fn()}
        guessedFields={{ p1: ['vendor'] }}
        ignoredJurisdictions={['Internal']}
        warnings={[{ node_id: 'p1', field: 'autonomy_level', signal: 'sounds-autonomous' }]}
      />,
    );
    // R16-E review pass 4: the "why" lines are hidden until clicked, so a
    // scan of the closed cards never read them — and one said "binding".
    const user = userEvent.setup();
    for (const b of screen.getAllByRole('button', { name: /why these values matter/i })) await user.click(b);
    expect(container.querySelectorAll('.graph-node__consequence').length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(BANNED);
  });

  // R16-E review pass 4. Every "why" line, not just the ones a fixture
  // happens to show — and none of the reviewer's or the engine's own terms
  // either, which the screen-wide list above doesn't carry.
  it('TC-R16-E-83: every "Why these values matter" line is in plain words — no banned word, and no reviewer or engine term', () => {
    const BANNED = /\bZone A\b|\bZone B\b|\bZone C\b|\bdata_class\b|\bDATA_ZONE\b|\bautonomy\b|\bLLM\b|\bHITL\b|\bbinding\b|\bgraph\b|\bextract\w*|model proposed|\bguess(?:ed|ing)\b|local model|\bunregistered\b|parse-error|no-key/i;
    const REVIEWER_TERMS = /approved|rejected|\bregistry\b|\bfloors?\b|\bseverity\b|\binstances?\b|\bincident\b|\blevels? \d|\bhard lines?\b|\bzone\b|\bvendor\b|\bgovernance\b|\bappetite\b|\bexposure\b/i;
    const lines = Object.entries(FIELD_CONSEQUENCES);
    expect(lines.length).toBeGreaterThanOrEqual(15);
    for (const [field, line] of lines) {
      expect(line, field).not.toMatch(BANNED);
      expect(line, field).not.toMatch(REVIEWER_TERMS);
    }
  });
});

// Found by R16-E review pass 1: a node can carry 'unknown' (a model reading,
// or "Not sure" on the copies question) but QUESTIONNAIRE_COPY's options are
// the CHOOSABLE answers and deliberately omit it — so the row printed the bare
// word "unknown". It now reads like the summary does.
describe('GraphView — values a node can carry but nobody chooses still read in words', () => {
  it('TC-R16-E-76: "unknown" on whether a mistake can be put right, and on whether copies work together, shows plain words — never the bare value', () => {
    const base = makeGraph();
    const graph = makeGraph({
      processing_nodes: [{ ...base.processing_nodes[0]!, model_type: 'agentic', multi_instance_coordination: 'unknown' }],
      output_nodes: [{ ...base.output_nodes[0]!, output_reversibility: 'unknown' }],
    });
    const { container } = render(<GraphView graph={graph} />);
    expect(screen.getByText('Not known whether a mistake can be put right')).toBeInTheDocument();
    expect(screen.getByText('Not known whether copies of it, or other AI agents, pass work to each other')).toBeInTheDocument();
    // No row value is the bare engine word.
    const values = [...container.querySelectorAll('dd, .graph-node__value')].map((el) => el.textContent?.trim());
    expect(values).not.toContain('unknown');
    expect(container.textContent).not.toMatch(/(^|[^a-z])unknown([^a-z]|$)/);
  });
});

// Found by R16-E review pass 2: the supplier row printed the recorded value
// as-is — a registered supplier's internal id ("VENDOR-APPROVED-LLM") or the
// engine's "internal" — because GraphView never received the registry.
describe('GraphView — a recorded supplier reads as a name, never an internal id', () => {
  const policy = {
    vendors: [{ id: 'VENDOR-APPROVED-LLM', name: 'raw', approved_envelope: {}, satisfies_controls: [], plain_name: 'Your firm’s company AI assistant account' }],
    platforms: [],
  } as unknown as import('../../engine/types').PolicyFile;
  const withVendor = (vendor: string) =>
    makeGraph({ processing_nodes: [{ ...makeGraph().processing_nodes[0]!, vendor }] });

  it('TC-R16-E-78: a registered supplier shows its plain name; built in-house reads in words; a typed name shows as written', () => {
    const { unmount } = render(<GraphView graph={withVendor('VENDOR-APPROVED-LLM')} policy={policy} />);
    expect(screen.getByText('Your firm’s company AI assistant account')).toBeInTheDocument();
    expect(screen.queryByText('VENDOR-APPROVED-LLM')).not.toBeInTheDocument();
    unmount();

    const inHouse = render(<GraphView graph={withVendor('internal')} policy={policy} />);
    expect(screen.getByText('None — your firm built it')).toBeInTheDocument();
    expect(screen.queryByText(/^internal$/)).not.toBeInTheDocument();
    inHouse.unmount();

    render(<GraphView graph={withVendor('Acme Robotics (not on your firm’s list)')} policy={policy} />);
    expect(screen.getByText('Acme Robotics (not on your firm’s list)')).toBeInTheDocument();
  });

  it('TC-R16-E-81: a column the description gave nothing for says so in plain words', () => {
    render(<GraphView graph={makeGraph({ input_nodes: [] })} />);
    expect(screen.getByText('Nothing found in your description')).toBeInTheDocument();
    expect(screen.queryByText(/extracted/i)).not.toBeInTheDocument();
  });
});

describe('GraphView — the decision menu never offers two identical choices', () => {
  it('TC-R16-E-79: the legacy lending value is not offered beside the current one; when it is the recorded value it is marked as the older answer', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const user = userEvent.setup();
    const graph = makeGraph({ output_nodes: [{ ...makeGraph().output_nodes[0]!, decision_type: 'operational' }] });
    const { unmount } = render(<GraphView graph={graph} editable onCorrect={vi.fn()} />);
    await user.click(screen.getAllByRole('button', { name: /^edit$/i }).at(-1)!);
    const lendingOptions = () =>
      [...document.querySelectorAll('option')].filter((o) => /whether to lend to someone/i.test(o.textContent ?? ''));
    expect(lendingOptions()).toHaveLength(1);
    unmount();

    const legacy = makeGraph({ output_nodes: [{ ...makeGraph().output_nodes[0]!, decision_type: 'lending-decision' }] });
    render(<GraphView graph={legacy} editable onCorrect={vi.fn()} />);
    await user.click(screen.getAllByRole('button', { name: /^edit$/i }).at(-1)!);
    const texts = lendingOptions().map((o) => o.textContent);
    expect(texts).toHaveLength(2);
    expect(texts.some((t) => /\(older answer\)$/.test(t ?? ''))).toBe(true);
    expect(new Set(texts).size).toBe(2);
  });
});
