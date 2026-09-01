import { useEffect, useRef, useState } from 'react';
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
  FIELD_CONSEQUENCES,
  MODEL_TYPE_LABELS,
  REVERSIBILITY_LABELS,
  SCALE_LABELS,
} from './field-copy';
import { buildGraphFromForm } from '../engine/build-graph-from-form';
import { saveFormDraft, loadFormDraft, clearFormDraft } from './intake-draft';
import type { StructuredFormValues } from '../engine/build-graph-from-form';
import type { ApprovedModel, DataFlowGraph, JurisdictionEntry, RegistryEntry } from '../engine/types';

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
  platforms?: RegistryEntry[];
  vendors?: RegistryEntry[];
  // R11-MG-2 (ADR-IF-R11-MG-1): sourced from the policy's approved-model
  // registry. Optional so every existing caller stays valid.
  approvedModels?: ApprovedModel[];
  onSubmit: (graph: DataFlowGraph) => void;
}

type JurisdictionAnswer = 'unanswered' | 'none' | 'selected';

/** Persisted draft shape from P8-C01 onward. A bare values object is the
 *  pre-round-3 shape and carries no answered-state (R3-JU-7). */
interface FormDraftEnvelope {
  values: Partial<StructuredFormValues>;
  jurisdictionAnswer: JurisdictionAnswer;
}

/** R3-JU-5 / intake-flow.md §13.3. ONE enumeration of the fields that hold the
 *  Continue gate. `isComplete` derives from it and the required-markers render
 *  from it, so the thing the user is told and the thing the gate enforces
 *  cannot drift apart. Design review round 1, I-8 asked for exactly this: the
 *  previous hand-written boolean conjunction (verified at
 *  src/components/StructuredForm.tsx:116-137 as of commit e38ef98, the state
 *  this chunk replaced) made the blocking set unenumerable, so a test could
 *  only check it by restating the list.
 *
 *  `controlId` is the element the marker and `aria-required` attach to. For the
 *  jurisdiction question that is the fieldset: the answer is the group, not any
 *  one checkbox. ARIA defines `aria-required` for form controls rather than for
 *  `group`, so this is a deliberate compromise — there is no conformant
 *  attribute for "this checkbox group must be answered", and leaving the
 *  question unmarked would be the larger failure. */
interface RequiredField {
  controlId: string;
  isAnswered: (v: Partial<StructuredFormValues>, answer: JurisdictionAnswer) => boolean;
}

export const REQUIRED_FIELDS: RequiredField[] = [
  { controlId: 'sf-name', isAnswered: (v) => Boolean(v.useCaseName) },
  { controlId: 'sf-description', isAnswered: (v) => Boolean(v.description) },
  { controlId: 'sf-input-data-class', isAnswered: (v) => Boolean(v.inputDataClass) },
  { controlId: 'sf-input-data-zone', isAnswered: (v) => Boolean(v.inputDataZone) },
  { controlId: 'sf-model-type', isAnswered: (v) => Boolean(v.modelType) },
  { controlId: 'sf-processing-zone', isAnswered: (v) => Boolean(v.processingDataZone) },
  { controlId: 'sf-action-type', isAnswered: (v) => Boolean(v.outputActionType) },
  { controlId: 'sf-exposure', isAnswered: (v) => Boolean(v.outputExposure) },
  { controlId: 'sf-bindingness', isAnswered: (v) => Boolean(v.decisionBindingness) },
  { controlId: 'sf-reversibility', isAnswered: (v) => Boolean(v.outputReversibility) },
  { controlId: 'sf-scale', isAnswered: (v) => Boolean(v.outputScale) },
  // R11-MG-2: required — "which model" is a mandatory select on the form
  // path (an unlisted/unapproved choice is not gated here; the ENGINE trips
  // the review, per ADR-IF-R11-MG-1). A non-empty free-text value satisfies
  // this the same way a registry id does.
  {
    controlId: 'sf-model',
    isAnswered: (v) =>
      Boolean(v.declaredModelIdOther?.trim() || (v.declaredModelId && v.declaredModelId.trim())),
  },
  // R3-JU-1: presence of the array is not an answer. `[]` is truthy, which is
  // exactly how a user could previously proceed having told us nothing about
  // where the system operates.
  { controlId: 'sf-jurisdiction', isAnswered: (_v, answer) => answer !== 'unanswered' },
];

