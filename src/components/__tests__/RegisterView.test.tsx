import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterView from '../RegisterView';
import { addNode } from '../../store/register';
import { append } from '../../store/audit';
import type { RegisterNode, RegisterNodeMetadata } from '../../store/types';

function makeUseCaseMetadata(
  overrides: Partial<Extract<RegisterNodeMetadata, { node_type: 'use_case' }>> = {},
): RegisterNodeMetadata {
  return {
    node_type: 'use_case',
    submitted_by: '1LoD',
    lifecycle_stage: 'idea',
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
    label: 'A tool that drafts client emails',
    created_at: new Date().toISOString(),
    metadata: makeUseCaseMetadata(),
    ...overrides,
  };
}

describe('RegisterView', () => {
  it('TC-RG-2-01: 1LoD view shows only the current actor\'s use cases with the §10.1 column set', async () => {
    const own = makeUseCaseNode({ node_id: crypto.randomUUID(), label: 'Mine' });
    const other = makeUseCaseNode({
      node_id: crypto.randomUUID(),
      label: 'Not mine',
      metadata: makeUseCaseMetadata({ submitted_by: 'other-actor' }),
    });
    await addNode(own);
    await addNode(other);

    render(<RegisterView role="1LoD" currentPolicyVersion="1.0" />);

    expect(await screen.findByText('Mine')).toBeInTheDocument();
    expect(screen.queryByText('Not mine')).not.toBeInTheDocument();
    // §10.1: no filter chips, no search bar in the 1LoD view.
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });

  it('TC-RG-2-02: 2LoD view shows all use cases across submitters with the §10.2 column set including Submitter and Stale', async () => {
    const a = makeUseCaseNode({ node_id: crypto.randomUUID(), label: 'From A' });
    const b = makeUseCaseNode({
      node_id: crypto.randomUUID(),
      label: 'From B',
      metadata: makeUseCaseMetadata({ submitted_by: 'actor-b' }),
    });
    await addNode(a);
    await addNode(b);

    render(<RegisterView role="2LoD" currentPolicyVersion="1.0" />);

    expect(await screen.findByText('From A')).toBeInTheDocument();
    expect(screen.getByText('From B')).toBeInTheDocument();
    expect(screen.getAllByText('1LoD').length + screen.getAllByText('actor-b').length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('TC-RG-3-01: 2LoD tier filter chip narrows the visible rows', async () => {
    const user = userEvent.setup();
    const high = makeUseCaseNode({ node_id: crypto.randomUUID(), label: 'High tier case' });
    const low = makeUseCaseNode({
      node_id: crypto.randomUUID(),
      label: 'Low tier case',
      metadata: makeUseCaseMetadata({ tier: 'Low' }),
    });
    await addNode(high);
    await addNode(low);

    render(<RegisterView role="2LoD" currentPolicyVersion="1.0" />);
    await screen.findByText('High tier case');
    expect(screen.getByText('Low tier case')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^High$/i }));

    expect(screen.getByText('High tier case')).toBeInTheDocument();
    expect(screen.queryByText('Low tier case')).not.toBeInTheDocument();
  });

  it('shows a stale badge when stale_assessment is true (verdict policy_version differs from currentPolicyVersion)', async () => {
    const node = makeUseCaseNode({ node_id: crypto.randomUUID(), label: 'Stale case' });
    await addNode(node);
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: node.node_id,
      event_type: 'verdict_produced',
      occurred_at: new Date().toISOString(),
      actor: '1LoD',
      payload: {
        type: 'verdict_produced',
        verdict: {
          status: 'approved',
          tier: 'High',
          track: 'II',
          binding_constraint: 'INV-01',
          binding_path: 'a → b',
          controls: [],
          downstream_reviews: [],
          conditions: { hypotheses: [] },
          policy_version: '1.0',
          pack_versions: {},
          applied_overrides: [],
          confidence_caveats: [],
          boundary_proximity: false,
          explanation: {
            tier_rationale: null,
            track_rationale: null,
            hard_lines_checked: 0,
            invariants_checked: 0,
            tripped_invariants: [],
            binding_reason: null,
            binding_regulatory_basis: null,
          },
          id: 'v1',
          use_case_id: node.node_id,
          living_status: 'approved',
          living_status_updated_at: new Date().toISOString(),
          attested_by: '1LoD',
          attested_at: new Date().toISOString(),
          graph_version: 1,
          corrections: [],
        },
      },
    });

    render(<RegisterView role="2LoD" currentPolicyVersion="2.0" />);

    await screen.findByText('Stale case');
    expect(screen.getByText('Stale', { selector: '.register-view__stale-badge' })).toBeInTheDocument();
  });

  it('shows "No use cases submitted yet" for an empty 1LoD register', async () => {
    render(<RegisterView role="never-used-actor-id" currentPolicyVersion="1.0" />);
    expect(await screen.findByText(/no use cases submitted yet/i)).toBeInTheDocument();
  });

  it('TC-RG-5-01: "Export JSON" button (2LoD only) triggers a download whose Blob contains exported_at, nodes, and edges', async () => {
    const user = userEvent.setup();
    const node = makeUseCaseNode({ node_id: crypto.randomUUID(), label: 'Export target case' });
    await addNode(node);

    // TDD-2 mock budget = 1: jsdom has no real file-download API, and its
    // Blob shim lacks `.text()` — the Blob constructor is intercepted to
    // capture the raw JSON string it was built from instead.
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
      // 1LoD view has no Export button at all (§10.3: 2LoD only).
      const oneLoD = render(<RegisterView role="1LoD" currentPolicyVersion="1.0" />);
      await oneLoD.findByText('Export target case');
      expect(oneLoD.queryByRole('button', { name: /export json/i })).not.toBeInTheDocument();
      oneLoD.unmount();

      render(<RegisterView role="2LoD" currentPolicyVersion="1.0" />);
      await screen.findByText('Export target case');

      await user.click(screen.getByRole('button', { name: /export json/i }));

      expect(capturedJson).toBeDefined();
      const parsed = JSON.parse(capturedJson!);
      expect(typeof parsed.exported_at).toBe('string');
      expect(new Date(parsed.exported_at).toString()).not.toBe('Invalid Date');
      expect(Array.isArray(parsed.nodes)).toBe(true);
      expect(Array.isArray(parsed.edges)).toBe(true);
      expect(parsed.nodes.some((n: { node_id: string }) => n.node_id === node.node_id)).toBe(true);
    } finally {
      globalThis.Blob = OriginalBlob;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });
});
