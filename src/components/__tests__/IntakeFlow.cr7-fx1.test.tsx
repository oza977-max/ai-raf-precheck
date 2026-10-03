import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import IntakeFlow from '../IntakeFlow';
import * as evaluateModule from '../../engine/evaluate';
import * as graphExtractorModule from '../../llm/graph-extractor';
import { setCurrentPolicyYaml } from '../../store/policy-source';
import { getAllForExport } from '../../store/audit';
import { addNode, getGraph, getUseCases } from '../../store/register';
import * as traceModule from '../../llm/reasoning-trace';
import * as registerModule from '../../store/register';
import { getAll } from '../../store/audit';
import { setRole } from '../../store/role';
import { loadDraft } from '../intake-draft';
import appetiteYaml from '../../../policy/appetite.yaml?raw';
import type { DataFlowGraph } from '../../engine/types';

// FX7-1 (CR7-fixes.md) — intake state and flow. End-to-end coverage that
// needs the real App/IntakeFlow wiring. Mock budget = 1: the Anthropic SDK
// boundary. Two further seams are SPIED (never replaced): `evaluate` (to make
// ONE evaluation fail the way a gap in the firm's rules would) and
// `selfAssessmentSeeded` (CR7-17). Everything else is the real thing, and
// every assertion about the trail reads the real, hash-chained store.
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

// CR7-17: the seed wait is the one seam this file lets a test make fail.
let seedOverride: (() => Promise<unknown>) | null = null;
vi.mock('../../seeds/aigate-self-assessment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../seeds/aigate-self-assessment')>();
  return {
    ...actual,
    selfAssessmentSeeded: () => (seedOverride ? seedOverride() : actual.selfAssessmentSeeded()),
  };
});

// Every screen here is reached through several real, awaited store writes; the
// 1s default is too tight when the whole suite runs in parallel.
configure({ asyncUtilTimeout: 5000 });

