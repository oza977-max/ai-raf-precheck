import { it, expect, vi } from 'vitest';

const mk = (id: string) => ({
  event_id: id,
  use_case_id: 'uc-cr7-05',
  event_type: 'use_case_created' as const,
  occurred_at: new Date().toISOString(),
  actor: 'u',
  payload: { type: 'use_case_created' as const, description: 'x', intake_method: 'llm' as const },
});

// BC-003: events are written by the real append(), through two real module
// instances (two "tabs") over one shared IndexedDB.
it('TC-CR7-05: two tabs appending in turn do not fork the chain', async () => {
  vi.resetModules();
  const A = await import('./audit');
  vi.resetModules();
  const B = await import('./audit');
  await A.append(mk('cr7-05-a1'));
  await B.append(mk('cr7-05-b1'));
  await A.append(mk('cr7-05-a2')); // A's cached tip is stale here
  await B.append(mk('cr7-05-b2'));
  const v = await A.verifyChain();
  expect(v.reason).toBeUndefined();
  expect(v.ok).toBe(true);
  const all = await A.getAllForExport();
  expect(all.map((e) => e.event_id).slice(-4)).toEqual(['cr7-05-a1', 'cr7-05-b1', 'cr7-05-a2', 'cr7-05-b2']);
  // timestamps stay strictly increasing across the two tabs too
  const times = all.map((e) => e.occurred_at);
  expect([...times].sort()).toEqual(times);
});

// A `blocking` close (another tab or a reset asking for the database) can land
// while an append is between taking its handle and writing.
it('TC-CR7-05b: an append whose database handle is closed mid-flight reopens and succeeds', async () => {
  vi.resetModules();
  const A = await import('./audit');
  await A.append(mk('cr7-05b-1'));
  const realDigest = crypto.subtle.digest.bind(crypto.subtle);
  const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args: Parameters<typeof realDigest>) => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('aigate-audit'); // fires `blocking` on the open handle
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
    return realDigest(...args);
  });
  await expect(A.append(mk('cr7-05b-2'))).resolves.toBeUndefined();
  spy.mockRestore();
  const all = await A.getAllForExport();
  expect(all.map((e) => e.event_id)).toEqual(['cr7-05b-2']);
  expect((await A.verifyChain()).ok).toBe(true);
});
