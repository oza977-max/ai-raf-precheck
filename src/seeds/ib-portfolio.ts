import { evaluate } from '../engine/evaluate';
import { routeToWorkflow } from '../engine/workflow-router';
import { buildGraphFromForm } from '../engine/build-graph-from-form';
import type { StructuredFormValues } from '../engine/build-graph-from-form';
import { addNode, getUseCase } from '../store/register';
import { append } from '../store/audit';
import { knowledgeLensMatchedEntryIdsFor } from './knowledge-lens-for-seed';
import type { JurisdictionPack, PolicyFile } from '../engine/types';
import type { LifecycleStage } from '../store/types';
import type { Verdict } from '../types/verdict';

// Investment-bank portfolio seed (2026-08-17, user request: "bank use
// cases across all departments, run 1LoD and 2LoD checks, register in the
// app so people can see"). Same honesty contract as sample-register.ts:
// every verdict is computed by the REAL engine against the loaded policy
// and packs at seed time — nothing is canned, and a policy change changes
// these outcomes. The 2LoD pass is scripted but writes through the same
// event shapes the sign-off page writes, with sample reviewer names
// clearly attributable as seeds ("[IB]" prefix; names are fictional).
//
// The mix is deliberate: some cases end APPROVED (full 1LoD→2LoD chain on
// the record), one gets a correction request, several stay pre_checked so
// a human tester's 2LoD queue has real work, one carries a rule challenge
// so the rule-improvement queue shows life.
export const IB_PREFIX = 'ib-';

interface IbCase {
  id: string;
  department: string;
  values: StructuredFormValues;
  /** What the scripted 2LoD pass does with it. */
  review: 'approve' | 'request_correction' | 'leave_pending';
  reviewer?: string;
  reviewNote?: string;
  /** Optional rule challenge filed by the reviewer (rule taken from the
   *  verdict's own binding constraint at seed time — never invented). */
  challenge?: string;
}

const base = {
  replacesPriorModel: false,
  jurisdictions: [] as string[],
};