const DRAFT_KEY = 'aigate:intake-draft';
const FORM_DRAFT_KEY = 'aigate:intake-form-draft:v2';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('aigate:api-key', 'test-key');
  mockCreate.mockReset();
  seedOverride = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---- extraction fixtures (adapted from the code-review checkers' probes) ----

const NSDESC =
  'A model sends client updates. It acts entirely on its own. It was built in-house. Clients see these updates directly, and they take effect immediately. It started as a small trial. It replaces no earlier model.';

/** A model that sends client updates; output_reversibility has NO quote, so it
 *  is a guessed field the questionnaire asks about. */
function notSureExtraction() {
  return {
    content: [
      {
        type: 'tool_use',
        name: 'extract_graph',
        input: {
          input_nodes: [],
          processing_nodes: [
            {
              id: 'p1',
              label: 'client update model',
              model_type: 'ml',
              autonomy_level: 4,
              data_zone: 'Zone C',
              vendor: 'internal',
              replaces_prior_model: false,
              basis_quotes: {
                model_type: 'a model',
                autonomy_level: 'acts entirely on its own',
                data_zone: 'built in-house',
                vendor: 'built in-house',
                replaces_prior_model: 'replaces no earlier model',
              },
            },
          ],
          output_nodes: [
            {
              id: 'o1',
              label: 'client notifications',
              action_type: 'execute',
              exposure: 'client-facing',
              decision_bindingness: 'binding',
              output_reversibility: 'reversible',
              scale: 'limited',
              basis_quotes: {
                action_type: 'sends client updates',
                exposure: 'clients see these updates directly',
                decision_bindingness: 'they take effect immediately',
                // output_reversibility deliberately has no quote — guessed.
              },
            },
          ],
          edges: [],
          jurisdictions: [],
        },
      },
    ],
  };
}

const VDESC = 'A specialist supplier tool drafts text. A person checks each one. It replaces no earlier model.';

/** A drafting tool whose vendor and (optionally) declared model carry no
 *  quote, so both are guessed fields the questionnaire asks about. */
function supplierExtraction(opts: { declaredModel?: string; decisionType?: string } = {}) {
  return {
    content: [
      {
        type: 'tool_use',
        name: 'extract_graph',
        input: {
          input_nodes: [
            {
              id: 'i1',
              label: 'notes',
              data_class: 'Internal',
              data_zone: 'Zone B',
              basis_quotes: { data_class: 'drafts text', data_zone: 'a specialist supplier tool' },
            },
          ],
          processing_nodes: [
            {
              id: 'p1',
              label: 'drafting tool',
              model_type: 'llm',
              autonomy_level: 1,
              data_zone: 'Zone B',
              vendor: 'a specialist supplier',
              ...(opts.declaredModel ? { declared_model_id: opts.declaredModel } : {}),
              replaces_prior_model: false,
              basis_quotes: {
                model_type: 'drafts text',
                autonomy_level: 'a person checks',
                data_zone: 'a specialist supplier tool',
                vendor: '',
                replaces_prior_model: 'replaces no earlier model',
              },
            },
          ],
          output_nodes: [
            {
              id: 'o1',
              label: 'drafts',
              action_type: 'draft',
              exposure: 'internal-only',
              decision_bindingness: 'non-binding',
              output_reversibility: 'reversible',
              scale: 'limited',
              ...(opts.decisionType ? { decision_type: opts.decisionType } : {}),
              basis_quotes: {
                action_type: 'drafts text',
                exposure: 'a person checks each one',
                decision_bindingness: 'a person checks each one',
                output_reversibility: 'a specialist supplier tool',
                scale: 'a person checks each one',
              },
            },
          ],
          edges: [],
          jurisdictions: [],
        },
      },
    ],
  };
}

type User = ReturnType<typeof userEvent.setup>;

async function reachReview(user: User, description: string) {
  render(<App />);
  await user.type(screen.getByLabelText(/what ai tool do you want to use/i), description);
  await user.click(screen.getByRole('button', { name: /^next/i }));
  await user.click(await screen.findByRole('button', { name: /continue →/i }));
  await screen.findByText('Check what we read from your description');
}

async function confirmReviewCards(user: User) {
  // Re-query every iteration — clicking one card's confirm button re-renders
  // and removes it.
  for (;;) {
    const b = screen.queryAllByRole('button', { name: /^(this is right|i.ve checked this — it.s right)$/i })[0];
    if (!b) break;
    await user.click(b);
  }
  const jur = screen.queryByRole('button', { name: /^(these are right|none of these — continue)$/i });
  if (jur) await user.click(jur);
}

async function proceedFromReview(user: User) {
  await confirmReviewCards(user);
  await user.click(screen.getByRole('button', { name: /^continue$/i }));
}

/** Answers whatever the questionnaire asks (first option) until Confirm. */
async function clickThroughToConfirm(user: User) {
  for (let i = 0; i < 20; i++) {
    if (screen.queryByRole('button', { name: /confirm and evaluate/i })) return;
    const option = document.querySelector<HTMLButtonElement>('.questionnaire__options button');
    if (option) {
      await user.click(option);
      continue;
    }
    break;
  }
  await screen.findByRole('button', { name: /confirm and evaluate/i });
}

async function reachNotSureConfirmation(user: User) {
  mockCreate.mockResolvedValue(notSureExtraction());
  await reachReview(user, NSDESC);
  await proceedFromReview(user);
  await screen.findByText(/can the mistake be caught and put right/i);
  await user.click(screen.getByRole('button', { name: /^not sure$/i }));
  await screen.findByText(/how widely will it be used/i);
  await user.click(screen.getByRole('button', { name: /^just me, or a small trial$/i }));
  await screen.findByRole('button', { name: /confirm and evaluate/i });
}

/** The events of THIS test's case (the demo register is seeded into the same
 *  store, so "all events of a type" would include other cases): found by the
 *  description its use_case_created event carries. */
async function eventsOfType(type: string, description = NSDESC) {
  const all = await getAllForExport();
  const created = all.find(
    (e) => e.payload.type === 'use_case_created' && (e.payload as { description?: string }).description === description,
  );
  if (!created) return [];
  return all.filter((e) => e.use_case_id === created.use_case_id && e.payload.type === type);
}

type AssumptionLike = { questionId: string; fields: string[] };

describe('CR7-02 — re-entries into the review screen keep the "Not sure" assumptions (BC-004)', () => {
  it('TC-CR7-02a / TC-CR7-02c: Change an answer -> Continue -> Confirm keeps the "Not sure" assumption in graph_confirmed and on the result, and the countries panel is present', async () => {
    const user = userEvent.setup();
    await reachNotSureConfirmation(user);

    await user.click(document.querySelector<HTMLButtonElement>('.understood-summary__change')!);
    await screen.findByText('Check what we read from your description');
    // 02c — the countries panel renders on this re-entry.
    expect(screen.getByText('Which countries does it involve?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await clickThroughToConfirm(user);
    // The summary still lists the assumption on the way through.
    expect(screen.getAllByText(/the strictest case/i).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    await screen.findByText('Verdict', { selector: '.verdict__eyebrow' }, { timeout: 5000 });

    const confirmed = (await eventsOfType('graph_confirmed')).pop()!.payload as unknown as {
      assumptions?: AssumptionLike[];
    };
    expect(confirmed.assumptions?.map((a) => a.questionId)).toEqual(['field:output_reversibility']);
    expect(screen.getByText(/answers the submitter wasn.t sure about/i)).toBeInTheDocument();
  }, 30000);

  it('TC-CR7-02b: after a failed evaluation the re-entered review keeps the assumption through to the second graph_confirmed', async () => {
    const user = userEvent.setup();
    await reachNotSureConfirmation(user);
    vi.spyOn(evaluateModule, 'evaluate').mockReturnValueOnce({
      ok: false,
      error: { kind: 'no-track-match' },
    } as never);
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    await screen.findByText(/something went wrong working out the result/i);

    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await clickThroughToConfirm(user);
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    await screen.findByText('Verdict', { selector: '.verdict__eyebrow' }, { timeout: 5000 });

    const confirmed = (await eventsOfType('graph_confirmed')).map(
      (e) => e.payload as unknown as { assumptions?: AssumptionLike[] },
    );
    expect(confirmed).toHaveLength(2);
    for (const c of confirmed) expect(c.assumptions?.map((a) => a.questionId)).toEqual(['field:output_reversibility']);
  }, 30000);

  it('TC-CR7-02d: correcting from the result keeps the assumption in verdict_corrected', async () => {
    const user = userEvent.setup();
    await reachNotSureConfirmation(user);
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    await screen.findByText('Verdict', { selector: '.verdict__eyebrow' }, { timeout: 5000 });

    await user.click(document.querySelector<HTMLButtonElement>('.verdict__first-correct')!);
    await screen.findByText('Check what we read from your description');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await clickThroughToConfirm(user);
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    await waitFor(async () => expect(await eventsOfType('verdict_corrected')).toHaveLength(1), { timeout: 5000 });

    const corrected = (await eventsOfType('verdict_corrected'))[0]!.payload as unknown as {
      assumptions?: AssumptionLike[];
    };
    expect(corrected.assumptions?.map((a) => a.questionId)).toEqual(['field:output_reversibility']);
  }, 30000);
});

describe('CR7-03 — Back from the questions loses nothing; a rejected guess does not survive (BC-004)', () => {
  it('TC-CR7-03a / TC-CR7-03e: "Not sure" -> Back -> Continue asks the field again, the result lists the assumption once, and no duplicate graph_corrected events are written', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(notSureExtraction());
    await reachReview(user, NSDESC);
    await proceedFromReview(user);
    await screen.findByText(/can the mistake be caught and put right/i);
    await user.click(screen.getByRole('button', { name: /^not sure$/i }));
    await screen.findByText(/how widely will it be used/i);

    await user.click(screen.getByRole('button', { name: /back/i }));
    await screen.findByText('Check what we read from your description');
    await proceedFromReview(user);
    // Asked again from the pre-questionnaire values.
    await screen.findByText(/can the mistake be caught and put right/i);
    await user.click(screen.getByRole('button', { name: /^not sure$/i }));
    await screen.findByText(/how widely will it be used/i);
    await user.click(screen.getByRole('button', { name: /^just me, or a small trial$/i }));
    await user.click(await screen.findByRole('button', { name: /confirm and evaluate/i }));
    await screen.findByText('Verdict', { selector: '.verdict__eyebrow' }, { timeout: 5000 });

    const confirmed = (await eventsOfType('graph_confirmed')).pop()!.payload as unknown as {
      assumptions?: AssumptionLike[];
    };
    expect(confirmed.assumptions?.map((a) => a.questionId)).toEqual(['field:output_reversibility']);
    // 03e — one correction on the trail, not two.
    const corrections = await eventsOfType('graph_corrected');
    const keys = corrections.map((e) => {
      const c = (e.payload as unknown as { correction: { node_id: string; field: string } }).correction;
      return `${c.node_id}.${c.field}`;
    });
    expect(new Set(keys).size).toBe(keys.length);
  }, 30000);

  it('TC-CR7-03b: a vendor guess -> "Not on this list" -> Back -> Continue asks the supplier again, and the AI guess never reaches the result', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(supplierExtraction());
    await reachReview(user, VDESC);
    await proceedFromReview(user);
    await screen.findByText(/which supplier is it/i);
    await user.click(screen.getByRole('button', { name: /^not on this list$/i }));
    await screen.findByText(/what is it called/i);

    await user.click(screen.getByRole('button', { name: /back/i }));
    await screen.findByText('Check what we read from your description');
    await proceedFromReview(user);
    // Asked again — the guess was not silently accepted.
    await screen.findByText(/which supplier is it/i);
    await user.click(screen.getByRole('button', { name: /^i don.t know$/i }));
    await user.click(await screen.findByRole('button', { name: /confirm and evaluate/i }));
    await screen.findByText('Verdict', { selector: '.verdict__eyebrow' }, { timeout: 5000 });

    const confirmed = (await eventsOfType('graph_confirmed', VDESC)).pop()!.payload as unknown as {
      assumptions?: AssumptionLike[];
    };
    expect(confirmed.assumptions?.map((a) => a.questionId)).toEqual(['field:vendor']);
    expect(document.body.textContent).not.toMatch(/a specialist supplier\b(?! tool)/i);
  }, 30000);

  it('TC-CR7-03c: a declared-model guess -> "Not on the list" -> Back -> Continue asks the model again', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(supplierExtraction({ declaredModel: 'guessed-model-7' }));
    await reachReview(user, VDESC);
    await proceedFromReview(user);
    await screen.findByText(/which supplier is it/i);
    await user.click(screen.getByRole('button', { name: /^i don.t know$/i }));
    await screen.findByText(/model name, if you know it/i);
    await user.click(screen.getByRole('button', { name: /^not on the list$/i }));
    await screen.findByText(/what is it called/i);

    await user.click(screen.getByRole('button', { name: /back/i }));
    await screen.findByText('Check what we read from your description');
    await proceedFromReview(user);
    await screen.findByText(/which supplier is it/i);
    await user.click(screen.getByRole('button', { name: /^i don.t know$/i }));
    // The model question comes round again too.
    expect(await screen.findByText(/model name, if you know it/i)).toBeInTheDocument();
  }, 30000);

  it('TC-CR7-03d: decision type "Something else" -> Back -> Continue asks it again', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(supplierExtraction({ decisionType: 'pricing' }));
    await reachReview(user, VDESC);
    await proceedFromReview(user);
    await screen.findByText(/which supplier is it/i);
    await user.click(screen.getByRole('button', { name: /^i don.t know$/i }));
    await screen.findByText(/which of these does it help decide/i);
    await user.click(screen.getByRole('button', { name: /^something else — describe it$/i }));
    await screen.findByText(/what does it help decide\?/i);

    await user.click(screen.getByRole('button', { name: /back/i }));
    await screen.findByText('Check what we read from your description');
    await proceedFromReview(user);
    await screen.findByText(/which supplier is it/i);
    await user.click(screen.getByRole('button', { name: /^i don.t know$/i }));
    // Asked again from the pre-questionnaire values, not silently dropped.
    expect(await screen.findByText(/which of these does it help decide/i)).toBeInTheDocument();
  }, 30000);
});

