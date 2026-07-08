import { describe, it, expect } from 'vitest';
import { loadPolicy } from './policy';

const VALID_YAML = `
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

function withYamlPatch(base: string, patch: (yaml: string) => string): string {
  return patch(base);
}

describe('loadPolicy', () => {
  it('returns valid: true with the parsed policy for a well-formed YAML file', () => {
    const result = loadPolicy(VALID_YAML);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.policy.policy_id).toBe('RAF-001');
      expect(result.policy.controls).toHaveLength(1);
      expect(result.warnings).toEqual([]);
    }
  });

  it('warns but does not block when firm_name is still the [FIRM] placeholder', () => {
    const yaml = VALID_YAML.replace('firm_name: "Test Bank"', 'firm_name: "[FIRM]"');
    const result = loadPolicy(yaml);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.warnings.some((w) => /\[FIRM\]/.test(w))).toBe(true);
    }
  });

  it('rejects malformed YAML with a named parse error', () => {
    const result = loadPolicy('version: "1.0"\n  bad_indent: [1, 2');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0].kind).toBe('policy-invalid');
      expect(result.errors[0].field).toBe('yaml');
      expect(result.errors[0].reason.length).toBeGreaterThan(0);
    }
  });

  it('rejects a policy with an empty controls array', () => {
    const yaml = VALID_YAML.replace(
      /controls:\n(.|\n)*?platform_satisfies: \[\]\n/,
      'controls: []\n',
    );
    const result = loadPolicy(yaml);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.errors.some(
          (e) => e.field === 'controls' && /empty/.test(e.reason),
        ),
      ).toBe(true);
    }
  });

  it('rejects a policy whose tier_workflow is missing one of the four required tiers (realistic-fixture variant)', () => {
    const yaml = withYamlPatch(VALID_YAML, (y) =>
      y.replace(
        `tier_workflow:
  Critical: "2LoD-approve"
  High: "2LoD-approve"
  Medium: "2LoD-notify"
  Low: "self-service"`,
        `tier_workflow:
  Critical: "2LoD-approve"
  High: "2LoD-approve"
  Medium: "2LoD-notify"`,
      ),
    );
    const result = loadPolicy(yaml);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.errors.some(
          (e) => e.field === 'tier_workflow' && /Low/.test(e.reason),
        ),
      ).toBe(true);
    }
  });

  it('rejects a condition using an operator outside the allowed set', () => {
    const yaml = VALID_YAML.replace(
      'value: { in: ["statistical"] }',
      'value: { unsupported_op: ["statistical"] }',
    );
    const result = loadPolicy(yaml);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.kind === 'policy-invalid')).toBe(true);
    }
  });

  it('rejects a condition value outside the canonical vocabulary', () => {
    const yaml = VALID_YAML.replace(
      'value: { in: ["statistical"] }',
      'value: { in: ["not-a-real-model-type"] }',
    );
    const result = loadPolicy(yaml);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.errors.some((e) => /not-a-real-model-type/.test(e.reason)),
      ).toBe(true);
    }
  });
});
