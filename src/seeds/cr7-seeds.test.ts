import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../store/policy';
import type { PolicyFile } from '../engine/types';

// jsdom has no navigator.locks. This stand-in is shared by every module
// instance in the process — exactly what a real browser's lock manager is
// across tabs — so two instances of the seeds really can be ordered by
// withCaseLock (and the audit queue).
function installSharedLocks() {
  const tails = new Map<string, Promise<unknown>>();
  const locks = {
    request(name: string, cb: (lock: unknown) => unknown) {
      const prev = tails.get(name) ?? Promise.resolve();
      const run = prev.then(() => cb({ name }));
      tails.set(
        name,
        run.then(
          () => undefined,
          () => undefined,
        ),
      );
      return run;
    },
  };
  Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
}

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
  installSharedLocks();
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'locks');
});

async function eventsByType(type: string) {
  const { getAllForExport } = await import('../store/audit');
  return (await getAllForExport()).filter((e) => e.event_type === type);
}

describe('seeds across two tabs (CR7-18)', () => {
  it('TC-CR7-18: two module instances seeding the sample register at once write one set of events', async () => {
    const A = await import('./sample-register');
    vi.resetModules();
    const B = await import('./sample-register');
    const [a, b] = await Promise.all([A.seedSampleRegister(policy), B.seedSampleRegister(policy)]);
    expect(a + b).toBe(A.sampleCount());
    const verdicts = await eventsByType('verdict_produced');
    expect(verdicts).toHaveLength(A.sampleCount());
    expect(new Set(verdicts.map((e) => e.use_case_id)).size).toBe(A.sampleCount());
    const audit = await import('../store/audit');
    expect((await audit.verifyChain()).ok).toBe(true);
  });

  it('TC-CR7-18: two module instances seeding the investment-bank portfolio at once write one set of events', async () => {
    const A = await import('./ib-portfolio');
    vi.resetModules();
    const B = await import('./ib-portfolio');
    const [a, b] = await Promise.all([A.seedIbPortfolio(policy), B.seedIbPortfolio(policy)]);
    expect(a + b).toBe(A.ibCaseCount());
    const created = await eventsByType('use_case_created');
    expect(created).toHaveLength(A.ibCaseCount());
    expect(new Set(created.map((e) => e.use_case_id)).size).toBe(A.ibCaseCount());
  });

  it('TC-CR7-18: two module instances seeding the self-assessment at once write it once', async () => {
    const A = await import('./aigate-self-assessment');
    vi.resetModules();
    const B = await import('./aigate-self-assessment');
    await Promise.all([A.seedAigateSelfAssessment(policy), B.seedAigateSelfAssessment(policy)]);
    const verdicts = (await eventsByType('verdict_produced')).filter((e) => e.use_case_id === A.AIGATE_USE_CASE_ID);
    expect(verdicts).toHaveLength(1);
    const confirmed = (await eventsByType('graph_confirmed')).filter((e) => e.use_case_id === A.AIGATE_USE_CASE_ID);
    expect(confirmed).toHaveLength(1);
  });
});
