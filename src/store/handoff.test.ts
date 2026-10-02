import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { append, getAllForExport, verifyChain, __resetChainStateForTests, __recomputeChainForTests } from './audit';
import { addNode, updateLifecycleStage } from './register';
import * as registerStore from './register';
import { __resetDbsForTests } from './db';
import {
  exportBundle,
  importBundle,
  replaceWithBundle,
  finishRegisterReplace,
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

// Minimal-but-fully-shaped verdict payload; the chain hashes it opaquely, but
// handoff.ts's import validation checks it structurally, so it must carry
// every field the schema now requires (round-2 N4 broadened this from
// {id, use_case_id, status, policy_version} to the full load-bearing subset —
// see handoff.ts's verdictSchema comment) — a bare, partial fixture would
// itself now be rejected as invalid_format at import, which is exactly F13's
// (and N4's) point: an incomplete verdict is a real defect, not a test
// convenience.
function minimalVerdict(useCaseId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `${useCaseId}-v1`,
    use_case_id: useCaseId,
    status: 'approved_with_controls',
    policy_version: '1.0',
    tier: 'High',
    track: 'II',
    confidence_caveats: [],
    controls: [],
    downstream_reviews: [],
    conditions: { hypotheses: [] },
    margin_achieved: 0,
    margin_target: 0.1,
    single_covered_invariants: [],
    boundary_proximity: false,
    attested_at: '2026-01-02T00:00:01.000Z',
    living_status: 'approved',
    ...overrides,
  } as never;
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
    payload: {
      type: 'verdict_produced',
      verdict: minimalVerdict(useCaseId),
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
    expect(result.message).toMatch(/different version of Counterpoise/i);
    expect(result.message).not.toBe('This file is not an Counterpoise hand-off bundle.');
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

// code-review-005 round 2, N1. A register-step failure AFTER the audit
// trail was already replaced used to be thrown as an Error whose message
// RegisterView then appended a FIXED "your register was not changed" sentence
// to — a direct self-contradiction, since the audit trail (also rendered on
// the register screen) had in fact just been replaced. Forcing this failure
// needs a real register-store error the fixture data itself cannot produce
// (a well-formed, schema-valid bundle never fails backupAndReplaceRegister's
// plain IndexedDB put()s) — vi.spyOn on register.ts's own export is the
// narrowest way to inject exactly that one failure without touching
// register.ts's source.
describe('RG-8 hand-off bundle — partial replace and finishing it (code-review-005 round 2, N1)', () => {
  beforeEach(async () => {
    await freshMachine();
  });

  it('TC-RG-8-28: replaceWithBundle returns partially_replaced (never a thrown, self-contradicting message) when the register step fails after the audit trail was replaced', async () => {
    await seedSubmitterCase('uc-partial-a');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();
    await seedSubmitterCase('uc-partial-own');

    const spy = vi.spyOn(registerStore, 'backupAndReplaceRegister').mockRejectedValueOnce(new Error('simulated register-store failure'));
    try {
      const result = await replaceWithBundle(bundle);
      expect(result.outcome).toBe('partially_replaced');
      // The N1 bug, stated directly: the message must never claim BOTH that
      // the audit trail was replaced AND that nothing changed.
      expect(result.message).toMatch(/audit trail was replaced/i);
      expect(result.message).not.toMatch(/register was not changed/i);
      expect(result.message).toMatch(/finish updating the register/i);

      // The audit trail (source of truth) really was replaced, even though
      // the register did not follow.
      expect((await getAllForExport()).map((e) => e.event_id)).toEqual(bundle.audit_events.map((e) => e.event_id));
    } finally {
      spy.mockRestore();
    }
  });

  it('TC-RG-8-29: finishRegisterReplace completes the register step when the local audit tip still matches the bundle it already replaced', async () => {
    await seedSubmitterCase('uc-finish-ok');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();
    await seedSubmitterCase('uc-finish-ok-own');

    const spy = vi.spyOn(registerStore, 'backupAndReplaceRegister').mockRejectedValueOnce(new Error('simulated register-store failure'));
    let partial: Awaited<ReturnType<typeof replaceWithBundle>>;
    try {
      partial = await replaceWithBundle(bundle);
    } finally {
      spy.mockRestore();
    }
    expect(partial.outcome).toBe('partially_replaced');

    const finished = await finishRegisterReplace(bundle);
    expect(finished.outcome).toBe('replaced');
    expect(finished.message).toMatch(/your previous register is in the backup file you saved/i);

    const { nodes } = await registerStore.exportAll();
    expect(nodes.some((n) => n.node_id === 'uc-finish-ok')).toBe(true);
    expect(nodes.some((n) => n.node_id === 'uc-finish-ok-own')).toBe(false);
  });

  it('TC-RG-8-30: finishRegisterReplace refuses as finish_out_of_date, and writes nothing, when the audit trail has moved on since the partial replace', async () => {
    await seedSubmitterCase('uc-finish-stale');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();
    await seedSubmitterCase('uc-finish-stale-own');

    const spy = vi.spyOn(registerStore, 'backupAndReplaceRegister').mockRejectedValueOnce(new Error('simulated register-store failure'));
    try {
      expect((await replaceWithBundle(bundle)).outcome).toBe('partially_replaced');
    } finally {
      spy.mockRestore();
    }

    // Something else touches the (already-replaced) audit trail before the
    // user gets to "Finish updating the register" — the same shape of write
    // a concurrent 2LoD approval's audit event would be.
    await append({
      event_id: 'uc-finish-stale-extra',
      use_case_id: 'uc-finish-stale',
      event_type: 'lifecycle_stage_changed',
      occurred_at: new Date().toISOString(),
      actor: 'system',
      payload: { type: 'lifecycle_stage_changed', from_stage: 'idea', to_stage: 'exploring' },
    });

    const finished = await finishRegisterReplace(bundle);
    expect(finished.outcome).toBe('finish_out_of_date');
    expect(finished.message).toMatch(/reload/i);

    // The register step never ran — the pre-replace seed data this test
    // planted is still there, not the bundle's register.
    const { nodes } = await registerStore.exportAll();
    expect(nodes.some((n) => n.node_id === 'uc-finish-stale-own')).toBe(true);
  });
});

// code-review-005 round 3, R3-1. partially_replaced's only record that the
// register still needs finishing was React state in RegisterView
// (awaitingFinish/pendingReplace/backupReady) — gone the moment the user
// switches view or reloads. Re-importing the SAME bundle used to land in the
// plain up_to_date branch (the audit trail genuinely does already match) and
// never look at the register, leaving it silently wrong with no way back to
// finishRegisterReplace. This block proves the recovery path: up_to_date now
// also compares the register, and a mismatch there is register_needs_finishing.
describe('RG-8 hand-off bundle — recovering a lost partially_replaced via re-import (code-review-005 round 3, R3-1)', () => {
  beforeEach(async () => {
    await freshMachine();
  });

  it('TC-RG-8-42: re-importing the same bundle after a partial replace reports register_needs_finishing, and finishing it makes the register match', async () => {
    await seedSubmitterCase('uc-lost-a');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();
    await seedSubmitterCase('uc-lost-own');

    // Reach partially_replaced exactly like TC-RG-8-28/29/30 do — the audit
    // trail is replaced with the bundle's events, but the register step
    // fails, so the register still shows 'uc-lost-own'.
    const spy = vi.spyOn(registerStore, 'backupAndReplaceRegister').mockRejectedValueOnce(new Error('simulated register-store failure'));
    try {
      expect((await replaceWithBundle(bundle)).outcome).toBe('partially_replaced');
    } finally {
      spy.mockRestore();
    }

    // Simulate the in-memory record of "a finish is pending" being lost
    // entirely (RegisterView unmounted on a view switch, or the page
    // reloaded) — nothing left but the stores themselves. The user re-opens
    // the SAME bundle file and imports it again.
    const recovered = await importBundle(bundle);
    expect(recovered.outcome).toBe('register_needs_finishing');
    expect(recovered.eventsAdded).toBe(0);
    // Honest on both halves: the audit trail already matches (nothing to
    // import), the register does not (something to finish) — and names the
    // way out.
    expect(recovered.message).toMatch(/audit trail already matches/i);
    expect(recovered.message).toMatch(/finish updating the register/i);
    // Never the reserved words (CLAUDE.md), and never claims the import
    // itself replaced anything (it is read-only on the audit side here).
    expect(recovered.message).not.toMatch(/approved|rejected/i);

    // The register is still the pre-replace seed data — recovery has not
    // happened yet, only been offered.
    expect((await registerStore.exportAll()).nodes.some((n) => n.node_id === 'uc-lost-own')).toBe(true);

    // Finishing re-uses finishRegisterReplace exactly as a still-pending
    // finish would — same tip re-check, same effect.
    const finished = await finishRegisterReplace(bundle);
    expect(finished.outcome).toBe('replaced');

    const { nodes } = await registerStore.exportAll();
    expect(nodes.some((n) => n.node_id === 'uc-lost-a')).toBe(true);
    expect(nodes.some((n) => n.node_id === 'uc-lost-own')).toBe(false);
  });

  it('TC-RG-8-43: up_to_date still reports plainly when the register genuinely does match (no false register_needs_finishing)', async () => {
    // Guards the other side of the same branch: a bundle that is simply
    // already fully absorbed (register included) must not start claiming
    // the register needs finishing.
    await seedSubmitterCase('uc-plain-uptodate');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();

    expect((await importBundle(bundle)).outcome).toBe('imported_into_empty');
    const second = await importBundle(bundle);
    expect(second.outcome).toBe('up_to_date');
    expect(second.message).toBe('Your copy is already up to date with this bundle. Nothing to import.');
  });
});

// code-review-005 round 2, N2. Local changes made between "Save a backup of
// mine first" and confirming the replace are reachable in ONE tab (the case
// page renders inside RegisterView, so a user can open a case and sign it
// off while a pending replace still awaits confirmation) — they are not in
// the backup file the success message points to, yet the OLD code discarded
// them silently. The fix records the tip the backup actually exported and
// refuses, atomically with the replace itself, if the live trail has moved
// past it.
describe('RG-8 hand-off bundle — backup staleness at replace time (code-review-005 round 2, N2)', () => {
  beforeEach(async () => {
    await freshMachine();
  });

  it('TC-RG-8-31: replaceWithBundle refuses as backup_out_of_date, and writes nothing, when a local write landed after the recorded backup tip', async () => {
    await seedSubmitterCase('uc-foreign-n2');
    const foreign = await exportBundle(APP_VERSION);

    await freshMachine();
    await seedSubmitterCase('uc-local-n2'); // the state as of "step 1: save a backup"
    const myBackup = await exportBundle(APP_VERSION); // what that backup file actually contains
    const recordedTip = { hash: myBackup.audit_events.at(-1)?.hash ?? null, count: myBackup.audit_events.length };

    // Between saving the backup and confirming the replace, the user does
    // something else locally.
    await append({
      event_id: 'uc-local-n2-extra',
      use_case_id: 'uc-local-n2',
      event_type: 'lifecycle_stage_changed',
      occurred_at: new Date().toISOString(),
      actor: 'system',
      payload: { type: 'lifecycle_stage_changed', from_stage: 'pre_checked', to_stage: 'approved' },
    });

    const result = await replaceWithBundle(foreign, recordedTip);
    expect(result.outcome).toBe('backup_out_of_date');
    expect(result.message).toMatch(/save a new backup/i);

    // Nothing written — local state (seed + the extra local write) untouched.
    const local = await getAllForExport();
    expect(local.some((e) => e.event_id === 'uc-local-n2-extra')).toBe(true);
    expect(local.some((e) => e.use_case_id === 'uc-foreign-n2')).toBe(false);
  });

  it('replaceWithBundle proceeds normally when no backup tip is supplied (a caller that opts out of the check gets the plain replace)', async () => {
    await seedSubmitterCase('uc-nocheck-foreign');
    const foreign = await exportBundle(APP_VERSION);
    await freshMachine();
    await seedSubmitterCase('uc-nocheck-own');

    const result = await replaceWithBundle(foreign);
    expect(result.outcome).toBe('replaced');
  });
});

// code-review-005 round 2, N3. register.ts's updateLifecycleStage used to
// hold the REGISTER queue and await the AUDIT queue from inside it, while
// replaceWithBundle took the two queues separately with a gap between them —
// opposite nestings that, raced against each other, could leave the audit
// trail recording an approval the register does not show. Both functions now
// nest the same way (audit outer, register inner; see audit.ts's
// withAuditQueue doc), so the two operations can no longer partially
// interleave — one completes in full before the other's turn begins,
// whichever order the queue happens to serialise them in.
describe('RG-8 hand-off bundle — approve-during-replace lock ordering (code-review-005 round 2, N3)', () => {
  beforeEach(async () => {
    await freshMachine();
  });

  it('TC-RG-8-32: an updateLifecycleStage approval racing a concurrent replaceWithBundle can never leave the audit trail and register disagreeing', async () => {
    await seedSubmitterCase('uc-foreign-n3');
    const foreign = await exportBundle(APP_VERSION);

    await freshMachine();
    // uc-local-n3 is NOT part of the foreign bundle's register, so if
    // replace's turn runs first, the approval's register write has no node
    // left to update by the time its turn comes — it must fail visibly with
    // nothing written, never disagree with the audit trail.
    await seedSubmitterCase('uc-local-n3');

    const racingApprove = updateLifecycleStage('uc-local-n3', 'approved', '2LoD').catch(() => 'rejected' as const);
    const racingReplace = replaceWithBundle(foreign);
    const [approveOutcome, replaceResult] = await Promise.all([racingApprove, racingReplace]);

    expect(replaceResult.outcome).toBe('replaced');

    const finalAuditEvents = await getAllForExport();
    const approveAuditEventPresent = finalAuditEvents.some(
      (e) =>
        e.use_case_id === 'uc-local-n3' &&
        e.payload.type === 'lifecycle_stage_changed' &&
        e.payload.to_stage === 'approved',
    );
    const finalRegister = await registerStore.exportAll();
    const localNode = finalRegister.nodes.find((n) => n.node_id === 'uc-local-n3');
    const registerShowsApproved =
      localNode !== undefined && localNode.metadata.node_type === 'use_case' && localNode.metadata.lifecycle_stage === 'approved';

    // The invariant N3 names, checked directly regardless of which order the
    // queue actually serialised the two operations in: the audit trail
    // records the approval if and only if the register agrees it happened.
    expect(approveAuditEventPresent).toBe(registerShowsApproved);
    // And concretely, in THIS test's setup (the local case never appears in
    // the foreign bundle), the only two honest end states are "approval
    // fully absorbed and then correctly wiped by the replace" or "approval
    // rejected outright" — never a half-applied approval.
    expect(approveAuditEventPresent).toBe(false);
    if (approveOutcome !== 'rejected') {
      // The approval's own call resolved (it ran before the replace wiped
      // its target) — verifyChain must still hold over the final, replaced
      // trail regardless.
      expect((await verifyChain()).ok).toBe(true);
    }
  });
});

// code-review-005 round 2, N4. handoff.ts's verdictSchema did not require
// confidence_caveats, which isVerdictProvisional (src/engine/provisional.ts)
// reads whenever provisional_reasons is absent — a bundle missing it used to
// pass import cleanly, then throw the first time anything tried to read the
// verdict back (register.ts's toSummary, reached from getUseCase/getUseCases),
// dropping the case from the register list and hanging its own page on
// "Loading…" forever.
describe('RG-8 hand-off bundle — verdict schema hardening (code-review-005 round 2, N4)', () => {
  beforeEach(async () => {
    await freshMachine();
  });

  it('TC-RG-8-33: rejects a bundle whose verdict is missing confidence_caveats, instead of accepting it and failing later', async () => {
    await seedSubmitterCase('uc-no-caveats');
    const bundle = await exportBundle(APP_VERSION);
    await freshMachine();

    const broken = {
      ...bundle,
      audit_events: bundle.audit_events.map((e) => {
        if (e.payload.type !== 'verdict_produced') return e;
        const verdict = e.payload.verdict as unknown as Record<string, unknown>;
        const { confidence_caveats: _confidenceCaveats, ...verdictWithoutCaveats } = verdict;
        return { ...e, payload: { ...e.payload, verdict: verdictWithoutCaveats } };
      }),
    };

    const result = await importBundle(broken);
    expect(result.outcome).toBe('invalid_format');
    expect(await getAllForExport()).toHaveLength(0);
  });
});

// code-review-005 round 2, N9. vite-env.d.ts's comment claims __APP_VERSION__
// is "verified empirically... see the assertion in src/store/handoff.test.ts"
// — this is that assertion. Reads package.json the same way vite.config.ts's
// own `define` block does (readFileSync + JSON.parse, not a JSON import),
// so this proves the STAMPED value matches the file, not merely that two
// reads of the same config agree.
describe('RG-8 hand-off bundle — app_version provenance (code-review-005 round 2, N9)', () => {
  it("TC-RG-8-34: __APP_VERSION__ equals package.json's version", () => {
    // Same read vite.config.ts's own `define` block does (readFileSync +
    // JSON.parse against the repo-root-relative path, not a JSON import) —
    // both vite.config.ts and `npm test` (this project's required way to run
    // the suite; see CLAUDE.md) run with the repo root as cwd.
    const pkgVersion = JSON.parse(readFileSync('./package.json', 'utf-8')).version as string;
    expect(__APP_VERSION__).toBe(pkgVersion);
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
