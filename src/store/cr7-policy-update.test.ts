import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy, onPolicyUpdated } from './policy';
import { seedSampleRegister } from '../seeds/sample-register';
import { addNode } from './register';
import * as audit from './audit';
import type { RegisterNode } from './types';

// Real trail (BC-003); only `append` is wrapped so a test can fail it part-way.
// EBT exception (owner-accepted, code review 006/008): hold in flight / fault injection — the real append is wrapped so a test can fail it part-way; the trail itself is real.
vi.mock('./audit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./audit')>();
  return { ...actual, append: vi.fn(actual.append) };
});

function useCase(id: string): RegisterNode {
  return {
    node_id: id,
    node_type: 'use_case',
    label: id,
    created_at: new Date().toISOString(),
    metadata: {
      node_type: 'use_case',
      submitted_by: '1LoD',
      lifecycle_stage: 'approved',
      current_verdict_id: null,
      tier: 'Low',
      track: 'I',
    },
  };
}

const IDS = ['cr7-06c-a', 'cr7-06c-b', 'cr7-06c-c'];

async function queued(id: string) {
  return (await audit.getAll(id)).filter((e) => e.event_type === 're_evaluation_queued');
}

describe('onPolicyUpdated dedupe (CR7-06c)', () => {
  it('TC-CR7-06c: a retry after a part-way failure queues each case exactly once, and a later save after a new verdict queues again', async () => {
    for (const id of IDS) await addNode(useCase(id));
    const real = (await vi.importActual<typeof import('./audit')>('./audit')).append;
    let calls = 0;
    vi.mocked(audit.append).mockImplementation((e) => {
      calls += 1;
      if (calls === 2) return Promise.reject(new Error('disk full'));
      return real(e);
    });

    await expect(onPolicyUpdated('cr7-06c-v1')).rejects.toThrow('disk full');
    vi.mocked(audit.append).mockImplementation(real);
    const retry = await onPolicyUpdated('cr7-06c-v1'); // the retry
    // TC-CR7-06d: the count says what the retry did and what was already waiting
    expect(retry.alreadyPendingCount).toBeGreaterThanOrEqual(1);
    expect(retry.queuedCount).toBeGreaterThanOrEqual(1);

    for (const id of IDS) expect(await queued(id)).toHaveLength(1);

    // an identical third save with nothing new in between adds nothing
    await onPolicyUpdated('cr7-06c-v1');
    for (const id of IDS) expect(await queued(id)).toHaveLength(1);

    // a re-evaluation produces a newer verdict; the NEXT save must queue again
    // a REAL verdict, produced by the seed path, re-homed onto each test case
    const loaded = loadPolicy(readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8'));
    if (!loaded.valid) throw new Error('fixture policy invalid');
    await seedSampleRegister(loaded.policy);
    const seededVerdict = (await audit.getAllForExport()).find((e) => e.payload.type === 'verdict_produced')!;
    if (seededVerdict.payload.type !== 'verdict_produced') throw new Error('unreachable');
    for (const id of IDS) {
      await real({
        event_id: `${id}-verdict`,
        use_case_id: id,
        event_type: 'verdict_produced',
        occurred_at: new Date().toISOString(),
        actor: 'system',
        payload: { type: 'verdict_produced', verdict: { ...seededVerdict.payload.verdict, use_case_id: id }, knowledge_lens_matched_entry_ids: [] },
      });
    }
    await onPolicyUpdated('cr7-06c-v1'); // same version string, edited YAML
    for (const id of IDS) expect(await queued(id)).toHaveLength(2);
  });
});
