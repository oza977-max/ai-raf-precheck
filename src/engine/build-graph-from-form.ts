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
  decisionType?: DecisionType;
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
        vendor: 'internal',
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
        decision_type: values.decisionType,
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
