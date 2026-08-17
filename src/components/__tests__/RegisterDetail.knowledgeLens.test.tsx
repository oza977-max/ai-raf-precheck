import { describe, it, expect, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterDetail from '../RegisterDetail';
import { addNode } from '../../store/register';
import { append, getAll } from '../../store/audit';
import type { RegisterNode, LifecycleStage } from '../../store/types';
import type { Verdict } from '../../types/verdict';

// R11-KL-2/-3 (requirements-011.md; evaluation-engine.md §14 ADR-EE-R11-2).
// The knowledge lens at 2LoD sign-off: renders advisory matches carried
// beside the verdict, and "file as coverage gap" reuses R4's exact
// rule_dissent_filed write path — one click, one event, nothing else.

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    status: 'approved_with_controls',
    tier: 'High',
    track: 'III',
    binding_constraint: 'INV-FAIRNESS-01',
    binding_path: 'applicant data → scoring model → credit decision',
    controls: ['CTRL-BIAS-01'],
    downstream_reviews: [],
    conditions: { hypotheses: [] },
    policy_version: '1.3',
    pack_versions: {},
    applied_overrides: [],
    confidence_caveats: [],
    provisional_reasons: [],
    boundary_proximity: false,
    margin_achieved: 0,
    margin_target: 0.1,
    single_covered_invariants: [],
    explanation: {
      tier_rationale: { rule_id: 'TIER-HIGH', rule_name: 'High-risk decision type' },
      track_rationale: null,
      hard_lines_checked: 4,
      invariants_checked: 6,
      tripped_invariants: [
        {
          id: 'INV-FAIRNESS-01',
          description: 'AI informing a decision about a person must be tested for disparate outcomes.',
          severity: 'High',
          regulatory_basis: 'EU AI Act Annex III',
          required_controls: ['CTRL-BIAS-01'],
          graph_path: 'applicant data → scoring model',
        },
      ],
      binding_reason: null,
      binding_regulatory_basis: null,
      regulatory_chain: [],
    },
    id: 'v-kl-1',
    use_case_id: 'uc-test',
    living_status: 'approved',
    living_status_updated_at: '2026-01-01T00:00:00.000Z',
    attested_by: '1LoD',
    attested_at: '2026-01-01T00:00:00.000Z',
    graph_version: 1,
    corrections: [],
    ...overrides,
  };
}

// KL-DISC-01 (covering_rule_ids: ["INV-FAIRNESS-01"]) is genuinely covered
// by this verdict's tripped invariant. KL-SOCECON-01 (covering_rule_ids: [])
// is deliberately, honestly uncovered by any rule — a real curated gap in
// grounding/risk-knowledge.yaml.
async function seed(useCaseId: string, verdict: Verdict | null, stage: LifecycleStage = 'pre_checked') {
  await addNode({
    node_id: useCaseId,
    node_type: 'use_case',
    label: 'Credit scoring model',
    created_at: '2026-01-01T00:00:00.000Z',
    metadata: {
      node_type: 'use_case',
      submitted_by: '1LoD',
      lifecycle_stage: stage,
      current_verdict_id: null,
      tier: 'High',
      track: 'III',
    },
  } as RegisterNode);
  if (verdict) {
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: useCaseId,
      event_type: 'verdict_produced',
      occurred_at: '2026-01-02T00:00:00.000Z',
      actor: '1LoD',
      payload: {
        type: 'verdict_produced',
        verdict,
        knowledge_lens_matched_entry_ids: ['KL-DISC-01', 'KL-SOCECON-01'],
      },
    });
  }
}

function renderDetail(useCaseId: string, role: '1LoD' | '2LoD' = '2LoD') {
  return render(
    <StrictMode>
      <RegisterDetail useCaseId={useCaseId} role={role} onBack={vi.fn()} />
    </StrictMode>,
  );
}

describe('RegisterDetail — knowledge lens panel (R11-KL-2)', () => {
  it('renders matched entries with attribution, posture line, distinct from the verdict/invariant rendering', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    const { container } = renderDetail(id);
    await screen.findByRole('region', { name: /verdict/i });

    expect(container.querySelector('.knowledge-lens')).toBeInTheDocument();
    expect(screen.getByText(/Discrimination & Toxicity/)).toBeInTheDocument();
    expect(screen.getByText(/Socioeconomic & Environmental harms/)).toBeInTheDocument();
    expect(screen.getByText(/informs — the rules decide/i)).toBeInTheDocument();
  });

  it('shows the covered entry with no gap button, and the uncovered entry with one', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);
    await screen.findByRole('region', { name: /verdict/i });

    // Exactly one uncovered entry (KL-SOCECON-01) -> exactly one gap button.
    const gapButtons = screen.getAllByRole('button', { name: /file as coverage gap/i });
    expect(gapButtons).toHaveLength(1);
  });

  it('filing a coverage gap writes exactly one rule_dissent_filed event naming the risk domain, and nothing else', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);
    await screen.findByRole('region', { name: /verdict/i });

    const before = (await getAll(id)).length;
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /file as coverage gap/i }));

    let after = await getAll(id);
    // Wait for the async write.
    for (let i = 0; i < 20 && after.length === before; i++) {
      await new Promise((r) => setTimeout(r, 10));
      after = await getAll(id);
    }

    expect(after.length).toBe(before + 1);
    const filed = after.filter((e) => e.payload.type === 'rule_dissent_filed');
    expect(filed).toHaveLength(1);
    const p = filed[0]!.payload as Extract<(typeof filed)[number]['payload'], { type: 'rule_dissent_filed' }>;
    expect(p.rule_id).toBe('Socioeconomic & Environmental harms');
    expect(p.dissent).toMatch(/Coverage gap.*Socioeconomic & Environmental harms/);
    // Nothing else rode along — no lifecycle change, no sign-off, no verdict
    // mutation (R4's advisory-by-construction guarantee, inherited exactly).
    expect(after.filter((e) => e.payload.type === 'lifecycle_stage_changed')).toHaveLength(0);
    expect(after.filter((e) => e.payload.type === 'twoloD_reviewed')).toHaveLength(0);
    expect(after.filter((e) => e.payload.type === 'verdict_corrected')).toHaveLength(0);
  });

  it('does not render the panel when no entry matched at evaluation time', async () => {
    const id = crypto.randomUUID();
    await addNode({
      node_id: id,
      node_type: 'use_case',
      label: 'No-match case',
      created_at: '2026-01-01T00:00:00.000Z',
      metadata: {
        node_type: 'use_case',
        submitted_by: '1LoD',
        lifecycle_stage: 'pre_checked',
        current_verdict_id: null,
        tier: 'High',
        track: 'III',
      },
    } as RegisterNode);
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: id,
      event_type: 'verdict_produced',
      occurred_at: '2026-01-02T00:00:00.000Z',
      actor: '1LoD',
      payload: { type: 'verdict_produced', verdict: makeVerdict({ use_case_id: id }) },
    });
    const { container } = renderDetail(id);
    await screen.findByRole('region', { name: /verdict/i });
    expect(container.querySelector('.knowledge-lens')).not.toBeInTheDocument();
  });
});
