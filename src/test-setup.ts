import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// explore-001 D-002/D-003 added sessionStorage draft persistence. Without
// this, a draft left by one test restores the next test mid-flow — which is
// how the leak was found rather than shipped.
import { afterEach } from 'vitest';
afterEach(() => {
  try { sessionStorage.clear(); } catch { /* not available */ }
});
