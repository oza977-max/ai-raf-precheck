import { openAuditDb, createWriteQueue } from './db';
import type { AuditEvent } from './types';

// Monotonic tie-breaker (P4-C04 review finding): two audit events can be
// written within the same millisecond (e.g. graph_confirmed immediately
// followed by verdict_produced in the confirm-and-evaluate handler).
// Date.toISOString() only has millisecond resolution, so occurred_at alone
// is not a sufficient sort key — ties fall back to IndexedDB's undefined
// primary-key ordering, silently breaking chronological readback. append()
// is the sole write path; tracking the last-used timestamp in module state
// and bumping by 1ms on collision guarantees strictly increasing
// occurred_at values for events written in the same tab session, which is
// exactly the scenario where collisions occur (a fast confirm-and-evaluate
// sequence, not events minutes apart).
//
// code-review-005 F15: `undefined` means "not yet restored from the DB this
// session" — mirrors the tip hint below. A fresh page load used to start
// this at 0, so on a machine whose clock trails the sender's, a new local
// event could get a monotonic timestamp EARLIER than an imported event it
// actually comes after, corrupting sort-by-time order (and, before this
// round, the LIVE chain tip lookup too — see freshTip). freshTip()
// restores the true floor — the stored trail's own maximum occurred_at —
// the first time it is needed after a fresh load, exactly like
// it also restores the hash tip.
//
// CR7-05: the clock floor, the chain-tip hash and the stored event count now
// live in ONE cached hint (`tip`, below) so a single rescan refreshes all
// three together.

