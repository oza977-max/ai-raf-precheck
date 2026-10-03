import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import * as graphExtractorModule from '../../llm/graph-extractor';
import * as duplicateCheckModule from '../../llm/duplicate-check';
import * as registerModule from '../../store/register';
import * as traceModule from '../../llm/reasoning-trace';
import { addNode } from '../../store/register';
import { append as appendAuditEvent, getAll } from '../../store/audit';
import { setCurrentPolicyYaml } from '../../store/policy-source';
import type { DataFlowGraph } from '../../engine/types';
import type { Verdict } from '../../types/verdict';

// FX-2 (CR6-fixes.md v2) — abandoned work, navigation gates, announcements,
// crash safety. TDD-2 mock budget would normally be 1 (the Anthropic SDK
// boundary) but several of these tests need to hold an in-flight call open
// across a "Start over" click, which the shared SDK mock's single `create`
// function cannot do per-call without a fragile call-order dependency.
// IntakeFlow.r16f.test.tsx already spies on internal boundaries directly for
// identical timing-control needs (confirmationPrecondition,
// generateReasoningTraceForVerdict); this file follows the same precedent
// for extractGraph / confirmSemanticDuplicate / addNode.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn() };
  },
}));

const DRAFT_KEY = 'aigate:intake-draft';

function makeGraph(overrides: Partial<DataFlowGraph> = {}): DataFlowGraph {
  return {
    id: 'g1',
    version: 1,
    intake_method: 'structured_form',
    extracted_at: '2026-01-01T00:00:00.000Z',
    jurisdictions: [],
    input_nodes: [{ id: 'i1', label: 'x', data_class: 'Internal', data_zone: 'Zone C' }],
    processing_nodes: [
      { id: 'p1', label: 'x', model_type: 'llm', autonomy_level: 1, data_zone: 'Zone C', vendor: 'internal', replaces_prior_model: false },
    ],
    output_nodes: [
      { id: 'o1', label: 'x', action_type: 'read', exposure: 'internal-only', decision_bindingness: 'non-binding', output_reversibility: 'reversible', scale: 'limited' },
    ],
    edges: [],
    ...overrides,
  };
}

function held<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

type ExtractResult = Awaited<ReturnType<typeof graphExtractorModule.extractGraph>>;

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    status: 'approved_with_controls',
    tier: 'High',
    track: 'II',
    binding_constraint: 'INV-DATA-01',
    binding_path: 'x',
    controls: [],
    downstream_reviews: [],
    conditions: { hypotheses: [] },
    policy_version: '1.8',
    pack_versions: {},
    applied_overrides: [],
    confidence_caveats: [],
    provisional_reasons: [],
    boundary_proximity: false,
    margin_achieved: 0,
    margin_target: 0.1,
    single_covered_invariants: [],
    id: 'v-other-tab',
    use_case_id: 'uc-placeholder',
    living_status: 'approved',
    living_status_updated_at: '2026-01-01T00:00:00.000Z',
    attested_by: '1LoD',
    attested_at: '2026-01-01T00:00:00.000Z',
    graph_version: 1,
    corrections: [],
    ...overrides,
  } as Verdict;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

