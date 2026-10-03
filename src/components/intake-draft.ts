import type { IntakeState } from './intake-state';

// explore-001 D-002 / D-003. In-flight intake lived only in React state, so
// a refresh, a browser Back, or clicking "Register" mid-intake discarded the
// description, all eleven guided-form answers, the extracted graph and any
// node corrections — with no warning and no way back. For the planned
// back-test, where risk practitioners enter real use cases, that is the most
// likely cause of an abandoned session.
//
// sessionStorage rather than localStorage, deliberately:
//   * a half-finished draft should not outlive the browser session;
//   * it is per-tab, so two tabs cannot fight over one draft;
//   * it is not the audit trail — a draft is not evidence, and nothing here
//     is ever written to the append-only store.
const KEY = 'aigate:intake-draft';

// A draft is only worth keeping once the user has actually invested
// something. An empty description-entry step restores nothing, so persisting
// it would just mean restoring a blank form and claiming we saved their work.
function worthPersisting(state: IntakeState): boolean {
  if (state.step === 'description_entry') return state.description.trim().length > 0;
  return true;
}

// CR6-04 (Critical, BC-002: "persisted state carries a version and is
// migrated or refused on mismatch, never read as if current"). The
// reducer's own `undo` snapshot (questionnaire step) gained
// `questions`/`assumptionsLen` at 9348882 and `guessedFields` at CR6-03 —
// a draft saved by an OLDER build has an `undo` missing one or both, and
// reading it back as current hands ANSWER_UNDONE a value it cannot safely
// use (QuestionnaireStep indexes `questions[answeredCount]`).
//
// Unlike FORM_KEY below (a whole-key bump, R16-B), this versions the draft
// in an ENVELOPE instead: on an incompatible version, only the one unsafe
// piece (`undo`) is dropped — Undo is then unavailable for that one
// answer, which says nothing false — while the rest of the user's real,
// in-progress work (description, graph, answers, corrections) is kept.
// Bumping the whole key, the way FORM_KEY does, would throw all of that
// away for an incompatibility that affects one optional field.
const DRAFT_VERSION = 2;

interface DraftEnvelope {
  version: number;
  state: IntakeState;
}

function isEnvelope(value: unknown): value is DraftEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof (value as { version: unknown }).version === 'number' &&
    'state' in value
  );
}

/** Drops an `undo` snapshot that cannot be trusted as current — the ONE
 *  piece of a `questionnaire` draft CR6-04 actually needs to protect.
 *  Every other field is returned untouched: the version mismatch does not
 *  mean the rest of the draft is unsafe, only that this one optional,
 *  reducer-shape-sensitive field might not be. */
function dropIncompatibleUndo(state: IntakeState): IntakeState {
  if (state.step !== 'questionnaire' || !('undo' in state)) return state;
  const { undo, ...rest } = state;
  void undo;
  return rest;
}

export function saveDraft(state: IntakeState): void {
  try {
    if (!worthPersisting(state)) {
      clearDraft();
      return;
    }
    const envelope: DraftEnvelope = { version: DRAFT_VERSION, state };
    sessionStorage.setItem(KEY, JSON.stringify(envelope));
  } catch {
    // Storage can be unavailable (private mode, quota). Losing the draft is
    // the pre-existing behaviour, so a failure here degrades to it rather
    // than breaking intake.
  }
}

export function loadDraft(): IntakeState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    // A draft saved before this fix is the bare IntakeState itself, with no
    // envelope at all — every field this function strips is, by
    // construction, ALSO missing from one of those (they are all newer
    // than this versioning itself), so it is treated as version 1.
    const envelope: DraftEnvelope = isEnvelope(parsed) ? parsed : { version: 1, state: parsed as IntakeState };
    const state = envelope.state;
    // Guard against a stale shape from an older build: an unrecognised step
    // would put the reducer in an unreachable state.
    if (typeof state?.step !== 'string') return null;
    return envelope.version < DRAFT_VERSION ? dropIncompatibleUndo(state) : state;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

// The guided form keeps its answers in local component state, not in
// IntakeState, so persisting the reducer alone restored the step with an
// empty form — the work the user actually did was still lost. This is the
// second half of the D-002/D-003 fix, found by verifying the first half in
// the browser rather than trusting it.
//
// R16-B (D-41): versioned key. The plain-language form's answer shape
// (PlainAnswers — option KEYS against question ids) has nothing in common
// with the old field-by-field form's StructuredFormValues shape it
// replaces. Reusing the old key would let a stray old-shape draft be read
// back as though its values were real PlainAnswers — silently feeding a
// value nobody chose through the new question mapping. Bumping the key
// means an old draft is simply never found under the new one; probing the
// OLD key (below) is how the user is told plainly, once, rather than the
// draft just rotting in sessionStorage.
const FORM_KEY = 'aigate:intake-form-draft:v2';
const LEGACY_FORM_KEY = 'aigate:intake-form-draft';

export function saveFormDraft(values: unknown): void {
  try {
    sessionStorage.setItem(FORM_KEY, JSON.stringify(values));
  } catch {
    /* degrade to the pre-existing behaviour */
  }
}

export function loadFormDraft<T>(): T | null {
  try {
    const raw = sessionStorage.getItem(FORM_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearFormDraft(): void {
  try {
    sessionStorage.removeItem(FORM_KEY);
  } catch {
    /* nothing to do */
  }
}

/** R16-B (D-41). Checks the OLD, pre-R16 draft key and clears it if present,
 *  returning whether one was found so the caller (StructuredForm) can show
 *  "Your saved draft was from an older version of this form and couldn't be
 *  reused — please start again." exactly once. Never reads the draft's
 *  content — an incompatible shape is not even worth parsing, only
 *  removing. */
export function probeLegacyFormDraft(): boolean {
  try {
    const existed = sessionStorage.getItem(LEGACY_FORM_KEY) !== null;
    if (existed) sessionStorage.removeItem(LEGACY_FORM_KEY);
    return existed;
  } catch {
    return false;
  }
}
