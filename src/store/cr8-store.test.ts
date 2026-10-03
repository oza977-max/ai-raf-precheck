import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { RegisterNode } from './types';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
});

const mk = (id: string, uc = 'uc-cr8') => ({
  event_id: id,
  use_case_id: uc,
  event_type: 'use_case_created' as const,
  occurred_at: new Date().toISOString(),
  actor: 'u',
  payload: { type: 'use_case_created' as const, description: 'x', intake_method: 'llm' as const },
});

describe('audit tip hint (CR8-07)', () => {
  // BC-003: real append() through two real module instances. The stale hint is
  // produced the way it happens in life: another tab's replace left the same
  // NUMBER of events with a different tip.
  it('TC-CR8-07: a hint taken at the same count but over a different trail is not trusted', async () => {
    const A = await import('./audit');
    const dbA = await import('./db');
    for (const n of ['a1', 'a2', 'a3']) await A.append(mk(`cr8-07-${n}`));
    await dbA.__resetDbsForTests(); // the other tab's "replace everything"
    vi.resetModules();
    const B = await import('./audit');
    for (const n of ['b1', 'b2', 'b3']) await B.append(mk(`cr8-07-${n}`));

    await A.append(mk('cr8-07-a4')); // A's cached count is 3 — equal to the DB's

    const v = await B.verifyChain();
    expect(v.reason).toBeUndefined();
    expect(v.ok).toBe(true);
    expect((await B.getAllForExport()).map((e) => e.event_id)).toEqual([
      'cr8-07-b1', 'cr8-07-b2', 'cr8-07-b3', 'cr8-07-a4',
    ]);
  });
});

describe('audit tip hint — tip no longer newest (CR8-07b)', () => {
  // Same count, tip event still stored with the same hash, but another tab has
  // since deleted an earlier event and appended a newer one: the hint's tip is
  // no longer the newest. Trusting it forks the chain (two events, one prev_hash).
  it('TC-CR8-07b: a hint whose tip already has a successor is not trusted', async () => {
    const A = await import('./audit');
    for (const n of ['a1', 'a2', 'a3']) await A.append(mk(`cr8-07b-${n}`));
    vi.resetModules();
    const B = await import('./audit');
    const { openAuditDb } = await import('./db');
    const db = await openAuditDb();
    await db.delete('audit_events', 'cr8-07b-a1');
    await B.append(mk('cr8-07b-b4')); // count back to 3

    await A.append(mk('cr8-07b-a5')); // A's hint: count 3, tip a3 present and unchanged

    const all = await db.getAll('audit_events');
    const prevs = all.map((e) => e.prev_hash);
    expect(new Set(prevs).size).toBe(prevs.length); // no fork
  });
});

describe('audit chain limit (CR8-04b)', () => {
  // Pins the honest wording: the check finds edits and non-tail deletions, and
  // CANNOT see the newest events removed. If this ever starts failing, the
  // "removing the newest events is not detectable" comments and notice are
  // stale and must change with it.
  it('TC-CR8-04b: deleting the newest event leaves a chain that still verifies', async () => {
    const A = await import('./audit');
    const { openAuditDb } = await import('./db');
    for (const n of ['1', '2', '3']) await A.append(mk(`cr8-04b-${n}`));
    const db = await openAuditDb();
    await db.delete('audit_events', 'cr8-04b-3');
    const v = await A.verifyChain();
    expect(v.ok).toBe(true);
    expect(v.checked).toBe(2);
  });
});

function useCase(id: string): RegisterNode {
  return {
    node_id: id,
    node_type: 'use_case',
    label: id,
    created_at: new Date().toISOString(),
    metadata: { node_type: 'use_case', submitted_by: '1LoD', lifecycle_stage: 'approved', current_verdict_id: null, tier: 'Low', track: 'I' },
  };
}

describe('overlapping policy saves (CR8-09)', () => {
  it('TC-CR8-09: two onPolicyUpdated calls in flight together queue each case once', async () => {
    const { addNode } = await import('./register');
    const audit = await import('./audit');
    const { onPolicyUpdated } = await import('./policy');
    const ids = ['cr8-09-a', 'cr8-09-b'];
    for (const id of ids) await addNode(useCase(id));

    const [r1, r2] = await Promise.all([onPolicyUpdated('cr8-09-v1'), onPolicyUpdated('cr8-09-v1')]);

    for (const id of ids) {
      const queued = (await audit.getAll(id)).filter((e) => e.event_type === 're_evaluation_queued');
      expect(queued).toHaveLength(1);
    }
    expect(r1.queuedCount + r2.queuedCount).toBe(ids.length);
    expect(r1.alreadyPendingCount + r2.alreadyPendingCount).toBe(ids.length);
  });
});
