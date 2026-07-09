// Rule 3 (cross-cutting.md §7): persistence-only, no React, no LLM.
// Same shape as src/llm/client.ts's getApiKey() — a thin localStorage
// wrapper. This is the one deliberate exception to this build's running
// pattern of deferring auth/role work: the register view's entire
// purpose (1LoD vs 2LoD visibility, register-lifecycle.md §10.1/10.2)
// depends on a real role signal, so it's built here rather than deferred
// again.
const ROLE_KEY = 'aigate:role';
const DEFAULT_ROLE = '1LoD';

export function getRole(): string {
  return localStorage.getItem(ROLE_KEY) ?? DEFAULT_ROLE;
}

export function setRole(role: string): void {
  localStorage.setItem(ROLE_KEY, role);
}