// CR6-02 (Critical). handleStartOver released only confirmInFlight and the
// refusal — dupCheckInFlight/confirmNewInFlight/retryExtractionInFlight/
// adoptInFlight stayed set until their OWN pending call's `finally` ran, so
// Start Over while any of those was still in flight left the IDENTICAL
// handler on the NEW case silently doing nothing (the guard it shares with
// the abandoned call was never released). Fixed with an attempt token
// (bumped by handleStartOver) that every one of those async handlers — and
// the duplicate-check effect — checks before applying its result, plus
// handleStartOver now releasing all four refs and the duplicate-check trio
// together, exactly like handleStepBack already does.
describe('CR6-02: "Start over" abandons earlier in-flight work instead of leaving it running', () => {
  it('TC-CR6-02a: Continue on the new case works while the abandoned case\'s extraction is still pending, and the late result never lands on the new case', async () => {
    localStorage.setItem('aigate:api-key', 'test-key');
    const first = held<ExtractResult>();
    const second = held<ExtractResult>();
    const spy = vi.spyOn(graphExtractorModule, 'extractGraph');
    spy.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);

    // "Start over instead" (the only reachable handleStartOver control) is
    // offered only once a draft has actually been RESTORED at mount — so
    // the abandoned case starts life as a seeded draft, exactly like a
    // refreshed/reopened tab, rather than being typed fresh.
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 'duplicate_check', description: 'Abandoned case alpha' }));

    try {
      const user = userEvent.setup();
      render(<App />);

      await user.click(await screen.findByRole('button', { name: /continue →/i }));
      // The abandoned case's extraction is now pending (held).
      await screen.findByText(/reading your description/i);

      await user.click(screen.getByRole('button', { name: /start over instead/i }));
      await screen.findByLabelText(/what ai tool do you want to use/i);

      await user.type(screen.getByLabelText(/what ai tool do you want to use/i), 'Fresh case beta');
      await user.click(screen.getByRole('button', { name: /^next/i }));
      // Before the fix, Continue here silently did nothing — confirmNewInFlight
      // was still true from the abandoned case's still-pending call.
      await user.click(await screen.findByRole('button', { name: /continue →/i }));
      await screen.findByText(/reading your description/i);

      second.resolve({
        ok: true,
        value: {
          graph: makeGraph({ intake_method: 'llm', processing_nodes: [{ ...makeGraph().processing_nodes[0]!, label: 'Beta system' }] }),
          provenance: {},
          guessed: {},
        },
      });
      await screen.findByText('Beta system');

      // The abandoned case's extraction now resolves late — it must not
      // replace what the new case is showing.
      first.resolve({
        ok: true,
        value: {
          graph: makeGraph({ intake_method: 'llm', processing_nodes: [{ ...makeGraph().processing_nodes[0]!, label: 'Alpha system' }] }),
          provenance: {},
          guessed: {},
        },
      });
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.getByText('Beta system')).toBeInTheDocument();
      expect(screen.queryByText('Alpha system')).not.toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });

  it('TC-CR6-02b: an abandoned duplicate check\'s match never appears on the new case', async () => {
    localStorage.setItem('aigate:api-key', 'test-key');
    await addNode({
      node_id: crypto.randomUUID(),
      node_type: 'use_case',
      label: 'Client meeting notes summariser for relationship managers',
      created_at: '2026-01-01T00:00:00.000Z',
      metadata: {
        node_type: 'use_case',
        submitted_by: '1LoD',
        lifecycle_stage: 'idea',
        current_verdict_id: null,
        tier: null,
        track: null,
      },
    });
    const first = held<boolean>();
    const spy = vi.spyOn(duplicateCheckModule, 'confirmSemanticDuplicate').mockImplementationOnce(() => first.promise);
    // Exact-text match with the seeded row above — the duplicate check will
    // find it as a candidate and hold on the (mocked) LLM confirm.
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ step: 'duplicate_check', description: 'Client meeting notes summariser for relationship managers' }),
    );

    try {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText(/looking through earlier checks/i);

      await user.click(screen.getByRole('button', { name: /start over instead/i }));
      await screen.findByLabelText(/what ai tool do you want to use/i);

      // Deliberately unrelated wording — this must find no candidate at all,
      // so the new case's own check never calls the LLM confirm a second time.
      await user.type(
        screen.getByLabelText(/what ai tool do you want to use/i),
        'A chatbot that helps interns book conference rooms',
      );
      await user.click(screen.getByRole('button', { name: /^next/i }));
      await screen.findByRole('button', { name: /^continue →$/i });

      // The abandoned case's LLM confirm now resolves late, "true" — it
      // must not retroactively show a match for the new, unrelated case.
      first.resolve(true);
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByText(/overlapping use case|similar use is already on your firm/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^continue →$/i })).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });

  it('TC-CR6-02c: "Try again" works on the new case after Start over, even though the abandoned case\'s own retry was still pending', async () => {
    localStorage.setItem('aigate:api-key', 'test-key');
    const abandonedRetry = held<ExtractResult>();
    const spy = vi.spyOn(graphExtractorModule, 'extractGraph');
    spy
      .mockResolvedValueOnce({ ok: false, error: { kind: 'network-error', message: 'first case initial failure' } })
      .mockImplementationOnce(() => abandonedRetry.promise)
      .mockResolvedValueOnce({ ok: false, error: { kind: 'network-error', message: 'second case initial failure' } })
      .mockResolvedValueOnce({ ok: true, value: { graph: makeGraph({ intake_method: 'llm' }), provenance: {}, guessed: {} } });
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 'duplicate_check', description: 'Case alpha, retry abandoned' }));

    try {
      const user = userEvent.setup();
      render(<App />);

      await user.click(await screen.findByRole('button', { name: /continue →/i }));
      await screen.findByRole('button', { name: /^try again$/i });
      // The abandoned case's OWN retry is now pending (held).
      await user.click(screen.getByRole('button', { name: /^try again$/i }));
      await screen.findByText(/reading your description/i);

      await user.click(screen.getByRole('button', { name: /start over instead/i }));
      await screen.findByLabelText(/what ai tool do you want to use/i);

      await user.type(screen.getByLabelText(/what ai tool do you want to use/i), 'Case beta, fresh');
      await user.click(screen.getByRole('button', { name: /^next/i }));
      await user.click(await screen.findByRole('button', { name: /continue →/i }));
      await screen.findByRole('button', { name: /^try again$/i });
      // Before the fix, this click silently did nothing — retryExtractionInFlight
      // was still true from the abandoned case's still-pending retry.
      await user.click(screen.getByRole('button', { name: /^try again$/i }));

      await screen.findByText(/check what we read from your description/i);
      expect(spy).toHaveBeenCalledTimes(4);
    } finally {
      spy.mockRestore();
    }
  });

  it('TC-CR6-02c (adopt): "Use the earlier result" works on the new case after Start over, even though the abandoned case\'s own adoption write was still pending', async () => {
    await addNode({
      node_id: crypto.randomUUID(),
      node_type: 'use_case',
      label: 'Adopt-abandon probe assistant',
      created_at: '2026-01-01T00:00:00.000Z',
      metadata: {
        node_type: 'use_case',
        submitted_by: '1LoD',
        lifecycle_stage: 'approved',
        current_verdict_id: null,
        tier: 'High',
        track: 'II',
      },
    });
    const abandonedAdopt = held<void>();
    const addNodeSpy = vi.spyOn(registerModule, 'addNode');
    addNodeSpy.mockImplementationOnce(() => abandonedAdopt.promise as never);
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 'duplicate_check', description: 'Adopt-abandon probe assistant' }));

    try {
      const user = userEvent.setup();
      render(<App />);

      const adopt = await screen.findByRole('button', { name: /use the earlier result/i });
      // The abandoned case's own adoption write is now pending (held).
      await user.click(adopt);

      await user.click(screen.getByRole('button', { name: /start over instead/i }));
      await screen.findByLabelText(/what ai tool do you want to use/i);

      await user.type(screen.getByLabelText(/what ai tool do you want to use/i), 'Adopt-abandon probe assistant');
      await user.click(screen.getByRole('button', { name: /^next/i }));
      const adoptAgain = await screen.findByRole('button', { name: /use the earlier result/i });
      addNodeSpy.mockResolvedValueOnce(undefined as never);
      // Before the fix, this click silently did nothing — adoptInFlight was
      // still true from the abandoned case's still-pending write.
      await user.click(adoptAgain);

      await screen.findByText(/earlier result used from/i);
    } finally {
      addNodeSpy.mockRestore();
      abandonedAdopt.resolve();
    }
  });

  it('TC-CR6-02d: rendered inside StrictMode, the duplicate check still completes and shows its result exactly once', async () => {
    localStorage.setItem('aigate:api-key', 'test-key');
    await addNode({
      node_id: crypto.randomUUID(),
      node_type: 'use_case',
      label: 'StrictMode duplicate probe assistant',
      created_at: '2026-01-01T00:00:00.000Z',
      metadata: {
        node_type: 'use_case',
        submitted_by: '1LoD',
        lifecycle_stage: 'idea',
        current_verdict_id: null,
        tier: null,
        track: null,
      },
    });
    const spy = vi.spyOn(duplicateCheckModule, 'confirmSemanticDuplicate').mockResolvedValue(true);

    try {
      const user = userEvent.setup();
      render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
      await user.type(screen.getByLabelText(/what ai tool do you want to use/i), 'StrictMode duplicate probe assistant');
      await user.click(screen.getByRole('button', { name: /^next/i }));

      await screen.findByRole('button', { name: /mine is different/i });
      // Exactly one real confirm call, and exactly one match card — not two
      // (the default role is 1LoD, which renders the redacted card text —
      // "Mine is different" is the one wording common to both roles).
      expect(spy).toHaveBeenCalledTimes(1);
      expect(screen.getAllByRole('button', { name: /mine is different/i })).toHaveLength(1);
      expect(document.querySelectorAll('.duplicate-card')).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });
});

