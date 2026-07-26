import { evaluate } from '../engine/evaluate';
import { routeToWorkflow } from '../engine/workflow-router';
import { buildGraphFromForm } from '../engine/build-graph-from-form';
import type { StructuredFormValues } from '../engine/build-graph-from-form';
import { addNode, getUseCase } from '../store/register';
import { append } from '../store/audit';
import type { JurisdictionPack, PolicyFile } from '../engine/types';
import type { Verdict } from '../types/verdict';

// Demo/sample register (V2-D). Every sample is evaluated by the REAL
// engine against the loaded policy and packs at seed time — no verdict
// here is fabricated, so samples always agree with the current rules and
// change if the policy changes. Clearly labelled as samples so a tester
// can tell them from their own submissions.
export const SAMPLE_PREFIX = 'sample-';
const SAMPLE_SUBMITTER = '1LoD';

interface Sample {
  id: string;
  values: StructuredFormValues;
}

const base = {
  replacesPriorModel: false,
  jurisdictions: [] as string[],
};

const SAMPLES: Sample[] = [
  {
    id: `${SAMPLE_PREFIX}var-commentary`,
    values: {
      ...base,
      useCaseName: '[SAMPLE] Daily VaR & IRC commentary',
      description: 'Drafts the day-on-day market risk commentary from overnight VaR, stressed VaR and IRC moves. A market risk manager approves every commentary before circulation.',
      inputDataClass: 'Confidential',
      inputDataZone: 'Zone B',
      modelType: 'llm',
      autonomyLevel: 1,
      processingDataZone: 'Zone B',
      outputActionType: 'draft',
      outputExposure: 'internal-shared',
      decisionBindingness: 'advisory',
      outputReversibility: 'reversible',
      outputScale: 'at_scale',
    },
  },
  {
    id: `${SAMPLE_PREFIX}credit-review`,
    values: {
      ...base,
      useCaseName: '[SAMPLE] Credit review drafting & covenant monitoring',
      description: 'Summarises financial spreads and covenant history into annual credit review memos. The credit officer owns the rating and the final review.',
      inputDataClass: 'Client PII',
      inputDataZone: 'Zone B',
      modelType: 'llm',
      autonomyLevel: 1,
      processingDataZone: 'Zone B',
      outputActionType: 'recommend',
      outputExposure: 'internal-shared',
      decisionBindingness: 'material',
      outputReversibility: 'reversible',
      outputScale: 'at_scale',
    },
  },
  {
    id: `${SAMPLE_PREFIX}deal-memo-cloud`,
    values: {
      ...base,
      useCaseName: '[SAMPLE] Deal memo drafting on cloud LLM',
      description: 'Summarises data-room documents into credit committee deal memo sections for live, unannounced transactions using the cloud LLM service.',
      inputDataClass: 'MNPI',
      inputDataZone: 'Zone B',
      modelType: 'llm',
      autonomyLevel: 1,
      processingDataZone: 'Zone B',
      outputActionType: 'draft',
      outputExposure: 'internal-shared',
      decisionBindingness: 'material',
      outputReversibility: 'reversible',
      outputScale: 'limited',
    },
  },
  {
    id: `${SAMPLE_PREFIX}auto-line-cut`,
    values: {
      ...base,
      useCaseName: '[SAMPLE] Autonomous credit-line reduction',
      description: 'Automatically reduces credit limits on deteriorating retail accounts with no human review; customers are notified after the fact.',
      inputDataClass: 'Client PII',
      inputDataZone: 'Zone C',
      modelType: 'traditional-ml',
      autonomyLevel: 4,
      processingDataZone: 'Zone C',
      outputActionType: 'execute',
      outputExposure: 'client-facing',
      decisionBindingness: 'binding',
      outputReversibility: 'irreversible',
      outputScale: 'at_scale',
      decisionType: 'credit-decision',
      hitl: false,
    },
  },
  {
    id: `${SAMPLE_PREFIX}coding-assistant`,
    values: {
      ...base,
      useCaseName: '[SAMPLE] Coding assistant for risk analysts',
      description: 'Agentic coding assistant that proposes reconciliation scripts and data-quality checks. Analysts review and apply every change themselves.',
      inputDataClass: 'Internal',
      inputDataZone: 'Zone B',
      modelType: 'agentic',
      autonomyLevel: 1,
      processingDataZone: 'Zone B',
      outputActionType: 'draft',
      outputExposure: 'internal-only',
      decisionBindingness: 'non-binding',
      outputReversibility: 'reversible',
      outputScale: 'at_scale',
    },
  },
  {
    id: `${SAMPLE_PREFIX}wealth-chatbot`,
    values: {
      ...base,
      useCaseName: '[SAMPLE] Client-facing wealth chatbot',
      description: 'Answers wealth clients’ product and portfolio questions in natural language, with a human adviser escalation route.',
      inputDataClass: 'Internal',
      inputDataZone: 'Zone B',
      modelType: 'llm',
      autonomyLevel: 1,
      processingDataZone: 'Zone B',
      outputActionType: 'recommend',
      outputExposure: 'client-facing',
      decisionBindingness: 'advisory',
      outputReversibility: 'reversible',
      outputScale: 'at_scale',
      jurisdictions: ['UK', 'EU'],
    },
  },
];

