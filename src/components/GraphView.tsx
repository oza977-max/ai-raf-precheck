import { useState } from 'react';
import {
  ACTION_TYPES,
  DATA_CLASSES,
  DATA_ZONES,
  DECISION_BINDINGNESS,
  DECISION_TYPES,
  EXPOSURES,
  MODEL_TYPES,
} from '../engine/canonical-vocabulary';
import type { DataFlowGraph, InputNode, OutputNode, ProcessingNode } from '../engine/types';
import type { PlausibilityWarning } from '../engine/plausibility';
import {
  ACTION_TYPE_LABELS,
  AUTONOMY_LABELS,
  BINDINGNESS_LABELS,
  DATA_CLASS_LABELS,
  DATA_ZONE_LABELS,
  DECISION_TYPE_LABELS,
  EXPOSURE_LABELS,
  FIELD_CONSEQUENCES,
  GRAPH_FIELD_LABELS,
  MODEL_TYPE_LABELS,
  MULTI_INSTANCE_LABELS,
  SYSTEM_ACCESS_LABELS,
  REVERSIBILITY_LABELS,
  SCALE_LABELS,
} from './field-copy';

// V1.1-C01, rebuilt for R5 (intake-flow.md §15). Rule 4 (cross-cutting.md
// §7): presentation-only — renders the data-flow graph the engine actually
// evaluates, hosts the per-field correction editor, and (R5) explains every
// decision-bearing value in plain English so a submitter can catch a wrong
// one without knowing the rulebook. Every edit still dispatches through the
// caller's handleCorrectNode → CORRECTION_APPLIED reducer path
// (BC-V11C01-03: no parallel state, no direct graph mutation here); node
// confirmation (R5-GR-2) likewise goes through the caller → NODE_CONFIRMED.
interface GraphViewProps {
  graph: DataFlowGraph;
  editable?: boolean;
  onCorrect?: (nodeId: string, field: string, value: unknown) => void;
  // R5-GR-2. Present (possibly empty) only on the LLM path.
  unconfirmedNodeIds?: string[];
  onConfirmNode?: (nodeId: string) => void;
  // R5-GR-4. Advisory — rendered on the affected field, never blocking.
  warnings?: PlausibilityWarning[];
  // R6-PV-3 (ADR-IF-R6-1): verified quotes and guessed fields, per node.
  provenance?: Record<string, Record<string, string>>;
  guessedFields?: Record<string, string[]>;
  // R5-GX-1. Extractor jurisdictions the policy did not recognise.
  ignoredJurisdictions?: string[];
}

const REVERSIBILITY = ['reversible', 'irreversible', 'unknown'] as const;
const SCALE = ['limited', 'at_scale'] as const;

interface FieldSpec {
  field: string;
  label: string;
  options: readonly (string | number)[];
  numeric?: boolean;
  boolean?: boolean;
  /** R5-GR-1: plain-English meaning per value. */
  meanings?: Record<string, string>;
  optionLabel?: (v: string | number) => string;
  /** Optional engine fields (decision_type, hitl) may be absent. */
  optional?: boolean;
}

const AUTONOMY_MEANINGS: Record<string, string> = Object.fromEntries(
  Object.entries(AUTONOMY_LABELS).map(([k, v]) => [`${k}`, v]),
);

const HITL_MEANINGS: Record<string, string> = {
  true: 'A person checks the output before anything happens (HITL: yes)',
  false: 'No person checks the output before it takes effect (HITL: no)',
};

const INPUT_FIELDS: FieldSpec[] = [
  { field: 'data_class', label: 'data class', options: DATA_CLASSES, meanings: DATA_CLASS_LABELS },
  { field: 'data_zone', label: 'data zone', options: DATA_ZONES, meanings: DATA_ZONE_LABELS },
];

