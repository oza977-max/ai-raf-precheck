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
  duplicate_check → [exit — use existing]      (user adopts existing classification — 1LoD sees only "a similar use case exists — tier High; contact 2LoD to adopt its classification"; full detail 2LoD only per RG-2)
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
// src/llm/graph-extractor.ts (signature as actually built, P4-C01 — the
// API key is read internally via getApiKey(), and permitted values come
// from src/engine/canonical-vocabulary.ts's shared runtime constants,
// not a caller-supplied parameter)
export async function extractGraph(
  description: string
): Promise<LlmResult<DataFlowGraph>>
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
  exposure: Exposure;
  decision_bindingness: DecisionBindingness;
  output_reversibility: 'reversible' | 'irreversible' | 'unknown';
  scale: 'limited' | 'at_scale';  // TIER-CRITICAL trigger when client-/market-facing at scale
  decision_type?: DecisionType;   // Drives HL-003/HL-004/TIER-CRITICAL/TIER-HIGH decision_type triggers
  hitl?: boolean;                 // Human-in-the-loop present — drives HL-003
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

A banner is shown: **"Guided intake — answer the fields below to describe your use case. No AI is involved in reading your answers or in the decision that follows, so the same answers always produce the same outcome. (Adding an API key in Settings unlocks an optional plain-English alternative to this form; it changes how the description is read in, not how it is scored.)"**

(V2-D: reworded. The original text framed the no-key route as a missing
feature; it is the primary, deterministic intake path and the only one a
tester without a key can use.)

### 5.2 Form fields

The form presents one field per graph attribute.

**V2-E — labels are business questions, values are canonical.** The
original labels in this table were the engine's own field names, and the
options were raw enum values ("Zone B", "agentic", "non-binding"). User
feedback: *"not very business friendly — how will they know all this?"* A
front-office submitter cannot answer "output reversibility".

The fix is presentation-only. The **values** submitted are unchanged and
remain the canonical vocabulary (policy-schema.md §3.0) — they are what
policy rules match on, and changing them would break every rule. Only the
words the user reads changed. Each option keeps its canonical term in
parentheses so a model-validation reader can map an answer back to the
vocabulary the policy and verdict are written in. Copy lives in
`src/components/field-copy.ts`.

| Question shown | Underlying field | Type | Required | Notes |
|---|---|---|---|---|
| What do you want to call it? | use case name | Text | Yes | Stored as the use case label |
| In a sentence or two, what does it do? | description | Textarea | Yes | 1–5 sentences (UC-1 equivalent) |
| What kind of information does it use? | input data class | Select | Yes | Canonical `DATA_CLASSES` |
| Where does that information sit today? | input data zone | Select | Yes | Canonical `DATA_ZONES` |
| What kind of AI is it? | model type | Select | Yes | Canonical `MODEL_TYPES` |
| How much can it do without a person? | autonomy level | Select (0–4) | Yes | Plain-language description per level |
| Where does the AI itself run? | processing data zone | Select | Yes | Help text flags the storage-vs-processing trap |
| What does it actually produce or do? | output action type | Select | Yes | Canonical `ACTION_TYPES` |
| Who sees what it produces? | output exposure | Select | Yes | Canonical `EXPOSURES` |
| How much weight does its output carry? | decision bindingness | Select | Yes | Help text asks for practice, not process |
| If it gets something wrong, can it be undone? | output reversibility | Select | Yes | reversible / irreversible / unknown |
| How widely is it used? | output scale | Select | Yes | limited / at_scale |
| What kind of decision does it feed? | decision type | Select | No | Canonical `DECISION_TYPES` |
| Does a person check it before anything happens? | hitl | Select | No | |
| It replaces something we already use | replaces prior model | Boolean | Yes | Drives TRACK-II-REPLACE (RAF §5 rule 3) |
| Which countries or regions does it touch? | jurisdictions | Multi-select | Yes | From policy `jurisdictions` |

The submit button reads **"Continue"**, not "Build graph" — the user is
describing a use case, not constructing a data structure.

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
| UC-2 | §3 `duplicate_check` state; 1LoD sees only redacted match ("a similar use case exists — tier High; contact 2LoD to adopt its classification"); full match detail is 2LoD-only (RG-2) |
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

---

## 13. Round 3 — Jurisdiction Completeness (R3-JU)

Round 3 closes a defect found by exploratory charter 004: the jurisdiction
fieldset exists and is offered, but nothing requires an answer. The completeness
predicate tests the selected set for presence only, and an empty array is
truthy, so the form advances with nothing ticked. The user then attests to a
graph reading "JURISDICTIONS — None specified" and receives a verdict with no
packs, no regulatory chain and no citations, with nothing saying so.

### ADR-IF-R3-1 — The answered-state lives on the form, not on the graph

**Status:** Accepted

**Context.** R3-JU-1 requires the form to distinguish three states: not
answered, answered "none / not sure", and one or more jurisdictions selected.
`DataFlowGraph.jurisdictions` is `string[]`. An empty array cannot express the
difference between the first two, and that difference is the requirement.

