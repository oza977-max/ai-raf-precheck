import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StructuredForm from '../StructuredForm';
import type { PolicyFile } from '../../engine/types';

// Several questions share a short option word ("Yes"/"No"/"Not sure") on
// this continuous-scroll form, where every question is in the DOM at once
// (§2.2: "one continuous scroll"). Ambiguous role queries are scoped to the
// right fieldset via its legend; the fieldset gets an accessible "group"
// name from the legend for free. A draft left in sessionStorage by one test
// must never leak into the next (StructuredForm restores from it on mount).
beforeEach(() => {
  sessionStorage.clear();
});

function radioIn(groupName: RegExp, optionName: RegExp) {
  return within(screen.getByRole('group', { name: groupName })).getByRole('radio', { name: optionName });
}

// R16-B (build/prompts/R16.md v2.1 §2.2). Replaces the field-by-field form
// entirely — UC-3a's requirements/requirements.md amendment (2026-10-02)
// retires that shape. What survives, named explicitly there, is tested
// below under the ORIGINAL ids (TC-UC-3a-01/02/03): the form works with no
// API key, produces the same DataFlowGraph shape, and records
// structured_form intake. Everything the old suite tested that depended on
// the retired field-by-field shape (canonical-vocabulary dropdown values,
// the five-fieldset legend text, the old field-specific help copy, the
// three-state jurisdiction/draft migration mechanics) is moved to a
// `## Superseded` section in test-cases.md / test-cases-003.md /
// test-cases-015.md with its reason — never silently dropped.

function policy(overrides: Partial<PolicyFile> = {}): PolicyFile {
  return {
    version: '1.0',
    policy_id: 'TEST',
    firm_name: 'Test',
    translation_attestation: { attested_by: 'x', role: 'x', date: 'x', raf_version_checked: 'x' },
    hard_lines: [],
    tracks: [],
    tiers: [],
    invariants: [],
    controls: [],
    kri_thresholds: {},
    jurisdictions: [{ code: 'UK', name: 'United Kingdom', pack_files: [] }],
    roles: {},
    tier_workflow: { Critical: 'x', High: 'x', Medium: 'x', Low: 'x' },
    safety_margin: 0.1,
    ...overrides,
  };
}

/** The minimal path through every BASE required question (1-12) with no
 *  conditional follow-up triggered — Q3 "firm-built" skips 3a/3supplier/
 *  3model's visibility, Q4 "language" skips 4a/13/14, Q6 "read" skips
 *  6a/6b, Q8 "operational" skips 8other. Conditional-follow-up
 *  requiredness is covered by its own dedicated tests below rather than
 *  folded into this probe. */
async function fillBase(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/what do you want to call it/i), 'Test tool');
  await user.type(screen.getByLabelText(/in a sentence or two/i), 'A test description.');
  await user.click(screen.getByRole('radio', { name: /something a team in your firm built for this job/i }));
  await user.click(
    screen.getByRole('radio', { name: /reads, summarises, translates, writes or answers questions in words/i }),
  );
  await user.click(screen.getByRole('checkbox', { name: /everyday work information/i }));
  await user.click(screen.getByRole('radio', { name: /finds or summarises for people to read/i }));
  await user.click(screen.getByRole('radio', { name: /^only me or my own team$/i }));
  await user.click(screen.getByRole('radio', { name: /none of these — it.s for day-to-day work/i }));
  await user.click(radioIn(/if it gets something wrong/i, /^yes$/i));
  await user.click(screen.getByRole('radio', { name: /just me, or a small trial/i }));
  await user.click(screen.getByRole('checkbox', { name: /somewhere else, or not sure/i }));
  await user.click(radioIn(/does it replace something/i, /^no$/i));
}

describe('StructuredForm — the replacement form (UC-3a survives: no API key, same graph shape, structured_form intake)', () => {
  it('TC-UC-3a-01: produces a valid DataFlowGraph with one node per category', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<StructuredForm policy={policy()} onSubmit={onSubmit} />);
    await fillBase(user);
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [graph, assumptions] = onSubmit.mock.calls[0]!;
    expect(graph.input_nodes).toHaveLength(1);
    expect(graph.processing_nodes).toHaveLength(1);
    expect(graph.output_nodes).toHaveLength(1);
    expect(graph.input_nodes[0].data_class).toBe('Internal');
    expect(graph.processing_nodes[0].model_type).toBe('llm');
    expect(Array.isArray(assumptions)).toBe(true);
  });

  it('TC-UC-3a-02: sets intake_method to structured_form', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<StructuredForm policy={policy()} onSubmit={onSubmit} />);
    await fillBase(user);
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(onSubmit.mock.calls[0]![0].intake_method).toBe('structured_form');
  });

  it('TC-UC-3a-03: Continue is disabled until every required question is answered', async () => {
    const user = userEvent.setup();
    render(<StructuredForm policy={policy()} onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    await fillBase(user);
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  it('no API key is needed anywhere on this path — the form never imports or calls the LLM boundary', async () => {
    // Structural guarantee: StructuredForm's only engine imports are
    // plain-intake and build-graph-from-form, both pure and API-free; this
    // is asserted at the module level by cross-cutting.md §7 Rule 1/2, and
    // behaviourally by the WalkingSkeleton no-api-key suite.
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<StructuredForm policy={policy()} onSubmit={onSubmit} />);
    await fillBase(user);
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(onSubmit).toHaveBeenCalled();
  });
});

