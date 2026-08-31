import type { DataFlowGraph } from '../engine/types';
import {
  ACTION_TYPE_LABELS,
  AUTONOMY_LABELS,
  DATA_CLASS_LABELS,
  DATA_ZONE_LABELS,
  MODEL_TYPE_LABELS,
  MULTI_INSTANCE_LABELS,
  SYSTEM_ACCESS_LABELS,
  plainWithCode,
} from './field-copy';

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
  const input = graph.input_nodes[0];
  const processing = graph.processing_nodes[0];
  const output = graph.output_nodes[0];

  return [
    {
      label: 'Input data',
      value: input ? `${input.label} · ${plainWithCode(DATA_CLASS_LABELS[input.data_class])}` : '—',
    },
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
    ...(processing?.system_access_scope !== undefined
      ? [
          {
            label: 'System access',
            value: plainWithCode(SYSTEM_ACCESS_LABELS[processing.system_access_scope]),
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