describe('CR7-01 — a restored description draft that was waiting on the extractor restarts it', () => {
  function extractingDraft() {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ version: 2, state: { step: 'graph_extraction', description: NSDESC, method: 'llm' } }),
    );
  }

  it('TC-CR7-01a: the extractor is called exactly once and the review screen appears', async () => {
    mockCreate.mockResolvedValue(notSureExtraction());
    const spy = vi.spyOn(graphExtractorModule, 'extractGraph');
    extractingDraft();
    render(<App />);
    await screen.findByText('Check what we read from your description', undefined, { timeout: 5000 });
    expect(spy).toHaveBeenCalledTimes(1);
  }, 30000);

  it('TC-CR7-01a (StrictMode): still exactly one call when mounted twice', async () => {
    const { StrictMode } = await import('react');
    mockCreate.mockResolvedValue(notSureExtraction());
    const spy = vi.spyOn(graphExtractorModule, 'extractGraph');
    extractingDraft();
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByText('Check what we read from your description', undefined, { timeout: 5000 });
    expect(spy).toHaveBeenCalledTimes(1);
  }, 30000);

  it('TC-CR7-01b: restored + the extraction fails -> the Try again panel shows', async () => {
    mockCreate.mockRejectedValue(new Error('network down'));
    extractingDraft();
    render(<App />);
    expect(await screen.findByRole('button', { name: /try again/i }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText(/reading your description/i)).not.toBeInTheDocument();
  }, 30000);

  it('TC-CR7-01c: a fresh, non-restored description path calls the extractor exactly once', async () => {
    mockCreate.mockResolvedValue(notSureExtraction());
    const spy = vi.spyOn(graphExtractorModule, 'extractGraph');
    const user = userEvent.setup();
    await reachReview(user, NSDESC);
    expect(spy).toHaveBeenCalledTimes(1);
  }, 30000);
});

