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

// db.add() not db.put() — duplicate event_id throws ConstraintError rather than
// silently overwriting. Append-only discipline (verdict-audit.md §4.4).
export async function append(event: AuditEvent): Promise<void> {
  const db = await openAuditDb();
  await db.add('audit_events', { ...event, occurred_at: monotonicOccurredAt(event.occurred_at) });
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
