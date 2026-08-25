import { useState } from 'react';
import type { DataFlowGraph, GraphCorrection } from '../engine/types';
import { graphSummaryRows } from './graph-summary';

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
  /** Called with the submitter's optional note for the 2LoD reviewer —
   *  `undefined` when nothing was written, never an empty string. The note is
   *  recorded on the attestation and read by a human at sign-off. It is NOT
   *  input to the engine: a deterministic engine cannot read prose, and the
   *  screen says so, because the alternative is a submitter believing the
   *  rules weighed their words (dropdown review, 2026-08-15). */
  onConfirm: (reviewerNote?: string) => void;
}

export default function ConfirmationStep({ graph, corrections, onConfirm }: ConfirmationStepProps) {
  const summary = graphSummaryRows(graph);
  const [note, setNote] = useState('');

  return (
    <section aria-label="Confirm and evaluate">
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

      <label htmlFor="confirm-reviewer-note" className="confirmation__note-label">
        Anything the reviewer should know? (optional)
      </label>
      <p className="field-help">
        Context the questions could not capture — &ldquo;the personal data is pseudonymised before the
        model sees it&rdquo;, &ldquo;this replaces a manual process&rdquo;. This is read by the reviewer
        who signs off, not by the rules: the verdict is computed only from the answers above.
      </p>
      <textarea
        id="confirm-reviewer-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Optional — recorded with your attestation"
      />

      <p className="confirmation__attest-line">
        By confirming, you attest the data-flow graph above is accurate to the best of your knowledge.
      </p>

      <button type="button" onClick={() => onConfirm(note.trim() || undefined)}>
        Confirm and evaluate
      </button>
    </section>
  );
}
