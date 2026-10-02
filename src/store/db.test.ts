import { describe, it, expect } from 'vitest';
import { openAuditDb, openRegisterDb, withCaseLock } from './db';
import type { RegisterNode } from './types';

// R16-F F-1 (DR7-02, DR7-03). withCaseLock orders a whole confirm-or-correct
// sequence per case — same navigator.locks pattern as createWriteQueue, but
// keyed per case rather than per store, and with its own same-tab ordering
// (a per-case queue) so the no-navigator.locks fallback (this project's own
// test environment, jsdom) still orders two same-tab calls for the SAME
// case correctly.
describe('withCaseLock', () => {
  it('TC-R16-F-12: serialises two concurrent calls for the SAME case — the second never starts until the first resolves', async () => {
    const order: string[] = [];
    let release: (() => void) | undefined;
    const first = withCaseLock('case-1', async () => {
      order.push('first-start');
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      order.push('first-end');
    });
    // Give the first call a tick to actually start before racing the second.
    await Promise.resolve();
    const second = withCaseLock('case-1', async () => {
      order.push('second-start');
    });
    expect(order).toEqual(['first-start']);
    release!();
    await Promise.all([first, second]);
    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('TC-R16-F-13: two DIFFERENT cases never wait on each other', async () => {
    const order: string[] = [];
    let releaseA: (() => void) | undefined;
    const a = withCaseLock('case-a', async () => {
      order.push('a-start');
      await new Promise<void>((resolve) => {
        releaseA = resolve;
      });
      order.push('a-end');
    });
    await Promise.resolve();
    // case-b must be able to run to completion while case-a is still held.
    const b = withCaseLock('case-b', async () => {
      order.push('b-start');
      order.push('b-end');
    });
    await b;
    expect(order).toEqual(['a-start', 'b-start', 'b-end']);
    releaseA!();
    await a;
    expect(order).toEqual(['a-start', 'b-start', 'b-end', 'a-end']);
  });

  it('TC-R16-F-14: the result and a thrown error both propagate to the caller', async () => {
    await expect(withCaseLock('case-2', async () => 'ok')).resolves.toBe('ok');
    await expect(
      withCaseLock('case-2', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // A failure must not leave the per-case queue stuck — a later call for
    // the SAME case still runs.
    await expect(withCaseLock('case-2', async () => 'after-failure')).resolves.toBe('after-failure');
  });
});

describe('openAuditDb', () => {
  it('writes a real row and reads it back (boundary proof)', async () => {
    const db = await openAuditDb();

    const event = {
      event_id: 'evt-1',
      use_case_id: 'uc-1',
      event_type: 'use_case_created' as const,
      occurred_at: new Date().toISOString(),
      actor: 'user-1',
      payload: { type: 'use_case_created' as const, description: 'A tool', intake_method: 'llm' as const },
      prev_hash: null,
      hash: 'test-hash',
    };

    await db.add('audit_events', event);
    const rows = await db.getAllFromIndex('audit_events', 'by_use_case', 'uc-1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(event);
  });

  it('throws ConstraintError on duplicate event_id (append-only guarantee)', async () => {
    const db = await openAuditDb();
    const event = {
      event_id: 'evt-dup',
      use_case_id: 'uc-2',
      event_type: 'use_case_created' as const,
      occurred_at: new Date().toISOString(),
      actor: 'user-1',
      payload: { type: 'use_case_created' as const, description: 'A tool', intake_method: 'llm' as const },
      prev_hash: null,
      hash: 'test-hash',
    };

    await db.add('audit_events', event);
    await expect(db.add('audit_events', event)).rejects.toThrow();
  });
});

describe('openRegisterDb', () => {
  it('writes a register node and reads it back via by_type index', async () => {
    const db = await openRegisterDb();

    const node: RegisterNode = {
      node_id: 'node-1',
      node_type: 'use_case',
      label: 'A tool that drafts client emails',
      created_at: new Date().toISOString(),
      metadata: {
        node_type: 'use_case',
        submitted_by: 'user-1',
        lifecycle_stage: 'idea',
        current_verdict_id: null,
        tier: null,
        track: null,
      },
    };

    await db.add('register_nodes', node);
    const rows = await db.getAllFromIndex('register_nodes', 'by_type', 'use_case');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(node);
  });

  it('supports the nested-keypath index by_submitted_by on metadata.submitted_by', async () => {
    const db = await openRegisterDb();

    const node: RegisterNode = {
      node_id: 'node-nested-1',
      node_type: 'use_case',
      label: 'Nested keypath probe',
      created_at: new Date().toISOString(),
      metadata: {
        node_type: 'use_case',
        submitted_by: 'user-nested-probe',
        lifecycle_stage: 'idea',
        current_verdict_id: null,
        tier: null,
        track: null,
      },
    };

    await db.add('register_nodes', node);
    const rows = await db.getAllFromIndex('register_nodes', 'by_submitted_by', 'user-nested-probe');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(node);
  });

  it('writes a register edge and reads it back via by_from_node / by_to_node indexes', async () => {
    const db = await openRegisterDb();

    const edge = {
      edge_id: 'edge-1',
      from_node_id: 'node-from-1',
      to_node_id: 'node-to-1',
      edge_type: 'uses_model' as const,
      created_at: new Date().toISOString(),
    };

    await db.add('register_edges', edge);
    const byFrom = await db.getAllFromIndex('register_edges', 'by_from_node', 'node-from-1');
    const byTo = await db.getAllFromIndex('register_edges', 'by_to_node', 'node-to-1');

    expect(byFrom).toHaveLength(1);
    expect(byTo).toHaveLength(1);
  });
});
