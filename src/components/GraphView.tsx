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
import type { DataFlowGraph, InputNode, OutputNode, PolicyFile, ProcessingNode, SystemAccessScope } from '../engine/types';
import type { PlausibilityWarning } from '../engine/plausibility';
import { normaliseAccessScope } from '../engine/access-scope';
// §4 (D-103, DR7-26). The review screen now speaks QUESTIONNAIRE_COPY
// throughout — the same table the targeted questionnaire (chunk E) reads —
// so the words a person edits here are the words they'd have answered.
// field-copy.ts's codes-and-labels stay for the REVIEWER's own grid
// (graph-summary.ts, VerdictDisplay's "Record & provenance") — that is a
// component-to-component import, not an engine/screen boundary crossing.
import {
  ACCESS_SCOPE_REFUSAL_TEXT,
  GRAPH_REVIEW_CARD_TITLES,
  findOption,
  plausibilityMessageForDescription,
  questionnaireCopyForField,
  SUMMARY_REVERSIBILITY,
  SUMMARY_MULTI_INSTANCE,
  supplierDisplayName,
  approvedModelLabelFor,
} from './plain-copy';
import { FIELD_CONSEQUENCES } from './field-copy';

// V1.1-C01, rebuilt for R5 (intake-flow.md §15), reworded for R16-E §4
// (D-103). Rule 4 (cross-cutting.md §7): presentation-only — renders the
// data-flow graph the engine actually evaluates, hosts the per-field
// correction editor, and explains every decision-bearing value in plain
// English so a submitter can catch a wrong one without knowing the
// rulebook. Every edit still dispatches through the caller's
// handleCorrectNode → CORRECTION_APPLIED reducer path (BC-V11C01-03: no
// parallel state, no direct graph mutation here); node confirmation
// (R5-GR-2) likewise goes through the caller → NODE_CONFIRMED.
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
  // R16-E review pass 2: the firm's registry, so a recorded supplier shows
  // its plain name — never its internal id.
  policy?: PolicyFile;
}

const REVERSIBILITY = ['reversible', 'irreversible', 'unknown'] as const;
const SCALE = ['limited', 'at_scale'] as const;

interface FieldSpec {
  field: string;
  options: readonly (string | number)[];
  numeric?: boolean;
  boolean?: boolean;
  /** Optional engine fields (decision_type, hitl) may be absent. */
  optional?: boolean;
}

// DR7-29: `lending-decision` is a legal engine value (older extractions)
// but the targeted question's own Q8 text offers only `credit-decision`
// going forward, so it has no entry in QUESTIONNAIRE_COPY's own options —
// a node still carrying it must display a plain label all the same
// (principle 1), never the bare code. GraphView-only: this never feeds a
// choosable button anywhere.
const LEGACY_VALUE_LABEL: Record<string, string> = {
  'lending-decision': 'Whether to lend to someone, or on what terms',
};

// R16-E review pass 1: values a node can CARRY but nobody can CHOOSE as a
// button. QUESTIONNAIRE_COPY's options are the choosable answers, and
// 'unknown' is deliberately not one — but a node holds it after a model
// reading or after "Not sure" on the copies question, and the row printed the
// bare word "unknown". The wording is the summary's own, one source per fact.
const DISPLAY_ONLY_VALUE_LABEL: Record<string, Record<string, string>> = {
  output_reversibility: { unknown: SUMMARY_REVERSIBILITY.unknown },
  multi_instance_coordination: { unknown: SUMMARY_MULTI_INSTANCE.unknown },
};

/** Every decision-bearing value on this screen reads from the ONE
 *  QUESTIONNAIRE_COPY table (§2) — never a second, field-copy.ts label a
 *  submitter would read differently from how they'd have answered. */
function fieldValueLabel(field: string, value: string | number): string {
  const key = String(value);
  return (
    questionnaireCopyForField(field).options[key] ?? DISPLAY_ONLY_VALUE_LABEL[field]?.[key] ?? LEGACY_VALUE_LABEL[key] ?? key
  );
}

