import { describe, it, expect, vi } from 'vitest';
import { render, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../../store/policy';
import { evaluate } from '../../engine/evaluate';
import { buildGraphFromForm } from '../../engine/build-graph-from-form';
import VerdictDisplay from '../VerdictDisplay';
import type { PolicyFile } from '../../engine/types';
import type { Verdict } from '../../types/verdict';

// CR6-11 / D-2 / G-8 (code review 006), on the real component with the real
// shipped policy (BC-003: data the real producer wrote).
function realPolicy(): PolicyFile {
  const r = loadPolicy(readFileSync(resolve(__dirname, '../../../policy/appetite.yaml'), 'utf-8'));
  if (!r.valid) throw new Error('bad policy');
  return r.policy;
}

function verdictFor(platform: string | undefined, vendor: string | undefined, policy: PolicyFile, inputDataClass: 'Internal' | 'Confidential' = 'Internal'): Verdict {
  const g = buildGraphFromForm(
    {
      useCaseName: 'x', description: 'y', inputDataClass, inputDataZone: 'Zone B', modelType: 'ml',
      autonomyLevel: 1, processingDataZone: 'Zone B', outputActionType: 'recommend', outputExposure: 'internal-shared',
      decisionBindingness: 'advisory', outputReversibility: 'reversible', outputScale: 'limited',
      replacesPriorModel: false, jurisdictions: [],
    },
    '2026-01-01T00:00:00.000Z',
  );
  if (platform) g.processing_nodes[0]!.platform = platform;
  if (vendor) g.processing_nodes[0]!.vendor = vendor;
  const e = evaluate(g, policy);
  if (!e.ok) throw new Error('eval failed');
  return {
    ...e.value, id: 'v', use_case_id: 'uc', living_status: 'approved' as const,
    living_status_updated_at: '2026-01-01T00:00:00Z', attested_by: '1LoD', attested_at: '2026-01-01T00:00:00Z',
    graph_version: 1, corrections: [],
  } as Verdict;
}

describe('VerdictDisplay — CR6-11: platform AND supplier declared, no graph (the register path)', () => {
  it('TC-CR6-11: one combined entry built from the verdict\'s own inheritance, saying the record does not keep the two apart', () => {
    const policy = realPolicy();
    const verdict = verdictFor('PLAT-CLOUD-LLM', 'VENDOR-APPROVED-LLM', policy);
    expect(verdict.inheritance?.declared_platform).toBe('PLAT-CLOUD-LLM');
    expect(verdict.inheritance?.declared_vendor).toBe('VENDOR-APPROVED-LLM');
    expect(verdict.inheritance!.inherited_controls.length).toBeGreaterThan(0);

    const { container } = render(<VerdictDisplay verdict={verdict} auditEvents={[]} policy={policy} onCorrect={vi.fn()} />);
    const entries = container.querySelectorAll('.verdict__chain-entry');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.textContent).toMatch(/does not keep the two apart/i);
    expect(entries[0]!.textContent).toContain('PLAT-CLOUD-LLM');
    expect(entries[0]!.textContent).toContain('VENDOR-APPROVED-LLM');
    // The summary promised N inherited controls; the list shows them.
    expect(entries[0]!.textContent).toMatch(/Inherited:/);
  });
});

describe('VerdictDisplay — CR6-11b: platform on the registry, supplier not, no graph', () => {
  it('TC-CR6-11b: names exactly the unlisted id, still lists what the listed one inherits, never says "nothing inherited"', () => {
    const policy = realPolicy();
    const verdict = verdictFor('PLAT-CLOUD-LLM', 'VENDOR-NOT-LISTED', policy);
    expect(verdict.inheritance!.unresolved_components).toEqual(['VENDOR-NOT-LISTED']);
    expect(verdict.inheritance!.inherited_controls.length).toBeGreaterThan(0);
    const { container } = render(<VerdictDisplay verdict={verdict} auditEvents={[]} policy={policy} onCorrect={vi.fn()} />);
    const entry = container.querySelector('.verdict__chain-entry')!;
    expect(entry.textContent).toMatch(/Inherited:/);
    expect(entry.textContent).toMatch(/Not on the covered registry:\s*VENDOR-NOT-LISTED/);
    expect(entry.textContent).not.toMatch(/Nothing inherited/);
    expect(entry.textContent).not.toMatch(/PLAT-CLOUD-LLM[^]*Not on the registry/);
    const fold = container.textContent ?? '';
    expect(fold).not.toMatch(/not on the covered registry — nothing inherited/);
    expect(fold).toMatch(/1 declared component not on the covered registry/);
    // FX-4 pass 2 + final review: with two components "the rest" is always
    // exactly one — and the sentence must end, not trail off at "which is".
    expect(fold).toMatch(/\d+ controls? still inherited from the listed one(?!,? which)/);
    expect(fold).not.toMatch(/which is\s*$/);
  });

  it('TC-CR6-11d: both listed but nothing inherited — the entry claims no single cause ("approval does not cover"), never "falls outside the covered envelope"', () => {
    const policy = realPolicy();
    const verdict = verdictFor('PLAT-CLOUD-LLM', 'VENDOR-APPROVED-LLM', policy, 'Confidential');
    expect(verdict.inheritance!.unresolved_components).toEqual([]);
    expect(verdict.inheritance!.inherited_controls).toEqual([]);
    const { container } = render(<VerdictDisplay verdict={verdict} auditEvents={[]} policy={policy} onCorrect={vi.fn()} />);
    const entry = container.querySelector('.verdict__chain-entry')!;
    expect(entry.textContent).toMatch(/Nothing inherited:\s*their approval does not cover this use case/);
    expect(entry.textContent).not.toMatch(/falls outside the covered envelope/);
  });

  it('TC-CR6-11c: listed platform OUTSIDE its envelope + unlisted supplier — says why the listed one inherits nothing', () => {
    const policy = realPolicy();
    // PLAT-CLOUD-LLM's approved envelope stops at Internal data, so a
    // Confidential case inherits nothing from it (real policy, real engine).
    const verdict = verdictFor('PLAT-CLOUD-LLM', 'VENDOR-NOT-LISTED', policy, 'Confidential');
    expect(verdict.inheritance!.unresolved_components).toEqual(['VENDOR-NOT-LISTED']);
    expect(verdict.inheritance!.inherited_controls).toEqual([]);
    const { container } = render(<VerdictDisplay verdict={verdict} auditEvents={[]} policy={policy} onCorrect={vi.fn()} />);
    const entry = container.querySelector('.verdict__chain-entry')!;
    expect(entry.textContent).toMatch(/Partly on the registry/);
    expect(entry.textContent).toMatch(/Not on the covered registry:\s*VENDOR-NOT-LISTED/);
    // Final review M-3: the engine can inherit nothing for more than one
    // reason (outside the envelope, no satisfies_controls, coupled clusters),
    // so the line claims only what is known — the approval does not cover it.
    expect(entry.textContent).toMatch(/Nothing inherited from the listed one either:\s*its approval does not cover this use case/);
  });
});

