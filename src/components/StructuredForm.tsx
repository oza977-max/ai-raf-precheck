import { useEffect, useRef, useState } from 'react';
import {
  ACCESS_SCOPE_REFUSAL_TEXT,
  INTRO_TEXT,
  describeAssumptions,
  findQuestion,
  neutralPlatformLabel,
  neutralSupplierLabel,
} from './plain-copy';
import type { Assumption, PlainAnswers, PlainOption, QuestionId } from './plain-copy';
import { plainAnswersToFormValues, platformZoneOptionKeys, resolveAccessScopeAnswer } from '../engine/plain-intake';
import { buildGraphFromForm } from '../engine/build-graph-from-form';
import { saveFormDraft, loadFormDraft, clearFormDraft, probeLegacyFormDraft } from './intake-draft';
import type { DataFlowGraph, PolicyFile } from '../engine/types';

// R16-B (UC-8, UC-10, UC-11; build/prompts/R16.md v2.1 §2.2). Rule 4
// (cross-cutting.md §7): presentation-only — every answer->graph decision
// lives in plainAnswersToFormValues() (src/engine/plain-intake.ts), this
// component only renders questions and collects answers.
//
// Replaces the field-by-field form entirely (UC-3a amendment, 2026-10-02):
// no question or option here names an engine term or code — data class,
// zone, autonomy level, bindingness, model type, tier, track (principle 1,
// §0). The situational questions below are the tested v2.1 set; see
// grounding/PACK-AUTHORING.md's sibling note for why the wording is not
// paraphrased from the contract.
//
// IMPORTANT: SingleSelect/MultiSelect/FreeText/RequiredMark are declared at
// MODULE scope, not nested inside StructuredForm(). A component defined
// inside another component's render body gets a NEW function identity every
// render, which React treats as a different component TYPE — so it tears
// down and recreates the DOM subtree (including every input) on every
// keystroke, dropping focus after the first character. That is a real bug
// this chunk hit directly (every answer field went blank after one
// keystroke in testing) and fixed by hoisting these out.

interface StructuredFormProps {
  policy: PolicyFile;
  // W-1 (R16-W §1, D-67): the description typed on the very first screen.
  // Question 2 starts with it (editable) unless the form's own in-progress
  // draft or `initialAnswers` (W-4) already holds a question-2 value — see
  // the precedence comment on the Q2 FreeText render below.
  initialDescription?: string;
  // W-4 (R16-W §1, D-70): "Change an answer" and the form-path Back both
  // need the form to reopen FILLED IN, not blank. Precedence on mount: the
  // form's own saved draft (in-progress edits) -> initialAnswers -> blank.
  initialAnswers?: PlainAnswers;
  // W-4: the raw answers travel with the graph/assumptions so the caller
  // (IntakeFlow) can carry them on the reducer state — plainAnswersToFormValues()
  // is already computed here; passing `answers` back avoids recomputing it.
  onSubmit: (graph: DataFlowGraph, assumptions: Assumption[], answers: PlainAnswers) => void;
}

