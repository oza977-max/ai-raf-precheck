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

    // Step 3: proceed — zero uncertain fields means no questions, so the
    // flow lands directly on the real confirmation/attestation screen
    // (P4-C04, no more silent pass-through).
    await user.click(screen.getByRole('button', { name: /proceed/i }));

    expect(await screen.findByRole('heading', { name: /confirm and evaluate/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));

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

    expect(await screen.findByRole('heading', { name: /confirm and evaluate/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));

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

    // Answer every generated question until the flow reaches confirmation.
    for (let i = 0; i < 10; i++) {
      const confirmButton = screen.queryByRole('button', { name: /confirm and evaluate/i });
      if (confirmButton) break;
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

    // A real "Confirm and evaluate" click is required — UC-6 attestation,
    // not a silent pass-through (P4-C04).
    expect(await screen.findByRole('heading', { name: /confirm and evaluate/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));

    expect(await screen.findByText('Verdict', { selector: '.verdict__eyebrow' })).toBeInTheDocument();
  });

  it('P4-C04: writes graph_confirmed then verdict_produced to the audit trail, in order, before showing the verdict (TC-UC-6-01/02/03)', async () => {
    const uniqueLabel = 'audit ordering check model';
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
                label: uniqueLabel,
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
                label: 'output',
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
    await user.type(input, 'Audit ordering check');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));
    expect(await screen.findByText(uniqueLabel)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /proceed/i }));
    await user.click(await screen.findByRole('button', { name: /confirm and evaluate/i }));
    expect(await screen.findByText('Verdict', { selector: '.verdict__eyebrow' })).toBeInTheDocument();

    const { getUseCases } = await import('../../store/register');
    const { getAll } = await import('../../store/audit');
    const useCases = await getUseCases('all');
    const useCase = useCases.find((u) => u.label === uniqueLabel);
    expect(useCase).toBeDefined();

    const events = await getAll(useCase!.use_case_id);
    expect(events.map((e) => e.event_type)).toEqual(['graph_confirmed', 'verdict_produced']);
    expect(new Date(events[0]!.occurred_at).getTime()).toBeLessThanOrEqual(new Date(events[1]!.occurred_at).getTime());

    expect(events[0]!.actor).toBe('1LoD'); // TC-UC-6-03, against the documented hardcoded-role placeholder

    const verdictPayload = events[1]!.payload;
    expect(verdictPayload.type).toBe('verdict_produced');
    if (verdictPayload.type === 'verdict_produced') {
      expect(verdictPayload.verdict.use_case_id).toBe(useCase!.use_case_id); // TC-UC-6-02: full Verdict object
      expect(verdictPayload.verdict.status).toBeDefined();
      expect(verdictPayload.verdict.attested_by).toBe('1LoD');
    }
  });

  it('P4-C04: a correction made during graph review survives through questionnaire and confirmation to the graph_confirmed audit event (BC-P4C04-03, review finding: full chain, not just one hop)', async () => {
    const uniqueLabel = 'correction survival check model';
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
                label: uniqueLabel,
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
                label: 'output',
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
    await user.type(input, 'Correction survival check');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));
    expect(await screen.findByText(uniqueLabel)).toBeInTheDocument();

    // Make a real correction in graph_review before proceeding.
    const editButtons = screen.getAllByRole('button', { name: /^edit$/i });
    await user.click(editButtons[0]!);
    expect(await screen.findByText(`${uniqueLabel} (corrected)`)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /proceed/i }));
    await user.click(await screen.findByRole('button', { name: /confirm and evaluate/i }));
    expect(await screen.findByText('Verdict', { selector: '.verdict__eyebrow' })).toBeInTheDocument();

    const { getUseCases } = await import('../../store/register');
    const { getAll } = await import('../../store/audit');
    const useCases = await getUseCases('all');
    const useCase = useCases.find((u) => u.label === `${uniqueLabel} (corrected)`);
    expect(useCase).toBeDefined();

    const events = await getAll(useCase!.use_case_id);
    const confirmedEvent = events.find((e) => e.event_type === 'graph_confirmed');
    expect(confirmedEvent).toBeDefined();
    if (confirmedEvent?.payload.type === 'graph_confirmed') {
      expect(confirmedEvent.payload.corrections_count).toBe(1);
    }
  });

  it('P5-C01: "Correct this classification?" re-enters graph_review, reuses the same use case, and appends graph_corrected/verdict_corrected without touching the original verdict_produced event', async () => {
    const uniqueLabel = 'correction flow check model';
    const buildGraphInput = () => ({
      input_nodes: [],
      processing_nodes: [
        {
          id: 'p1',
          label: uniqueLabel,
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
          label: 'output',
          action_type: 'recommend',
          exposure: 'internal-only',
          decision_bindingness: 'material',
          output_reversibility: 'reversible',
          scale: 'limited',
        },
      ],
      edges: [],
      jurisdictions: [],
    });
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', name: 'extract_graph', input: buildGraphInput() }],
    });

    const user = userEvent.setup();
    render(<App />);

    // First pass: reach a verdict normally.
    const input = screen.getByLabelText(/describe your ai use case/i);
    await user.type(input, 'Correction flow check');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));
    expect(await screen.findByText(uniqueLabel)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /proceed/i }));
    await user.click(await screen.findByRole('button', { name: /confirm and evaluate/i }));
    expect(await screen.findByText('Verdict', { selector: '.verdict__eyebrow' })).toBeInTheDocument();

    const { getUseCases } = await import('../../store/register');
    const { getAll } = await import('../../store/audit');
    const useCasesBefore = await getUseCases('all');
    const useCase = useCasesBefore.find((u) => u.label === uniqueLabel);
    expect(useCase).toBeDefined();
    const useCaseId = useCase!.use_case_id;

    const eventsBeforeCorrection = await getAll(useCaseId);
    expect(eventsBeforeCorrection.map((e) => e.event_type)).toEqual(['graph_confirmed', 'verdict_produced']);
    const originalVerdictEvent = eventsBeforeCorrection[1]!;

    // Click "Correct this classification?" — re-enters graph_review.
    await user.click(screen.getByRole('button', { name: /correct this classification/i }));
    expect(await screen.findByText(/review extracted graph/i)).toBeInTheDocument();

    // Make a correction, then walk back through to a new verdict.
    const editButtons = screen.getAllByRole('button', { name: /^edit$/i });
    await user.click(editButtons[0]!);
    await user.click(screen.getByRole('button', { name: /proceed/i }));
    await user.click(await screen.findByRole('button', { name: /confirm and evaluate/i }));
    expect(await screen.findByText('Verdict', { selector: '.verdict__eyebrow' })).toBeInTheDocument();

    // Same use case, not a new one (BC-P5C01-01).
    const useCasesAfter = await getUseCases('all');
    const matchingUseCases = useCasesAfter.filter((u) => u.use_case_id === useCaseId);
    expect(matchingUseCases).toHaveLength(1);

    const eventsAfterCorrection = await getAll(useCaseId);
    expect(eventsAfterCorrection.map((e) => e.event_type)).toEqual([
      'graph_confirmed',
      'verdict_produced',
      'graph_corrected',
      'verdict_corrected',
    ]);

    // The original verdict_produced event is byte-identical — never modified.
    expect(eventsAfterCorrection[1]).toEqual(originalVerdictEvent);

    const verdictCorrectedEvent = eventsAfterCorrection[3]!;
    if (verdictCorrectedEvent.payload.type === 'verdict_corrected') {
      expect(verdictCorrectedEvent.payload.original_verdict_id).toBe(
        originalVerdictEvent.payload.type === 'verdict_produced' ? originalVerdictEvent.payload.verdict.id : undefined,
      );
    }
  });
});
