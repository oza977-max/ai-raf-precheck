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
