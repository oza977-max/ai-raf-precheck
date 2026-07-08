import { describe, it, expect } from 'vitest';
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
  it('loads a valid policy and shows a success message', async () => {
    const user = userEvent.setup();
    render(<PolicyEditor />);

    const textarea = screen.getByLabelText(/policy yaml/i);
    await user.click(textarea);
    await user.paste(MINIMAL_VALID_POLICY_YAML);

    await user.click(screen.getByRole('button', { name: /load/i }));

    expect(await screen.findByText(/loaded successfully|valid/i)).toBeInTheDocument();
  });
});
