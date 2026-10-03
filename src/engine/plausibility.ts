import type { DataFlowGraph } from './types';

// R5-GR-4 (intake-flow.md §15.3, requirements-005.md). Pure — no I/O, no
// LLM, no Date.now(), no Math.random() (engine island rules, cross-cutting.md
// §7 Rule 1). ADVISORY ONLY — these are never blocking, never a
// contradiction, and never affect the verdict. They exist to nudge a
// submitter to re-check the graph against their own description; the user
// can ignore every one of them. Modeled on contradiction.ts's fixed
// signal-table idiom, but per-node rather than per-graph: each warning names
// the specific node whose field looks implausible against the description.
//
// R16-E §4 (v2.1, "Please double-check names what this path shows"). Before
// this chunk, this module returned the finished SENTENCE — written in the
// guided form's own words ("Check \"Where does the AI come from?\""), which
// means nothing on the description-first path, which never shows that
// question. The engine now returns a REFERENCE only: which of the four
// description patterns matched. `src/components/plain-copy.ts` words the
// whole sentence per path — the form path still names its own question; the
// description path names the review screen's card and row (§4's
// QUESTIONNAIRE_COPY labels) — so no sentence is split between the engine
// and a screen, and no field code or card id ever reaches either one.

export type PlausibilitySignal =
  | 'sounds-internal'
  | 'mentions-training'
  | 'says-person-reviews'
  | 'sounds-autonomous';

export interface PlausibilityWarning {
  node_id: string;
  field: string;
  signal: PlausibilitySignal;
}

type NodeKind = 'input' | 'processing' | 'output';

interface SignalPair {
  descriptionPattern: RegExp;
  signal: PlausibilitySignal;
  // Given the graph, produce zero or more (node_id, field) hits, in graph
  // array order. Kept as a single function per pair (rather than a
  // declarative predicate) because pairs b/c/d fire per-matching-node, not
  // once per graph — unlike contradiction.ts's SIGNAL_PAIRS.
  collect: (graph: DataFlowGraph) => Array<{ node_id: string; field: string }>;
}

const SIGNAL_PAIRS: SignalPair[] = [
  // 2026-08-16 local-model session: "approved internal platform" — the
  // submitter described an internal system but the extracted graph placed
  // the node outside the firm. Worth a second look even though it isn't a
  // contradiction.
  {
    descriptionPattern:
      /internal platform|on[- ]prem|in[- ]house|our own (system|platform|infrastructure)|firm'?s (own |internal )?(system|platform|data|infrastructure)/i,
    signal: 'sounds-internal',
    collect: (graph) => {
      const hits: Array<{ node_id: string; field: string }> = [];
      const nodes: Array<{ id: string; data_zone: string; kind: NodeKind }> = [
        ...graph.input_nodes.map((n) => ({ id: n.id, data_zone: n.data_zone, kind: 'input' as const })),
        ...graph.processing_nodes.map((n) => ({ id: n.id, data_zone: n.data_zone, kind: 'processing' as const })),
      ];
      for (const n of nodes) {
        if (n.data_zone === 'Zone A' || n.data_zone === 'Zone B') {
          hits.push({ node_id: n.id, field: 'data_zone' });
        }
      }
      return hits;
    },
  },
  // 2026-08-16 local-model session: "train an open source model" — the
  // description described a training activity, which has no field of its
  // own, so it got read as something it is not. The gap is the point,
  // regardless of which value landed.
  {
    descriptionPattern: /train(ing|s|ed)?|fine[- ]tun/i,
    signal: 'mentions-training',
    collect: (graph) => graph.output_nodes.map((n) => ({ node_id: n.id, field: 'action_type' })),
  },
  {
    descriptionPattern: /human (approves|reviews|checks) every|reviewed by a (human|person)|manager reviews|analyst reviews/i,
    signal: 'says-person-reviews',
    collect: (graph) => {
      const hits: Array<{ node_id: string; field: string }> = [];
      for (const n of graph.output_nodes) {
        if (n.hitl === false) hits.push({ node_id: n.id, field: 'hitl' });
      }
      for (const n of graph.processing_nodes) {
        if (n.autonomy_level >= 3) hits.push({ node_id: n.id, field: 'autonomy_level' });
      }
      return hits;
    },
  },
  {
    descriptionPattern: /no human|fully automated|without (any )?human|autonomous(ly)?/i,
    signal: 'sounds-autonomous',
    collect: (graph) => {
      const hits: Array<{ node_id: string; field: string }> = [];
      for (const n of graph.processing_nodes) {
        if (n.autonomy_level <= 1) hits.push({ node_id: n.id, field: 'autonomy_level' });
      }
      return hits;
    },
  },
];

export function plausibilityWarnings(description: string, graph: DataFlowGraph): PlausibilityWarning[] {
  const warnings: PlausibilityWarning[] = [];
  for (const pair of SIGNAL_PAIRS) {
    if (pair.descriptionPattern.test(description)) {
      for (const hit of pair.collect(graph)) warnings.push({ ...hit, signal: pair.signal });
    }
  }
  return warnings;
}