// CR6-14 (Important). An extraction error (set in handleConfirmNewUseCase or
// handleRetryExtraction) was cleared only by a retry or "Answer the
// questions instead" — not by Start Over, and not when a FRESH case's own
// first extraction begins. A new case reusing the same mounted IntakeFlow
// briefly showed the PREVIOUS case's error before its own (pending)
// extraction had even had a chance to fail.
describe('CR6-14: a stale extraction error does not leak onto the next case', () => {
  it('TC-CR6-14: after Start over, a new case\'s pending extraction shows "Reading your description…", never the abandoned case\'s old error', async () => {
    localStorage.setItem('aigate:api-key', 'test-key');
    const secondCall = held<ExtractResult>();
    const spy = vi.spyOn(graphExtractorModule, 'extractGraph');
    spy
      .mockResolvedValueOnce({ ok: false, error: { kind: 'network-error', message: 'first case failure' } })
      .mockImplementationOnce(() => secondCall.promise);
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ step: 'duplicate_check', description: 'Case with a real extraction failure' }),
    );

    try {
      const user = userEvent.setup();
      render(<App />);

      await user.click(await screen.findByRole('button', { name: /continue →/i }));
      expect(await screen.findByRole('alert')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /start over instead/i }));
      await screen.findByLabelText(/what ai tool do you want to use/i);

      await user.type(screen.getByLabelText(/what ai tool do you want to use/i), 'Fresh case, extraction pending');
      await user.click(screen.getByRole('button', { name: /^next/i }));
      await user.click(await screen.findByRole('button', { name: /continue →/i }));

      // The fresh case's own extraction hasn't resolved yet — it must read
      // as pending, never as the abandoned case's old failure.
      expect(await screen.findByText(/reading your description/i)).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      secondCall.resolve({ ok: true, value: { graph: makeGraph({ intake_method: 'llm' }), provenance: {}, guessed: {} } });
    } finally {
      spy.mockRestore();
    }
  });
});