// code-review-005 F4: a malformed occurred_at (e.g. from a bundle that
// somehow reached this layer without going through handoff.ts's import
// validation) must never poison the monotonic counter with NaN — every
// later append() computes `new Date(NaN).toISOString()`, which throws, and
// the WHOLE session's writes fail until reload. Treating an unparseable
// timestamp as "no information" (0) rather than letting it propagate keeps
// the counter finite and the clock strictly monotonic regardless of what a
// caller hands in.
function safeTimeMs(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

// CR7-05: the tip hint. `count` is the number of stored events the hint was
// taken at; the locked append compares it with `db.count('audit_events')` (an
// O(1) call) and rescans (O(n), the existing chainOrder) only when another
// tab — or any path that did not refresh the hint — has changed the table.
// CR8-07: an equal count alone is not trusted. The hint also remembers the
// tip event's id and hash; when counts match, the stored event with that id
// must still exist with the same hash AND no stored event may name that hash
// as its prev_hash (the tip is still the newest) — otherwise rescan. That
// catches another tab's replace, or delete-then-append, that left the same
// number of events. The "still newest" check reads the table (no prev_hash
// index; none added — no schema bump). Still undetected, documented: a change
// that keeps the count, the tip event and its newest-ness while altering
// earlier events — an append lands on the real tip either way, and
// verifyChain() is what finds the earlier edit.
interface TipHint {
  hash: string | null;
  /** event_id of the tip event (null for an empty trail). */
  eventId: string | null;
  ms: number;
  count: number;
}
let tip: TipHint | undefined; // undefined = not yet loaded this session

async function freshTip(): Promise<TipHint> {
  const db = await openAuditDb();
  const count = await db.count('audit_events');
  if (tip !== undefined && tip.count === count) {
    if (tip.eventId === null) return tip; // empty trail, still empty
    const stored = await db.get('audit_events', tip.eventId);
    if (stored !== undefined && stored.hash === tip.hash) {
      // The tip must also still be the NEWEST event: no stored event may name
      // its hash as prev_hash (another tab could have deleted an earlier event
      // and appended, leaving the count equal). There is no prev_hash index, so
      // this is a getAll (O(n) on the count-equal path).
      const all = await db.getAll('audit_events');
      if (!all.some((e) => e.prev_hash === tip!.hash)) return tip;
    }
  }
  const all = await db.getAll('audit_events');
  const ordered = chainOrder(all);
  const last = ordered.at(-1);
  tip = {
    hash: last?.hash ?? null,
    eventId: last?.event_id ?? null,
    ms: all.reduce((m, e) => Math.max(m, safeTimeMs(e.occurred_at)), 0),
    count: all.length,
  };
  return tip;
}

// Hash chain (explore-007 D-001). One chain across the WHOLE trail, not per
// use case — a deletion or edit anywhere breaks the chain from that point
// on, regardless of which use case the tampered event belonged to. Module
// state caches the last-written hash within a tab session; a fresh page
// load recovers it from the DB itself (see freshTip below), so the
// chain survives reloads.

// Exported for store/handoff.ts's bundle seal (a hash over the register +
// audit tip). The chain's own hashing stays internal; this is the one
// primitive the seal reuses so both live in one place.
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Deterministic content string for hashing — field order fixed here rather
// than relying on JSON.stringify's key order (which follows insertion
// order and would silently change the hash if a payload's fields were ever
// reordered in a future edit without the event's actual content changing).
function eventContent(e: Omit<AuditEvent, 'prev_hash' | 'hash'>): string {
  return [e.event_id, e.use_case_id, e.event_type, e.occurred_at, e.actor, JSON.stringify(e.payload)].join('|');
}

// code-review-005 F15: reconstructs the TRUE chain order by following
// prev_hash -> hash links from genesis, instead of trusting occurred_at.
// Hash links are clock-independent, so this is immune to clock skew between
// machines — the actual bug (a reload restoring the wrong tip, or a receiving
// machine's clock trailing the sender's, could make time-sort disagree with
// the real chain order and trip a false "chain integrity FAILED"). Returns
// null when the events do NOT form one unbroken line from a single genesis
// (a real gap, a real fork, or more than one genesis claim) — callers fall
// back to time order ONLY to report/display something in that case; they
// never treat the fallback order as proof of anything.
function orderByHashChain(events: readonly AuditEvent[]): AuditEvent[] | null {
  if (events.length === 0) return [];
  const byPrevHash = new Map<string | null, AuditEvent[]>();
  for (const e of events) {
    const bucket = byPrevHash.get(e.prev_hash);
    if (bucket) bucket.push(e);
    else byPrevHash.set(e.prev_hash, [e]);
  }
  const genesisBucket = byPrevHash.get(null);
  if (!genesisBucket || genesisBucket.length !== 1) return null;

  const ordered: AuditEvent[] = [];
  const seen = new Set<string>();
  let current: AuditEvent | undefined = genesisBucket[0];
  while (current) {
    if (seen.has(current.event_id)) return null; // cycle guard — should be unreachable
    seen.add(current.event_id);
    ordered.push(current);
    const next = byPrevHash.get(current.hash);
    if (!next || next.length !== 1) {
      current = undefined;
    } else {
      current = next[0];
    }
  }
  return ordered.length === events.length ? ordered : null;
}

function chainOrder(events: readonly AuditEvent[]): AuditEvent[] {
  return orderByHashChain(events) ?? [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
}

// Callers never compute prev_hash/hash themselves — append() is the sole
// write path (verdict-audit.md §4.4) and the sole place the chain is
// extended, exactly like it was already the sole place occurred_at
// collisions were resolved.
export type AuditEventInput = Omit<AuditEvent, 'prev_hash' | 'hash'>;

// A hash chain is fundamentally sequential: two concurrent append() calls
// could both read the same tip before either writes, producing
// two events with an identical prev_hash — not tampering, but a real fork
// that would make verifyChain() report a false break for the second event.
// Every write (and, since code-review-005, every read that must not see a
// torn store mid-write — F5/F18) is queued onto this promise chain so they
// happen strictly one at a time, no matter how many callers invoke them
// concurrently in this tab; createWriteQueue additionally takes a named
// cross-tab lock where the browser supports one (db.ts).
const enqueue = createWriteQueue('aigate-audit-write');

// code-review-005 round 2, N3. register.ts's updateLifecycleStage used to
// hold the REGISTER queue and await this module's append() (audit) from
// inside it; handoff.ts's replaceWithBundle took the audit queue and the
// register queue as two separate, UN-nested calls with a gap between them a
// concurrent write could land in. Both are the same defect wearing different
// clothes: without one fixed nesting order, two operations that each touch
// both queues can deadlock if they nest in opposite directions (A holds
// audit, awaits register; B holds register, awaits audit — neither call can
// ever resolve), and short of an outright deadlock, leaving the two queues
// un-nested lets a third write land in the gap and leave the two stores
// disagreeing — the exact "audit trail records a change the register no
// longer shows" bug N3 reproduces.
//
// The fixed rule, with no exception anywhere in this codebase: AUDIT OUTER,
// REGISTER INNER, always nested (never two separate top-level calls when one
// logical operation must touch both stores). withAuditQueue() is how a
// caller (register.ts's updateLifecycleStage; handoff.ts's replaceWithBundle
// / importBundle / finishRegisterReplace) holds this queue across a nested
// call into register.ts's own queue (enqueueRegister).
//
// A caller already inside withAuditQueue() must use the *WithinQueue
// siblings below (appendWithinQueue, backupAndReplaceAllRawEventsWithinQueue,
// importTailIfContinuesWithinQueue, currentTipWithinQueue) rather than the
// plain, self-queuing versions — calling a self-queuing function (which
// calls enqueue() again) from inside a callback this SAME queue is already
// running would schedule the new turn after the current one, which is the
// one awaiting it: a real deadlock, not a hypothetical one.
export function withAuditQueue<T>(fn: () => Promise<T>): Promise<T> {
  return enqueue(fn);
}

async function appendUnqueued(event: AuditEventInput): Promise<void> {
  try {
    await appendOnce(event);
  } catch (err) {
    // A `blocking` close (db.ts — another tab or a reset wants the database)
    // can land between taking the handle and writing. Nothing was written, so
    // retry ONCE: openAuditDb() reopens, and freshTip() recounts and rescans.
    if (err instanceof DOMException && err.name === 'InvalidStateError') {
      await appendOnce(event);
      return;
    }
    throw err;
  }
}

async function appendOnce(event: AuditEventInput): Promise<void> {
  const db = await openAuditDb();
  const current = await freshTip();
  const ms = Math.max(safeTimeMs(event.occurred_at), current.ms + 1);
  const occurred_at = new Date(ms).toISOString();
  const prev_hash = current.hash;
  const withoutHash = { ...event, occurred_at };
  const hash = await sha256Hex((prev_hash ?? 'GENESIS') + '|' + eventContent(withoutHash));
  await db.add('audit_events', { ...withoutHash, prev_hash, hash });
  tip = { hash, eventId: event.event_id, ms, count: current.count + 1 };
}

// db.add() not db.put() — duplicate event_id throws ConstraintError rather than
// silently overwriting. Append-only discipline (verdict-audit.md §4.4).
export function append(event: AuditEventInput): Promise<void> {
  return enqueue(() => appendUnqueued(event));
}

// For a caller already holding this queue via withAuditQueue() —
// register.ts's updateLifecycleStage is the one production call site. See
// the withAuditQueue doc above for why this must never be replaced by a call
// to the plain append() from inside that callback.
export function appendWithinQueue(event: AuditEventInput): Promise<void> {
  return appendUnqueued(event);
}

// Per-use-case read. Chain-ordered (F15) rather than blindly time-sorted, so
// a clock-skewed import cannot make a use case's own timeline print out of
// causal order even though nothing about it is actually broken. Not routed
// through the write queue — reading the WHOLE table just to filter it is
// already what this did before, and register.ts calls it once per row in
// getUseCases(); queuing every one of those against the write queue would
// only add latency with no correctness benefit for a plain read used
// throughout the app outside the hand-off path.
export async function getAll(useCaseId: string): Promise<AuditEvent[]> {
  const db = await openAuditDb();
  const all = await db.getAll('audit_events');
  return chainOrder(all).filter((e) => e.use_case_id === useCaseId);
}

// TEST-ONLY (RG-8 hand-off tests). The chain's live state — the cached tip
// hash, the monotonic-timestamp floor, the write queue — is module-global
// so it survives page reloads within a tab. To simulate a SECOND machine in
// one test process this state must be reset to genesis alongside wiping the
// DBs (__resetDbsForTests). Not a runtime path.
export function __resetChainStateForTests(): void {
  tip = undefined;
  // The queue itself is recreated implicitly: nothing references the old
  // closure's `queue` variable once every caller in a test has finished
  // awaiting it, and freshMachine() (the tests' helper) never overlaps two
  // "machines" in flight against each other, so no explicit reset is needed
  // here beyond the module-state above.
}

// Full export — no index filter. Consumed by 2LoD export (RG-4/RG-5) and by
// the hand-off bundle (RG-8, store/handoff.ts). Chain-ordered (F15), and
// routed through the write queue (F18) so a concurrent local write cannot
// produce a torn read — the bundle either reflects the state strictly
// before or strictly after that write, never a mix.
export function getAllForExport(): Promise<AuditEvent[]> {
  return enqueue(async () => {
    const db = await openAuditDb();
    const all = await db.getAll('audit_events');
    return chainOrder(all);
  });
}

// Is `a` a prefix of `b`? Two chains are prefix-compatible on the shorter
// length when every event over that span is byte-identical (same id, same
// stored prev_hash and hash). Because hashes are content-derived, matching
// hashes over a span means matching content over that span — so this is a
// full structural-equality check, not just an id check. Kept here (rather
// than in handoff.ts, where the concept is USED) because code-review-005 F5
// requires the whole read-check-write to run as one queued step, and only
// this module owns the queue that write must go through.
function chainPrefixMatch(a: readonly AuditEvent[], b: readonly AuditEvent[]): boolean {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.event_id !== y.event_id || x.prev_hash !== y.prev_hash || x.hash !== y.hash) return false;
  }
  return true;
}

