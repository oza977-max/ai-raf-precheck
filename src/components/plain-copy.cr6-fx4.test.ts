import { describe, it, expect } from 'vitest';
import { summaryBehaviourLine, supplierDisplayName, countryName } from './plain-copy';
import type { ActionType } from '../engine/types';

const ACTIONS: ActionType[] = ['read', 'inform', 'draft', 'recommend', 'execute', 'trade', 'approve'];

describe('plain-copy — CR6-16: the behaviour summary says what an autonomous AI does', () => {
  it('TC-CR6-16: every action type at every autonomy level reads as a full line; at level 2+ it names the action', () => {
    for (const level of [0, 1, 2, 3, 4] as const) {
      for (const action of ACTIONS) {
        for (const hitl of [true, false, undefined]) {
          const line = summaryBehaviourLine(level, action, hitl);
          expect(line.length, `${level}/${action}/${String(hitl)}`).toBeGreaterThan(10);
          expect(line).not.toMatch(/^\s|\s$|undefined/);
          if (level >= 2) {
            // base + " — " + what it does
            expect(line, `${level}/${action}`).toContain(' — ');
          }
        }
      }
    }
    expect(summaryBehaviourLine(3, 'read', undefined)).toMatch(/finds or summarises/i);
    expect(summaryBehaviourLine(2, 'inform', false)).toMatch(/answers people/i);
    expect(summaryBehaviourLine(4, 'draft', false)).toMatch(/draft/i);
    expect(summaryBehaviourLine(2, 'recommend', undefined)).toMatch(/suggests, ranks or flags/i);
  });
});

describe('plain-copy — G-7: an unmatched supplier id never reaches the screen raw', () => {
  const policy = { vendors: [{ id: 'VENDOR-A', plain_name: 'Acme Supplier' }] };

  it('TC-CR6-G7: id-shaped values with no registry match read as a supplier not on the list; ordinary words stay as written', () => {
    expect(supplierDisplayName('VENDOR-GONE-01', policy)).toEqual({
      name: 'a supplier not on your firm’s list',
      registered: false,
    });
    expect(supplierDisplayName('VENDOR-LLM-v1', policy).name).toBe('a supplier not on your firm’s list');
    // CR6-G7b: only the policy's own id shape (VENDOR-, from VENDOR-A) is an id.
    expect(supplierDisplayName('SUP_42', policy).name).toBe('SUP_42');
    expect(supplierDisplayName('Anthropic', policy).name).toBe('Anthropic');
    expect(supplierDisplayName('Northwind Data Ltd', policy).name).toBe('Northwind Data Ltd');
    // A registered one still resolves, and "internal" is unchanged.
    expect(supplierDisplayName('VENDOR-A', policy).name).toBe('Acme Supplier');
    expect(supplierDisplayName('internal', policy).name).toBe('None — your firm built it');
  });
});

describe('plain-copy — G7b: real supplier names that look id-shaped are shown as written', () => {
  const policy = { vendors: [{ id: 'VENDOR-A', plain_name: 'Acme Supplier' }], platforms: [{ id: 'PLAT-X', plain_name: 'P' }] };
  it('TC-CR6-G7b: Q-Corp, V-Systems, ACME-Vision, ZED-AI, Q-ID, NOVA-Clara, AB12-Labs, K9-AI stay as written; a stale id with the policy prefix is still masked; no policy means as written', () => {
    for (const n of ['Q-Corp', 'V-Systems', 'ACME-Vision', 'ZED-AI', 'Q-ID', 'NOVA-Clara', 'AB12-Labs', 'K9-AI']) {
      expect(supplierDisplayName(n, policy).name).toBe(n);
      expect(supplierDisplayName(n, undefined).name).toBe(n);
    }
    expect(supplierDisplayName('VENDOR-GONE-01', policy).name).toBe('a supplier not on your firm’s list');
    expect(supplierDisplayName('PLAT-GONE-01', policy).name).toBe('a supplier not on your firm’s list');
    expect(supplierDisplayName('VENDOR-GONE-01', undefined).name).toBe('VENDOR-GONE-01');
  });
});

describe('plain-copy — CR6-23: a country code is never shown bare', () => {
  it('TC-CR6-23c: countryName gives the policy name, or a neutral phrase for an unlisted code', () => {
    const policy = { jurisdictions: [{ code: 'UK', name: 'United Kingdom' }] };
    expect(countryName('UK', policy)).toBe('United Kingdom');
    const unlisted = countryName('XX', policy);
    expect(unlisted).not.toMatch(/\bXX\b/);
    expect(unlisted.length).toBeGreaterThan(3);
    expect(countryName('XX', undefined)).not.toMatch(/\bXX\b/);
  });
});
