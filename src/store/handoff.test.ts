import { describe, it, expect, beforeEach } from 'vitest';
import { append, getAllForExport, verifyChain, __resetChainStateForTests, __recomputeChainForTests } from './audit';
import { addNode } from './register';
import { __resetDbsForTests } from './db';
import {
  exportBundle,
  importBundle,
  replaceWithBundle,
  computeSeal,
  __resetHandoffSyncStateForTests,
  type HandoffBundle,
} from './handoff';
import type { RegisterNode, AuditEvent } from './types';

// RG-8 — verified hand-off bundle (relabelled from RG-6 in code-review-005
// F9/F27 — RG-6 already meant something else in this product's requirement
// set). These tests are the specification: a bundle can move a register +
// its hash-chained audit trail between two machines, damage or a
// not-recomputed edit in transit is detected on arrival, and two histories
// merge ONLY when one is a prefix of the other (the hand-off ping-pong) —
// a genuine divergence (the code's ImportOutcome calls it 'diverged') is
// rejected with no writes.
//
// Each test builds one or two "machines". A machine is the pair (both
// IndexedDB databases + the audit module's global chain state, + the
// hand-off sync marker); a fresh machine is that pair wiped to genesis — the
// stand-in for a different laptop. freshMachine() gives us that within one
// process.

const APP_VERSION = '0.17.0-test';

async function freshMachine(): Promise<void> {
  await __resetDbsForTests();
  __resetChainStateForTests();
  __resetHandoffSyncStateForTests();
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
    // minimal-but-shaped verdict payload; the chain hashes it opaquely. Must
    // include every field handoff.ts's import validation now requires
    // (id, use_case_id, status, policy_version) — a bare `{id, use_case_id,
    // status}` fixture (this file's pre-code-review-005 shape) would itself
    // now be rejected as invalid_format at import, which is exactly F13's
    // point: an incomplete verdict is a real defect, not a test convenience.
    payload: {
      type: 'verdict_produced',
      verdict: {
        id: `${useCaseId}-v1`,
        use_case_id: useCaseId,
        status: 'approved_with_controls',
        policy_version: '1.0',
      } as never,
    },
  });
}

describe('RG-8 hand-off bundle — round trip and adoption', () => {
  beforeEach(async () => {
    await freshMachine();
  });

  it('TC-RG-8-15: exports a sealed bundle and adopts it into an empty machine, chain intact', async () => {
    await seedSubmitterCase('uc-round');
    const bundle = await exportBundle(APP_VERSION);
    expect(bundle.audit_events).toHaveLength(2);
    expect(bundle.seal).toMatch(/^[0-9a-f]{64}$/);

    // "Reviewer's laptop": a different, empty machine.
    await freshMachine();
    expect(await getAllForExport()).toHaveLength(0);

    const result = await importBundle(bundle);
    expect(result.outcome).toBe('imported_into_empty');
    expect(result.eventsAdded).toBe(2);

    const live = await getAllForExport();
    expect(live.map((e) => e.event_id)).toEqual(['uc-round-created', 'uc-round-verdict']);
    // The transplanted chain verifies against the LIVE store — the whole
    // point: the reviewer can trust what the submitter sent.
    expect((await verifyChain()).ok).toBe(true);
  });

  it('TC-RG-8-13: re-importing the same bundle is idempotent (up_to_date, no duplicate events)', async () => {
    await seedSubmitterCase('uc-idem');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();

    const first = await importBundle(bundle);
    expect(first.outcome).toBe('imported_into_empty');
    const second = await importBundle(bundle);
    expect(second.outcome).toBe('up_to_date');
    expect(second.eventsAdded).toBe(0);
    expect(await getAllForExport()).toHaveLength(2);
  });
});

