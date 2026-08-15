import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import appetiteYaml from '../../../policy/appetite.yaml?raw';
import { setCurrentPolicyYaml } from '../../store/policy-source';

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
    await user.click(await screen.findByRole('button', { name: /this is a new use case/i }));

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

    // TC-LC-2-01 (P6-C02): routeToWorkflow() drives the lifecycle stage from
    // the tier, not a hardcoded 'idea'. This fixture is internal-only but
    // MATERIAL, which oracle round 001 made a Medium-tier trigger — tiering
    // previously ignored how much weight the output carried, so an internal
    // material decision self-served on exposure alone. Medium is 2LoD-notify,
    // so the node lands at 'pre_checked'. Switch to 2LoD to see the chip.
    await user.selectOptions(screen.getByLabelText(/role/i), '2LoD');
    expect(await screen.findByRole('button', { name: 'pre_checked' })).toBeInTheDocument();
  });

  it('P4-C02: routes to the structured form on the no-api-key path and completes end-to-end without any LLM call [TC-NF-4-01]', async () => {
    localStorage.clear(); // no API key configured

    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText(/describe your ai use case/i);
    await user.type(input, 'A tool that drafts client emails');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));
    await user.click(await screen.findByRole('button', { name: /this is a new use case/i }));

    // Structured intake banner renders instead of the old dead-end message.
    expect(await screen.findByText(/guided intake — answer the fields below/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/what do you want to call it/i), 'Email drafting tool');
    await user.type(screen.getByLabelText(/in a sentence or two/i), 'Drafts client emails from notes.');
    await user.selectOptions(screen.getByLabelText(/what kind of information does it use/i), 'Client PII');
    await user.selectOptions(screen.getByLabelText(/where does that information sit today/i), 'Zone B');
    await user.selectOptions(screen.getByLabelText(/what kind of ai is it/i), 'llm');
    await user.selectOptions(screen.getByLabelText(/where does the ai itself run/i), 'Zone B');
    await user.selectOptions(screen.getByLabelText(/what does it actually produce or do/i), 'draft');
    await user.selectOptions(screen.getByLabelText(/who sees what it produces/i), 'internal-only');
    await user.selectOptions(screen.getByLabelText(/how much weight does its output carry/i), 'non-binding');
    await user.selectOptions(screen.getByLabelText(/if it gets something wrong/i), 'reversible');
    await user.selectOptions(screen.getByLabelText(/how widely is it used/i), 'limited');

    // P8-C01 upstream fix: R3-JU-1 requires an explicit jurisdiction answer.
    // These journeys previously proceeded having told the engine nothing about
    // where the system operates.
    await user.click(screen.getByLabelText(/none.*not sure/i));
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(await screen.findByText(/review extracted graph/i)).toBeInTheDocument();
    expect(screen.getAllByText(/email drafting tool/i).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /proceed/i }));

    expect(await screen.findByRole('heading', { name: /confirm and evaluate/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));

    expect(await screen.findByText('Verdict', { selector: '.verdict__eyebrow' })).toBeInTheDocument();
    expect(screen.getByText(/approved|rejected/i)).toBeInTheDocument();

    // V1.3: proof-carrying controls — this Client-PII flow requires
    // CTRL-ENC-01, which carries the starter YAML's worked verification
    // example, so the CS-1 panel shows a VERIFIED chip.
    expect(screen.getByText(/minimal control set \(CS-1\)/i)).toBeInTheDocument();
    expect(screen.getByText('VERIFIED')).toBeInTheDocument();

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
    await user.click(await screen.findByRole('button', { name: /this is a new use case/i }));

    expect(await screen.findByText(/risk scoring model/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /proceed/i }));

    // A real targeted question renders — not a skipped/fake step. V1.2-B:
    // the progress line now carries the budget + provisional tier.
    expect(await screen.findByText(/0 \/ \d+ · budget ≤\d+ \(provisional /i)).toBeInTheDocument();

    // Answer every generated question until the flow reaches confirmation.
    // V2-C: a realistic policy generates questions across many fields, so
    // this answers whatever option the current question offers rather than
    // assuming a data-zone question (budget can reach 15).
    for (let i = 0; i < 20; i++) {
      const confirmButton = screen.queryByRole('button', { name: /confirm and evaluate/i });
      if (confirmButton) break;
      const firstOption = document.querySelector<HTMLButtonElement>('.questionnaire__options button');
      if (firstOption) {
        await user.click(firstOption);
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
    await user.click(await screen.findByRole('button', { name: /this is a new use case/i }));
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

  // explore-001 D-001 (Critical, practitioner-classified). Double-clicking
  // "Confirm and evaluate" wrote graph_confirmed TWICE to the append-only
  // audit trail, produced no verdict, created no register node, and left the
  // user stranded on the Graph step.
  //
  // The old guard was `if (state.step !== 'confirmation') return`. dispatch()
  // is asynchronous, so two synchronous clicks both read the SAME render's
  // closure, both see 'confirmation', and both proceed — exactly the failure
  // CLAUDE.md describes: "a state update lands too late to prevent the second
  // call." Code review C-5 fixed this class in sample-register.ts; the
  // user-facing path had the same hole.
  it('explore-001 D-001: double-clicking confirm writes graph_confirmed exactly once', async () => {
    const uniqueLabel = 'double click guard model';
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
            edges: [{ from: 'p1', to: 'o1' }],
            jurisdictions: [],
          },
        },
      ],
    });

    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/describe your ai use case/i), 'Double click guard');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));
    await user.click(await screen.findByRole('button', { name: /this is a new use case/i }));
    expect(await screen.findByText(uniqueLabel)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /proceed/i }));

    const confirm = await screen.findByRole('button', { name: /confirm and evaluate/i });
    // Two clicks with NO await between them — the real double-click, where
    // both handlers run against the same pre-dispatch state.
    confirm.click();
    confirm.click();

    expect(await screen.findByText('Verdict', { selector: '.verdict__eyebrow' })).toBeInTheDocument();

    const { getUseCases } = await import('../../store/register');
    const { getAll } = await import('../../store/audit');
    const useCase = (await getUseCases('all')).find((u) => u.label === uniqueLabel);
    expect(useCase).toBeDefined();

    const events = await getAll(useCase!.use_case_id);
    const confirms = events.filter((e) => e.event_type === 'graph_confirmed');
    // The damage is un-cleanable: the trail is append-only by design.
    expect(confirms).toHaveLength(1);
    expect(events.map((e) => e.event_type)).toEqual(['graph_confirmed', 'verdict_produced']);
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
    await user.click(await screen.findByRole('button', { name: /this is a new use case/i }));
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
    await user.click(await screen.findByRole('button', { name: /this is a new use case/i }));
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

    // Oracle round 001 made the shipped track list TOTAL, so no combination of
    // form answers can reach no-track-match any more. The error path still
    // matters: a firm edits its own policy, and a policy with a routing hole
    // must produce an honest error rather than a wrong verdict or a hang. So
    // the hole is now injected deliberately, by loading a policy whose tracks
    // have been stripped to TRACK-III only.
    const holed = appetiteYaml.replace(
      /^tracks:[\s\S]*?(?=^tiers:)/m,
      `tracks:
  - id: "TRACK-III"
    name: "Track III — AI Governance"
    description: "Deliberately incomplete track list — test fixture only"
    regulatory_basis: "test fixture"
    conditions:
      - field: "model_type"
        value: { in: ["llm"] }
    short_circuit: true

`,
    );
    setCurrentPolicyYaml(holed);

    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText(/describe your ai use case/i);
    await user.type(input, 'No track match check');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));
    await user.click(await screen.findByRole('button', { name: /this is a new use case/i }));
    expect(await screen.findByText(/guided intake — answer the fields below/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/what do you want to call it/i), 'No track match tool');
    await user.type(screen.getByLabelText(/in a sentence or two/i), 'A tool with no matching track rule.');
    await user.selectOptions(screen.getByLabelText(/what kind of information does it use/i), 'Internal');
    await user.selectOptions(screen.getByLabelText(/where does that information sit today/i), 'Zone C');
    // deep-learning matches no track in the holed policy above.
    await user.selectOptions(screen.getByLabelText(/what kind of ai is it/i), 'deep-learning');
    await user.selectOptions(screen.getByLabelText(/where does the ai itself run/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/what does it actually produce or do/i), 'read');
    await user.selectOptions(screen.getByLabelText(/who sees what it produces/i), 'internal-only');
    await user.selectOptions(screen.getByLabelText(/how much weight does its output carry/i), 'non-binding');
    await user.selectOptions(screen.getByLabelText(/if it gets something wrong/i), 'reversible');
    await user.selectOptions(screen.getByLabelText(/how widely is it used/i), 'limited');
    // P8-C01 upstream fix: R3-JU-1 requires an explicit jurisdiction answer.
    // These journeys previously proceeded having told the engine nothing about
    // where the system operates.
    await user.click(screen.getByLabelText(/none.*not sure/i));
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

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
    await user.click(await screen.findByRole('button', { name: /this is a new use case/i }));
    expect(await screen.findByText(/guided intake — answer the fields below/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/what do you want to call it/i), 'High tier tool');
    await user.type(screen.getByLabelText(/in a sentence or two/i), 'Client-facing decision support.');
    await user.selectOptions(screen.getByLabelText(/what kind of information does it use/i), 'Internal');
    await user.selectOptions(screen.getByLabelText(/where does that information sit today/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/what kind of ai is it/i), 'traditional-ml');
    await user.selectOptions(screen.getByLabelText(/where does the ai itself run/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/what does it actually produce or do/i), 'recommend');
    // client-facing exposure trips TIER-HIGH (policy/appetite.yaml).
    await user.selectOptions(screen.getByLabelText(/who sees what it produces/i), 'client-facing');
    await user.selectOptions(screen.getByLabelText(/how much weight does its output carry/i), 'material');
    await user.selectOptions(screen.getByLabelText(/if it gets something wrong/i), 'reversible');
    await user.selectOptions(screen.getByLabelText(/how widely is it used/i), 'limited');
    // P8-C01 upstream fix: R3-JU-1 requires an explicit jurisdiction answer.
    // These journeys previously proceeded having told the engine nothing about
    // where the system operates.
    await user.click(screen.getByLabelText(/none.*not sure/i));
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

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
    await user.click(await screen.findByRole('button', { name: /this is a new use case/i }));
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
    // Version-agnostic: derive the current version and bump it, rather than
    // hardcoding a pair. The hardcoded 1.0 -> 1.1 broke the moment the starter
    // policy was itself revised (oracle round 001), which is a test coupled to
    // content it is not testing.
    const currentVersion = /version: "([^"]+)"/.exec(originalYaml)?.[1];
    expect(currentVersion).toBeDefined();
    const bumped = `${currentVersion!.split('.')[0]}.${Number(currentVersion!.split('.')[1]) + 1}`;

    const updatedYaml = originalYaml.replace(`version: "${currentVersion}"`, `version: "${bumped}"`);
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
    expect((await screen.findAllByText(new RegExp(`policy v${bumped.replace('.', '\\.')}`))).length).toBeGreaterThan(0);

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
          (e) => e.event_type === 're_evaluation_queued' && e.payload.type === 're_evaluation_queued' && e.payload.policy_version === bumped,
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

    // V2-B: the duplicate check is a GATE — the card renders at the
    // duplicate step and the flow does not proceed without confirmation.
    expect(await screen.findByText(/one similar use case exists/i)).toBeInTheDocument();
    expect(screen.getByText(/tier High/)).toBeInTheDocument();
    expect(screen.getByText(/full detail is visible to the 2nd line of defence/i)).toBeInTheDocument();
    // BC-V12C-02: the matched label must be unreachable in the DOM.
    expect(screen.queryByText(new RegExp(existingLabel, 'i'))).not.toBeInTheDocument();
    // The next step is only reachable via explicit confirmation.
    expect(screen.queryByText(/guided intake — answer the fields below/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /this is a new use case/i }));
    expect(await screen.findByText(/guided intake — answer the fields below/i)).toBeInTheDocument();
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

    // V2-B gate: 2LoD sees the full match detail at the duplicate step.
    expect(await screen.findByText(/one similar use case exists/i)).toBeInTheDocument();
    expect(screen.getByText(existingLabel)).toBeInTheDocument();
  });
});