function toArray(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** D-23: a platform or supplier without a plain_name must never fall back
 *  to its raw registry `name` (which may itself carry the bare `[FIRM]`
 *  placeholder) — it gets this neutral, numbered label instead. */
function dynamicOptions(
  entries: { id: string; plain_name?: string }[],
  neutral: (n: number) => string,
): PlainOption[] {
  return entries.map((e, i) => ({ key: e.id, text: e.plain_name ?? neutral(i + 1) }));
}

function RequiredMark({ id, requiredIds }: { id: QuestionId; requiredIds: QuestionId[] }) {
  return requiredIds.includes(id) ? (
    <span className="required-marker" title="Required">
      {' '}
      *
    </span>
  ) : null;
}

interface QuestionProps {
  id: QuestionId;
  extraOptions?: PlainOption[];
  /** Where `extraOptions` are spliced relative to the question's own static
   *  options — undefined prepends (the common case: every dynamic list in
   *  §2.2 other than Q3's sits before or after the WHOLE static list, never
   *  in the middle). Q3 is the one exception: its platform option is
   *  documented as option (d), between the static (c) and (e) — spliced at
   *  this index into `question.options` instead of prepended, so the
   *  rendered order matches the newcomer-tested a/b/c/d/e/f sequence. */
  extraOptionsAtIndex?: number;
  /** W-9 (R16-W §1, D-79): restricts a STATIC option list down to a subset
   *  by key, in the question's own declared order — Q3platformZone's four
   *  options are all static text; only WHICH of them show depends on the
   *  chosen platform's allowed zones (plain-intake.ts's
   *  platformZoneOptionKeys()). Undefined (every other question) renders
   *  the full static list, unfiltered — the pre-existing behaviour. */
  restrictToKeys?: string[];
  requiredIds: QuestionId[];
  answers: PlainAnswers;
  onSingle: (id: QuestionId, key: string) => void;
  onMulti: (id: QuestionId, key: string) => void;
  onText: (id: QuestionId, text: string) => void;
}

function mergeOptions(base: PlainOption[], extra: PlainOption[], atIndex?: number): PlainOption[] {
  if (extra.length === 0) return base;
  if (atIndex === undefined) return [...extra, ...base];
  return [...base.slice(0, atIndex), ...extra, ...base.slice(atIndex)];
}

function SingleSelect({
  id,
  extraOptions = [],
  extraOptionsAtIndex,
  restrictToKeys,
  requiredIds,
  answers,
  onSingle,
}: QuestionProps) {
  const question = findQuestion(id);
  if (!question) return null;
  const baseOptions = restrictToKeys ? question.options.filter((o) => restrictToKeys.includes(o.key)) : question.options;
  const options = mergeOptions(baseOptions, extraOptions, extraOptionsAtIndex);
  return (
    <fieldset className="plain-form__question" aria-required={requiredIds.includes(id) || undefined}>
      <legend>
        {question.text}
        <RequiredMark id={id} requiredIds={requiredIds} />
      </legend>
      {question.help && <p className="field-help">{question.help}</p>}
      {options.map((o) => (
        <label key={o.key} className="plain-form__option">
          <input
            type="radio"
            name={`pf-${id}`}
            value={o.key}
            checked={answers[id] === o.key}
            onChange={() => onSingle(id, o.key)}
          />
          {o.text}
        </label>
      ))}
    </fieldset>
  );
}

function MultiSelect({ id, extraOptions = [], requiredIds, answers, onMulti }: QuestionProps) {
  const question = findQuestion(id);
  if (!question) return null;
  const options = [...extraOptions, ...question.options];
  const current = toArray(answers[id]);
  return (
    <fieldset className="plain-form__question" aria-required={requiredIds.includes(id) || undefined}>
      <legend>
        {question.text}
        <RequiredMark id={id} requiredIds={requiredIds} />
      </legend>
      {question.help && <p className="field-help">{question.help}</p>}
      {options.map((o) => (
        <label key={o.key} className="plain-form__option">
          <input type="checkbox" checked={current.includes(o.key)} onChange={() => onMulti(id, o.key)} />
          {o.text}
        </label>
      ))}
    </fieldset>
  );
}

function FreeText({
  id,
  multiline = false,
  requiredIds,
  answers,
  onText,
}: QuestionProps & { multiline?: boolean }) {
  const question = findQuestion(id);
  if (!question) return null;
  const value = (answers[id] as string | undefined) ?? '';
  const inputId = `pf-${id}`;
  return (
    <div className="plain-form__question">
      <label htmlFor={inputId}>
        {question.text}
        <RequiredMark id={id} requiredIds={requiredIds} />
      </label>
      {question.help && <p className="field-help">{question.help}</p>}
      {multiline ? (
        <textarea id={inputId} value={value} onChange={(e) => onText(id, e.target.value)} />
      ) : (
        <input id={inputId} type="text" value={value} onChange={(e) => onText(id, e.target.value)} />
      )}
    </div>
  );
}

export default function StructuredForm({ policy, initialDescription, initialAnswers, onSubmit }: StructuredFormProps) {
  const platformOptions = dynamicOptions(policy.platforms ?? [], neutralPlatformLabel);
  const supplierOptions = dynamicOptions(
    (policy.vendors ?? []).filter((v) => (v.kind ?? 'supplier') === 'supplier'),
    neutralSupplierLabel,
  );
  const companyAssistantOptions = dynamicOptions(
    (policy.vendors ?? []).filter((v) => v.kind === 'company_assistant'),
    neutralSupplierLabel,
  );
  const jurisdictionOptions: PlainOption[] = (policy.jurisdictions ?? []).map((j) => ({
    key: j.code,
    text: j.name,
  }));

  // D-41: probe the OLD draft key once, before first paint, and never
  // again — an incompatible shape must be reported once and then be gone,
  // not re-detected on every render.
  const legacyRef = useRef<boolean | null>(null);
  if (legacyRef.current === null) legacyRef.current = probeLegacyFormDraft();
  const [legacyDraftFound] = useState(legacyRef.current);

  // W-1/W-4 (R16-W §1, D-67/D-70). Precedence on mount: the form's own
  // saved draft (in-progress edits a person is actively making) ->
  // initialAnswers (a resubmission via "Change an answer" or Back) ->
  // blank. The draft wins over initialAnswers because it is STRICTLY newer
  // information about what the person was doing on this exact screen —
  // initialAnswers is a snapshot from the moment they last left it.
  const restoredRef = useRef<PlainAnswers | null>(null);
  if (restoredRef.current === null) {
    const draft = loadFormDraft<PlainAnswers>();
    restoredRef.current = draft ?? initialAnswers ?? {};
  }
  const [answers, setAnswers] = useState<PlainAnswers>(() => {
    // W-1: question 2 starts with the description typed on the very first
    // screen, UNLESS the restored value (draft or initialAnswers) already
    // holds one — editing Q2 from then on is what carries the description
    // forward (the form's own words, not the first screen's, once edited).
    if (restoredRef.current!['2'] !== undefined || !initialDescription) return restoredRef.current!;
    return { ...restoredRef.current!, '2': initialDescription };
  });

  useEffect(() => {
    saveFormDraft(answers);
  }, [answers]);

  function setSingle(id: QuestionId, key: string) {
    setAnswers((prev) => {
      const next: PlainAnswers = { ...prev, [id]: key };
      // Conditional follow-ups are cleared when their trigger changes
      // (§2.2 Details: "follow-ups are required when shown and cleared
      // when their trigger changes").
      if (id === '3') {
        delete next['3a'];
        delete next['3aWhich'];
        delete next['3supplier'];
        delete next['3supplierName'];
        // W-9: a platform-zone answer for one platform must never survive
        // onto a different Q3 answer, including a different platform.
        delete next['3platformZone'];
      }
      if (id === '3a') {
        delete next['3aWhich'];
      }
      if (id === '3supplier' && key !== 'not-on-list') {
        delete next['3supplierName'];
      }
      if (id === '4') {
        if (key !== 'score') delete next['4a'];
        if (key !== 'agentic' && key !== 'not-sure') {
          delete next['13'];
          delete next['14'];
        }
      }
      if (id === '6') {
        if (!['answers', 'drafts', 'suggests'].includes(key)) delete next['6a'];
        if (!['acts-reviewed', 'acts-bounded', 'acts-alone'].includes(key)) delete next['6b'];
      }
      if (id === '8' && key !== 'other') {
        delete next['8other'];
      }
      return next;
    });
  }

  function setText(id: QuestionId, text: string) {
    setAnswers((prev) => ({ ...prev, [id]: text }));
  }

  function toggleMulti(id: QuestionId, key: string) {
    setAnswers((prev) => {
      const current = toArray(prev[id]);
      let next: string[];
      if (id === '13') {
        if (key === 'none') {
          next = current.includes('none') ? [] : ['none'];
        } else {
          const withoutNone = current.filter((k) => k !== 'none');
          next = withoutNone.includes(key) ? withoutNone.filter((k) => k !== key) : [...withoutNone, key];
        }
      } else {
        // CR6-06e: a stale tick can't be unticked (it isn't rendered), so
        // any toggle drops keys that are no longer current options — the
        // person re-picks from what is on screen.
        const valid = multiSelectValidKeys(id);
        const live = current.filter((k) => valid.includes(k));
        next = live.includes(key) ? live.filter((k) => k !== key) : [...live, key];
      }
      return { ...prev, [id]: next };
    });
  }

  // ---- visibility ----
  const q3 = typeof answers['3'] === 'string' ? (answers['3'] as string) : undefined;
  const showQ3Supplier = q3 === 'supplier-feature' || q3 === 'specialist-product';
  const showQ3Model = q3 === 'outside-assistant' || showQ3Supplier;
  const showQ3a = q3 === 'outside-assistant';
  const show3supplierName = answers['3supplier'] === 'not-on-list';
  const show3aWhich = answers['3a'] === 'firm-account' && companyAssistantOptions.length > 1;
  // W-9 (D-79): the matched platform, if Q3's answer is one of the dynamic
  // platform ids rather than a static option key. A platform allowing only
  // one zone keeps today's mapping with no follow-up.
  const matchedPlatform = (policy.platforms ?? []).find((p) => p.id === q3);
  const showQ3platformZone = Boolean(matchedPlatform) && (matchedPlatform!.approved_envelope.data_zones?.length ?? 0) > 1;
  const q3platformZoneKeys = matchedPlatform ? platformZoneOptionKeys(matchedPlatform) : [];
  const q4 = typeof answers['4'] === 'string' ? (answers['4'] as string) : undefined;
  const showQ4a = q4 === 'score';
  const isAgentic = q4 === 'agentic' || q4 === 'not-sure';
  const q6 = typeof answers['6'] === 'string' ? (answers['6'] as string) : undefined;
  const showQ6a = q6 !== undefined && ['answers', 'drafts', 'suggests'].includes(q6);
  const showQ6b = q6 !== undefined && ['acts-reviewed', 'acts-bounded', 'acts-alone'].includes(q6);
  const showQ8other = answers['8'] === 'other';

  // ---- required-ness (§2.2 Details: "required = an option chosen") ----
  // F-8 (DR7-08): Q13 is answered only when its ticks resolve through the
  // single checker — the same function the mapping itself calls. A tick
  // list that maps to nothing real (a stale draft, an unexpected value)
  // must never silently count as answered here and reach the engine as
  // "not stated" — that was the DR7-08 bug.
  const q13Result = resolveAccessScopeAnswer(toArray(answers['13']));
  // CR6-06: the current, valid key set for a single-select question — its
  // own static options PLUS whatever policy-driven options this render
  // actually spliced in (Q3's platforms, Q3supplier's suppliers, Q3aWhich's
  // company assistants), or Q3platformZone's own platform-restricted subset.
  // A value outside this set (a stale draft, a registry entry since
  // renamed or removed, an option an older build offered) is not one of
  // the choices on screen right now, so it must not count as answered.
  function singleSelectValidKeys(id: QuestionId): string[] {
    if (id === '3platformZone') return q3platformZoneKeys;
    const staticKeys = findQuestion(id)?.options.map((o) => o.key) ?? [];
    if (id === '3') return [...staticKeys, ...platformOptions.map((o) => o.key)];
    if (id === '3supplier') return [...staticKeys, ...supplierOptions.map((o) => o.key)];
    if (id === '3aWhich') return [...staticKeys, ...companyAssistantOptions.map((o) => o.key)];
    return staticKeys;
  }
  // CR6-06e: a multi-select's current keys — its static options plus the
  // policy-driven extras the render splices in (Q11's jurisdictions). Q13
  // keeps its own checker (resolveAccessScopeAnswer).
  function multiSelectValidKeys(id: QuestionId): string[] {
    const staticKeys = findQuestion(id)?.options.map((o) => o.key) ?? [];
    if (id === '11') return [...jurisdictionOptions.map((o) => o.key), ...staticKeys];
    return staticKeys;
  }
  function isAnswered(id: QuestionId): boolean {
    if (id === '13') return q13Result.ok;
    const q = findQuestion(id);
    if (q?.multi) {
      const ticks = toArray(answers[id]);
      const valid = multiSelectValidKeys(id);
      return ticks.length > 0 && ticks.every((k) => valid.includes(k));
    }
    if (q?.freeText) return Boolean((answers[id] as string | undefined)?.trim());
    const value = answers[id];
    if (value === undefined || value === '') return false;
    // F-8/DR7-08's sibling rule for single-select: counted only when the
    // stored value names one of THIS render's current options — static or
    // policy-driven — never merely "is a non-empty string".
    return singleSelectValidKeys(id).includes(String(value));
  }

  const requiredIds: QuestionId[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  if (showQ3Supplier) requiredIds.push('3supplier');
  if (showQ3platformZone) requiredIds.push('3platformZone');
  if (showQ3a) requiredIds.push('3a');
  if (show3aWhich) requiredIds.push('3aWhich');
  if (showQ4a) requiredIds.push('4a');
  if (showQ6a) requiredIds.push('6a');
  if (showQ6b) requiredIds.push('6b');
  if (showQ8other) requiredIds.push('8other');
  if (isAgentic) requiredIds.push('13', '14');

  const isComplete = requiredIds.every(isAnswered);

  function handleSubmit() {
    if (!isComplete) return;
    const { values, assumptions } = plainAnswersToFormValues(answers, policy);
    clearFormDraft();
    // R16-F §5 (DR7-06): the engine returns assumption REFERENCES; this is
    // the one, immediate conversion to the worded `Assumption[]` onSubmit's
    // callers (and the reducer state they carry) still expect.
    // B-15: the engine no longer mints its own timestamp — this component
    // is presentation-only, not the engine, so minting it here (React/I-O
    // territory) rather than inside src/engine/* is exactly where
    // cross-cutting.md §7 Rule 1 puts it.
    onSubmit(buildGraphFromForm(values, new Date().toISOString()), describeAssumptions(assumptions), answers);
  }

  // Bundles the props every question renderer needs, so each call site below
  // stays a one-liner.
  const qp = { requiredIds, answers, onSingle: setSingle, onMulti: toggleMulti, onText: setText };

  return (
    <section aria-label="Structured intake form">
      {/* W-2 (R16-W §1, D-68): the old "Guided intake — answer the fields
          below…" paragraph (and its Settings parenthetical) duplicated the
          approved R16 intro below it — two stacked introductions on a
          newcomer's first screen of the form. Deleted; the approved intro
          keeps its exact words, with one new sentence added after it. */}
      <p className="plain-form__intro">{INTRO_TEXT}</p>
      <p className="plain-form__intro">
        No AI reads your answers or makes the decision, so the same answers always get the same
        result.
      </p>
      {legacyDraftFound && (
        <p role="status" className="plain-form__legacy-draft">
          Your saved draft was from an older version of this form and couldn&rsquo;t be reused — please
          start again.
        </p>
      )}

      <fieldset className="structured-form__section">
        <legend>About it</legend>
        <FreeText id="1" {...qp} />
        <FreeText id="2" multiline {...qp} />
      </fieldset>

      <fieldset className="structured-form__section">
        <legend>Where it comes from</legend>
        <SingleSelect id="3" extraOptions={platformOptions} extraOptionsAtIndex={3} {...qp} />
        {showQ3platformZone && <SingleSelect id="3platformZone" restrictToKeys={q3platformZoneKeys} {...qp} />}
        {showQ3Supplier && <SingleSelect id="3supplier" extraOptions={supplierOptions} {...qp} />}
        {show3supplierName && <FreeText id="3supplierName" {...qp} />}
        {showQ3Model && <FreeText id="3model" {...qp} />}
        {showQ3a && <SingleSelect id="3a" {...qp} />}
        {show3aWhich && <SingleSelect id="3aWhich" extraOptions={companyAssistantOptions} {...qp} />}
      </fieldset>

      <fieldset className="structured-form__section">
        <legend>What it does</legend>
        <SingleSelect id="4" {...qp} />
        {showQ4a && <SingleSelect id="4a" {...qp} />}
        <MultiSelect id="5" {...qp} />
        <SingleSelect id="6" {...qp} />
        {showQ6a && <SingleSelect id="6a" {...qp} />}
        {showQ6b && <SingleSelect id="6b" {...qp} />}
        <SingleSelect id="7" {...qp} />
      </fieldset>

      <fieldset className="structured-form__section">
        <legend>Decisions and safeguards</legend>
        <SingleSelect id="8" {...qp} />
        {showQ8other && <FreeText id="8other" {...qp} />}
        <SingleSelect id="9" {...qp} />
        <SingleSelect id="12" {...qp} />
        {isAgentic && <MultiSelect id="13" {...qp} />}
        {/* F-8 (DR7-08): a refusal from the single checker becomes a
            validation message here, never a silent "not stated". Shown only
            while something is ticked: nothing ticked (untouched, or every
            tick removed) is just "not answered yet", which the required
            marker already says. Plain words, never the engine's reason. */}
        {isAgentic && toArray(answers['13']).length > 0 && !q13Result.ok && (
          <p role="alert" className="field-help field-help--error">
            {ACCESS_SCOPE_REFUSAL_TEXT}
          </p>
        )}
        {isAgentic && <SingleSelect id="14" {...qp} />}
      </fieldset>

      <fieldset className="structured-form__section">
        <legend>Scope and countries</legend>
        <SingleSelect id="10" {...qp} />
        <MultiSelect id="11" extraOptions={jurisdictionOptions} {...qp} />
      </fieldset>

      <p className="structured-form__scroll-note">One continuous scroll — no Next/Back paging.</p>

      <button type="button" onClick={handleSubmit} disabled={!isComplete}>
        Continue
      </button>
    </section>
  );
}

// Exported for StructuredForm.test.tsx and the parity test only — not part
// of the component's own render path. Lets both resolve the dynamic
// platform/vendor/jurisdiction option lists the same way the component
// does, without duplicating the policy-reading logic above.
export function buildDynamicOptions(policy: PolicyFile) {
  return {
    platforms: dynamicOptions(policy.platforms ?? [], neutralPlatformLabel),
    suppliers: dynamicOptions(
      (policy.vendors ?? []).filter((v) => (v.kind ?? 'supplier') === 'supplier'),
      neutralSupplierLabel,
    ),
    companyAssistants: dynamicOptions(
      (policy.vendors ?? []).filter((v) => v.kind === 'company_assistant'),
      neutralSupplierLabel,
    ),
    jurisdictions: (policy.jurisdictions ?? []).map((j) => ({ key: j.code, text: j.name })) as PlainOption[],
  };
}
