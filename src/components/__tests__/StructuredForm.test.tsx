import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StructuredForm from '../StructuredForm';
import { DATA_CLASSES, MODEL_TYPES } from '../../engine/canonical-vocabulary';

const JURISDICTIONS = [{ code: 'UK', name: 'United Kingdom', pack_files: [] }];

describe('StructuredForm', () => {
  it('TC-UC-3a-03: sources select options from the canonical vocabulary, not hardcoded strings', () => {
    render(<StructuredForm jurisdictions={JURISDICTIONS} onSubmit={vi.fn()} />);

    const dataClassOptions = screen
      .getByLabelText(/input data class/i)
      .querySelectorAll('option:not([value=""])');
    expect(dataClassOptions).toHaveLength(DATA_CLASSES.length);

    const modelTypeOptions = screen
      .getByLabelText(/ai model type/i)
      .querySelectorAll('option:not([value=""])');
    expect(modelTypeOptions).toHaveLength(MODEL_TYPES.length);
  });

  it('TC-UC-3a-01/02: submitting a fully-filled form calls onSubmit with a valid structured_form graph', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<StructuredForm jurisdictions={JURISDICTIONS} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/use case name/i), 'Test tool');
    await user.type(screen.getByLabelText(/brief description/i), 'A test description.');
    await user.selectOptions(screen.getByLabelText(/input data class/i), 'Internal');
    await user.selectOptions(screen.getByLabelText(/input data zone/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/ai model type/i), 'traditional-ml');
    await user.selectOptions(screen.getByLabelText(/processing data zone/i), 'Zone C');
    await user.selectOptions(screen.getByLabelText(/output action type/i), 'read');
    await user.selectOptions(screen.getByLabelText(/output exposure/i), 'internal-only');
    await user.selectOptions(screen.getByLabelText(/decision bindingness/i), 'non-binding');
    await user.selectOptions(screen.getByLabelText(/output reversibility/i), 'reversible');
    await user.selectOptions(screen.getByLabelText(/output scale/i), 'limited');

    await user.click(screen.getByRole('button', { name: /build graph/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const graph = onSubmit.mock.calls[0]?.[0];
    expect(graph.intake_method).toBe('structured_form');
    expect(graph.input_nodes[0]?.data_class).toBe('Internal');
  });

  it('disables submit until all required fields are filled', () => {
    render(<StructuredForm jurisdictions={JURISDICTIONS} onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: /build graph/i })).toBeDisabled();
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

describe('StructuredForm — field help (V1.1-C01)', () => {
  it('explains the Zone A/B/C taxonomy and the input-vs-processing zone distinction inline', () => {
    render(<StructuredForm jurisdictions={[]} onSubmit={vi.fn()} />);
    expect(screen.getByText(/Zone A — external \/ public internet/i)).toBeInTheDocument();
    expect(screen.getByText(/where the model itself runs/i)).toBeInTheDocument();
    expect(screen.getByText(/material non-public information/i)).toBeInTheDocument();
  });
});
