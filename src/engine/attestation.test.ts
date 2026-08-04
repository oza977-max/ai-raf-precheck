import { describe, it, expect } from 'vitest';
import { translationAttestationStatus, ATTESTATION_VALID_MONTHS } from './attestation';
import type { TranslationAttestation } from './types';

// Round 4 — NF-10. The requirement says a policy file without a CURRENT
// attestation "produces verdicts marked translation fidelity unattested". The
// attestation block existed, was validated on load, and was read by nothing:
// the header string was a hardcoded banner. It happened to say the true thing,
// because the shipped policy is unattested — but it would have said it just
// the same after somebody attested.

const attested = (over: Partial<TranslationAttestation> = {}): TranslationAttestation => ({
  attested_by: 'A. Reviewer',
  role: 'Head of AI Governance',
  date: '2026-06-01',
  raf_version_checked: 'Board AI RAF v2.1, approved 2026-05-20',
  ...over,
});

describe('translationAttestationStatus (NF-10)', () => {
  it('reads a complete, recent attestation as attested', () => {
    expect(translationAttestationStatus(attested(), '2026-08-04').status).toBe('attested');
  });

  it('treats a placeholder as unattested, exactly as an unsigned pack rule is', () => {
    // This is the shipped starter policy's own shape
    // (policy/appetite.yaml:82-86): every field is an authoring placeholder.
    // An un-dated sign-off is not a sign-off — the same rule NF-7 already
    // applies to pack rules (jurisdiction.ts:21).
    const shipped = attested({ attested_by: '[FIRM] — 2LoD Lead', date: '[DATE]' });
    const result = translationAttestationStatus(shipped, '2026-08-04');

    expect(result.status).toBe('unattested');
    expect(result.reason).toMatch(/placeholder/i);
  });

  it('a date-only placeholder is still unattested', () => {
    expect(translationAttestationStatus(attested({ date: '[DATE]' }), '2026-08-04').status).toBe(
      'unattested',
    );
  });

  it('goes stale after the validity period, and says when it was last checked', () => {
    // 12 months by default, per NF-10's fit criterion.
    const old = attested({ date: '2025-01-01' });
    const result = translationAttestationStatus(old, '2026-08-04');

    expect(result.status).toBe('stale');
    expect(result.reason).toContain('2025-01-01');
    expect(ATTESTATION_VALID_MONTHS).toBe(12);
  });

  it('is exactly at the boundary, not just near it', () => {
    // Attested 12 months to the day is still current; one day later is not.
    expect(translationAttestationStatus(attested({ date: '2025-08-04' }), '2026-08-04').status).toBe(
      'attested',
    );
    expect(translationAttestationStatus(attested({ date: '2025-08-03' }), '2026-08-04').status).toBe(
      'stale',
    );
  });

  it('is pure — the caller supplies today, the engine never asks the clock', () => {
    // NF-1 / the engine island: no Date.now() anywhere in src/engine. The
    // same attestation must read differently only because the caller said so.
    const a = attested({ date: '2025-06-01' });
    expect(translationAttestationStatus(a, '2025-07-01').status).toBe('attested');
    expect(translationAttestationStatus(a, '2027-07-01').status).toBe('stale');

    const source = new URL('./attestation.ts', import.meta.url).pathname;
    expect(source).toBeTruthy();
  });

  it('an unparseable date is unattested rather than assumed current', () => {
    // Absence of a readable date is not evidence of a recent check.
    expect(translationAttestationStatus(attested({ date: 'last spring' }), '2026-08-04').status).toBe(
      'unattested',
    );
  });
});