describe('CR7-17 — a failing self-assessment seed does not leave the duplicate check waiting forever', () => {
  it('TC-CR7-17: with the seed wait rejecting, a draft restored at the duplicate check still resolves it', async () => {
    seedOverride = () => Promise.reject(new Error('seed failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 'duplicate_check', description: 'A tool that drafts client emails' }));
    render(<IntakeFlow />);
    expect(await screen.findByRole('button', { name: /continue →/i }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText(/looking through earlier checks/i)).not.toBeInTheDocument();
  }, 30000);
});

describe('CR7-24 — Start over and Back do not keep the previous screen\'s error line', () => {
  async function provokeGateError(user: User) {
    mockCreate.mockResolvedValue(notSureExtraction());
    await reachReview(user, NSDESC);
    // Continue with the cards unchecked -> the gate error.
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    expect((await screen.findAllByText(/still need checking|check the countries/i)).length).toBeGreaterThan(0);
  }

  it('TC-CR7-24: Back, then forward again, shows no stale gate error', async () => {
    const user = userEvent.setup();
    await provokeGateError(user);
    await user.click(screen.getByRole('button', { name: /back/i }));
    await user.click(await screen.findByRole('button', { name: /continue →/i }));
    await screen.findByText('Check what we read from your description');
    expect(screen.queryAllByText(/still need checking|check the countries/i)).toHaveLength(0);
  }, 30000);

  it('TC-CR7-24: Start over, then a fresh case to the review screen, shows no stale gate error', async () => {
    const user = userEvent.setup();
    await provokeGateError(user);
    // Start over is on the resumed-draft banner: reload over the saved draft.
    cleanup();
    mockCreate.mockResolvedValue(notSureExtraction());
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /^continue$/i }));
    expect((await screen.findAllByText(/still need checking|check the countries/i)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /start over instead/i }));
    await user.type(await screen.findByLabelText(/what ai tool do you want to use/i), NSDESC);
    await user.click(screen.getByRole('button', { name: /^next/i }));
    await user.click(await screen.findByRole('button', { name: /continue →/i }));
    await screen.findByText('Check what we read from your description');
    expect(screen.queryAllByText(/still need checking|check the countries/i)).toHaveLength(0);
  }, 30000);
});

