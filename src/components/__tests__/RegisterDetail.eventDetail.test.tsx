import { describe, expect, it } from 'vitest';
import { eventDetail } from '../RegisterDetail';
import type { AuditEvent } from '../../store/types';

// code-review-005 F13: the audit timeline's per-type switch covers every type
// this version knows, but a stored event is data, not a type — one written by
// another version of Counterpoise, or a damaged record, used to render as a blank
// line in the evidence trail.
describe('RegisterDetail eventDetail — unrecognised events stay visible', () => {
  const base = {
    event_id: 'e-1',
    use_case_id: 'uc-1',
    occurred_at: '2026-09-28T10:00:00.000Z',
    actor: '1LoD',
    hash: 'h',
    prev_hash: null,
  };

  it('TC-RG-8-27: renders a visible line naming an event type this version does not know', () => {
    const event = {
      ...base,
      event_type: 'future_event_kind',
      payload: { type: 'future_event_kind', anything: 1 },
    } as unknown as AuditEvent;
    const line = eventDetail(event);
    expect(line).toMatch(/unrecognised event type/i);
    expect(line).toContain('future_event_kind');
    expect(line).not.toMatch(/approved|rejected/i);
  });

  it('still names the event when the payload is missing entirely', () => {
    const event = { ...base, event_type: 'future_event_kind', payload: undefined } as unknown as AuditEvent;
    expect(eventDetail(event)).toContain('future_event_kind');
  });

  it('leaves known event types unchanged', () => {
    const event = {
      ...base,
      event_type: 'control_ownership_assigned',
      payload: { type: 'control_ownership_assigned', verdict_id: 'v', control_id: 'CTRL-X', owner_name: 'Sam', target_date: '2026-10-01' },
    } as unknown as AuditEvent;
    expect(eventDetail(event)).toMatch(/Control CTRL-X assigned to Sam/);
  });
});

// R16-D2 §5/§8 (F2C-6). A zero-correction resubmission writes
// verdict_corrected with no graph_corrected events — eventDetail renders
// it as a re-check, never implying something changed.
describe('RegisterDetail eventDetail — verdict_corrected zero-change rendering (R16-D2 §8, F2C-6)', () => {
  const base = {
    event_id: 'e-1',
    use_case_id: 'uc-1',
    occurred_at: '2026-09-28T10:00:00.000Z',
    actor: 'system',
    hash: 'h',
    prev_hash: null,
  };
  const newVerdict = {
    status: 'approved_with_controls',
    tier: 'High',
    track: 'II',
    binding_constraint: 'INV-X',
  };

  it('TC-R16-D2-40: corrections_count 0 renders "Re-checked — no answers changed." ahead of the usual status line', () => {
    const event = {
      ...base,
      event_type: 'verdict_corrected',
      payload: { type: 'verdict_corrected', original_verdict_id: 'v-1', new_verdict: newVerdict, corrections_count: 0 },
    } as unknown as AuditEvent;
    const line = eventDetail(event);
    expect(line).toMatch(/^Re-checked — no answers changed\./);
    expect(line).toMatch(/Supersedes verdict v-1/);
  });

  it('TC-R16-D2-41: corrections_count > 0 renders the usual status line, with no "Re-checked" wording', () => {
    const event = {
      ...base,
      event_type: 'verdict_corrected',
      payload: { type: 'verdict_corrected', original_verdict_id: 'v-1', new_verdict: newVerdict, corrections_count: 2 },
    } as unknown as AuditEvent;
    expect(eventDetail(event)).not.toMatch(/Re-checked/);
  });

  it('TC-R16-D2-42: a legacy event with no corrections_count field at all renders the usual status line, honestly never claimed as a re-check', () => {
    const event = {
      ...base,
      event_type: 'verdict_corrected',
      payload: { type: 'verdict_corrected', original_verdict_id: 'v-1', new_verdict: newVerdict },
    } as unknown as AuditEvent;
    expect(eventDetail(event)).not.toMatch(/Re-checked/);
  });
});

// R16-D2 §4 (D-81). Both graph_confirmed and verdict_corrected add an
// assumptions count when present, grammatically singular/plural, never
// claimed when absent or empty.
describe('RegisterDetail eventDetail — assumptions count (R16-D2 §4, D-81)', () => {
  const base = {
    event_id: 'e-1',
    use_case_id: 'uc-1',
    occurred_at: '2026-09-28T10:00:00.000Z',
    actor: '1LoD',
    hash: 'h',
    prev_hash: null,
  };
  const assumption = { questionId: '9', question: 'q?', shortLabel: 'q?', assumption: 'a', fields: ['output_reversibility'] };

  it('TC-R16-D2-57: graph_confirmed with two assumptions says "2 answers were "Not sure"."', () => {
    const event = {
      ...base,
      event_type: 'graph_confirmed',
      payload: { type: 'graph_confirmed', graph_id: 'g1', graph_version: 1, corrections_count: 0, assumptions: [assumption, assumption] },
    } as unknown as AuditEvent;
    expect(eventDetail(event)).toMatch(/2 answers were “Not sure”\./);
  });

  it('TC-R16-D2-57b: graph_confirmed with exactly one assumption uses the singular "1 answer was"', () => {
    const event = {
      ...base,
      event_type: 'graph_confirmed',
      payload: { type: 'graph_confirmed', graph_id: 'g1', graph_version: 1, corrections_count: 0, assumptions: [assumption] },
    } as unknown as AuditEvent;
    expect(eventDetail(event)).toMatch(/1 answer was “Not sure”\./);
  });

  it('TC-R16-D2-57c: graph_confirmed with no assumptions at all adds nothing', () => {
    const event = {
      ...base,
      event_type: 'graph_confirmed',
      payload: { type: 'graph_confirmed', graph_id: 'g1', graph_version: 1, corrections_count: 0 },
    } as unknown as AuditEvent;
    expect(eventDetail(event)).not.toMatch(/Not sure/);
  });

  it('TC-R16-D2-58: verdict_corrected with assumptions also adds the count, on the correction\'s own', () => {
    const event = {
      ...base,
      event_type: 'verdict_corrected',
      payload: {
        type: 'verdict_corrected',
        original_verdict_id: 'v-1',
        new_verdict: { status: 'approved_with_controls', tier: 'High', track: 'II', binding_constraint: 'INV-X' },
        corrections_count: 1,
        assumptions: [assumption],
      },
    } as unknown as AuditEvent;
    expect(eventDetail(event)).toMatch(/1 answer was “Not sure”\./);
  });
});
