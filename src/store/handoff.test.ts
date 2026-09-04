import { describe, it, expect, beforeEach } from 'vitest';
import { append, getAllForExport, verifyChain, __resetChainStateForTests } from './audit';
import { addNode } from './register';
import { __resetDbsForTests } from './db';
import { exportBundle, importBundle, type HandoffBundle } from './handoff';
import type { RegisterNode } from './types';

// RG-6 — verified hand-off bundle. These tests are the specification: a
// bundle can move a register + its hash-chained audit trail between two
// machines, tamper in transit is detected on arrival, and two histories
// merge ONLY when one is a prefix of the other (the hand-off ping-pong) —
// a genuine fork is rejected with no writes.
//
// Each test builds one or two "machines". A machine is the pair (both
// IndexedDB databases + the audit module's global chain state); a fresh
// machine is that pair wiped to genesis — the stand-in for a different
// laptop. freshMachine() gives us that within one process.

const APP_VERSION = '0.17.0-test';

async function freshMachine(): Promise<void> {
  await __resetDbsForTests();
  __resetChainStateForTests();
}

function useCaseNode(id: string, label: string): RegisterNode {
  return {
    node_id: id,
    node_type: 'use_case',
    label,
    created_at: '2026-01-01T00:00:00.000Z',
    metadata: {
      node_type: 'use_case',
      submitted_by: '1LoD',
      lifecycle_stage: 'pre_checked',
      current_verdict_id: null,
      tier: 'High',
      track: 'II',
    },
  } as RegisterNode;
}

// Build a small submitter-side state: one use case + a two-event trail.
async function seedSubmitterCase(useCaseId: string): Promise<void> {
  await addNode(useCaseNode(useCaseId, 'Hand-off fixture'));
  await append({
    event_id: `${useCaseId}-created`,
    use_case_id: useCaseId,
    event_type: 'use_case_created',
    occurred_at: '2026-01-02T00:00:00.000Z',
    actor: '1LoD',
    payload: { type: 'use_case_created', description: 'A case to hand off', intake_method: 'structured_form' },
  });
  await append({
    event_id: `${useCaseId}-verdict`,
    use_case_id: useCaseId,
    event_type: 'verdict_produced',
    occurred_at: '2026-01-02T00:00:01.000Z',
    actor: 'system',
    // minimal-but-shaped verdict payload; the chain hashes it opaquely
    payload: { type: 'verdict_produced', verdict: { id: `${useCaseId}-v1`, use_case_id: useCaseId, status: 'approved_with_controls' } as never },
  });
}

describe('RG-6 hand-off bundle — round trip and adoption', () => {
  beforeEach(async () => {
    await freshMachine();
  });

  it('exports a sealed bundle and adopts it into an empty machine, chain intact', async () => {
    await seedSubmitterCase('uc-round');
    const bundle = await exportBundle(APP_VERSION);
    expect(bundle.audit_events).toHaveLength(2);
    expect(bundle.seal).toMatch(/^[0-9a-f]{64}$/);

    // "Reviewer's laptop": a different, empty machine.
    await freshMachine();
    expect(await getAllForExport()).toHaveLength(0);

    const result = await importBundle(bundle);
    expect(result.outcome).toBe('adopted');
    expect(result.eventsAdded).toBe(2);

    const live = await getAllForExport();
    expect(live.map((e) => e.event_id)).toEqual(['uc-round-created', 'uc-round-verdict']);
    // The transplanted chain verifies against the LIVE store — the whole
    // point: the reviewer can trust what the submitter sent.
    expect((await verifyChain()).ok).toBe(true);
  });

  it('re-importing the same bundle is idempotent (up_to_date, no duplicate events)', async () => {
    await seedSubmitterCase('uc-idem');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();

    const first = await importBundle(bundle);
    expect(first.outcome).toBe('adopted');
    const second = await importBundle(bundle);
    expect(second.outcome).toBe('up_to_date');
    expect(second.eventsAdded).toBe(0);
    expect(await getAllForExport()).toHaveLength(2);
  });
});

describe('RG-6 hand-off bundle — tamper detection', () => {
  beforeEach(async () => {
    await freshMachine();
  });

  it('rejects a bundle whose REGISTER was altered in transit (seal mismatch), no writes', async () => {
    await seedSubmitterCase('uc-regtamper');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();

    // Tamper: change a node label after export, without recomputing the seal.
    const tampered: HandoffBundle = {
      ...bundle,
      register: {
        ...bundle.register,
        nodes: bundle.register.nodes.map((n) => ({ ...n, label: 'ALTERED IN TRANSIT' })),
      },
    };
    const result = await importBundle(tampered);
    expect(result.outcome).toBe('tampered');
    expect(result.eventsAdded).toBe(0);
    expect(await getAllForExport()).toHaveLength(0); // nothing written
  });

  it('rejects a bundle whose AUDIT payload was edited without recomputing the hash — the seal only binds the tip, so the chain walk must catch this', async () => {
    await seedSubmitterCase('uc-audittamper');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();

    // Edit the FIRST event's payload but leave every stored hash untouched,
    // and re-seal so the seal check passes — the internal chain walk is what
    // must reject this.
    const tamperedEvents = bundle.audit_events.map((e, i) =>
      i === 0 ? { ...e, payload: { ...e.payload, description: 'SECRETLY CHANGED' } } : e,
    );
    // Recompute the seal over the tampered contents so step 2 (seal) passes
    // and step 3 (chain walk) is the one under test.
    const reSealed = await reseal({ ...bundle, audit_events: tamperedEvents });

    const result = await importBundle(reSealed);
    expect(result.outcome).toBe('tampered');
    expect(result.message).toMatch(/chain is broken/i);
    expect(await getAllForExport()).toHaveLength(0);
  });

  it('rejects a non-bundle object as invalid_format', async () => {
    const result = await importBundle({ hello: 'world' });
    expect(result.outcome).toBe('invalid_format');
    expect(result.eventsAdded).toBe(0);
  });
});