// Round 4 — charter 004 D-004. The register row was titled from
// `graph.input_nodes[0].label`, which the form builds as
// "<use case name> — input" (build-graph-from-form.ts:51). Every use case
// submitted through the intake form therefore appeared in the register — and
// on the 2LoD sign-off page — under the name of the data feeding it rather
// than its own. The seeds set the label directly, which is why they looked
// correct and this went unnoticed for four rounds.
describe('Register row naming (charter 004 D-004)', () => {
  it('titles the use case after the system, not after its input node', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/describe your ai use case/i), 'A tool that drafts client emails');
    await user.click(screen.getByRole('button', { name: /read & extract/i }));
    await user.click(await screen.findByRole('button', { name: /this is a new use case/i }));

    await screen.findByText(/guided intake — answer the fields below/i);
    await user.type(screen.getByLabelText(/what do you want to call it/i), 'Mortgage servicing assistant');
    await user.type(screen.getByLabelText(/in a sentence or two/i), 'Drafts servicing letters.');
    await user.selectOptions(screen.getByLabelText(/what kind of information does it use/i), 'Client PII');
    await user.selectOptions(screen.getByLabelText(/where does that information sit today/i), 'Zone B');
    await user.selectOptions(screen.getByLabelText(/what kind of ai is it/i), 'llm');
    await user.selectOptions(screen.getByLabelText(/where does the ai itself run/i), 'Zone B');
    await user.selectOptions(screen.getByLabelText(/what does it actually produce or do/i), 'draft');
    await user.selectOptions(screen.getByLabelText(/who sees what it produces/i), 'internal-only');
    await user.selectOptions(screen.getByLabelText(/how much weight does its output carry/i), 'non-binding');
    await user.selectOptions(screen.getByLabelText(/if it gets something wrong/i), 'reversible');
    await user.selectOptions(screen.getByLabelText(/how widely is it used/i), 'limited');
    await user.click(screen.getByLabelText(/none.*not sure/i));
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    await screen.findByText(/review extracted graph/i);
    await user.click(screen.getByRole('button', { name: /proceed/i }));
    await screen.findByRole('heading', { name: /confirm and evaluate/i });
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    await screen.findByText('Verdict', { selector: '.verdict__eyebrow' });

    await user.click(screen.getByText('▤ Register'));

    // The register lists AI systems. Its row is the system's name.
    expect(await screen.findByText('Mortgage servicing assistant')).toBeInTheDocument();
    expect(screen.queryByText(/Mortgage servicing assistant — input/)).not.toBeInTheDocument();
  });
});

