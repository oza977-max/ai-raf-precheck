import { describe, it, expect } from 'vitest';
import { intakeReducer } from './intake-state';
import type { IntakeState } from './intake-state';
import type { DataFlowGraph, GraphCorrection } from '../engine/types';

function graph(overrides: Partial<DataFlowGraph> = {}): DataFlowGraph {
  return {
    id: 'g1',
    version: 1,
    input_nodes: [],
    processing_nodes: [],
    output_nodes: [],
    edges: [],
    jurisdictions: [],
    intake_method: 'llm',
    extracted_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('intakeReducer', () => {
  it('description_entry → description_entry on DESCRIPTION_CHANGED', () => {
    const state: IntakeState = { step: 'description_entry', description: '' };
    const next = intakeReducer(state, { type: 'DESCRIPTION_CHANGED', description: 'a new AI tool' });
    expect(next).toEqual({ step: 'description_entry', description: 'a new AI tool' });
  });

  it('description_entry → duplicate_check on SUBMIT_DESCRIPTION', () => {
    const state: IntakeState = { step: 'description_entry', description: 'a new AI tool' };
    const next = intakeReducer(state, { type: 'SUBMIT_DESCRIPTION' });
    expect(next).toEqual({ step: 'duplicate_check', description: 'a new AI tool' });
  });

  it('duplicate_check → graph_extraction on NO_DUPLICATE_FOUND, carrying the chosen method', () => {
    const state: IntakeState = { step: 'duplicate_check', description: 'x' };
    const next = intakeReducer(state, { type: 'NO_DUPLICATE_FOUND', method: 'llm' });
    expect(next).toEqual({ step: 'graph_extraction', description: 'x', method: 'llm' });
  });

  it('duplicate_check → graph_extraction with method: form when no API key is configured', () => {
    const state: IntakeState = { step: 'duplicate_check', description: 'x' };
    const next = intakeReducer(state, { type: 'NO_DUPLICATE_FOUND', method: 'form' });
    expect(next).toEqual({ step: 'graph_extraction', description: 'x', method: 'form' });
  });

  it('graph_extraction → graph_review on GRAPH_EXTRACTED, carrying the graph version and setting useCaseId (P5-C01: moved earlier)', () => {
    const state: IntakeState = { step: 'graph_extraction', description: 'x', method: 'llm' };
    const g = graph({ version: 1 });
    const next = intakeReducer(state, { type: 'GRAPH_EXTRACTED', graph: g, useCaseId: 'uc-1' });
    // Round 4: the description is carried forward from the source step
    // (charter 004 D-001 / charter 005 O-001) — asserted as the carry, not as
    // a literal, so a reducer that hardcoded a value would fail.
    expect(next).toEqual({ step: 'graph_review', description: 'x', graph: g, graphVersion: 1, corrections: [], useCaseId: 'uc-1' });
  });

  it('graph_review → graph_review on CORRECTION_APPLIED, appending the correction and bumping graphVersion', () => {
    const g0 = graph({ version: 1 });
    const state: IntakeState = { step: 'graph_review', description: 'A tool that drafts client emails.', graph: g0, graphVersion: 1, corrections: [], useCaseId: 'uc-1' };
    const g1 = graph({ version: 2 });
    const correction: GraphCorrection = {
      correction_id: 'c1',
      graph_version_before: 1,
      graph_version_after: 2,
      node_id: 'n1',
      field: 'data_class',
      original_value: 'Internal',
      corrected_value: 'Confidential',
      corrected_by: '1LoD',
      corrected_at: '2026-01-01T00:00:00.000Z',
    };
    const next = intakeReducer(state, { type: 'CORRECTION_APPLIED', correction, updatedGraph: g1 });
    expect(next).toEqual({ step: 'graph_review', description: 'A tool that drafts client emails.', graph: g1, graphVersion: 2, corrections: [correction], useCaseId: 'uc-1' });
  });

  it('graph_review → questionnaire on QUESTIONS_GENERATED, carrying corrections/useCaseId forward (no longer generates useCaseId itself, P5-C01)', () => {
    const g = graph({ version: 1 });
    const correction: GraphCorrection = {
      correction_id: 'c1',
      graph_version_before: 0,
      graph_version_after: 1,
      node_id: 'n1',
      field: 'data_class',
      original_value: 'Internal',
      corrected_value: 'Confidential',
      corrected_by: '1LoD',
      corrected_at: '2026-01-01T00:00:00.000Z',
    };
    const state: IntakeState = {
      step: 'graph_review',
      description: 'A tool that drafts client emails.',
      graph: g,
      graphVersion: 1,
      corrections: [correction],
      useCaseId: 'uc-1',
    };
    const questions = [
      { id: 'Q1', text: 'x?', field: 'autonomy_level', triggered_by: ['INV-1'], answer_type: 'text' as const },
    ];
    const next = intakeReducer(state, { type: 'QUESTIONS_GENERATED', questions });
    expect(next).toEqual({
      step: 'questionnaire',
      description: 'A tool that drafts client emails.',
      graph: g,
      questions,
      answers: [],
      resolutionNotes: [],
      corrections: [correction],
      useCaseId: 'uc-1',
      originalVerdictId: undefined,
    });
  });

  it('questionnaire → questionnaire on ANSWER_SUBMITTED, appending the answer', () => {
    const g = graph();
    const state: IntakeState = {
      step: 'questionnaire',
      description: 'A tool that drafts client emails.',
      graph: g,
      questions: [],
      answers: [],
      resolutionNotes: [],
      corrections: [],
      useCaseId: 'uc-1',
    };
    const answer = { questionId: 'Q1', value: 'yes' };
    const next = intakeReducer(state, { type: 'ANSWER_SUBMITTED', answer });
    expect(next).toEqual({ ...state, answers: [answer] });
  });

  it('questionnaire → contradiction_review on CONTRADICTIONS_DETECTED, carrying corrections/useCaseId forward', () => {
    const g = graph();
    const answers = [{ questionId: 'Q1', value: 'yes' }];
    const state: IntakeState = {
      step: 'questionnaire',
      description: 'A tool that drafts client emails.',
      graph: g,
      questions: [],
      answers,
      resolutionNotes: [],
      corrections: [],
      useCaseId: 'uc-1',
    };
    const contradictions = [{ statement1: 'a', statement2: 'b', field: 'data_class' }];
    const next = intakeReducer(state, { type: 'CONTRADICTIONS_DETECTED', contradictions });
    expect(next).toEqual({ ...state, step: 'contradiction_review', contradictions });
  });

  it('contradiction_review → questionnaire on CONTRADICTION_RESOLVED, recording the explanation', () => {
    const g = graph();
    const answers = [{ questionId: 'Q1', value: 'yes' }];
    const state: IntakeState = {
      step: 'contradiction_review',
      description: 'A tool that drafts client emails.',
      graph: g,
      questions: [],
      answers,
      contradictions: [{ statement1: 'a', statement2: 'b', field: 'data_class' }],
      resolutionNotes: [],
      corrections: [],
      useCaseId: 'uc-1',
    };
    const next = intakeReducer(state, { type: 'CONTRADICTION_RESOLVED', explanation: 'Confirmed both are correct.' });
    expect(next).toEqual({
      step: 'questionnaire',
      description: 'A tool that drafts client emails.',
      graph: g,
      questions: [],
      answers,
      resolutionNotes: ['Confirmed both are correct.'],
      corrections: [],
      useCaseId: 'uc-1',
    });
  });

  it('CONTRADICTION_RESOLVED with an empty/whitespace-only explanation is rejected at the reducer layer (P4-C03 review finding: defense in depth)', () => {
    const g = graph();
    const state: IntakeState = {
      step: 'contradiction_review',
      description: 'A tool that drafts client emails.',
      graph: g,
      questions: [],
      answers: [],
      contradictions: [{ statement1: 'a', statement2: 'b', field: 'data_class' }],
      resolutionNotes: [],
      corrections: [],
      useCaseId: 'uc-1',
    };
    const next = intakeReducer(state, { type: 'CONTRADICTION_RESOLVED', explanation: '   ' });
    expect(next).toBe(state);
  });

  it('questionnaire → confirmation on PROCEED_TO_CONFIRMATION (P4-C04: real state, no longer a pass-through)', () => {
    const g = graph({ version: 1 });
    const answers = [{ questionId: 'Q1', value: 'yes' }];
    const correction: GraphCorrection = {
      correction_id: 'c1',
      graph_version_before: 0,
      graph_version_after: 1,
      node_id: 'n1',
      field: 'data_class',
      original_value: 'Internal',
      corrected_value: 'Confidential',
      corrected_by: '1LoD',
      corrected_at: '2026-01-01T00:00:00.000Z',
    };
    const state: IntakeState = {
      step: 'questionnaire',
      description: 'A tool that drafts client emails.',
      graph: g,
      questions: [],
      answers,
      resolutionNotes: [],
      corrections: [correction],
      useCaseId: 'uc-1',
    };
    const next = intakeReducer(state, { type: 'PROCEED_TO_CONFIRMATION' });
    expect(next).toEqual({
      step: 'confirmation',
      description: 'A tool that drafts client emails.',
      graph: g,
      graphVersion: 1,
      corrections: [correction],
      answers,
      useCaseId: 'uc-1',
    });
  });

  it('confirmation → evaluation_pending on CONFIRMED, carrying useCaseId', () => {
    const g = graph({ version: 1 });
    const state: IntakeState = {
      step: 'confirmation',
      description: 'A tool that drafts client emails.',
      graph: g,
      graphVersion: 1,
      corrections: [],
      answers: [],
      useCaseId: 'uc-1',
    };
    const next = intakeReducer(state, { type: 'CONFIRMED' });
    expect(next).toEqual({ step: 'evaluation_pending', graph: g, useCaseId: 'uc-1' });
  });

  it('does not skip confirmation from questionnaire anymore (PROCEED_TO_EVALUATION_PASSTHROUGH removed, BC-P4C04-01)', () => {
    const g = graph({ version: 1 });
    const state: IntakeState = {
      step: 'questionnaire',
      description: 'A tool that drafts client emails.',
      graph: g,
      questions: [],
      answers: [],
      resolutionNotes: [],
      corrections: [],
      useCaseId: 'uc-1',
    };
    // @ts-expect-error PROCEED_TO_EVALUATION_PASSTHROUGH no longer exists in IntakeAction
    const next = intakeReducer(state, { type: 'PROCEED_TO_EVALUATION_PASSTHROUGH' });
    expect(next).toBe(state);
  });

  it('evaluation_pending → verdict on VERDICT_READY, using the carried useCaseId as verdictId', () => {
    const g = graph();
    const state: IntakeState = { step: 'evaluation_pending', graph: g, useCaseId: 'uc-1' };
    const next = intakeReducer(state, { type: 'VERDICT_READY' });
    expect(next).toEqual({ step: 'verdict', verdictId: 'uc-1' });
  });

  it('verdict → graph_review on CORRECT_VERDICT, reusing the original useCaseId and recording originalVerdictId (BC-P5C01-01)', () => {
    const g = graph({ version: 1 });
    const state: IntakeState = { step: 'verdict', verdictId: 'uc-1' };
    const next = intakeReducer(state, {
      type: 'CORRECT_VERDICT',
      graph: g,
      useCaseId: 'uc-1', // same useCaseId as the original submission — not a new one
      originalVerdictId: 'verdict-abc',
    });
    expect(next).toEqual({
      step: 'graph_review',
      description: '',
      graph: g,
      graphVersion: 1,
      corrections: [],
      useCaseId: 'uc-1',
      originalVerdictId: 'verdict-abc',
    });
  });

  it('originalVerdictId set by CORRECT_VERDICT survives through questionnaire and confirmation (BC-P4C04-03 pattern, extended to P5-C01)', () => {
    const g = graph({ version: 1 });
    const afterCorrect = intakeReducer(
      { step: 'verdict', verdictId: 'uc-1' },
      { type: 'CORRECT_VERDICT', graph: g, useCaseId: 'uc-1', originalVerdictId: 'verdict-abc' },
    );
    const afterQuestions = intakeReducer(afterCorrect, { type: 'QUESTIONS_GENERATED', questions: [] });
    const afterConfirmation = intakeReducer(afterQuestions, { type: 'PROCEED_TO_CONFIRMATION' });
    // The chain starts at `verdict`, which carries no description, so '' is
    // carried through — the correction-pass gap recorded in
    // carriedDescription(). Asserted rather than left implicit.
    expect(afterConfirmation).toMatchObject({ step: 'confirmation', description: '', originalVerdictId: 'verdict-abc', useCaseId: 'uc-1' });
  });

  it('evaluation_pending → graph_review on EVALUATION_FAILED, not stuck forever (fix for the P5-C01-flagged uncaught-error gap)', () => {
    const g = graph({ version: 1 });
    const state: IntakeState = { step: 'evaluation_pending', graph: g, useCaseId: 'uc-1', originalVerdictId: 'verdict-abc' };
    const next = intakeReducer(state, { type: 'EVALUATION_FAILED' });
    expect(next).toEqual({
      step: 'graph_review',
      description: '',
      graph: g,
      graphVersion: 1,
      corrections: [],
      useCaseId: 'uc-1',
      originalVerdictId: 'verdict-abc',
    });
  });

  it('RESTART returns to a blank description entry from every step (explore-005 D-002)', () => {
    const g = graph({ version: 3 });
    const states: IntakeState[] = [
      { step: 'description_entry', description: 'x' },
      { step: 'duplicate_check', description: 'x' },
      { step: 'graph_extraction', description: 'x', method: 'form' },
      { step: 'graph_review', description: 'A tool that drafts client emails.', graph: g, graphVersion: 3, corrections: [], useCaseId: 'uc-1' },
      { step: 'evaluation_pending', graph: g, useCaseId: 'uc-1' },
      { step: 'verdict', verdictId: 'uc-1' },
    ];
    // The step-by-step guards are the point of this test: RESTART is the one
    // action deliberately valid from ALL of them, because the previous
    // escape hatch dispatched an action the reducer discarded from every
    // step but the first — so it silently did nothing.
    for (const state of states) {
      expect(intakeReducer(state, { type: 'RESTART' })).toEqual({ step: 'description_entry', description: '' });
    }
  });

  it('ignores an action that does not apply to the current state (exhaustive guard)', () => {
    const state: IntakeState = { step: 'description_entry', description: 'x' };
    const next = intakeReducer(state, { type: 'NO_DUPLICATE_FOUND', method: 'llm' });
    expect(next).toBe(state);
  });
});

// Round 4 — charter 005 O-001. The description is now carried on the state
// rather than held in a component useState, because the draft envelope
// persists the state and did not persist the useState. A resumed questionnaire
// was running detectContradictions against an empty string, finding nothing,
// and saying so — degrading quietly instead of failing.
describe('intakeReducer — the description survives to the steps that need it (O-001)', () => {
  it('carries the description from extraction through to confirmation', () => {
    const g = graph({ version: 1 });
    const typed = 'A tool that drafts client emails from CRM notes';

    let state: IntakeState = { step: 'graph_extraction', description: typed, method: 'form' };
    state = intakeReducer(state, { type: 'GRAPH_EXTRACTED', graph: g, useCaseId: 'uc-1' });
    expect('description' in state && state.description).toBe(typed);

    state = intakeReducer(state, { type: 'QUESTIONS_GENERATED', questions: [] });
    // The questionnaire is the step that reads it — this is the one that was
    // silently checking answers against ''.
    expect('description' in state && state.description).toBe(typed);

    state = intakeReducer(state, { type: 'PROCEED_TO_CONFIRMATION' });
    expect('description' in state && state.description).toBe(typed);
  });
});

// FN-006 — user-reported after the v0.1.0 tag: "after describing, if I go to
// the next step it doesn't go back, there is no back option." The action union
// carried forward transitions plus RESTART and nothing else, so the only
// escape from a typo in the description was to destroy the whole session.
//
// The boundary that matters: confirmation is an attestation (UC-6), and
// stepping back across it would let a submitter un-attest. STEP_BACK stops
// there by design, and the tests below pin that.
describe('intakeReducer — STEP_BACK (FN-006)', () => {
  const typed = 'A model that scores retail credit applications';

  it('duplicate_check → description_entry, keeping what was typed', () => {
    const state: IntakeState = { step: 'duplicate_check', description: typed };
    const next = intakeReducer(state, { type: 'STEP_BACK' });
    // Keeping the description IS the fix. Returning to a blank box would be
    // RESTART, which already exists and is not what was asked for.
    expect(next).toEqual({ step: 'description_entry', description: typed });
  });

  it('graph_review → duplicate_check, keeping what was typed', () => {
    const state: IntakeState = {
      step: 'graph_review',
      description: typed,
      graph: graph(),
      graphVersion: 1,
      corrections: [],
      useCaseId: 'uc-1',
    };
    const next = intakeReducer(state, { type: 'STEP_BACK' });
    expect(next).toEqual({ step: 'duplicate_check', description: typed });
  });

  it('questionnaire → graph_review, keeping the graph, its version and its corrections', () => {
    const correction: GraphCorrection = {
      correction_id: 'c1',
      graph_version_before: 1,
      graph_version_after: 2,
      node_id: 'n1',
      field: 'data_class',
      original_value: 'Internal',
      corrected_value: 'Client PII',
      corrected_by: '1LoD',
      corrected_at: '2026-01-01T00:00:00.000Z',
    };
    const g = graph({ version: 2 });
    const state: IntakeState = {
      step: 'questionnaire',
      description: typed,
      graph: g,
      questions: [],
      answers: [],
      resolutionNotes: [],
      corrections: [correction],
      useCaseId: 'uc-1',
      originalVerdictId: 'v-1',
    };
    const next = intakeReducer(state, { type: 'STEP_BACK' });
    expect(next).toEqual({
      step: 'graph_review',
      description: typed,
      graph: g,
      graphVersion: 2,
      corrections: [correction],
      useCaseId: 'uc-1',
      originalVerdictId: 'v-1',
    });
  });

  it('does not step back out of confirmation — the attestation boundary holds', () => {
    const state: IntakeState = {
      step: 'confirmation',
      description: typed,
      graph: graph(),
      graphVersion: 1,
      corrections: [],
      answers: [],
      useCaseId: 'uc-1',
    };
    expect(intakeReducer(state, { type: 'STEP_BACK' })).toBe(state);
  });

  it('does not step back from description_entry, evaluation_pending or verdict', () => {
    const entry: IntakeState = { step: 'description_entry', description: typed };
    expect(intakeReducer(entry, { type: 'STEP_BACK' })).toBe(entry);

    const pending: IntakeState = { step: 'evaluation_pending', graph: graph(), useCaseId: 'uc-1' };
    expect(intakeReducer(pending, { type: 'STEP_BACK' })).toBe(pending);

    const done: IntakeState = { step: 'verdict', verdictId: 'uc-1' };
    expect(intakeReducer(done, { type: 'STEP_BACK' })).toBe(done);
  });

  it('a correction pass keeps its originalVerdictId when it steps back (VD-3)', () => {
    // Stepping back must not silently turn a correction into a new submission —
    // that would orphan the verdict being corrected.
    const state: IntakeState = {
      step: 'questionnaire',
      description: typed,
      graph: graph(),
      questions: [],
      answers: [],
      resolutionNotes: [],
      corrections: [],
      useCaseId: 'uc-1',
      originalVerdictId: 'v-original',
    };
    const back = intakeReducer(state, { type: 'STEP_BACK' });
    expect('originalVerdictId' in back && back.originalVerdictId).toBe('v-original');
  });
});