// C-3 (Minor). Undo is a single-level, one-use snapshot (v0.7.1) — once
// consumed, the control must stop offering itself rather than sitting there
// as a button that does nothing on a second press.
describe('C-3: Undo disappears once its one snapshot is used', () => {
  it('TC-CR6-C3: Undo is offered after an answer and gone after it is pressed — even though the PREVIOUS answer is still shown as "Recorded"', async () => {
    // Three questions: after answering Q1 then Q2 and undoing Q2, the
    // "Recorded" line falls back to Q1's answer — which is still truthy —
    // so this actually exercises whether onUndo itself is withheld once
    // the one snapshot is gone, not just "lastAnswer happened to vanish".
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        step: 'questionnaire',
        description: 'd',
        graph: makeGraph({ intake_method: 'llm' }),
        questions: [
          { id: 'Q1', field: 'replaces_prior_model', node_id: 'p1', triggered_by: ['INV-1'], answer_type: 'boolean' },
          { id: 'Q2', field: 'replaces_prior_model', node_id: 'p1', triggered_by: ['INV-1'], answer_type: 'boolean' },
          { id: 'Q3', field: 'replaces_prior_model', node_id: 'p1', triggered_by: ['INV-1'], answer_type: 'boolean' },
        ],
        answers: [],
        resolutionNotes: [],
        corrections: [],
        useCaseId: 'uc-c3',
      }),
    );
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(/question 1 of 3/i);
    expect(screen.queryByRole('button', { name: /^undo$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^yes$/i }));
    await screen.findByText(/question 2 of 3/i);
    expect(await screen.findByRole('button', { name: /^undo$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^no$/i }));
    await screen.findByText(/question 3 of 3/i);
    const undo = await screen.findByRole('button', { name: /^undo$/i });

    await user.click(undo);
    // Back to question 2, Recorded line falls back to Q1's answer — the
    // single snapshot is gone, so Undo must not still be offered even
    // though there is still a "Recorded" line to attach it to.
    await screen.findByText(/question 2 of 3/i);
    expect(screen.getByText(/^recorded:/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^undo$/i })).not.toBeInTheDocument();
  });
});