const CASES: IbCase[] = [
  {
    id: `${IB_PREFIX}mkt-fx-agent`,
    department: 'Markets',
    review: 'leave_pending',
    values: {
      ...base,
      useCaseName: '[IB] Markets — Autonomous FX hedging agent',
      description: 'Executes small FX hedges on its own within pre-set limits, with no human approving each trade, using live position data.',
      inputDataClass: 'MNPI', inputDataZone: 'Zone C', modelType: 'agentic', autonomyLevel: 4,
      processingDataZone: 'Zone C', outputActionType: 'trade', outputExposure: 'market-facing',
      decisionBindingness: 'binding', outputReversibility: 'irreversible', outputScale: 'at_scale', hitl: false,
    },
  },
  {
    id: `${IB_PREFIX}mkt-research-summary`,
    department: 'Markets',
    review: 'approve',
    reviewer: 'Priya Nair',
    values: {
      ...base,
      useCaseName: '[IB] Markets — Morning research summariser',
      description: 'Summarises published research and market news into a desk morning note. Traders read it; it touches no order systems.',
      inputDataClass: 'Internal', inputDataZone: 'Zone B', modelType: 'llm', autonomyLevel: 1,
      processingDataZone: 'Zone B', outputActionType: 'read', outputExposure: 'internal-shared',
      decisionBindingness: 'non-binding', outputReversibility: 'reversible', outputScale: 'at_scale',
    },
  },
  {
    id: `${IB_PREFIX}ibd-dealmemo`,
    department: 'Advisory',
    review: 'leave_pending',
    values: {
      ...base,
      useCaseName: '[IB] Advisory — Data-room deal memo drafter',
      description: 'Summarises data-room documents into deal memo sections for live, unannounced transactions on the cloud LLM service.',
      inputDataClass: 'MNPI', inputDataZone: 'Zone B', modelType: 'llm', autonomyLevel: 1,
      processingDataZone: 'Zone B', outputActionType: 'draft', outputExposure: 'internal-shared',
      decisionBindingness: 'material', outputReversibility: 'reversible', outputScale: 'limited',
    },
  },
  {
    id: `${IB_PREFIX}ibd-pitchbook`,
    department: 'Advisory',
    review: 'approve',
    reviewer: 'Marcus Chen',
    values: {
      ...base,
      useCaseName: '[IB] Advisory — Pitchbook first drafts',
      description: 'Drafts pitchbook sections from public filings and the firm’s internal templates on internal systems. Bankers rewrite everything.',
      inputDataClass: 'Confidential', inputDataZone: 'Zone C', modelType: 'llm', autonomyLevel: 1,
      processingDataZone: 'Zone C', outputActionType: 'draft', outputExposure: 'internal-only',
      decisionBindingness: 'non-binding', outputReversibility: 'reversible', outputScale: 'at_scale',
    },
  },
  {
    id: `${IB_PREFIX}ops-tradebreaks`,
    department: 'Operations',
    review: 'approve',
    reviewer: 'Priya Nair',
    values: {
      ...base,
      useCaseName: '[IB] Operations — Trade-break classifier',
      description: 'Classifies settlement breaks by likely cause and routes them to the right ops queue. An analyst works every break regardless.',
      inputDataClass: 'Internal', inputDataZone: 'Zone C', modelType: 'ml', autonomyLevel: 2,
      processingDataZone: 'Zone C', outputActionType: 'recommend', outputExposure: 'internal-only',
      decisionBindingness: 'advisory', outputReversibility: 'reversible', outputScale: 'at_scale',
    },
  },
  {
    id: `${IB_PREFIX}ops-kyc-extract`,
    department: 'Operations',
    review: 'request_correction',
    reviewer: 'Aisha Bello',
    reviewNote: 'Vendor control evidence not attached — re-submit with the data-processing agreement referenced.',
    values: {
      ...base,
      useCaseName: '[IB] Operations — KYC document extraction',
      description: 'Extracts names, addresses and identifiers from scanned onboarding documents via an external vendor service. An onboarding officer verifies every record.',
      inputDataClass: 'Client PII', inputDataZone: 'Zone B', modelType: 'deep-learning', autonomyLevel: 1,
      processingDataZone: 'Zone B', outputActionType: 'recommend', outputExposure: 'internal-only',
      decisionBindingness: 'material', outputReversibility: 'reversible', outputScale: 'at_scale',
      jurisdictions: ['UK'],
    },
  },
  {
    id: `${IB_PREFIX}fin-regreturn`,
    department: 'Finance',
    review: 'leave_pending',
    values: {
      ...base,
      useCaseName: '[IB] Finance — Regulatory return commentary drafter',
      description: 'Drafts the numbers commentary for regulatory returns from internal finance data. The reporting team edits and owns the submission.',
      inputDataClass: 'Confidential', inputDataZone: 'Zone C', modelType: 'llm', autonomyLevel: 1,
      processingDataZone: 'Zone C', outputActionType: 'draft', outputExposure: 'internal-shared',
      decisionBindingness: 'material', outputReversibility: 'reversible', outputScale: 'limited',
      decisionType: 'regulatory-reporting',
    },
  },
  {
    id: `${IB_PREFIX}fin-recon`,
    department: 'Finance',
    review: 'approve',
    reviewer: 'Marcus Chen',
    values: {
      ...base,
      useCaseName: '[IB] Finance — Intercompany reconciliation anomalies',
      description: 'Flags unusual intercompany reconciliation entries before close. A controller checks every flagged item.',
      inputDataClass: 'Internal', inputDataZone: 'Zone C', modelType: 'traditional-ml', autonomyLevel: 1,
      processingDataZone: 'Zone C', outputActionType: 'recommend', outputExposure: 'internal-only',
      decisionBindingness: 'advisory', outputReversibility: 'reversible', outputScale: 'at_scale',
    },
  },
  {
    id: `${IB_PREFIX}hr-cv-screen`,
    department: 'HR',
    review: 'leave_pending',
    values: {
      ...base,
      useCaseName: '[IB] HR — CV screening for analyst hiring',
      description: 'Scores applicant CVs to shortlist candidates for analyst interviews. Recruiters decide the shortlist. Applicants include EU candidates.',
      inputDataClass: 'Client PII', inputDataZone: 'Zone B', modelType: 'ml', autonomyLevel: 1,
      processingDataZone: 'Zone B', outputActionType: 'recommend', outputExposure: 'internal-only',
      decisionBindingness: 'material', outputReversibility: 'reversible', outputScale: 'at_scale',
      decisionType: 'hiring', jurisdictions: ['EU'],
    },
  },
  {
    id: `${IB_PREFIX}hr-mobility-bot`,
    department: 'HR',
    review: 'approve',
    reviewer: 'Aisha Bello',
    values: {
      ...base,
      useCaseName: '[IB] HR — Internal mobility chatbot',
      description: 'Answers employees’ questions about internal roles and mobility policy from the published policy pages. Information only.',
      inputDataClass: 'Internal', inputDataZone: 'Zone C', modelType: 'llm', autonomyLevel: 0,
      processingDataZone: 'Zone C', outputActionType: 'inform', outputExposure: 'internal-only',
      decisionBindingness: 'non-binding', outputReversibility: 'reversible', outputScale: 'at_scale',
    },
  },
  {
    id: `${IB_PREFIX}tech-codereview`,
    department: 'Technology',
    review: 'approve',
    reviewer: 'Priya Nair',
    values: {
      ...base,
      useCaseName: '[IB] Technology — Code review assistant',
      description: 'Comments on pull requests in the internal repository. Engineers read the comments; nothing merges without human approval.',
      inputDataClass: 'Internal', inputDataZone: 'Zone C', modelType: 'llm', autonomyLevel: 1,
      processingDataZone: 'Zone C', outputActionType: 'draft', outputExposure: 'internal-only',
      decisionBindingness: 'non-binding', outputReversibility: 'reversible', outputScale: 'at_scale',
    },
  },
  {
    id: `${IB_PREFIX}tech-incident-agent`,
    department: 'Technology',
    review: 'leave_pending',
    challenge: 'Internal-only reversible ticket routing at L3 feels over-weighted by this rule for technology operations tooling.',
    values: {
      ...base,
      useCaseName: '[IB] Technology — Incident-ticket triage agent',
      description: 'Agentic triage that re-routes and re-prioritises incident tickets on its own within set limits; engineers review afterwards.',
      inputDataClass: 'Internal', inputDataZone: 'Zone C', modelType: 'agentic', autonomyLevel: 3,
      processingDataZone: 'Zone C', outputActionType: 'execute', outputExposure: 'internal-only',
      decisionBindingness: 'advisory', outputReversibility: 'reversible', outputScale: 'at_scale',
    },
  },
  {
    id: `${IB_PREFIX}risk-ccr-warning`,
    department: 'Risk',
    review: 'approve',
    reviewer: 'Marcus Chen',
    values: {
      ...base,
      useCaseName: '[IB] Risk — Counterparty early-warning signals',
      description: 'Ranks counterparties by deterioration signals from internal exposures and market data. Credit officers own every action.',
      inputDataClass: 'Confidential', inputDataZone: 'Zone C', modelType: 'ml', autonomyLevel: 1,
      processingDataZone: 'Zone C', outputActionType: 'recommend', outputExposure: 'internal-shared',
      decisionBindingness: 'material', outputReversibility: 'reversible', outputScale: 'at_scale',
    },
  },
  {
    id: `${IB_PREFIX}risk-stressnarrative`,
    department: 'Risk',
    review: 'approve',
    reviewer: 'Aisha Bello',
    values: {
      ...base,
      useCaseName: '[IB] Risk — Stress-test narrative generator',
      description: 'Drafts the narrative for internal stress-test results from the computed numbers. Risk managers edit and own the final narrative.',
      inputDataClass: 'Confidential', inputDataZone: 'Zone C', modelType: 'llm', autonomyLevel: 1,
      processingDataZone: 'Zone C', outputActionType: 'draft', outputExposure: 'internal-shared',
      decisionBindingness: 'advisory', outputReversibility: 'reversible', outputScale: 'limited',
    },
  },
  {
    id: `${IB_PREFIX}comp-surveillance`,
    department: 'Compliance',
    review: 'leave_pending',
    values: {
      ...base,
      useCaseName: '[IB] Compliance — Surveillance alert triage',
      description: 'Prioritises trade-surveillance alerts so investigators see the likeliest issues first. Every alert is still worked by a person.',
      inputDataClass: 'Client PII', inputDataZone: 'Zone C', modelType: 'ml', autonomyLevel: 1,
      processingDataZone: 'Zone C', outputActionType: 'recommend', outputExposure: 'internal-only',
      decisionBindingness: 'material', outputReversibility: 'reversible', outputScale: 'at_scale',
      jurisdictions: ['UK'],
    },
  },
  {
    id: `${IB_PREFIX}legal-nda-extract`,
    department: 'Legal',
    review: 'approve',
    reviewer: 'Priya Nair',
    values: {
      ...base,
      useCaseName: '[IB] Legal — NDA clause extraction',
      description: 'Extracts key clauses and dates from signed NDAs into the matter system for lawyers to verify.',
      inputDataClass: 'Confidential', inputDataZone: 'Zone B', modelType: 'llm', autonomyLevel: 1,
      processingDataZone: 'Zone B', outputActionType: 'read', outputExposure: 'internal-only',
      decisionBindingness: 'non-binding', outputReversibility: 'reversible', outputScale: 'at_scale',
    },
  },
];

