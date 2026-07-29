import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StructuredForm from '../StructuredForm';
import { DATA_CLASSES, DATA_ZONES, MODEL_TYPES } from '../../engine/canonical-vocabulary';

const JURISDICTIONS = [{ code: 'UK', name: 'United Kingdom', pack_files: [] }];

function optionValues(labelPattern: RegExp): string[] {
  return [...screen.getByLabelText(labelPattern).querySelectorAll('option:not([value=""])')].map(
    (o) => (o as HTMLOptionElement).value,
  );
}

describe('StructuredForm', () => {
  // V2-E: strengthened. Previously this only counted options, which a
  // hardcoded list of the right length would have passed. Since the labels
  // are now plain English while the values stay canonical, asserting the
  // VALUES is what actually pins the form to the vocabulary the policy
  // rules match on.
  it('TC-UC-3a-03: select option values are the canonical vocabulary, not hardcoded strings', () => {
    render(<StructuredForm jurisdictions={JURISDICTIONS} onSubmit={vi.fn()} />);

    expect(optionValues(/what kind of information does it use/i)).toEqual([...DATA_CLASSES]);
    expect(optionValues(/what kind of ai is it/i)).toEqual([...MODEL_TYPES]);
    expect(optionValues(/where does that information sit today/i)).toEqual([...DATA_ZONES]);
  });

  it('TC-UC-3a-01/02: submitting a fully-filled form calls onSubmit with a valid structured_form graph', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<StructuredForm jurisdictions={JURISDICTIONS} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/what do you want to call it/i), 'Test tool');
    await user.type(screen.getByLabelText(/in a sentence or two/i), 'A test description.');
    await user.selectOptions(screen.getByLabelText(/what kind of information does it use/i), 'Internal');
    await user.selectOptions(screen.getByLabelText(/where does that information sit today/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/what kind of ai is it/i), 'traditional-ml');
    await user.selectOptions(screen.getByLabelText(/where does the ai itself run/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/what does it actually produce or do/i), 'read');
    await user.selectOptions(screen.getByLabelText(/who sees what it produces/i), 'internal-only');
    await user.selectOptions(screen.getByLabelText(/how much weight does its output carry/i), 'non-binding');
    await user.selectOptions(screen.getByLabelText(/if it gets something wrong/i), 'reversible');
    await user.selectOptions(screen.getByLabelText(/how widely is it used/i), 'limited');

    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const graph = onSubmit.mock.calls[0]?.[0];
    expect(graph.intake_method).toBe('structured_form');
    expect(graph.input_nodes[0]?.data_class).toBe('Internal');
  });

  it('disables submit until all required fields are filled', () => {
    render(<StructuredForm jurisdictions={JURISDICTIONS} onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('shows the exact spec-mandated banner text (intake-flow.md §5.1)', () => {
    render(<StructuredForm jurisdictions={JURISDICTIONS} onSubmit={vi.fn()} />);
    expect(
      screen.getByText(
        /guided intake — answer the fields below to describe your use case\. no ai is involved in reading your answers or in the decision that follows, so the same answers always produce the same outcome\./i,
      ),
    ).toBeInTheDocument();
  });
});

describe('StructuredForm — business-friendly wording (V2-E)', () => {
  // The user feedback that drove this: the form asked for "input data
  // class", "output reversibility" and so on — the engine's own field
  // names. Nobody outside model risk can answer those. These assertions
  // stop the internal vocabulary leaking back into the labels.
  it('asks questions in business language, not engine field names', () => {
    render(<StructuredForm jurisdictions={[]} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/what kind of information does it use/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/where does the ai itself run/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/if it gets something wrong, can it be undone/i)).toBeInTheDocument();

    expect(screen.queryByLabelText(/^input data class$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^output reversibility$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^decision bindingness$/i)).not.toBeInTheDocument();
  });

  // Plain language must not cost traceability: a model-validation reader
  // has to be able to map an answer back to the term the policy and the
  // verdict are written in.
  it('keeps the canonical term visible on each option so answers stay traceable', () => {
    render(<StructuredForm jurisdictions={[]} onSubmit={vi.fn()} />);

    expect(screen.getByRole('option', { name: /price-sensitive information.*\(MNPI\)/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /chatbot or writing assistant.*\(LLM\)/i })).toBeInTheDocument();
    // Zone B appears on both zone questions — the point is that the
    // canonical code survives alongside the plain wording.
    expect(screen.getAllByRole('option', { name: /with an outside supplier.*\(Zone B\)/i })).toHaveLength(2);
  });

  it('explains the traps a first-time submitter falls into', () => {
    render(<StructuredForm jurisdictions={[]} onSubmit={vi.fn()} />);
    // Storage location vs processing location is the distinction people get
    // wrong, and it is the one the zone-crossing rules turn on.
    expect(screen.getByText(/not where the data is stored — where it gets sent/i)).toBeInTheDocument();
    // Bindingness is routinely understated relative to what happens in practice.
    expect(screen.getByText(/be honest about what happens in practice/i)).toBeInTheDocument();
  });
});