**Options considered.**

1. **Widen the graph** — add an answered flag to `DataFlowGraph`. Rejected: the
   graph is the engine's input contract, and by the time the engine sees it the
   question has necessarily been answered. "Not answered" is a state of an
   in-progress form, never of a confirmed graph. Adding it would leak a
   presentation concern across the boundary in `cross-cutting.md` §7 and change
   the contract every existing engine test asserts against.
2. **Sentinel value in the array** — e.g. `["__none__"]`. Rejected: every
   consumer of `jurisdictions` — `resolveActivePacks`, the confirm screen, the
   verdict provenance block — would need to know the sentinel, and one that
   forgot would treat it as a jurisdiction code that matches no pack. A silent
   wrong answer rather than a loud one.
3. **Form-level answered-state** — the intake form carries the answered flag in
   its own state and its persisted draft; the graph continues to carry only the
   selected codes. **Chosen.**

**Decision.** The answered-state is form state. `buildGraphFromForm` continues
to emit `jurisdictions: string[]`, unchanged, and "answered: none" emits `[]`.
The engine's input contract is untouched.

**Consequences.** The distinction exists only while the form is open and in the
persisted draft — which is exactly the scope that needs it. It also means the
engine cannot distinguish "answered none" from a programmatically constructed
graph with no jurisdictions; both correctly produce the same verdict, because
in both cases no regulatory basis was applied. That equivalence is intended, not
a gap.

### 13.1 The three answered-states

| State | Selected set | Continue | How reached |
|---|---|---|---|
| Not answered | `[]` | **Disabled** | Initial state of a new form; a pre-round-3 draft (§13.4) |
| Answered: none | `[]` | Enabled | User explicitly chooses "none / not sure" |
| Answered: selected | one or more codes | Enabled | User ticks at least one jurisdiction |

Deselecting the last ticked jurisdiction returns the question to
**answered: none**, not to *not answered* (TC-R3-JU-1-05). A user who ticks and
unticks has engaged with the question; silently returning them to a blocked
state with no explanation would be a worse defect than the one being fixed.

**Design review round 1, I-7 — the field is pinned here.** Three chunks
(P8-C01, P8-C02, P8-C03) touch this state, potentially in parallel, so the
shape is fixed in the spec rather than left to whoever builds first:
`jurisdictionAnswer: 'unanswered' | 'none' | 'selected'`, held in the form's
own state and its persisted draft, **alongside** `Partial<StructuredFormValues>`
and not inside it — `buildGraphFromForm` consumes `StructuredFormValues` and
must not see a form-only concern (ADR-IF-R3-1).

**Design review round 1, I-11 — a boundary this builds on.** `intake-draft.ts`
performs `sessionStorage` I/O from `src/components/`, which `cross-cutting.md`
§7 reserves for `src/store/`. That crossing predates round 3. R3-JU-7 extends
it rather than correcting it, knowingly: moving draft persistence into
`src/store/` is a refactor of shipped code that round 3 did not scope. Recorded
here so it is a decision on the record, not a blind spot.

### 13.2 The "none / not sure" control

Rendered as part of the same fieldset, not as a separate question. Choosing it
clears any selected jurisdictions; ticking a jurisdiction clears it. The two are
mutually exclusive by construction rather than by validation.

The label is a plain-language question, per the §5.2 convention: the submitter
is told what the answer controls, not what the field is called.

### 13.3 Required-field marking (R3-JU-5)

Every field whose absence disables Continue carries **both** a visible
required-marker and `aria-required="true"`. The two sets — fields that block
progress, and fields that are marked — must be identical in both directions
(TC-R3-JU-5-01). Marking every field, including the optional platform and vendor
selects, fails the requirement as surely as marking none: it tells the user
nothing.

**Design review round 1, I-8.** `isComplete` is a hand-written boolean
conjunction, so "the set of fields that block progress" is not enumerable and
the test cannot check set equality without hardcoding the same list a second
time — recreating, in test code, exactly the un-synced duplication this
requirement exists to prevent. A single required-field list is therefore the
source of truth: `isComplete` derives from it, the markers render from it, and
the test reads it. P8-C02 budgets that refactor; it is not incidental work.

### 13.4 Draft migration (R3-JU-7)

`loadFormDraft` may return a draft persisted before round 3, carrying a
`jurisdictions` array and no answered-state. Such a draft loads as **not
answered**, regardless of whether its array is empty or populated.

The populated case is the dangerous one and the reason this is a requirement
rather than an implementation note: a draft with `["UK"]` already in it looks
answered. Accepting it would re-open the round-3 defect for every user holding a
draft, invisibly — they would never see the question they had not answered.

### 13.5 Traceability

| Requirement | Section |
|---|---|
| R3-JU-1 | §13.1, ADR-IF-R3-1 |
| R3-JU-4 | §13.2 |
| R3-JU-5 | §13.3 |
| R3-JU-7 | §13.4 |

