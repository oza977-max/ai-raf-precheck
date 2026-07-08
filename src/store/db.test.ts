import { describe, it, expect } from 'vitest';
import { openAuditDb } from './db';

describe('openAuditDb', () => {
  it('writes a real row and reads it back (boundary proof)', async () => {
    const db = await openAuditDb();

    const event = {
      event_id: 'evt-1',
      use_case_id: 'uc-1',
      event_type: 'skeleton_test' as const,
      occurred_at: new Date().toISOString(),
    };

    await db.add('audit_events', event);
    const rows = await db.getAllFromIndex('audit_events', 'by_use_case', 'uc-1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(event);
  });

  it('throws ConstraintError on duplicate event_id (append-only guarantee)', async () => {
    const db = await openAuditDb();
    const event = {
      event_id: 'evt-dup',
      use_case_id: 'uc-2',
      event_type: 'skeleton_test' as const,
      occurred_at: new Date().toISOString(),
    };

    await db.add('audit_events', event);
    await expect(db.add('audit_events', event)).rejects.toThrow();
  });
});