describe('VerdictDisplay — D-2: "supplier", not "vendor", beside the Supplier label', () => {
  it('TC-CR6-D2: the unregistered-component text says "supplier and platform risk assessment"', () => {
    const policy = realPolicy();
    const verdict = verdictFor('PLAT-NOT-REGISTERED', undefined, policy);
    const { container } = render(<VerdictDisplay verdict={verdict} auditEvents={[]} policy={policy} onCorrect={vi.fn()} />);
    const entries = container.querySelectorAll('.verdict__chain-entry');
    expect(entries.length).toBeGreaterThan(0);
    const text = [...entries].map((e) => e.textContent).join(' ');
    expect(text).toMatch(/supplier and platform risk assessment is required/i);
    expect(text).not.toMatch(/vendor/i);
  });
});

describe('VerdictDisplay — G-8: no "(0)" above a non-empty list', () => {
  it('TC-CR6-G8: when nothing is outstanding the count heading is absent; the in-place line keeps its own wording', () => {
    const policy = {
      ...realPolicy(),
      controls: [
        {
          id: 'CTRL-ENC-01', name: 'Encryption in transit', description: 'd', resolves: [], burden: 1, verification: 'v',
          plain_action: 'Platform encrypts in transit',
          verification_evidence: { status: 'verified', detail: 'd', applies_to: { platforms: ['PLAT-X'] } },
        },
      ],
      platforms: [{ id: 'PLAT-X', name: 'raw', approved_envelope: {}, satisfies_controls: [], plain_name: 'Firm Platform' }],
    } as unknown as PolicyFile;
    const graph = {
      id: 'g', version: 1, input_nodes: [],
      processing_nodes: [{ id: 'p1', label: 'x', model_type: 'llm' as const, autonomy_level: 1 as const, data_zone: 'Zone B' as const, vendor: 'internal', platform: 'PLAT-X', replaces_prior_model: false }],
      output_nodes: [{ id: 'o1', label: 'x', action_type: 'draft' as const, exposure: 'internal-only' as const, decision_bindingness: 'advisory' as const, output_reversibility: 'reversible' as const, scale: 'limited' as const }],
      edges: [], jurisdictions: [], intake_method: 'structured_form' as const, extracted_at: '2026-01-01T00:00:00.000Z',
    };
    const verdict = {
      ...verdictFor(undefined, undefined, realPolicy()),
      status: 'approved_with_controls' as const,
      controls: ['CTRL-ENC-01'],
      inheritance: undefined,
    } as Verdict;
    const { container } = render(<VerdictDisplay verdict={verdict} auditEvents={[]} policy={policy} graph={graph} onCorrect={vi.fn()} />);
    const first = container.querySelector<HTMLElement>('.verdict__first-screen')!;
    expect(within(first).getByText(/Already in place:/)).toBeInTheDocument();
    expect(first.textContent).not.toMatch(/\(0\)/);
    expect(within(first).queryByText(/Safeguards that must be in place/)).not.toBeInTheDocument();
  });

  it('TC-CR6-G8b: with something outstanding the count heading still shows', () => {
    const policy = realPolicy();
    const verdict = { ...verdictFor(undefined, undefined, policy), status: 'approved_with_controls' as const, controls: ['CTRL-ENC-01'] } as Verdict;
    const { container } = render(<VerdictDisplay verdict={verdict} auditEvents={[]} policy={policy} onCorrect={vi.fn()} />);
    const first = container.querySelector<HTMLElement>('.verdict__first-screen')!;
    expect(within(first).getByText(/Safeguards that must be in place before you start \(1\)/)).toBeInTheDocument();
  });
});
