import type { DataFlowGraph, GraphCorrection } from '../engine/types';

// UC-6 (intake-flow.md §9). Rule 4 (cross-cutting.md §7): presentation-only.
// This click is the attestation point — writing the graph_confirmed audit
// event happens in IntakeFlow.tsx's handler, not here.
interface ConfirmationStepProps {
  graph: DataFlowGraph;
  corrections: GraphCorrection[];
  onConfirm: () => void;
}

export default function ConfirmationStep({ graph, corrections, onConfirm }: ConfirmationStepProps) {
  const allNodes = [...graph.input_nodes, ...graph.processing_nodes, ...graph.output_nodes];

  return (
    <section aria-label="Confirm and evaluate">
      <div className="questionnaire__tag">UC-6 · CONFIRM &amp; ATTEST</div>
      <h2>Confirm and evaluate</h2>
      <p className="confirmation__notice">
        This confirmation is your attestation — timestamped and permanently recorded.
      </p>
      <ul>
        {allNodes.map((node) => (
          <li key={node.id}>{node.label}</li>
        ))}
      </ul>
      {corrections.length > 0 && (
        <p className="confirmation__corrections">
          {corrections.length} correction{corrections.length === 1 ? '' : 's'} made. Original extraction and
          corrections are both preserved in the audit trail.
        </p>
      )}
      <button type="button" onClick={onConfirm}>
        Confirm and evaluate
      </button>
    </section>
  );
}
