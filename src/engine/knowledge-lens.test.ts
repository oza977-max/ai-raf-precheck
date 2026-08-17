import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../store/policy';
import { loadKnowledgeLens } from '../store/knowledge-lens-loader';
import { evaluate } from './evaluate';
import { parseKnowledgeLens, matchKnowledgeLens } from './knowledge-lens';
import type { KnowledgeLensEntry } from './knowledge-lens';
import type { DataFlowGraph, PolicyFile } from './types';

function graph(overrides: Partial<DataFlowGraph> = {}): DataFlowGraph {
  return {
    id: 'g1',
    version: 1,
    input_nodes: [],
    processing_nodes: [],
    output_nodes: [],
    edges: [],
    jurisdictions: [],
    intake_method: 'structured_form',
    extracted_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function entry(overrides: Partial<KnowledgeLensEntry> = {}): KnowledgeLensEntry {
  return {
    id: 'KL-TEST-01',
    condition: { data_class: { in: ['Client PII'] } },
    risk_domain: 'Privacy & Security',
    risk_subdomain: 'Test subdomain',
    description: 'Test description',
    source_attribution: 'MIT AI Risk Repository (Slattery et al., MIT FutureTech), CC BY 4.0',
    covering_rule_ids: [],
    ...overrides,
  };
}

describe('parseKnowledgeLens (TC-R11-KL-1)', () => {
  it('accepts a well-formed entry array', () => {
    const result = parseKnowledgeLens([entry()]);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.entries).toHaveLength(1);
  });

  it('rejects a non-array input', () => {
    const result = parseKnowledgeLens({ not: 'an array' });
    expect(result.valid).toBe(false);
  });

  it('rejects an entry with an unrecognised key — the structural guarantee that no verdict-shaped field (tier/control/hard_line effect) can be smuggled in (TC-R11-KL-2)', () => {
    const bad = { ...entry(), effect: 'reject' };
    const result = parseKnowledgeLens([bad]);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join(' ')).toMatch(/effect|unrecognized|unrecognised/i);
  });

  it('rejects an entry missing a required field', () => {
    const bad = { ...entry() } as Record<string, unknown>;
    delete bad.risk_domain;
    const result = parseKnowledgeLens([bad]);
    expect(result.valid).toBe(false);
  });

  it('sorts entries by id (NF-1 discipline)', () => {
    const result = parseKnowledgeLens([entry({ id: 'KL-Z' }), entry({ id: 'KL-A' })]);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.entries.map((e) => e.id)).toEqual(['KL-A', 'KL-Z']);
  });

  it('loads and validates the real grounding/risk-knowledge.yaml file with zero errors', () => {
    const yaml = readFileSync(resolve(__dirname, '../../grounding/risk-knowledge.yaml'), 'utf-8');
    const result = loadKnowledgeLens(yaml);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.entries.length).toBeGreaterThanOrEqual(8);
      for (const e of result.entries) {
        expect(e.source_attribution).toMatch(/CC BY 4\.0/);
      }
    }
  });
});