const PROCESSING_FIELDS: FieldSpec[] = [
  { field: 'model_type', label: 'model type', options: MODEL_TYPES, meanings: MODEL_TYPE_LABELS },
  {
    field: 'autonomy_level',
    label: 'autonomy level',
    options: [0, 1, 2, 3, 4],
    numeric: true,
    meanings: AUTONOMY_MEANINGS,
    optionLabel: (v) => AUTONOMY_LABELS[v as 0 | 1 | 2 | 3 | 4],
  },
  { field: 'data_zone', label: 'data zone', options: DATA_ZONES, meanings: DATA_ZONE_LABELS },
  // v1.4 agentic infrastructure-access fields — optional on the engine type;
  // absent renders "not stated", same honest-weaker-claim rule as
  // decision_type/hitl below.
  {
    field: 'system_access_scope',
    label: 'system access',
    options: ['none', 'shared_infrastructure', 'credentialed_systems', 'deployment_authority'],
    meanings: SYSTEM_ACCESS_LABELS,
    optional: true,
  },
  {
    field: 'multi_instance_coordination',
    label: 'instance coordination',
    options: ['no', 'yes', 'unknown'],
    meanings: MULTI_INSTANCE_LABELS,
    optional: true,
  },
];

const OUTPUT_FIELDS: FieldSpec[] = [
  { field: 'action_type', label: 'action type', options: ACTION_TYPES, meanings: ACTION_TYPE_LABELS },
  { field: 'exposure', label: 'exposure', options: EXPOSURES, meanings: EXPOSURE_LABELS },
  {
    field: 'decision_bindingness',
    label: 'decision bindingness',
    options: DECISION_BINDINGNESS,
    meanings: BINDINGNESS_LABELS,
  },
  {
    field: 'output_reversibility',
    label: 'output reversibility',
    options: REVERSIBILITY,
    meanings: REVERSIBILITY_LABELS,
  },
  { field: 'scale', label: 'output scale', options: SCALE, meanings: SCALE_LABELS },
  // R5-GR-1: decision-bearing and previously invisible here. Optional on
  // the engine type — absent renders as "not stated", which is a weaker
  // and honest claim, not a default.
  {
    field: 'decision_type',
    label: 'decision type',
    options: DECISION_TYPES,
    meanings: DECISION_TYPE_LABELS,
    optional: true,
  },
  {
    field: 'hitl',
    label: 'human in the loop',
    options: ['true', 'false'],
    boolean: true,
    meanings: HITL_MEANINGS,
    optional: true,
  },
];

type AnyNode = InputNode | ProcessingNode | OutputNode;

// R15-C5 (proposal §3.6, dissent #13 in §4): a long provenance quote may
// truncate with a way to expand it, but this is only ever applied to the
// QUOTE — the field VALUE it supports is rendered separately, in full,
// unconditionally. Native disclosure (aria-expanded), not a hover/CSS trick
// (G3 / proposal §4 #8).
const QUOTE_TRUNCATE_AT = 90;

function ProvenanceQuote({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > QUOTE_TRUNCATE_AT;
  const shown = !long || expanded ? text : `${text.slice(0, QUOTE_TRUNCATE_AT).trimEnd()}…`;
  return (
    <>
      based on: &ldquo;{shown}&rdquo;
      {long && (
        <button
          type="button"
          className="graph-node__quote-expand"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'show less' : 'show full quote'}
        </button>
      )}
    </>
  );
}

// R15-C5 (proposal §3.6, dissent #6 / IxD ID-6 overruled): "not found in
// your text — worth a second look" and "guessed" share a badge FAMILY
// (.graph-node__badge — same shape/visual language) so a reviewer's eye
// groups them as "look again" states, but each keeps its own class and its
// own text — they are not merged into one label or one meaning. The
// three-state provenance logic above (quoted / guessed / confident-no-basis)
// and the no-plain-confirm gate for guessed cards are unchanged; this
// component only renders what that existing logic decided.
function ProvenanceBadge({ kind }: { kind: 'guessed' | 'no-basis' | 'not-stated' }) {
  if (kind === 'guessed') {
    return (
      <span className="graph-node__badge graph-node__badge--guessed graph-node__guessed-badge">
        guessed — the description does not say. Correct it, or it becomes a question.
      </span>
    );
  }
  if (kind === 'no-basis') {
    return (
      <span className="graph-node__badge graph-node__badge--no-basis">
        not found in your text — worth a second look
      </span>
    );
  }
  return <span className="graph-node__badge graph-node__badge--not-stated">not stated</span>;
}

