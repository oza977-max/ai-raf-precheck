import type { Condition, ConditionValue, DataFlowGraph } from './types';

// Multi-node field lookup (evaluation-engine.md §3.7): a condition on a
// field matches if ANY node in the graph carries that field and it
// satisfies the operator. Flatten every node's own fields into one lookup.
function collectFieldValues(graph: DataFlowGraph, field: string): unknown[] {
  const values: unknown[] = [];
  const nodes = [...graph.input_nodes, ...graph.processing_nodes, ...graph.output_nodes] as unknown as Array<
    Record<string, unknown>
  >;
  for (const node of nodes) {
    if (field in node) {
      values.push(node[field]);
    }
  }
  if (field === 'jurisdictions') {
    values.push(graph.jurisdictions);
  }
  return values;
}

function matchesOperator(actual: unknown, expected: ConditionValue): boolean {
  if (typeof expected === 'object' && expected !== null) {
    if ('gte' in expected) return typeof actual === 'number' && actual >= expected.gte;
    if ('lte' in expected) return typeof actual === 'number' && actual <= expected.lte;
    if ('in' in expected) return expected.in.includes(actual);
    if ('not_in' in expected) return !expected.not_in.includes(actual);
  }
  return actual === expected;
}

// ADR-002: minimal operator set, all keys within one Condition are ANDed.
export function matchesCondition(condition: Condition, graph: DataFlowGraph): boolean {
  for (const [field, expected] of Object.entries(condition)) {
    const candidates = collectFieldValues(graph, field);
    const matched = candidates.some((actual) => matchesOperator(actual, expected));
    if (!matched) return false;
  }
  return true;
}

// Shared graph-path description (VD-2 binding_path) used by hard-line and
// invariant evaluation. Best-effort — names the first input/output node
// pair on the graph, since the condition language doesn't track which
// specific node satisfied a multi-node match.
export function describeGraphPath(graph: DataFlowGraph): string {
  const input = graph.input_nodes[0]?.label ?? graph.processing_nodes[0]?.label ?? 'unknown-input';
  const output = graph.output_nodes[0]?.label ?? 'unknown-output';
  return `${input} → ${output}`;
}