describe('CR7-37 — a policy problem reads as a plain sentence, not a field path', () => {
  it('TC-CR7-37: an invalid policy on the form path shows no field path in the alert, and says who can fix it', async () => {
    localStorage.clear(); // no key -> the guided form
    setCurrentPolicyYaml('this_is_not_a_valid_policy_shape: true');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText(/what ai tool do you want to use/i), 'A policy-problem probe');
    await user.click(screen.getByRole('button', { name: /^next/i }));
    await user.click(await screen.findByRole('button', { name: /continue →/i }));
    await fillMinimalForm(user, 'Policy problem tool', 'x');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    const alert = await screen.findByText(/rules file has a problem/i);
    expect(alert.textContent).not.toMatch(/policy invalid|policy file invalid|:\s|version|policy_id|tracks|invariants/i);
    expect(alert.textContent).toMatch(/nothing about your answers is at fault/i);
    expect(alert.textContent).toMatch(/appetite framework/i);
    // The detail still goes somewhere a developer can find it.
    expect(consoleSpy).toHaveBeenCalled();
  }, 30000);
});

async function fillMinimalForm(user: User, name: string, description: string) {
  await user.clear(screen.getByLabelText(/what do you want to call it/i));
  await user.type(screen.getByLabelText(/what do you want to call it/i), name);
  await user.clear(screen.getByLabelText(/in a sentence or two/i));
  await user.type(screen.getByLabelText(/in a sentence or two/i), description);
  await user.click(screen.getByRole('radio', { name: /something a team in your firm built for this job/i }));
  await user.click(
    screen.getByRole('radio', { name: /reads, summarises, translates, writes or answers questions in words/i }),
  );
  await user.click(screen.getByRole('checkbox', { name: /everyday work information/i }));
  await user.click(screen.getByRole('radio', { name: /finds or summarises for people to read/i }));
  await user.click(screen.getByRole('radio', { name: /^only me or my own team$/i }));
  await user.click(screen.getByRole('radio', { name: /none of these — it.s for day-to-day work/i }));
  await user.click(screen.getAllByRole('radio', { name: /^yes$/i })[0]!);
  await user.click(screen.getByRole('radio', { name: /just me, or a small trial/i }));
  await user.click(screen.getByRole('checkbox', { name: /somewhere else, or not sure/i }));
  await user.click(screen.getByRole('radio', { name: /^no$/i }));
}

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

