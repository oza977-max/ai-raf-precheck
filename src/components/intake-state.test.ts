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

  it('graph_extraction → graph_review on GRAPH_EXTRACTED, carrying the graph version', () => {
    const state: IntakeState = { step: 'graph_extraction', description: 'x', method: 'llm' };
    const g = graph({ version: 1 });
    const next = intakeReducer(state, { type: 'GRAPH_EXTRACTED', graph: g });
    expect(next).toEqual({ step: 'graph_review', graph: g, graphVersion: 1, corrections: [] });
  });

  it('graph_review → graph_review on CORRECTION_APPLIED, appending the correction and bumping graphVersion', () => {
    const g0 = graph({ version: 1 });
    const state: IntakeState = { step: 'graph_review', graph: g0, graphVersion: 1, corrections: [] };
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
    expect(next).toEqual({ step: 'graph_review', graph: g1, graphVersion: 2, corrections: [correction] });
  });

  it('graph_review → questionnaire on QUESTIONS_GENERATED', () => {
    const g = graph({ version: 1 });
    const state: IntakeState = { step: 'graph_review', graph: g, graphVersion: 1, corrections: [] };
    const questions = [
      { id: 'Q1', text: 'x?', field: 'autonomy_level', triggered_by: ['INV-1'], answer_type: 'text' as const },
    ];
    const next = intakeReducer(state, { type: 'QUESTIONS_GENERATED', questions });
    expect(next).toEqual({ step: 'questionnaire', graph: g, questions, answers: [], resolutionNotes: [] });
  });

  it('questionnaire → questionnaire on ANSWER_SUBMITTED, appending the answer', () => {
    const g = graph();
    const state: IntakeState = { step: 'questionnaire', graph: g, questions: [], answers: [], resolutionNotes: [] };
    const answer = { questionId: 'Q1', value: 'yes' };
    const next = intakeReducer(state, { type: 'ANSWER_SUBMITTED', answer });
    expect(next).toEqual({ step: 'questionnaire', graph: g, questions: [], answers: [answer], resolutionNotes: [] });
  });

  it('questionnaire → contradiction_review on CONTRADICTIONS_DETECTED', () => {
    const g = graph();
    const answers = [{ questionId: 'Q1', value: 'yes' }];
    const state: IntakeState = { step: 'questionnaire', graph: g, questions: [], answers, resolutionNotes: [] };
    const contradictions = [{ statement1: 'a', statement2: 'b', field: 'data_class' }];
    const next = intakeReducer(state, { type: 'CONTRADICTIONS_DETECTED', contradictions });
    expect(next).toEqual({
      step: 'contradiction_review',
      graph: g,
      questions: [],
      answers,
      contradictions,
      resolutionNotes: [],
    });
  });

  it('contradiction_review → questionnaire on CONTRADICTION_RESOLVED, recording the explanation', () => {
    const g = graph();
    const answers = [{ questionId: 'Q1', value: 'yes' }];
    const state: IntakeState = {
      step: 'contradiction_review',
      graph: g,
      questions: [],
      answers,
      contradictions: [{ statement1: 'a', statement2: 'b', field: 'data_class' }],
      resolutionNotes: [],
    };
    const next = intakeReducer(state, { type: 'CONTRADICTION_RESOLVED', explanation: 'Confirmed both are correct.' });
    expect(next).toEqual({
      step: 'questionnaire',
      graph: g,
      questions: [],
      answers,
      resolutionNotes: ['Confirmed both are correct.'],
    });
  });

  it('CONTRADICTION_RESOLVED with an empty/whitespace-only explanation is rejected at the reducer layer (P4-C03 review finding: defense in depth)', () => {
    const g = graph();
    const state: IntakeState = {
      step: 'contradiction_review',
      graph: g,
      questions: [],
      answers: [],
      contradictions: [{ statement1: 'a', statement2: 'b', field: 'data_class' }],
      resolutionNotes: [],
    };
    const next = intakeReducer(state, { type: 'CONTRADICTION_RESOLVED', explanation: '   ' });
    expect(next).toBe(state);
  });

  it('questionnaire → evaluation_pending on PROCEED_TO_EVALUATION_PASSTHROUGH (P4-C03: pass-through moved from graph_review)', () => {
    const g = graph({ version: 1 });
    const state: IntakeState = { step: 'questionnaire', graph: g, questions: [], answers: [], resolutionNotes: [] };
    const next = intakeReducer(state, { type: 'PROCEED_TO_EVALUATION_PASSTHROUGH' });
    expect(next).toEqual({ step: 'evaluation_pending', graph: g });
  });

  it('does not proceed to evaluation from graph_review anymore (boundary moved)', () => {
    const g = graph({ version: 1 });
    const state: IntakeState = { step: 'graph_review', graph: g, graphVersion: 1, corrections: [] };
    const next = intakeReducer(state, { type: 'PROCEED_TO_EVALUATION_PASSTHROUGH' });
    expect(next).toBe(state);
  });

  it('evaluation_pending → verdict on VERDICT_READY', () => {
    const g = graph();
    const state: IntakeState = { step: 'evaluation_pending', graph: g };
    const next = intakeReducer(state, { type: 'VERDICT_READY', verdictId: 'v1' });
    expect(next).toEqual({ step: 'verdict', verdictId: 'v1' });
  });

  it('ignores an action that does not apply to the current state (exhaustive guard)', () => {
    const state: IntakeState = { step: 'description_entry', description: 'x' };
    const next = intakeReducer(state, { type: 'NO_DUPLICATE_FOUND', method: 'llm' });
    expect(next).toBe(state);
  });
});
