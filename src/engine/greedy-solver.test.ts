import { describe, it, expect } from 'vitest';
import { solvControls } from './greedy-solver';
import type { Control } from './types';

function control(overrides: Partial<Control> & Pick<Control, 'id' | 'resolves' | 'burden'>): Control {
  return {
    name: overrides.id,
    description: '',
    verification: '',
    platform_satisfies: [],
    ...overrides,
  };
}

describe('solvControls', () => {
  it('returns satisfiable with no controls when nothing tripped', () => {
    const result = solvControls([], [control({ id: 'C1', resolves: ['INV-1'], burden: 1 })], [], 0.1);
    expect(result).toEqual({ ok: true, controls: [] });
  });

  it('TC-CS-1-01: picks the single control that covers the most invariants over two narrower ones', () => {
    const library = [
      control({ id: 'C-BOTH', resolves: ['INV-1', 'INV-2'], burden: 2 }),
      control({ id: 'C-ONE', resolves: ['INV-1'], burden: 1 }),
      control({ id: 'C-TWO', resolves: ['INV-2'], burden: 1 }),
    ];
    const result = solvControls(['INV-1', 'INV-2'], library, [], 0.1);
    expect(result).toEqual({ ok: true, controls: ['C-BOTH'] });
  });

  it('TC-CS-1-02: tie-breaks equal-coverage candidates by lowest burden', () => {
    const library = [
      control({ id: 'C-HIGH-BURDEN', resolves: ['INV-1'], burden: 5 }),
      control({ id: 'C-LOW-BURDEN', resolves: ['INV-1'], burden: 1 }),
    ];
    const result = solvControls(['INV-1'], library, [], 0.1);
    expect(result).toEqual({ ok: true, controls: ['C-LOW-BURDEN'] });
  });

  it('tie-breaks equal-coverage, equal-burden candidates alphabetically by id (determinism)', () => {
    const library = [
      control({ id: 'C-ZEBRA', resolves: ['INV-1'], burden: 2 }),
      control({ id: 'C-ALPHA', resolves: ['INV-1'], burden: 2 }),
    ];
    const result = solvControls(['INV-1'], library, [], 0.1);
    expect(result).toEqual({ ok: true, controls: ['C-ALPHA'] });
  });

  it('TC-CS-2-01: reports the unsatisfiable invariant when no control resolves it', () => {
    const library = [control({ id: 'C-1', resolves: ['INV-OTHER'], burden: 1 })];
    const result = solvControls(['INV-UNRESOLVED'], library, [], 0.1);
    expect(result).toEqual({ ok: false, unsatisfiableInvariant: 'INV-UNRESOLVED' });
  });

  it('names the first unsatisfiable invariant deterministically when multiple are unresolved', () => {
    const library: Control[] = [];
    const result = solvControls(['INV-A', 'INV-B'], library, [], 0.1);
    expect(result).toEqual({ ok: false, unsatisfiableInvariant: 'INV-A' });
  });

  it('an invariant fully covered by an inherited control needs no new controls selected', () => {
    const inheritedLibraryControl = control({ id: 'CTRL-INHERITED', resolves: ['INV-1'], burden: 3 });
    const library = [inheritedLibraryControl, control({ id: 'CTRL-OTHER', resolves: ['INV-1'], burden: 1 })];
    const result = solvControls(['INV-1'], library, ['CTRL-INHERITED'], 0.1);
    expect(result).toEqual({ ok: true, controls: [] });
  });

  it('does not infinite-loop and does not reselect an already-picked control', () => {
    const library = [
      control({ id: 'C-A', resolves: ['INV-1', 'INV-2'], burden: 1 }),
      control({ id: 'C-B', resolves: ['INV-2', 'INV-3'], burden: 1 }),
    ];
    const result = solvControls(['INV-1', 'INV-2', 'INV-3'], library, [], 0.1);
    expect(result).toEqual({ ok: true, controls: ['C-A', 'C-B'] });
  });
});