/** Starts the guided form from a cold App (no API key configured). */
async function reachForm(user: User, description: string) {
  localStorage.removeItem('aigate:api-key');
  render(<App />);
  await user.type(screen.getByLabelText(/what ai tool do you want to use/i), description);
  await user.click(screen.getByRole('button', { name: /^next/i }));
  await user.click(await screen.findByRole('button', { name: /continue →/i }));
  await screen.findByLabelText(/what do you want to call it/i);
}

describe('CR7-04 (form half) — changing Q3 does not keep a hidden model name', () => {
  it('TC-CR7-04a: a model typed under "outside assistant", then Q3 switched to "built in your firm", never reaches the result or the register', async () => {
    const user = userEvent.setup();
    await reachForm(user, 'A small internal drafting helper.');
    await user.type(screen.getByLabelText(/what do you want to call it/i), 'Probe');
    await user.click(screen.getByRole('radio', { name: /an ai assistant or website run by an outside company/i }));
    await user.type(await screen.findByLabelText(/model name, if you know it/i), 'secret-model-9');
    // The form side: switching away clears the hidden answer.
    await fillMinimalForm(user, 'Probe', 'A small internal drafting helper.');
    expect(screen.queryByLabelText(/model name, if you know it/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await clickThroughToConfirm(user);
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    await screen.findByText('Verdict', { selector: '.verdict__eyebrow' }, { timeout: 5000 });

    expect(document.body.textContent).not.toMatch(/secret-model-9/);
    const mine = (await getUseCases('all')).find((u) => u.label === 'Probe')!;
    const graph = await getGraph(mine.use_case_id);
    expect(graph.nodes.filter((n) => n.node_type === 'ai_model')).toHaveLength(0);
  }, 30000);
});

describe("CR7-10 (intake half) — \"Use the earlier result\" does not show another person's case name to a non-2LoD view", () => {
  const MATCHED = 'Peer desk confidential assistant';
  async function seedMatch() {
    await addNode({
      node_id: crypto.randomUUID(),
      node_type: 'use_case',
      label: MATCHED,
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
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 'duplicate_check', description: MATCHED }));
  }

  it('TC-CR7-10a: a 1LoD view that adopts never has the matched label in the DOM', async () => {
    localStorage.removeItem('aigate:api-key');
    setRole('1LoD');
    await seedMatch();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /use the earlier result/i }));
    await screen.findByRole('region', { name: /classification adopted/i });
    expect(document.body.textContent).not.toContain(MATCHED);
    expect(screen.getByText(/an earlier result on your firm.s register was used/i)).toBeInTheDocument();
  }, 30000);

  it('TC-CR7-10b: a 2LoD view still sees the matched label', async () => {
    localStorage.removeItem('aigate:api-key');
    setRole('2LoD');
    await seedMatch();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /use the earlier result/i }));
    await screen.findByRole('region', { name: /classification adopted/i });
    expect(screen.getByText(new RegExp(`earlier result used from ${MATCHED}`, 'i'))).toBeInTheDocument();
  }, 30000);
});

