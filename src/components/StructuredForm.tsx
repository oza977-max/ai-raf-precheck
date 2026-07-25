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

const AUTONOMY_DESCRIPTIONS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: '0 — No autonomy: purely informational, no action taken',
  1: '1 — Human approves every action before it happens',
  2: '2 — Human reviews actions after the fact (post-hoc)',
  3: '3 — Acts independently within a narrow, pre-approved scope',
  4: '4 — Fully autonomous, no human checkpoint',
};

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

      <label htmlFor="sf-name">Use case name</label>
      <input
        id="sf-name"
        type="text"
        value={values.useCaseName ?? ''}
        onChange={(e) => update('useCaseName', e.target.value)}
      />

      <label htmlFor="sf-description">Brief description</label>
      <textarea
        id="sf-description"
        value={values.description ?? ''}
        onChange={(e) => update('description', e.target.value)}
      />

      <label htmlFor="sf-input-data-class">Input data class</label>
      <p className="field-help">
        How sensitive is the data feeding this AI? Public → Internal → Confidential → Client PII (client
        personal data) → MNPI (material non-public information).
      </p>
      <select
        id="sf-input-data-class"
        value={values.inputDataClass ?? ''}
        onChange={(e) => update('inputDataClass', e.target.value as StructuredFormValues['inputDataClass'])}
      >
        <option value="">Select…</option>
        {DATA_CLASSES.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      <label htmlFor="sf-input-data-zone">Input data zone</label>
      <p className="field-help">
        Where the data lives today. Zone A — external / public internet (outside the firm&apos;s control).
        Zone B — cloud or managed third party (vendor-hosted under contract, e.g. a cloud LLM API).
        Zone C — internal only (firm-controlled infrastructure — the boundary sensitive data like MNPI must
        not leave).
      </p>
      <select
        id="sf-input-data-zone"
        value={values.inputDataZone ?? ''}
        onChange={(e) => update('inputDataZone', e.target.value as StructuredFormValues['inputDataZone'])}
      >
        <option value="">Select…</option>
        {DATA_ZONES.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      <label htmlFor="sf-model-type">AI model type</label>
      <select
        id="sf-model-type"
        value={values.modelType ?? ''}
        onChange={(e) => update('modelType', e.target.value as StructuredFormValues['modelType'])}
      >
        <option value="">Select…</option>
        {MODEL_TYPES.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      <label htmlFor="sf-autonomy">Autonomy level</label>
      <select
        id="sf-autonomy"
        value={values.autonomyLevel ?? 0}
        onChange={(e) => update('autonomyLevel', Number(e.target.value) as StructuredFormValues['autonomyLevel'])}
      >
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <option key={level} value={level}>
            {AUTONOMY_DESCRIPTIONS[level]}
          </option>
        ))}
      </select>

      <label htmlFor="sf-processing-zone">Processing data zone</label>
      <p className="field-help">
        Where the model itself runs and touches the data — a cloud LLM API is Zone B even if your data lives
        in Zone C. Data crossing from a stricter zone to a looser one is exactly what the policy rules watch
        for.
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
            {v}
          </option>
        ))}
      </select>

      <label htmlFor="sf-action-type">Output action type</label>
      <select
        id="sf-action-type"
        value={values.outputActionType ?? ''}
        onChange={(e) => update('outputActionType', e.target.value as StructuredFormValues['outputActionType'])}
      >
        <option value="">Select…</option>
        {ACTION_TYPES.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      <label htmlFor="sf-exposure">Output exposure</label>
      <p className="field-help">
        Who sees the output: internal-only (one team) · internal-shared (multiple teams) · client-facing ·
        market-facing.
      </p>
      <select
        id="sf-exposure"
        value={values.outputExposure ?? ''}
        onChange={(e) => update('outputExposure', e.target.value as StructuredFormValues['outputExposure'])}
      >
        <option value="">Select…</option>
        {EXPOSURES.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      <label htmlFor="sf-bindingness">Decision bindingness</label>
      <p className="field-help">
        How much weight the output carries: non-binding (informational) · advisory (input to a human
        decision) · material (materially drives real decisions) · binding (directly determines the outcome).
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
            {v}
          </option>
        ))}
      </select>

      <label htmlFor="sf-reversibility">Output reversibility</label>
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
            {v}
          </option>
        ))}
      </select>

      <label htmlFor="sf-decision-type">Decision type (optional)</label>
      <p className="field-help">
        What decision does the output feed? Drives hard lines and tier triggers (e.g. credit/lending →
        Critical; regulatory-reporting → High). Leave blank if none applies.
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
            {v}
          </option>
        ))}
      </select>

      <label htmlFor="sf-hitl">Human in the loop before the system acts? (optional)</label>
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

      <label htmlFor="sf-scale">Output scale</label>
      <p className="field-help">limited — pilot or small population · at_scale — production-wide.</p>
      <select
        id="sf-scale"
        value={values.outputScale ?? ''}
        onChange={(e) => update('outputScale', e.target.value as StructuredFormValues['outputScale'])}
      >
        <option value="">Select…</option>
        {['limited', 'at_scale'].map((v) => (
          <option key={v} value={v}>
            {v}
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
        Replaces a prior model
      </label>

      <fieldset>
        <legend>Jurisdictions</legend>
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
        Build graph
      </button>
    </section>
  );
}
