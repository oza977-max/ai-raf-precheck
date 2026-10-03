import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../store/policy';
import type { PolicyFile } from '../engine/types';

// CR8-10 (code review 008): a reload between a seed's audit events and its
// register node used to write a SECOND full set of events (the audit trail is
// append-only, so they could never be removed). BC-003: the half-seeded state
// is produced by the real seed path, then the node is removed from the real
// register database — nothing is hand-typed.

let policy: PolicyFile;

beforeAll(() => {
  const yaml = readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8');
  const result = loadPolicy(yaml);
  if (!result.valid) throw new Error('fixture policy invalid');
  policy = result.policy;
});

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
});

async function dropNodes(prefix: string): Promise<string[]> {
  const { openRegisterDb } = await import('../store/db');
  const db = await openRegisterDb();
  const ids = (await db.getAllKeys('register_nodes')).filter((k) => String(k).startsWith(prefix)).map(String);
  for (const id of ids) await db.delete('register_nodes', id);
  return ids;
}

describe('seed recovery after a reload mid-seed (CR8-10)', () => {
  it('TC-CR8-10a: events written but no node — re-seeding writes only the node, no second set of events', async () => {
    const { seedSampleRegister, SAMPLE_PREFIX } = await import('./sample-register');
    const { getAllForExport, verifyChain } = await import('../store/audit');
    const { getUseCases } = await import('../store/register');
    await seedSampleRegister(policy);
    const before = await getAllForExport();
    const before1 = (await getUseCases('all')).filter((r) => r.use_case_id.startsWith(SAMPLE_PREFIX));
    expect((await dropNodes(SAMPLE_PREFIX)).length).toBeGreaterThan(0);

    await seedSampleRegister(policy);

    const after = await getAllForExport();
    expect(after.map((e) => e.event_id)).toEqual(before.map((e) => e.event_id));
    expect((await verifyChain()).ok).toBe(true);
    const rows = (await getUseCases('all')).filter((r) => r.use_case_id.startsWith(SAMPLE_PREFIX));
    expect(rows).toHaveLength(before1.length);
    for (const r of rows) {
      const original = before1.find((o) => o.use_case_id === r.use_case_id)!;
      expect(r.tier).toBe(original.tier);
      expect(r.track).toBe(original.track);
      expect(r.lifecycle_stage).toBe(original.lifecycle_stage);
    }
  });

  it('TC-CR8-10b: ib-portfolio recovers the stage its own scripted 2LoD events imply (approved stays approved)', async () => {
    const { seedIbPortfolio, IB_PREFIX } = await import('./ib-portfolio');
    const { getAllForExport } = await import('../store/audit');
    const { getUseCases } = await import('../store/register');
    await seedIbPortfolio(policy);
    const eventsBefore = await getAllForExport();
    const stagesBefore = new Map(
      (await getUseCases('all')).filter((r) => r.use_case_id.startsWith(IB_PREFIX)).map((r) => [r.use_case_id, r.lifecycle_stage]),
    );
    expect([...stagesBefore.values()]).toContain('approved');
    await dropNodes(IB_PREFIX);

    await seedIbPortfolio(policy);

    expect((await getAllForExport()).map((e) => e.event_id)).toEqual(eventsBefore.map((e) => e.event_id));
    const stagesAfter = new Map(
      (await getUseCases('all')).filter((r) => r.use_case_id.startsWith(IB_PREFIX)).map((r) => [r.use_case_id, r.lifecycle_stage]),
    );
    expect(stagesAfter).toEqual(stagesBefore);
  });

  it('TC-CR8-10c: events with no verdict_produced are skipped, reported, and nothing is written', async () => {
    const { seedSampleRegister, SAMPLE_PREFIX } = await import('./sample-register');
    const { append, getAllForExport } = await import('../store/audit');
    const { getUseCase } = await import('../store/register');
    const id = `${SAMPLE_PREFIX}var-commentary`;
    await append({
      event_id: 'cr8-10c-orphan',
      use_case_id: id,
      event_type: 'graph_confirmed',
      occurred_at: new Date().toISOString(),
      actor: '1LoD',
      payload: { type: 'graph_confirmed', graph_id: 'g', graph_version: 1, corrections_count: 0 },
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await seedSampleRegister(policy);
    const mine = (await getAllForExport()).filter((e) => e.use_case_id === id);
    expect(mine.map((e) => e.event_id)).toEqual(['cr8-10c-orphan']);
    expect(await getUseCase(id)).toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('TC-CR8-10d: the self-assessment recovers its node, vendor, edge and model link without a second set of events', async () => {
    const { seedAigateSelfAssessment, AIGATE_USE_CASE_ID, AIGATE_VENDOR_NODE_ID } = await import('./aigate-self-assessment');
    const { getAllForExport } = await import('../store/audit');
    const { getUseCase, getGraph } = await import('../store/register');
    await seedAigateSelfAssessment(policy);
    const before = await getAllForExport();
    const { openRegisterDb } = await import('../store/db');
    const db = await openRegisterDb();
    await db.clear('register_nodes');
    await db.clear('register_edges');

    await seedAigateSelfAssessment(policy);

    expect((await getAllForExport()).map((e) => e.event_id)).toEqual(before.map((e) => e.event_id));
    expect(await getUseCase(AIGATE_USE_CASE_ID)).toBeDefined();
    const g = await getGraph(AIGATE_USE_CASE_ID);
    expect(g.nodes.map((n) => n.node_id)).toContain(AIGATE_VENDOR_NODE_ID);
    expect(g.edges.map((e) => e.edge_type).sort()).toEqual(['provided_by_vendor', 'uses_model']);
  });

  it('TC-CR8-10e: the use-case node is written last, so a run interrupted before it is completed by the next, with no duplicate rows', async () => {
    const { seedAigateSelfAssessment, AIGATE_USE_CASE_ID } = await import('./aigate-self-assessment');
    const { getUseCase, getGraph } = await import('../store/register');
    await seedAigateSelfAssessment(policy);
    const { openRegisterDb } = await import('../store/db');
    const db = await openRegisterDb();
    await db.delete('register_nodes', AIGATE_USE_CASE_ID); // an interruption after vendor, edge and link

    await seedAigateSelfAssessment(policy);

    expect(await getUseCase(AIGATE_USE_CASE_ID)).toBeDefined();
    const g = await getGraph(AIGATE_USE_CASE_ID);
    expect(g.edges.map((e) => e.edge_type).sort()).toEqual(['provided_by_vendor', 'uses_model']);
  });

  it('TC-CR8-10f: recovery points the node at the LATEST verdict (a later verdict_corrected wins)', async () => {
    const { seedSampleRegister, SAMPLE_PREFIX } = await import('./sample-register');
    const { append, getAllForExport } = await import('../store/audit');
    await seedSampleRegister(policy);
    const id = `${SAMPLE_PREFIX}var-commentary`;
    const produced = (await getAllForExport()).find((e) => e.use_case_id === id && e.payload.type === 'verdict_produced')!;
    if (produced.payload.type !== 'verdict_produced') throw new Error('unreachable');
    const newer = { ...produced.payload.verdict, id: 'cr8-10f-newer-verdict' };
    await append({
      event_id: 'cr8-10f-corrected',
      use_case_id: id,
      event_type: 'verdict_corrected',
      occurred_at: new Date().toISOString(),
      actor: '1LoD',
      payload: { type: 'verdict_corrected', original_verdict_id: produced.payload.verdict.id, new_verdict: newer },
    });
    await dropNodes(SAMPLE_PREFIX);

    await seedSampleRegister(policy);

    const { openRegisterDb } = await import('../store/db');
    const node = await (await openRegisterDb()).get('register_nodes', id);
    expect(node!.metadata.node_type === 'use_case' && node!.metadata.current_verdict_id).toBe('cr8-10f-newer-verdict');
  });
});

