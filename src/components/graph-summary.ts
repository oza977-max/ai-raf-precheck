import type { DataClass, DataFlowGraph, DataZone } from '../engine/types';
import { DATA_CLASS_RANK } from '../engine/envelope';
import {
  ACTION_TYPE_LABELS,
  AUTONOMY_LABELS,
  DATA_CLASS_LABELS,
  DATA_ZONE_LABELS,
  MODEL_TYPE_LABELS,
  MULTI_INSTANCE_LABELS,
  systemAccessScopeLabel,
  plainWithCode,
} from './field-copy';

// R16-C (§1.2, §3). The {destination} token-rendering rule, in plain words,
// with no zone letter in the output — principle 1 bans engine vocabulary
// (including zone letters) from any summary line, not only from questions.
// Duplicated in spirit from §1.2's token table rather than imported from a
// shared constant, because this chunk owns the summary screen and the
// verdict's own resolution of the same placeholder (chunk D1) reads policy
// text, not a graph zone directly — the two call sites have different
// inputs even though the three sentences are the same by design.
export function destinationDescription(zone: DataZone): string {
  switch (zone) {
    case 'Zone A':
      return 'an outside website or service';
    case 'Zone B':
      return 'the supplier’s systems, which are outside your firm’s own';
    case 'Zone C':
      return 'your firm’s own systems';
  }
}

// R16-C (§3): "every kind of information it uses, most sensitive first" —
// the shared ranking (DATA_CLASS_RANK, envelope.ts §1.5) so this list and
// the verdict view-model's own ranking can never silently disagree about
// which class is worse (D-03).
export function dataClassesBySeverity(graph: DataFlowGraph): DataClass[] {
  const classes = [...new Set(graph.input_nodes.map((n) => n.data_class))];
  return classes.sort((a, b) => DATA_CLASS_RANK[b] - DATA_CLASS_RANK[a]);
}

// Shared between ConfirmationStep.tsx (UC-6 attest grid) and
// VerdictDisplay.tsx (RECORD & PROVENANCE panel, V1.2-B) — one source
// for the field-by-field graph summary, no duplicated derivation.
//
// R15-C3 (proposal §3.5, skeptic amendment S1b — Must). This used to render
// the raw engine vocabulary directly (`traditional-ml`, `L3`, `Zone B`,
// `execute`) on the screen whose button says "you attest the data-flow
// graph above is accurate" — the one place the plain word matters most.
// Every value now routes through field-copy.ts's plainWithCode(), same as
// every other screen in the product, so BOTH call sites are fixed from this
// one function and cannot drift apart.
export function graphSummaryRows(graph: DataFlowGraph): Array<{ label: string; value: string }> {
  const processing = graph.processing_nodes[0];
  const output = graph.output_nodes[0];

  // R16-C (§3, D-03): every input node is listed, most commonly one (the
  // single-input case renders byte-identical to before this chunk — label
  // stays the bare "Input data", not "Input data 1"), several when UC-10's
  // tick-all question produced more than one distinct data class. Zero
  // input nodes (e.g. a hand-built fixture in an older test) renders one
  // placeholder row rather than silently vanishing.
  const inputRows =
    graph.input_nodes.length > 0
      ? graph.input_nodes.map((input, i) => ({
          label: graph.input_nodes.length > 1 ? `Input data ${i + 1}` : 'Input data',
          value: `${input.label} · ${plainWithCode(DATA_CLASS_LABELS[input.data_class])}`,
        }))
      : [{ label: 'Input data', value: '—' }];

  return [
    ...inputRows,
    {
      label: 'Model',
      value: processing ? `${processing.label} · ${plainWithCode(MODEL_TYPE_LABELS[processing.model_type])}` : '—',
    },
    {
      label: 'Autonomy',
      value: processing
        ? plainWithCode(AUTONOMY_LABELS[processing.autonomy_level as 0 | 1 | 2 | 3 | 4])
        : '—',
    },
    {
      label: 'Data zone',
      value: processing ? plainWithCode(DATA_ZONE_LABELS[processing.data_zone]) : '—',
    },
    {
      label: 'Output',
      value: output ? `${output.label} · ${plainWithCode(ACTION_TYPE_LABELS[output.action_type])}` : '—',
    },
    // v1.4: rendered only when ANSWERED — an absent optional field must not
    // appear on the attest grid as a claim ("none"/"no") nobody made.
    // R16-A1 (PE-9 §1.1): system_access_scope may be a single value or a
    // list (several kinds ticked at once) — systemAccessScopeLabel handles
    // both without crashing.
    ...(processing?.system_access_scope !== undefined
      ? [
          {
            label: 'System access',
            value: systemAccessScopeLabel(processing.system_access_scope),
          },
        ]
      : []),
    ...(processing?.multi_instance_coordination !== undefined
      ? [
          {
            label: 'Instance coordination',
            value: plainWithCode(MULTI_INSTANCE_LABELS[processing.multi_instance_coordination]),
          },
        ]
      : []),
    {
      label: 'Jurisdictions',
      value: graph.jurisdictions.length > 0 ? graph.jurisdictions.join(', ') : 'None specified',
    },
  ];
}