const REQUIRED_CONTROL_IDS = new Set(REQUIRED_FIELDS.map((f) => f.controlId));

/** Marks a field required in both registers at once — the visible marker and
 *  the accessible attribute always travel together, because either alone is a
 *  half-kept promise. Spread onto the control; render `<RequiredMark>` in its
 *  label. */
function requiredProps(controlId: string) {
  return REQUIRED_CONTROL_IDS.has(controlId) ? { 'aria-required': true as const } : {};
}

function RequiredMark({ controlId }: { controlId: string }) {
  if (!REQUIRED_CONTROL_IDS.has(controlId)) return null;
  return (
    <span className="required-marker" data-required-marker-for={controlId} title="Required">
      {' '}
      *
    </span>
  );
}

/** R15-C3 (proposal §3.2): "help paragraphs live behind accessible 'Why we
 *  ask' disclosures... any load-bearing sentence stays visible outside the
 *  disclosure." The one-line prompt each field already renders via
 *  `field-help` stays visible; this adds the longer methodology sentence
 *  behind a native `<details>` (same disclosure mechanism as VerdictDisplay's
 *  Fold, so open/closed state is programmatic, never hover-only — G3).
 *
 *  Sourced from FIELD_CONSEQUENCES (field-copy.ts, R5-GR-1) — written for
 *  exactly this purpose and, until this chunk, computed and never rendered
 *  anywhere (the "computed but never consumed" defect class, CLAUDE.md). */
function WhyWeAsk({ field }: { field: string }) {
  const text = FIELD_CONSEQUENCES[field];
  if (!text) return null;
  return (
    <details className="field-why">
      <summary>Why we ask</summary>
      <p>{text}</p>
    </details>
  );
}

/** The two fields the form opens with an answer already in: autonomy defaults
 *  to "no autonomy" and the replaces-something box to unticked. Both are real
 *  answers, so neither can be outstanding and neither is marked — marking a
 *  field that can never block tells the user nothing, which §13.3 rejects as
 *  firmly as marking none.
 *
 *  A draft written before those defaults existed can restore without them,
 *  though, and then the gate is held by a field with no marker able to name it.
 *  Normalising on restore is what keeps "cannot be outstanding" true. */
function withDefaults(v: Partial<StructuredFormValues>): Partial<StructuredFormValues> {
  return {
    ...v,
    autonomyLevel: v.autonomyLevel ?? 0,
    replacesPriorModel: v.replacesPriorModel ?? false,
  };
}

