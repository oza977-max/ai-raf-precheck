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
import {
  ACTION_TYPE_LABELS,
  AUTONOMY_LABELS,
  BINDINGNESS_LABELS,
  DATA_CLASS_LABELS,
  DATA_ZONE_LABELS,
  DECISION_TYPE_LABELS,
  EXPOSURE_LABELS,
  MODEL_TYPE_LABELS,
  REVERSIBILITY_LABELS,
  SCALE_LABELS,
} from './field-copy';
import { buildGraphFromForm } from '../engine/build-graph-from-form';
import type { StructuredFormValues } from '../engine/build-graph-from-form';
import type { DataFlowGraph, JurisdictionEntry } from '../engine/types';

// UC-3a (intake-flow.md §5). Rule 4 (cross-cutting.md §7): presentation-only
// — calls buildGraphFromForm(), no business logic inline.
//
// Deviation from intake-flow.md §5.2's literal wording ("values from policy
// data_classes/model_types/..."): those PolicyFile field names don't exist
// anywhere in policy-schema.md (confirmed via grep) — the canonical
// vocabulary is a fixed closed enum set (§3.0), not per-policy. Options are
// sourced from src/engine/canonical-vocabulary.ts instead, consistent with
// P4-C01's extractGraph() deviation. jurisdictions IS a real PolicyFile
// field and is genuinely sourced from the loaded policy below.

interface StructuredFormProps {
  jurisdictions: JurisdictionEntry[];
  onSubmit: (graph: DataFlowGraph) => void;
}