describe('CR7-13 — form answers are cleared only once the policy check has accepted them', () => {
  it('TC-CR7-13: an invalid policy -> Continue -> remount: the answers are still there', async () => {
    setCurrentPolicyYaml(appetiteYaml.replace('  - id: "PLAT-INTERNAL-ML"\n', '  - id: "PLAT-INTERNAL-ML"\n    vendor_id: "NO-SUCH-VENDOR"\n'));
    const user = userEvent.setup();
    await reachForm(user, 'A form that must not lose its answers');
    await fillMinimalForm(user, 'Keep my answers', 'Sentence that must survive a refused submit.');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    // The check refused: a message shows and the form is still on screen.
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(sessionStorage.getItem(FORM_DRAFT_KEY)).not.toBeNull();

    cleanup();
    render(<App />);
    expect(await screen.findByLabelText(/what do you want to call it/i)).toHaveValue('Keep my answers');
  }, 30000);
});

describe("CR7-16 — an abandoned confirm or adopt cannot wipe a newer case's draft", () => {
  const NEWER_DRAFT = {
    version: 2,
    state: {
      step: 'graph_review',
      description: 'A newer case the person started meanwhile',
      graph: makeGraph({ intake_method: 'llm' }),
      graphVersion: 1,
      corrections: [],
      useCaseId: 'uc-newer-case',
    },
  };

  it("TC-CR7-16a: a confirm that finishes after the person left leaves a different case's draft alone", async () => {
    const useCaseId = 'uc-cr7-16a';
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
    const gate = held<void>();
    const traceSpy = vi.spyOn(traceModule, 'generateReasoningTraceForVerdict').mockImplementationOnce(async () => {
      await gate.promise;
      return { ok: false, error: { kind: 'no-api-key', message: 'held' } } as never;
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /confirm and evaluate/i }));
    await vi.waitFor(() => expect(traceSpy).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /▤ register/i }));
    // The person has since started a different case.
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(NEWER_DRAFT));

    gate.resolve();
    await waitFor(async () => {
      expect((await getAll(useCaseId)).map((e) => e.event_type)).toContain('verdict_produced');
    });
    expect(loadDraft()?.step).toBe('graph_review');
    expect((loadDraft() as { useCaseId?: string }).useCaseId).toBe('uc-newer-case');
  }, 30000);

  it("TC-CR7-16b: an adopt that finishes after the person left leaves a different case's draft alone", async () => {
    localStorage.removeItem('aigate:api-key');
    await addNode({
      node_id: crypto.randomUUID(),
      node_type: 'use_case',
      label: 'Adopt-late probe assistant',
      created_at: '2026-01-01T00:00:00.000Z',
      metadata: { node_type: 'use_case', submitted_by: '1LoD', lifecycle_stage: 'approved', current_verdict_id: null, tier: 'High', track: 'II' },
    });
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 'duplicate_check', description: 'Adopt-late probe assistant' }));
    const gate = held<void>();
    const realAddNode = registerModule.addNode;
    const addNodeSpy = vi.spyOn(registerModule, 'addNode');
    addNodeSpy.mockImplementationOnce(async (...args) => {
      await gate.promise;
      return realAddNode(...args);
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /use the earlier result/i }));
    await vi.waitFor(() => expect(addNodeSpy).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /▤ register/i }));
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(NEWER_DRAFT));

    gate.resolve();
    await waitFor(async () => {
      expect((await getAllForExport()).some((e) => e.event_type === 'classification_adopted')).toBe(true);
    });
    expect((loadDraft() as { useCaseId?: string }).useCaseId).toBe('uc-newer-case');
  }, 30000);

  it("TC-CR7-16b (own draft): a finished adopt still clears its own saved draft", async () => {
    localStorage.removeItem('aigate:api-key');
    await addNode({
      node_id: crypto.randomUUID(),
      node_type: 'use_case',
      label: 'Adopt-own probe assistant',
      created_at: '2026-01-01T00:00:00.000Z',
      metadata: { node_type: 'use_case', submitted_by: '1LoD', lifecycle_stage: 'approved', current_verdict_id: null, tier: 'High', track: 'II' },
    });
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 'duplicate_check', description: 'Adopt-own probe assistant' }));
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /use the earlier result/i }));
    await screen.findByRole('region', { name: /classification adopted/i });
    expect(loadDraft()).toBeNull();
  }, 30000);
});