describe('RG-8 hand-off bundle — tamper detection', () => {
  beforeEach(async () => {
    await freshMachine();
  });

  it('TC-RG-8-03: rejects a bundle whose REGISTER was altered in transit (seal mismatch), no writes', async () => {
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

  it('TC-RG-8-04: rejects a bundle whose AUDIT payload was edited without recomputing the hash — the seal only binds the tip, so the chain walk must catch this', async () => {
    await seedSubmitterCase('uc-audittamper');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();

    // Edit the FIRST event's payload but leave every stored hash untouched,
    // and re-seal so the seal check passes — the internal chain walk is what
    // must reject this.
    const tamperedEvents = bundle.audit_events.map((e, i) =>
      i === 0 ? { ...e, payload: { ...e.payload, description: 'SECRETLY CHANGED' } } : e,
    );
    // Recompute the seal over the tampered contents (using handoff.ts's own
    // exported computeSeal, not a re-implementation — see the reseal()
    // helper below) so step 2 (seal) passes and step 3 (chain walk) is the
    // one under test.
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

  // code-review-005 F2. The seal and chain are plain SHA-256 — no key, no
  // secret, no external anchor. This is the test that pins the documented
  // limit rather than hiding it: a fully re-hashed forgery (a payload
  // edited, then EVERY downstream event hash and the seal recomputed, using
  // only this module's own public functions — audit.__recomputeChainForTests
  // and handoff.computeSeal) is ACCEPTED. What the product actually catches
  // is an edit that was NOT followed by recomputing the chain (the tests
  // above); it never claims to prove who produced the file.
  it('TC-RG-8-05: F2: a bundle edited AND fully re-hashed downstream (payload + every later hash + the seal) is ACCEPTED', async () => {
    await seedSubmitterCase('uc-forge');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();

    const editedContent = bundle.audit_events.map((e, i) =>
      i === 0 ? { ...e, payload: { ...e.payload, description: 'FORGED — attacker rewrote history' } } : e,
    );
    // Strip the old prev_hash/hash and rebuild a fully self-consistent chain
    // from genesis over the edited content — exactly what "anyone holding
    // the file could rebuild it to pass these checks" (the F2 hint text)
    // means in practice.
    const strippedForRehash = editedContent.map(({ prev_hash: _prevHash, hash: _hash, ...rest }) => rest as Omit<AuditEvent, 'prev_hash' | 'hash'>);
    const rehashed = await __recomputeChainForTests(strippedForRehash);
    const forgedSeal = await computeSeal(bundle.register, rehashed);
    const forgedBundle: HandoffBundle = { ...bundle, audit_events: rehashed, seal: forgedSeal };

    const result = await importBundle(forgedBundle);

    // Accepted — this is the honest limit, not a bug. A fully
    // internally-consistent rewrite is indistinguishable from a genuine
    // export without an external anchor this client-side store does not
    // have.
    expect(result.outcome).toBe('imported_into_empty');
    expect(result.eventsAdded).toBe(2);
    const live = await getAllForExport();
    expect(live.find((e) => e.event_id === bundle.audit_events[0]!.event_id)?.payload).toMatchObject({
      description: 'FORGED — attacker rewrote history',
    });
  });
});

describe('RG-8 hand-off bundle — import validation at the boundary (code-review-005 F3/F4/F13/F20)', () => {
  beforeEach(async () => {
    await freshMachine();
  });

  it('TC-RG-8-06: rejects a bundle with a malformed (non-ISO) occurred_at', async () => {
    await seedSubmitterCase('uc-badtime');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();

    const broken: HandoffBundle = {
      ...bundle,
      audit_events: bundle.audit_events.map((e, i) => (i === 0 ? { ...e, occurred_at: 'not-a-real-timestamp' } : e)),
    };
    const result = await importBundle(broken);
    expect(result.outcome).toBe('invalid_format');
    expect(await getAllForExport()).toHaveLength(0);
  });

  it('TC-RG-8-07: rejects a bundle whose register-node metadata.node_type does not match the node\'s own node_type', async () => {
    await seedSubmitterCase('uc-badmeta');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();

    const broken: HandoffBundle = {
      ...bundle,
      register: {
        ...bundle.register,
        nodes: bundle.register.nodes.map((n) =>
          n.node_type === 'use_case' ? ({ ...n, metadata: { ...n.metadata, node_type: 'ai_model' } } as unknown as RegisterNode) : n,
        ),
      },
    };
    const result = await importBundle(broken);
    expect(result.outcome).toBe('invalid_format');
    expect(await getAllForExport()).toHaveLength(0);
  });

  it('TC-RG-8-08: rejects a bundle with an unknown event_type', async () => {
    await seedSubmitterCase('uc-badtype');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();

    const broken = {
      ...bundle,
      audit_events: bundle.audit_events.map((e, i) => (i === 0 ? { ...e, event_type: 'made_up_event_type' } : e)),
    };
    const result = await importBundle(broken);
    expect(result.outcome).toBe('invalid_format');
    expect(await getAllForExport()).toHaveLength(0);
  });

  it('TC-RG-8-09: rejects a bundle whose payload is missing a required field for its type', async () => {
    await seedSubmitterCase('uc-missingfield');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();

    const broken = {
      ...bundle,
      audit_events: bundle.audit_events.map((e) => {
        if (e.payload.type !== 'use_case_created') return e;
        const { description: _description, ...rest } = e.payload; // drop the required field
        return { ...e, payload: rest };
      }),
    };
    const result = await importBundle(broken);
    expect(result.outcome).toBe('invalid_format');
    expect(await getAllForExport()).toHaveLength(0);
  });

  it('TC-RG-8-10: rejects a bundle with duplicate event ids inside itself', async () => {
    await seedSubmitterCase('uc-dupids');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();

    // Two DIFFERENT events sharing the SAME id — a bundle cannot be
    // internally self-consistent this way, whatever its seal says.
    const broken: HandoffBundle = {
      ...bundle,
      audit_events: bundle.audit_events.map((e) => ({ ...e, event_id: 'evt-duplicated-id' })),
    };
    const result = await importBundle(broken);
    expect(result.outcome).toBe('invalid_format');
    expect(result.message).toMatch(/duplicate|more than one event/i);
    expect(await getAllForExport()).toHaveLength(0);
  });

  it('TC-RG-8-11: gives a distinct, honest message for an unsupported format_version, not the generic "not a bundle" one', async () => {
    await seedSubmitterCase('uc-futureversion');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();

    const fromTheFuture = { ...bundle, format_version: 999 };
    const result = await importBundle(fromTheFuture);
    expect(result.outcome).toBe('invalid_format');
    expect(result.message).toMatch(/different version of AIGate/i);
    expect(result.message).not.toBe('This file is not an AIGate hand-off bundle.');
  });

  it('replaceWithBundle applies the same validation as importBundle (a malformed bundle cannot be replaced in either)', async () => {
    await seedSubmitterCase('uc-replace-badtime');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();
    await seedSubmitterCase('uc-own');

    const broken: HandoffBundle = {
      ...bundle,
      audit_events: bundle.audit_events.map((e, i) => (i === 0 ? { ...e, occurred_at: 'garbage' } : e)),
    };
    const result = await replaceWithBundle(broken);
    expect(result.outcome).toBe('invalid_format');
    // The existing register is untouched — validation ran before any write.
    expect((await getAllForExport()).map((e) => e.event_id)).toEqual(['uc-own-created', 'uc-own-verdict']);
  });
});

describe('RG-8 hand-off bundle — prefix merge and divergence (the ping-pong)', () => {
  beforeEach(async () => {
    await freshMachine();
  });

  it('TC-RG-8-12: A -> B (adopt) -> B appends sign-off -> B -> A imports the extended bundle (merged, one new event)', async () => {
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

  it('TC-RG-8-14: local_ahead: importing a bundle your copy already extends does nothing', async () => {
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
    // event. Neither is a prefix of the other -> diverged.
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

// code-review-005 F14. The "diverged" message used to always say it was
// expected — reassuring on a return trip too, where divergence can mean the
// wrong file, concurrent edits, or a forgery. A small localStorage marker of
// "has this browser ever completed a hand-off sync" flips the wording.
describe('RG-8 hand-off bundle — diverged message reflects sync history (code-review-005 F14)', () => {
  beforeEach(async () => {
    await freshMachine();
  });

  it('TC-RG-8-16: the first-ever divergence (never synced before) gets the calm, "this is normal" message', async () => {
    await seedSubmitterCase('uc-first-time-a');
    const fromA = await exportBundle(APP_VERSION);

    await freshMachine();
    await seedSubmitterCase('uc-first-time-b'); // this machine's own seeded demo case
    const result = await importBundle(fromA);

    expect(result.outcome).toBe('diverged');
    expect(result.message).toMatch(/first time you receive a case this is normal/i);
    expect(result.message).not.toMatch(/warning/i);
  });

  it('TC-RG-8-17: after a previous successful sync, a later divergence is worded as a warning and asks the user to check with the sender', async () => {
    // Content for an UNRELATED, later bundle — built first so building it
    // does not disturb the "local" machine's post-sync state below.
    await seedSubmitterCase('uc-rogue-content');
    const rogueBundle = await exportBundle(APP_VERSION);

    await freshMachine();
    await seedSubmitterCase('uc-synced-case');
    const goodBundle = await exportBundle(APP_VERSION);

    // The actual machine under test: one clean, successful sync first.
    await freshMachine();
    expect((await importBundle(goodBundle)).outcome).toBe('imported_into_empty');

    // A later bundle that shares no history with what was just synced.
    const result = await importBundle(rogueBundle);
    expect(result.outcome).toBe('diverged');
    expect(result.message).toMatch(/warning/i);
    expect(result.message).toMatch(/doesn't continue the history you last synced/i);
    expect(result.message).not.toMatch(/first time you receive a case this is normal/i);
  });

  it('local_ahead and up_to_date also count as confirming compatible history, so a LATER divergence after either still warns', async () => {
    await seedSubmitterCase('uc-sync-via-uptodate');
    const bundle = await exportBundle(APP_VERSION);

    // Importing a bundle that is already exactly local's state still
    // confirms the histories are compatible.
    await freshMachine();
    expect((await importBundle(bundle)).outcome).toBe('imported_into_empty'); // establishes sync
    expect((await importBundle(bundle)).outcome).toBe('up_to_date'); // re-import: confirms again, harmlessly

    // Build a genuinely UNRELATED bundle on register/audit state reset to
    // empty — WITHOUT clearing the sync marker this machine just recorded
    // (freshMachine() would also clear it; use the two lower-level resets
    // instead, exactly like it does internally, minus the marker reset).
    await __resetDbsForTests();
    __resetChainStateForTests();
    await seedSubmitterCase('uc-totally-unrelated');
    const unrelated = await exportBundle(APP_VERSION);

    // Restore local to its synced state — the marker was never touched.
    await __resetDbsForTests();
    __resetChainStateForTests();
    expect((await importBundle(bundle)).outcome).toBe('imported_into_empty');

    const result = await importBundle(unrelated);
    expect(result.outcome).toBe('diverged');
    expect(result.message).toMatch(/warning/i);
  });
});

// Found by a live dry run (2026-09-27): every real browser seeds its own
// demo cases on first load, so the receiver is NEVER empty and never a prefix
// of the sender. The tests above all started the receiver empty — the one
// condition real use never has. These start both machines with their own
// independent history, as a browser does.
describe('RG-8 hand-off bundle — realistic receiver with its own seeded history', () => {
  beforeEach(async () => {
    await freshMachine();
  });

  it('plain import of the first receipt diverges; replace installs the bundle; the return trip then merges', async () => {
    // Machine A (submitter): own seeds + the case.
    await seedSubmitterCase('uc-a-seed');
    await seedSubmitterCase('uc-real');
    const fromA = await exportBundle(APP_VERSION);

    // Machine B (reviewer): its OWN independently seeded history.
    await freshMachine();
    await seedSubmitterCase('uc-b-seed');
    expect((await importBundle(fromA)).outcome).toBe('diverged');
    expect(await getAllForExport()).toHaveLength(2); // refused = untouched

    const replaced = await replaceWithBundle(fromA);
    expect(replaced.outcome).toBe('replaced');
    expect(replaced.message).toMatch(/your previous register is in the backup file you saved/i);
    expect((await getAllForExport()).map((e) => e.event_id)).toEqual(fromA.audit_events.map((e) => e.event_id));
    expect((await verifyChain()).ok).toBe(true);

    // B signs off — a normal append on top of the adopted chain.
    await append({
      event_id: 'uc-real-signoff',
      use_case_id: 'uc-real',
      event_type: 'twoloD_reviewed',
      occurred_at: '2026-01-05T00:00:00.000Z',
      actor: '2LoD',
      payload: { type: 'twoloD_reviewed', action: 'approved', verdict_id: 'uc-real-v1', attested_by_name: 'Priya Nair' },
    });
    const fromB = await exportBundle(APP_VERSION);

    // Back on A, unchanged since export: A is a prefix of B -> clean merge.
    await freshMachine();
    await importRawEventsForTest(fromA);
    const back = await importBundle(fromB);
    expect(back.outcome).toBe('merged');
    expect(back.eventsAdded).toBe(1);
    expect((await verifyChain()).ok).toBe(true);
  });

  it('replace refuses a tampered bundle with no writes', async () => {
    await seedSubmitterCase('uc-t');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();
    await seedSubmitterCase('uc-own');
    const tampered = { ...bundle, register: { ...bundle.register, nodes: bundle.register.nodes.map((n) => ({ ...n, label: 'X' })) } };
    expect((await replaceWithBundle(tampered)).outcome).toBe('tampered');
    expect((await getAllForExport()).map((e) => e.event_id)).toEqual(['uc-own-created', 'uc-own-verdict']);
  });
});

// code-review-005 F5. Import checked the local chain and wrote its tail as
// separate, un-queued steps; a concurrent local append() (or a second
// import) could land in between and either fork the chain or silently lose
// a write. importTailIfContinues (audit.ts) now does read + check + write as
// ONE queued step, re-verified immediately before the insert.
describe('RG-8 hand-off bundle — concurrency (code-review-005 F5)', () => {
  beforeEach(async () => {
    await freshMachine();
  });

  it('TC-RG-8-22: a local append() racing a concurrent importBundle() of an EXTENDING bundle cannot fork the chain or lose either write', async () => {
    await seedSubmitterCase('uc-race');
    const shared = await exportBundle(APP_VERSION); // 2 events, == local's current state

    // Build the "incoming" bundle as shared + one more event, on a separate
    // machine so building it does not touch local's own chain.
    await freshMachine();
    await importBundle(shared);
    await append({
      event_id: 'uc-race-signoff',
      use_case_id: 'uc-race',
      event_type: 'twoloD_reviewed',
      occurred_at: '2026-01-03T00:00:00.000Z',
      actor: '2LoD',
      payload: { type: 'twoloD_reviewed', action: 'approved', verdict_id: 'uc-race-v1', attested_by_name: 'Reviewer' },
    });
    const extendingBundle = await exportBundle(APP_VERSION); // 3 events

    // Back to "local": reconstruct the ORIGINAL 2-event state, then fire a
    // local append() and the import of extendingBundle CONCURRENTLY —
    // neither awaited before the other starts.
    await freshMachine();
    await seedSubmitterCase('uc-race');

    const racingAppend = append({
      event_id: 'uc-race-local-note',
      use_case_id: 'uc-race',
      event_type: 'lifecycle_stage_changed',
      occurred_at: new Date().toISOString(),
      actor: 'system',
      payload: { type: 'lifecycle_stage_changed', from_stage: 'pre_checked', to_stage: 'approved' },
    });
    const racingImport = importBundle(extendingBundle);

    await Promise.all([racingAppend, racingImport]);

    // Whichever order the queue actually serialised them in — the local
    // append landing first (making the import correctly see divergence
    // against a bundle that no longer matches), or the import landing first
    // (making the local append extend the newly-merged chain) — the ONE
    // outcome that must never happen is a fork: the chain must still verify,
    // and the local append must never be silently dropped.
    const finalChain = await getAllForExport();
    expect(finalChain.some((e) => e.event_id === 'uc-race-local-note')).toBe(true);
    expect((await verifyChain()).ok).toBe(true);
  });

  it('TC-RG-8-23: two concurrent imports of the SAME extending bundle apply it exactly once (no duplicate event_id write)', async () => {
    await seedSubmitterCase('uc-race-dup');
    const shared = await exportBundle(APP_VERSION);
    await freshMachine();
    await importBundle(shared);
    await append({
      event_id: 'uc-race-dup-signoff',
      use_case_id: 'uc-race-dup',
      event_type: 'twoloD_reviewed',
      occurred_at: '2026-01-03T00:00:00.000Z',
      actor: '2LoD',
      payload: { type: 'twoloD_reviewed', action: 'approved', verdict_id: 'uc-race-dup-v1', attested_by_name: 'Reviewer' },
    });
    const extendingBundle = await exportBundle(APP_VERSION);

    await freshMachine();
    await seedSubmitterCase('uc-race-dup');

    const [first, second] = await Promise.all([importBundle(extendingBundle), importBundle(extendingBundle)]);

    // Exactly one of the two calls performed the write; the other correctly
    // saw the (by-then) up-to-date chain — never both writing the same tail
    // (which would throw a ConstraintError from the queue's db.add(), a
    // worse failure mode than a clean second no-op).
    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(['merged', 'up_to_date']);
    const finalChain = await getAllForExport();
    expect(finalChain.map((e) => e.event_id)).toEqual(['uc-race-dup-created', 'uc-race-dup-verdict', 'uc-race-dup-signoff']);
    expect((await verifyChain()).ok).toBe(true);
  });
});

// Restores machine A's exact pre-export state (same hashes) — what A's
// IndexedDB still holds when B's bundle comes back.
async function importRawEventsForTest(b: HandoffBundle): Promise<void> {
  expect((await importBundle(b)).outcome).toBe('imported_into_empty');
}

// Helper: recompute a bundle's seal over its (possibly tampered) current
// contents, using handoff.ts's own exported computeSeal — not a private
// re-implementation (this file used to duplicate the canonical-JSON
// algorithm here; keeping ONE implementation and importing it is what F2's
// forged-bundle test above also relies on).
async function reseal(bundle: HandoffBundle): Promise<HandoffBundle> {
  return { ...bundle, seal: await computeSeal(bundle.register, bundle.audit_events) };
}
