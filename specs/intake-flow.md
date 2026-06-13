# AIGate — Intake Flow Specification

**Version:** 1.0  
**Date:** June 2026  
**Status:** Draft  
**Covers:** UC-1 through UC-7, UC-3a — intake flow, LLM boundary, graph extraction, fallback structured form, question generation, contradiction detection wiring, graph confirmation and attestation

---

## Expert Panel

| Expert | Work | Role in This Document |
|--------|------|-----------------------|
| Alan Cooper | *About Face* (4th ed., Wiley 2014) | Goal-directed UI — the intake flow serves James (1LoD) who wants minimal friction |
| Dan Abramov / React Core Team | react.dev | Component composition, state lifting for multi-step intake flow |
| Kent C. Dodds | Testing Library (testing-library.com) | Behaviour-first testing of the intake wizard |
| Dan Vanderkam | *Effective TypeScript* (2nd ed., O'Reilly 2024) | Typed graph state, discriminated unions for intake step |
| Stuart Russell | *Human Compatible* (Viking 2019) | Autonomy level treatment — intake must surface L3/L4 signals clearly |

---

## 1. Purpose

This spec defines the intake flow — the multi-step user journey from plain-language description to confirmed data-flow graph. It covers:
- Free-text intake (UC-1)
- Duplicate detection (UC-2)
- LLM graph extraction (UC-3) and structured form fallback (UC-3a)
- Risk-proportionate questioning (UC-4)
- Contradiction detection integration (UC-5)
- Graph confirmation and attestation (UC-6)
- Correction recording (UC-7)

---

## 2. Architecturally Significant Requirements

| ASR | Requirement | Impact |
|---|---|---|
| LLM at input edge only | NF-1, UC-3 | Anthropic SDK called only in `src/llm/graph-extractor.ts`; engine never calls LLM |
| Fallback to form when no API key | UC-3a, NF-3 | Intake flow has two paths; both produce the same graph type |
| Contradiction detection before confirmation | UC-5 | Contradiction check runs after each answer; blocks confirmation if unresolved |
| Attestation is immutable once confirmed | UC-6, NF-2 | Confirmation writes to audit trail via `src/store/audit.ts`; no undo |
| Question count proportionate to risk | UC-4 | Questions generated from tripped risk signals, not a fixed list |

---

## 3. Intake Flow State Machine

The intake flow is a multi-step wizard managed by `IntakeFlow.tsx`. Each step corresponds to a state:

```
STATES:
  description_entry      ← UC-1: user types free-text description
  duplicate_check        ← UC-2: system checks for similar use cases
  graph_extraction       ← UC-3: LLM extracts graph (or UC-3a: structured form)
  graph_review           ← UC-3: user reviews extracted graph, makes corrections (UC-7)
  questionnaire          ← UC-4: targeted questions based on risk signals
  contradiction_review   ← UC-5: surfaced contradictions require resolution
  confirmation           ← UC-6: user confirms graph (attestation)
  evaluation_pending     ← engine is running (< 5s)
  verdict                ← evaluation complete, route to VerdictDisplay

TRANSITIONS:
  description_entry → duplicate_check          (on submit)
  duplicate_check → graph_extraction           (no duplicate found, or user confirms new)
  duplicate_check → [exit — use existing]      (user adopts existing classification)
  graph_extraction → graph_review              (LLM returns graph, or user completes form)
  graph_review → questionnaire                 (user proceeds from graph review)
  questionnaire → contradiction_review         (contradiction detected)
  questionnaire → confirmation                 (all questions answered, no contradiction)
  contradiction_review → questionnaire         (contradiction resolved, continue questions)
  confirmation → evaluation_pending            (user confirms)
  evaluation_pending → verdict                 (evaluate() returns)
```

State is managed with a `useReducer` hook in `IntakeFlow.tsx`. Each state carries typed data:

```typescript
type IntakeState =
  | { step: 'description_entry'; description: string }
  | { step: 'duplicate_check'; description: string }
  | { step: 'graph_extraction'; description: string; method: 'llm' | 'form' }
  | { step: 'graph_review'; graph: DataFlowGraph; graphVersion: number; corrections: GraphCorrection[] }
  | { step: 'questionnaire'; graph: DataFlowGraph; questions: IntakeQuestion[]; answers: QuestionAnswer[] }
  | { step: 'contradiction_review'; graph: DataFlowGraph; contradictions: Contradiction[] }
  | { step: 'confirmation'; graph: DataFlowGraph; graphVersion: number; corrections: GraphCorrection[]; answers: QuestionAnswer[] }
  | { step: 'evaluation_pending'; graph: DataFlowGraph }
  | { step: 'verdict'; verdictId: string };
```

---

## 4. LLM Graph Extraction (UC-3)

### 4.1 Graph extractor interface

```typescript
// src/llm/graph-extractor.ts
export async function extractGraph(
  description: string,
  apiKey: string,
  policyPermittedValues: PolicyPermittedValues  // Enum values from policy file for node labels
): Promise<Result<DataFlowGraph, LlmError>>
```

The function constructs a structured prompt instructing the model to return a JSON object conforming to `DataFlowGraph`. It uses `claude-sonnet-4-6` with `temperature: 0` for consistency.

### 4.2 DataFlowGraph type

```typescript
export interface DataFlowGraph {
  id: string;                  // UUID v4
  version: number;             // Increments with each correction
  input_nodes: InputNode[];
  processing_nodes: ProcessingNode[];
  output_nodes: OutputNode[];
  edges: GraphEdge[];
  jurisdictions: string[];     // Jurisdiction codes active for this use case (extracted with uncertain: true default + mandatory confirmation question)
  intake_method: 'llm' | 'structured_form';
  extracted_at: string;        // ISO 8601
}

export interface InputNode {
  id: string;
  label: string;               // e.g. "Client relationship notes"
  data_class: DataClass;       // From policy permitted values
  data_zone: DataZone;
}

export interface ProcessingNode {
  id: string;
  label: string;               // e.g. "GPT-4 based email drafting model"
  model_type: ModelType;
  autonomy_level: 0 | 1 | 2 | 3 | 4;
  data_zone: DataZone;
  vendor: string;              // "internal" | vendor name
  replaces_prior_model: boolean;  // TRACK-II-REPLACE trigger (RAF §5 rule 3)
  uncertain?: boolean;         // True if LLM could not determine this with confidence
}

export interface OutputNode {
  id: string;
  label: string;
  action_type: ActionType;
  exposure: ExposureLevel;
  decision_bindingness: DecisionBindingness;
  reversibility: 'reversible' | 'irreversible' | 'unknown';
  scale: 'limited' | 'at_scale';  // TIER-CRITICAL trigger when client-/market-facing at scale
}

export interface GraphEdge {
  from: string;   // Node ID
  to: string;     // Node ID
}
```

### 4.3 LLM prompt construction

The prompt includes:
1. The user's description verbatim
2. The permitted values for each enum field (from the policy file — ensures LLM uses the bank's own vocabulary)
3. A JSON schema for the expected response
4. Instruction: return ONLY the JSON, no prose

Nodes the LLM cannot determine with confidence are marked `uncertain: true`. These are displayed with a highlight in `GraphReview.tsx` to prompt the submitter to confirm or correct them.

### 4.4 LLM response parsing

The response is parsed with a Zod schema matching `DataFlowGraph`. If parsing fails (malformed JSON, missing required fields), the extractor returns `{ ok: false, error: { kind: 'parse-error', raw: response } }` and the UI offers to retry or switch to the structured form.

---

## 5. Structured Form Fallback (UC-3a)

### 5.1 When the form is shown

The `usePolicy` hook exposes `hasApiKey: boolean`. If false, `IntakeFlow.tsx` sets `method: 'form'` in the `graph_extraction` state and renders `StructuredForm.tsx` instead of calling the LLM.

A banner is shown: **"Structured intake mode — LLM graph extraction is not configured. Answer the fields below to describe your use case."**

### 5.2 Form fields

The form presents one field per graph attribute. All permitted values come from the loaded policy file (no hardcoded enums):

| Field | Type | Required | Notes |
|---|---|---|---|
| Use case name | Text | Yes | Stored as the use case label |
| Brief description | Textarea | Yes | 1–5 sentences (UC-1 equivalent) |
| Input data class | Select | Yes | Values from policy `data_classes` |
| Input data zone | Select | Yes | Values from policy `data_zones` |
| AI model type | Select | Yes | Values from policy `model_types` |
| Autonomy level | Select (0–4) | Yes | With plain-language descriptions per level |
| Processing data zone | Select | Yes | |
| Output action type | Select | Yes | Values from policy `action_types` |
| Output exposure | Select | Yes | Values from policy `exposure_levels` |
| Decision bindingness | Select | Yes | |
| Output reversibility | Select | Yes | reversible / irreversible / unknown |
| Output scale | Select | Yes | limited / at_scale |
| Replaces prior model | Boolean | Yes | Drives TRACK-II-REPLACE (RAF §5 rule 3) |
| Jurisdictions | Multi-select | Yes | From policy `jurisdictions` |

### 5.3 Form output

On submit, `StructuredForm.tsx` calls `buildGraphFromForm(formValues)` which constructs a `DataFlowGraph` object with `intake_method: 'structured_form'`. This graph is identical in type to an LLM-extracted graph and flows through the same subsequent steps.

---

## 6. Question Generation (UC-4)

After the graph is reviewed and the submitter proceeds, the intake flow generates targeted questions.

```typescript
// src/engine/question-generator.ts (part of the engine, no LLM)
export function generateQuestions(
  graph: DataFlowGraph,
  policy: PolicyFile,
  activePacks: JurisdictionPack[]
): IntakeQuestion[]
```

**Question selection logic:**

1. Check each invariant's condition against the current graph
2. If an invariant's condition is **partially** determinable from the graph (some fields present, some `uncertain: true`), generate a question to confirm the uncertain field
3. Check each pack rule's condition — if fields are uncertain, generate questions
4. Hard lines: if the graph has signals near a hard line condition, generate a clarifying question before flagging a hard line (gives the submitter a chance to correct a misclassified node)

**Question budget (UC-4 fit criterion):**

The generator first runs `assignTier()` on the provisional graph (uncertain fields treated worst-case — assumed most demanding value) to determine the tier-based budget. The provisional tier is recorded in the audit trail as `question_budget_basis`.

- Provisional tier Low → maximum 5 questions
- Provisional tier Medium → maximum 10 questions
- Provisional tier High or Critical → maximum 15 questions
- The generator trims questions to the limit, prioritising questions that resolve the most invariants or hard-line signals

```typescript
export interface IntakeQuestion {
  id: string;
  text: string;                      // Plain-language question
  field: string;                     // Which graph field this resolves
  node_id?: string;                  // Which node in the graph
  triggered_by: string[];            // Invariant IDs or pack rule IDs that drove this question
  answer_type: 'boolean' | 'select' | 'text';
  options?: string[];                // For select questions
}
```

---

## 7. Contradiction Detection Wiring (UC-5)

After each question answer, `IntakeFlow.tsx` calls `detectContradictions()` from `src/engine/contradiction.ts`. If contradictions are returned, the flow transitions to `contradiction_review`.

```typescript
// Called after each answer
const contradictions = detectContradictions(
  state.description,
  [...state.answers, newAnswer],
  state.graph
);

if (contradictions.length > 0) {
  dispatch({ type: 'CONTRADICTIONS_DETECTED', contradictions });
}
```

`ContradictionReview.tsx` shows each contradiction with the two conflicting statements highlighted. The submitter must either:
- Correct one of the values (triggers a graph node update, recorded as a correction per UC-7)
- Confirm that both are correct and explain (rare — recorded as a note in the audit trail)

The flow cannot advance to confirmation while any unresolved contradiction exists.

---

## 8. Graph Correction Recording (UC-7)

```typescript
export interface GraphCorrection {
  correction_id: string;        // UUID v4
  graph_version_before: number;
  graph_version_after: number;
  node_id: string;
  field: string;
  original_value: unknown;       // LLM-extracted or form-entered value
  corrected_value: unknown;
  corrected_by: string;          // Role: "1LoD" / "2LoD"
  corrected_at: string;          // ISO 8601
  reason?: string;               // Optional — from contradiction resolution
}
```

Every correction increments `graph.version`. The audit trail stores both the original extraction and all corrections in order, so the history of the graph's evolution is fully traceable.

---

## 9. Graph Confirmation and Attestation (UC-6)

When the submitter clicks "Confirm and evaluate":

```typescript
// src/store/audit.ts
await audit.append({
  event_type: 'graph_confirmed',
  use_case_id: useCaseId,
  attested_by: role,           // From useRole() hook
  attested_at: new Date().toISOString(),
  graph_id: graph.id,
  graph_version: graph.version,
  corrections_count: corrections.length,
  intake_method: graph.intake_method
});
```

The `evaluate()` function is called synchronously after this audit write. The verdict is written to the audit trail as a second event. The UI transitions to `evaluation_pending` while the engine runs (typically < 200ms for a small policy file).

---

## 10. API Boundary — LLM Extractor Response

The Anthropic SDK call in `graph-extractor.ts` uses structured output (tool_use) to guarantee JSON conformance:

```typescript
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  tools: [{
    name: 'extract_graph',
    description: 'Extract a structured data-flow graph from an AI use case description',
    input_schema: dataFlowGraphZodToJsonSchema()  // Converts Zod schema to JSON Schema
  }],
  tool_choice: { type: 'tool', name: 'extract_graph' },
  messages: [{ role: 'user', content: buildExtractionPrompt(description, permittedValues) }]
});
```

Using `tool_choice: { type: 'tool' }` forces the model to always return the structured tool call — no free-form text fallback.

---

## 11. Requirement Traceability

| Requirement | Coverage |
|---|---|
| UC-1 | §3 state machine `description_entry`; §4.3 prompt includes description |
| UC-2 | §3 `duplicate_check` state; duplicate detection uses LLM semantic comparison (API key present) or keyword match |
| UC-3 | §4 LLM graph extraction |
| UC-3a | §5 structured form fallback |
| UC-4 | §6 question generation; question count limits |
| UC-5 | §7 contradiction detection wiring |
| UC-6 | §9 confirmation + attestation |
| UC-7 | §8 graph correction recording |
| NF-1 | Question generation is pure (engine function, no LLM) |
| NF-3 | LLM called only when API key present; form fallback works offline |

## 12. Test Case References

| Test cases | Spec section |
|---|---|
| TC-UC-1-01 through TC-UC-1-04 | §3, §4.3 |
| TC-UC-2-01 through TC-UC-2-05 | §3 duplicate_check state |
| TC-UC-3-01 through TC-UC-3-03 | §4 LLM extraction |
| TC-UC-3a-01 through TC-UC-3a-04 | §5 structured form |
| TC-UC-4-01 through TC-UC-4-04 | §6 question generation |
| TC-UC-5-01 through TC-UC-5-03 | §7 contradiction detection |
| TC-UC-6-01 through TC-UC-6-03 | §9 confirmation |
| TC-UC-7-01 through TC-UC-7-03 | §8 correction recording |

---

*Developed using the Grounded Vibe Methodology*
