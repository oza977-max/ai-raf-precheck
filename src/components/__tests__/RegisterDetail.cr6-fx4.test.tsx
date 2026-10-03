import { describe, expect, it } from 'vitest';
import { eventDetail } from '../RegisterDetail';
import type { AuditEvent } from '../../store/types';

// CR6-10 (code review 006): a correction's source (form / review screen /
// question) was recorded but never shown on the register.
describe('RegisterDetail eventDetail — CR6-10: where a correction came from', () => {
  const base = {
    event_id: 'e-1',
    use_case_id: 'uc-1',
    occurred_at: '2026-09-28T10:00:00.000Z',
    actor: '1LoD',
    hash: 'h',
    prev_hash: null,
  };
  function corrected(source?: 'form' | 'review' | 'question'): AuditEvent {
    return {
      ...base,
      event_type: 'graph_corrected',
      payload: {
        type: 'graph_corrected',
        graph_id: 'g1',
        correction: {
          field: 'autonomy_level',
          original_value: 1,
          corrected_value: 2,
          ...(source ? { correction_source: source } : {}),
        },
      },
    } as unknown as AuditEvent;
  }

  it('TC-CR6-10: names the source in plain words; says nothing for an older record without one', () => {
    expect(eventDetail(corrected('form'))).toContain('(from the form)');
    expect(eventDetail(corrected('review'))).toContain('(from the review screen)');
    expect(eventDetail(corrected('question'))).toContain('(from an answer to a question)');
    const older = eventDetail(corrected());
    expect(older).toMatch(/corrected: 1 → 2$/);
    expect(older).not.toMatch(/\(from/);
  });
});
