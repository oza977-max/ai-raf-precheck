import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AboutPanel from '../AboutPanel';
import { loadPolicy, } from '../../store/policy';
import { setCurrentPolicyYaml } from '../../store/policy-source';

// CR7-36: the About page says how many rules the app ships with. It is a
// statement about the SHIPPED policy file — computed from it, and not from
// whatever the firm has since edited.
const shippedYaml = readFileSync(resolve(__dirname, '../../../policy/appetite.yaml'), 'utf-8');

describe('AboutPanel — CR7-36: the shipped rule counts are computed, not typed', () => {
  beforeEach(() => localStorage.clear());

  it('TC-CR7-36: the sentence carries the shipped file\'s hard-line count and appetite-rule count', () => {
    const loaded = loadPolicy(shippedYaml);
    if (!loaded.valid) throw new Error('shipped policy invalid');
    const { container } = render(<AboutPanel onNavigate={() => {}} />);
    const text = container.textContent ?? '';
    expect(text).toContain(`${loaded.policy.hard_lines.length} hard lines, ${loaded.policy.invariants.length} appetite rules`);
  });

  it('TC-CR7-36-1: a firm edit to its own policy (fewer rules) does not change what the page says it ships with', () => {
    const loaded = loadPolicy(shippedYaml);
    if (!loaded.valid) throw new Error('shipped policy invalid');
    const edited = { ...loaded.policy, invariants: loaded.policy.invariants.slice(0, 3), hard_lines: loaded.policy.hard_lines.slice(0, 1) };
    // Stored as JSON — YAML 1.2 is a superset of JSON, so the policy-source reader accepts it as text.
    setCurrentPolicyYaml(JSON.stringify(edited));
    const { container } = render(<AboutPanel onNavigate={() => {}} />);
    const text = container.textContent ?? '';
    expect(text).toContain(`${loaded.policy.hard_lines.length} hard lines, ${loaded.policy.invariants.length} appetite rules`);
    expect(text).not.toContain('1 hard lines');
    expect(text).not.toContain('3 appetite rules');
  });
});