export type ImportTailOutcome =
  | { kind: 'diverged' }
  | { kind: 'local_ahead' }
  | { kind: 'up_to_date' }
  | { kind: 'imported'; added: number };

// code-review-005 F5, restructured round 2 (N3): the single entry point for
// landing an already-verified incoming chain (`bundleEvents`, chain-ordered,
// seal- and hash-checked by the CALLER before this is ever reached — this
// function does not repeat that work). Everything that decides WHETHER to
// write and then the write itself happens as one unbroken step: the local
// chain is read, compared, and — if and only if it is still prefix-compatible
// AT THIS EXACT MOMENT — extended, with no other queued operation able to run
// in between the read and the write. This closes the gap the old code had: it
// read the local chain, decided, and wrote as three separate un-queued steps,
// so a second import, a local append(), or (via the cross-tab lock in db.ts)
// another tab's write could land in the gap and make the eventual write
// attach to a tip that had already moved — not tampering, but the same kind
// of fork concurrent append() calls are already guarded against.
// `local.length === 0` naturally falls through the same logic as any other
// prefix match (the "prefix" of an empty array matches everything), so this
// one primitive covers what used to be two separately-raced special cases
// (adopting into an empty register, and merging a tail onto a non-empty one).
//
// Round 2 (N3): this is now the *WithinQueue* primitive — it does NOT enqueue
// itself. The caller (handoff.ts's importBundle) wraps the whole operation
// (this call, THEN its nested register.importRegister call) in ONE
// withAuditQueue() turn, so the audit merge and the register merge that must
// go with it can no longer be split by a concurrent write landing in the gap
// between two separate top-level calls — see withAuditQueue's doc above.
export function importTailIfContinuesWithinQueue(bundleEvents: readonly AuditEvent[]): Promise<ImportTailOutcome> {
  return (async () => {
    const db = await openAuditDb();
    const all = await db.getAll('audit_events');
    const local = chainOrder(all);

    if (!chainPrefixMatch(local, bundleEvents)) return { kind: 'diverged' };
    if (bundleEvents.length < local.length) return { kind: 'local_ahead' };
    if (bundleEvents.length === local.length) return { kind: 'up_to_date' };

    const tail = bundleEvents.slice(local.length);
    const tx = db.transaction('audit_events', 'readwrite');
    for (const e of tail) {
      // db.add() (not put()): a duplicate event_id here means the prefix
      // check above was wrong — fail loudly rather than overwrite.
      await tx.store.add(e);
    }
    await tx.done;
    tip = undefined; // rescanned (hash, floor, count) on the next append
    return { kind: 'imported', added: tail.length };
  })();
}

