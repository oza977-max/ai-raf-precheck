import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy, onPolicyUpdated } from './policy';
import { addNode } from './register';
import { getAll } from './audit';
import type { RegisterNode, LifecycleStage } from './types';

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
  it('returns valid: true with the parsed policy for a well-formed YAML file [TC-CF-5-03]', () => {
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
      const [firstError] = result.errors;
      expect(firstError?.kind).toBe('policy-invalid');
      expect(firstError?.field).toBe('yaml');
      expect(firstError && firstError.reason.length).toBeGreaterThan(0);
    }
  });

  it('rejects a policy with an empty controls array', () => {
    const yaml = VALID_YAML.replace(
      /controls:\n(.|\n)*?verification: \"manual check\"\n/,
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

  it('rejects a tier rule whose name is not one of Critical/High/Medium/Low (P3-C01 review finding)', () => {
    const yaml = VALID_YAML.replace('name: "Low"', 'name: "Very Low"');
    const result = loadPolicy(yaml);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => /Very Low/.test(e.reason))).toBe(true);
    }
  });
});

function makeUseCaseNode(lifecycleStage: LifecycleStage, label: string): RegisterNode {
  return {
    node_id: crypto.randomUUID(),
    node_type: 'use_case',
    label,
    created_at: new Date().toISOString(),
    metadata: {
      node_type: 'use_case',
      submitted_by: '1LoD',
      lifecycle_stage: lifecycleStage,
      current_verdict_id: null,
      tier: 'Low',
      track: 'I',
    },
  };
}

describe('onPolicyUpdated (TC-LC-4-01)', () => {
  it('queues re_evaluation_queued for approved/in_production/pre_checked use cases only, and never changes lifecycle_stage', async () => {
    const stages: LifecycleStage[] = [
      'idea',
      'exploring',
      'pre_checked',
      'approved',
      'in_production',
      'monitored',
      'retired',
    ];
    const nodes = stages.map((stage) => makeUseCaseNode(stage, `${stage}-case`));
    for (const node of nodes) {
      await addNode(node);
    }

    await onPolicyUpdated('2.0');

    for (const node of nodes) {
      const events = await getAll(node.node_id);
      const queued = events.filter((e) => e.event_type === 're_evaluation_queued');
      const shouldBeQueued = ['approved', 'in_production', 'pre_checked'].includes(
        node.metadata.node_type === 'use_case' ? node.metadata.lifecycle_stage : '',
      );

      if (shouldBeQueued) {
        expect(queued).toHaveLength(1);
        expect(queued[0]?.payload).toEqual({ type: 're_evaluation_queued', policy_version: '2.0' });
        expect(queued[0]?.actor).toBe('system');
      } else {
        expect(queued).toHaveLength(0);
      }

      // §8: lifecycle_stage never changes on policy save, regardless of
      // whether re-evaluation was queued.
      const stageChangeEvents = events.filter((e) => e.event_type === 'lifecycle_stage_changed');
      expect(stageChangeEvents).toHaveLength(0);
    }
  });
});

describe('ControlSchema — verification_evidence (V1.3)', () => {
  it('accepts a control with optional verification_evidence and rejects a bad status literal', () => {
    const withEvidence = VALID_YAML.replace(
      'verification: "manual check"',
      'verification: "manual check"\n    verification_evidence:\n      status: "verified"\n      detail: "attested"',
    );
    expect(loadPolicy(withEvidence).valid).toBe(true);

    const badStatus = VALID_YAML.replace(
      'verification: "manual check"',
      'verification: "manual check"\n    verification_evidence:\n      status: "checked"',
    );
    const result = loadPolicy(badStatus);
    expect(result.valid).toBe(false);
  });
});

// R12 schema additions (TC-R12-SCHEMA; ADR-PS-R12-1).
describe('R12 schema additions', () => {
  it('TC-R12-SCHEMA-01: accepts sampling_rate as a top-level number', () => {
    const yaml = VALID_YAML + '\nsampling_rate: 5\n';
    const result = loadPolicy(yaml);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.policy.sampling_rate).toBe(5);
  });

  it('TC-R12-SCHEMA-02: rejects sampling_rate of the wrong type', () => {
    const yaml = VALID_YAML + '\nsampling_rate: "five"\n';
    const result = loadPolicy(yaml);
    expect(result.valid).toBe(false);
  });

  it('TC-R12-SCHEMA-03: is valid without sampling_rate (optional, backward compatible)', () => {
    const result = loadPolicy(VALID_YAML);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.policy.sampling_rate).toBeUndefined();
  });

  it('TC-R12-SCHEMA-04: accepts reattest_by on an approved_models entry', () => {
    const yaml =
      VALID_YAML +
      `
approved_models:
  - model_id: "fam"
    vendor: "v"
    provenance_class: "vendor_hosted"
    is_approved: true
    is_family: true
    reattest_by: "2027-01-01"
`;
    const result = loadPolicy(yaml);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.policy.approved_models?.[0]?.reattest_by).toBe('2027-01-01');
  });

  it('TC-R12-SCHEMA-05: rejects reattest_by of the wrong type', () => {
    const yaml =
      VALID_YAML +
      `
approved_models:
  - model_id: "fam"
    vendor: "v"
    provenance_class: "vendor_hosted"
    is_approved: true
    reattest_by: 20270101
`;
    const result = loadPolicy(yaml);
    expect(result.valid).toBe(false);
  });
});

// Traceability close-out (2026-08-15): criteria that had no covering test.
describe('the shipped policy file is the CF-1/CF-3 evidence', () => {
  it('is commented plain text a risk reader can open in any editor [TC-CF-1-01]', () => {
    const raw = readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8');
    // Human-readable comments explaining sections — CF-1's fit criterion.
    expect((raw.match(/^\s*#/gm) ?? []).length).toBeGreaterThan(20);
    // No minified content: real line structure, no absurdly long lines.
    expect(raw.split('\n').every((l) => l.length < 400)).toBe(true);
  });

  it('a policy with a blank version cannot be used at all [TC-CF-3-01]', () => {
    const raw = readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8');
    const result = loadPolicy(raw.replace(/^version:.*$/m, 'version: ""'));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.some((e) => e.field === 'version')).toBe(true);
  });
});