function NodeCard({
  node,
  fields,
  editable,
  editing,
  unconfirmed,
  warnings,
  quotes,
  guessed,
  onToggleEdit,
  onCorrect,
  onConfirm,
}: {
  node: AnyNode;
  fields: FieldSpec[];
  editable: boolean;
  editing: boolean;
  unconfirmed: boolean;
  warnings: PlausibilityWarning[];
  quotes: Record<string, string>;
  guessed: string[];
  onToggleEdit: () => void;
  onCorrect?: (nodeId: string, field: string, value: unknown) => void;
  onConfirm?: (nodeId: string) => void;
}) {
  const [labelDraft, setLabelDraft] = useState(node.label);
  // R9-SC-2 (ADR-IF-R9-1): consequences one click away, per card.
  const [showWhy, setShowWhy] = useState(false);
  const uncertain = 'uncertain' in node && node.uncertain;
  const record = node as unknown as Record<string, unknown>;

  const vendor = 'vendor' in node ? (node as ProcessingNode).vendor : null;
  const declaredModelId =
    'declared_model_id' in node ? ((node as ProcessingNode).declared_model_id ?? null) : null;

  return (
    <div id={`card-${node.id}`} className="graph-node" data-uncertain={uncertain ? 'true' : 'false'} data-unconfirmed={unconfirmed ? 'true' : 'false'}>
      <div className="graph-node__header">
        <span className="graph-node__label">{node.label}</span>
        {editable && (
          <button type="button" className="graph-node__edit" onClick={onToggleEdit}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
      {/* R5-GR-3: uncertainty is loud, names the consequence, and demands a
          per-node action. The model's own confidence flag, not a heuristic. */}
      {uncertain && (
        <p className="graph-node__uncertain" role="alert">
          The model was <strong>not confident</strong> about this part —{' '}
          {guessed.length > 0
            ? <>especially: {guessed.map((fld) => fld.replace(/_/g, ' ')).join(', ')}.</>
            : 'check every value on this card.'}
        </p>
      )}

      {!editing && (
        <dl className="graph-node__meanings" id={`why-${node.id}`}>
          {fields.map((spec) => {
            const raw = record[spec.field];
            const has = raw !== undefined && raw !== null;
            const meaning = has ? spec.meanings?.[String(raw)] ?? String(raw) : null;
            const fieldWarnings = warnings.filter((w) => w.field === spec.field);
            // R15-C5 (proposal §3.6): the label reuses the guided form's
            // question words; the engine field name stays as quiet code
            // beside it rather than being deleted (three-class code rule).
            const plainLabel = GRAPH_FIELD_LABELS[spec.field] ?? spec.label;
            return (
              <div key={spec.field} className="graph-node__meaning-row">
                <dt>
                  {plainLabel} <code className="graph-node__field-code">{spec.field}</code>
                </dt>
                <dd>
                  {has ? (
                    <>
                      {/* The field VALUE — never truncated, never hidden;
                          only the quote beside it may collapse. */}
                      <span className="graph-node__meaning">{meaning}</span>
                      {/* R6-PV-3: provenance or its honest absence. A fabricated
                          quote never reaches here — the substring check already
                          demoted it to guessed. */}
                      {quotes[spec.field] ? (
                        // R12-BD-1: the affordance no longer implies the quote was
                        // validated — it says what was actually checked (found
                        // verbatim) and asks the human to check the rest.
                        <span
                          className="graph-node__basis"
                          title="Found word-for-word in your description — check it supports the value shown"
                        >
                          <ProvenanceQuote text={quotes[spec.field]!} />
                        </span>
                      ) : guessed.includes(spec.field) ? (
                        // R9-SC-3: a quiet badge, not a second alarm — the
                        // card-level banner carries the alarm; this points.
                        <ProvenanceBadge kind="guessed" />
                      ) : !uncertain ? (
                        // R12-BD-1/R15-C5: the model reported confidence for
                        // this field, but there is no verified quote behind
                        // it — reworded toward action, same badge family as
                        // "guessed", own distinct label and meaning.
                        <ProvenanceBadge kind="no-basis" />
                      ) : null}
                    </>
                  ) : (
                    // R15-C5 (proposal §3.6): a silently-unanswered optional
                    // field (decision type, human-in-the-loop) reads as a
                    // quiet "not stated" badge, not as a confirmed value and
                    // not as an error.
                    spec.optional && <ProvenanceBadge kind="not-stated" />
                  )}
                  {showWhy && (
                    <span className="graph-node__consequence">{FIELD_CONSEQUENCES[spec.field]}</span>
                  )}
                  {fieldWarnings.map((w) => (
                    // R9-SC-3: advisory identity, visually distinct from the
                    // blocking warn styling — advisory never blocks (R5-GR-4).
                    <span key={w.message} className="graph-node__advisory" role="note">
                      ⚠ {w.message}
                    </span>
                  ))}
                </dd>
              </div>
            );
          })}
          {vendor !== null && (
            <div className="graph-node__meaning-row">
              <dt>vendor</dt>
              <dd>
                <span className="graph-node__meaning">{vendor}</span>
                {/* R9 live-verify finding: this custom row missed both the
                    consequence gating AND the badge — and the first live
                    case's guessed field was exactly `vendor`. Same rules as
                    every looped field. */}
                {quotes.vendor ? (
                  <span
                    className="graph-node__basis"
                    title="Found word-for-word in your description — check it supports the value shown"
                  >
                    <ProvenanceQuote text={quotes.vendor} />
                  </span>
                ) : guessed.includes('vendor') ? (
                  <ProvenanceBadge kind="guessed" />
                ) : !uncertain ? (
                  <ProvenanceBadge kind="no-basis" />
                ) : null}
                {showWhy && <span className="graph-node__consequence">{FIELD_CONSEQUENCES.vendor}</span>}
              </dd>
            </div>
          )}
          {declaredModelId !== null && (
            <div className="graph-node__meaning-row">
              <dt>model</dt>
              <dd>
                <span className="graph-node__meaning">{declaredModelId}</span>
                {quotes.declared_model_id ? (
                  <span
                    className="graph-node__basis"
                    title="Found word-for-word in your description — check it supports the value shown"
                  >
                    <ProvenanceQuote text={quotes.declared_model_id} />
                  </span>
                ) : guessed.includes('declared_model_id') ? (
                  <ProvenanceBadge kind="guessed" />
                ) : !uncertain ? (
                  <ProvenanceBadge kind="no-basis" />
                ) : null}
                {showWhy && (
                  <span className="graph-node__consequence">{FIELD_CONSEQUENCES.declared_model_id}</span>
                )}
              </dd>
            </div>
          )}
        </dl>
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
                value={String(record[spec.field] ?? '')}
                onChange={(e) =>
                  onCorrect(
                    node.id,
                    spec.field,
                    spec.numeric ? Number(e.target.value) : spec.boolean ? e.target.value === 'true' : e.target.value,
                  )
                }
              >
                {spec.optional && record[spec.field] === undefined && <option value="">not stated</option>}
                {spec.options.map((o) => (
                  <option key={String(o)} value={String(o)}>
                    {spec.optionLabel
                      ? spec.optionLabel(o)
                      : spec.meanings?.[String(o)] ?? String(o)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {/* R5-GR-2: the human states the machine's proposal is right. A
          correction (Edit → change) confirms implicitly via the reducer. */}
      {!editing && (
        // R15-C5 (proposal §3.6): aria-expanded/aria-controls on the
        // disclosure, consistent with the accessible-disclosure pattern
        // established in C1/C2/C4 — never a title= tooltip or hover trick.
        <button
          type="button"
          className="graph-node__why"
          aria-expanded={showWhy}
          aria-controls={`why-${node.id}`}
          onClick={() => setShowWhy((w) => !w)}
        >
          {showWhy ? 'Hide why these matter' : 'Why these values matter'}
        </button>
      )}
      {/* R9-SC-4: the card that most needs action must not be the one with
          no button. Opens the editor; ADR-IF-R6-2's no-plain-confirm holds. */}
      {editable && !editing && guessed.length > 0 && (
        <button type="button" className="graph-node__fix-guessed" onClick={onToggleEdit}>
          Fix guessed values
        </button>
      )}
      {/* ADR-IF-R6-2: a guessed card renders NO plain confirm — cards with
          guessed fields are excluded from the unconfirmed set and resolve
          via correction or the questionnaire. */}
      {unconfirmed && !editing && onConfirm && guessed.length === 0 && (
        <button type="button" className="graph-node__confirm" onClick={() => onConfirm(node.id)}>
          {uncertain ? 'I have checked this — confirm' : 'Looks right — confirm'}
        </button>
      )}
      {/* Honesty review 004 finding 1: a guessed card is EXCLUDED from the
          confirm set (ADR-IF-R6-2), so !unconfirmed alone would claim
          "Confirmed by you." with zero human acts. The note is earned only
          when no guessed fields remain — at which point it is true either
          via a confirm click or via corrections. */}
      {!unconfirmed && editable && onConfirm && guessed.length === 0 && (
        <p className="graph-node__confirmed-note">Confirmed by you.</p>
      )}
    </div>
  );
}

export default function GraphView({
  graph,
  editable = false,
  onCorrect,
  unconfirmedNodeIds,
  onConfirmNode,
  warnings = [],
  provenance = {},
  guessedFields = {},
  ignoredJurisdictions = [],
}: GraphViewProps) {
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const gated = unconfirmedNodeIds !== undefined;

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
          unconfirmed={gated && (unconfirmedNodeIds?.includes(node.id) ?? false)}
          warnings={warnings.filter((w) => w.node_id === node.id)}
          quotes={provenance[node.id] ?? {}}
          guessed={guessedFields[node.id] ?? []}
          onToggleEdit={() => setEditingNodeId(editingNodeId === node.id ? null : node.id)}
          onCorrect={onCorrect}
          onConfirm={gated ? onConfirmNode : undefined}
        />
      ))}
    </div>
  );

  return (
    <div className="graph-view-wrap">
      {/* R5-GR-2: the contract of this screen, stated where the work happens. */}
      {gated && (
        <p className="graph-view__gate-note">
          The model <strong>proposed</strong> everything below from your description — nothing is
          scored until you confirm or correct each card. Each value shows what it means and why it
          matters.
        </p>
      )}
      {/* R5-GX-1: a dropped value must be visible, or the drop is a silent edit. */}
      {ignoredJurisdictions.length > 0 && (
        <p className="graph-view__ignored" role="status">
          Ignored from the model&rsquo;s reading: {ignoredJurisdictions.map((j) => `“${j}”`).join(', ')} —
          not {ignoredJurisdictions.length === 1 ? 'a recognised jurisdiction' : 'recognised jurisdictions'}.
          Jurisdictions are asked explicitly later in the flow.
        </p>
      )}
      {/* design-review round 4 (Panel G — Intake: Graph review, Important):
          the three-column layout with arrows visually IS a flow diagram,
          but nothing narrated that for a first-time reader — it was
          presented as self-evident. This always renders, unlike the
          conditional gate-note above (which is honestly about confirmation
          state, not the layout itself). Also renamed the region's aria
          label away from "Data-flow graph" — the same unexplained term the
          heading and loading state used to use (Critical, fixed above). */}
      <p className="graph-view__narration">
        Each card below is one piece of your use case: what goes in, what happens to it, and what
        comes out.
      </p>
      <div className="graph-view" aria-label="What goes in, what happens, what comes out">
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
      {/* R5-GR-5: a count, not a heuristic. */}
      {editable && graph.processing_nodes.length >= 2 && (
        <p className="graph-view__hint" role="note">
          This use case has {graph.processing_nodes.length} processing steps. If these are really two
          separate tools, submit them separately — one use case per pre-check gets sharper verdicts.
        </p>
      )}
    </div>
  );
}
