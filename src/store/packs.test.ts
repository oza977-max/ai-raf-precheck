import { describe, it, expect } from 'vitest';
import { loadPacks } from './packs';
import { getPackSources } from './pack-source';

describe('loadPacks (V2-A)', () => {
  it('loads the four AUTHORED packs from the real files, sorted by pack_id', () => {
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

  it('rejects a WHOLE pack when a rule is missing a required field, naming pack and field (CF-5/RA-7)', () => {
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
