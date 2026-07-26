import { it, expect, vi } from 'vitest';

// Code review 001, C-6 — permanent regression guard.
// The PV-6 inheritance block reintroduced the words "approved"/"rejected"
// into always-visible verdict content, which collides with the single-match
// getByText(/approved|rejected/i) the acceptance suite uses. It was LATENT:
// WalkingSkeleton declares no platform, so the block never rendered there
// and 245 tests passed over it. This test renders a verdict WITH a platform
// declared — the case the suite structurally could not reach.
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../../store/policy';
import { evaluate } from '../../engine/evaluate';
import { buildGraphFromForm } from '../../engine/build-graph-from-form';
import VerdictDisplay from '../VerdictDisplay';
it('C-6: single-match /approved|rejected/i holds WITH inheritance rendered', () => {
  const r = loadPolicy(readFileSync(resolve(__dirname, '../../../policy/appetite.yaml'), 'utf-8'));
  if (!r.valid) throw new Error('bad policy');
  const g = buildGraphFromForm({ useCaseName: 'x', description: 'y',
    inputDataClass: 'Internal', inputDataZone: 'Zone B', modelType: 'ml', autonomyLevel: 1,
    processingDataZone: 'Zone B', outputActionType: 'recommend', outputExposure: 'internal-shared',
    decisionBindingness: 'advisory', outputReversibility: 'reversible', outputScale: 'limited',
    replacesPriorModel: false, jurisdictions: [] });
  g.processing_nodes[0]!.platform = 'PLAT-INTERNAL-ML';
  const e = evaluate(g, r.policy);
  if (!e.ok) throw new Error('eval failed');
  const verdict = { ...e.value, id: 'v', use_case_id: 'uc', living_status: 'approved' as const,
    living_status_updated_at: '2026-01-01T00:00:00Z', attested_by: '1LoD',
    attested_at: '2026-01-01T00:00:00Z', graph_version: 1, corrections: [] };
  render(<VerdictDisplay verdict={verdict} auditEvents={[]} onCorrect={vi.fn()} />);
  expect(verdict.inheritance).toBeDefined();
  expect(screen.getByText(/approved|rejected/i)).toBeInTheDocument();
});
