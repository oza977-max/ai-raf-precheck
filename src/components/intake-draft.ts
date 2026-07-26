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

export function saveDraft(state: IntakeState): void {
  try {
    if (!worthPersisting(state)) {
      clearDraft();
      return;
    }
    sessionStorage.setItem(KEY, JSON.stringify(state));
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
    const parsed = JSON.parse(raw) as IntakeState;
    // Guard against a stale shape from an older build: an unrecognised step
    // would put the reducer in an unreachable state.
    return typeof parsed?.step === 'string' ? parsed : null;
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
const FORM_KEY = 'aigate:intake-form-draft';

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
