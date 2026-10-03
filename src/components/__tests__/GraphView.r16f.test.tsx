import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GraphView from '../GraphView';
import type { DataFlowGraph } from '../../engine/types';

// R16-F §4 (DR7-11). GraphView's correction editor used a single <select>
// for system_access_scope — a correction could silently narrow a genuine
// multi-value answer down to whichever option was picked last, with no
// check. This covers the new tick-all editor: the same exclusivity as the
// form's own Q13, option wording sourced from Q13's own text, validation
// through normaliseAccessScope before every write, and the displayed
// (non-editing) value listing every ticked kind (already covered by
// GraphView.r16a1.test.tsx — not duplicated here).

function makeGraph(systemAccessScope?: unknown): DataFlowGraph {
  return {
    id: 'g1',
    version: 1,
    intake_method: 'llm',
    extracted_at: '2026-01-01T00:00:00.000Z',
    input_nodes: [],
    processing_nodes: [
      {
        id: 'p1',
        label: 'Agent model',
        model_type: 'agentic',
        autonomy_level: 2,
        data_zone: 'Zone C',
        vendor: 'internal',
        replaces_prior_model: false,
        ...(systemAccessScope !== undefined ? { system_access_scope: systemAccessScope } : {}),
      },
    ],
    output_nodes: [],
    edges: [],
    jurisdictions: [],
  } as unknown as DataFlowGraph;
}

async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^edit$/i }));
}

describe('GraphView — the system-access tick-all editor (R16-F §4, DR7-11)', () => {
  it('TC-R16-F-33: renders a checkbox per kind, using the form\'s own Q13 option text, each initially unticked when no value is set', async () => {
    const user = userEvent.setup();
    render(<GraphView graph={makeGraph()} editable onCorrect={vi.fn()} />);
    await openEditor(user);

    expect(screen.getByRole('checkbox', { name: /nothing beyond what it.s given for the task/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /its own logins, passwords or access tokens for other systems/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /it can change software or settings, or deploy updates, without a person/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /it runs on computers or servers shared with other automated tools/i })).not.toBeChecked();
  });

  it('TC-R16-F-34: ticking one kind calls onCorrect with a canonically-ordered array through normaliseAccessScope', async () => {
    const onCorrect = vi.fn();
    const user = userEvent.setup();
    render(<GraphView graph={makeGraph()} editable onCorrect={onCorrect} />);
    await openEditor(user);

    await user.click(screen.getByRole('checkbox', { name: /its own logins, passwords or access tokens/i }));
    expect(onCorrect).toHaveBeenCalledWith('p1', 'system_access_scope', ['credentialed_systems']);
  });

  it('TC-R16-F-35: a second kind ticked alongside the first calls onCorrect with both, in canonical order', async () => {
    const onCorrect = vi.fn();
    const user = userEvent.setup();
    render(<GraphView graph={makeGraph(['credentialed_systems'])} editable onCorrect={onCorrect} />);
    await openEditor(user);

    await user.click(screen.getByRole('checkbox', { name: /it runs on computers or servers shared with other automated tools/i }));
    expect(onCorrect).toHaveBeenCalledWith('p1', 'system_access_scope', ['shared_infrastructure', 'credentialed_systems']);
  });

  it('TC-R16-F-36: ticking "Nothing beyond..." clears every other tick (same exclusivity as the form\'s Q13)', async () => {
    const onCorrect = vi.fn();
    const user = userEvent.setup();
    render(<GraphView graph={makeGraph(['shared_infrastructure', 'credentialed_systems'])} editable onCorrect={onCorrect} />);
    await openEditor(user);

    await user.click(screen.getByRole('checkbox', { name: /nothing beyond what it.s given for the task/i }));
    expect(onCorrect).toHaveBeenCalledWith('p1', 'system_access_scope', ['none']);
  });

  it('TC-R16-F-37: ticking another kind while "Nothing beyond..." is set clears it (vice versa)', async () => {
    const onCorrect = vi.fn();
    const user = userEvent.setup();
    render(<GraphView graph={makeGraph('none')} editable onCorrect={onCorrect} />);
    await openEditor(user);

    await user.click(screen.getByRole('checkbox', { name: /it can change software or settings/i }));
    expect(onCorrect).toHaveBeenCalledWith('p1', 'system_access_scope', ['deployment_authority']);
  });

  it('TC-R16-F-38: unticking the only remaining kind is refused — the reason shows, and onCorrect is not called', async () => {
    const onCorrect = vi.fn();
    const user = userEvent.setup();
    render(<GraphView graph={makeGraph(['credentialed_systems'])} editable onCorrect={onCorrect} />);
    await openEditor(user);

    await user.click(screen.getByRole('checkbox', { name: /its own logins, passwords or access tokens/i }));
    expect(onCorrect).not.toHaveBeenCalled();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/tick at least one option/i);
    // Plain words — never the engine's reason, which names the internal field.
    expect(alert).not.toHaveTextContent(/system_access_scope/);
  });

  // Found verifying R16-F: the editor was one <label> wrapping all four
  // checkboxes, and a label's control is its FIRST input — so clicking any
  // option's words ticked "Nothing beyond…" instead.
  it('TC-R16-F-61: clicking an option\'s words ticks THAT option, not the first one', async () => {
    const onCorrect = vi.fn();
    const user = userEvent.setup();
    render(<GraphView graph={makeGraph()} editable onCorrect={onCorrect} />);
    await openEditor(user);

    await user.click(screen.getByText(/it can change software or settings, or deploy updates, without a person/i));
    expect(onCorrect).toHaveBeenCalledTimes(1);
    expect(onCorrect).toHaveBeenCalledWith('p1', 'system_access_scope', ['deployment_authority']);
    // The group's name is the screen's plain row label (R16-E review pass 3:
    // it was "system access").
    expect(screen.getByRole('group', { name: /what it can get into by itself/i })).toBeInTheDocument();
  });

  it('a single bare (non-array) stored value — e.g. from before this editor existed — still shows as ticked', async () => {
    const user = userEvent.setup();
    render(<GraphView graph={makeGraph('shared_infrastructure')} editable onCorrect={vi.fn()} />);
    await openEditor(user);
    expect(screen.getByRole('checkbox', { name: /it runs on computers or servers shared with other automated tools/i })).toBeChecked();
  });
});
