import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../../store/policy';
import { evaluate } from '../../engine/evaluate';
import { buildGraphFromForm } from '../../engine/build-graph-from-form';
import VerdictDisplay from '../VerdictDisplay';
import { applyReattestExpiry } from '../../engine/temporal';
import type { DataFlowGraph, PolicyFile } from '../../engine/types';
import type { Verdict } from '../../types/verdict';

// FX8-3 / code review 008 — what the verdict screen renders. Real shipped policy, real evaluate()
// output (BC-003). BC-005: render the state where the claim would be FALSE and assert it is absent.
function realPolicy(): PolicyFile {
  const r = loadPolicy(readFileSync(resolve(__dirname, '../../../policy/appetite.yaml'), 'utf-8'));
  if (!r.valid) throw new Error('bad policy');
  return r.policy;
}

function graphFor(): DataFlowGraph {
  return buildGraphFromForm(
    {
      useCaseName: 'x', description: 'y', inputDataClass: 'Internal', inputDataZone: 'Zone B', modelType: 'ml',
      autonomyLevel: 1, processingDataZone: 'Zone B', outputActionType: 'recommend', outputExposure: 'internal-shared',
      decisionBindingness: 'advisory', outputReversibility: 'reversible', outputScale: 'limited',
      replacesPriorModel: false, jurisdictions: [],
    },
    '2026-01-01T00:00:00.000Z',
    () => crypto.randomUUID(),
  );
}

function verdictFrom(policy: PolicyFile, over: Partial<Verdict> = {}, graph: DataFlowGraph = graphFor()): Verdict {
  const e = evaluate(graph, policy);
  if (!e.ok) throw new Error('eval failed');
  return {
    ...e.value, id: 'v1', use_case_id: 'uc', living_status: 'approved' as const,
    living_status_updated_at: '2026-01-01T00:00:00Z', attested_by: '1LoD', attested_at: '2026-01-01T00:00:00Z',
    graph_version: 1, corrections: [], ...over,
  } as Verdict;
}

const PERMISSIVE = /you can start|self-service final|nobody —/i;

describe('VerdictDisplay — CR8-02 (P4): every surface for the same state', () => {
  it('TC-CR8-02f: stage approved with NO policy — the stage note, headline and who-signs-off say nothing permissive', () => {
    const policy = realPolicy();
    const verdict = verdictFrom(policy, { tier: 'Low', controls: [] });
    const { container } = render(<VerdictDisplay verdict={verdict} auditEvents={[]} policy={undefined} registerStage="approved" onCorrect={vi.fn()} />);
    expect(container.querySelector('.verdict__stage-note')!.textContent).not.toMatch(PERMISSIVE);
    expect(container.textContent).not.toMatch(/you can start|nobody —/i);
  });

  it('TC-CR8-02g: no stage at all (intake, before saving) — nothing on the screen says the person can start or that nobody signs off', () => {
    const policy = realPolicy();
    const verdict = verdictFrom(policy, { tier: 'Low', controls: [] });
    const { container } = render(<VerdictDisplay verdict={verdict} auditEvents={[]} policy={policy} onCorrect={vi.fn()} />);
    expect(container.textContent).not.toMatch(/you can start|nobody —|no sign-off needed/i);
  });
});

// CR8-11: the model-governance review sentence is rewritten WHOLE, by the model's registry status as the
// engine's resolveApprovedModel sees it (family fallback included) — never the engine's sentence with an id
// swapped for a label that already carries its own suffix. Derived from: verdict.downstream_review_sources
// (rule MODEL-REGISTRY:<id>) + policy.approved_models.
describe('VerdictDisplay — CR8-11: the model review sentence', () => {
  function modelVerdict(modelId: string) {
    const policy = realPolicy();
    const g = graphFor();
    g.processing_nodes[0]!.declared_model_id = modelId;
    return { policy, g, verdict: verdictFrom(policy, { tier: 'High' }, g) };
  }
  const BAD = /extra check|registry within appetite|so it gets|is not on the firm/i;

  it('TC-CR8-11: shipped qwen3:4b (listed, not yet accepted) reads as one whole sentence at every site that prints it', () => {
    const { policy, g, verdict } = modelVerdict('qwen3:4b');
    const { container } = render(<VerdictDisplay verdict={verdict} auditEvents={[]} policy={policy} graph={g} reasoningDefaultOpen />);
    const sentence = 'Model governance review required — A small open model running on your own computer is listed but not yet accepted by your firm';
    const body = container.querySelector('.verdict__reviewer-body')!;
    expect(body.textContent).toContain(sentence);
    expect(container.textContent).not.toMatch(BAD);
    // every printed copy is the whole sentence — none carries the label suffix mid-sentence
    expect(container.textContent!.split(sentence).length - 1).toBeGreaterThanOrEqual(2);
  });

  it('TC-CR8-11-1: a model the policy does not list says so, by the name as typed', () => {
    const { policy, g, verdict } = modelVerdict('my-typed-model');
    const { container } = render(<VerdictDisplay verdict={verdict} auditEvents={[]} policy={policy} graph={g} reasoningDefaultOpen />);
    expect(container.querySelector('.verdict__reviewer-body')!.textContent).toContain("Model governance review required — my-typed-model is not on your firm's model list");
    expect(container.textContent).not.toMatch(BAD);
  });

  it('TC-CR8-11-2: the rejected-screen copy prints the same rewritten sentence', () => {
    const { policy, g, verdict } = modelVerdict('qwen3:4b');
    const rejected = { ...verdict, status: 'rejected' as const };
    const { container } = render(<VerdictDisplay verdict={rejected} auditEvents={[]} policy={policy} graph={g} reasoningDefaultOpen />);
    expect(container.textContent).toContain('A small open model running on your own computer is listed but not yet accepted by your firm');
    expect(container.textContent).not.toMatch(BAD);
  });
});

