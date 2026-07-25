import { describe, it, expect, beforeAll } from 'vitest';
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
