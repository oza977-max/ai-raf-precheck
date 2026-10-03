import type { DataFlowGraph, GraphCorrection, OutputNode, ProcessingNode } from '../engine/types';

// R16-D2 §5 (D-82, DR7-22). A pure derivation of what a person changed
// between two form submissions of the SAME use case — never how the graph
// is evaluated, which is src/engine/*'s job. Lives here, beside
// verdict-view-model.ts, rather than in src/engine/*: the engine evaluates
// a graph and never records how a person arrived at it (cross-cutting.md
// §7, principle 0.7 — "evaluation" and "how it was produced" are different
// concerns), and this module needs no engine input beyond the two graph
// snapshots themselves. No React, no store, no clock, no random ids: `by`,
// `at` and `newId` are injected by the caller (IntakeFlow.tsx), exactly
// like buildGraphFromForm stays the sole place those are minted for a
// fresh graph.
//
// `buildGraphFromForm` mints a fresh id for every node on every call
// (verified: src/engine/build-graph-from-form.ts:73-74, 86, 130), so the
// ORIGINAL and the resubmitted graph never share a single node id. Nodes
// are matched by ROLE instead — there is always at most one processing
// node and one output node (the form never builds more) — and every
// correction names the ORIGINAL graph's node id, because that is the id
// the rest of this case's record (the attested graph, the register) still
// uses.
export interface FormCorrectionContext {
  by: string;
  at: string;
  newId: () => string;
}

// `undefined` (a cleared optional field) is normalised to `null` before it
// ever reaches a GraphCorrection — `unknown` permits either, but writing
// the literal JS `undefined` into an append-only, hash-chained payload is
// exactly the "a field nobody can tell was ever there" failure CLAUDE.md's
// submitter_note comment warns about for a different field; `null` is the
// honest, explicit "nothing" value.
function normalise(value: unknown): unknown {
  return value === undefined ? null : value;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
}

function makeCorrection(
  ctx: FormCorrectionContext,
  graphVersionBefore: number,
  graphVersionAfter: number,
  nodeId: string,
  field: string,
  originalValue: unknown,
  correctedValue: unknown,
): GraphCorrection {
  return {
    correction_id: ctx.newId(),
    graph_version_before: graphVersionBefore,
    graph_version_after: graphVersionAfter,
    node_id: nodeId,
    field,
    original_value: normalise(originalValue),
    corrected_value: normalise(correctedValue),
    corrected_by: ctx.by,
    corrected_at: ctx.at,
    correction_source: 'form',
  };
}

// Diffs the UNION of both objects' own keys, excluding `id` — ids are
// never diffable (every rebuilt graph mints new ones; see the module
// comment above) and comparing them would report a "correction" on every
// single resubmission regardless of whether anything the rules care about
// actually changed.
function diffNodeFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  nodeId: string,
  ctx: FormCorrectionContext,
  graphVersionBefore: number,
  graphVersionAfter: number,
): GraphCorrection[] {
  const out: GraphCorrection[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete('id');
  for (const key of [...keys].sort()) {
    const beforeValue = before[key];
    const afterValue = after[key];
    if (!valuesEqual(beforeValue, afterValue)) {
      out.push(makeCorrection(ctx, graphVersionBefore, graphVersionAfter, nodeId, key, beforeValue, afterValue));
    }
  }
  return out;
}

export function formCorrections(
  originalGraph: DataFlowGraph,
  correctedGraph: DataFlowGraph,
  ctx: FormCorrectionContext,
): GraphCorrection[] {
  const graphVersionBefore = originalGraph.version;
  const graphVersionAfter = correctedGraph.version;
  const corrections: GraphCorrection[] = [];

  // Matched by role (DR7-22): the form builds exactly one processing node
  // and one output node, so "the processing node" and "the output node"
  // are unambiguous without reading any id.
  const originalProcessing: ProcessingNode | undefined = originalGraph.processing_nodes[0];
  const correctedProcessing: ProcessingNode | undefined = correctedGraph.processing_nodes[0];
  if (originalProcessing && correctedProcessing) {
    corrections.push(
      ...diffNodeFields(
        originalProcessing as unknown as Record<string, unknown>,
        correctedProcessing as unknown as Record<string, unknown>,
        originalProcessing.id,
        ctx,
        graphVersionBefore,
        graphVersionAfter,
      ),
    );
  }

  const originalOutput: OutputNode | undefined = originalGraph.output_nodes[0];
  const correctedOutput: OutputNode | undefined = correctedGraph.output_nodes[0];
  if (originalOutput && correctedOutput) {
    corrections.push(
      ...diffNodeFields(
        originalOutput as unknown as Record<string, unknown>,
        correctedOutput as unknown as Record<string, unknown>,
        originalOutput.id,
        ctx,
        graphVersionBefore,
        graphVersionAfter,
      ),
    );
  }

  // Inputs: one input node per distinct ticked data class (R16-B, UC-10),
  // each minting its own fresh id every submission — there is no stable
  // per-input identity to match by role the way there is for the single
  // processing/output node. Recorded as ONE synthetic correction instead,
  // on the sentinel node id `inputs`, field `data_classes` — the SET of
  // classes present, sorted so a submission that ticks the same classes in
  // a different order is never reported as a change.
  const originalDataClasses = [...new Set(originalGraph.input_nodes.map((n) => n.data_class))].sort();
  const correctedDataClasses = [...new Set(correctedGraph.input_nodes.map((n) => n.data_class))].sort();
  if (!valuesEqual(originalDataClasses, correctedDataClasses)) {
    corrections.push(
      makeCorrection(ctx, graphVersionBefore, graphVersionAfter, 'inputs', 'data_classes', originalDataClasses, correctedDataClasses),
    );
  }

  // Jurisdictions: a graph-level field, not a node field — recorded on the
  // same sentinel node id `graph` the existing jurisdictions-panel
  // correction already uses (IntakeFlow.tsx). Sorted for the same reason
  // as data_classes above: Q11's tick order is not the engine's concern.
  const originalJurisdictions = [...originalGraph.jurisdictions].sort();
  const correctedJurisdictions = [...correctedGraph.jurisdictions].sort();
  if (!valuesEqual(originalJurisdictions, correctedJurisdictions)) {
    corrections.push(
      makeCorrection(ctx, graphVersionBefore, graphVersionAfter, 'graph', 'jurisdictions', originalJurisdictions, correctedJurisdictions),
    );
  }

  return corrections;
}
