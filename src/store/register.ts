import type { RegisterRow } from './types';

// Rule 3 (cross-cutting.md §7): persistence-only. In-memory stub — real IndexedDB
// implementation (register-lifecycle.md §4) lands in P2-C02.
let rows: RegisterRow[] = [];

export function addUseCase(row: RegisterRow): void {
  rows.push(row);
}

export function getAllUseCases(): RegisterRow[] {
  return rows;
}

// Test-only reset — avoids cross-test pollution of the module-level array.
export function __resetForTests(): void {
  rows = [];
}
