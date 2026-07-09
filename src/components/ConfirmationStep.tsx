import type { DataFlowGraph, GraphCorrection } from '../engine/types';

// UC-6 (intake-flow.md §9). Rule 4 (cross-cutting.md §7): presentation-only.
// This click is the attestation point — writing the graph_confirmed audit
// event happens in IntakeFlow.tsx's handler, not here.
//
// Field-by-field summary grid per the Claude Design export's Confirm
// screen (design_export.md memory) — Input data / Model / Autonomy /
// Data zone / Output / Jurisdictions, not a flat node list.
interface ConfirmationStepProps {
  graph: DataFlowGraph;
  corrections: GraphCorrection[];
  onConfirm: () => void;
}

export default function ConfirmationStep({ graph, corrections, onConfirm }: ConfirmationStepProps) {
  const input = graph.input_nodes[0];
  const processing = graph.processing_nodes[0];
  const output = graph.output_nodes[0];

  const summary: Array<{ label: string; value: string }> = [
    { label: 'Input data', value: input ? `${input.label} · ${input.data_class}` : '—' },
    { label: 'Model', value: processing ? `${processing.label} · ${processing.model_type}` : '—' },
    { label: 'Autonomy', value: processing ? `L${processing.autonomy_level}` : '—' },
    { label: 'Data zone', value: processing?.data_zone ?? '—' },
    { label: 'Output', value: output ? `${output.label} · ${output.action_type}` : '—' },
    { label: 'Jurisdictions', value: graph.jurisdictions.length > 0 ? graph.jurisdictions.join(', ') : 'None specified' },
  ];

  return (
    <section aria-label="Confirm and evaluate">
      <div className="questionnaire__tag">UC-6 · CONFIRM &amp; ATTEST</div>
      <h2>Confirm and evaluate</h2>
      <p className="confirmation__notice">
        This confirmation is your attestation — timestamped and permanently recorded.
      </p>

      <div className="confirmation__grid">
        {summary.map((row) => (
          <div key={row.label} className="confirmation__grid-cell">
            <span className="confirmation__grid-label">{row.label}</span>
            <span className="confirmation__grid-value">{row.value}</span>
          </div>
        ))}
      </div>

      {corrections.length > 0 && (
        <p className="confirmation__corrections">
          {corrections.length} correction{corrections.length === 1 ? '' : 's'} made. Original extraction and
          corrections are both preserved in the audit trail.
        </p>
      )}

      <p className="confirmation__attest-line">
        By confirming, you attest the data-flow graph above is accurate to the best of your knowledge.
      </p>

      <button type="button" onClick={onConfirm}>
        Confirm and evaluate
      </button>
    </section>
  );
}
