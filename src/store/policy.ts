import type { PolicyFile } from '../engine/types';

// Rule 3 (cross-cutting.md §7): persistence-only. Hardcoded stub — real YAML +
// Zod validation loader (policy-schema.md §3-6) lands in P2-C01.
export function loadPolicy(): PolicyFile {
  return {
    version: '0.1-stub',
    policy_id: 'STUB-POLICY',
    firm_name: '[FIRM]',
  };
}
