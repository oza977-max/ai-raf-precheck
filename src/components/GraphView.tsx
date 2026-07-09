import { useState } from 'react';
import {
  ACTION_TYPES,
  DATA_CLASSES,
  DATA_ZONES,
  DECISION_BINDINGNESS,
  EXPOSURES,
  MODEL_TYPES,
} from '../engine/canonical-vocabulary';
import type { DataFlowGraph, InputNode, OutputNode, ProcessingNode } from '../engine/types';

// V1.1-C01. Rule 4 (cross-cutting.md §7): presentation-only — renders the
// data-flow graph the engine actually evaluates (input → processing →
// output, with each node's real attributes), and hosts the real
// per-field correction editor. Every edit dispatches through the
// caller's handleCorrectNode → CORRECTION_APPLIED reducer path
// (BC-V11C01-03: no parallel state, no direct graph mutation here).
interface GraphViewProps {
  graph: DataFlowGraph;
  editable?: boolean;
  onCorrect?: (nodeId: string, field: string, value: unknown) => void;
}

const AUTONOMY_LABELS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'L0 — no autonomy (informational only)',
  1: 'L1 — human approves every action',
  2: 'L2 — human reviews after the fact',
  3: 'L3 — independent within a narrow scope',
  4: 'L4 — fully autonomous',
};

const REVERSIBILITY = ['reversible', 'irreversible', 'unknown'] as const;
const SCALE = ['limited', 'at_scale'] as const;

interface FieldSpec {
  field: string;
  label: string;
  options: readonly (string | number)[];
  numeric?: boolean;
  optionLabel?: (v: string | number) => string;
}

const INPUT_FIELDS: FieldSpec[] = [
  { field: 'data_class', label: 'data class', options: DATA_CLASSES },
  { field: 'data_zone', label: 'data zone', options: DATA_ZONES },
];

const PROCESSING_FIELDS: FieldSpec[] = [
  { field: 'model_type', label: 'model type', options: MODEL_TYPES },
  {
    field: 'autonomy_level',
    label: 'autonomy level',
    options: [0, 1, 2, 3, 4],
    numeric: true,
    optionLabel: (v) => AUTONOMY_LABELS[v as 0 | 1 | 2 | 3 | 4],
  },
  { field: 'data_zone', label: 'data zone', options: DATA_ZONES },
];

const OUTPUT_FIELDS: FieldSpec[] = [
  { field: 'action_type', label: 'action type', options: ACTION_TYPES },
  { field: 'exposure', label: 'exposure', options: EXPOSURES },
  { field: 'decision_bindingness', label: 'decision bindingness', options: DECISION_BINDINGNESS },
  { field: 'output_reversibility', label: 'output reversibility', options: REVERSIBILITY },
  { field: 'scale', label: 'output scale', options: SCALE },
];

type AnyNode = InputNode | ProcessingNode | OutputNode;

function chips(node: AnyNode): string[] {
  if ('model_type' in node) {
    return [node.model_type, `L${node.autonomy_level}`, node.data_zone, `vendor: ${node.vendor}`];
  }
  if ('data_class' in node) {
    return [node.data_class, node.data_zone];
  }
  return [node.action_type, node.exposure, node.decision_bindingness, node.output_reversibility, node.scale];
}

function NodeCard({
  node,
  fields,
  editable,
  editing,
  onToggleEdit,
  onCorrect,
}: {
  node: AnyNode;
  fields: FieldSpec[];
  editable: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  onCorrect?: (nodeId: string, field: string, value: unknown) => void;
}) {
  const [labelDraft, setLabelDraft] = useState(node.label);
  const uncertain = 'uncertain' in node && node.uncertain;
  const record = node as unknown as Record<string, unknown>;

  return (
    <div className="graph-node" data-uncertain={uncertain ? 'true' : 'false'}>
      <div className="graph-node__header">
        <span className="graph-node__label">{node.label}</span>
        {editable && (
          <button type="button" className="graph-node__edit" onClick={onToggleEdit}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
      {uncertain && <strong className="graph-node__uncertain">(uncertain — please confirm)</strong>}

      {!editing && (
        <div className="graph-node__chips">
          {chips(node).map((c) => (
            <span key={c} className="graph-node__chip">
              {c}
            </span>
          ))}
        </div>
      )}

      {editing && onCorrect && (
        <div className="graph-node__editor">
          <label className="graph-node__field">
            <span>label</span>
            <span className="graph-node__label-edit">
              <input
                type="text"
                aria-label={`${node.label} — label`}
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
              />
              <button
                type="button"
                disabled={labelDraft === node.label || !labelDraft.trim()}
                onClick={() => onCorrect(node.id, 'label', labelDraft.trim())}
              >
                Apply
              </button>
            </span>
          </label>
          {fields.map((spec) => (
            <label key={spec.field} className="graph-node__field">
              <span>{spec.label}</span>
              <select
                aria-label={`${node.label} — ${spec.label}`}
                value={String(record[spec.field])}
                onChange={(e) =>
                  onCorrect(node.id, spec.field, spec.numeric ? Number(e.target.value) : e.target.value)
                }
              >
                {spec.options.map((o) => (
                  <option key={String(o)} value={String(o)}>
                    {spec.optionLabel ? spec.optionLabel(o) : String(o)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GraphView({ graph, editable = false, onCorrect }: GraphViewProps) {
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  const column = (title: string, nodes: AnyNode[], fields: FieldSpec[]) => (
    <div className="graph-view__col">
      <div className="graph-view__col-title">{title}</div>
      {nodes.length === 0 && <p className="graph-view__empty">None extracted</p>}
      {nodes.map((node) => (
        <NodeCard
          key={node.id}
          node={node}
          fields={fields}
          editable={editable}
          editing={editingNodeId === node.id}
          onToggleEdit={() => setEditingNodeId(editingNodeId === node.id ? null : node.id)}
          onCorrect={onCorrect}
        />
      ))}
    </div>
  );

  return (
    <div className="graph-view" aria-label="Data-flow graph">
      {column('Input data', graph.input_nodes, INPUT_FIELDS)}
      <div className="graph-view__arrow" aria-hidden="true">
        →
      </div>
      {column('Processing', graph.processing_nodes, PROCESSING_FIELDS)}
      <div className="graph-view__arrow" aria-hidden="true">
        →
      </div>
      {column('Output', graph.output_nodes, OUTPUT_FIELDS)}
    </div>
  );
}
