import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import RegisterView from '../RegisterView';
import { addNode } from '../../store/register';
import * as registerStore from '../../store/register';
import { append, getAllForExport, __resetChainStateForTests } from '../../store/audit';
import { __resetDbsForTests } from '../../store/db';
import { exportBundle, __resetHandoffSyncStateForTests, type HandoffBundle } from '../../store/handoff';
import type { RegisterNode, RegisterNodeMetadata } from '../../store/types';

// code-review-005 F20. The hand-off UI (export/import/replace) had no test
// at any layer before this round — this file exercises it through the REAL
// buttons and the REAL (hidden) file input, the way a reviewer's browser
// actually would, rather than calling handoff.ts's functions directly
// (already covered thoroughly in store/handoff.test.ts).

// jsdom (this project's test environment) does not implement
// File.prototype.text() — verified empirically. RegisterView's import
// handler calls it directly, a standard real-browser API; this polyfills it
// via FileReader (which jsdom DOES implement), scoped to this file only.
if (typeof File !== 'undefined' && typeof File.prototype.text !== 'function') {
  File.prototype.text = function (this: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

function RegisterViewHarness(props: Omit<ComponentProps<typeof RegisterView>, 'selectedId' | 'onSelectRow' | 'onCloseDetail'>) {
  const [sel, setSel] = useState<string | null>(null);
  return <RegisterView {...props} selectedId={sel} onSelectRow={setSel} onCloseDetail={() => setSel(null)} />;
}

function makeUseCaseMetadata(overrides: Partial<Extract<RegisterNodeMetadata, { node_type: 'use_case' }>> = {}): RegisterNodeMetadata {
  return {
    node_type: 'use_case',
    submitted_by: '1LoD',
    lifecycle_stage: 'pre_checked',
    current_verdict_id: null,
    tier: 'High',
    track: 'II',
    ...overrides,
  };
}

function makeUseCaseNode(overrides: Partial<RegisterNode> = {}): RegisterNode {
  return {
    node_id: overrides.node_id ?? crypto.randomUUID(),
    node_type: 'use_case',
    label: 'A local demo case',
    created_at: new Date().toISOString(),
    metadata: makeUseCaseMetadata(),
    ...overrides,
  } as RegisterNode;
}

// Seeds ONE local use case with a real audit trail — this is what puts the
// component past its `rows.length === 0` early return (which renders before
// the hand-off section and would otherwise hide it from every test here).
async function seedLocalDemoCase(useCaseId: string): Promise<void> {
  await addNode(makeUseCaseNode({ node_id: useCaseId, label: 'Local demo case' }));
  await append({
    event_id: `${useCaseId}-created`,
    use_case_id: useCaseId,
    event_type: 'use_case_created',
    occurred_at: new Date().toISOString(),
    actor: '1LoD',
    payload: { type: 'use_case_created', description: 'Local demo', intake_method: 'structured_form' },
  });
}

// Builds a bundle from content that never touches "local" — resets the
// shared store before AND after, so the content is real (produced by the
// real exportBundle()) but never leaks into what the component under test
// will see as its own local state.
async function buildForeignBundle(useCaseId: string, eventCount = 1): Promise<HandoffBundle> {
  await __resetDbsForTests();
  __resetChainStateForTests();
  await addNode(makeUseCaseNode({ node_id: useCaseId, label: 'Foreign case' }));
  for (let i = 0; i < eventCount; i++) {
    await append({
      event_id: `${useCaseId}-evt-${i}`,
      use_case_id: useCaseId,
      event_type: 'lifecycle_stage_changed',
      occurred_at: new Date(Date.now() + i * 1000).toISOString(),
      actor: 'system',
      payload: { type: 'lifecycle_stage_changed', from_stage: 'idea', to_stage: 'exploring' },
    });
  }
  const bundle = await exportBundle('1.0.0-test');
  await __resetDbsForTests();
  __resetChainStateForTests();
  return bundle;
}

function makeFile(content: unknown, name = 'bundle.json'): File {
  return new File([JSON.stringify(content)], name, { type: 'application/json' });
}

async function getImportInput(): Promise<HTMLElement> {
  return screen.getByLabelText(/import hand-off bundle file/i);
}

// Synchronous file-input change — unlike userEvent.upload (which has its own
// internal await steps), this fires the onChange handler, and therefore
// handleImportBundleFile's synchronous guard-check-and-set prefix, in the
// SAME synchronous burst as the call site. Two of these back-to-back, with
// no await between them, is the deterministic way to land a second call
// while the first is still in flight (its own first `await file.text()` has
// not yet had a chance to resume) — the exact race importInFlight exists to
// close.
function fireFileChange(input: HTMLElement, file: File): void {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

describe('RegisterView hand-off — export (code-review-005 F1/F2/F20)', () => {
  beforeEach(async () => {
    await __resetDbsForTests();
    __resetChainStateForTests();
    __resetHandoffSyncStateForTests();
  });

  it('TC-RG-8-01: export success shows the exact F2 message and downloads a bundle containing this register\'s data', async () => {
    const user = userEvent.setup();
    const id = crypto.randomUUID();
    await seedLocalDemoCase(id);

    let capturedJson: string | undefined;
    const OriginalBlob = globalThis.Blob;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    globalThis.Blob = class MockBlob {
      constructor(parts: BlobPart[]) {
        capturedJson = String(parts[0]);
      }
    } as unknown as typeof Blob;
    URL.createObjectURL = (() => 'blob:mock-url') as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;

    try {
      render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
      await screen.findByText('Local demo case');

      await user.click(screen.getByRole('button', { name: /^export hand-off bundle$/i }));

      // code-review-005 round 2, N7: the old wording stated the file was
      // saved as fact ("Exported N events... to a hand-off file") — a
      // browser can silently block or redirect a download. The new wording
      // says what the app actually knows and asks the user to confirm the
      // rest themselves.
      expect(
        await screen.findByText(
          /created a hand-off file named .*\.json with 1 audit events and 1 register entries\. check it's in your downloads folder, then send it to the other reviewer directly\./i,
        ),
      ).toBeInTheDocument();
      expect(capturedJson).toBeDefined();
      const parsed = JSON.parse(capturedJson!);
      expect(parsed.audit_events.some((e: { use_case_id: string }) => e.use_case_id === id)).toBe(true);
      expect(typeof parsed.seal).toBe('string');
    } finally {
      globalThis.Blob = OriginalBlob;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it('TC-RG-8-02: export failure is reported, not swallowed (F1: handleExportBundle must return success/failure)', async () => {
    const user = userEvent.setup();
    await seedLocalDemoCase(crypto.randomUUID());

    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = (() => {
      throw new Error('Blob URLs are disabled in this test browser');
    }) as typeof URL.createObjectURL;

    try {
      render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
      await screen.findByText('Local demo case');

      await user.click(screen.getByRole('button', { name: /^export hand-off bundle$/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/export failed/i);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
    }
  });
});

describe('RegisterView hand-off — two-step replace (code-review-005 F1)', () => {
  beforeEach(async () => {
    await __resetDbsForTests();
    __resetChainStateForTests();
    __resetHandoffSyncStateForTests();
  });

  function mockSuccessfulDownload() {
    const OriginalBlob = globalThis.Blob;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    globalThis.Blob = class MockBlob {
      constructor() {
        /* no-op — content not inspected in these tests */
      }
    } as unknown as typeof Blob;
    URL.createObjectURL = (() => 'blob:mock-url') as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
    return () => {
      globalThis.Blob = OriginalBlob;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    };
  }

  it('TC-RG-8-19: a diverging import (first receipt) offers step 1 only; step 2 appears after a successful backup, and step 2 performs the replace', async () => {
    const user = userEvent.setup();
    // buildForeignBundle wipes the store internally (before AND after) to
    // build its content in isolation — it must run BEFORE any local state is
    // seeded, or it would wipe that local state out too.
    const foreignId = crypto.randomUUID();
    const foreign = await buildForeignBundle(foreignId);
    const localId = crypto.randomUUID();
    await seedLocalDemoCase(localId);

    const restore = mockSuccessfulDownload();
    try {
      render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
      await screen.findByText('Local demo case');

      await userEvent.upload(await getImportInput(), makeFile(foreign));

      expect(await screen.findByText(/different histories, so they can't be merged/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^save a backup of mine first$/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /replace my register/i })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^save a backup of mine first$/i }));

      expect(await screen.findByText(/a backup file named .* was created/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^save a backup of mine first$/i })).not.toBeInTheDocument();
      const confirmButton = screen.getByRole('button', { name: /i have my backup — replace my register/i });

      await user.click(confirmButton);

      expect(
        await screen.findByText(/your register was replaced with this bundle \(1 events\)\. your previous register is in the backup file you saved\./i),
      ).toBeInTheDocument();
      // The replace actually happened: the foreign case is now in the store.
      await waitFor(async () => {
        const events = await getAllForExport();
        expect(events.some((e) => e.use_case_id === foreignId)).toBe(true);
      });
    } finally {
      restore();
    }
  });

  it('TC-RG-8-18: F1: a failed backup aborts — nothing is replaced, and the confirm-replace button never appears', async () => {
    const user = userEvent.setup();
    const foreign = await buildForeignBundle(crypto.randomUUID());
    await seedLocalDemoCase(crypto.randomUUID());

    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = (() => {
      throw new Error('download blocked');
    }) as typeof URL.createObjectURL;

    try {
      render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
      await screen.findByText('Local demo case');

      await userEvent.upload(await getImportInput(), makeFile(foreign));
      await screen.findByRole('button', { name: /^save a backup of mine first$/i });

      await user.click(screen.getByRole('button', { name: /^save a backup of mine first$/i }));

      expect(await screen.findByText("Couldn't create a backup, so nothing was replaced.")).toBeInTheDocument();
      // Still at step 1 — the destructive step was never offered.
      expect(screen.getByRole('button', { name: /^save a backup of mine first$/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /replace my register/i })).not.toBeInTheDocument();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
    }
  });

  it('TC-RG-8-20: "Keep my register" cancels the pending replace at step 1', async () => {
    const user = userEvent.setup();
    const foreign = await buildForeignBundle(crypto.randomUUID());
    await seedLocalDemoCase(crypto.randomUUID());

    render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
    await screen.findByText('Local demo case');

    await userEvent.upload(await getImportInput(), makeFile(foreign));
    await screen.findByRole('button', { name: /^save a backup of mine first$/i });

    await user.click(screen.getByRole('button', { name: /^keep my register$/i }));

    expect(screen.queryByRole('button', { name: /^save a backup of mine first$/i })).not.toBeInTheDocument();
  });

  it('TC-RG-8-21: an unrelated second import attempt does not clear a valid pending replace (code-review-005 F28, strengthened by round 3 R3-2)', async () => {
    const foreign = await buildForeignBundle(crypto.randomUUID());
    await seedLocalDemoCase(crypto.randomUUID());

    render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
    await screen.findByText('Local demo case');

    await userEvent.upload(await getImportInput(), makeFile(foreign));
    await screen.findByRole('button', { name: /^save a backup of mine first$/i });

    // round 3, R3-2: F28's original guarantee (an unrelated file's own
    // invalid_format outcome leaves pendingReplace untouched) is now
    // strengthened — "Import hand-off bundle" is disabled for as long as a
    // replace is pending (a REAL user, via userEvent, could not reach the
    // input at all), AND the handler itself refuses ANY second file before
    // even parsing it, as defence in depth. fireFileChange (direct
    // dispatch, bypassing the disabled attribute, same technique TC-RG-8-41
    // uses) proves that second, handler-level guard directly: even a
    // completely broken, unrelated file produces no new message at all —
    // not even its own "not a bundle" error — and the pending replace
    // decision above is left exactly as it was. The early return happens
    // before any `await`, so there is no async gap to wait out here.
    fireFileChange(await getImportInput(), makeFile({ not: 'a bundle' }));

    expect(screen.queryByText('This file is not an Counterpoise hand-off bundle.')).not.toBeInTheDocument();
    expect(screen.getByText(/different histories, so they can't be merged/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^save a backup of mine first$/i })).toBeInTheDocument();
  });
});

// code-review-005 round 2, N1. A register-step failure after the audit
// trail was already replaced used to be a thrown Error whose message
// RegisterView appended a fixed "your register was not changed" sentence to
// — self-contradicting, since the audit trail (also shown on this screen)
// really had just been replaced. Forcing that failure needs a real
// register-store error a well-formed bundle cannot produce on its own;
// vi.spyOn on register.ts's own export injects exactly that one failure.
describe('RegisterView hand-off — partial replace and finishing it (code-review-005 round 2, N1)', () => {
  beforeEach(async () => {
    await __resetDbsForTests();
    __resetChainStateForTests();
    __resetHandoffSyncStateForTests();
  });

  function mockSuccessfulDownload() {
    const OriginalBlob = globalThis.Blob;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    globalThis.Blob = class MockBlob {
      constructor() {
        /* no-op — content not inspected in these tests */
      }
    } as unknown as typeof Blob;
    URL.createObjectURL = (() => 'blob:mock-url') as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
    return () => {
      globalThis.Blob = OriginalBlob;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    };
  }

  it('TC-RG-8-38: after a register-step failure, "Finish updating the register" appears and completes the replace', async () => {
    const user = userEvent.setup();
    const foreignId = crypto.randomUUID();
    const foreign = await buildForeignBundle(foreignId);
    await seedLocalDemoCase(crypto.randomUUID());

    const restore = mockSuccessfulDownload();
    const spy = vi.spyOn(registerStore, 'backupAndReplaceRegister').mockRejectedValueOnce(new Error('simulated register-store failure'));
    try {
      render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
      await screen.findByText('Local demo case');

      await userEvent.upload(await getImportInput(), makeFile(foreign));
      // Must await the diverged state itself before clicking — the file
      // input's change handler is fire-and-forget (void
      // handleImportBundleFile(file)), so userEvent.upload resolving only
      // means the simulated interaction finished, not that the async import
      // it kicked off has landed yet.
      await screen.findByRole('button', { name: /^save a backup of mine first$/i });
      await user.click(screen.getByRole('button', { name: /^save a backup of mine first$/i }));
      await screen.findByText(/a backup file named .* was created/i);
      await user.click(screen.getByRole('button', { name: /i have my backup — replace my register/i }));

      const partialMsg = await screen.findByText(/audit trail was replaced/i);
      expect(partialMsg.textContent).not.toMatch(/register was not changed/i);
      expect(screen.queryByRole('button', { name: /i have my backup — replace my register/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^keep my register$/i })).not.toBeInTheDocument();

      // The mocked failure only fires once (mockRejectedValueOnce) — the
      // retry below calls through to the real implementation.
      await user.click(screen.getByRole('button', { name: /finish updating the register/i }));

      expect(await screen.findByText(/your previous register is in the backup file you saved/i)).toBeInTheDocument();
      await waitFor(async () => {
        const events = await getAllForExport();
        expect(events.some((e) => e.use_case_id === foreignId)).toBe(true);
      });
    } finally {
      spy.mockRestore();
      restore();
    }
  });
});

// code-review-005 round 3, R3-1. partially_replaced's only record that the
// register still needs finishing was this component's own React state
// (awaitingFinish/pendingReplace/backupReady) — gone the moment the user
// switches view (App.tsx unmounts RegisterView) or reloads, with nothing
// left in the UI to reach finishRegisterReplace. Proves the recovery path
// through a REAL unmount + fresh mount (the component-level stand-in for a
// view switch/reload) and the real file input + buttons.
describe('RegisterView hand-off — recovering a lost partially_replaced via re-import (code-review-005 round 3, R3-1)', () => {
  beforeEach(async () => {
    await __resetDbsForTests();
    __resetChainStateForTests();
    __resetHandoffSyncStateForTests();
  });

  function mockSuccessfulDownload() {
    const OriginalBlob = globalThis.Blob;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    globalThis.Blob = class MockBlob {
      constructor() {
        /* no-op — content not inspected in these tests */
      }
    } as unknown as typeof Blob;
    URL.createObjectURL = (() => 'blob:mock-url') as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
    return () => {
      globalThis.Blob = OriginalBlob;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    };
  }

  it('TC-RG-8-44: unmounting after a partial replace, then re-importing the same file in a fresh mount, offers "Finish updating the register" and completes it', async () => {
    const user = userEvent.setup();
    const foreignId = crypto.randomUUID();
    const foreign = await buildForeignBundle(foreignId);
    const localId = crypto.randomUUID();
    await seedLocalDemoCase(localId);

    let restore = mockSuccessfulDownload();
    const spy = vi.spyOn(registerStore, 'backupAndReplaceRegister').mockRejectedValueOnce(new Error('simulated register-store failure'));
    try {
      const { unmount } = render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
      await screen.findByText('Local demo case');

      await userEvent.upload(await getImportInput(), makeFile(foreign));
      await screen.findByRole('button', { name: /^save a backup of mine first$/i });
      await user.click(screen.getByRole('button', { name: /^save a backup of mine first$/i }));
      await screen.findByText(/a backup file named .* was created/i);
      await user.click(screen.getByRole('button', { name: /i have my backup — replace my register/i }));

      // partially_replaced reached — "Finish updating the register" is the
      // only action on screen right now.
      await screen.findByText(/audit trail was replaced/i);
      expect(screen.getByRole('button', { name: /finish updating the register/i })).toBeInTheDocument();

      // The ONE thing R3-1 is about: every piece of in-memory state this
      // component held (awaitingFinish/pendingReplace/backupReady) is gone
      // — a view switch or a reload, stood in for by a real unmount.
      unmount();
    } finally {
      spy.mockRestore(); // consumed after its one call either way; tidy regardless
      restore();
    }

    // A genuinely fresh component instance — same as a reload. A fresh
    // download mock too (the first was torn down above).
    restore = mockSuccessfulDownload();
    try {
      render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
      await screen.findByText('Local demo case'); // the register step never ran — still there

      // Re-import the EXACT SAME file.
      await userEvent.upload(await getImportInput(), makeFile(foreign));

      expect(await screen.findByText(/audit trail already matches this bundle/i)).toBeInTheDocument();
      // No backup step this time — the audit side isn't being touched
      // again, so ONLY "Finish updating the register" is offered.
      expect(screen.queryByRole('button', { name: /^save a backup of mine first$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^keep my register$/i })).not.toBeInTheDocument();
      const finishButton = await screen.findByRole('button', { name: /finish updating the register/i });

      await user.click(finishButton);

      expect(await screen.findByText(/your previous register is in the backup file you saved/i)).toBeInTheDocument();
      await waitFor(async () => {
        const { nodes } = await registerStore.exportAll();
        expect(nodes.some((n) => n.node_id === foreignId)).toBe(true);
      });
    } finally {
      restore();
    }
  });
});

// code-review-005 round 3, R3-2. RegisterView's diverged branch set
// pendingReplace/backupReady but not awaitingFinish, so importing a second,
// diverging file while an earlier finish was still pending could show BOTH
// "Keep my register" (for the new bundle) and "Finish updating the
// register" (for the old one) — and "Keep" silently abandoned the finish.
// Proves the fix: the "Import hand-off bundle" control is disabled with a
// visible reason whenever a replace/finish is pending, and a second file
// landing on the handler anyway (bypassing the disabled control) is ignored.
describe('RegisterView hand-off — import disabled while a replace/finish is pending (code-review-005 round 3, R3-2)', () => {
  beforeEach(async () => {
    await __resetDbsForTests();
    __resetChainStateForTests();
    __resetHandoffSyncStateForTests();
  });

  function mockSuccessfulDownload() {
    const OriginalBlob = globalThis.Blob;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    globalThis.Blob = class MockBlob {
      constructor() {
        /* no-op */
      }
    } as unknown as typeof Blob;
    URL.createObjectURL = (() => 'blob:mock-url') as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
    return () => {
      globalThis.Blob = OriginalBlob;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    };
  }

  it('TC-RG-8-45: while "Finish updating the register" is pending, Import is disabled and a second, different bundle landing on the handler anyway is ignored', async () => {
    const user = userEvent.setup();
    const foreignAId = crypto.randomUUID();
    const foreignA = await buildForeignBundle(foreignAId);
    const foreignBId = crypto.randomUUID();
    const foreignB = await buildForeignBundle(foreignBId);
    await seedLocalDemoCase(crypto.randomUUID());

    const restore = mockSuccessfulDownload();
    const spy = vi.spyOn(registerStore, 'backupAndReplaceRegister').mockRejectedValueOnce(new Error('simulated register-store failure'));
    try {
      render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
      await screen.findByText('Local demo case');

      await userEvent.upload(await getImportInput(), makeFile(foreignA));
      await screen.findByRole('button', { name: /^save a backup of mine first$/i });
      await user.click(screen.getByRole('button', { name: /^save a backup of mine first$/i }));
      await screen.findByText(/a backup file named .* was created/i);
      await user.click(screen.getByRole('button', { name: /i have my backup — replace my register/i }));
      await screen.findByText(/audit trail was replaced/i);

      // A finish is now pending for bundle A. The control is disabled, with
      // a visible reason, and a second file (bundle B — different content)
      // landing directly on the (disabled) input must be ignored, not
      // start processing bundle B or disturb the pending finish.
      expect(screen.getByRole('button', { name: /^import hand-off bundle$/i })).toBeDisabled();
      expect(await screen.findByText(/finish or cancel the pending replace first/i)).toBeInTheDocument();

      fireFileChange(await getImportInput(), makeFile(foreignB));

      // Still exactly the bundle-A finish state — never both pending
      // decisions on screen, and "Keep my register" never reappears.
      expect(screen.getByRole('button', { name: /finish updating the register/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^save a backup of mine first$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^keep my register$/i })).not.toBeInTheDocument();

      // The mocked failure only fired once — finishing now calls through to
      // the real implementation and completes bundle A's register step.
      await user.click(screen.getByRole('button', { name: /finish updating the register/i }));
      expect(await screen.findByText(/your previous register is in the backup file you saved/i)).toBeInTheDocument();

      await waitFor(async () => {
        const { nodes } = await registerStore.exportAll();
        expect(nodes.some((n) => n.node_id === foreignAId)).toBe(true);
      });
      // Bundle B was never absorbed — ignored outright, not merged or queued.
      const { nodes } = await registerStore.exportAll();
      expect(nodes.some((n) => n.node_id === foreignBId)).toBe(false);
    } finally {
      spy.mockRestore();
      restore();
    }
  });

  // Companion to the test above: a REAL user cannot even reach the file
  // picker while a replace is pending — the control itself is disabled,
  // with a visible reason, so TC-RG-8-21's fireFileChange-based guard is
  // defence in depth, not the primary protection.
  it('TC-RG-8-49: the Import control is disabled (not just the file ignored) for as long as a replace is pending, and re-enables once it is abandoned', async () => {
    const foreign = await buildForeignBundle(crypto.randomUUID());
    await seedLocalDemoCase(crypto.randomUUID());

    render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
    await screen.findByText('Local demo case');

    expect(screen.getByRole('button', { name: /^import hand-off bundle$/i })).toBeEnabled();
    expect(screen.queryByText(/finish or cancel the pending replace first/i)).not.toBeInTheDocument();

    await userEvent.upload(await getImportInput(), makeFile(foreign));
    await screen.findByRole('button', { name: /^save a backup of mine first$/i });

    expect(screen.getByRole('button', { name: /^import hand-off bundle$/i })).toBeDisabled();
    expect(await getImportInput()).toBeDisabled();
    expect(screen.getByText(/finish or cancel the pending replace first/i)).toBeInTheDocument();

    // Abandoning the pending replace re-enables it.
    await userEvent.click(screen.getByRole('button', { name: /^keep my register$/i }));
    expect(screen.getByRole('button', { name: /^import hand-off bundle$/i })).toBeEnabled();
  });
});

// code-review-005 round 3, R3-4 (Minor). finish_out_of_date already had a
// store-level test (TC-RG-8-30); this is the matching component-level test
// through the real "Finish updating the register" button, the one gap the
// R3 brief named explicitly.
describe('RegisterView hand-off — finish_out_of_date through the real button (code-review-005 round 3, R3-4)', () => {
  beforeEach(async () => {
    await __resetDbsForTests();
    __resetChainStateForTests();
    __resetHandoffSyncStateForTests();
  });

  function mockSuccessfulDownload() {
    const OriginalBlob = globalThis.Blob;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    globalThis.Blob = class MockBlob {
      constructor() {
        /* no-op */
      }
    } as unknown as typeof Blob;
    URL.createObjectURL = (() => 'blob:mock-url') as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
    return () => {
      globalThis.Blob = OriginalBlob;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    };
  }

  it('TC-RG-8-46: when the audit trail moves on before Finish is clicked, the button reports finish_out_of_date and the register is left untouched', async () => {
    const user = userEvent.setup();
    const foreignId = crypto.randomUUID();
    const foreign = await buildForeignBundle(foreignId);
    const localId = crypto.randomUUID();
    await seedLocalDemoCase(localId);

    const restore = mockSuccessfulDownload();
    const spy = vi.spyOn(registerStore, 'backupAndReplaceRegister').mockRejectedValueOnce(new Error('simulated register-store failure'));
    try {
      render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
      await screen.findByText('Local demo case');

      await userEvent.upload(await getImportInput(), makeFile(foreign));
      await screen.findByRole('button', { name: /^save a backup of mine first$/i });
      await user.click(screen.getByRole('button', { name: /^save a backup of mine first$/i }));
      await screen.findByText(/a backup file named .* was created/i);
      await user.click(screen.getByRole('button', { name: /i have my backup — replace my register/i }));
      const finishButton = await screen.findByRole('button', { name: /finish updating the register/i });

      // Something else writes to the (already-replaced) audit trail before
      // the user gets to click Finish — the same shape of write a
      // concurrent 2LoD approval's audit event would be.
      await append({
        event_id: 'uc-ui-finish-stale-extra',
        use_case_id: foreignId,
        event_type: 'lifecycle_stage_changed',
        occurred_at: new Date().toISOString(),
        actor: 'system',
        payload: { type: 'lifecycle_stage_changed', from_stage: 'idea', to_stage: 'exploring' },
      });

      await user.click(finishButton);

      expect(await screen.findByText(/reload the page to see the current state/i)).toBeInTheDocument();
      // finish_out_of_date is a dead end for this pending bundle (same as
      // handleFinishRegisterReplace's own 'replaced' handling) — neither
      // action renders any more.
      expect(screen.queryByRole('button', { name: /finish updating the register/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^save a backup of mine first$/i })).not.toBeInTheDocument();
      // The register step never ran — still the pre-replace local data.
      expect(screen.getByText('Local demo case')).toBeInTheDocument();
      const { nodes } = await registerStore.exportAll();
      expect(nodes.some((n) => n.node_id === foreignId)).toBe(false);
    } finally {
      spy.mockRestore();
      restore();
    }
  });
});

// code-review-005 round 2, N2. Local changes made between "Save a backup of
// mine first" and confirming are reachable in ONE tab (the case page renders
// inside this same component, so a user can open a case and sign it off
// while a replace is still pending) — they are not in the backup file the
// success message points to. A direct append() here stands in for that
// in-between write; the mechanism under test (replaceWithBundle's atomic tip
// check) does not care which UI path produced it.
describe('RegisterView hand-off — backup staleness at replace time (code-review-005 round 2, N2)', () => {
  beforeEach(async () => {
    await __resetDbsForTests();
    __resetChainStateForTests();
    __resetHandoffSyncStateForTests();
  });

  it('TC-RG-8-39: a local write after the backup sends the UI back to step 1, keeping the same pending bundle', async () => {
    const user = userEvent.setup();
    const foreign = await buildForeignBundle(crypto.randomUUID());
    const localId = crypto.randomUUID();
    await seedLocalDemoCase(localId);

    const OriginalBlob = globalThis.Blob;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    globalThis.Blob = class MockBlob {
      constructor() {
        /* no-op */
      }
    } as unknown as typeof Blob;
    URL.createObjectURL = (() => 'blob:mock-url') as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;

    try {
      render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
      await screen.findByText('Local demo case');

      await userEvent.upload(await getImportInput(), makeFile(foreign));
      // See the N1 test above for why this wait (not just the upload's own
      // promise) is required before the first click.
      await screen.findByRole('button', { name: /^save a backup of mine first$/i });
      await user.click(screen.getByRole('button', { name: /^save a backup of mine first$/i }));
      await screen.findByText(/a backup file named .* was created/i);

      await append({
        event_id: 'uc-n2-ui-extra',
        use_case_id: localId,
        event_type: 'lifecycle_stage_changed',
        occurred_at: new Date().toISOString(),
        actor: 'system',
        payload: { type: 'lifecycle_stage_changed', from_stage: 'pre_checked', to_stage: 'approved' },
      });

      await user.click(screen.getByRole('button', { name: /i have my backup — replace my register/i }));

      expect(await screen.findByText(/your register changed after you saved the backup/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^save a backup of mine first$/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /replace my register/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /finish updating the register/i })).not.toBeInTheDocument();
    } finally {
      globalThis.Blob = OriginalBlob;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });
});

// code-review-005 round 2, N8. "Save a backup of mine first" had no
// synchronous in-flight guard — a double-click fired handleBackupBeforeReplace
// twice before React could disable anything, downloading the backup twice.
describe('RegisterView hand-off — backup double-click guard (code-review-005 round 2, N8)', () => {
  beforeEach(async () => {
    await __resetDbsForTests();
    __resetChainStateForTests();
    __resetHandoffSyncStateForTests();
  });

  it('TC-RG-8-40: double-clicking "Save a backup of mine first" downloads only once', async () => {
    const foreign = await buildForeignBundle(crypto.randomUUID());
    await seedLocalDemoCase(crypto.randomUUID());

    let downloadCount = 0;
    const OriginalBlob = globalThis.Blob;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    globalThis.Blob = class MockBlob {
      constructor() {
        downloadCount += 1;
      }
    } as unknown as typeof Blob;
    URL.createObjectURL = (() => 'blob:mock-url') as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;

    try {
      render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
      await screen.findByText('Local demo case');

      await userEvent.upload(await getImportInput(), makeFile(foreign));
      const backupButton = await screen.findByRole('button', { name: /^save a backup of mine first$/i });

      // Two rapid, un-awaited clicks — same style as this codebase's other
      // in-flight-guard tests (RegisterDetail.test.tsx's double-submission
      // test): jsdom flushes a re-render between fireEvents, so this proves
      // the OBSERVABLE outcome (one download), which is what N8 asks for.
      fireEvent.click(backupButton);
      fireEvent.click(backupButton);

      await screen.findByText(/a backup file named .* was created/i);
      expect(downloadCount).toBe(1);
    } finally {
      globalThis.Blob = OriginalBlob;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });
});

// Test gap noted alongside code-review-005 round 1: the import double-click
// guard (importInFlight) had no test. fireFileChange (top of file) fires the
// input's change event synchronously, twice, with no await between them, so
// the second call's guard-check races the first's the same way a real rapid
// double-drop would.
describe('RegisterView hand-off — a second import while one is in flight is ignored', () => {
  beforeEach(async () => {
    await __resetDbsForTests();
    __resetChainStateForTests();
    __resetHandoffSyncStateForTests();
  });

  it('TC-RG-8-41: firing a second import before the first settles does not process the second file', async () => {
    const firstId = crypto.randomUUID();
    const first = await buildForeignBundle(firstId, 3);
    const secondId = crypto.randomUUID();
    const second = await buildForeignBundle(secondId, 5);

    // A register row with NO audit events keeps the component past its
    // `rows.length === 0` early return while leaving the audit chain
    // genuinely empty — the real precondition for imported_into_empty.
    const localId = crypto.randomUUID();
    await addNode(makeUseCaseNode({ node_id: localId, label: 'Local demo case' }));

    render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
    await screen.findByText('Local demo case');

    const input = await getImportInput();
    fireFileChange(input, makeFile(first));
    fireFileChange(input, makeFile(second));

    await waitFor(async () => {
      expect(await getAllForExport()).not.toHaveLength(0);
    });

    const events = await getAllForExport();
    const gotFirst = events.some((e) => e.use_case_id === firstId);
    const gotSecond = events.some((e) => e.use_case_id === secondId);
    // The guard is synchronous: the FIRST call's guard-check-and-set runs to
    // completion before the second call is even dispatched, so the first
    // file is deterministically the one absorbed — never both (a torn,
    // interleaved import) and never neither (the guard swallowing the only
    // import that should have gone through).
    expect(gotFirst).toBe(true);
    expect(gotSecond).toBe(false);
  });
});

describe('RegisterView hand-off — bad-file fixtures through the real file input (code-review-005 F20)', () => {
  beforeEach(async () => {
    await __resetDbsForTests();
    __resetChainStateForTests();
    __resetHandoffSyncStateForTests();
    await seedLocalDemoCase(crypto.randomUUID());
    render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
    await screen.findByText('Local demo case');
  });

  it('malformed JSON', async () => {
    await userEvent.upload(await getImportInput(), new File(['{ this is not json'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByText(/not valid json/i)).toBeInTheDocument();
  });

  it('an unsupported format_version gets its own distinct message', async () => {
    const foreign = await buildForeignBundle(crypto.randomUUID());
    await userEvent.upload(await getImportInput(), makeFile({ ...foreign, format_version: 42 }));
    expect(await screen.findByText(/different version of Counterpoise/i)).toBeInTheDocument();
  });

  it('duplicate event ids inside one bundle', async () => {
    const foreign = await buildForeignBundle(crypto.randomUUID(), 2); // needs >=2 events to collide
    const withDupes = { ...foreign, audit_events: foreign.audit_events.map((e) => ({ ...e, event_id: 'same-id-twice' })) };
    await userEvent.upload(await getImportInput(), makeFile(withDupes));
    expect(await screen.findByText(/duplicate|more than one event/i)).toBeInTheDocument();
  });
});

describe('RegisterView hand-off — importing a large bundle into an empty audit trail', () => {
  beforeEach(async () => {
    await __resetDbsForTests();
    __resetChainStateForTests();
    __resetHandoffSyncStateForTests();
  });

  it('imports 60 events cleanly and refreshes the list', async () => {
    // buildForeignBundle wipes the store internally (before AND after) to
    // build its content in isolation — it must run BEFORE any local state is
    // seeded, or it would wipe that local state out too.
    const foreignId = crypto.randomUUID();
    const foreign = await buildForeignBundle(foreignId, 60);
    expect(foreign.audit_events).toHaveLength(60);

    // A register row with NO audit events (addNode only, no append) still
    // clears the component's `rows.length === 0` early return, while
    // leaving the AUDIT chain genuinely empty — the real precondition for
    // an 'imported_into_empty' outcome, distinct from the register being
    // non-empty.
    const localId = crypto.randomUUID();
    await addNode(makeUseCaseNode({ node_id: localId, label: 'Local demo case' }));

    render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
    await screen.findByText('Local demo case');

    await userEvent.upload(await getImportInput(), makeFile(foreign));

    expect(await screen.findByText(/imported 60 events into an empty register\./i)).toBeInTheDocument();
    await waitFor(async () => {
      const events = await getAllForExport();
      expect(events).toHaveLength(60);
    });
  });
});
