import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PolicyEditor from '../PolicyEditor';

// R16-A1 (§1.4, D-60). checkPolicyReferences is wired into BOTH Validate
// and Save — the same "validate first, gate the save" rule BC-P7C03-02
// already established for a structurally-invalid policy now also applies
// to a referentially-invalid one.
const MINIMAL_VALID_YAML_WITH_BAD_COVERS_REVIEWS = `
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
  - id: "CTRL-TPRM-01"
    name: "Encryption in transit"
    description: "TLS 1.3+"
    resolves: []
    burden: 1
    verification: "manual check"
    covers_reviews: ["DR-VENDR-01"]

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

const MINIMAL_VALID_YAML_WITH_UNNAMED_PLATFORM =
  MINIMAL_VALID_YAML_WITH_BAD_COVERS_REVIEWS.replace('covers_reviews: ["DR-VENDR-01"]', '') +
  `
platforms:
  - id: "PLAT-01"
    name: "Formal platform name"
    approved_envelope: {}
    satisfies_controls: []
`;

async function openYamlEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(/edit the rulebook as yaml/i));
}

describe('PolicyEditor — policy reference check wired into Validate and Save (R16-A1 §1.4)', () => {
  it("TC-R16-A1-64: Validate shows a covers_reviews reference error, naming the control and the missing id", async () => {
    const user = userEvent.setup();
    render(<PolicyEditor />);
    await openYamlEditor(user);

    const textarea = screen.getByLabelText(/policy yaml/i);
    await user.clear(textarea);
    await user.paste(MINIMAL_VALID_YAML_WITH_BAD_COVERS_REVIEWS);
    await user.click(screen.getByRole('button', { name: /validate/i }));

    expect(await screen.findByText(/is invalid/i)).toBeInTheDocument();
    expect(screen.getByText(/CTRL-TPRM-01 covers_reviews: no review with id 'DR-VENDR-01'/)).toBeInTheDocument();
  });

  it('TC-R16-A1-65: Save is refused on the same reference error — onSaved is never called', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<PolicyEditor onSaved={onSaved} />);
    await openYamlEditor(user);

    const textarea = screen.getByLabelText(/policy yaml/i);
    await user.clear(textarea);
    await user.paste(MINIMAL_VALID_YAML_WITH_BAD_COVERS_REVIEWS);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText(/is invalid/i)).toBeInTheDocument();
    expect(screen.getByText(/CTRL-TPRM-01 covers_reviews: no review with id 'DR-VENDR-01'/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('TC-R16-A1-66: a reference WARNING (e.g. a platform with no plain_name) still validates successfully and is listed, never blocking', async () => {
    const user = userEvent.setup();
    render(<PolicyEditor />);
    await openYamlEditor(user);

    const textarea = screen.getByLabelText(/policy yaml/i);
    await user.clear(textarea);
    await user.paste(MINIMAL_VALID_YAML_WITH_UNNAMED_PLATFORM);
    await user.click(screen.getByRole('button', { name: /validate/i }));

    expect(await screen.findByText(/^policy is valid\.$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/PLAT-01/).length).toBeGreaterThan(0);
  });
});
