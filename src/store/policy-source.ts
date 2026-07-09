// Rule 3 (cross-cutting.md §7): persistence-only, no React, no LLM.
// Same shape as role.ts's getRole()/setRole() — a thin localStorage
// wrapper. Centralizes "what policy YAML is currently active" so
// App.tsx and IntakeFlow.tsx read from one place instead of each
// independently importing the static starter file (P7-C03).
import appetiteYaml from '../../policy/appetite.yaml?raw';

const POLICY_YAML_KEY = 'aigate:policy-yaml';

export function getCurrentPolicyYaml(): string {
  return localStorage.getItem(POLICY_YAML_KEY) ?? appetiteYaml;
}

export function setCurrentPolicyYaml(yaml: string): void {
  localStorage.setItem(POLICY_YAML_KEY, yaml);
}