// The chain tip as it stands RIGHT NOW, for a caller already holding the
// audit queue (withAuditQueue) that needs to compare "what's here now"
// against a value it recorded earlier — handoff.ts's replaceWithBundle (N2:
// does the current tip still match what the backup actually exported?) and
// finishRegisterReplace (N1: has anything else touched the audit trail since
// the partial replace this is finishing?). Both count AND hash are returned
// because the finding this closes asks for both — a hash collision is
// practically impossible, but the count is a cheap, legible second signal
// for anyone reading a failure message or a test assertion.
async function currentTipUnqueued(): Promise<{ hash: string | null; count: number }> {
  const db = await openAuditDb();
  const all = await db.getAll('audit_events');
  const ordered = chainOrder(all);
  return { hash: ordered.at(-1)?.hash ?? null, count: ordered.length };
}

export function currentTipWithinQueue(): Promise<{ hash: string | null; count: number }> {
  return currentTipUnqueued();
}

export type ReplaceAllRawEventsOutcome =
  | { kind: 'replaced'; discarded: AuditEvent[] }
  // code-review-005 round 2, N2: the caller's `expectedCurrentTip` (the tip
  // it recorded when it actually built the backup file, hash + count) no
  // longer matches what is about to be discarded — something wrote to the
  // audit trail after the backup was taken (the reachable-in-one-tab case:
  // the case page renders inside RegisterView, so a user can open a case and
  // sign it off while a pending replace is still awaiting confirmation).
  // Refused, nothing written — the caller's backup file no longer covers
  // everything replacing would discard, so it can no longer honestly claim
  // "your previous register is in the backup file you saved".
  | { kind: 'backup_out_of_date'; currentTip: { hash: string | null; count: number } };

