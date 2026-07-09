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

  it('getAll() returns events in chronological order, not IndexedDB primary-key order (P4-C04 review-caught bug)', async () => {
    const useCaseId = 'uc-order-check';
    // event_ids are deliberately chosen so that alphabetical/primary-key
    // order (z... before a...) is the OPPOSITE of chronological order —
    // if getAll() ever regresses to relying on IndexedDB's default
    // index-tie ordering, this test catches it.
    const first = {
      event_id: 'zzz-first-by-id-but-earliest-in-time',
      use_case_id: useCaseId,
      event_type: 'graph_confirmed' as const,
      occurred_at: '2026-01-01T00:00:00.000Z',
      actor: '1LoD',
      payload: { type: 'graph_confirmed' as const, graph_id: 'g1', graph_version: 1, corrections_count: 0 },
    };
    const second = {
      event_id: 'aaa-second-by-id-but-latest-in-time',
      use_case_id: useCaseId,
      event_type: 'lifecycle_stage_changed' as const,
      occurred_at: '2026-01-01T00:00:01.000Z',
      actor: 'system',
      payload: { type: 'lifecycle_stage_changed' as const, from_stage: 'idea' as const, to_stage: 'exploring' as const },
    };

    await append(first);
    await append(second);

    const rows = await getAll(useCaseId);
    expect(rows.map((r) => r.event_id)).toEqual([first.event_id, second.event_id]);
  });

  it('preserves append order even when two events share the exact same occurred_at millisecond (P4-C04 pass-1 finding: reproduced flaky failure, fixed with a monotonic tie-breaker)', async () => {
    const useCaseId = 'uc-collision-check';
    // Literal identical timestamps — the exact collision scenario the
    // fix guards against (graph_confirmed and verdict_produced are often
    // written within the same real-world millisecond).
    const sameInstant = '2026-06-01T12:00:00.000Z';
    const first = {
      event_id: 'evt-collision-first',
      use_case_id: useCaseId,
      event_type: 'graph_confirmed' as const,
      occurred_at: sameInstant,
      actor: '1LoD',
      payload: { type: 'graph_confirmed' as const, graph_id: 'g1', graph_version: 1, corrections_count: 0 },
    };
    const second = {
      event_id: 'evt-collision-second',
      use_case_id: useCaseId,
      event_type: 'lifecycle_stage_changed' as const,
      occurred_at: sameInstant,
      actor: 'system',
      payload: {
        type: 'lifecycle_stage_changed' as const,
        from_stage: 'idea' as const,
        to_stage: 'exploring' as const,
      },
    };

    await append(first);
    await append(second);

    const rows = await getAll(useCaseId);
    expect(rows.map((r) => r.event_id)).toEqual([first.event_id, second.event_id]);
    expect(rows[0]!.occurred_at).not.toBe(rows[1]!.occurred_at); // ties are broken, not just tolerated
  });
});
