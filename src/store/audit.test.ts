import { describe, it, expect } from 'vitest';
import { append, getAll } from './audit';

describe('audit store', () => {
  it('append() writes a real row, getAll() reads it back', async () => {
    const event = {
      event_id: 'evt-audit-1',
      use_case_id: 'uc-audit-1',
      event_type: 'skeleton_test' as const,
      occurred_at: new Date().toISOString(),
    };

    await append(event);
    const rows = await getAll('uc-audit-1');

    expect(rows).toEqual([event]);
  });
});
