import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { setCurrentPolicyYaml } from '../../store/policy-source';

// R16-A1 (§1.4, CF-5). IntakeFlow's first evaluation gate (graph_review's
// "Proceed", handleProceedFromGraphReview) must refuse evaluation the same
// way App's start-up gate does, when checkPolicyReferences finds a
// reference error — through the existing reviewGateError message slot,
// not a thrown exception (unlike a structurally-invalid policy file).
//
// Reached via a seeded draft (same technique as IntakeFlow.resume.test.tsx)
// rather than driving the full guided form, since the gate under test does
// not depend on how the graph was built — only on what the policy says.
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: vi.fn() };
    },
  };
});

const DRAFT_KEY = 'aigate:intake-draft';

const MINIMAL_GRAPH = {
  id: 'test-graph-1',
  version: 1,
  intake_method: 'structured_form' as const,
  extracted_at: '2026-01-01T00:00:00.000Z',
  input_nodes: [{ id: 'i1', label: 'notes', data_class: 'Internal', data_zone: 'Zone C' }],
  processing_nodes: [
    { id: 'p1', label: 'summariser', model_type: 'llm', autonomy_level: 1, data_zone: 'Zone C', vendor: 'internal', replaces_prior_model: false },
  ],
  output_nodes: [
    { id: 'o1', label: 'summary', action_type: 'draft', exposure: 'internal-only', decision_bindingness: 'non-binding', output_reversibility: 'reversible', scale: 'limited' },
  ],
  edges: [{ from: 'i1', to: 'p1' }, { from: 'p1', to: 'o1' }],
  jurisdictions: [],
};

const GRAPH_REVIEW_DRAFT = {
  step: 'graph_review',
  description: 'A tool that summarises internal notes',
  graph: MINIMAL_GRAPH,
  graphVersion: 1,
  corrections: [],
  useCaseId: 'test-uc-1',
  jurisdictionsConfirmed: true,
  unconfirmedNodeIds: [],
};

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

describe('IntakeFlow — first evaluation gate refuses on a policy reference error (R16-A1 §1.4)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("TC-R16-A1-63: clicking Proceed with a covers_reviews reference error shows the message and does not proceed to the questionnaire/confirmation step", async () => {
    setCurrentPolicyYaml(MINIMAL_VALID_YAML_WITH_BAD_COVERS_REVIEWS);
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(GRAPH_REVIEW_DRAFT));
    render(<App />);

    const user = userEvent.setup();
    const proceed = await screen.findByRole('button', { name: /^proceed$/i });
    await user.click(proceed);

    // Two banners legitimately match "Policy file invalid" here: App's own
    // start-up gate (always on screen) AND IntakeFlow's reviewGateError
    // slot this test targets — the specific message below disambiguates.
    expect(await screen.findAllByText(/Policy file invalid/i)).not.toHaveLength(0);
    // IntakeFlow renders reviewGateError at more than one place in the
    // graph_review screen (e.g. inline + a summary slot) — any match
    // confirms the specific message reached the user.
    expect(
      screen.getAllByText(/CTRL-TPRM-01 covers_reviews: no review with id 'DR-VENDR-01'/).length,
    ).toBeGreaterThan(0);
    // Still on graph_review — the Proceed button is still there, the
    // questionnaire/confirmation screens never mounted.
    expect(screen.getByRole('button', { name: /^proceed$/i })).toBeInTheDocument();
  });
});