// code-review-005 F16 (backup-then-replace as one queued step) + round 2 N2
// (refuse a stale backup) + round 2 N3 (this is the *WithinQueue* primitive —
// see importTailIfContinuesWithinQueue's doc for why it no longer enqueues
// itself, and withAuditQueue's doc for the one nesting order this codebase
// uses). Reads what is about to be discarded and, if `expectedCurrentTip` is
// given and still matches, replaces it with `events`, returning the
// discarded (chain-ordered) events; otherwise refuses with
// 'backup_out_of_date' and writes nothing. Doing the "read for backup", the
// staleness check, and the "clear + rewrite" as one unbroken step (rather
// than three separate calls) means nothing else touching this store can run
// between the read and the clear — the backup this function returns, and the
// tip it checks against, are exactly what existed the instant before any
// write here, never what existed whenever some earlier, separate read
// happened to run. HAND-OFF REPLACE ONLY (store/handoff.ts
// replaceWithBundle/finishRegisterReplace) — this discards evidence, and the
// caller must already have verified the incoming bundle's seal and chain,
// and have put the discarded copy this function returns somewhere the user
// can get it back from before this is called.
export function backupAndReplaceAllRawEventsWithinQueue(
  events: readonly AuditEvent[],
  expectedCurrentTip?: { hash: string | null; count: number },
): Promise<ReplaceAllRawEventsOutcome> {
  return (async () => {
    const db = await openAuditDb();
    const tx = db.transaction('audit_events', 'readwrite');
    const discarded = await tx.store.getAll();
    if (expectedCurrentTip) {
      const ordered = chainOrder(discarded);
      const currentTip = { hash: ordered.at(-1)?.hash ?? null, count: ordered.length };
      if (currentTip.hash !== expectedCurrentTip.hash || currentTip.count !== expectedCurrentTip.count) {
        // Read-only so far (tx.store.getAll()) — letting the transaction
        // finish here commits no write.
        await tx.done;
        return { kind: 'backup_out_of_date', currentTip };
      }
    }
    await tx.store.clear();
    for (const e of events) await tx.store.add(e);
    await tx.done;
    tip = undefined; // rescanned (hash, floor, count) on the next append
    return { kind: 'replaced', discarded: chainOrder(discarded) };
  })();
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  brokenAtEventId?: string;
  reason?: string;
}