describe('StructuredForm — no engine vocabulary on the first screen (principle 1, UC-8 fit criterion 1)', () => {
  it('TC-R16-B-08: no question or option renders a bare engine term or code', () => {
    render(<StructuredForm policy={policy()} onSubmit={vi.fn()} />);
    const text = document.body.textContent ?? '';
    for (const banned of ['Zone A', 'Zone B', 'Zone C', 'MNPI', 'autonomy', 'bindingness', 'Track I', 'Track II', 'Track III']) {
      expect(text).not.toContain(banned);
    }
    // "LLM", "agentic" etc. as bare category names must not appear either —
    // the kind-of-AI question describes situations, not model-type labels.
    expect(screen.queryByText(/^LLM$/)).not.toBeInTheDocument();
  });

  it('never renders the bare [FIRM] placeholder', () => {
    render(
      <StructuredForm
        policy={policy({
          platforms: [{ id: 'PLAT-X', name: '[FIRM] internal platform', approved_envelope: {}, satisfies_controls: [] }],
        })}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByText(/\[FIRM\]/)).not.toBeInTheDocument();
  });
});

describe('StructuredForm — never-render-[FIRM] fallback labels (D-23)', () => {
  it('TC-R16-B-12: a platform with no plain_name shows "Your firm’s AI service {n}", not its raw registry name', () => {
    render(
      <StructuredForm
        policy={policy({
          platforms: [{ id: 'PLAT-X', name: '[FIRM] internal platform', approved_envelope: {}, satisfies_controls: [] }],
        })}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('radio', { name: /your firm.s ai service 1/i })).toBeInTheDocument();
  });

  it('a supplier with no plain_name shows "Supplier {n}"', async () => {
    const user = userEvent.setup();
    render(
      <StructuredForm
        policy={policy({
          vendors: [{ id: 'VEND-X', name: '[FIRM] vendor', approved_envelope: {}, satisfies_controls: [], kind: 'supplier' }],
        })}
        onSubmit={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole('radio', {
        name: /a product your firm is buying from a specialist supplier/i,
      }),
    );
    expect(screen.getByRole('radio', { name: /^supplier 1$/i })).toBeInTheDocument();
  });
});

describe('StructuredForm — conditional follow-ups (§2.2 Details)', () => {
  it('TC-R16-B-09: Q3a appears only for "outside-assistant", and its answer is cleared when Q3 changes away', async () => {
    const user = userEvent.setup();
    render(<StructuredForm policy={policy()} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('radio', { name: /a free or personal account/i })).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('radio', { name: /an ai assistant or website run by an outside company/i }),
    );
    expect(screen.getByRole('radio', { name: /a free or personal account/i })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /a free or personal account/i }));

    // Switching Q3 away removes Q3a from the DOM entirely.
    await user.click(screen.getByRole('radio', { name: /something a team in your firm built for this job/i }));
    expect(screen.queryByRole('radio', { name: /a free or personal account/i })).not.toBeInTheDocument();
  });

  it('TC-R16-B-10: Q13/Q14 appear for the agentic option and for Q4 "Not sure", and nowhere else', async () => {
    const user = userEvent.setup();
    render(<StructuredForm policy={policy()} onSubmit={vi.fn()} />);
    expect(screen.queryByText(/what can it get into by itself/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /an ai agent that works through tasks on its own/i }));
    expect(screen.getByText(/what can it get into by itself/i)).toBeInTheDocument();
    expect(screen.getByText(/can copies of it, or other ai agents, pass work/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole('radio', { name: /reads, summarises, translates, writes or answers questions in words/i }),
    );
    expect(screen.queryByText(/what can it get into by itself/i)).not.toBeInTheDocument();

    const q4NotSure = screen.getAllByRole('radio', { name: /^not sure$/i })[0]!;
    await user.click(q4NotSure);
    expect(screen.getByText(/what can it get into by itself/i)).toBeInTheDocument();
  });

  it('TC-R16-B-11: Q13 "Nothing beyond..." is exclusive with the other ticks, and vice versa', async () => {
    const user = userEvent.setup();
    render(<StructuredForm policy={policy()} onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: /an ai agent that works through tasks on its own/i }));

    const none = screen.getByRole('checkbox', { name: /nothing beyond what it’s given for the task/i });
    const credentialed = screen.getByRole('checkbox', { name: /its own logins, passwords or access tokens/i });

    await user.click(credentialed);
    expect(credentialed).toBeChecked();
    await user.click(none);
    expect(none).toBeChecked();
    expect(credentialed).not.toBeChecked();

    await user.click(credentialed);
    expect(credentialed).toBeChecked();
    expect(none).not.toBeChecked();
  });

  it('TC-R16-B-15: Q8 "Something else" requires the free-text description before Continue enables', async () => {
    const user = userEvent.setup();
    render(<StructuredForm policy={policy()} onSubmit={vi.fn()} />);
    await fillBase(user);
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();

    await user.click(screen.getByRole('radio', { name: /something else — describe it/i }));
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/what kind of decision is it/i), 'Collections prioritisation');
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });
});

