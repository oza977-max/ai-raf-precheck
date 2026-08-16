import type { DataFlowGraph } from './types';

// R5-GR-4 (intake-flow.md §15.3, requirements-005.md). Pure — no I/O, no
// LLM, no Date.now(), no Math.random() (engine island rules, cross-cutting.md
// §7 Rule 1). ADVISORY ONLY — these are never blocking, never a
// contradiction, and never affect the verdict. They exist to nudge a
// submitter to re-check the graph against their own description; the user
// can ignore every one of them. Modeled on contradiction.ts's fixed
// signal-table idiom, but per-node rather than per-graph: each warning names
// the specific node whose field looks implausible against the description.

export interface PlausibilityWarning {
  node_id: string;
  field: string;
  message: string;
}

type NodeKind = 'input' | 'processing' | 'output';

interface SignalPair {
  descriptionPattern: RegExp;
  // Given the graph, produce zero or more (node_id, field, message) hits,
  // in graph array order. Kept as a single function per pair (rather than a
  // declarative predicate) because pairs b/c/d fire per-matching-node, not
  // once per graph — unlike contradiction.ts's SIGNAL_PAIRS.
  collect: (graph: DataFlowGraph) => PlausibilityWarning[];
}

const SIGNAL_PAIRS: SignalPair[] = [
  // 2026-08-16 local-model session: "approved internal platform" — the
  // submitter described an internal system but the extracted graph placed
  // the node in Zone A (outside the firm). Zone drives several rules, so
  // this is worth a second look even though it isn't a contradiction.
  {
    descriptionPattern:
      /internal platform|on[- ]prem|in[- ]house|our own (system|platform|infrastructure)|firm'?s (own |internal )?(system|platform|data|infrastructure)/i,
    collect: (graph) => {
      const warnings: PlausibilityWarning[] = [];
      const nodes: Array<{ id: string; data_zone: string; kind: NodeKind }> = [
        ...graph.input_nodes.map((n) => ({ id: n.id, data_zone: n.data_zone, kind: 'input' as const })),
        ...graph.processing_nodes.map((n) => ({ id: n.id, data_zone: n.data_zone, kind: 'processing' as const })),
      ];
      for (const n of nodes) {
        if (n.data_zone === 'Zone A' || n.data_zone === 'Zone B') {
          warnings.push({
            node_id: n.id,
            field: 'data_zone',
            message: `Your description sounds like internal systems, but this is marked ${n.data_zone} (outside the firm). Check it — the zone drives several rules.`,
          });
        }
      }
      return warnings;
    },
  },
  // 2026-08-16 local-model session: "train an open source model" — the
  // description described a training activity, but action_type is a closed
  // vocabulary with no 'train' value, so it got forced to 'trade'. The
  // vocabulary gap is the point, regardless of which action_type landed.
  {
    descriptionPattern: /train(ing|s|ed)?|fine[- ]tun/i,
    collect: (graph) =>
      graph.output_nodes.map((n) => ({
        node_id: n.id,
        field: 'action_type',
        message:
          "Training is not an action type the rulebook knows; check the action type reflects what the output does, not the training activity.",
      })),
  },
  {
    descriptionPattern: /human (approves|reviews|checks) every|reviewed by a (human|person)|manager reviews|analyst reviews/i,
    collect: (graph) => {
      const warnings: PlausibilityWarning[] = [];
      for (const n of graph.output_nodes) {
        if (n.hitl === false) {
          warnings.push({
            node_id: n.id,
            field: 'hitl',
            message: 'Description says a person reviews, but the graph says otherwise.',
          });
        }
      }
      for (const n of graph.processing_nodes) {
        if (n.autonomy_level >= 3) {
          warnings.push({
            node_id: n.id,
            field: 'autonomy_level',
            message: 'Description says a person reviews, but the graph says otherwise.',
          });
        }
      }
      return warnings;
    },
  },
  {
    descriptionPattern: /no human|fully automated|without (any )?human|autonomous(ly)?/i,
    collect: (graph) => {
      const warnings: PlausibilityWarning[] = [];
      for (const n of graph.processing_nodes) {
        if (n.autonomy_level <= 1) {
          warnings.push({
            node_id: n.id,
            field: 'autonomy_level',
            message: 'Description sounds autonomous but the graph says a human approves each action.',
          });
        }
      }
      return warnings;
    },
  },
];

export function plausibilityWarnings(description: string, graph: DataFlowGraph): PlausibilityWarning[] {
  const warnings: PlausibilityWarning[] = [];
  for (const pair of SIGNAL_PAIRS) {
    if (pair.descriptionPattern.test(description)) {
      warnings.push(...pair.collect(graph));
    }
  }
  return warnings;
}
