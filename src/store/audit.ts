import { openAuditDb } from './db';
import type { AuditEvent } from './types';

// db.add() not db.put() — duplicate event_id throws ConstraintError rather than
// silently overwriting. Append-only discipline (verdict-audit.md §4.4).
export async function append(event: AuditEvent): Promise<void> {
  const db = await openAuditDb();
  await db.add('audit_events', event);
}

export async function getAll(useCaseId: string): Promise<AuditEvent[]> {
  const db = await openAuditDb();
  return db.getAllFromIndex('audit_events', 'by_use_case', useCaseId);
}
