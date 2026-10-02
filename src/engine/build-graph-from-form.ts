import type {
  ActionType,
  DataClass,
  DataFlowGraph,
  DataZone,
  DecisionBindingness,
  DecisionType,
  Exposure,
  ModelType,
  SystemAccessScope,
} from './types';
import { normaliseAccessScope } from './access-scope';

// UC-3a structured form output (intake-flow.md §5.3). Pure — no I/O, same
// rule as the rest of src/engine/*. Produces the same DataFlowGraph shape
// the LLM path produces for a simple single-input/single-model/single-output
// case (the form doesn't collect edge topology).
export interface StructuredFormValues {
  useCaseName: string;
  description: string;
  inputDataClass: DataClass;
  inputDataZone: DataZone;
  // R16-B (UC-10 §2.1): several input nodes, one per distinct ticked data
  // class, each in the destination zone (`processingDataZone` below — this
  // round's single "destination zone" concept replaces a separate
  // per-input zone). When present and non-empty this takes precedence over
  // the singular inputDataClass/inputDataZone pair above, which stays
  // required so every existing single-input caller is unaffected: a
  // single-class answer still produces a graph byte-identical to before
  // this field existed.
  inputDataClasses?: DataClass[];
  modelType: ModelType;
  autonomyLevel: 0 | 1 | 2 | 3 | 4;
  processingDataZone: DataZone;
  outputActionType: ActionType;
  outputExposure: Exposure;
  decisionBindingness: DecisionBindingness;
  outputReversibility: 'reversible' | 'irreversible' | 'unknown';
  outputScale: 'limited' | 'at_scale';
  replacesPriorModel: boolean;
  // SR-1 (code review 001): PV-2 and PV-5 were implemented in the engine and
  // unreachable from the product, because vendor was hardcoded and the form
  // never asked. Optional so every existing caller stays valid.
  platform?: string;
  vendor?: string;
  // R11-MG-2 (ADR-IF-R11-MG-1, intake-flow.md §20): which model this use
  // case declares — required on the form path, sourced from the policy's
  // approved-model registry or the "not listed — name it" free-text
  // fallback. Optional on the type so every existing caller stays valid.
  declaredModelId?: string;
  /** Free text, set only when the submitter chose "not listed — name it".
   *  Mirrors decisionTypeOther's pattern — kept separate so a resolved
   *  registry id and a free-typed name never get confused with each other. */
  declaredModelIdOther?: string;
  decisionType?: DecisionType;
  /** Free text, set only when the submitter chose "Something else". Kept
   *  SEPARATE from `decisionType` on purpose: nothing in the policy can match
   *  it, and pretending otherwise would silently under-classify. */
  decisionTypeOther?: string;
  hitl?: boolean;
  // Agentic infrastructure-access questions (2026-08-31, grounded in
  // grounding/proposed-rules/agentic-infrastructure-access.md). Optional —
  // blank means "not stated", never a defaulted safe answer.
  // R16-A1 (PE-9): widened to accept a tick-all list; run through
  // normaliseAccessScope (src/engine/access-scope.ts) before it reaches the
  // graph.
  systemAccessScope?: SystemAccessScope | SystemAccessScope[];
  multiInstanceCoordination?: 'yes' | 'no' | 'unknown';
  jurisdictions: string[];
}

export function buildGraphFromForm(values: StructuredFormValues): DataFlowGraph {
  const processingId = crypto.randomUUID();
  const outputId = crypto.randomUUID();

  // R16-B (UC-10): a distinct class per ticked kind of information becomes
  // its own input node, every one in the destination zone. Falls back to
  // the singular inputDataClass/inputDataZone pair when inputDataClasses is
  // absent or empty, which keeps every pre-R16-B caller's graph unchanged —
  // one element produces the exact same single input node as before.
  const classes =
    values.inputDataClasses && values.inputDataClasses.length > 0
      ? values.inputDataClasses
      : [values.inputDataClass];
  const inputNodes = classes.map((dataClass, i) => ({
    id: crypto.randomUUID(),
    label: i === 0 ? `${values.useCaseName} — input` : `${values.useCaseName} — input ${i + 1}`,
    data_class: dataClass,
    data_zone: values.inputDataZone,
  }));

  return {
    id: crypto.randomUUID(),
    version: 1,
    input_nodes: inputNodes,
    processing_nodes: [
      {
        id: processingId,
        label: values.useCaseName,
        model_type: values.modelType,
        autonomy_level: values.autonomyLevel,
        data_zone: values.processingDataZone,
        // 'internal' remains the sentinel for "no third-party vendor".
        vendor: values.vendor && values.vendor.trim() ? values.vendor : 'internal',
        ...(values.platform ? { platform: values.platform } : {}),
        ...(values.declaredModelIdOther?.trim()
          ? { declared_model_id: values.declaredModelIdOther.trim() }
          : values.declaredModelId?.trim()
            ? { declared_model_id: values.declaredModelId.trim() }
            : {}),
        replaces_prior_model: values.replacesPriorModel,
        // R16-A1 (PE-9): normaliseAccessScope is the single implementation
        // of the validate/canonicalise rule — an invalid answer (should not
        // happen from a closed-option UI, but defensively) is OMITTED, same
        // as never having been answered, rather than carrying a claim the
        // engine never checked (the decision_type_other/hitl discipline).
        ...(values.systemAccessScope !== undefined
          ? (() => {
              const normalised = normaliseAccessScope(values.systemAccessScope);
              return normalised.ok ? { system_access_scope: normalised.value } : {};
            })()
          : {}),
        ...(values.multiInstanceCoordination !== undefined
          ? { multi_instance_coordination: values.multiInstanceCoordination }
          : {}),
      },
    ],
    output_nodes: [
      {
        id: outputId,
        label: `${values.useCaseName} — output`,
        action_type: values.outputActionType,
        exposure: values.outputExposure,
        decision_bindingness: values.decisionBindingness,
        output_reversibility: values.outputReversibility,
        scale: values.outputScale,
        ...(values.decisionType !== undefined ? { decision_type: values.decisionType } : {}),
        // `decision_type` stays undefined here — that is the honest encoding.
        // No policy rule matches free text, so the graph must not claim one
        // does; the engine raises `unclassified_decision_type` from this field
        // instead, and the verdict states the gap.
        ...(values.decisionTypeOther?.trim()
          ? { decision_type_other: values.decisionTypeOther.trim() }
          : {}),
        ...(values.hitl !== undefined ? { hitl: values.hitl } : {}),
      },
    ],
    edges: [
      ...inputNodes.map((n) => ({ from: n.id, to: processingId })),
      { from: processingId, to: outputId },
    ],
    jurisdictions: values.jurisdictions,
    intake_method: 'structured_form',
    extracted_at: new Date().toISOString(),
  };
}