describe('CR7-21 / CR7-22 — correction events are written once, and a fresh confirm writes the ones it announces', () => {
  it('TC-CR7-21a: a form-path correction -> failed evaluation -> retry writes one set of graph_corrected events', async () => {
    const user = userEvent.setup();
    const label = 'Zephyrquill retry probe';
    await reachForm(user, label);
    await fillMinimalForm(user, label, 'Sorts internal documents for the retry test.');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await clickThroughToConfirm(user);
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    await screen.findByText('Verdict', { selector: '.verdict__eyebrow' }, { timeout: 5000 });
    const useCase = (await getUseCases('all')).find((u) => u.label === label)!;

    await user.click(document.querySelector<HTMLButtonElement>('.verdict__first-correct')!);
    const nameInput = (await screen.findByLabelText(/what do you want to call it/i)) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, `${label} (corrected)`);
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await clickThroughToConfirm(user);
    vi.spyOn(evaluateModule, 'evaluate').mockReturnValueOnce({ ok: false, error: { kind: 'no-track-match' } } as never);
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    expect(await screen.findByText(/evaluation could not complete/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await clickThroughToConfirm(user);
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    await waitFor(
      async () =>
        expect((await getAll(useCase.use_case_id)).filter((e) => e.event_type === 'verdict_corrected')).toHaveLength(1),
      { timeout: 5000 },
    );

    const corrections = (await getAll(useCase.use_case_id)).filter((e) => e.event_type === 'graph_corrected');
    expect(corrections).toHaveLength(1);
  }, 60000);

  it('TC-CR7-21b: a description-path correction -> failed evaluation -> retry puts the correction on the trail exactly once', async () => {
    const user = userEvent.setup();
    await reachNotSureConfirmation(user); // the "Not sure" answer IS a correction
    vi.spyOn(evaluateModule, 'evaluate').mockReturnValueOnce({ ok: false, error: { kind: 'no-track-match' } } as never);
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    await screen.findByText(/something went wrong working out the result/i);
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await clickThroughToConfirm(user);
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    await screen.findByText('Verdict', { selector: '.verdict__eyebrow' }, { timeout: 5000 });

    const corrections = await eventsOfType('graph_corrected');
    expect(
      corrections.filter(
        (e) => (e.payload as unknown as { correction: { field: string } }).correction.field === 'output_reversibility',
      ),
    ).toHaveLength(1);
  }, 30000);

  it('TC-CR7-22: the confirmation says "N corrections made … preserved in the audit trail" — and the trail holds exactly N graph_corrected events', async () => {
    const user = userEvent.setup();
    await reachNotSureConfirmation(user);
    const sentence = screen.getByText(/corrections? made\. original extraction and corrections are both preserved in the audit trail/i);
    const claimed = Number(/(\d+) correction/.exec(sentence.textContent ?? '')![1]);
    expect(claimed).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    await screen.findByText('Verdict', { selector: '.verdict__eyebrow' }, { timeout: 5000 });
    expect(await eventsOfType('graph_corrected')).toHaveLength(claimed);
  }, 30000);
});

describe('CR7-30 (writer half) — no "undefined" value in a recorded correction', () => {
  it('TC-CR7-30a: a questionnaire answer for a field that had no value is recorded with original_value null, not undefined', async () => {
    const user = userEvent.setup();
    const ext = notSureExtraction();
    // An agent: its reach fields are absent and so are asked about.
    (ext.content[0]!.input.processing_nodes[0] as Record<string, unknown>).model_type = 'agentic';
    mockCreate.mockResolvedValue(ext);
    await reachReview(user, NSDESC);
    await proceedFromReview(user);
    await screen.findByText(/what can it get into by itself/i);
    await user.click(screen.getByRole('checkbox', { name: /nothing beyond what it.s given for the task/i }));
    await user.click(screen.getByRole('button', { name: /^done$/i }));
    await clickThroughToConfirm(user);
    await user.click(screen.getByRole('button', { name: /confirm and evaluate/i }));
    await screen.findByText('Verdict', { selector: '.verdict__eyebrow' }, { timeout: 5000 });

    const hit = (await eventsOfType('graph_corrected'))
      .map((e) => (e.payload as unknown as { correction: Record<string, unknown> }).correction)
      .find((c) => c.field === 'system_access_scope')!;
    expect(hit).toBeDefined();
    expect(hit.original_value).toBeNull();
    expect(hit.corrected_value).not.toBeUndefined();
  }, 30000);
});