| Test cases | Covers |
|---|---|
| TC-R3-JU-1-01 … -05 | §13.1 three states and the deselect boundary |
| TC-R3-JU-4-01 | §13.2 help text |
| TC-R3-JU-5-01, -02 | §13.3 required marking, both directions |
| TC-R3-JU-7-01, -02 | §13.4 draft migration |

R3-JU-2, R3-JU-3 and R3-JU-6 are specified in `evaluation-engine.md` §12 and
`verdict-audit.md` §10 — they concern the verdict, not the form.

## 15. Round 5 — Explainable Graph Review (R5-GR / R5-GX)

Spec for `requirements/requirements-005.md`. Presentation and orchestration
only: the engine's input contract, `evaluate()`, and the audit schema are
unchanged (R5-NF-1).

### 15.1 Field meanings and consequences (R5-GR-1)

The single source of plain-English value meanings is
`src/components/field-copy.ts` — the same table the guided form already
renders, so the two surfaces cannot drift apart. GraphView renders, for each
decision-bearing field: the meaning of the current value, plus a static
per-FIELD consequence line (new `FIELD_CONSEQUENCES` map in field-copy.ts,
e.g. data_zone → "Hard lines and zone rules read this field; Zone A is the
strictest case"). Consequences are per field, not per value — a per-value
consequence would be re-deriving rule behaviour in copy, which drifts.
Missing label maps (reversibility, scale, HITL, decision type) are added to
field-copy.ts.

### 15.2 Per-node confirmation gate (R5-GR-2, R5-GR-3) — ADR-IF-R5-1

**Decision: confirmation is per NODE, recorded in the reducer, LLM path
only.** Requirements allowed per-node or per-field; per-node is chosen
because a node is the unit the reviewer reads (a card), the unit uncertainty
is flagged at (`uncertain` is node-level), and per-field would put 12+
clicks between the user and every graph — fatigue that produces blind
clicking, the failure R5 exists to reduce.

Mechanics: `graph_review` state carries `confirmed_node_ids: string[]`
(absent on the form path — `intake_method` gates the whole feature, matching
R5-GR-2's exemption). New reducer action `NODE_CONFIRMED { nodeId }`. A
correction via the existing CORRECTION_APPLIED path ALSO marks the node
confirmed — editing is stronger evidence of review than a Confirm click.
`handleProceedFromGraphReview` refuses (plain-English message, no state
change) while any node id is unconfirmed. Uncertain nodes use the same
mechanism with louder chrome and their own copy; since confirmation is
per-node, "no en-bloc confirm" (R5-GR-3) holds by construction. The
confirmations are ephemeral review state — NOT persisted to the audit
trail; the existing `graph_confirmed` attestation remains the recorded
act, and now attests a graph every node of which was individually
confirmed.

### 15.3 Plausibility warnings (R5-GR-4)

`src/engine/plausibility.ts` — pure function
`plausibilityWarnings(description, graph): PlausibilityWarning[]`
(`{ node_id, field, message }`). Same fixed-signal-table idiom as
`contradiction.ts`, but ADVISORY: rendered as flags on the affected node in
GraphView, never blocking, never mutating. Signal pairs are added ONLY from
observed misreads (each carries a comment naming the run that motivated
it); this table is evidence-driven by policy, like the rule-improvement
queue. Initial pairs: internal/on-prem wording vs Zone A/B; train/fine-tune
wording vs any action_type; "reviews every"/"human approves" vs hitl:false
or autonomy ≥3; "no human"/"fully automated" vs autonomy ≤1.

### 15.4 Jurisdiction hygiene (R5-GX-1) — ADR-IF-R5-2

**Decision: filtered in the intake orchestration layer (IntakeFlow), not in
src/llm/.** The recognised-jurisdiction set comes from the loaded policy's
`jurisdictions:` list; `src/llm/*` has no policy access and giving it any
would couple the extraction edge to policy loading. After a successful
extraction, IntakeFlow partitions `graph.jurisdictions` against the policy
set; unrecognised values are removed from the graph and carried as
`ignored_jurisdictions` in review state, rendered by GraphView as
"ignored — not a recognised jurisdiction". The filter runs before the human
sees the graph, so the attested graph never contains junk jurisdictions.

### 15.5 Hygiene hint (R5-GR-5)

Static conditional in GraphView: two or more processing nodes → one
informational line. No heuristics beyond the count.

## 14. Changelog

| Date | Change |
|---|---|
| 2026-07-29 | §13 added — round 3 jurisdiction completeness (R3-JU). ADR-IF-R3-1 places the answered-state on the form rather than the graph, leaving the engine's input contract unchanged. |
| 2026-08-16 | §15 added — round 5 explainable graph review. ADR-IF-R5-1 (per-node confirmation, reducer-held, LLM path only), ADR-IF-R5-2 (jurisdiction filter in orchestration, not src/llm). |
