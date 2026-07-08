import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AuditEvent } from './types';

// Rule 3 (cross-cutting.md §7): persistence-only, no evaluation logic, no LLM, no React.

interface AuditDbSchema extends DBSchema {
  audit_events: {
    key: string;
    value: AuditEvent;
    indexes: { by_use_case: string };
  };
}

let dbPromise: Promise<IDBPDatabase<AuditDbSchema>> | undefined;

export function openAuditDb(): Promise<IDBPDatabase<AuditDbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<AuditDbSchema>('aigate-audit', 1, {
      upgrade(db) {
        const store = db.createObjectStore('audit_events', { keyPath: 'event_id' });
        store.createIndex('by_use_case', 'use_case_id');
      },
    });
  }
  return dbPromise;
}