// SR-1 (code review 001). PV-2 and PV-5 were implemented in the engine, test-
// covered, and unreachable from the product: build-graph-from-form hardcoded
// vendor:'internal' and the form never asked for a platform or vendor. The
// engine capability existed with no path from the UI.
describe('StructuredForm — platform and vendor reach the graph (SR-1)', () => {
  const PLATFORMS = [
    { id: 'PLAT-A', name: 'Internal ML platform', approved_envelope: {}, satisfies_controls: [] },
  ];
  const VENDORS = [
    { id: 'VENDOR-A', name: 'Approved LLM vendor', approved_envelope: {}, satisfies_controls: [] },
  ];

  async function fill(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/what do you want to call it/i), 'SR-1 probe');
    await user.type(screen.getByLabelText(/in a sentence or two/i), 'x');
    await user.selectOptions(screen.getByLabelText(/what kind of information does it use/i), 'Internal');
    await user.selectOptions(screen.getByLabelText(/where does that information sit today/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/what kind of ai is it/i), 'traditional-ml');
    await user.selectOptions(screen.getByLabelText(/where does the ai itself run/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/what does it actually produce or do/i), 'read');
    await user.selectOptions(screen.getByLabelText(/who sees what it produces/i), 'internal-only');
    await user.selectOptions(screen.getByLabelText(/how much weight does its output carry/i), 'non-binding');
    await user.selectOptions(screen.getByLabelText(/if it gets something wrong/i), 'reversible');
    await user.selectOptions(screen.getByLabelText(/how widely is it used/i), 'limited');
  }

  it('offers the approved platforms and vendors from the policy registries', () => {
    render(<StructuredForm jurisdictions={JURISDICTIONS} platforms={PLATFORMS} vendors={VENDORS} onSubmit={vi.fn()} />);
    expect(screen.getByRole('option', { name: /Internal ML platform \(PLAT-A\)/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Approved LLM vendor \(VENDOR-A\)/ })).toBeInTheDocument();
    // PV-5 must be reachable: a component NOT on the registry has to be sayable.
    expect(screen.getAllByRole('option', { name: /not on the list/i }).length).toBe(2);
  });

  it('carries a selected platform and vendor onto the graph, so PV-3 and PV-5 can fire', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<StructuredForm jurisdictions={JURISDICTIONS} platforms={PLATFORMS} vendors={VENDORS} onSubmit={onSubmit} />);
    await fill(user);
    await user.selectOptions(screen.getByLabelText(/which approved platform/i), 'PLAT-A');
    await user.selectOptions(screen.getByLabelText(/whose model or service/i), 'VENDOR-A');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    const graph = onSubmit.mock.calls[0]?.[0];
    expect(graph.processing_nodes[0].platform).toBe('PLAT-A');
    expect(graph.processing_nodes[0].vendor).toBe('VENDOR-A');
  });

  it("defaults to the 'internal' sentinel when nothing is chosen, so existing behaviour is unchanged", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<StructuredForm jurisdictions={JURISDICTIONS} onSubmit={onSubmit} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: /continue/i }));

    const graph = onSubmit.mock.calls[0]?.[0];
    expect(graph.processing_nodes[0].vendor).toBe('internal');
    expect(graph.processing_nodes[0].platform).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// P8-C01 — jurisdiction answered-state (R3-JU-1, R3-JU-4)
//
// The defect: the jurisdiction fieldset existed and was offered, but nothing
// required an answer. isComplete tested `v.jurisdictions` for presence and an
// empty array is truthy, so Continue enabled with nothing ticked. The user
// then attested to a graph reading "None specified" and got a verdict with no
// packs, no regulatory chain and no citations — with nothing saying so.
// Charter 004 D-002; requirements-003 R3-JU-1; intake-flow.md §13.1.
// ---------------------------------------------------------------------------