describe('matchKnowledgeLens (TC-R11-KL-3)', () => {
  it('matches an entry whose condition the graph satisfies', () => {
    const g = graph({ input_nodes: [{ id: 'i1', label: 'z', data_class: 'Client PII', data_zone: 'Zone B' }] });
    const matches = matchKnowledgeLens(g, [entry()], []);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.entry.id).toBe('KL-TEST-01');
  });

  it('excludes an entry whose condition the graph does not satisfy', () => {
    const g = graph({ input_nodes: [{ id: 'i1', label: 'z', data_class: 'Public', data_zone: 'Zone A' }] });
    const matches = matchKnowledgeLens(g, [entry()], []);
    expect(matches).toHaveLength(0);
  });

  it('computes covered = true when a firing rule id intersects covering_rule_ids', () => {
    const g = graph({ input_nodes: [{ id: 'i1', label: 'z', data_class: 'Client PII', data_zone: 'Zone B' }] });
    const matches = matchKnowledgeLens(g, [entry({ covering_rule_ids: ['INV-DATA-01'] })], ['INV-DATA-01', 'HL-001']);
    expect(matches[0]!.covered).toBe(true);
  });

  it('computes covered = false when no firing rule id intersects covering_rule_ids (honest gap)', () => {
    const g = graph({ input_nodes: [{ id: 'i1', label: 'z', data_class: 'Client PII', data_zone: 'Zone B' }] });
    const matches = matchKnowledgeLens(g, [entry({ covering_rule_ids: [] })], ['INV-DATA-01']);
    expect(matches[0]!.covered).toBe(false);
  });

  it('returns matches sorted by entry id (NF-1 discipline)', () => {
    const g = graph({ input_nodes: [{ id: 'i1', label: 'z', data_class: 'Client PII', data_zone: 'Zone B' }] });
    const entries = [
      entry({ id: 'KL-Z', condition: {} }),
      entry({ id: 'KL-A', condition: {} }),
      entry({ id: 'KL-M', condition: {} }),
    ];
    const matches = matchKnowledgeLens(g, entries, []);
    expect(matches.map((m) => m.entry.id)).toEqual(['KL-A', 'KL-M', 'KL-Z']);
  });

  it('returns no matches for an empty entries array', () => {
    expect(matchKnowledgeLens(graph(), [], [])).toEqual([]);
  });
});

describe('R11-NF-1 — evaluate() is byte-identical with and without the knowledge lens loaded (TC-R11-KL-NF-1)', () => {
  let policy: PolicyFile;
  let lensEntries: KnowledgeLensEntry[];

  beforeAll(() => {
    const policyYaml = readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8');
    const policyResult = loadPolicy(policyYaml);
    if (!policyResult.valid) throw new Error(`fixture policy invalid: ${JSON.stringify(policyResult.errors)}`);
    policy = policyResult.policy;

    const lensYaml = readFileSync(resolve(__dirname, '../../grounding/risk-knowledge.yaml'), 'utf-8');
    const lensResult = loadKnowledgeLens(lensYaml);
    if (!lensResult.valid) throw new Error(`fixture risk-knowledge invalid: ${JSON.stringify(lensResult.errors)}`);
    lensEntries = lensResult.entries;
  });

  it('produces the same serialized Verdict whether or not a knowledge lens is loaded in the caller [TC-R11-KL-NF-1]', () => {
    const g = graph({
      input_nodes: [{ id: 'i1', label: 'pii-in', data_class: 'Client PII', data_zone: 'Zone B' }],
      processing_nodes: [
        {
          id: 'p1',
          label: 'x',
          model_type: 'llm',
          autonomy_level: 2,
          data_zone: 'Zone B',
          vendor: 'internal',
          replaces_prior_model: false,
        },
      ],
      output_nodes: [
        {
          id: 'o1',
          label: 'y',
          action_type: 'recommend',
          exposure: 'client-facing',
          decision_bindingness: 'material',
          output_reversibility: 'reversible',
          scale: 'limited',
        },
      ],
    });

    // Run 1: evaluate() called with nothing knowledge-lens-related anywhere
    // near it.
    const withoutLens = evaluate(g, policy);

    // Run 2: a knowledge lens IS loaded and matched right next to the
    // evaluate() call — actively attempting to feed lens data toward the
    // engine call, to prove the boundary holds under an adversarial-ish
    // test rather than merely asserting a no-op. evaluate()'s signature
    // takes no knowledge-lens parameter, so there is no argument position
    // to smuggle `lensMatches` into; the only way to "feed" it near
    // evaluate() is to compute it and then deliberately NOT pass it, which
    // is exactly the architectural guarantee ADR-EE-R11-1 describes.
    const lensMatches = matchKnowledgeLens(g, lensEntries, ['INV-DATA-01', 'HL-001', 'INV-HALLUC-01']);
    expect(lensMatches.length).toBeGreaterThan(0); // sanity: the lens is not silently empty
    const withLens = evaluate(g, policy);

    expect(JSON.stringify(withLens)).toBe(JSON.stringify(withoutLens));
    // Also confirm no lens-shaped key rode along on the result.
    const serialized = JSON.stringify(withLens);
    expect(serialized).not.toMatch(/risk_domain|risk_subdomain|knowledge_lens|KnowledgeMatch/i);
  });
});
