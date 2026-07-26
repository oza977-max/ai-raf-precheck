import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('PolicyEditor — appetite framework view (V1.2-C)', () => {
  beforeEach(() => {
    // Earlier tests in this file SAVE a minimal policy into localStorage;
    // these tests need the bundled starter YAML (with [FIRM] markers and
    // the full pack list) as the active policy.
    localStorage.clear();
  });

  it('D4: shows the NF-10 ACTION REQUIRED banner while [FIRM] markers are present, and hides it once replaced', async () => {
    const user = userEvent.setup();
    render(<PolicyEditor />);
    // The bundled starter policy carries [FIRM] markers.
    expect(screen.getByText(/action required/i)).toBeInTheDocument();
    expect(screen.getByText(/verdicts are provisional until your CRO adopts/i)).toBeInTheDocument();

    const textarea = screen.getByLabelText(/policy yaml/i);
    await user.clear(textarea);
    await user.paste(MINIMAL_VALID_POLICY_YAML); // no [FIRM] markers
    expect(screen.queryByText(/action required/i)).not.toBeInTheDocument();
  });

  it('review finding, pass 1: [FIRM] mentions in comment lines alone do NOT trigger the NF-10 banner (an adopted framework keeping the template header is not provisional)', async () => {
    const user = userEvent.setup();
    render(<PolicyEditor />);
    const textarea = screen.getByLabelText(/policy yaml/i);
    await user.clear(textarea);
    // Valid policy, real markers filled in, but the instructional comment
    // still mentions [FIRM] — exactly the post-adoption state.
    await user.paste(`# Search for [FIRM] markers below — each one requires review.\n${MINIMAL_VALID_POLICY_YAML}`);
    expect(screen.queryByText(/action required/i)).not.toBeInTheDocument();
  });

  it('D2 (V2-A): lists the jurisdiction packs with the REAL loader state — loaded rule counts, honestly marked pending adoption, never "fired"', () => {
    render(<PolicyEditor />);
    expect(screen.getByText('Jurisdiction packs', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByText('UK')).toBeInTheDocument();
    expect(screen.getByText('EU')).toBeInTheDocument();
    // V2-A: packs genuinely load now; every chip carries the pending-
    // adoption qualifier because all sign-offs are [FIRM] placeholders.
    // V2-F: version suffixes are now -draft (real text retrieved, awaiting
    // human review) or -unauthored (no primary source retrieved yet), so the
    // match is on the version shape rather than the old "-proposed" literal.
    const chips = screen.getAllByText(/loaded — .+\(\d+ rules?, v[\d.]+-\w+\).*· pending adoption/);
    expect(chips.length).toBeGreaterThanOrEqual(6);
    // Review fix, pass 1: EU declares TWO packs — both must be visible.
    expect(screen.getByText(/EU-AIACT \(4 rules, v0\.2-draft\) \+ DORA \(1 rule, v0\.2-draft\)|DORA \(1 rule, v0\.2-draft\) \+ EU-AIACT \(4 rules, v0\.2-draft\)/)).toBeInTheDocument();
    // "fired" remains a per-verdict concept (the RA-9 chain), never a
    // static pack state.
    expect(screen.queryByText(/fired/i)).not.toBeInTheDocument();
  });

  it('D3: lists the hard lines with the checked-first framing', () => {
    render(<PolicyEditor />);
    expect(screen.getByText(/hard lines — no control set can fix/i)).toBeInTheDocument();
    expect(screen.getByText(/rejected immediately \(PE-4\)/i)).toBeInTheDocument();
    expect(screen.getByText('HL-001')).toBeInTheDocument();
    expect(screen.getByText('HL-005')).toBeInTheDocument();
  });

  it('invalid YAML shows the panels-unavailable note instead of stale panels', async () => {
    const user = userEvent.setup();
    render(<PolicyEditor />);
    const textarea = screen.getByLabelText(/policy yaml/i);
    await user.clear(textarea);
    await user.paste('definitely: not: valid: yaml');
    expect(screen.getByText(/panels unavailable — YAML invalid/i)).toBeInTheDocument();
    expect(screen.queryByText(/jurisdiction packs/i)).not.toBeInTheDocument();
  });
});
