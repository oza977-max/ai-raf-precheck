import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AuditEvent, RegisterNode, RegisterEdge } from './types';

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

interface RegisterDbSchema extends DBSchema {
  register_nodes: {
    key: string;
    value: RegisterNode;
    indexes: { by_type: string; by_submitted_by: string };
  };
  register_edges: {
    key: string;
    value: RegisterEdge;
    indexes: { by_from_node: string; by_to_node: string };
  };
}

let registerDbPromise: Promise<IDBPDatabase<RegisterDbSchema>> | undefined;

export function openRegisterDb(): Promise<IDBPDatabase<RegisterDbSchema>> {
  if (!registerDbPromise) {
    registerDbPromise = openDB<RegisterDbSchema>('aigate-register', 1, {
      upgrade(db) {
        const nodeStore = db.createObjectStore('register_nodes', { keyPath: 'node_id' });
        nodeStore.createIndex('by_type', 'node_type');
        nodeStore.createIndex('by_submitted_by', 'metadata.submitted_by');

        const edgeStore = db.createObjectStore('register_edges', { keyPath: 'edge_id' });
        edgeStore.createIndex('by_from_node', 'from_node_id');
        edgeStore.createIndex('by_to_node', 'to_node_id');
      },
    });
  }
  return registerDbPromise;
}
