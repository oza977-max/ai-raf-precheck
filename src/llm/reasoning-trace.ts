import { getApiKey, createClient } from './client';
import type { LlmResult } from './types';
import type { AppliedOverride, Control, ConfidenceCaveat, Tier, Track } from '../engine/types';
import type { Verdict } from '../types/verdict';

// verdict-audit.md §7. Rule 2 (cross-cutting.md §7): src/llm/* is the ONLY
// place the Anthropic SDK is imported.
//
// V1.1-C01: the full tripped set is now carried on
// verdict.explanation.tripped_invariants (closing P5-C02's documented
// one-element approximation), so the trace prompt receives the complete
// multi-invariant breakdown with descriptions and citations. The
// one-element binding-constraint fallback remains only for verdicts
// persisted before the explanation field existed.
export interface TrippedInvariantSummary {
  invariantId: string;
  graphPath: string;
  description?: string;
  severity?: string;
  regulatory_basis?: string;
}

export interface ControlDetail {
  id: string;
  name: string;
  description: string;
}

export interface VerdictTraceData {
  status: Verdict['status'];
  tier: Tier;
  track: Track;
  binding_constraint_id: string;
  binding_constraint_description: string;
  binding_path: string;
  tripped_invariants: TrippedInvariantSummary[];
  controls_required: ControlDetail[];
  downstream_reviews: string[];
  applied_overrides: AppliedOverride[];
  confidence_caveats: ConfidenceCaveat[];
  policy_version: string;
  pack_versions: Record<string, string>;
}

export function buildTraceData(verdict: Verdict, controlLibrary: Control[], bindingDescription: string): VerdictTraceData {
  const controlsById = new Map(controlLibrary.map((c) => [c.id, c]));
  return {
    status: verdict.status,
    tier: verdict.tier,
    track: verdict.track,
    binding_constraint_id: verdict.binding_constraint,
    binding_constraint_description: bindingDescription,
    binding_path: verdict.binding_path,
    tripped_invariants:
      verdict.explanation && verdict.explanation.tripped_invariants.length > 0
        ? verdict.explanation.tripped_invariants.map((t) => ({
            invariantId: t.id,
            graphPath: t.graph_path,
            description: t.description,
            severity: t.severity,
            ...(t.regulatory_basis ? { regulatory_basis: t.regulatory_basis } : {}),
          }))
        : verdict.binding_constraint
          ? [{ invariantId: verdict.binding_constraint, graphPath: verdict.binding_path }]
          : [],
    controls_required: verdict.controls
      .map((id) => controlsById.get(id))
      .filter((c): c is Control => c !== undefined)
      .map((c) => ({ id: c.id, name: c.name, description: c.description })),
    downstream_reviews: verdict.downstream_reviews,
    applied_overrides: verdict.applied_overrides,
    confidence_caveats: verdict.confidence_caveats,
    policy_version: verdict.policy_version,
    pack_versions: verdict.pack_versions,
  };
}

const SYSTEM_INSTRUCTION =
  'You are a regulatory documentation assistant. Write a plain-English reasoning trace that a non-technical bank auditor can follow. Reference only the data below. Do not infer, interpret, or add any information not present in the structured input. Use complete sentences. Cite regulatory documents by name and section where provided.';

export async function generateReasoningTrace(traceData: VerdictTraceData, apiKey: string): Promise<LlmResult<string>> {
  if (!apiKey) {
    return { ok: false, error: { kind: 'no-api-key' } };
  }

  try {
    const client = createClient(apiKey);
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `${SYSTEM_INSTRUCTION}\n\n${JSON.stringify(traceData, null, 2)}\n\nWrite the reasoning trace.`,
        },
      ],
    });

    const textBlock = response.content.find(
      (block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text',
    );
    if (!textBlock || !textBlock.text.trim()) {
      return { ok: false, error: { kind: 'parse-error', raw: response } };
    }

    return { ok: true, value: textBlock.text.trim() };
  } catch (err) {
    return { ok: false, error: { kind: 'network-error', message: err instanceof Error ? err.message : String(err) } };
  }
}

// Uses getApiKey() directly — convenience wrapper matching the pattern of
// extractGraph()/confirmSemanticDuplicate() (caller doesn't need to know
// about localStorage).
export async function generateReasoningTraceForVerdict(
  verdict: Verdict,
  controlLibrary: Control[],
  bindingDescription: string,
): Promise<LlmResult<string>> {
  const apiKey = getApiKey();
  return generateReasoningTrace(buildTraceData(verdict, controlLibrary, bindingDescription), apiKey ?? '');
}