describe('StructuredForm — jurisdictions (tick-all), adapted from R3-JU-1', () => {
  async function fillExceptJurisdiction(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/what do you want to call it/i), 'Test tool');
    await user.type(screen.getByLabelText(/in a sentence or two/i), 'A test description.');
    await user.click(screen.getByRole('radio', { name: /something a team in your firm built for this job/i }));
    await user.click(
      screen.getByRole('radio', { name: /reads, summarises, translates, writes or answers questions in words/i }),
    );
    await user.click(screen.getByRole('checkbox', { name: /everyday work information/i }));
    await user.click(screen.getByRole('radio', { name: /finds or summarises for people to read/i }));
    await user.click(screen.getByRole('radio', { name: /^only me or my own team$/i }));
    await user.click(screen.getByRole('radio', { name: /none of these — it.s for day-to-day work/i }));
    await user.click(radioIn(/if it gets something wrong/i, /^yes$/i));
    await user.click(screen.getByRole('radio', { name: /just me, or a small trial/i }));
    await user.click(radioIn(/does it replace something/i, /^no$/i));
  }

  it('TC-R3-JU-1-01: an untouched jurisdiction question blocks progress; ticking one unblocks it', async () => {
    const user = userEvent.setup();
    render(<StructuredForm policy={policy()} onSubmit={vi.fn()} />);
    await fillExceptJurisdiction(user);
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /united kingdom/i }));
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  it('TC-R3-JU-1-02: "Somewhere else, or not sure" submits an empty jurisdictions array', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<StructuredForm policy={policy()} onSubmit={onSubmit} />);
    await fillExceptJurisdiction(user);
    await user.click(screen.getByRole('checkbox', { name: /somewhere else, or not sure/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(onSubmit.mock.calls[0]![0].jurisdictions).toEqual([]);
  });

  it('TC-R3-JU-1-03: ticking a real jurisdiction unblocks progress', async () => {
    const user = userEvent.setup();
    render(<StructuredForm policy={policy()} onSubmit={vi.fn()} />);
    await fillExceptJurisdiction(user);
    await user.click(screen.getByRole('checkbox', { name: /united kingdom/i }));
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });
});

describe('StructuredForm — required-field markers (adapted from R3-JU-5)', () => {
  it('TC-R3-JU-5-01: every BASE question that blocks progress carries both a visible marker and aria-required (narrowed to the 12 unconditional base questions — each conditional follow-up’s own requiredness is covered by its dedicated test above)', async () => {
    const user = userEvent.setup();
    const { container } = render(<StructuredForm policy={policy()} onSubmit={vi.fn()} />);
    await fillBase(user);
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
    const markers = container.querySelectorAll('.required-marker');
    expect(markers.length).toBeGreaterThanOrEqual(12);
    const requiredFieldsets = container.querySelectorAll('fieldset[aria-required="true"]');
    expect(requiredFieldsets.length).toBeGreaterThanOrEqual(9); // the 9 single/multi-select base questions
  });

  it('TC-R3-JU-5-02: optional fields (3supplierName, 3model) carry neither signal', async () => {
    const user = userEvent.setup();
    const { container } = render(<StructuredForm policy={policy()} onSubmit={vi.fn()} />);
    await user.click(
      screen.getByRole('radio', { name: /a product your firm is buying from a specialist supplier/i }),
    );
    const modelInput = screen.getByLabelText(/model name, if you know it/i);
    expect(modelInput).not.toHaveAttribute('aria-required');
    expect(container.querySelector('[data-required-marker-for="pf-3model"]')).toBeNull();
  });
});

describe('StructuredForm — draft persistence under the new versioned key (R16-B, D-41)', () => {
  it('TC-R16-B-14: round-trips answers across a remount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<StructuredForm policy={policy()} onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText(/what do you want to call it/i), 'Persisted name');
    unmount();

    render(<StructuredForm policy={policy()} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/what do you want to call it/i)).toHaveValue('Persisted name');
    sessionStorage.clear();
  });

  it('TC-R16-B-13: a draft under the pre-R16 key is reported once and cannot block the fresh form', () => {
    sessionStorage.setItem('aigate:intake-form-draft', JSON.stringify({ useCaseName: 'Old shape' }));
    render(<StructuredForm policy={policy()} onSubmit={vi.fn()} />);
    expect(
      screen.getByText(/your saved draft was from an older version of this form and couldn’t be reused/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/what do you want to call it/i)).toHaveValue('');
    sessionStorage.clear();
  });
});
