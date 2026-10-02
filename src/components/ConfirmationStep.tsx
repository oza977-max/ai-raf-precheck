import { useState } from 'react';
import type { DataFlowGraph, GraphCorrection, PolicyFile } from '../engine/types';
import type { Assumption } from './plain-copy';
import UnderstoodSummary from './UnderstoodSummary';
import SimilarCases from './SimilarCases';
import type { EnrichedPrecedent } from './SimilarCases';

// UC-6 (intake-flow.md §9). Rule 4 (cross-cutting.md §7): presentation-only.
// This click is the attestation point — writing the graph_confirmed audit
// event happens in IntakeFlow.tsx's handler, not here.
//
// R16-C (§3): the field-by-field grid this screen used to render directly
// is now UnderstoodSummary's job — "Here's what we understood" in plain
// words first, with the same grid demoted to a collapsed "Show the details
// the rules use" disclosure inside it (graph-summary.ts's one shared
// derivation, unchanged). This component keeps the one write (Confirm) and
// its surrounding attestation copy; the summary has none of its own.
interface ConfirmationStepProps {
  graph: DataFlowGraph;
  corrections: GraphCorrection[];
  policy?: PolicyFile;
  /** Form path (UC-9): every "Not sure" answer, carried from StructuredForm. */
  assumptions?: Assumption[];
  /** Description path (UC-12): node ids the extractor could not verify. */
  uncertainNodeIds?: string[];
  /** W-3 (R16-W §1): similar decided cases, computed by the caller — on the
   *  description path only when the graph came from the guided form (the
   *  form path's own graph_review equivalent no longer exists, so this is
   *  the only screen left to show them on). Rendered after the summary,
   *  before the optional note, same collapsed panel and posture line as
   *  graph_review's. */
  precedents?: EnrichedPrecedent[];
  /** "Change an answer" on the summary — navigates back to the question
   *  (form path) or into the existing correction flow (description path,
   *  UC-7). Not a write; the one write stays onConfirm below. */
  onChangeAnswer: () => void;
  /** Called with the submitter's optional note for the 2LoD reviewer —
   *  `undefined` when nothing was written, never an empty string. The note is
   *  recorded on the attestation and read by a human at sign-off. It is NOT
   *  input to the engine: a deterministic engine cannot read prose, and the
   *  screen says so, because the alternative is a submitter believing the
   *  rules weighed their words (dropdown review, 2026-08-15). */
  onConfirm: (reviewerNote?: string) => void;
}

export default function ConfirmationStep({
  graph,
  corrections,
  policy,
  assumptions,
  uncertainNodeIds,
  precedents,
  onChangeAnswer,
  onConfirm,
}: ConfirmationStepProps) {
  const [note, setNote] = useState('');

  return (
    <section aria-label="Confirm and evaluate">
      <h2>Confirm and evaluate</h2>
      {/* R16-W §3 (D-73): replaces "This is your last chance to review
          before scoring…" — says plainly what becomes permanent, and that
          a later correction is still possible (and is itself recorded),
          rather than implying this is the one and only chance. */}
      <p className="confirmation__notice">
        Check this carefully. When you confirm, your answers are recorded with the date and time and
        can&rsquo;t be edited. If something turns out to be wrong later, you can correct it — the
        correction is recorded too.
      </p>

      <UnderstoodSummary
        graph={graph}
        policy={policy}
        assumptions={assumptions}
        uncertainNodeIds={uncertainNodeIds}
        onChangeAnswer={onChangeAnswer}
      />

      {/* R16-W W-3 (§1): same collapsed panel and posture line graph_review
          renders — the form path no longer passes through that screen, so
          this is the only place left to show them before attestation. */}
      {precedents && precedents.length > 0 && (
        <details className="similar-cases-collapse">
          <summary>
            {precedents.length} similar decided case{precedents.length === 1 ? '' : 's'} — show
          </summary>
          <SimilarCases matches={precedents} />
        </details>
      )}

      {corrections.length > 0 && (
        <p className="confirmation__corrections">
          {corrections.length} correction{corrections.length === 1 ? '' : 's'} made. Original extraction and
          corrections are both preserved in the audit trail.
        </p>
      )}

      <label htmlFor="confirm-reviewer-note" className="confirmation__note-label">
        Anything your AI risk team should know? (optional)
      </label>
      {/* R16-W §3 (D-73): replaces "Context the questions could not
          capture…". Names who actually reads it (your AI risk team, not a
          generic "reviewer") and restates — in the same sentence a reader
          can't miss — that it never feeds the result. */}
      <p className="field-help">
        For example: &ldquo;the personal details are removed before the AI sees them&rdquo;, or
        &ldquo;this replaces a manual process&rdquo;. Your AI risk team reads this when they review it.
        It doesn&rsquo;t change the result — that comes only from your answers above.
      </p>
      <textarea
        id="confirm-reviewer-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Optional — recorded with your attestation"
      />

      {/* R16-W §3 (D-73): replaces "By confirming, you attest the data-flow
          graph above is accurate…" — "data-flow graph" is engine
          vocabulary (principle 1); this says the same thing about the
          submitter's own answers instead. */}
      <p className="confirmation__attest-line">
        By confirming, you&rsquo;re saying these answers are accurate, as far as you know.
      </p>

      <button type="button" onClick={() => onConfirm(note.trim() || undefined)}>
        Confirm and evaluate
      </button>
    </section>
  );
}
