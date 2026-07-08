import { describe, it, expect } from 'vitest';
import { append, getAll, getAllForExport } from './audit';

describe('audit store', () => {
  it('append() writes a real row, getAll() reads it back', async () => {
    const event = {
      event_id: 'evt-audit-1',
      use_case_id: 'uc-audit-1',
      event_type: 'use_case_created' as const,
      occurred_at: new Date().toISOString(),
      actor: 'user-1',
      payload: { type: 'use_case_created' as const, description: 'A tool', intake_method: 'llm' as const },
    };

    await append(event);
    const rows = await getAll('uc-audit-1');

    expect(rows).toEqual([event]);
  });

  it('getAllForExport() reads all rows across use cases with no index filter', async () => {
    const eventA = {
      event_id: 'evt-export-a',
      use_case_id: 'uc-export-a',
      event_type: 'use_case_created' as const,
      occurred_at: new Date().toISOString(),
      actor: 'user-1',
      payload: { type: 'use_case_created' as const, description: 'Tool A', intake_method: 'llm' as const },
    };
    const eventB = {
      event_id: 'evt-export-b',
      use_case_id: 'uc-export-b',
      event_type: 'use_case_created' as const,
      occurred_at: new Date().toISOString(),
      actor: 'user-2',
      payload: { type: 'use_case_created' as const, description: 'Tool B', intake_method: 'structured_form' as const },
    };

    await append(eventA);
    await append(eventB);

    const rows = await getAllForExport();
    const ids = rows.map((r) => r.event_id);

    expect(ids).toContain('evt-export-a');
    expect(ids).toContain('evt-export-b');
  });
});
