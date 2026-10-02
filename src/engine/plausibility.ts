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

// F-9 (DR7-09). Every message below is plain words: no zone letters, no
// field names, no "graph" — a submitter who never saw the engine's
// vocabulary must still understand what to double-check and where. Each
// message names the question that actually drives the field in question
// (the guided form's own wording, src/components/plain-copy.ts), so the
// form-path submitter who never saw a GraphView card knows exactly where
// to look. These are "engine data strings" in the sense cross-cutting.md
// §7 means by the term — plain text the engine returns, not business logic
// — so holding them here does not reach across the engine/screen boundary
// (contrast §5 below, which is about engine code reading UI code/words).
const SIGNAL_PAIRS: SignalPair[] = [
  // 2026-08-16 local-model session: "approved internal platform" — the
  // submitter described an internal system but the extracted graph placed
  // the node outside the firm. Worth a second look even though it isn't a
  // contradiction.
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
            message:
              'Your description sounds like the AI runs on your firm’s own systems, but your answers say your information goes outside the firm. Check “Where does the AI come from?” — it affects several rules.',
          });
        }
      }
      return warnings;
    },
  },
  // 2026-08-16 local-model session: "train an open source model" — the
  // description described a training activity, which has no field of its
  // own, so it got read as something it is not. The gap is the point,
  // regardless of which value landed.
  {
    descriptionPattern: /train(ing|s|ed)?|fine[- ]tun/i,
    collect: (graph) =>
      graph.output_nodes.map((n) => ({
        node_id: n.id,
        field: 'action_type',
        message:
          'Your description mentions training or fine-tuning, which isn’t something we ask about directly. Check “What happens with what it produces?” — pick the option that describes what the finished tool does, not the training itself.',
      })),
  },
  {
    descriptionPattern: /human (approves|reviews|checks) every|reviewed by a (human|person)|manager reviews|analyst reviews/i,
    collect: (graph) => {
      const warnings: PlausibilityWarning[] = [];
      const message =
        'Your description says a person reviews this, but your answers say it acts without that review. Check “What happens with what it produces?” — pick the option that matches whether someone reviews it.';
      for (const n of graph.output_nodes) {
        if (n.hitl === false) {
          warnings.push({ node_id: n.id, field: 'hitl', message });
        }
      }
      for (const n of graph.processing_nodes) {
        if (n.autonomy_level >= 3) {
          warnings.push({ node_id: n.id, field: 'autonomy_level', message });
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
            message:
              'Your description sounds like it acts without a person involved, but your answers say a person is involved. Check “What happens with what it produces?” — pick the option that matches how much it does on its own.',
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
