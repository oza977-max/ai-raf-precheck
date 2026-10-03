import { describe, it, expect } from 'vitest';
import { describeAssumptions, summaryDestinationLine, SUMMARY_DESTINATION } from './plain-copy';
import type { AssumptionRef } from '../engine/plain-questions';

// R16-F §5 (DR7-06). plain-intake.ts (the engine) now returns assumption
// REFERENCES ({ questionId, optionKey }, plus the platform-zone case)
// instead of worded assumptions — describeAssumptions() is the one place,
// component-side, a reference becomes the worded Assumption every reader
// (UnderstoodSummary, the register) still needs. These tests cover the
// WORDING that plain-intake.test.ts's own mapping tests used to assert
// directly before this split (now reference-only there).

describe('describeAssumptions', () => {
  it('TC-R16-F-03: an empty list of references produces an empty list of assumptions', () => {
    expect(describeAssumptions([])).toEqual([]);
  });

  it('TC-R16-F-04: a generic reference resolves to the exact worded assumption and question text (moved from plain-intake.test.ts)', () => {
    const refs: AssumptionRef[] = [
      { questionId: '4', optionKey: 'not-sure', fields: ['model_type'] },
      { questionId: '6', optionKey: 'not-sure', fields: ['action_type', 'autonomy_level', 'decision_bindingness', 'hitl'] },
      { questionId: '7', optionKey: 'not-sure', fields: ['exposure'] },
      { questionId: '9', optionKey: 'not-sure', fields: ['output_reversibility'] },
    ];
    const out = describeAssumptions(refs);
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({
      questionId: '4',
      question: 'What kind of AI is it? If more than one fits — for example, something that turns speech into text and writes a summary of it — pick the one nearest the bottom of this list.',
      shortLabel: 'what kind of AI it is',
      assumption:
        'an AI agent that can work on its own — the strictest case, because agents need the most safeguards. Change it if you can.',
      fields: ['model_type'],
    });
    expect(out[1]!.assumption).toBe(
      'it acts entirely by itself with no person involved at any point — the strictest case. This changes the result a lot; change it if you can.',
    );
    expect(out[2]!.assumption).toMatch(/widest audience/);
    expect(out[3]!.question).toMatch(/can the mistake be caught/i);
    expect(out[3]!.assumption).toMatch(/can’t be undone — the strictest case/);
  });

  it('TC-R16-F-05: a reference with no ASSUMPTION_TEXT entry is dropped silently, same as makeAssumption()', () => {
    // '4':'score' is a real question/option, but not a "Not sure" one —
    // no assumption text exists for it.
    const out = describeAssumptions([{ questionId: '4', optionKey: 'score', fields: ['model_type'] }]);
    expect(out).toEqual([]);
  });

  it('TC-R16-F-06: the 3platformZone case with earliestZone Zone B resolves to the "outside supplier" sentence', () => {
    const out = describeAssumptions([
      { questionId: '3platformZone', optionKey: 'not-sure', earliestZone: 'Zone B', fields: ['data_zone'] },
    ]);
    expect(out).toEqual([
      {
        questionId: '3platformZone',
        question: 'Does your information stay on your firm’s own systems the whole time?',
        shortLabel: 'whether your information stays on your firm’s systems',
        assumption: 'it may pass your information to an outside supplier — the stricter case.',
        fields: ['data_zone'],
      },
    ]);
  });

  it('TC-R16-F-07: the 3platformZone case with earliestZone Zone A resolves to the "outside website or service" sentence', () => {
    const out = describeAssumptions([
      { questionId: '3platformZone', optionKey: 'not-sure', earliestZone: 'Zone A', fields: ['data_zone'] },
    ]);
    expect(out[0]!.assumption).toBe('an outside website or service — the strictest case.');
  });

  it('a mix of generic and platform-zone references resolves each correctly, in order', () => {
    const out = describeAssumptions([
      { questionId: '9', optionKey: 'not-sure', fields: ['output_reversibility'] },
      { questionId: '3platformZone', optionKey: 'not-sure', earliestZone: 'Zone B', fields: ['data_zone'] },
    ]);
    expect(out.map((a) => a.questionId)).toEqual(['9', '3platformZone']);
  });
});

describe('summaryDestinationLine (F-9, DR7-09)', () => {
  it('TC-R16-F-08: with no plainAnswers, renders the base destination sentence unchanged', () => {
    expect(summaryDestinationLine('Zone C')).toBe(SUMMARY_DESTINATION['Zone C']);
  });

  it('TC-R16-F-09: an explicit 3platformZone "firm-systems" answer attributes the Zone C line', () => {
    const line = summaryDestinationLine('Zone C', { '3platformZone': 'firm-systems' });
    // Exact contract wording: "Your firm's own systems (you told us your
    // information stays on them)." — no period before the parenthesis.
    expect(line).toBe('Your firm’s own systems (you told us your information stays on them).');
  });

  it('TC-R16-F-10: an explicit 3platformZone "outside-supplier" answer attributes the Zone B line', () => {
    const line = summaryDestinationLine('Zone B', { '3platformZone': 'outside-supplier' });
    expect(line).toMatch(/\(you told us it goes to an outside supplier\)\.$/);
  });

  it('TC-R16-F-11: an explicit 3platformZone "outside-service" answer attributes the Zone A line', () => {
    const line = summaryDestinationLine('Zone A', { '3platformZone': 'outside-service' });
    expect(line).toMatch(/\(you told us it goes out to a public website or service\)\.$/);
  });

  it('a "Not sure" 3platformZone answer is not attributed — it is an assumption, not a stated fact', () => {
    const line = summaryDestinationLine('Zone B', { '3platformZone': 'not-sure' });
    expect(line).toBe(SUMMARY_DESTINATION['Zone B']);
  });

  it('a description-path call (plainAnswers undefined) never attributes', () => {
    expect(summaryDestinationLine('Zone A', undefined)).toBe(SUMMARY_DESTINATION['Zone A']);
  });
});