// CR6-08 (Important). evaluation_pending and verdict shared one step label
// ("Step 6 of 6: Result"), and the live-region announcement effect just
// re-rendered that same text for both — a screen-reader user heard nothing
// change between "working it out" and "it's ready" because the DOM text
// genuinely did not change. "Evaluating…" and "Looking through earlier
// checks…" also had no live region of their own at all.
describe('CR6-08: the result does not arrive silently for screen-reader users', () => {
  it('TC-CR6-08a: the announcement text when the result is being worked out differs from the announcement once it is ready', async () => {
    const useCaseId = 'uc-cr6-08a';
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        step: 'confirmation',
        description: 'A tool whose result takes a while.',
        graph: makeGraph(),
        graphVersion: 1,
        corrections: [],
        answers: [],
        resolutionNotes: [],
        useCaseId,
        plainAnswers: { '1': 'Tool' },
        assumptions: [],
      }),
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi.spyOn(traceModule, 'generateReasoningTraceForVerdict').mockImplementationOnce(async () => {
      await gate;
      return { ok: false, error: { kind: 'no-api-key', message: 'held' } } as never;
    });
    try {
      const user = userEvent.setup();
      render(<App />);
      await user.click(await screen.findByRole('button', { name: /confirm and evaluate/i }));
      await vi.waitFor(() => expect(spy).toHaveBeenCalled());

      const announcement = () => document.querySelector('.intake-flow__step-announcement')?.textContent ?? '';
      const pendingText = announcement();
      expect(pendingText).not.toBe('');

      release();
      await screen.findByText('Verdict', { selector: '.verdict__eyebrow' }, { timeout: 5000 });
      const readyText = announcement();

      // The two must differ — this is the whole fix. Pending text should
      // read as in-progress; ready text should read as done.
      expect(readyText).not.toBe(pendingText);
      expect(pendingText).toMatch(/working out|evaluating/i);
      expect(readyText).toMatch(/ready|result/i);
    } finally {
      spy.mockRestore();
      sessionStorage.clear();
    }
  });

  it('TC-CR6-08b: the in-progress lines ("Evaluating…", "Looking through earlier checks…") are status regions', async () => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ step: 'duplicate_check', description: 'Status region probe, no match expected' }),
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi.spyOn(traceModule, 'generateReasoningTraceForVerdict');
    try {
      render(<App />);
      const looking = await screen.findByText('Looking through earlier checks…');
      expect(looking).toHaveAttribute('role', 'status');

      // Drive on to evaluation_pending to check "Evaluating…" too.
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /continue →/i }));
      await user.type(await screen.findByLabelText(/what do you want to call it/i), 'Status region tool');
      await user.type(screen.getByLabelText(/in a sentence or two/i), 'x');
      await user.click(screen.getByRole('radio', { name: /something a team in your firm built for this job/i }));
      await user.click(screen.getByRole('radio', { name: /reads, summarises, translates, writes or answers questions in words/i }));
      await user.click(screen.getByRole('checkbox', { name: /everyday work information/i }));
      await user.click(screen.getByRole('radio', { name: /finds or summarises for people to read/i }));
      await user.click(screen.getByRole('radio', { name: /^only me or my own team$/i }));
      await user.click(screen.getByRole('radio', { name: /none of these — it.s for day-to-day work/i }));
      await user.click(screen.getAllByRole('radio', { name: /^yes$/i })[0]!);
      await user.click(screen.getByRole('radio', { name: /just me, or a small trial/i }));
      await user.click(screen.getByRole('checkbox', { name: /somewhere else, or not sure/i }));
      await user.click(screen.getByRole('radio', { name: /^no$/i }));
      await user.click(screen.getByRole('button', { name: /^continue$/i }));
      await screen.findByRole('button', { name: /confirm and evaluate/i });
      spy.mockImplementationOnce(async () => {
        await gate;
        return { ok: false, error: { kind: 'no-api-key', message: 'held' } } as never;
      });
      await userEvent.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
      const evaluating = await screen.findByText('Evaluating…');
      expect(evaluating).toHaveAttribute('role', 'status');
      release();
      await screen.findByText('Verdict', { selector: '.verdict__eyebrow' }, { timeout: 5000 });
    } finally {
      spy.mockRestore();
      sessionStorage.clear();
    }
  });
});

