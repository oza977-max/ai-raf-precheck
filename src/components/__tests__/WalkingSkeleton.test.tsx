import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';

// TDD-2 mock budget = 1: the only mock is the external boundary (Anthropic SDK).
// Everything else — IndexedDB via fake-indexeddb, React rendering — is real.
const MOCK_GRAPH_INPUT = {
  input_nodes: [],
  processing_nodes: [
    {
      id: 'p1',
      label: 'email drafting model',
      model_type: 'traditional-ml',
      autonomy_level: 0,
      data_zone: 'Zone C',
      vendor: 'internal',
      replaces_prior_model: false,
    },
  ],
  output_nodes: [
    {
      id: 'o1',
      label: 'drafted email',
      action_type: 'recommend',
      exposure: 'internal-only',
      decision_bindingness: 'material',
      output_reversibility: 'reversible',
      scale: 'limited',
    },
  ],
  edges: [],
  jurisdictions: [],
};

const mockCreate = vi.fn().mockResolvedValue({
  content: [{ type: 'tool_use', name: 'extract_graph', input: MOCK_GRAPH_INPUT }],
});

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

describe('Walking Skeleton', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('aigate:api-key', 'test-key-for-skeleton');
    mockCreate.mockClear();
  });

  it('completes full flow end-to-end with real boundaries', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Step 1: description entry
    const input = screen.getByLabelText(/describe your ai use case/i);
    await user.type(input, 'A tool that drafts client emails');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));

    // Step 2: graph extraction happened (real Anthropic tool_use call, mocked at the SDK boundary)
    // and the graph review step renders the extracted node.
    expect(await screen.findByText(/email drafting model/i)).toBeInTheDocument();

    // Step 3: proceed through the documented P4-C01 pass-through straight to
    // evaluation — evaluate() runs for real against the real appetite.yaml.
    await user.click(screen.getByRole('button', { name: /proceed/i }));

    expect(await screen.findByText('Verdict', { selector: '.verdict__eyebrow' })).toBeInTheDocument();
    expect(screen.getByText(/approved|rejected/i)).toBeInTheDocument();

    // Step 4: register shows the use case row (real IndexedDB store write + read),
    // labelled from the extracted graph's first node per IntakeFlow.tsx.
    expect(screen.getByText('Register', { selector: '.register-card h2' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /email drafting model/i })).toBeInTheDocument();
  });

  it('P4-C02: routes to the structured form on the no-api-key path and completes end-to-end without any LLM call', async () => {
    localStorage.clear(); // no API key configured

    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText(/describe your ai use case/i);
    await user.type(input, 'A tool that drafts client emails');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));

    // Structured intake banner renders instead of the old dead-end message.
    expect(await screen.findByText(/structured intake mode/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/use case name/i), 'Email drafting tool');
    await user.type(screen.getByLabelText(/brief description/i), 'Drafts client emails from notes.');
    await user.selectOptions(screen.getByLabelText(/input data class/i), 'Client PII');
    await user.selectOptions(screen.getByLabelText(/input data zone/i), 'Zone B');
    await user.selectOptions(screen.getByLabelText(/ai model type/i), 'llm');
    await user.selectOptions(screen.getByLabelText(/processing data zone/i), 'Zone B');
    await user.selectOptions(screen.getByLabelText(/output action type/i), 'draft');
    await user.selectOptions(screen.getByLabelText(/output exposure/i), 'internal-only');
    await user.selectOptions(screen.getByLabelText(/decision bindingness/i), 'non-binding');
    await user.selectOptions(screen.getByLabelText(/output reversibility/i), 'reversible');
    await user.selectOptions(screen.getByLabelText(/output scale/i), 'limited');

    await user.click(screen.getByRole('button', { name: /build graph/i }));

    expect(await screen.findByText(/review extracted graph/i)).toBeInTheDocument();
    expect(screen.getAllByText(/email drafting tool/i).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /proceed/i }));

    expect(await screen.findByText('Verdict', { selector: '.verdict__eyebrow' })).toBeInTheDocument();
    expect(screen.getByText(/approved|rejected/i)).toBeInTheDocument();

    // Self-verifying, not just structurally implied: the LLM boundary was
    // never touched on the no-api-key path (review finding, pass 1).
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('P4-C03: an uncertain node generates a real question, answering it reaches a verdict', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'extract_graph',
          input: {
            input_nodes: [],
            processing_nodes: [
              {
                id: 'p1',
                label: 'risk scoring model',
                model_type: 'traditional-ml',
                autonomy_level: 0,
                data_zone: 'Zone A',
                vendor: 'internal',
                replaces_prior_model: false,
                uncertain: true,
              },
            ],
            output_nodes: [
              {
                id: 'o1',
                label: 'risk score',
                action_type: 'recommend',
                exposure: 'internal-only',
                decision_bindingness: 'material',
                output_reversibility: 'reversible',
                scale: 'limited',
              },
            ],
            edges: [],
            jurisdictions: [],
          },
        },
      ],
    });

    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText(/describe your ai use case/i);
    await user.type(input, 'A risk scoring tool for internal use');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));

    expect(await screen.findByText(/risk scoring model/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /proceed/i }));

    // A real targeted question renders — not a skipped/fake step.
    expect(await screen.findByText(/question 1 of/i)).toBeInTheDocument();

    // Answer every generated question until the flow proceeds on its own.
    for (let i = 0; i < 10; i++) {
      const verdictShown = screen.queryByText('Verdict', { selector: '.verdict__eyebrow' });
      if (verdictShown) break;
      const optionButtons = screen.queryAllByRole('button', { name: /Zone [ABC]/ });
      if (optionButtons.length > 0) {
        await user.click(optionButtons[0]!);
        continue;
      }
      const submitAnswer = screen.queryByRole('button', { name: /submit answer/i });
      if (submitAnswer) {
        const textbox = screen.getByLabelText(/your answer/i);
        await user.type(textbox, 'test answer');
        await user.click(submitAnswer);
        continue;
      }
      break;
    }

    expect(await screen.findByText('Verdict', { selector: '.verdict__eyebrow' })).toBeInTheDocument();
  });
});