// Round 4 — charter 004 D-001. The description was captured, used for
// extraction, and never shown to the user again — so the screen that asks
// "is this graph right?" gave them nothing to check it against.
describe('The submitted description is shown back (charter 004 D-001)', () => {
  it('renders what the user typed on the graph review screen [TC-UC-1-01]', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    const typed = 'A tool that drafts client emails from CRM notes';
    await user.type(screen.getByLabelText(/describe your ai use case/i), typed);
    await user.click(screen.getByRole('button', { name: /read & extract/i }));
    await user.click(await screen.findByRole('button', { name: /this is a new use case/i }));

    await screen.findByText(/guided intake — answer the fields below/i);
    await user.type(screen.getByLabelText(/what do you want to call it/i), 'Email drafter');
    await user.type(screen.getByLabelText(/in a sentence or two/i), 'Drafts emails.');
    await user.selectOptions(screen.getByLabelText(/what kind of information does it use/i), 'Client PII');
    await user.selectOptions(screen.getByLabelText(/where does that information sit today/i), 'Zone B');
    await user.selectOptions(screen.getByLabelText(/what kind of ai is it/i), 'llm');
    await user.selectOptions(screen.getByLabelText(/where does the ai itself run/i), 'Zone B');
    await user.selectOptions(screen.getByLabelText(/what does it actually produce or do/i), 'draft');
    await user.selectOptions(screen.getByLabelText(/who sees what it produces/i), 'internal-only');
    await user.selectOptions(screen.getByLabelText(/how much weight does its output carry/i), 'non-binding');
    await user.selectOptions(screen.getByLabelText(/if it gets something wrong/i), 'reversible');
    await user.selectOptions(screen.getByLabelText(/how widely is it used/i), 'limited');
    await user.click(screen.getByLabelText(/none.*not sure/i));
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    await screen.findByText(/review extracted graph/i);
    // The user can check the graph against their own words, on the screen
    // that asks them to confirm it.
    expect(screen.getByText(typed)).toBeInTheDocument();
  });
});