// CR6-15 (Important). The confirm-and-evaluate sequence keeps running (by
// design) after the component unmounts — e.g. the user navigates to a
// different screen mid-confirm. The saved draft was cleared only by an
// effect keyed on `state.step === 'verdict'`, which never fires for an
// unmounted component, so the draft stayed frozen wherever it last was
// written. On return, loadDraft() restored that stale step, and — because
// the confirm HAD actually completed in the background — Confirm was then
// refused as "already has a result", with wording that claimed a cause
// (another tab or window) the app cannot actually know.
describe('CR6-15: navigating away mid-confirm leaves no stale confirmation screen behind', () => {
  it('TC-CR6-15a: after navigating away mid-confirm and back, the saved draft is gone — no stale confirmation screen, and the result is really on the trail', async () => {
    const useCaseId = 'uc-cr6-15a';
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        step: 'confirmation',
        description: 'A tool the user navigates away from mid-confirm.',
        graph: makeGraph(),
        graphVersion: 1,
        corrections: [],
        answers: [],
        resolutionNotes: [],
        useCaseId,
        plainAnswers: { '1': 'Tool' },
        assumptions: [],
      }),
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi.spyOn(traceModule, 'generateReasoningTraceForVerdict').mockImplementationOnce(async () => {
      await gate;
      return { ok: false, error: { kind: 'no-api-key', message: 'held' } } as never;
    });
    try {
      const user = userEvent.setup();
      render(<App />);
      await user.click(await screen.findByRole('button', { name: /confirm and evaluate/i }));
      await vi.waitFor(() => expect(spy).toHaveBeenCalled());

      // Navigate away mid-confirm — IntakeFlow unmounts; App stays mounted.
      await user.click(screen.getByRole('button', { name: /▤ register/i }));
      await screen.findByRole('heading', { name: /register/i }).catch(() => {});

      // The confirm completes in the background while nothing is listening.
      release();
      await waitFor(async () => {
        const events = await getAll(useCaseId);
        expect(events.map((e) => e.event_type)).toContain('verdict_produced');
      });

      // The saved draft must be gone directly — not only via the (never
      // fired, because unmounted) step === 'verdict' effect.
      expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();

      // Return to the intake screen: a fresh case, never the stale
      // confirmation screen for a case that was already decided.
      await user.click(screen.getByRole('button', { name: /\+ new pre-check/i }));
      expect(screen.queryByRole('button', { name: /confirm and evaluate/i })).not.toBeInTheDocument();
      expect(await screen.findByLabelText(/what ai tool do you want to use/i)).toHaveValue('');
    } finally {
      spy.mockRestore();
      sessionStorage.clear();
    }
  });

  it('TC-CR6-15b: the "already has a result" message claims no cause it cannot know', async () => {
    const useCaseId = 'uc-cr6-15b';
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        step: 'confirmation',
        description: 'A tool already confirmed elsewhere.',
        graph: makeGraph(),
        graphVersion: 1,
        corrections: [],
        answers: [],
        resolutionNotes: [],
        useCaseId,
      }),
    );
    const now = new Date().toISOString();
    await appendAuditEvent({
      event_id: crypto.randomUUID(),
      use_case_id: useCaseId,
      event_type: 'use_case_created',
      occurred_at: now,
      actor: '1LoD',
      payload: { type: 'use_case_created', description: 'A tool already confirmed elsewhere.', intake_method: 'structured_form' },
    });
    await appendAuditEvent({
      event_id: crypto.randomUUID(),
      use_case_id: useCaseId,
      event_type: 'graph_confirmed',
      occurred_at: now,
      actor: '1LoD',
      payload: { type: 'graph_confirmed', graph_id: 'g1', graph_version: 1, corrections_count: 0 },
    });
    await appendAuditEvent({
      event_id: crypto.randomUUID(),
      use_case_id: useCaseId,
      event_type: 'verdict_produced',
      occurred_at: now,
      actor: 'system',
      payload: { type: 'verdict_produced', verdict: makeVerdict({ use_case_id: useCaseId }) },
    });
    await addNode({
      node_id: useCaseId,
      node_type: 'use_case',
      label: 'Already confirmed elsewhere',
      created_at: now,
      metadata: {
        node_type: 'use_case',
        submitted_by: '1LoD',
        lifecycle_stage: 'pre_checked',
        current_verdict_id: 'v-other-tab',
        tier: 'High',
        track: 'II',
      },
    });

    try {
      render(<App />);
      await userEvent.click(await screen.findByRole('button', { name: /confirm and evaluate/i }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/this case already has a result/i);
      expect(alert).toHaveTextContent(/open it from the register/i);
      // The old wording claimed a cause ("probably confirmed in another tab
      // or window") the app has no way to actually know.
      expect(alert).not.toHaveTextContent(/another tab or window/i);
    } finally {
      sessionStorage.clear();
    }
  });
});

