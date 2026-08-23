import { describe, it, expect } from 'vitest';
import { loadPacks } from './packs';
import { getPackSources } from './pack-source';

describe('loadPacks (V2-A)', () => {
  it('loads the four AUTHORED packs from the real files, sorted by pack_id [TC-PE-8-02] [TC-RA-7-02]', () => {
    const { packs, errors } = loadPacks(getPackSources());
    expect(errors).toEqual([]);
    // Four, not seven. v1.3 deleted OSFI-E23, MAS-FEAT and FSA-JP: their rule
    // text was "[ILLUSTRATIVE — NOT VERBATIM]" with "[NOT RETRIEVED]" source
    // dates, and they still added required controls and reviews to verdicts.
    // A rule citing a source nobody retrieved is worse than no rule, because
    // it looks like coverage. CA/SG/JP remain declared jurisdictions with an
    // empty pack list — see the note in policy/appetite.yaml for what has to
    // be retrieved to author them properly.
    expect(packs.map((p) => p.pack_id)).toEqual([
      'DORA',
      'EU-AIACT',
      'SR-26-2',
      'SS1-23',
    ]);
    expect(packs.every((p) => p.rules.length >= 1)).toBe(true);
  });

  it('rejects a WHOLE pack when a rule is missing a required field, naming pack and field (CF-5/RA-7) [TC-CF-5-02] [TC-RA-7-01]', () => {
    const bad = `
pack_id: "BAD-PACK"
version: "1.0"
jurisdiction: "UK"
regulator: "PRA"
document: "Doc"
effective_date: "2026-01-01"
reviewer_name: "X"
reviewer_role: "Y"
sign_off_date: "2026-01-01"
rules:
  - id: "BAD-1"
    title: "Missing source text"
    source:
      document: "Doc"
      section: "S1"
    effect:
      type: "required_review"
      review: "R"
    condition: {}
    basis: "verbatim"
    reviewer_name: "X"
    reviewer_role: "Y"
    sign_off_date: "2026-01-01"
`;
    const { packs, errors } = loadPacks({ 'bad.yaml': bad });
    expect(packs).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.packId).toBe('BAD-PACK');
    expect(errors[0]?.reason).toMatch(/rules\.0\.source\.text/);
  });

  it('review fix, pass 1: a rule whose condition uses a bad operator or non-canonical value rejects the WHOLE pack', () => {
    const badCondition = `
pack_id: "BAD-COND"
version: "1.0"
jurisdiction: "UK"
regulator: "PRA"
document: "Doc"
effective_date: "2026-01-01"
reviewer_name: "X"
reviewer_role: "Y"
sign_off_date: "2026-01-01"
rules:
  - id: "BC-1"
    title: "Typo'd operator"
    source: { document: "Doc", section: "S1", text: "T" }
    effect: { type: "required_review", review: "R" }
    condition:
      decision_bindingness: { includes: ["material"] }
    basis: "verbatim"
    reviewer_name: "X"
    reviewer_role: "Y"
    sign_off_date: "2026-01-01"
`;
    const { packs, errors } = loadPacks({ 'bad-cond.yaml': badCondition });
    expect(packs).toEqual([]);
    expect(errors[0]?.reason).toMatch(/BC-1.*includes/);
  });
});

// Traceability close-out (2026-08-15).
describe('pack independence and the basis requirement', () => {
  const RULE = `
  - id: "R-1"
    title: "T"
    source:
      document: "Doc"
      section: "S1"
      text: "verbatim regulatory text"
    effect:
      type: "required_review"
      review: "R"
    condition: {}
    reviewer_name: "X"
    reviewer_role: "Y"
    sign_off_date: "2026-01-01"`;
  const packYaml = (id: string, version: string, basis = '\n    basis: "verbatim"') => `
pack_id: "${id}"
version: "${version}"
jurisdiction: "UK"
regulator: "PRA"
document: "Doc"
effective_date: "2026-01-01"
reviewer_name: "X"
reviewer_role: "Y"
sign_off_date: "2026-01-01"
rules:${RULE}${basis}
`;

  it('each pack carries its own version — updating one changes nothing else [TC-CF-4-01]', () => {
    const before = loadPacks({ a: packYaml('PACK-A', '1.1'), b: packYaml('PACK-B', '2.0') });
    const after = loadPacks({ a: packYaml('PACK-A', '1.2'), b: packYaml('PACK-B', '2.0') });
    expect(after.packs.find((p) => p.pack_id === 'PACK-A')?.version).toBe('1.2');
    // The other pack is untouched by its neighbour's update — CF-4's claim.
    expect(after.packs.find((p) => p.pack_id === 'PACK-B')).toEqual(
      before.packs.find((p) => p.pack_id === 'PACK-B'),
    );
  });

  it('TC-R12-SCHEMA-06: accepts pack-level retrieved_date and max_staleness_days', () => {
    const withHeader = `
pack_id: "PACK-A"
version: "1.1"
jurisdiction: "UK"
regulator: "PRA"
document: "Doc"
effective_date: "2026-01-01"
reviewer_name: "X"
reviewer_role: "Y"
sign_off_date: "2026-01-01"
retrieved_date: "2026-07-01"
max_staleness_days: 180
rules:${RULE}
    basis: "verbatim"
`;
    const { packs, errors } = loadPacks({ a: withHeader });
    expect(errors).toEqual([]);
    expect(packs[0]?.retrieved_date).toBe('2026-07-01');
    expect(packs[0]?.max_staleness_days).toBe(180);
  });

  it('TC-R12-SCHEMA-07: rejects a pack-level max_staleness_days of the wrong type', () => {
    const bad = `
pack_id: "PACK-A"
version: "1.1"
jurisdiction: "UK"
regulator: "PRA"
document: "Doc"
effective_date: "2026-01-01"
reviewer_name: "X"
reviewer_role: "Y"
sign_off_date: "2026-01-01"
max_staleness_days: "a lot"
rules:${RULE}
    basis: "verbatim"
`;
    const { packs, errors } = loadPacks({ a: bad });
    expect(packs).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('TC-R12-SCHEMA-08: pack loads fine without the new header fields (optional, backward compatible)', () => {
    const { packs, errors } = loadPacks({ a: packYaml('PACK-A', '1.1') });
    expect(errors).toEqual([]);
    expect(packs[0]?.retrieved_date).toBeUndefined();
    expect(packs[0]?.max_staleness_days).toBeUndefined();
  });

  it('a rule with no basis is rejected on load [TC-RA-8-01]', () => {
    // TC-RA-8-01 originally demanded rejection for a missing CONFIDENCE SCORE.
    // Confidence was removed in V2-E as fabricated precision and replaced by
    // `basis` — an objective claim a reviewer can check against the quoted
    // text. The criterion was rewritten to match (2026-08-15); this pins the
    // current rule: no basis, no load.
    const { packs, errors } = loadPacks({ nb: packYaml('NO-BASIS', '1.0', '') });
    expect(packs).toEqual([]);
    expect(errors[0]?.reason).toMatch(/basis/);
  });
});
