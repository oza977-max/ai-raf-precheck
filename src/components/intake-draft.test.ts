import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveDraft,
  loadDraft,
  clearDraft,
  saveFormDraft,
  loadFormDraft,
  clearFormDraft,
  probeLegacyFormDraft,
} from './intake-draft';
import type { IntakeState } from './intake-state';

// explore-001 D-002 (Important) and D-003 (Minor): in-flight intake was lost
// on refresh, browser Back, or in-app navigation, with no warning.
describe('intake draft persistence (D-002 / D-003)', () => {
  beforeEach(() => clearDraft());

  it('round-trips a mid-flow state so a refresh does not lose the work', () => {
    const state = {
      step: 'graph_review',
      graph: { id: 'g1', version: 1, input_nodes: [], processing_nodes: [], output_nodes: [],
               edges: [], jurisdictions: [], intake_method: 'structured_form',
               extracted_at: '2026-01-01T00:00:00.000Z' },
      graphVersion: 1,
      corrections: [],
      useCaseId: 'uc-1',
    } as unknown as IntakeState;

    saveDraft(state);
    const restored = loadDraft();
    expect(restored).not.toBeNull();
    expect(restored!.step).toBe('graph_review');
    expect(JSON.stringify(restored)).toBe(JSON.stringify(state));
  });

  it('does not persist an empty description — restoring a blank form is not saved work', () => {
    saveDraft({ step: 'description_entry', description: '   ' } as IntakeState);
    expect(loadDraft()).toBeNull();
  });

  it('persists a description the user has actually typed', () => {
    saveDraft({ step: 'description_entry', description: 'a real description' } as IntakeState);
    expect(loadDraft()?.step).toBe('description_entry');
  });

  it('clearDraft removes it', () => {
    saveDraft({ step: 'description_entry', description: 'x' } as IntakeState);
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it('rejects a stale or corrupt shape rather than putting the reducer in an unreachable state', () => {
    sessionStorage.setItem('aigate:intake-draft', '{"nonsense":true}');
    expect(loadDraft()).toBeNull();
    sessionStorage.setItem('aigate:intake-draft', 'not json at all');
    expect(loadDraft()).toBeNull();
  });
});

// The first pass at D-002/D-003 persisted only IntakeState, which restored
// the STEP but not the eleven guided-form answers — because those live in
// StructuredForm's local state. Found by verifying in the browser rather
// than trusting the first fix.
describe('guided-form draft (the half the first fix missed)', () => {
  beforeEach(() => clearFormDraft());

  it('round-trips the answers a user has already given', () => {
    const values = { useCaseName: 'Persistence check', inputDataClass: 'Client PII', autonomyLevel: 2 };
    saveFormDraft(values);
    expect(loadFormDraft()).toEqual(values);
  });

  it('is cleared on submit so the next pre-check starts clean', () => {
    saveFormDraft({ useCaseName: 'x' });
    clearFormDraft();
    expect(loadFormDraft()).toBeNull();
  });

  it('survives corrupt storage without breaking intake', () => {
    sessionStorage.setItem('aigate:intake-form-draft:v2', 'not json');
    expect(loadFormDraft()).toBeNull();
  });
});

// R16-B (D-41). The plain-language form's PlainAnswers shape has nothing in
// common with the old field-by-field StructuredFormValues shape it
// replaces — a stray old-shape value (e.g. a raw DataClass string under a
// key the new form reads as an option KEY) must never be silently read back
// as though it were a real answer. The key is versioned so an old draft is
// never even attempted; it is instead probed, cleared, and reported once so
// the submitter is told plainly rather than finding a half-populated form.
describe('legacy form-draft migration (R16-B, D-41)', () => {
  const LEGACY_KEY = 'aigate:intake-form-draft';
  const NEW_KEY = 'aigate:intake-form-draft:v2';

  beforeEach(() => {
    sessionStorage.removeItem(LEGACY_KEY);
    clearFormDraft();
  });

  it('TC-R16-B-07: a draft under the old key is detected, cleared, and reported once', () => {
    sessionStorage.setItem(LEGACY_KEY, JSON.stringify({ useCaseName: 'Old form draft' }));
    expect(probeLegacyFormDraft()).toBe(true);
    expect(sessionStorage.getItem(LEGACY_KEY)).toBeNull();
    // Calling it again finds nothing left to report — it is truly gone, not
    // merely hidden.
    expect(probeLegacyFormDraft()).toBe(false);
  });

  it('no old draft present -> reports false and touches nothing', () => {
    expect(probeLegacyFormDraft()).toBe(false);
    expect(sessionStorage.getItem(NEW_KEY)).toBeNull();
  });

  it('saveFormDraft/loadFormDraft round-trip through the NEW versioned key only', () => {
    saveFormDraft({ '1': 'Test tool' });
    expect(sessionStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(sessionStorage.getItem(NEW_KEY)).not.toBeNull();
    expect(loadFormDraft()).toEqual({ '1': 'Test tool' });
  });

  it('a legacy draft is never read back as a new-shape answer object', () => {
    sessionStorage.setItem(LEGACY_KEY, JSON.stringify({ useCaseName: 'Old form draft', inputDataClass: 'Client PII' }));
    // loadFormDraft only ever reads the NEW key — the legacy key is a
    // probe-and-clear concern handled separately by probeLegacyFormDraft.
    expect(loadFormDraft()).toBeNull();
  });
});

// CR6-04 (Critical, BC-002: "persisted state carries a version and is
// migrated or refused on mismatch, never read as if current"). The MAIN
// intake draft (unlike the form draft above) was never versioned at all —
// ANSWER_UNDONE's `undo` snapshot gained `questions`/`assumptionsLen` at
// 9348882, and a draft saved by an older build has neither. Reading it back
// as current handed QuestionnaireStep an `undo.questions` of `undefined`,
// which it indexes (`questions[answeredCount]`) and crashes on.
//
// The fix wraps what's actually written in sessionStorage in a small
// {version, state} envelope. loadDraft() keeps returning a bare IntakeState
// (its public shape is unchanged — every existing bare-JSON fixture in the
// UI test suite, written before this fix existed, must keep restoring
// exactly as before); only an INCOMPATIBLE version has its one unsafe piece
// (the `undo` snapshot) dropped, never the whole draft — the rest of a
// user's in-progress work is real and is kept.
describe('intake draft versioning — an incompatible undo snapshot is dropped, not read as current (CR6-04, BC-002)', () => {
  const DRAFT_KEY = 'aigate:intake-draft';
  beforeEach(() => clearDraft());

  it('TC-CR6-04b: a draft with no version envelope at all (the shape every build before this fix wrote) restores, but drops an undo snapshot on the questionnaire step', () => {
    const bareOldDraft = {
      step: 'questionnaire',
      description: 'd',
      graph: { id: 'g1', version: 2, input_nodes: [], processing_nodes: [], output_nodes: [], edges: [], jurisdictions: [], intake_method: 'llm', extracted_at: '2026-01-01T00:00:00.000Z' },
      questions: [{ id: 'Q1', field: 'f', triggered_by: [], answer_type: 'text' }],
      answers: [{ questionId: 'Q1', value: 'x' }],
      resolutionNotes: [],
      corrections: [],
      useCaseId: 'uc-1',
      // The pre-9348882 shape: no `questions`, no `assumptionsLen`.
      undo: { graph: { id: 'g0', version: 1, input_nodes: [], processing_nodes: [], output_nodes: [], edges: [], jurisdictions: [], intake_method: 'llm', extracted_at: '2026-01-01T00:00:00.000Z' }, correctionsLen: 0 },
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(bareOldDraft));

    const restored = loadDraft();
    expect(restored).not.toBeNull();
    expect(restored!.step).toBe('questionnaire');
    // The real work — description, graph, questions, answers — survives.
    expect((restored as typeof bareOldDraft).answers).toEqual(bareOldDraft.answers);
    expect((restored as typeof bareOldDraft).questions).toEqual(bareOldDraft.questions);
    // The one incompatible piece is gone, not silently misread as current.
    expect('undo' in (restored as object)).toBe(false);
  });

  it('a draft saved by the CURRENT build (with a real undo snapshot) round-trips its undo unchanged', () => {
    const state = {
      step: 'questionnaire',
      description: 'd',
      graph: { id: 'g1', version: 2, input_nodes: [], processing_nodes: [], output_nodes: [], edges: [], jurisdictions: [], intake_method: 'llm', extracted_at: '2026-01-01T00:00:00.000Z' },
      questions: [{ id: 'Q1', field: 'f', triggered_by: [], answer_type: 'text' }],
      answers: [{ questionId: 'Q1', value: 'x' }],
      resolutionNotes: [],
      corrections: [],
      useCaseId: 'uc-1',
      undo: { graph: { id: 'g0', version: 1, input_nodes: [], processing_nodes: [], output_nodes: [], edges: [], jurisdictions: [], intake_method: 'llm', extracted_at: '2026-01-01T00:00:00.000Z' }, correctionsLen: 0, questions: [], assumptionsLen: 0 },
    } as unknown as IntakeState;

    saveDraft(state);
    const restored = loadDraft();
    expect(restored).toEqual(state);
  });

  it('a non-questionnaire old-shape draft (no undo to drop in the first place) is completely unaffected', () => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ step: 'duplicate_check', description: 'A tool that drafts client emails' }),
    );
    expect(loadDraft()).toEqual({ step: 'duplicate_check', description: 'A tool that drafts client emails' });
  });

  it('still rejects a stale or corrupt shape — the version envelope does not weaken the existing guard', () => {
    sessionStorage.setItem(DRAFT_KEY, '{"nonsense":true}');
    expect(loadDraft()).toBeNull();
    sessionStorage.setItem(DRAFT_KEY, 'not json at all');
    expect(loadDraft()).toBeNull();
  });
});