const INPUT_FIELDS: FieldSpec[] = [
  { field: 'data_class', options: DATA_CLASSES },
  { field: 'data_zone', options: DATA_ZONES },
];

const PROCESSING_FIELDS: FieldSpec[] = [
  { field: 'model_type', options: MODEL_TYPES },
  { field: 'autonomy_level', options: [0, 1, 2, 3, 4], numeric: true },
  { field: 'data_zone', options: DATA_ZONES },
  // v1.4 agentic infrastructure-access fields — optional on the engine
  // type; absent renders "not stated", same honest-weaker-claim rule as
  // decision_type/hitl below.
  {
    field: 'system_access_scope',
    options: ['none', 'shared_infrastructure', 'credentialed_systems', 'deployment_authority'],
    optional: true,
  },
  { field: 'multi_instance_coordination', options: ['no', 'yes', 'unknown'], optional: true },
];

const OUTPUT_FIELDS: FieldSpec[] = [
  { field: 'action_type', options: ACTION_TYPES },
  { field: 'exposure', options: EXPOSURES },
  { field: 'decision_bindingness', options: DECISION_BINDINGNESS },
  { field: 'output_reversibility', options: REVERSIBILITY },
  { field: 'scale', options: SCALE },
  // R5-GR-1: decision-bearing and previously invisible here. Optional on
  // the engine type — absent renders as "not stated", a weaker and honest
  // claim, not a default.
  { field: 'decision_type', options: DECISION_TYPES, optional: true },
  { field: 'hitl', options: ['true', 'false'], boolean: true, optional: true },
];

type AnyNode = InputNode | ProcessingNode | OutputNode;

type NodeKind = 'input' | 'processing' | 'output';

/** §4 (v2.1, F1B-1): the description path's own plausibility wording names
 *  the card and row this screen itself defines — never a form question it
 *  never shows. `kind` is passed down from the column loop (each column
 *  already knows which card it is), so no graph traversal is needed here. */
function cardTitleFor(kind: NodeKind): string {
  return GRAPH_REVIEW_CARD_TITLES[kind];
}

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
      From your description: &ldquo;{shown}&rdquo;
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

// R15-C5 (proposal §3.6, dissent #6 / IxD ID-6 overruled): "not in your
// description" and "check this, or it becomes a question" share a badge
// FAMILY (.graph-node__badge — same shape/visual language) so a reviewer's
// eye groups them as "look again" states, but each keeps its own class and
// its own text — they are not merged into one label or one meaning. The
// three-state provenance logic above (quoted / guessed / confident-no-basis)
// and the no-plain-confirm gate for guessed cards are unchanged; this
// component only renders what that existing logic decided. §4 (F1B-1):
// reworded off "guessed"/"not found in your text" — engine vocabulary.
function ProvenanceBadge({ kind }: { kind: 'guessed' | 'no-basis' | 'not-stated' }) {
  if (kind === 'guessed') {
    return (
      <span className="graph-node__badge graph-node__badge--guessed graph-node__guessed-badge">
        Not in your description — check this, or it becomes a question
      </span>
    );
  }
  if (kind === 'no-basis') {
    return (
      <span className="graph-node__badge graph-node__badge--no-basis">
        Not in your description — please check this
      </span>
    );
  }
  return <span className="graph-node__badge graph-node__badge--not-stated">not stated</span>;
}

// §4 (DR7-11). system_access_scope's four engine values -> the form's own
// Q13 option keys (plain-copy.ts) — different key strings (the form's
// 'shared'/'credentialed'/'deployment' vs the engine's
// 'shared_infrastructure'/'credentialed_systems'/'deployment_authority'),
// so this is the one place that maps between them for THIS editor.
const Q13_OPTION_KEY_FOR_SCOPE: Record<SystemAccessScope, string> = {
  none: 'none',
  shared_infrastructure: 'shared',
  credentialed_systems: 'credentialed',
  deployment_authority: 'deployment',
};