// CR8-17: the reviewer banner uses the same filter as the first screen's line.
describe('VerdictDisplay — CR8-17: the Review overdue banner names only packs the verdict used', () => {
  const stale = (id: string) => ({ pack_id: id, retrieved_date: '2026-01-01', days_overdue: 5, max_staleness_days: 90 });

  it('TC-CR8-17-3: two stale packs, one used — only the used one is named; a legacy verdict shows no banner', () => {
    const policy = realPolicy();
    const base = verdictFrom(policy, { pack_versions: { 'UK-PACK': '1' }, stale_sources: [stale('UK-PACK'), stale('OTHER-PACK')] } as Partial<Verdict>);
    const a = render(<VerdictDisplay verdict={base} auditEvents={[]} policy={policy} />);
    const banner = a.container.querySelector('.verdict__stale-banner')!;
    expect(banner.textContent).toContain('UK-PACK');
    expect(banner.textContent).not.toContain('OTHER-PACK');
    a.unmount();
    const legacy = { ...base } as Record<string, unknown>;
    delete legacy.pack_versions;
    const c = render(<VerdictDisplay verdict={legacy as unknown as Verdict} auditEvents={[]} policy={policy} />);
    expect(c.container.querySelector('.verdict__stale-banner')).toBeNull();
  });
});

// Review pass 1, I-1: the screen gets TODAY's policy, not the one the verdict was evaluated with, so a
// listed model whose entry is a family or reads accepted now gets wording that is always true.
describe('VerdictDisplay — CR8-11 review fix: a listed model that reads accepted gets neutral wording', () => {
  const NEUTRAL = "is on your firm's model list, but a model review was required when this was checked";

  it('TC-CR8-11-3: a lapsed family (applyReattestExpiry) renders the neutral wording, never "not current"', () => {
    const policy = applyReattestExpiry(realPolicy(), '2030-01-01');
    const g = graphFor();
    g.processing_nodes[0]!.declared_model_id = 'gpt-4o-2026-08-01';
    const verdict = verdictFrom(policy, { tier: 'High' }, g);
    expect(verdict.downstream_review_sources?.some((x) => x.rule_id === 'MODEL-REGISTRY:gpt-4o-2026-08-01')).toBe(true);
    const { container } = render(<VerdictDisplay verdict={verdict} auditEvents={[]} policy={policy} graph={g} reasoningDefaultOpen />);
    expect(container.textContent).toContain(NEUTRAL);
    expect(container.textContent).not.toMatch(/not current/i);
  });

  it('TC-CR8-11-4: an entry the firm has since accepted renders the neutral wording, never "not current"', () => {
    const evaluatedWith = realPolicy();
    const g = graphFor();
    g.processing_nodes[0]!.declared_model_id = 'qwen3:4b';
    const verdict = verdictFrom(evaluatedWith, { tier: 'High' }, g);
    const today = { ...evaluatedWith, approved_models: evaluatedWith.approved_models!.map((m) => (m.model_id === 'qwen3:4b' ? { ...m, is_approved: true } : m)) } as PolicyFile;
    const { container } = render(<VerdictDisplay verdict={verdict} auditEvents={[]} policy={today} graph={g} reasoningDefaultOpen />);
    expect(container.textContent).toContain(NEUTRAL);
    expect(container.textContent).not.toMatch(/not current/i);
  });

  it('TC-CR8-02h: stage idea / exploring / retired — no sign-off claim even with a self-service policy', () => {
    const policy = realPolicy();
    const verdict = verdictFrom(policy, { tier: 'Low', controls: [] });
    for (const stage of ['idea', 'exploring', 'retired'] as const) {
      const { container, unmount } = render(<VerdictDisplay verdict={verdict} auditEvents={[]} policy={policy} registerStage={stage} onCorrect={vi.fn()} />);
      expect(container.textContent, stage).not.toMatch(/you can start|nobody —|no sign-off needed|self-service final/i);
      unmount();
    }
  });
});
