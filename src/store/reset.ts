// V2-D: "start over" for testers. Everything AIGate stores lives in this
// browser (NF-3, no backend), so a reset is genuinely local and total —
// there is no server copy to fall back on, which is exactly why the UI
// wraps this in a confirmation.
//
// The saved API key is deliberately NOT cleared here: it is a machine
// setting, not test data, and re-entering it is the one step a tester
// cannot redo for themselves.
const DATABASES = ['aigate-audit', 'aigate-register'];

type DeleteOutcome = 'deleted' | 'blocked' | 'error';

// Code review 001, I-3: this previously resolved identically on success,
// error and blocked, so the UI could report a clean reset while the audit
// trail survived (another tab holding a connection blocks the delete). It
// still never rejects — a reset that hangs is worse than one that reports —
// but the caller now learns what actually happened.
function deleteDatabase(name: string): Promise<DeleteOutcome> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve('deleted');
    request.onerror = () => resolve('error');
    request.onblocked = () => resolve('blocked');
  });
}

// Callers must reload the page afterwards — src/store/db.ts caches its
// open-database promises at module scope, so in-memory handles survive
// the delete until the module is re-evaluated.
export async function clearAllLocalData(): Promise<{ complete: boolean; incomplete: string[] }> {
  localStorage.removeItem('aigate:role');
  const incomplete: string[] = [];
  for (const name of DATABASES) {
    const outcome = await deleteDatabase(name);
    if (outcome !== 'deleted') incomplete.push(`${name} (${outcome})`);
  }
  return { complete: incomplete.length === 0, incomplete };
}