// Walks the WHOLE trail in append order and recomputes every hash from its
// stored content and the previous event's stored hash, comparing against
// what was actually persisted. Detects: an edited field, a deleted event THAT
// HAS LATER EVENTS AFTER IT (the chain after the gap no longer matches its
// recorded prev_hash), or a reordered event. Does NOT detect removing the
// NEWEST events (nothing follows them to disagree — TC-CR8-04b pins this), nor
// a full, internally-consistent rewrite by an attacker with the ability to
// recompute every downstream hash — both need an external anchor this
// client-side store does not have (see the type comment on AuditEvent.hash). getAllForExport() now supplies
// chain-linked order rather than time order (F15), so this is immune to
// clock skew between machines raising a false alarm.
export async function verifyChain(): Promise<ChainVerification> {
  return verifyChainOf(await getAllForExport());
}

// The same full walk over an ARBITRARY, already-ordered event array — used
// by verifyChain (over the live DB) and by hand-off import (over an incoming
// bundle's events, before any of them touch the local store). One chain-walk
// implementation, two callers (Brooks: conceptual integrity). Verifies BOTH
// the prev_hash linkage AND each event's stored hash against its recomputed
// content, so a payload edited in transit without recomputing the tip is
// still caught here even though it leaves the linkage intact.
export async function verifyChainOf(events: readonly AuditEvent[]): Promise<ChainVerification> {
  let expectedPrev: string | null = null;
  for (const e of events) {
    if (e.prev_hash !== expectedPrev) {
      return { ok: false, checked: events.length, brokenAtEventId: e.event_id, reason: 'prev_hash does not match the preceding event' };
    }
    const recomputed = await sha256Hex((e.prev_hash ?? 'GENESIS') + '|' + eventContent(e));
    if (recomputed !== e.hash) {
      return { ok: false, checked: events.length, brokenAtEventId: e.event_id, reason: 'stored hash does not match this event’s own content' };
    }
    expectedPrev = e.hash;
  }
  return { ok: true, checked: events.length };
}

// TEST-ONLY (code-review-005 F2/F15). Re-derives a VALID hash chain for an
// arbitrary, already content-edited event sequence — i.e. exactly what
// someone with the file and no external anchor could rebuild by hand. This
// exists so the test suite can PROVE the documented limit ("the seal is an
// unkeyed hash anyone holding the file can recompute — it is not a
// signature, and does not prove who produced the file") with a real forged
// bundle that a fresh import accepts, rather than only asserting the limit
// in prose. Not a runtime path: no production code needs to rebuild a chain
// from scratch, because append() and importTailIfContinuesWithinQueue() only
// ever extend one. `startingPrevHash` defaults to null (a fresh genesis) but a
// test simulating an existing, non-empty chain (e.g. F15's clock-skew test)
// must pass the CURRENT real tip, or this would mint a second "genesis"
// (prev_hash: null) event and break the very chain it is trying to extend.
export async function __recomputeChainForTests(
  events: readonly Omit<AuditEvent, 'prev_hash' | 'hash'>[],
  startingPrevHash: string | null = null,
): Promise<AuditEvent[]> {
  const result: AuditEvent[] = [];
  let prev: string | null = startingPrevHash;
  for (const e of events) {
    const hash = await sha256Hex((prev ?? 'GENESIS') + '|' + eventContent(e));
    result.push({ ...e, prev_hash: prev, hash });
    prev = hash;
  }
  return result;
}
