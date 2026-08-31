import { openAuditDb } from './db';
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
let lastOccurredAtMs = 0;

function monotonicOccurredAt(requested: string): string {
  const requestedMs = new Date(requested).getTime();
  const ms = Math.max(requestedMs, lastOccurredAtMs + 1);
  lastOccurredAtMs = ms;
  return new Date(ms).toISOString();
}

// Hash chain (explore-007 D-001). One chain across the WHOLE trail, not per
// use case — a deletion or edit anywhere breaks the chain from that point
// on, regardless of which use case the tampered event belonged to. Module
// state caches the last-written hash within a tab session; a fresh page
// load recovers it from the DB itself (see lastChainHash below), so the
// chain survives reloads.
let cachedLastHash: string | null | undefined; // undefined = not yet loaded this session

async function sha256Hex(input: string): Promise<string> {
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

async function lastChainHash(): Promise<string | null> {
  if (cachedLastHash !== undefined) return cachedLastHash;
  const db = await openAuditDb();
  const all = await db.getAll('audit_events');
  if (all.length === 0) {
    cachedLastHash = null;
    return null;
  }
  const latest = [...all].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)).at(-1)!;
  cachedLastHash = latest.hash;
  return cachedLastHash;
}

// Callers never compute prev_hash/hash themselves — append() is the sole
// write path (verdict-audit.md §4.4) and the sole place the chain is
// extended, exactly like it was already the sole place occurred_at
// collisions were resolved.
export type AuditEventInput = Omit<AuditEvent, 'prev_hash' | 'hash'>;

// A hash chain is fundamentally sequential: two concurrent append() calls
// could both read the same lastChainHash() before either writes, producing
// two events with an identical prev_hash — not tampering, but a real fork
// that would make verifyChain() report a false break for the second event.
// Every append() is queued onto this promise chain so writes — and the
// chain-extending read-then-write they each do — happen strictly one at a
// time, no matter how many callers invoke append() concurrently.
let writeQueue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, fn);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

// db.add() not db.put() — duplicate event_id throws ConstraintError rather than
// silently overwriting. Append-only discipline (verdict-audit.md §4.4).
export function append(event: AuditEventInput): Promise<void> {
  return enqueue(async () => {
    const db = await openAuditDb();
    const occurred_at = monotonicOccurredAt(event.occurred_at);
    const prev_hash = await lastChainHash();
    const withoutHash = { ...event, occurred_at };
    const hash = await sha256Hex((prev_hash ?? 'GENESIS') + '|' + eventContent(withoutHash));
    await db.add('audit_events', { ...withoutHash, prev_hash, hash });
    cachedLastHash = hash;
  });
}

export async function getAll(useCaseId: string): Promise<AuditEvent[]> {
  const db = await openAuditDb();
  const events = await db.getAllFromIndex('audit_events', 'by_use_case', useCaseId);
  return events.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
}

// Full export — no index filter. Consumed by 2LoD export (RG-4/RG-5).
export async function getAllForExport(): Promise<AuditEvent[]> {
  const db = await openAuditDb();
  const events = await db.getAll('audit_events');
  return events.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  brokenAtEventId?: string;
  reason?: string;
}

// Walks the WHOLE trail in append order and recomputes every hash from its
// stored content and the previous event's stored hash, comparing against
// what was actually persisted. Detects: an edited field, a deleted event
// (the chain after the gap no longer matches its recorded prev_hash), or a
// reordered event. Does NOT detect a full, internally-consistent rewrite by
// an attacker with the ability to recompute every downstream hash — that
// requires an external anchor this client-side store does not have (see
// the type comment on AuditEvent.hash).
export async function verifyChain(): Promise<ChainVerification> {
  const events = await getAllForExport();
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
