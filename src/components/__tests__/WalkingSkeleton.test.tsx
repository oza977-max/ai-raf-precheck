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
    // Navigate to the Register view (P6-C01) via the sidebar.
    await user.click(screen.getByText('▤ Register'));
    expect(await screen.findByText('Register', { selector: '.register-view h2' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /email drafting model/i })).toBeInTheDocument();

    // TC-LC-2-01 (P6-C02): this fixture is internal-only exposure → Low
    // tier → self-service workflow → the register node is created with
    // lifecycle_stage 'approved' directly (routeToWorkflow(), not the old
    // hardcoded 'idea'). Switch to 2LoD to see the stage filter chip.
    await user.selectOptions(screen.getByLabelText(/role/i), '2LoD');
    expect(await screen.findByRole('button', { name: 'approved' })).toBeInTheDocument();
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

    // A real targeted question renders — not a skipped/fake step. V1.2-B:
    // the progress line now carries the budget + provisional tier.
    expect(await screen.findByText(/0 \/ \d+ · budget ≤\d+ \(provisional /i)).toBeInTheDocument();

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

    // Make a real correction in graph_review before proceeding — V1.1-C01:
    // a genuine field edit through the correction editor, not the old
    // stub that appended " (corrected)" to the label.
    await user.click(screen.getAllByRole('button', { name: /^edit$/i })[0]!);
    const zoneSelect = await screen.findByLabelText(`${uniqueLabel} — data zone`);
    await user.selectOptions(zoneSelect, 'Zone B');
    expect(zoneSelect).toHaveValue('Zone B');

    await user.click(screen.getByRole('button', { name: /proceed/i }));
    await user.click(await screen.findByRole('button', { name: /confirm and evaluate/i }));
    expect(await screen.findByText('Verdict', { selector: '.verdict__eyebrow' })).toBeInTheDocument();

    const { getUseCases } = await import('../../store/register');
    const { getAll } = await import('../../store/audit');
    const useCases = await getUseCases('all');
    const useCase = useCases.find((u) => u.label === uniqueLabel);
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
    await user.type(input, 'Quartz xylophone probe intake');
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

    // Make a real field correction, then walk back through to a new verdict.
    await user.click(screen.getAllByRole('button', { name: /^edit$/i })[0]!);
    await user.selectOptions(await screen.findByLabelText(`${uniqueLabel} — data zone`), 'Zone B');
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

  it('a genuine engine failure (no-track-match) shows an error and returns to graph_review instead of hanging on "Evaluating..." forever (live-found gap, now fixed)', async () => {
    localStorage.clear(); // no API key — structured form path, reproduces the exact scenario found live

    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText(/describe your ai use case/i);
    await user.type(input, 'No track match check');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));
    expect(await screen.findByText(/structured intake mode/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/use case name/i), 'No track match tool');
    await user.type(screen.getByLabelText(/brief description/i), 'A tool with no matching track rule.');
    await user.selectOptions(screen.getByLabelText(/input data class/i), 'Internal');
    await user.selectOptions(screen.getByLabelText(/input data zone/i), 'Zone C');
    // deep-learning + non-binding matches no TRACK-* rule in appetite.yaml — a genuine no-track-match.
    await user.selectOptions(screen.getByLabelText(/ai model type/i), 'deep-learning');
    await user.selectOptions(screen.getByLabelText(/processing data zone/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/output action type/i), 'read');
    await user.selectOptions(screen.getByLabelText(/output exposure/i), 'internal-only');
    await user.selectOptions(screen.getByLabelText(/decision bindingness/i), 'non-binding');
    await user.selectOptions(screen.getByLabelText(/output reversibility/i), 'reversible');
    await user.selectOptions(screen.getByLabelText(/output scale/i), 'limited');
    await user.click(screen.getByRole('button', { name: /build graph/i }));

    await user.click(screen.getByRole('button', { name: /proceed/i }));
    await user.click(await screen.findByRole('button', { name: /confirm and evaluate/i }));

    // Must NOT hang on "Evaluating..." — a real error renders and the
    // flow returns to graph_review, not a dead end.
    expect(await screen.findByRole('alert')).toHaveTextContent(/evaluation could not complete/i);
    expect(await screen.findByText(/review extracted graph/i)).toBeInTheDocument();
  });

  it('TC-LC-2-02 (P6-C02): a High-tier verdict routes the register node to lifecycle_stage "pre_checked" pending 2LoD approval, not auto-approved', async () => {
    localStorage.clear(); // no API key — structured form path, deterministic tier

    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText(/describe your ai use case/i);
    await user.type(input, 'High tier routing check');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));
    expect(await screen.findByText(/structured intake mode/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/use case name/i), 'High tier tool');
    await user.type(screen.getByLabelText(/brief description/i), 'Client-facing decision support.');
    await user.selectOptions(screen.getByLabelText(/input data class/i), 'Internal');
    await user.selectOptions(screen.getByLabelText(/input data zone/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/ai model type/i), 'traditional-ml');
    await user.selectOptions(screen.getByLabelText(/processing data zone/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/output action type/i), 'recommend');
    // client-facing exposure trips TIER-HIGH (policy/appetite.yaml).
    await user.selectOptions(screen.getByLabelText(/output exposure/i), 'client-facing');
    await user.selectOptions(screen.getByLabelText(/decision bindingness/i), 'material');
    await user.selectOptions(screen.getByLabelText(/output reversibility/i), 'reversible');
    await user.selectOptions(screen.getByLabelText(/output scale/i), 'limited');
    await user.click(screen.getByRole('button', { name: /build graph/i }));

    await user.click(screen.getByRole('button', { name: /proceed/i }));
    await user.click(await screen.findByRole('button', { name: /confirm and evaluate/i }));

    expect(await screen.findByText('Verdict', { selector: '.verdict__eyebrow' })).toBeInTheDocument();

    await user.click(screen.getByText('▤ Register'));
    await user.selectOptions(screen.getByLabelText(/role/i), '2LoD');
    expect(await screen.findByRole('button', { name: 'pre_checked' })).toBeInTheDocument();
  });

  it('P5-C02: the real LLM-generated reasoning trace renders in the verdict details section', async () => {
    // Distinguish calls by shape, not by queue order: extractGraph() and
    // confirmSemanticDuplicate() both pass `tools`; generateReasoningTrace()
    // does not. Robust against an extra duplicate-check LLM call shifting
    // a plain call-order queue out of sync.
    mockCreate.mockImplementation(async (args: { tools?: unknown }) => {
      if (args.tools) {
        return { content: [{ type: 'tool_use', name: 'extract_graph', input: MOCK_GRAPH_INPUT }] };
      }
      return {
        content: [{ type: 'text', text: 'Track II applies because the model produces a quantitative recommendation.' }],
      };
    });

    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText(/describe your ai use case/i);
    await user.type(input, 'Zxqvw plumbing inventory forecaster xyzzy');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));
    expect(await screen.findByText(/review extracted graph/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /proceed/i }));
    await user.click(await screen.findByRole('button', { name: /confirm and evaluate/i }));

    expect(await screen.findByText('Verdict', { selector: '.verdict__eyebrow' })).toBeInTheDocument();
    await user.click(screen.getByText(/reasoning trace/i));
    expect(
      await screen.findByText(/track ii applies because the model produces a quantitative recommendation/i),
    ).toBeInTheDocument();
  });

  it('TC-LC-4-02 (P7-C01): AIGate evaluates itself on first launch and appears in the register with a real verdict, without any user action', async () => {
    const user = userEvent.setup();
    render(<App />);

    // No submission action taken — the seed fires from a mount effect, not
    // from anything the user does. Only navigate to see it.
    await user.click(screen.getByText('▤ Register'));
    await user.selectOptions(screen.getByLabelText(/role/i), '2LoD');

    expect(await screen.findByText('AIGate (self-assessment)')).toBeInTheDocument();
  });

  it('P7-C03 Part A: AIGate self-assessment seeds exactly once across a genuine app re-mount, not just within one mount (extends P7-C01\'s single-mount race test)', async () => {
    const first = render(<App />);
    await first.findByText('▤ Register');
    // Give the mount-effect's seed a tick to complete before unmounting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    first.unmount();

    const second = render(<App />);
    await second.findByText('▤ Register');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const { exportAll } = await import('../../store/register');
    const { nodes } = await exportAll();
    const aigateNodes = nodes.filter((n) => n.node_id === 'aigate-self-assessment');
    expect(aigateNodes).toHaveLength(1);
  });

  it('P7-C03 Part B: saving a valid policy via the Appetite framework editor is a real save — queues re-evaluation for existing active use cases and updates the header\'s policy version', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('§ Appetite framework'));
    const textarea = await screen.findByLabelText(/policy yaml/i);
    const originalYaml = (textarea as HTMLTextAreaElement).value;
    expect(originalYaml).toContain('version: "1.0"');

    const updatedYaml = originalYaml.replace('version: "1.0"', 'version: "1.1"');
    await user.click(textarea);
    await user.clear(textarea);
    await user.paste(updatedYaml);

    // SettingsPanel also has a (disabled) "Save" button — disambiguate.
    const saveButtons = screen.getAllByRole('button', { name: /^save$/i });
    await user.click(saveButtons.find((b) => !b.hasAttribute('disabled'))!);

    expect(await screen.findByText(/policy saved.*queued for re-evaluation/i)).toBeInTheDocument();

    // Header badge reflects the newly saved version without a page reload.
    // (findAllBy: the V1.2-C appetite view's meta line also shows the
    // version, so a single-match query would be ambiguous.)
    expect((await screen.findAllByText(/policy v1\.1/)).length).toBeGreaterThan(0);

    // A real save, not just a UI message: at least one previously-existing
    // active use case (from earlier tests in this file, sharing IndexedDB)
    // now has a re_evaluation_queued event for the new version.
    const { getUseCases } = await import('../../store/register');
    const { getAll } = await import('../../store/audit');
    const allUseCases = await getUseCases('all');
    let foundQueuedEvent = false;
    for (const uc of allUseCases) {
      const events = await getAll(uc.use_case_id);
      if (
        events.some(
          (e) => e.event_type === 're_evaluation_queued' && e.payload.type === 're_evaluation_queued' && e.payload.policy_version === '1.1',
        )
      ) {
        foundQueuedEvent = true;
        break;
      }
    }
    expect(foundQueuedEvent).toBe(true);
  });

  it('V1.2-C / UC-2: the duplicate match card is REDACTED for 1LoD — tier shown, label never rendered', async () => {
    localStorage.clear(); // no API key -> keyword duplicate path, and role defaults to 1LoD
    const { addNode } = await import('../../store/register');
    const existingLabel = 'quorix zenbat flumtrek engine';
    await addNode({
      node_id: crypto.randomUUID(),
      node_type: 'use_case',
      label: existingLabel,
      created_at: new Date().toISOString(),
      metadata: {
        node_type: 'use_case',
        submitted_by: 'someone-else',
        lifecycle_stage: 'approved',
        current_verdict_id: null,
        tier: 'High',
        track: 'II',
      },
    });

    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByLabelText(/describe your ai use case/i);
    // High keyword overlap with the seeded label -> keyword duplicate hit.
    await user.type(input, 'quorix zenbat flumtrek checker');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));

    // Structured form path; build a minimal graph to reach graph review.
    expect(await screen.findByText(/structured intake mode/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/use case name/i), 'Redaction probe');
    await user.type(screen.getByLabelText(/brief description/i), 'x');
    await user.selectOptions(screen.getByLabelText(/input data class/i), 'Internal');
    await user.selectOptions(screen.getByLabelText(/input data zone/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/ai model type/i), 'traditional-ml');
    await user.selectOptions(screen.getByLabelText(/processing data zone/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/output action type/i), 'recommend');
    await user.selectOptions(screen.getByLabelText(/output exposure/i), 'internal-only');
    await user.selectOptions(screen.getByLabelText(/decision bindingness/i), 'material');
    await user.selectOptions(screen.getByLabelText(/output reversibility/i), 'reversible');
    await user.selectOptions(screen.getByLabelText(/output scale/i), 'limited');
    await user.click(screen.getByRole('button', { name: /build graph/i }));

    expect(await screen.findByText(/one similar use case exists/i)).toBeInTheDocument();
    expect(screen.getByText(/tier High/)).toBeInTheDocument();
    expect(screen.getByText(/full detail is visible to the 2nd line of defence/i)).toBeInTheDocument();
    // BC-V12C-02: the matched label must be unreachable in the DOM.
    expect(screen.queryByText(new RegExp(existingLabel, 'i'))).not.toBeInTheDocument();
  });

  it('V1.2-C / UC-2: 2LoD sees the full duplicate match detail including the label', async () => {
    localStorage.clear();
    localStorage.setItem('aigate:role', '2LoD');
    const { addNode } = await import('../../store/register');
    const existingLabel = 'brindle vexomat quarlune pipeline';
    await addNode({
      node_id: crypto.randomUUID(),
      node_type: 'use_case',
      label: existingLabel,
      created_at: new Date().toISOString(),
      metadata: {
        node_type: 'use_case',
        submitted_by: 'someone-else',
        lifecycle_stage: 'approved',
        current_verdict_id: null,
        tier: 'Medium',
        track: 'III',
      },
    });

    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText(/describe your ai use case/i), 'brindle vexomat quarlune probe');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));

    expect(await screen.findByText(/structured intake mode/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/use case name/i), 'Full detail probe');
    await user.type(screen.getByLabelText(/brief description/i), 'x');
    await user.selectOptions(screen.getByLabelText(/input data class/i), 'Internal');
    await user.selectOptions(screen.getByLabelText(/input data zone/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/ai model type/i), 'traditional-ml');
    await user.selectOptions(screen.getByLabelText(/processing data zone/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/output action type/i), 'recommend');
    await user.selectOptions(screen.getByLabelText(/output exposure/i), 'internal-only');
    await user.selectOptions(screen.getByLabelText(/decision bindingness/i), 'material');
    await user.selectOptions(screen.getByLabelText(/output reversibility/i), 'reversible');
    await user.selectOptions(screen.getByLabelText(/output scale/i), 'limited');
    await user.click(screen.getByRole('button', { name: /build graph/i }));

    expect(await screen.findByText(/one similar use case exists/i)).toBeInTheDocument();
    expect(screen.getByText(existingLabel)).toBeInTheDocument();
  });
});
