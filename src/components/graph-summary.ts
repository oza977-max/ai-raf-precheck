import type { DataFlowGraph } from '../engine/types';

// Shared between ConfirmationStep.tsx (UC-6 attest grid) and
// VerdictDisplay.tsx (RECORD & PROVENANCE panel, V1.2-B) — one source
// for the field-by-field graph summary, no duplicated derivation.
export function graphSummaryRows(graph: DataFlowGraph): Array<{ label: string; value: string }> {
  const input = graph.input_nodes[0];
  const processing = graph.processing_nodes[0];
  const output = graph.output_nodes[0];

  return [
    { label: 'Input data', value: input ? `${input.label} · ${input.data_class}` : '—' },
    { label: 'Model', value: processing ? `${processing.label} · ${processing.model_type}` : '—' },
    { label: 'Autonomy', value: processing ? `L${processing.autonomy_level}` : '—' },
    { label: 'Data zone', value: processing?.data_zone ?? '—' },
    { label: 'Output', value: output ? `${output.label} · ${output.action_type}` : '—' },
    {
      label: 'Jurisdictions',
      value: graph.jurisdictions.length > 0 ? graph.jurisdictions.join(', ') : 'None specified',
    },
  ];
}
