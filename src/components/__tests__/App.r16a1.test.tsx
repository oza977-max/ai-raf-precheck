import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import App from '../../App';
import { setCurrentPolicyYaml } from '../../store/policy-source';

// R16-A1 (§1.4, CF-5). The app start-up gate: checkPolicyReferences errors
// show the "Policy file invalid" banner and name the specific bad
// reference, the same way a structurally-invalid policy already does.
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

describe('App — R16-A1 start-up gate (CF-5)', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("TC-R16-A1-62: a covers_reviews reference error shows the Policy file invalid banner, naming the bad id, and evaluation is disabled", () => {
    setCurrentPolicyYaml(MINIMAL_VALID_YAML_WITH_BAD_COVERS_REVIEWS);
    render(<App />);
    expect(screen.getByText(/Policy file invalid/i)).toBeInTheDocument();
    expect(screen.getByText(/evaluation is disabled/i)).toBeInTheDocument();
    expect(screen.getByText(/CTRL-TPRM-01 covers_reviews: no review with id 'DR-VENDR-01'/)).toBeInTheDocument();
  });

  it('shows no such banner when the policy has no reference errors (the normal, shipped-policy case)', () => {
    localStorage.clear();
    render(<App />);
    expect(screen.queryByText(/Policy file invalid/i)).not.toBeInTheDocument();
  });
});
