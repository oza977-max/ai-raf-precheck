import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import * as registerModule from '../../store/register';
import { getUseCases } from '../../store/register';

// Review pass 1, M-2. The register says "No model was named" when a case has no
// uses_model edge. That is only sound if a case can never exist WITHOUT its
// link when a model was declared — i.e. the link write must not fail after the
// use-case node was written. The link is therefore written FIRST (and a failure
// stops the confirmation before any use-case node exists).
// Mock budget = 1 (the Anthropic SDK); addUseCaseModelLink is SPIED, not replaced.
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

const DESC = 'The Alpha tool built in-house drafts text. A person checks each one. It replaces no earlier model.';

function extraction() {
  return {
    content: [
      {
        type: 'tool_use',
        name: 'extract_graph',
        input: {
          input_nodes: [
            { id: 'i1', label: 'notes', data_class: 'Internal', data_zone: 'Zone B', basis_quotes: { data_class: 'drafts text', data_zone: 'built in-house' } },
          ],
          processing_nodes: [
            {
              id: 'p1', label: 'drafting tool', model_type: 'llm', autonomy_level: 1, data_zone: 'Zone B', vendor: 'internal',
              declared_model_id: 'qwen3:4b', replaces_prior_model: false,
              basis_quotes: {
                model_type: 'drafts text', autonomy_level: 'A person checks', data_zone: 'built in-house', vendor: 'built in-house',
                declared_model_id: 'Alpha', replaces_prior_model: 'replaces no earlier model',
              },
            },
          ],
          output_nodes: [
            {
              id: 'o1', label: 'drafts', action_type: 'draft', exposure: 'internal-only', decision_bindingness: 'non-binding',
              output_reversibility: 'reversible', scale: 'limited',
              basis_quotes: {
                action_type: 'drafts text', exposure: 'A person checks', decision_bindingness: 'A person checks',
                output_reversibility: 'A person checks', scale: 'A person checks',
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

async function reachConfirm(user: User) {
  render(<App />);
  await user.type(screen.getByLabelText(/what ai tool do you want to use/i), DESC);
  await user.click(screen.getByRole('button', { name: /^next/i }));
  await user.click(await screen.findByRole('button', { name: /continue →/i }));
  await screen.findByText('Check what we read from your description');
  for (;;) {
    const b = screen.queryAllByRole('button', { name: /^(this is right|i.ve checked this — it.s right)$/i })[0];
    if (!b) break;
    await user.click(b);
  }
  const jur = screen.queryByRole('button', { name: /^(these are right|none of these — continue)$/i });
  if (jur) await user.click(jur);
  await user.click(screen.getByRole('button', { name: /^continue$/i }));
  for (let i = 0; i < 20; i++) {
    if (screen.queryByRole('button', { name: /confirm and evaluate/i })) break;
    const option = document.querySelector<HTMLButtonElement>('.questionnaire__options button');
    if (!option) break;
    await user.click(option);
  }
  return screen.findByRole('button', { name: /confirm and evaluate/i });
}

describe('IntakeFlow — the model link is written before the use-case node (review pass 1, M-2)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('aigate:api-key', 'test-key');
    mockCreate.mockReset();
    vi.restoreAllMocks();
  });

  it('TC-CR7-11h: when the link write fails, no use-case node is left behind — so the register can never show a model-less case that had a model', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(extraction());
    const confirm = await reachConfirm(user);
    // Spied only now: App's own seeding of the built-in example case (which
    // uses the same function) has long finished by this point.
    const linkSpy = vi.spyOn(registerModule, 'addUseCaseModelLink').mockRejectedValue(new Error('link write failed'));
    const before = (await getUseCases('all')).length;
    await user.click(confirm);
    await waitFor(() => expect(linkSpy).toHaveBeenCalled(), { timeout: 5000 });
    // Settle: the failure surfaces on screen and the flow returns to the answers.
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 }).catch(() => undefined);
    const after = await getUseCases('all');
    expect(after.length).toBe(before);
    expect(after.some((r) => r.description === DESC)).toBe(false);
  }, 40000);

  it('TC-CR7-11h-1: on success the link exists for the saved case (the order change loses nothing)', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(extraction());
    const confirm = await reachConfirm(user);
    await user.click(confirm);
    await screen.findByText('Verdict', { selector: '.verdict__eyebrow' }, { timeout: 8000 });
    const row = (await getUseCases('all')).find((r) => r.description === DESC);
    expect(row).toBeDefined();
    const { edges } = await registerModule.getGraph(row!.use_case_id);
    expect(edges.some((e) => e.edge_type === 'uses_model')).toBe(true);
  }, 40000);
});
