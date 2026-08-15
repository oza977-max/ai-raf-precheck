import type {
  ActionType,
  DataClass,
  DataFlowGraph,
  DataZone,
  DecisionBindingness,
  DecisionType,
  Exposure,
  ModelType,
} from './types';

// UC-3a structured form output (intake-flow.md §5.3). Pure — no I/O, same
// rule as the rest of src/engine/*. Produces the same DataFlowGraph shape
// the LLM path produces for a simple single-input/single-model/single-output
// case (the form doesn't collect edge topology).
export interface StructuredFormValues {
  useCaseName: string;
  description: string;
  inputDataClass: DataClass;
  inputDataZone: DataZone;
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
  decisionType?: DecisionType;
  /** Free text, set only when the submitter chose "Something else". Kept
   *  SEPARATE from `decisionType` on purpose: nothing in the policy can match
   *  it, and pretending otherwise would silently under-classify. */
  decisionTypeOther?: string;
  hitl?: boolean;
  jurisdictions: string[];
}

export function buildGraphFromForm(values: StructuredFormValues): DataFlowGraph {
  const inputId = crypto.randomUUID();
  const processingId = crypto.randomUUID();
  const outputId = crypto.randomUUID();

  return {
    id: crypto.randomUUID(),
    version: 1,
    input_nodes: [
      {
        id: inputId,
        label: `${values.useCaseName} — input`,
        data_class: values.inputDataClass,
        data_zone: values.inputDataZone,
      },
    ],
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
        replaces_prior_model: values.replacesPriorModel,
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
      { from: inputId, to: processingId },
      { from: processingId, to: outputId },
    ],
    jurisdictions: values.jurisdictions,
    intake_method: 'structured_form',
    extracted_at: new Date().toISOString(),
  };
}