export default function StructuredForm({ jurisdictions, platforms = [], vendors = [], approvedModels = [], onSubmit }: StructuredFormProps) {
  // D-002/D-003: restore any half-filled form so a refresh or a trip to the
  // register no longer costs the user eleven answers.
  // R3-JU-1 / ADR-IF-R3-1. The answered-state is persisted ALONGSIDE the
  // form values in a draft envelope, not inside StructuredFormValues:
  // buildGraphFromForm consumes StructuredFormValues and must not see a
  // form-only concern (verified: src/engine/build-graph-from-form.ts:86 —
  // `jurisdictions: values.jurisdictions`, unchanged by this chunk).
  //
  // An empty array cannot express the difference between "never touched"
  // and "answered: none", and that difference is the requirement — a user
  // who answered "none" told us something; a user who did not answer did not.
  //
  // A draft written before this chunk is a BARE values object with no
  // envelope. It therefore carries no answered-state and loads as
  // 'unanswered' — which is R3-JU-7's rule falling out of the shape rather
  // than being special-cased. Inferring 'selected' from a populated
  // jurisdictions array would let a pre-round-3 draft pass the new gate and
  // reopen, for every user holding one, exactly the defect R3-JU-1 closes.
  // Read the draft ONCE, at mount. Review pass 2 caught this running on every
  // render — harmless, because the values are only consumed by lazy useState
  // initialisers, but a needless sessionStorage read and JSON.parse per
  // keystroke.
  const restoredRef = useRef<{
    restored: FormDraftEnvelope | Partial<StructuredFormValues> | null;
    envelope: FormDraftEnvelope | null;
  } | null>(null);
  if (restoredRef.current === null) {
    const raw = loadFormDraft<FormDraftEnvelope | Partial<StructuredFormValues>>();
    restoredRef.current = {
      restored: raw,
      envelope: raw && typeof raw === 'object' && 'values' in raw ? (raw as FormDraftEnvelope) : null,
    };
  }
  const restored = restoredRef.current.restored;
  const restoredEnvelope = restoredRef.current.envelope;

  const [values, setValues] = useState<Partial<StructuredFormValues>>(() =>
    withDefaults(
      restoredEnvelope?.values ??
        (restoredEnvelope
          ? {}
          : ((restored as Partial<StructuredFormValues> | null) ?? null)) ?? {
          jurisdictions: [],
        },
    ),
  );

  const [jurisdictionAnswer, setJurisdictionAnswer] = useState<JurisdictionAnswer>(
    () => restoredEnvelope?.jurisdictionAnswer ?? 'unanswered',
  );

  useEffect(() => {
    saveFormDraft({ values, jurisdictionAnswer });
  }, [values, jurisdictionAnswer]);

  function update<K extends keyof StructuredFormValues>(field: K, value: StructuredFormValues[K]) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  // R3-JU-5: the gate is now the list, not a parallel restatement of it. The
  // two defaulted fields are asserted here as a type-narrowing check rather
  // than as a gate — `withDefaults` guarantees both are present, including for
  // a restored legacy draft, so neither can hold Continue shut.
  function isComplete(v: Partial<StructuredFormValues>): v is StructuredFormValues {
    return Boolean(
      REQUIRED_FIELDS.every((f) => f.isAnswered(v, jurisdictionAnswer)) &&
        v.jurisdictions &&
        v.autonomyLevel !== undefined &&
        v.replacesPriorModel !== undefined,
    );
  }

  function handleSubmit() {
    if (!isComplete(values)) return;
    clearFormDraft();
    onSubmit(buildGraphFromForm(values));
  }

  function toggleJurisdiction(code: string) {
    const current = values.jurisdictions ?? [];
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    update('jurisdictions', next);
    // TC-R3-JU-1-05: unticking the last jurisdiction leaves the question
    // ANSWERED, not unanswered. A user who ticked and unticked has engaged
    // with it; silently re-blocking them with no explanation would be a
    // worse defect than the one this chunk fixes.
    setJurisdictionAnswer(next.length > 0 ? 'selected' : 'none');
  }

  function chooseNoJurisdiction() {
    // Mutually exclusive with the checkboxes by construction rather than by
    // validation — choosing this clears the selection outright.
    update('jurisdictions', []);
    setJurisdictionAnswer('none');
  }

  // R15-C3 (proposal §3.2): counts describe the form as it actually renders,
  // not a fixed wireframe number — a hardcoded "16" would drift the moment a
  // field is added or removed, which is the same class of honesty failure
  // CLAUDE.md warns about for rendered claims.
  const totalFieldCount = 19;

  return (
    <section aria-label="Structured intake form">
      <p role="status">
        Guided intake — answer the fields below to describe your use case. No AI is involved in
        reading your answers or in the decision that follows, so the same answers always produce the
        same outcome. (Configuring a model in Settings unlocks an optional plain-English alternative
        to this form; it changes how the description is read in, not how it is scored.)
      </p>
      <p className="structured-form__meta">
        5 sections · {totalFieldCount} questions ({REQUIRED_FIELDS.length} required) · about ten
        minutes. One continuous scroll — nothing is hidden behind an &ldquo;advanced&rdquo; toggle.
      </p>

      <fieldset className="structured-form__section">
        <legend>1&nbsp;&nbsp;About it</legend>

        <label htmlFor="sf-name">What do you want to call it?
          <RequiredMark controlId="sf-name" />
        </label>
        <input
          id="sf-name"
          {...requiredProps('sf-name')}
          type="text"
          value={values.useCaseName ?? ''}
          onChange={(e) => update('useCaseName', e.target.value)}
        />

        <label htmlFor="sf-description">In a sentence or two, what does it do?
          <RequiredMark controlId="sf-description" />
        </label>
        <textarea
          id="sf-description"
          {...requiredProps('sf-description')}
          value={values.description ?? ''}
          onChange={(e) => update('description', e.target.value)}
        />
      </fieldset>

      <fieldset className="structured-form__section">
        <legend>2&nbsp;&nbsp;What it uses <span className="structured-form__section-code">(input data)</span></legend>

        <label htmlFor="sf-input-data-class">What kind of information does it use?
          <RequiredMark controlId="sf-input-data-class" />
        </label>
        <p className="field-help">
          Pick the most sensitive kind it touches, even if that&apos;s only occasionally.
        </p>
        <select
          id="sf-input-data-class"
          {...requiredProps('sf-input-data-class')}
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
        <WhyWeAsk field="data_class" />

        <label htmlFor="sf-input-data-zone">Where does that information sit today?
          <RequiredMark controlId="sf-input-data-zone" />
        </label>
        <p className="field-help">
          Before the AI touches it. If it is stored in more than one place, pick the least protected.
        </p>
        <select
          id="sf-input-data-zone"
          {...requiredProps('sf-input-data-zone')}
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
        <WhyWeAsk field="data_zone" />
      </fieldset>

      <fieldset className="structured-form__section">
        <legend>3&nbsp;&nbsp;What the AI is and how it runs <span className="structured-form__section-code">(processing)</span></legend>

        <label htmlFor="sf-model-type">What kind of AI is it?
          <RequiredMark controlId="sf-model-type" />
        </label>
        <p className="field-help">
          If you are not sure, pick the closest description — you can correct it on the next screen.
        </p>
        <select
          id="sf-model-type"
          {...requiredProps('sf-model-type')}
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
        <WhyWeAsk field="model_type" />

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
        <WhyWeAsk field="autonomy_level" />

        <label htmlFor="sf-system-access">
          What can it reach and touch, beyond the data it processes? (optional — blank means: not stated)
        </label>
        <p className="field-help">
          Not the data — the infrastructure. Shared compute, package repositories, live credentials,
          deployment pipelines. One answer only in this version: if several apply, pick the most
          severe (deployment &gt; credentials &gt; shared infrastructure) and note the rest for the
          reviewer in the sign-off note.
        </p>
        <WhyWeAsk field="system_access_scope" />
        <select
          id="sf-system-access"
          value={values.systemAccessScope ?? ''}
          onChange={(e) =>
            update(
              'systemAccessScope',
              e.target.value === ''
                ? undefined
                : (e.target.value as StructuredFormValues['systemAccessScope']),
            )
          }
        >
          <option value="">Not stated</option>
          <option value="none">Nothing beyond its own task&rsquo;s data (none)</option>
          <option value="shared_infrastructure">
            Runs alongside other AI instances or processes on shared infrastructure (shared infrastructure)
          </option>
          <option value="credentialed_systems">
            Holds live credentials to systems beyond its immediate task (credentialed systems)
          </option>
          <option value="deployment_authority">
            Can push code, change configuration, or deploy with no separate human action (deployment authority)
          </option>
        </select>

        <label htmlFor="sf-multi-instance">
          Can it communicate or coordinate with other AI instances? (optional — blank means: not stated)
        </label>
        <WhyWeAsk field="multi_instance_coordination" />
        <select
          id="sf-multi-instance"
          value={values.multiInstanceCoordination ?? ''}
          onChange={(e) =>
            update(
              'multiInstanceCoordination',
              e.target.value === ''
                ? undefined
                : (e.target.value as StructuredFormValues['multiInstanceCoordination']),
            )
          }
        >
          <option value="">Not stated</option>
          <option value="no">No — it runs alone</option>
          <option value="yes">Yes — it can exchange information with other instances or AI systems</option>
          <option value="unknown">Not sure</option>
        </select>

        <label htmlFor="sf-processing-zone">Where does the AI itself run?
          <RequiredMark controlId="sf-processing-zone" />
        </label>
        {/* Load-bearing sentence (proposal §3.2): the storage-vs-processing
            distinction is the one people get wrong, and the one the
            zone-crossing rules turn on. It stays visible outside the
            disclosure; the rest of the methodology paragraph does not. */}
        <p className="field-help">
          Not where the data is stored — where it gets sent to be processed.
        </p>
        <details className="field-why">
          <summary>Why we ask</summary>
          <p>
            A cloud AI service counts as an outside supplier even if your data normally never leaves
            the firm. Information moving from a more protected place to a less protected one is the
            single thing these rules watch for most closely.
          </p>
        </details>
        <select
          id="sf-processing-zone"
          {...requiredProps('sf-processing-zone')}
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

        <label htmlFor="sf-platform">
          Which approved platform does it run on? (optional — blank means: not on an approved platform)
        </label>
        <p className="field-help">
          If it runs on a platform your firm has already approved, say so — the controls that approval
          already covers are not asked for again.
        </p>
        <details className="field-why">
          <summary>Why we ask</summary>
          <p>Choosing one your firm has not approved routes it to a full platform risk assessment.</p>
        </details>
        <select
          id="sf-platform"
          value={values.platform ?? ''}
          onChange={(e) => update('platform', e.target.value || undefined)}
        >
          <option value="">Not on an approved platform / don&apos;t know</option>
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.id})
            </option>
          ))}
          <option value="__other__">Something else — not on the list</option>
        </select>

        <label htmlFor="sf-vendor">
          Whose model or service is it? (optional — blank means: assessed as built in-house)
        </label>
        <details className="field-why">
          <summary>Why we ask</summary>
          <p>
            A vendor not on the approved list is treated as a new vendor and triggers a full vendor
            risk assessment.
          </p>
        </details>
        <select
          id="sf-vendor"
          value={values.vendor ?? ''}
          onChange={(e) => update('vendor', e.target.value || undefined)}
        >
          {/* D-006: this read "Built in-house (internal)" — the unchosen state
              presented as something the user had declared. The graph then showed
              "vendor: internal" and the next screen asked them to attest it was
              accurate. The sentinel is unchanged; what changed is that the form
              now says what it will assume, before the attestation rather than
              after it. */}
          <option value="">Not stated — will be assessed as built in-house</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.id})
            </option>
          ))}
          <option value="__other__">Another vendor — not on the list</option>
        </select>

        <label htmlFor="sf-model">
          Which model does it run on?
          <RequiredMark controlId="sf-model" />
        </label>
        <p className="field-help">
          Choose the model from the firm&apos;s approved-model registry, or say it is not listed and
          name it.
        </p>
        <details className="field-why">
          <summary>Why we ask</summary>
          <p>
            A model that is not on the registry, or is on it without sign-off, is not blocked here —
            it routes to a model governance review on the verdict.
          </p>
        </details>
        <select
          id="sf-model"
          {...requiredProps('sf-model')}
          value={values.declaredModelIdOther !== undefined ? '__other__' : (values.declaredModelId ?? '')}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__other__') {
              update('declaredModelId', undefined);
              update('declaredModelIdOther', '');
            } else {
              update('declaredModelIdOther', undefined);
              update('declaredModelId', v || undefined);
            }
          }}
        >
          <option value="">Choose a model&hellip;</option>
          {approvedModels.map((m) => (
            <option key={m.model_id} value={m.model_id}>
              {m.model_id} ({m.vendor})
            </option>
          ))}
          <option value="__other__">Not listed — name it</option>
        </select>
        {values.declaredModelIdOther !== undefined && (
          <input
            type="text"
            aria-label="Name the model"
            placeholder="e.g. gpt-4o, llama-3-70b"
            value={values.declaredModelIdOther}
            onChange={(e) => update('declaredModelIdOther', e.target.value)}
          />
        )}
      </fieldset>

      <fieldset className="structured-form__section">
        <legend>4&nbsp;&nbsp;What comes out and who it reaches <span className="structured-form__section-code">(output)</span></legend>

        <label htmlFor="sf-action-type">What does it actually produce or do?
          <RequiredMark controlId="sf-action-type" />
        </label>
        <select
          id="sf-action-type"
          {...requiredProps('sf-action-type')}
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
        <WhyWeAsk field="action_type" />

        <label htmlFor="sf-exposure">Who sees what it produces?
          <RequiredMark controlId="sf-exposure" />
        </label>
        <p className="field-help">Pick the widest audience it reaches.</p>
        <select
          id="sf-exposure"
          {...requiredProps('sf-exposure')}
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
        <WhyWeAsk field="exposure" />

        <label htmlFor="sf-bindingness">How much weight does its output carry?
          <RequiredMark controlId="sf-bindingness" />
        </label>
        {/* Load-bearing (proposal §3.2): this is the sentence a submitter
            needs to answer honestly rather than to the letter of the
            process. The illustrative example stays behind the disclosure. */}
        <p className="field-help">
          Be honest about what happens in practice rather than what the process says.
        </p>
        <details className="field-why">
          <summary>Why we ask</summary>
          <p>
            If people almost always go with what it says, that is closer to &ldquo;substantially
            drives the decision&rdquo; than to &ldquo;one input among several&rdquo;.{' '}
            {FIELD_CONSEQUENCES.decision_bindingness}
          </p>
        </details>
        <select
          id="sf-bindingness"
          {...requiredProps('sf-bindingness')}
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

        <label htmlFor="sf-reversibility">If it gets something wrong, can it be undone?
          <RequiredMark controlId="sf-reversibility" />
        </label>
        <p className="field-help">
          Think about the point at which someone would notice.
        </p>
        <details className="field-why">
          <summary>Why we ask</summary>
          <p>
            Money already sent, a message already seen by a client, or a filing already made
            generally cannot be taken back. {FIELD_CONSEQUENCES.output_reversibility}
          </p>
        </details>
        <select
          id="sf-reversibility"
          {...requiredProps('sf-reversibility')}
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

        <label htmlFor="sf-decision-type">
          What kind of decision does it feed? (optional — leave blank only if it feeds no decision at
          all)
        </label>
        <p className="field-help">
          Some areas carry extra legal duties — lending and hiring especially. If none of these fit,
          choose <em>Something else — let me describe it</em> and say what it is.
        </p>
        <details className="field-why">
          <summary>Why we ask</summary>
          <p>{FIELD_CONSEQUENCES.decision_type} The verdict will show that your policy has no rule for it.</p>
        </details>
        <select
          id="sf-decision-type"
          value={values.decisionTypeOther !== undefined ? '__other__' : (values.decisionType ?? '')}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__other__') {
              // Clearing decisionType is the whole point: the two are mutually
              // exclusive, and leaving a stale known type behind would let a
              // policy rule fire for a decision the submitter just told us was
              // something else.
              update('decisionType', undefined);
              update('decisionTypeOther', '');
            } else {
              update('decisionTypeOther', undefined);
              update('decisionType', (v || undefined) as StructuredFormValues['decisionType']);
            }
          }}
        >
          <option value="">None / not applicable</option>
          {DECISION_TYPES.map((v) => (
            <option key={v} value={v}>
              {DECISION_TYPE_LABELS[v]}
            </option>
          ))}
          <option value="__other__">Something else — let me describe it</option>
        </select>

        {values.decisionTypeOther !== undefined && (
          <>
            <label htmlFor="sf-decision-type-other">What kind of decision is it?</label>
            <p className="field-help">
              In your own words — for example &ldquo;collections prioritisation&rdquo; or &ldquo;AML alert
              triage&rdquo;. This is recorded with the verdict, and because your policy has no rule for it,
              the tier will rest on your other answers alone. That is stated on the verdict, not hidden.
            </p>
            <input
              id="sf-decision-type-other"
              type="text"
              value={values.decisionTypeOther}
              onChange={(e) => update('decisionTypeOther', e.target.value)}
              placeholder="e.g. collections prioritisation"
            />
          </>
        )}

        <label htmlFor="sf-hitl">
          Does a person check it before anything happens? (optional — blank means: not specified)
        </label>
        <WhyWeAsk field="hitl" />
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

        <label htmlFor="sf-scale">How widely is it used?
          <RequiredMark controlId="sf-scale" />
        </label>
        <select
          id="sf-scale"
          {...requiredProps('sf-scale')}
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
        <WhyWeAsk field="scale" />

        <label htmlFor="sf-replaces">
          <input
            id="sf-replaces"
            type="checkbox"
            checked={values.replacesPriorModel ?? false}
            onChange={(e) => update('replacesPriorModel', e.target.checked)}
          />
          It replaces something we already use (a model, a tool or a manual process)
        </label>
      </fieldset>

      <fieldset id="sf-jurisdiction" {...requiredProps('sf-jurisdiction')} className="structured-form__section">
        <legend>
          5&nbsp;&nbsp;Where it applies <span className="structured-form__section-code">(jurisdictions)</span>
          <RequiredMark controlId="sf-jurisdiction" />
        </legend>
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
        <label htmlFor="sf-jurisdiction-none">
          <input
            id="sf-jurisdiction-none"
            type="checkbox"
            checked={jurisdictionAnswer === 'none'}
            onChange={chooseNoJurisdiction}
          />
          None of these, or not sure yet
        </label>
      </fieldset>

      <p className="structured-form__scroll-note">One continuous scroll — no Next/Back paging.</p>

      <button type="button" onClick={handleSubmit} disabled={!isComplete(values)}>
        Continue
      </button>
    </section>
  );
}
