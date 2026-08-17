import { describe, it, expect } from 'vitest';
import { findPrecedents } from './precedent';
import type { PrecedentCandidate } from './precedent';

// R8-SC-3 (requirements-008): pure, deterministic, self-excluding.
const c = (id: string, label: string, description?: string): PrecedentCandidate => ({
  id, label, description,
  status: 'approved_with_controls', tier: 'High', track: 'II',
  decided_at: '2026-01-01T00:00:00.000Z', policy_version: '1.3',
});

describe('findPrecedents', () => {
  it('TC-R8-SC-3-01: same inputs, same ranking; ties break by id', () => {
    const cands = [c('b', 'client email drafting tool'), c('a', 'client email drafting tool')];
    const subject = { label: 'client email drafter', description: 'drafts client emails' };
    const r1 = findPrecedents(subject, cands);
    const r2 = findPrecedents(subject, cands);
    expect(r1).toEqual(r2);
    expect(r1.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('TC-R8-SC-3-02: higher description overlap ranks first; the subject is never its own precedent', () => {
    const cands = [
      c('near', 'credit risk summariser', 'summarises internal credit risk reports for analysts'),
      c('far', 'holiday planner', 'plans holidays'),
      c('self', 'credit risk summariser', 'summarises internal credit risk reports for analysts'),
    ];
    const r = findPrecedents(
      { label: 'credit risk summary tool', description: 'summarises credit risk reports' },
      cands,
      'self',
    );
    expect(r[0]?.id).toBe('near');
    expect(r.find((m) => m.id === 'self')).toBeUndefined();
    expect(r.find((m) => m.id === 'far')).toBeUndefined();
  });

  it('TC-R8-SC-3-03: caps at three', () => {
    const cands = ['a', 'b', 'c', 'd'].map((id) => c(id, 'credit risk reports summariser'));
    expect(findPrecedents({ label: 'credit risk reports summary' }, cands)).toHaveLength(3);
  });
});