export function sampleCount(): number {
  return SAMPLES.length;
}

// Code review 001, C-5. The per-item `if (await getUseCase(id)) continue`
// below is check-then-act across an async boundary: two concurrent callers
// both observe "absent" before either writes, and both proceed. The audit
// trail is append-only, so the duplicate events they write can never be
// removed — and the second addNode then throws ConstraintError, leaving the
// trail corrupted AND the seed half-finished.
//
// The existence check is necessary but not sufficient. This in-flight
// promise collapses concurrent calls onto one execution, the same guard
// aigate-self-assessment.ts has always used. A synchronous assignment is
// required: any `await` before the guard is set reopens the window.
let inFlight: Promise<number> | null = null;

export function seedSampleRegister(policy: PolicyFile, packs: JurisdictionPack[] = []): Promise<number> {
  if (!inFlight) {
    inFlight = runSeed(policy, packs).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function runSeed(policy: PolicyFile, packs: JurisdictionPack[] = []): Promise<number> {
  let seeded = 0;

  for (const sample of SAMPLES) {
    if (await getUseCase(sample.id)) continue;

    const graph = buildGraphFromForm(sample.values);
    const evalResult = evaluate(graph, policy, packs);
    if (!evalResult.ok) continue; // a sample the current policy cannot classify is skipped, not faked
    const result = evalResult.value;

    const now = new Date().toISOString();
    const verdict: Verdict = {
      ...result,
      id: crypto.randomUUID(),
      use_case_id: sample.id,
      living_status: 'approved',
      living_status_updated_at: now,
      attested_by: SAMPLE_SUBMITTER,
      attested_at: now,
      graph_version: graph.version,
      corrections: [],
    };

    await append({
      event_id: crypto.randomUUID(),
      use_case_id: sample.id,
      event_type: 'graph_confirmed',
      occurred_at: now,
      actor: SAMPLE_SUBMITTER,
      payload: { type: 'graph_confirmed', graph_id: graph.id, graph_version: graph.version, corrections_count: 0 },
    });
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: sample.id,
      event_type: 'verdict_produced',
      occurred_at: now,
      actor: 'system',
      payload: { type: 'verdict_produced', verdict },
    });

    const routed = routeToWorkflow(result.tier, policy);
    await addNode({
      node_id: sample.id,
      node_type: 'use_case',
      label: sample.values.useCaseName,
      created_at: now,
      metadata: {
        node_type: 'use_case',
        submitted_by: SAMPLE_SUBMITTER,
        lifecycle_stage: routed.lifecycle_stage,
        current_verdict_id: verdict.id,
        tier: result.tier,
        track: result.track,
      },
    });
    seeded += 1;
  }

  return seeded;
}