// CR6-17 (Important). checkPolicyGate() THREW when the policy itself failed
// to load/validate; neither handleProceedFromGraphReview nor
// handleFormSubmitted caught it, so an uncaught exception inside a React
// event handler just... went nowhere a user could see. Both buttons
// "worked" (no crash, no error boundary involved — this is not a render
// error) but produced no visible result at all.
describe('CR6-17: an invalid policy shows a message at the button instead of failing silently', () => {
  beforeEach(() => {
    setCurrentPolicyYaml('this_is_not_a_valid_policy_shape: true');
  });

  it('TC-CR6-17a: on the guided FORM\'s own Continue, an invalid policy shows a message at the button and never silently does nothing', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/what ai tool do you want to use/i), 'Invalid-policy form probe');
    await user.click(screen.getByRole('button', { name: /^next/i }));
    await user.click(await screen.findByRole('button', { name: /continue →/i }));

    await user.type(await screen.findByLabelText(/what do you want to call it/i), 'Gate probe tool');
    await user.type(screen.getByLabelText(/in a sentence or two/i), 'x');
    await user.click(screen.getByRole('radio', { name: /something a team in your firm built for this job/i }));
    await user.click(screen.getByRole('radio', { name: /reads, summarises, translates, writes or answers questions in words/i }));
    await user.click(screen.getByRole('checkbox', { name: /everyday work information/i }));
    await user.click(screen.getByRole('radio', { name: /finds or summarises for people to read/i }));
    await user.click(screen.getByRole('radio', { name: /^only me or my own team$/i }));
    await user.click(screen.getByRole('radio', { name: /none of these — it.s for day-to-day work/i }));
    await user.click(screen.getAllByRole('radio', { name: /^yes$/i })[0]!);
    await user.click(screen.getByRole('radio', { name: /just me, or a small trial/i }));
    await user.click(screen.getByRole('checkbox', { name: /somewhere else, or not sure/i }));
    await user.click(screen.getByRole('radio', { name: /^no$/i }));
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(await screen.findByText(/policy invalid/i, { selector: '.intake-flow__gate-error' })).toBeInTheDocument();
    // Never reached the summary — FORM_SUBMITTED was never dispatched.
    expect(screen.queryByText(/here.s what we understood/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeInTheDocument();
  });

  it('TC-CR6-17b: on the review screen\'s own Continue, an invalid policy shows a message at the button and never silently does nothing', async () => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        step: 'graph_review',
        description: 'An agent reviewed under a policy that just broke.',
        graph: makeGraph({ intake_method: 'llm' }),
        graphVersion: 1,
        corrections: [],
        useCaseId: 'uc-cr6-17b',
        unconfirmedNodeIds: [],
        jurisdictionsConfirmed: true,
      }),
    );
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /^continue$/i }));

    expect(await screen.findByText(/policy invalid/i, { selector: '.intake-flow__gate-error' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeInTheDocument();
  });
});