async function fillEverythingExceptJurisdiction(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/what do you want to call it/i), 'Test tool');
  await user.type(screen.getByLabelText(/in a sentence or two/i), 'A test description.');
  await user.selectOptions(screen.getByLabelText(/what kind of information does it use/i), 'Internal');
  await user.selectOptions(screen.getByLabelText(/where does that information sit today/i), 'Zone C');
  await user.selectOptions(screen.getByLabelText(/what kind of ai is it/i), 'traditional-ml');
  await user.selectOptions(screen.getByLabelText(/where does the ai itself run/i), 'Zone C');
  await user.selectOptions(screen.getByLabelText(/what does it actually produce or do/i), 'read');
  await user.selectOptions(screen.getByLabelText(/who sees what it produces/i), 'internal-only');
  await user.selectOptions(screen.getByLabelText(/how much weight does its output carry/i), 'non-binding');
  await user.selectOptions(screen.getByLabelText(/if it gets something wrong/i), 'reversible');
  await user.selectOptions(screen.getByLabelText(/how widely is it used/i), 'limited');
}

describe('StructuredForm — jurisdiction answered-state (P8-C01)', () => {
  // ACCEPTANCE TEST (TDD-1, outside-in — written first).
  it('TC-R3-JU-1-01/02: an untouched jurisdiction question blocks progress; an explicit "none" unblocks it', async () => {
    const user = userEvent.setup();
    render(<StructuredForm jurisdictions={JURISDICTIONS} onSubmit={vi.fn()} />);

    await fillEverythingExceptJurisdiction(user);

    // Not answered — every other field is complete, so the ONLY thing
    // holding the gate is the untouched jurisdiction question.
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();

    // Answered: none — an explicit choice, so the gate opens.
    await user.click(screen.getByLabelText(/none.*not sure/i));
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  it('TC-R3-JU-1-03: ticking a jurisdiction unblocks progress', async () => {
    const user = userEvent.setup();
    render(<StructuredForm jurisdictions={JURISDICTIONS} onSubmit={vi.fn()} />);
    await fillEverythingExceptJurisdiction(user);

    await user.click(screen.getByLabelText(/united kingdom/i));
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  it('TC-R3-JU-1-03: the two answers are mutually exclusive by construction', async () => {
    const user = userEvent.setup();
    render(<StructuredForm jurisdictions={JURISDICTIONS} onSubmit={vi.fn()} />);

    await user.click(screen.getByLabelText(/none.*not sure/i));
    expect(screen.getByLabelText(/none.*not sure/i)).toBeChecked();

    await user.click(screen.getByLabelText(/united kingdom/i));
    expect(screen.getByLabelText(/none.*not sure/i)).not.toBeChecked();
    expect(screen.getByLabelText(/united kingdom/i)).toBeChecked();

    await user.click(screen.getByLabelText(/none.*not sure/i));
    expect(screen.getByLabelText(/united kingdom/i)).not.toBeChecked();
  });

  // REALISTIC-FIXTURE VARIANT (TDD-3). Not the clean two-state path — the
  // one a real user takes. Ticking then unticking must leave the question
  // ANSWERED, not silently return the user to a blocked state with no
  // explanation. That would be a worse defect than the one being fixed.
  it('TC-R3-JU-1-05: deselecting the last jurisdiction stays answered, it does not revert to unanswered', async () => {
    const user = userEvent.setup();
    render(<StructuredForm jurisdictions={JURISDICTIONS} onSubmit={vi.fn()} />);
    await fillEverythingExceptJurisdiction(user);

    await user.click(screen.getByLabelText(/united kingdom/i));
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();

    await user.click(screen.getByLabelText(/united kingdom/i)); // untick
    expect(screen.getByLabelText(/united kingdom/i)).not.toBeChecked();
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  it('TC-R3-JU-1-02: "none" submits an empty jurisdictions array — the engine contract is unchanged', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<StructuredForm jurisdictions={JURISDICTIONS} onSubmit={onSubmit} />);
    await fillEverythingExceptJurisdiction(user);

    await user.click(screen.getByLabelText(/none.*not sure/i));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0].jurisdictions).toEqual([]);
  });

  it('TC-R3-JU-4-01: the question states that the answer decides which regulatory rules apply', () => {
    render(<StructuredForm jurisdictions={JURISDICTIONS} onSubmit={vi.fn()} />);
    expect(screen.getByText(/decides which local rules apply/i)).toBeInTheDocument();
  });
});