export default function StructuredForm({ jurisdictions, onSubmit }: StructuredFormProps) {
  const [values, setValues] = useState<Partial<StructuredFormValues>>({
    autonomyLevel: 0,
    replacesPriorModel: false,
    jurisdictions: [],
  });

  function update<K extends keyof StructuredFormValues>(field: K, value: StructuredFormValues[K]) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  function isComplete(v: Partial<StructuredFormValues>): v is StructuredFormValues {
    return Boolean(
      v.useCaseName &&
        v.description &&
        v.inputDataClass &&
        v.inputDataZone &&
        v.modelType &&
        v.autonomyLevel !== undefined &&
        v.processingDataZone &&
        v.outputActionType &&
        v.outputExposure &&
        v.decisionBindingness &&
        v.outputReversibility &&
        v.outputScale &&
        v.replacesPriorModel !== undefined &&
        v.jurisdictions,
    );
  }

  function handleSubmit() {
    if (!isComplete(values)) return;
    onSubmit(buildGraphFromForm(values));
  }

  function toggleJurisdiction(code: string) {
    const current = values.jurisdictions ?? [];
    update(
      'jurisdictions',
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
    );
  }

  return (
    <section aria-label="Structured intake form">
      <p role="status">
        Guided intake — answer the fields below to describe your use case. No AI is involved in
        reading your answers or in the decision that follows, so the same answers always produce the
        same outcome. (Adding an API key in Settings unlocks an optional plain-English alternative
        to this form; it changes how the description is read in, not how it is scored.)
      </p>

      <label htmlFor="sf-name">What do you want to call it?</label>
      <input
        id="sf-name"
        type="text"
        value={values.useCaseName ?? ''}
        onChange={(e) => update('useCaseName', e.target.value)}
      />

      <label htmlFor="sf-description">In a sentence or two, what does it do?</label>
      <textarea
        id="sf-description"
        value={values.description ?? ''}
        onChange={(e) => update('description', e.target.value)}
      />

      <label htmlFor="sf-input-data-class">What kind of information does it use?</label>
      <p className="field-help">
        Pick the most sensitive kind it touches, even if that&apos;s only occasionally.
      </p>
      <select
        id="sf-input-data-class"
        value={values.inputDataClass ?? ''}
        onChange={(e) => update('inputDataClass', e.target.value as StructuredFormValues['inputDataClass'])}
      >
        <option value="">Select…</option>
        {DATA_CLASSES.map((v) => (
          <option key={v} value={v}>
            {DATA_CLASS_LABELS[v]}
          </option>
        ))}
      </select>

      <label htmlFor="sf-input-data-zone">Where does that information sit today?</label>
      <p className="field-help">
        Before the AI touches it. If it is stored in more than one place, pick the least protected.
      </p>
      <select
        id="sf-input-data-zone"
        value={values.inputDataZone ?? ''}
        onChange={(e) => update('inputDataZone', e.target.value as StructuredFormValues['inputDataZone'])}
      >
        <option value="">Select…</option>
        {DATA_ZONES.map((v) => (
          <option key={v} value={v}>
            {DATA_ZONE_LABELS[v]}
          </option>
        ))}
      </select>

      <label htmlFor="sf-model-type">What kind of AI is it?</label>
      <p className="field-help">
        If you are not sure, pick the closest description — you can correct it on the next screen.
      </p>
      <select
        id="sf-model-type"
        value={values.modelType ?? ''}
        onChange={(e) => update('modelType', e.target.value as StructuredFormValues['modelType'])}
      >
        <option value="">Select…</option>
        {MODEL_TYPES.map((v) => (
          <option key={v} value={v}>
            {MODEL_TYPE_LABELS[v]}
          </option>
        ))}
      </select>

      <label htmlFor="sf-autonomy">How much can it do without a person?</label>
      <select
        id="sf-autonomy"
        value={values.autonomyLevel ?? 0}
        onChange={(e) => update('autonomyLevel', Number(e.target.value) as StructuredFormValues['autonomyLevel'])}
      >
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <option key={level} value={level}>
            {AUTONOMY_LABELS[level]}
          </option>
        ))}
      </select>

      <label htmlFor="sf-processing-zone">Where does the AI itself run?</label>
      <p className="field-help">
        Not where the data is stored — where it gets sent to be processed. A cloud AI service counts as an
        outside supplier even if your data normally never leaves the firm. Information moving from a more
        protected place to a less protected one is the single thing these rules watch for most closely.
      </p>
      <select
        id="sf-processing-zone"
        value={values.processingDataZone ?? ''}
        onChange={(e) =>
          update('processingDataZone', e.target.value as StructuredFormValues['processingDataZone'])
        }
      >
        <option value="">Select…</option>
        {DATA_ZONES.map((v) => (
          <option key={v} value={v}>
            {DATA_ZONE_LABELS[v]}
          </option>
        ))}
      </select>

      <label htmlFor="sf-action-type">What does it actually produce or do?</label>
      <select
        id="sf-action-type"
        value={values.outputActionType ?? ''}
        onChange={(e) => update('outputActionType', e.target.value as StructuredFormValues['outputActionType'])}
      >
        <option value="">Select…</option>
        {ACTION_TYPES.map((v) => (
          <option key={v} value={v}>
            {ACTION_TYPE_LABELS[v]}
          </option>
        ))}
      </select>

      <label htmlFor="sf-exposure">Who sees what it produces?</label>
      <p className="field-help">Pick the widest audience it reaches.</p>
      <select
        id="sf-exposure"
        value={values.outputExposure ?? ''}
        onChange={(e) => update('outputExposure', e.target.value as StructuredFormValues['outputExposure'])}
      >
        <option value="">Select…</option>
        {EXPOSURES.map((v) => (
          <option key={v} value={v}>
            {EXPOSURE_LABELS[v]}
          </option>
        ))}
      </select>

      <label htmlFor="sf-bindingness">How much weight does its output carry?</label>
      <p className="field-help">
        Be honest about what happens in practice rather than what the process says. If people almost always
        go with what it says, that is closer to &ldquo;substantially drives the decision&rdquo; than to
        &ldquo;one input among several&rdquo;.
      </p>
      <select
        id="sf-bindingness"
        value={values.decisionBindingness ?? ''}
        onChange={(e) =>
          update('decisionBindingness', e.target.value as StructuredFormValues['decisionBindingness'])
        }
      >
        <option value="">Select…</option>
        {DECISION_BINDINGNESS.map((v) => (
          <option key={v} value={v}>
            {BINDINGNESS_LABELS[v]}
          </option>
        ))}
      </select>

      <label htmlFor="sf-reversibility">If it gets something wrong, can it be undone?</label>
      <p className="field-help">
        Think about the point at which someone would notice. Money already sent, a message already seen by
        a client, or a filing already made generally cannot be taken back.
      </p>
      <select
        id="sf-reversibility"
        value={values.outputReversibility ?? ''}
        onChange={(e) =>
          update('outputReversibility', e.target.value as StructuredFormValues['outputReversibility'])
        }
      >
        <option value="">Select…</option>
        {['reversible', 'irreversible', 'unknown'].map((v) => (
          <option key={v} value={v}>
            {REVERSIBILITY_LABELS[v]}
          </option>
        ))}
      </select>

      <label htmlFor="sf-decision-type">What kind of decision does it feed? (optional)</label>
      <p className="field-help">
        Some areas carry extra legal duties — lending and hiring especially. Leave blank if none of these
        fit.
      </p>
      <select
        id="sf-decision-type"
        value={values.decisionType ?? ''}
        onChange={(e) =>
          update('decisionType', (e.target.value || undefined) as StructuredFormValues['decisionType'])
        }
      >
        <option value="">None / not applicable</option>
        {DECISION_TYPES.map((v) => (
          <option key={v} value={v}>
            {DECISION_TYPE_LABELS[v]}
          </option>
        ))}
      </select>

      <label htmlFor="sf-hitl">Does a person check it before anything happens? (optional)</label>
      <select
        id="sf-hitl"
        value={values.hitl === undefined ? '' : values.hitl ? 'yes' : 'no'}
        onChange={(e) =>
          update('hitl', e.target.value === '' ? undefined : e.target.value === 'yes')
        }
      >
        <option value="">Not specified</option>
        <option value="yes">Yes — a human approves before action</option>
        <option value="no">No — the system acts without prior human review</option>
      </select>

      <label htmlFor="sf-scale">How widely is it used?</label>
      <select
        id="sf-scale"
        value={values.outputScale ?? ''}
        onChange={(e) => update('outputScale', e.target.value as StructuredFormValues['outputScale'])}
      >
        <option value="">Select…</option>
        {['limited', 'at_scale'].map((v) => (
          <option key={v} value={v}>
            {SCALE_LABELS[v]}
          </option>
        ))}
      </select>

      <label htmlFor="sf-replaces">
        <input
          id="sf-replaces"
          type="checkbox"
          checked={values.replacesPriorModel ?? false}
          onChange={(e) => update('replacesPriorModel', e.target.checked)}
        />
        It replaces something we already use (a model, a tool or a manual process)
      </label>

      <fieldset>
        <legend>Which countries or regions does it touch?</legend>
        <p className="field-help">
          Tick anywhere the clients, staff or data involved are based. This decides which local rules apply.
        </p>
        {jurisdictions.map((j) => (
          <label key={j.code} htmlFor={`sf-jurisdiction-${j.code}`}>
            <input
              id={`sf-jurisdiction-${j.code}`}
              type="checkbox"
              checked={(values.jurisdictions ?? []).includes(j.code)}
              onChange={() => toggleJurisdiction(j.code)}
            />
            {j.name}
          </label>
        ))}
      </fieldset>

      <button type="button" onClick={handleSubmit} disabled={!isComplete(values)}>
        Continue
      </button>
    </section>
  );
}
