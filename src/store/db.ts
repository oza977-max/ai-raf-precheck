import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AuditEvent, RegisterNode, RegisterEdge } from './types';

// Rule 3 (cross-cutting.md §7): persistence-only, no evaluation logic, no LLM, no React.

// code-review-005 F5/F16/F17/F18. Both audit.ts and register.ts need the
// same shape of protection around their own store's writes: same-tab calls
// serialised (so a read-then-write, or a backup-then-replace, cannot have
// another write from the SAME store land in the middle of it), and, where
// the browser supports it, a second TAB doing the same kind of operation
// locked out too. db.ts is the one module both already depend on, so the
// factory lives here rather than being copy-pasted into each — one
// implementation, two independently-named locks (audit and register are
// different IndexedDB databases; a lock over one must never block the
// other). Feature-detected: jsdom (this project's test environment) has no
// navigator.locks, so it silently falls back to same-tab-only queuing there
// — every test still passes, just without the cross-tab guarantee jsdom
// cannot exercise anyway.
type Enqueue = <T>(fn: () => Promise<T>) => Promise<T>;

export function createWriteQueue(lockName: string): Enqueue {
  let queue: Promise<unknown> = Promise.resolve();

  function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks) {
      // lib.dom.d.ts types LockGrantedCallback<T> as `(lock) => T`, not
      // `T | PromiseLike<T>` — it does not model the real API's behaviour of
      // awaiting a thenable return value before resolving request()'s own
      // promise. Without this cast TS infers T as `Promise<Inner>` and
      // double-wraps the return type as `Promise<Promise<Inner>>`; the cast
      // is compile-time only; the runtime value is still fn()'s promise,
      // which every implementation of this API does await.
      return locks.request(lockName, () => fn() as unknown as T);
    }
    return fn();
  }

  const enqueue: Enqueue = (fn) => {
    const result = queue.then(() => withCrossTabLock(fn), () => withCrossTabLock(fn));
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return enqueue;
}

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

// TEST-ONLY (RG-8 hand-off tests). Simulating a hand-off between two machines
// in one process requires wiping both IndexedDB databases and dropping the
// cached connections so the next open() rebuilds a fresh, empty store — the
// stand-in for "a different laptop". Not part of any runtime path; named to
// make that obvious. Closes live connections first so fake-indexeddb's delete
// is not racing an open handle.
export async function __resetDbsForTests(): Promise<void> {
  const closeAndDelete = async (
    promise: Promise<IDBPDatabase<AuditDbSchema>> | Promise<IDBPDatabase<RegisterDbSchema>> | undefined,
    name: string,
  ) => {
    if (promise) {
      try {
        (await promise).close();
      } catch {
        /* already closed */
      }
    }
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  };
  await closeAndDelete(dbPromise, 'aigate-audit');
  await closeAndDelete(registerDbPromise, 'aigate-register');
  dbPromise = undefined;
  registerDbPromise = undefined;
}
