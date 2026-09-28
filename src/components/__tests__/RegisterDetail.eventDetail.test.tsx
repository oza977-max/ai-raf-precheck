import { describe, expect, it } from 'vitest';
import { eventDetail } from '../RegisterDetail';
import type { AuditEvent } from '../../store/types';

// code-review-005 F13: the audit timeline's per-type switch covers every type
// this version knows, but a stored event is data, not a type — one written by
// another version of AIGate, or a damaged record, used to render as a blank
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
