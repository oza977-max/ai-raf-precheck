import { describe, it, expect, beforeAll, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../store/policy';
import { getUseCases } from '../store/register';
import { getAllForExport } from '../store/audit';
import { seedSampleRegister, sampleCount, SAMPLE_PREFIX } from './sample-register';
import type { PolicyFile } from '../engine/types';

let policy: PolicyFile;

beforeAll(() => {
  const yaml = readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8');
  const result = loadPolicy(yaml);
  if (!result.valid) throw new Error(`fixture policy invalid: ${JSON.stringify(result.errors)}`);
  policy = result.policy;
});

async function sampleRows() {
  const rows = await getUseCases('all');
  return rows.filter((r) => r.use_case_id.startsWith(SAMPLE_PREFIX));
}

describe('seedSampleRegister (V2-D demo data)', () => {
  it('seeds every sample and each one carries a real verdict', async () => {
    const seeded = await seedSampleRegister(policy);
    expect(seeded).toBe(sampleCount());

    const rows = await sampleRows();
    expect(rows).toHaveLength(sampleCount());
    for (const row of rows) {
      expect(row.current_verdict_status).not.toBeNull();
    }
  });

  it('is idempotent — re-seeding adds nothing and does not duplicate audit events', async () => {
    await seedSampleRegister(policy);
    const before = (await getAllForExport()).length;

    const seeded = await seedSampleRegister(policy);

    expect(seeded).toBe(0);
    expect(await sampleRows()).toHaveLength(sampleCount());
    expect((await getAllForExport()).length).toBe(before);
  });

  // The whole point of the demo set: a tester who loads it must see the
  // engine discriminating, not one verdict repeated. This is the exact
  // failure the samples exist to disprove ("all verdicts look the same").
  it('produces a genuine spread of outcomes and tiers, not one repeated verdict', async () => {
    await seedSampleRegister(policy);
    const rows = await sampleRows();

    const statuses = new Set(rows.map((r) => r.current_verdict_status));
    const tiers = new Set(rows.map((r) => r.tier));

    expect(statuses.size).toBeGreaterThanOrEqual(2);
    expect(tiers.size).toBeGreaterThanOrEqual(3);
    expect([...statuses]).toContain('rejected');
  });

  it('labels every sample so a tester can tell demo data from their own submissions', async () => {
    await seedSampleRegister(policy);
    for (const row of await sampleRows()) {
      expect(row.label).toContain('[SAMPLE]');
    }
  });
});

// Code review 001, C-5 (Panel C — Kent Beck, and the project's own CLAUDE.md).
// `if (await getUseCase(id)) continue` is check-then-act across an async
// boundary: two concurrent callers both observe "absent" before either
// writes, and both write. On an append-only audit trail duplicates cannot be
// cleaned up afterwards — this is a data-integrity bug, not a UX nit.
// aigate-self-assessment.ts closes the same race with a synchronous
// in-flight promise; this seed did not.
describe('C-5 — concurrent seeding writes each sample exactly once', () => {
  it('two simultaneous calls do not duplicate register entries or audit events', async () => {
    // A clean database: the race only exists when BOTH callers observe
    // "absent", which cannot happen once earlier tests in this file have
    // seeded. Module-scoped db handles are reset alongside it.
    globalThis.indexedDB = new IDBFactory();
    vi.resetModules();
    const { seedSampleRegister: seedFresh, sampleCount: countFresh, SAMPLE_PREFIX: prefixFresh } =
      await import('./sample-register');
    const { getUseCases: getRowsFresh } = await import('../store/register');
    const { getAllForExport: getEventsFresh } = await import('../store/audit');

    const [a, b] = await Promise.all([seedFresh(policy), seedFresh(policy)]);

    // Both callers share one execution, so both observe the SAME result.
    // (Without the guard they diverge — one seeds, the other throws
    // ConstraintError after duplicate audit events have already landed.)
    expect(a).toBe(b);
    expect(a).toBe(countFresh());

    const rows = (await getRowsFresh('all')).filter((r) => r.use_case_id.startsWith(prefixFresh));
    expect(rows).toHaveLength(countFresh());

    // The real damage would be here — duplicate graph_confirmed /
    // verdict_produced pairs that can never be removed.
    const events = await getEventsFresh();
    const ids = events.filter((e) => e.use_case_id.startsWith(prefixFresh)).map((e) => e.event_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(countFresh() * 2);
  });
});
