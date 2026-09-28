import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import RegisterView from '../RegisterView';
import { addNode } from '../../store/register';
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

      expect(
        await screen.findByText(/exported 1 audit events and 1 register entries to a hand-off file\. send it to the other reviewer directly\./i),
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

  it('TC-RG-8-21: F28: an unrelated failed import does not clear a valid pending replace', async () => {
    const foreign = await buildForeignBundle(crypto.randomUUID());
    await seedLocalDemoCase(crypto.randomUUID());

    render(<RegisterViewHarness role="1LoD" currentPolicyVersion="1.0" />);
    await screen.findByText('Local demo case');

    await userEvent.upload(await getImportInput(), makeFile(foreign));
    await screen.findByRole('button', { name: /^save a backup of mine first$/i });

    // A completely unrelated, broken file — must not touch the pending
    // replace decision above, which belongs to a different bundle.
    await userEvent.upload(await getImportInput(), makeFile({ not: 'a bundle' }));

    expect(await screen.findByText('This file is not an AIGate hand-off bundle.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^save a backup of mine first$/i })).toBeInTheDocument();
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
    expect(await screen.findByText(/different version of AIGate/i)).toBeInTheDocument();
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
