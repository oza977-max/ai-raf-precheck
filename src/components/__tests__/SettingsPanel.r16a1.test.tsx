import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPanel from '../SettingsPanel';
import { setCurrentPolicyYaml } from '../../store/policy-source';

// R16-A1 (§1.4). SettingsPanel's policy load: a reference error refuses
// both demo-seeding actions with an honest, specific message — not the
// seed function's own "nothing added" (which would be true but misleading
// about WHY nothing was added).
const MINIMAL_VALID_YAML_WITH_BAD_COVERS_REVIEWS = `
version: "1.0"
policy_id: "RAF-001"
firm_name: "Test Bank"
translation_attestation:
  attested_by: "x"
  role: "x"
  date: "2026-01-01"
  raf_version_checked: "x"
hard_lines: []
tracks:
  - id: "TRACK-I"
    name: "Track I"
    description: "d"
    conditions: []
    short_circuit: true
    regulatory_basis: "x"
tiers:
  - id: "TIER-LOW"
    name: "Low"
    triggers: []
invariants: []
controls:
  - id: "CTRL-TPRM-01"
    name: "n"
    description: "d"
    resolves: []
    burden: 1
    verification: "v"
    covers_reviews: ["DR-VENDR-01"]
kri_thresholds: {}
jurisdictions: []
roles: {}
tier_workflow:
  Critical: "x"
  High: "x"
  Medium: "x"
  Low: "x"
safety_margin: 0.1
`;

async function openDemoDataDisclosure(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(/demo data/i));
}

describe('SettingsPanel — policy reference check (R16-A1 §1.4)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('TC-R16-A1-67: refuses "Load sample use cases" with a specific reference-error message, not seed()\'s own "nothing added"', async () => {
    setCurrentPolicyYaml(MINIMAL_VALID_YAML_WITH_BAD_COVERS_REVIEWS);
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await openDemoDataDisclosure(user);

    await user.click(screen.getByRole('button', { name: /load sample use cases/i }));

    expect(
      await screen.findByText(/unresolved reference error.*CTRL-TPRM-01 covers_reviews: no review with id 'DR-VENDR-01'/i),
    ).toBeInTheDocument();
  });

  it("TC-R16-A1-68: refuses \"Reload investment-bank portfolio\" with the same specific message", async () => {
    setCurrentPolicyYaml(MINIMAL_VALID_YAML_WITH_BAD_COVERS_REVIEWS);
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await openDemoDataDisclosure(user);

    await user.click(screen.getByRole('button', { name: /reload investment-bank portfolio/i }));

    expect(
      await screen.findByText(/unresolved reference error.*CTRL-TPRM-01 covers_reviews: no review with id 'DR-VENDR-01'/i),
    ).toBeInTheDocument();
  });
});
