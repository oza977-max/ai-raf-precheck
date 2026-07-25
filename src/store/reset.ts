// V2-D: "start over" for testers. Everything AIGate stores lives in this
// browser (NF-3, no backend), so a reset is genuinely local and total —
// there is no server copy to fall back on, which is exactly why the UI
// wraps this in a confirmation.
//
// The saved API key is deliberately NOT cleared here: it is a machine
// setting, not test data, and re-entering it is the one step a tester
// cannot redo for themselves.
const DATABASES = ['aigate-audit', 'aigate-register'];

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    // Resolve on blocked/error too: a blocked delete completes once the
    // page reloads and drops the open connection, and a reset that hangs
    // on one database is worse than one that reloads and retries.
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

// Callers must reload the page afterwards — src/store/db.ts caches its
// open-database promises at module scope, so in-memory handles survive
// the delete until the module is re-evaluated.
export async function clearAllLocalData(): Promise<void> {
  localStorage.removeItem('aigate:role');
  for (const name of DATABASES) {
    await deleteDatabase(name);
  }
}
