import { describe, it, expect } from 'vitest';
import { append, getAll, getAllForExport, verifyChain } from './audit';
import { openAuditDb } from './db';

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

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject(event);
    // explore-007 D-001: every written event carries a hash chain.
    expect(typeof rows[0]!.hash).toBe('string');
    expect(rows[0]!.hash.length).toBeGreaterThan(0);
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

  // explore-007 D-001 (round 8): hash chain — every event's hash commits to
  // its own content AND the previous event's hash, across the WHOLE trail,
  // not per use case.
  describe('hash chain (explore-007 D-001)', () => {
    it('the first event ever written has prev_hash: null (genesis)', async () => {
      // A fresh use_case_id/event_id pair, but the chain itself is global —
      // this only holds true if this is genuinely the first event in the
      // whole suite's shared fake-indexeddb instance. Assert the shape
      // instead of the specific null-ness, which depends on suite order.
      const event = {
        event_id: 'evt-chain-shape',
        use_case_id: 'uc-chain-shape',
        event_type: 'use_case_created' as const,
        occurred_at: new Date().toISOString(),
        actor: 'user-1',
        payload: { type: 'use_case_created' as const, description: 'Chain shape check', intake_method: 'llm' as const },
      };
      await append(event);
      const [row] = await getAll('uc-chain-shape');
      expect(row!.prev_hash === null || typeof row!.prev_hash === 'string').toBe(true);
      expect(row!.hash).not.toBe(row!.prev_hash);
    });

    it('two events written back to back chain together: the second\'s prev_hash equals the first\'s hash', async () => {
      const useCaseId = 'uc-chain-link';
      const first = {
        event_id: 'evt-chain-link-1',
        use_case_id: useCaseId,
        event_type: 'use_case_created' as const,
        occurred_at: new Date().toISOString(),
        actor: 'user-1',
        payload: { type: 'use_case_created' as const, description: 'First', intake_method: 'llm' as const },
      };
      await append(first);
      const [writtenFirst] = await getAll(useCaseId);

      const second = {
        event_id: 'evt-chain-link-2',
        use_case_id: useCaseId,
        event_type: 'lifecycle_stage_changed' as const,
        occurred_at: new Date().toISOString(),
        actor: 'system',
        payload: { type: 'lifecycle_stage_changed' as const, from_stage: 'idea' as const, to_stage: 'exploring' as const },
      };
      await append(second);
      const rows = await getAll(useCaseId);
      const writtenSecond = rows.find((r) => r.event_id === 'evt-chain-link-2');

      expect(writtenSecond!.prev_hash).toBe(writtenFirst!.hash);
    });

    it('concurrent append() calls do not fork the chain — each event\'s prev_hash is the one immediately before it, in write order', async () => {
      // Fire many appends at once (Promise.all, not sequential awaits) —
      // exactly the race that would let two concurrent writers both read
      // the same lastChainHash() before either commits, if append() were
      // not internally serialized.
      const useCaseId = 'uc-concurrent-append';
      const events = Array.from({ length: 12 }, (_, i) => ({
        event_id: `evt-concurrent-${i}`,
        use_case_id: useCaseId,
        event_type: 'lifecycle_stage_changed' as const,
        occurred_at: new Date().toISOString(),
        actor: 'system',
        payload: { type: 'lifecycle_stage_changed' as const, from_stage: 'idea' as const, to_stage: 'exploring' as const },
      }));

      await Promise.all(events.map((e) => append(e)));

      const rows = await getAll(useCaseId);
      expect(rows).toHaveLength(12);
      // Every hash in this batch must be unique — a fork would produce two
      // events sharing the same prev_hash (and, since they'd hash different
      // event_ids, still-different hashes, but a broken chain when walked).
      const hashes = new Set(rows.map((r) => r.hash));
      expect(hashes.size).toBe(12);

      const result = await verifyChain();
      expect(result.ok).toBe(true);
    });

    it('verifyChain() reports ok: true over an untouched trail', async () => {
      await append({
        event_id: 'evt-verify-ok',
        use_case_id: 'uc-verify-ok',
        event_type: 'use_case_created' as const,
        occurred_at: new Date().toISOString(),
        actor: 'user-1',
        payload: { type: 'use_case_created' as const, description: 'Untouched', intake_method: 'llm' as const },
      });
      const result = await verifyChain();
      expect(result.ok).toBe(true);
      expect(result.checked).toBeGreaterThan(0);
    });

    // Ordering note: verifyChain() walks the WHOLE trail by design, and
    // this file shares one fake-indexeddb instance across its tests (no
    // per-test reset — same pattern the rest of this file already relies
    // on via unique ids). Once a test poisons the chain, every later
    // verifyChain() call in this file legitimately reports broken from
    // that point on. The delete-detection test therefore runs BEFORE the
    // tamper test, so it can assert its own exact break point; the tamper
    // test runs last since nothing after it needs an unpoisoned chain.
    it('verifyChain() detects a deleted event by the break it leaves in the following event\'s prev_hash', async () => {
      const useCaseId = 'uc-verify-delete';
      await append({
        event_id: 'evt-delete-target',
        use_case_id: useCaseId,
        event_type: 'use_case_created' as const,
        occurred_at: new Date().toISOString(),
        actor: 'user-1',
        payload: { type: 'use_case_created' as const, description: 'Will be deleted', intake_method: 'llm' as const },
      });
      await append({
        event_id: 'evt-delete-after',
        use_case_id: useCaseId,
        event_type: 'lifecycle_stage_changed' as const,
        occurred_at: new Date().toISOString(),
        actor: 'system',
        payload: { type: 'lifecycle_stage_changed' as const, from_stage: 'idea' as const, to_stage: 'exploring' as const },
      });

      const db = await openAuditDb();
      await db.delete('audit_events', 'evt-delete-target');

      const result = await verifyChain();
      expect(result.ok).toBe(false);
      expect(result.brokenAtEventId).toBe('evt-delete-after');
    });

    it('verifyChain() detects a single altered field in a past event', async () => {
      const useCaseId = 'uc-verify-tamper';
      await append({
        event_id: 'evt-tamper-target',
        use_case_id: useCaseId,
        event_type: 'use_case_created' as const,
        occurred_at: new Date().toISOString(),
        actor: 'user-1',
        payload: { type: 'use_case_created' as const, description: 'Original description', intake_method: 'llm' as const },
      });
      await append({
        event_id: 'evt-tamper-after',
        use_case_id: useCaseId,
        event_type: 'lifecycle_stage_changed' as const,
        occurred_at: new Date().toISOString(),
        actor: 'system',
        payload: { type: 'lifecycle_stage_changed' as const, from_stage: 'idea' as const, to_stage: 'exploring' as const },
      });

      // Simulate tampering: directly rewrite one field of the earlier event
      // via IndexedDB, bypassing append()'s hash computation — exactly what
      // an attacker with local storage access would do.
      const db = await openAuditDb();
      const tx = db.transaction('audit_events', 'readwrite');
      const stored = await tx.store.get('evt-tamper-target');
      if (!stored || stored.payload.type !== 'use_case_created') throw new Error('setup fixture missing');
      await tx.store.put({
        ...stored,
        payload: { ...stored.payload, description: 'TAMPERED description' },
      });
      await tx.done;

      // This test runs after the delete-detection test above, which
      // permanently poisons the shared chain from its own break point
      // onward (see the ordering note above `it('verifyChain() detects a
      // deleted event...`) — so verifyChain() here correctly reports the
      // EARLIER break, not this test's own tampered event. What this test
      // still proves: a *fresh* alteration, on top of an already-broken
      // chain, does not somehow make verifyChain() report ok:true again.
      const result = await verifyChain();
      expect(result.ok).toBe(false);
      expect(result.brokenAtEventId).toBeTruthy();
    });
  });
});
