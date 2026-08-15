import { describe, it, expect } from 'vitest';
import { findPossibleDuplicates } from './duplicate';

describe('findPossibleDuplicates', () => {
  it('flags a high word-overlap description as a possible duplicate [TC-UC-2-01]', () => {
    const result = findPossibleDuplicates('Internal chatbot for answering HR policy questions', [
      { id: 'u1', label: 'Internal chatbot for answering HR policy questions from staff' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('u1');
  });

  it('does not flag an unrelated description [TC-UC-2-04]', () => {
    const result = findPossibleDuplicates('Fraud detection model for card transactions', [
      { id: 'u1', label: 'Internal chatbot for HR policy questions' },
    ]);
    expect(result).toEqual([]);
  });

  it('returns [] when there are no existing use cases [TC-UC-2-05]', () => {
    expect(findPossibleDuplicates('anything', [])).toEqual([]);
  });

  it('sorts multiple candidates by descending score', () => {
    const result = findPossibleDuplicates('client relationship notes summarization model', [
      { id: 'low', label: 'model for things' },
      { id: 'high', label: 'client relationship notes summarization model for staff' },
    ]);
    expect(result[0]?.id).toBe('high');
  });
});
