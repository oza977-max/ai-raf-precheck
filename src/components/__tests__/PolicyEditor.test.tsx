import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PolicyEditor from '../PolicyEditor';

// Minimal valid policy YAML per policy-schema.md §3.1/§6 — every required
// section present and non-empty so loadPolicy() returns { valid: true }.
const MINIMAL_VALID_POLICY_YAML = `
version: "1.0"
policy_id: "RAF-001"
firm_name: "Test Bank"

translation_attestation:
  attested_by: "Test Bank — 2LoD Lead"
  role: "Head of AI Governance"
  date: "2026-05-01"
  raf_version_checked: "Board-approved AI RAF v1.0"

hard_lines: []

tracks:
  - id: "TRACK-I"
    name: "Track I"
    description: "Traditional MRM"
    conditions:
      - field: "model_type"
        value: { in: ["statistical"] }
    short_circuit: true
    regulatory_basis: "SS1/23 §3.4"

tiers:
  - id: "TIER-LOW"
    name: "Low"
    triggers:
      - field: "exposure"
        value: "internal-only"

invariants: []

controls:
  - id: "CTRL-ENC-01"
    name: "Encryption in transit"
    description: "TLS 1.3+"
    resolves: []
    burden: 1
    verification: "manual check"
    platform_satisfies: []

kri_thresholds: {}

jurisdictions: []

roles:
  "1LoD": { access: "own" }
  "2LoD": { access: "all" }

tier_workflow:
  Critical: "2LoD-approve"
  High: "2LoD-approve"
  Medium: "2LoD-notify"
  Low: "self-service"

safety_margin: 0.10
`;

describe('PolicyEditor', () => {
  it('pre-fills the textarea with the currently active policy YAML (P7-C03)', () => {
    render(<PolicyEditor />);
    const textarea = screen.getByLabelText(/policy yaml/i) as HTMLTextAreaElement;
    expect(textarea.value.length).toBeGreaterThan(0);
    expect(textarea.value).toContain('policy_id');
  });

  it('validates a valid policy and shows a success message, without saving', async () => {
    const user = userEvent.setup();
    render(<PolicyEditor />);

    const textarea = screen.getByLabelText(/policy yaml/i);
    await user.clear(textarea);
    await user.paste(MINIMAL_VALID_POLICY_YAML);

    await user.click(screen.getByRole('button', { name: /validate/i }));

    expect(await screen.findByText(/is valid/i)).toBeInTheDocument();
  });

  it('BC-P7C03-02: invalid YAML shows field errors and does not save or call onSaved', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<PolicyEditor onSaved={onSaved} />);

    const textarea = screen.getByLabelText(/policy yaml/i);
    await user.clear(textarea);
    await user.paste('not: valid: policy: yaml: at all');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText(/policy is invalid/i)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('BC-P7C03-01: saving a valid policy reports a queued count and calls onSaved', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<PolicyEditor onSaved={onSaved} />);

    const textarea = screen.getByLabelText(/policy yaml/i);
    await user.clear(textarea);
    await user.paste(MINIMAL_VALID_POLICY_YAML);

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText(/policy saved.*queued for re-evaluation/i)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