const ACCESS_SCOPE_VALUES: SystemAccessScope[] = [
  'none',
  'shared_infrastructure',
  'credentialed_systems',
  'deployment_authority',
];

// §4 (DR7-11). A tick-all checkbox editor for system_access_scope — the
// single `<select>` every other field uses can hold only one value, so a
// correction here used to silently narrow a genuine multi-value answer
// (e.g. "has its own logins AND runs on shared infrastructure") down to
// whichever single option was last picked, with no check at all. Same
// exclusivity as the form's own Q13 (StructuredForm.tsx's toggleMulti):
// "Nothing beyond…" clears every other tick and vice versa. Every change
// is validated through `normaliseAccessScope` (src/engine/access-scope.ts)
// — the SAME single checker the form, the questionnaire and
// `coerceAnswerValue` all call — before it is written; a refusal (e.g.
// unticking the only remaining kind, leaving nothing selected) shows the
// reason and writes nothing, leaving the prior, still-valid value in
// place and still displayed. R16-E (§4): unchanged by this round — the
// words were already plain (Q13's own), the values keep their meaning.
function AccessScopeEditor({
  node,
  record,
  onCorrect,
}: {
  node: AnyNode;
  record: Record<string, unknown>;
  onCorrect: (nodeId: string, field: string, value: unknown) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const raw = record.system_access_scope;
  const current: string[] = raw === undefined ? [] : Array.isArray(raw) ? (raw as string[]) : [String(raw)];

  function toggle(scope: SystemAccessScope) {
    let next: string[];
    if (scope === 'none') {
      next = current.includes('none') ? [] : ['none'];
    } else {
      const withoutNone = current.filter((v) => v !== 'none');
      next = withoutNone.includes(scope) ? withoutNone.filter((v) => v !== scope) : [...withoutNone, scope];
    }
    const result = normaliseAccessScope(next);
    if (!result.ok) {
      // Plain words, never the engine's reason (which names the field).
      setError(ACCESS_SCOPE_REFUSAL_TEXT);
      return;
    }
    setError(null);
    onCorrect(node.id, 'system_access_scope', result.value);
  }

  // A fieldset, not one <label> around everything: a label's control is its
  // FIRST input, so clicking any option's words inside a single wrapping
  // label ticked "Nothing beyond…" instead. Each option is its own label;
  // the legend names the group (WCAG 1.3.1).
  return (
    <fieldset className="graph-node__field graph-node__access-scope-editor">
      {/* The screen's own plain label for this row (R16-E review pass 3). */}
      <legend>{questionnaireCopyForField('system_access_scope').shortLabel}</legend>
      {ACCESS_SCOPE_VALUES.map((scope) => {
        const text = findOption('13', Q13_OPTION_KEY_FOR_SCOPE[scope])?.text ?? scope;
        return (
          <label key={scope} className="graph-node__access-scope-option">
            <input
              type="checkbox"
              aria-label={`${node.label} — ${text}`}
              checked={current.includes(scope)}
              onChange={() => toggle(scope)}
            />
            {text}
          </label>
        );
      })}
      {error && (
        <p role="alert" className="field-help field-help--error">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function NodeCard({
  node,
  fields,
  cardTitle,
  editable,
  editing,
  unconfirmed,
  warnings,
  quotes,
  guessed,
  onToggleEdit,
  onCorrect,
  onConfirm,
  policy,
}: {
  node: AnyNode;
  fields: FieldSpec[];
  cardTitle: string;
  editable: boolean;
  editing: boolean;
  unconfirmed: boolean;
  warnings: PlausibilityWarning[];
  quotes: Record<string, string>;
  guessed: string[];
  onToggleEdit: () => void;
  onCorrect?: (nodeId: string, field: string, value: unknown) => void;
  onConfirm?: (nodeId: string) => void;
  policy?: PolicyFile;
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
            ? <>especially: {guessed.map((fld) => questionnaireCopyForField(fld).shortLabel).join(', ')}.</>
            : 'check every value on this card.'}
        </p>
      )}

      {!editing && (
        <dl className="graph-node__meanings" id={`why-${node.id}`}>
          {fields.map((spec) => {
            const raw = record[spec.field];
            const has = raw !== undefined && raw !== null;
            // R16-A1 (PE-9 §1.1): a field may hold a LIST of values (today,
            // only system_access_scope) — look up each element's own
            // meaning and join them, rather than stringifying the array
            // (which would print "a,b" and miss every meaning lookup, since
            // no meanings map is keyed by a comma-joined value).
            const meaning = has
              ? Array.isArray(raw)
                ? raw.map((v) => fieldValueLabel(spec.field, v)).join(', ')
                : fieldValueLabel(spec.field, raw as string | number)
              : null;
            const fieldWarnings = warnings.filter((w) => w.field === spec.field);
            // §4 (D-103): the row's own label is QUESTIONNAIRE_COPY's
            // shortLabel — the same question a person would have answered
            // — with no code of any kind beside it (principle 1).
            const plainLabel = questionnaireCopyForField(spec.field).shortLabel;
            return (
              <div key={spec.field} className="graph-node__meaning-row">
                <dt>{plainLabel}</dt>
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
                    // §4 (v2.1): the description path's own wording — names
                    // this card and this row, never a form question that
                    // path never shows.
                    <span key={w.signal} className="graph-node__advisory" role="note">
                      ⚠ {plausibilityMessageForDescription(w.signal, cardTitle, plainLabel)}
                    </span>
                  ))}
                </dd>
              </div>
            );
          })}
          {vendor !== null && (
            <div className="graph-node__meaning-row">
              <dt>{questionnaireCopyForField('vendor').shortLabel}</dt>
              <dd>
                <span className="graph-node__meaning">{supplierDisplayName(vendor, policy).name}</span>
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
              <dt>{questionnaireCopyForField('declared_model_id').shortLabel}</dt>
              <dd>
                {/* TC-MN-05 / CR7-35: the same label the questionnaire's button
                    and Recorded line use (one helper; never a listed model's
                    raw id). An id the policy does not list is shown as typed. */}
                <span className="graph-node__meaning">
                  {approvedModelLabelFor(policy?.approved_models, declaredModelId) ?? declaredModelId}
                </span>
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
          {fields.map((spec) =>
            // §4 (DR7-11): the one field with its own tick-all editor —
            // every other field keeps the single-select it already had.
            spec.field === 'system_access_scope' ? (
              <AccessScopeEditor key={spec.field} node={node} record={record} onCorrect={onCorrect} />
            ) : (
              <label key={spec.field} className="graph-node__field">
                <span>{questionnaireCopyForField(spec.field).shortLabel}</span>
                <select
                  aria-label={`${node.label} — ${questionnaireCopyForField(spec.field).shortLabel}`}
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
                  {spec.options
                    // R16-E review pass 2: the legacy 'lending-decision' reads
                    // exactly like 'credit-decision', so offering both showed
                    // two identical choices. It is listed only when it is the
                    // value already recorded, marked as the older answer.
                    .filter((o) => o !== 'lending-decision' || record[spec.field] === 'lending-decision')
                    .map((o) => (
                      <option key={String(o)} value={String(o)}>
                        {fieldValueLabel(spec.field, o)}
                        {o === 'lending-decision' ? ' (older answer)' : ''}
                      </option>
                    ))}
                </select>
              </label>
            ),
          )}
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
          no button. Opens the editor; ADR-IF-R6-2's no-plain-confirm holds.
          §8's guard test bans "guessed" on any screen a submitter sees —
          found while verifying this chunk's own guard test. */}
      {editable && !editing && guessed.length > 0 && (
        <button type="button" className="graph-node__fix-guessed" onClick={onToggleEdit}>
          Fix the details we couldn’t tell
        </button>
      )}
      {/* ADR-IF-R6-2: a guessed card renders NO plain confirm — cards with
          guessed fields are excluded from the unconfirmed set and resolve
          via correction or the questionnaire. §4 (D-103): both confirm
          forms keep their meaning — the stronger wording stays where the
          person must actually look. */}
      {unconfirmed && !editing && onConfirm && guessed.length === 0 && (
        <button type="button" className="graph-node__confirm" onClick={() => onConfirm(node.id)}>
          {uncertain ? 'I’ve checked this — it’s right' : 'This is right'}
        </button>
      )}
      {/* Honesty review 004 finding 1: a guessed card is EXCLUDED from the
          confirm set (ADR-IF-R6-2), so !unconfirmed alone would claim
          "Checked by you." with zero human acts. The note is earned only
          when no guessed fields remain — at which point it is true either
          via a confirm click or via corrections. */}
      {!unconfirmed && editable && onConfirm && guessed.length === 0 && (
        <p className="graph-node__confirmed-note">Checked by you.</p>
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
  policy,
}: GraphViewProps) {
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const gated = unconfirmedNodeIds !== undefined;

  const column = (title: string, nodes: AnyNode[], fields: FieldSpec[]) => (
    <div className="graph-view__col">
      <div className="graph-view__col-title">{title}</div>
      {nodes.length === 0 && <p className="graph-view__empty">Nothing found in your description</p>}
      {nodes.map((node) => (
        <NodeCard
          key={node.id}
          node={node}
          fields={fields}
          cardTitle={title}
          editable={editable}
          editing={editingNodeId === node.id}
          unconfirmed={gated && (unconfirmedNodeIds?.includes(node.id) ?? false)}
          warnings={warnings.filter((w) => w.node_id === node.id)}
          quotes={provenance[node.id] ?? {}}
          guessed={guessedFields[node.id] ?? []}
          onToggleEdit={() => setEditingNodeId(editingNodeId === node.id ? null : node.id)}
          onCorrect={onCorrect}
          onConfirm={gated ? onConfirmNode : undefined}
          policy={policy}
        />
      ))}
    </div>
  );

  return (
    <div className="graph-view-wrap">
      {/* R5-GR-2 (reworded §4, D-103): the contract of this screen, stated
          where the work happens — no "model", no "proposed", no "graph". */}
      {gated && (
        <p className="graph-view__gate-note">
          We read these details from your description — nothing is decided until you&rsquo;ve checked or
          corrected each one.
        </p>
      )}
      {/* R5-GX-1: a dropped value must be visible, or the drop is a silent edit. */}
      {ignoredJurisdictions.length > 0 && (
        <p className="graph-view__ignored" role="status">
          {ignoredJurisdictions.length === 1
            ? `We ignored “${ignoredJurisdictions[0]}” — it isn’t one of the countries your firm’s rules cover.`
            : `We ignored ${ignoredJurisdictions.map((j) => `“${j}”`).join(', ')} — they aren’t among the countries your firm’s rules cover.`}
          {' '}Countries are asked explicitly later in the flow.
        </p>
      )}
      {/* design-review round 4 (Panel G — Intake: Graph review, Important):
          the three-column layout with arrows visually IS a flow diagram,
          but nothing narrated that for a first-time reader — it was
          presented as self-evident. This always renders, unlike the
          conditional gate-note above (which is honestly about confirmation
          state, not the layout itself). */}
      <p className="graph-view__narration">
        Each card below is one piece of your use case: what goes in, what happens to it, and what
        comes out.
      </p>
      <div className="graph-view" aria-label="What goes in, what happens, what comes out">
        {column(cardTitleFor('input'), graph.input_nodes, INPUT_FIELDS)}
        <div className="graph-view__arrow" aria-hidden="true">
          →
        </div>
        {column(cardTitleFor('processing'), graph.processing_nodes, PROCESSING_FIELDS)}
        <div className="graph-view__arrow" aria-hidden="true">
          →
        </div>
        {column(cardTitleFor('output'), graph.output_nodes, OUTPUT_FIELDS)}
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