describe('RG-6 hand-off bundle — prefix merge and divergence (the ping-pong)', () => {
  beforeEach(async () => {
    await freshMachine();
  });

  it('A -> B (adopt) -> B appends sign-off -> B -> A imports the extended bundle (merged, one new event)', async () => {
    // Machine A: submitter creates the case.
    await seedSubmitterCase('uc-pingpong');
    const bundleFromA = await exportBundle(APP_VERSION);

    // Machine B: reviewer adopts, then records a 2LoD sign-off.
    await freshMachine();
    await importBundle(bundleFromA);
    await append({
      event_id: 'uc-pingpong-signoff',
      use_case_id: 'uc-pingpong',
      event_type: 'twoloD_reviewed',
      occurred_at: '2026-01-03T00:00:00.000Z',
      actor: '2LoD',
      payload: { type: 'twoloD_reviewed', action: 'approved', verdict_id: 'uc-pingpong-v1', attested_by_name: 'Priya Nair' },
    });
    const bundleFromB = await exportBundle(APP_VERSION);
    expect(bundleFromB.audit_events).toHaveLength(3);

    // Machine A: still has the original 2-event chain; imports B's 3-event
    // bundle. B's chain extends A's exactly -> merge the one tail event.
    await freshMachine();
    await seedSubmitterCase('uc-pingpong'); // reconstruct A's original 2-event state
    const beforeA = await getAllForExport();
    expect(beforeA).toHaveLength(2);

    const result = await importBundle(bundleFromB);
    expect(result.outcome).toBe('merged');
    expect(result.eventsAdded).toBe(1);
    const afterA = await getAllForExport();
    expect(afterA.map((e) => e.event_id)).toEqual(['uc-pingpong-created', 'uc-pingpong-verdict', 'uc-pingpong-signoff']);
    expect((await verifyChain()).ok).toBe(true);
  });

  it('local_ahead: importing a bundle your copy already extends does nothing', async () => {
    await seedSubmitterCase('uc-ahead');
    const shortBundle = await exportBundle(APP_VERSION); // 2 events
    // local grows by one more event
    await append({
      event_id: 'uc-ahead-extra',
      use_case_id: 'uc-ahead',
      event_type: 'lifecycle_stage_changed',
      occurred_at: '2026-01-04T00:00:00.000Z',
      actor: 'system',
      payload: { type: 'lifecycle_stage_changed', from_stage: 'pre_checked', to_stage: 'approved' },
    });
    expect(await getAllForExport()).toHaveLength(3);

    const result = await importBundle(shortBundle);
    expect(result.outcome).toBe('local_ahead');
    expect(await getAllForExport()).toHaveLength(3); // untouched
  });

  it('diverged: two histories that both grew past the last sync are rejected, local chain untouched', async () => {
    // A and B share a 2-event prefix, then EACH appends a different 3rd
    // event. Neither is a prefix of the other -> fork.
    await seedSubmitterCase('uc-fork');
    const shared = await exportBundle(APP_VERSION);

    // Build machine B = shared prefix + B's own third event, export it.
    await freshMachine();
    await importBundle(shared);
    await append({
      event_id: 'uc-fork-B-event',
      use_case_id: 'uc-fork',
      event_type: 'twoloD_reviewed',
      occurred_at: '2026-01-03T00:00:00.000Z',
      actor: '2LoD',
      payload: { type: 'twoloD_reviewed', action: 'approved', verdict_id: 'uc-fork-v1', attested_by_name: 'Reviewer B' },
    });
    const bundleFromB = await exportBundle(APP_VERSION);

    // Machine A = shared prefix + A's OWN different third event.
    await freshMachine();
    await importBundle(shared);
    await append({
      event_id: 'uc-fork-A-event',
      use_case_id: 'uc-fork',
      event_type: 'rule_dissent_filed',
      occurred_at: '2026-01-03T00:00:05.000Z',
      actor: '2LoD',
      payload: { type: 'rule_dissent_filed', verdict_id: 'uc-fork-v1', rule_id: 'INV-DATA-01', dissent: 'too broad', filed_by_name: 'Reviewer A' },
    });
    const beforeA = await getAllForExport();
    expect(beforeA).toHaveLength(3);

    const result = await importBundle(bundleFromB);
    expect(result.outcome).toBe('diverged');
    expect(result.eventsAdded).toBe(0);
    // A's chain is exactly as it was — the rejected import wrote nothing.
    const afterA = await getAllForExport();
    expect(afterA.map((e) => e.event_id)).toEqual(beforeA.map((e) => e.event_id));
    expect((await verifyChain()).ok).toBe(true);
  });
});

// Helper: recompute a bundle's seal over its (possibly tampered) current
// contents, so a test can isolate the chain-walk check from the seal check.
async function reseal(bundle: HandoffBundle): Promise<HandoffBundle> {
  // Re-derive the seal exactly as handoff.ts does. Kept in the test rather
  // than exported from the module because production has no reason to seal
  // an externally-supplied bundle — only export does.
  const { sha256Hex } = await import('./audit');
  const nodes = [...bundle.register.nodes].sort((a, b) => a.node_id.localeCompare(b.node_id));
  const edges = [...bundle.register.edges].sort((a, b) => a.edge_id.localeCompare(b.edge_id));
  const events = bundle.audit_events;
  const tip = events.length > 0 ? events[events.length - 1]!.hash : 'EMPTY';
  const canonical = canonicalJson({ nodes, edges, audit_tip: tip, audit_count: events.length });
  return { ...bundle, seal: await sha256Hex(canonical) };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}