export function ibCaseCount(): number {
  return CASES.length;
}

// Same in-flight collapse as sample-register.ts (code review 001 C-5): the
// trail is append-only, so a concurrent double-seed can never be cleaned up.
let inFlight: Promise<number> | null = null;

export function seedIbPortfolio(policy: PolicyFile, packs: JurisdictionPack[] = []): Promise<number> {
  if (!inFlight) {
    inFlight = runSeed(policy, packs).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function runSeed(policy: PolicyFile, packs: JurisdictionPack[] = []): Promise<number> {
  let seeded = 0;

  for (const ibCase of CASES) {
    if (await getUseCase(ibCase.id)) continue;

    const graph = buildGraphFromForm(ibCase.values);
    const evalResult = evaluate(graph, policy, packs);
    if (!evalResult.ok) continue; // never fake what the policy cannot classify
    const result = evalResult.value;

    const t0 = Date.now();
    const at = (offsetSeconds: number) => new Date(t0 + offsetSeconds * 1000).toISOString();
    const verdict: Verdict = {
      ...result,
      id: crypto.randomUUID(),
      use_case_id: ibCase.id,
      living_status: 'approved',
      living_status_updated_at: at(2),
      attested_by: '1LoD',
      attested_at: at(1),
      graph_version: graph.version,
      corrections: [],
    };

    await append({
      event_id: crypto.randomUUID(),
      use_case_id: ibCase.id,
      event_type: 'use_case_created',
      occurred_at: at(0),
      actor: '1LoD',
      payload: { type: 'use_case_created', description: ibCase.values.description, intake_method: 'structured_form' },
    });
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: ibCase.id,
      event_type: 'graph_confirmed',
      occurred_at: at(1),
      actor: '1LoD',
      payload: { type: 'graph_confirmed', graph_id: graph.id, graph_version: graph.version, corrections_count: 0 },
    });
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: ibCase.id,
      event_type: 'verdict_produced',
      occurred_at: at(2),
      actor: 'system',
      payload: {
        type: 'verdict_produced',
        verdict,
        knowledge_lens_matched_entry_ids: knowledgeLensMatchedEntryIdsFor(graph, verdict),
      },
    });

    // Scripted 2LoD pass — the SAME event shapes the sign-off page writes.
    // Only cases the router parks at pre_checked get a review; Low
    // self-serves and outside-appetite cases wait for a human, exactly as
    // the product's lifecycle rules dictate.
    const routed = routeToWorkflow(result.tier, policy);
    let stage: LifecycleStage = routed.lifecycle_stage;
    if (stage === 'pre_checked' && ibCase.review === 'approve' && ibCase.reviewer) {
      await append({
        event_id: crypto.randomUUID(),
        use_case_id: ibCase.id,
        event_type: 'twoloD_reviewed',
        occurred_at: at(3),
        actor: '2LoD',
        payload: {
          type: 'twoloD_reviewed',
          action: 'approved',
          verdict_id: verdict.id,
          attested_by_name: `${ibCase.reviewer} (seeded sample)`,
        },
      });
      await append({
        event_id: crypto.randomUUID(),
        use_case_id: ibCase.id,
        event_type: 'lifecycle_stage_changed',
        occurred_at: at(4),
        actor: '2LoD',
        payload: { type: 'lifecycle_stage_changed', from_stage: 'pre_checked', to_stage: 'approved' },
      });
      stage = 'approved';
    } else if (stage === 'pre_checked' && ibCase.review === 'request_correction' && ibCase.reviewer) {
      await append({
        event_id: crypto.randomUUID(),
        use_case_id: ibCase.id,
        event_type: 'twoloD_reviewed',
        occurred_at: at(3),
        actor: '2LoD',
        payload: {
          type: 'twoloD_reviewed',
          action: 'correction_requested',
          verdict_id: verdict.id,
          attested_by_name: `${ibCase.reviewer} (seeded sample)`,
          ...(ibCase.reviewNote ? { notes: ibCase.reviewNote } : {}),
        },
      });
    }

    // One seeded rule challenge, against a rule the verdict actually relied
    // on — never an invented rule id.
    if (ibCase.challenge && result.binding_constraint) {
      await append({
        event_id: crypto.randomUUID(),
        use_case_id: ibCase.id,
        event_type: 'rule_dissent_filed',
        occurred_at: at(5),
        actor: '2LoD',
        payload: {
          type: 'rule_dissent_filed',
          verdict_id: verdict.id,
          rule_id: result.binding_constraint,
          dissent: ibCase.challenge,
          filed_by_name: 'Marcus Chen (seeded sample)',
        },
      });
    }

    await addNode({
      node_id: ibCase.id,
      node_type: 'use_case',
      label: ibCase.values.useCaseName,
      created_at: at(0),
      metadata: {
        node_type: 'use_case',
        description: ibCase.values.description,
        submitted_by: '1LoD',
        lifecycle_stage: stage,
        current_verdict_id: verdict.id,
        tier: result.tier,
        track: result.track,
      },
    });
    seeded += 1;
  }

  return seeded;
}
