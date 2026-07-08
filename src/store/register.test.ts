import { describe, it, expect, beforeEach } from 'vitest';
import { addUseCase, getAllUseCases, __resetForTests } from './register';

describe('register (in-memory stub)', () => {
  beforeEach(() => {
    __resetForTests();
  });

  it('adds a use case and retrieves it', () => {
    addUseCase({ use_case_id: 'uc-1', label: 'A tool that drafts client emails', tier: 'Low' });

    const rows = getAllUseCases();
    expect(rows).toEqual([{ use_case_id: 'uc-1', label: 'A tool that drafts client emails', tier: 'Low' }]);
  });
});
