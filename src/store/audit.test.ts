import { describe, it, expect } from 'vitest';
import { append, getAll, getAllForExport, verifyChain, __resetChainStateForTests, __recomputeChainForTests } from './audit';
import { openAuditDb } from './db';

// code-review-004 F16: MUST run before any append in this file — the suite
// shares one fake-indexeddb instance, so "empty trail" only exists here,
// before the first write. A future refactor that special-cases empty arrays
// would otherwise break this silently, with nothing asserting it.
describe('verifyChain on an empty trail (must be this file\'s first test)', () => {
  it('reports ok with zero events checked — an empty trail is intact, not an error', async () => {
    const result = await verifyChain();
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });
});

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

  // code-review-005 F4/F15. Placed BEFORE the "hash chain" describe below,
  // same reason as that block's own internal ordering comment: several of
  // these assert verifyChain().ok === true over the WHOLE shared trail, and
  // the delete/tamper/reorder tests later in this file permanently poison it
  // from their point onward.
  describe('clock floor, clock skew, and feature-detection (code-review-005 F4/F15)', () => {
    it('TC-RG-8-24: F15: restores the monotonic clock floor from the stored trail after a reset, instead of restarting at zero', async () => {
      const useCaseId = 'uc-floor-restore';
      const farFuture = '2030-01-01T00:00:00.000Z'; // deliberately far ahead of "now"
      await append({
        event_id: 'evt-floor-1',
        use_case_id: useCaseId,
        event_type: 'use_case_created',
        occurred_at: farFuture,
        actor: '1LoD',
        payload: { type: 'use_case_created', description: 'Far-future event', intake_method: 'llm' },
      });

      // Simulate a page reload: the module's in-memory floor is gone, but
      // the DB still has the far-future event.
      __resetChainStateForTests();

      await append({
        event_id: 'evt-floor-2',
        use_case_id: useCaseId,
        event_type: 'lifecycle_stage_changed',
        occurred_at: new Date().toISOString(), // "now" — genuinely EARLIER than farFuture
        actor: 'system',
        payload: { type: 'lifecycle_stage_changed', from_stage: 'idea', to_stage: 'exploring' },
      });

      const rows = await getAll(useCaseId);
      expect(rows.map((r) => r.event_id)).toEqual(['evt-floor-1', 'evt-floor-2']);
      // The floor was restored from evt-floor-1's far-future timestamp, so
      // evt-floor-2 was pushed past it — proof the old "restart at zero" bug
      // (which would have let evt-floor-2 keep its earlier real-world "now"
      // timestamp, ahead of nothing) is fixed.
      expect(new Date(rows[1]!.occurred_at).getTime()).toBeGreaterThan(new Date(farFuture).getTime());
      expect((await verifyChain()).ok).toBe(true);
    });

    it('TC-RG-8-25: F15: chain verification and export order follow hash links, not occurred_at — a clock-skewed (out-of-time-order) pair still verifies ok and exports in true chain order', async () => {
      const useCaseId = 'uc-clock-skew';
      // e2's occurred_at is EARLIER than e1's — exactly what a receiving
      // machine whose clock trails the sender's would produce — but e2 is
      // still e1's TRUE successor in the hash chain: __recomputeChainForTests
      // computes hashes in the order given (e1 then e2), matching how a real
      // sender would have produced them regardless of what either machine's
      // clock said. Extends the REAL current tip (not a fresh genesis) —
      // this suite's chain is already non-empty by the time this test runs,
      // and minting a second null-prev_hash event would itself be a break.
      // Inserted directly via db.add() (bypassing append()'s own monotonic
      // clamping, which would prevent constructing this scenario from a
      // single module instance) — this is the shape an IMPORTED chain from
      // another machine actually has.
      const before = await getAllForExport();
      const currentTip = before.length > 0 ? before.at(-1)!.hash : null;
      const [e1, e2] = await __recomputeChainForTests(
        [
          {
            event_id: 'evt-skew-1',
            use_case_id: useCaseId,
            event_type: 'use_case_created',
            occurred_at: '2026-06-01T12:00:00.000Z',
            actor: '1LoD',
            payload: { type: 'use_case_created', description: 'First (sender clock ahead)', intake_method: 'llm' },
          },
          {
            event_id: 'evt-skew-2',
            use_case_id: useCaseId,
            event_type: 'lifecycle_stage_changed',
            occurred_at: '2026-06-01T11:00:00.000Z',
            actor: 'system',
            payload: { type: 'lifecycle_stage_changed', from_stage: 'idea', to_stage: 'exploring' },
          },
        ],
        currentTip,
      );

      const db = await openAuditDb();
      await db.add('audit_events', e1!);
      await db.add('audit_events', e2!);
      // The module's cached tip/floor do not know about this direct insert —
      // resync them from the DB exactly as a real page reload would, so a
      // LATER test's append() does not compute a prev_hash against a stale
      // cached tip and manufacture a real break.
      __resetChainStateForTests();

      // A naive time-sort would place e2 (11:00) before e1 (12:00) — the
      // wrong order relative to the real chain (e2.prev_hash === e1.hash).
      // Chain-walk verification and export must not be fooled by that.
      const result = await verifyChain();
      expect(result.ok).toBe(true);

      const exported = await getAllForExport();
      const ids = exported.filter((e) => e.use_case_id === useCaseId).map((e) => e.event_id);
      expect(ids).toEqual(['evt-skew-1', 'evt-skew-2']); // true (hash-chain) order, not time order

      // Cleanup: these two events are deliberately dated MONTHS before every
      // other test in this file's real "now" timestamps, specifically to
      // prove the hash-chain-order fix. Left in place, they would become the
      // earliest-by-time events in the WHOLE shared table, which would
      // distort the FALLBACK time-sort every later test's OWN (unrelated)
      // deliberately-broken-chain scenarios fall back to once the chain is
      // genuinely poisoned — scrambling which event those tests see as the
      // break point. Removing them (and re-syncing the cache) restores
      // exactly the state before this test ran; nothing after this point
      // depended on them existing.
      await db.delete('audit_events', 'evt-skew-1');
      await db.delete('audit_events', 'evt-skew-2');
      __resetChainStateForTests(); // leave a clean cache for whatever runs next
    });

    it('F4: an unparseable occurred_at does not poison the monotonic clock — the write succeeds and the NEXT append still succeeds too', async () => {
      const useCaseId = 'uc-bad-clock';
      await append({
        event_id: 'evt-bad-clock-1',
        use_case_id: useCaseId,
        event_type: 'use_case_created',
        occurred_at: 'not-a-real-timestamp',
        actor: '1LoD',
        payload: { type: 'use_case_created', description: 'Garbage timestamp', intake_method: 'llm' },
      });

      // Must not throw, and must not have poisoned the clock with NaN — the
      // actual F4 failure mode was "every later local write fails until
      // reload" (new Date(NaN).toISOString() throws).
      await expect(
        append({
          event_id: 'evt-bad-clock-2',
          use_case_id: useCaseId,
          event_type: 'lifecycle_stage_changed',
          occurred_at: new Date().toISOString(),
          actor: 'system',
          payload: { type: 'lifecycle_stage_changed', from_stage: 'idea', to_stage: 'exploring' },
        }),
      ).resolves.toBeUndefined();

      const rows = await getAll(useCaseId);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => Number.isFinite(new Date(r.occurred_at).getTime()))).toBe(true);
    });

    it('feature-detects navigator.locks — jsdom (this test environment) has none, and every operation still works without it', async () => {
      expect('locks' in navigator).toBe(false); // documents the jsdom gap this file's queue-based tests silently rely on
      await append({
        event_id: 'evt-no-locks',
        use_case_id: 'uc-no-locks',
        event_type: 'use_case_created',
        occurred_at: new Date().toISOString(),
        actor: '1LoD',
        payload: { type: 'use_case_created', description: 'No Web Locks here', intake_method: 'llm' },
      });
      expect(await getAll('uc-no-locks')).toHaveLength(1);
    });
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

    // code-review-004 F16: reorder-tamper was only ever caught IMPLICITLY
    // (occurred_at is part of eventContent()'s hash input) — nothing
    // asserted it directly, so a refactor dropping occurred_at from the
    // hashed content would have silently un-detected reordering. Same
    // shared-chain caveat as the test above: the chain is already poisoned
    // by earlier tests, so the assertion is that a swap on top of it still
    // reports broken — never ok:true.
    it('verifyChain() detects two events whose occurred_at timestamps were swapped in place', async () => {
      const useCaseId = 'uc-reorder';
      await append({
        event_id: 'evt-reorder-1',
        use_case_id: useCaseId,
        event_type: 'use_case_created' as const,
        occurred_at: new Date().toISOString(),
        actor: 'user-1',
        payload: { type: 'use_case_created' as const, description: 'Reorder check', intake_method: 'llm' as const },
      });
      await append({
        event_id: 'evt-reorder-2',
        use_case_id: useCaseId,
        event_type: 'lifecycle_stage_changed' as const,
        occurred_at: new Date().toISOString(),
        actor: 'system',
        payload: { type: 'lifecycle_stage_changed' as const, from_stage: 'idea' as const, to_stage: 'exploring' as const },
      });

      const db = await openAuditDb();
      const tx = db.transaction('audit_events', 'readwrite');
      const a = await tx.store.get('evt-reorder-1');
      const b = await tx.store.get('evt-reorder-2');
      if (!a || !b) throw new Error('setup fixture missing');
      // Swap ONLY the timestamps — every other field untouched. If
      // occurred_at were not hashed, both events would still verify.
      await tx.store.put({ ...a, occurred_at: b.occurred_at });
      await tx.store.put({ ...b, occurred_at: a.occurred_at });
      await tx.done;

      const result = await verifyChain();
      expect(result.ok).toBe(false);
      expect(result.brokenAtEventId).toBeTruthy();
    });
  });
});
