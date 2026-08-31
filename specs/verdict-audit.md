# AIGate — Verdict & Audit Specification

**Version:** 1.0  
**Date:** June 2026  
**Status:** Draft  
**Covers:** VD-1 through VD-8, NF-2, NF-8, RA-11 — verdict display, audit trail store, correction flow, living status, confidence caveats, plain-English reasoning trace

---

## Expert Panel

| Expert | Work | Role in This Document |
|--------|------|-----------------------|
| Martin Kleppmann | *Designing Data-Intensive Applications* (O'Reilly 2017) | Append-only audit store design; schema evolution; data model immutability |
| Martin Fowler | *Patterns of Enterprise Application Architecture* (Addison-Wesley 2002) | Event log pattern; repository pattern for the audit store |
| Michael Keeling | *Design It!* (Pragmatic Bookshelf 2017) | ADR structure; ASR identification |
| George Fairbanks | *Just Enough Software Architecture* (Marshall & Brainerd 2010) | Risk-driven depth — audit correctness is the highest-risk area |
| Dan Vanderkam | *Effective TypeScript* (2nd ed., O'Reilly 2024) | Discriminated unions for audit event types; opaque types for IDs |
| Kent C. Dodds | Testing Library (testing-library.com) | Behaviour-first tests for verdict display and correction flow |

---

## 1. Purpose

This spec defines:
- The `VerdictDisplay` UI (VD-1, VD-2, VD-3, VD-8, RA-11)
- The `AuditStore` IndexedDB wrapper — append-only, no delete/edit API (VD-4, NF-2)
- The `VerdictConditions` and `ConfidenceCaveat` data models (VD-6, VD-7, RA-11)
- The correction flow: user corrects a graph node → re-evaluation → both verdicts preserved (VD-3)
- The plain-English reasoning trace via `src/llm/reasoning-trace.ts` (VD-8, NF-8)
- Policy and pack version stamping in the audit record (VD-5)

The `Verdict` TypeScript interface is defined in `evaluation-engine.md §3.9`. This spec consumes it — it does not redefine it.

---

## 2. Architecturally Significant Requirements

| ASR | Requirement | Architectural Impact |
|---|---|---|
| Append-only audit trail | NF-2, VD-4 | `AuditStore` exposes no `delete` or `update` API; IndexedDB `put` is only used on initial insert |
| Full reasoning chain in audit trail | NF-8 | Every verdict event carries the full regulatory provenance block, not just a verdict ID |
| Plain-English trace requires LLM | VD-8 | Separate `reasoning-trace.ts` LLM call; the engine itself is pure and produces no prose |
| Confidence caveats surface to UI | RA-11 | `ConfidenceCaveat[]` on the `Verdict` object drives UI warnings before the result is shown |
| Both verdicts preserved on correction | VD-3 | Correction appends a new audit event; the original `verdict_produced` event is never modified |
| Living status field in model from V1 | VD-6 | Schema cannot be retrofitted; `living_status` column exists in V1 even though V2 writes it |
| V1 immutability is provisional | NF-2 | Client-side IndexedDB is editable at the OS level; V1 is honest proof-of-concept grade |

---

## 3. Design Decisions

### ADR-006 — Append-only audit store: IndexedDB with write-only helper surface

**Context:** NF-2 requires an immutable audit trail. The evaluation engine produces a `Verdict` and the intake flow produces attestation events. Both must be permanently recorded. V1 is browser-only (no server). True cryptographic immutability requires a server-backed append-only log; that is V1.5.

**Options considered:**
1. **React state only (no persistence)** — trivially mutable, lost on page reload. Rejected.
2. **localStorage** — synchronous, 5MB limit, string-only, structurally awkward for event records. Rejected.
3. **IndexedDB via `idb` library** — async, structured data, no size limit in practice, survives page reload. Application-layer append-only achievable by exposing no delete/edit API on the helper. Cannot prevent a technically sophisticated user from opening DevTools and calling `deleteRecord` directly — honest V1 limitation.
4. **Server-side log (SQLite append-only or Postgres event store)** — true immutability, requires a server. Out of scope for V1 (offline/browser-first requirement).

**Decision:** IndexedDB via `idb`. The `AuditStore` helper exposes only `append(event)` and `getAll(useCaseId)`. No `delete`, `update`, or `clear` method exists on the helper surface. V1 limitation is documented in the UI as a disclaimer.

**Consequences:** Regulators cannot rely on V1 as a system of record. Banks deploying V1 must understand it is proof-of-concept grade. V1.5 adds a minimal server-backed event store (single-file SQLite, trivial to self-host) that preserves the application-layer API.

---

### ADR-007 — Reasoning trace: LLM call post-evaluation, grounded in structured verdict data

**Context:** VD-8 requires a plain-English reasoning trace readable by a non-technical auditor. The evaluation engine is deterministic and pure — it must not call the LLM. A second LLM call after evaluation is the only architecture that preserves engine determinism.

**Options considered:**
1. **Engine produces prose natively** — breaks NF-1 (LLM output is not deterministic). Rejected.
2. **Human-written templates with variable substitution** — deterministic, but brittle for regulatory citations (every jurisdiction combination needs a template). Maintenance cost is prohibitive.
3. **LLM call in `reasoning-trace.ts` after evaluation** — passes `VerdictTraceData` (all structured fields verbatim) and prompts the model to write prose that references them. Non-deterministic prose but deterministic grounding — the LLM can choose word order but cannot invent facts not in the structured data.

**Decision:** Option 3. The prompt explicitly instructs: "Reference only the data provided. Do not infer, interpret, or add information not present in the input." The `VerdictTraceData` object includes all rule IDs, regulatory citations, and threshold values. The trace is stored in the audit record alongside the structured verdict data so that a reviewer can verify the prose against the structured data.

**Consequences:** The reasoning trace is not bit-identical across evaluations of the same verdict. It is grounded (no hallucinated facts) but not deterministic in phrasing. This is acceptable for an auditor-facing summary; the structured verdict data is the ground truth.

---

## 4. Data Models

### 4.1 VerdictConditions (VD-7)

The `conditions` block is the hypothesis schema for V2 monitoring. Populated at verdict time with the bounds the approval is conditional on.

```typescript
// src/types/verdict.ts (extends evaluation-engine.md §3.9)

export interface KriBand {
  green: { lte?: number; gte?: number };
  amber: { lte?: number; gte?: number };
  red:   { gt?: number; lt?: number };
}

export interface VerdictConditions {
  drift_band?: KriBand;                // Performance drift % bands for this use case
  override_rate_band?: KriBand;        // Human override rate bands
  approved_zone: DataZone;             // Use case must stay in this zone
  model_version_pinned?: string;       // If set, this exact version approved; updates require re-evaluation
  max_autonomy_level: 0 | 1 | 2 | 3 | 4;  // Approved autonomy ceiling
  control_ids_required: string[];      // Controls that must remain active
  review_due_date?: string;            // ISO 8601 — next scheduled re-evaluation
  custom_conditions: Record<string, unknown>;  // Policy-defined additional conditions
}
```

In V1, `conditions` is written once at verdict time and never read automatically. V2 connects live KRI feeds that compare runtime metrics against these bounds.

### 4.2 ConfidenceCaveat (RA-11)

```typescript
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceCaveat {
  rule_id: string;
  confidence: ConfidenceLevel;
  ambiguity_description: string;  // Plain-language description of the ambiguity
  // 'medium' → display caveat to submitter
  // 'low'    → verdict status becomes 'provisional', route to legal team
}
```

### 4.3 AuditEvent (append-only log entries)

```typescript
export type AuditEventType =
  | 'use_case_created'
  | 'graph_confirmed'          // UC-6 attestation
  | 'verdict_produced'         // Evaluation engine returned a verdict
  | 'graph_corrected'          // VD-3 correction
  | 'verdict_corrected'        // Re-evaluation after correction
  | 'lifecycle_stage_changed'  // LC-1 transitions
  | 're_evaluation_queued'     // Policy/pack saved — re-eval queued; stage does NOT change here
  | 'twoloD_reviewed'          // LC-3 2LoD action
  | 'duplicate_dismissed'      // UC-2 — a surfaced match was reviewed and set aside
  | 'classification_adopted'   // UC-2 — this record's classification came from another use case
  | 'reasoning_trace_generated' // VD-8 LLM call completed
  | 'rule_dissent_filed'       // FN-009 — a reviewer challenges a rule; advisory, never changes the verdict
  | 'sampling_reviewed'        // R12-AB (ADR-VA-R12-1) — a 2LoD spot review of a deterministically sampled verdict actually happened
  | 'control_ownership_assigned'; // design-vision.md L-6 — an owner + target date assigned to an outstanding control; assignment only, no automation

export interface AuditEvent {
  event_id: string;             // UUID v4
  use_case_id: string;
  event_type: AuditEventType;
  occurred_at: string;          // ISO 8601
  actor: string;                // Role: '1LoD' | '2LoD' | 'system'
  payload: AuditEventPayload;   // Discriminated union — see below
}

export type AuditEventPayload =
  | { type: 'use_case_created'; description: string; intake_method: 'llm' | 'structured_form' }
  | { type: 'graph_confirmed'; graph_id: string; graph_version: number; corrections_count: number; submitter_note?: string; contradiction_resolutions?: string[]; answer_contexts?: string[] } // R6-CX-1: answer contexts, human-read only
  | { type: 'verdict_produced'; verdict: Verdict; reasoning_trace?: string }
  | { type: 'graph_corrected'; correction: GraphCorrection }
  | { type: 'verdict_corrected'; original_verdict_id: string; new_verdict: Verdict; reasoning_trace?: string }
  | { type: 'lifecycle_stage_changed'; from_stage: LifecycleStage; to_stage: LifecycleStage }
  | {
      type: 'twoloD_reviewed';
      action: 'approved' | 'rejected' | 'correction_requested';
      verdict_id: string;
      // Round 4 close-out. The trail previously recorded `actor: role` — the
      // string "2LoD", not a person — so it could not afterwards say who
      // signed. This is NOT authentication: the build has no sign-in, and the
      // page says the name is self-asserted. It records who claimed to be
      // signing, which is the difference between an anonymous approval and an
      // attributable one. Optional on the type so earlier attestations stay
      // readable; the UI refuses to write one without it.
      attested_by_name?: string;
      notes?: string;
    }
  | { type: 'duplicate_dismissed'; candidate_use_case_id: string; candidate_label: string }
  | {
      type: 'classification_adopted';
      adopted_from_use_case_id: string;
      adopted_from_label: string;
      tier: string | null;
      track: string | null;
    }
  | { type: 'reasoning_trace_generated'; verdict_id: string; trace: string }
  // FN-009 (2026-08-15). A challenge to a RULE the verdict relied on, filed
  // by a 2LoD reviewer from the sign-off page. Advisory by construction: the
  // verdict stands, the lifecycle stage does not move, and the dissent feeds
  // the rule-improvement queue (a derived read view over these events — never
  // a second store). verdict_id is threaded from the render, like
  // twoloD_reviewed's (§13.4). rule_label present only when the rule was
  // picked from the verdict's own rationale.
  | {
      type: 'rule_dissent_filed';
      verdict_id: string;
      rule_id: string;
      rule_label?: string;
      dissent: string;
      filed_by_name: string;
    }
  // R12-AB (§15, ADR-VA-R12-1). Written ONLY when a human actually reviews
  // a verdict isSampledForReview() selected — nothing is stored or queued
  // by the sampling check itself, which is re-applied at render time from
  // the verdict id already on screen. verdict_id follows the same
  // threaded-from-render pattern as twoloD_reviewed/rule_dissent_filed.
  | {
      type: 'sampling_reviewed';
      verdict_id: string;
      reviewed_by_name: string;
      outcome_note?: string;
    }
  // design-vision.md L-6 / explore-007 D-003 follow-up. An OUTSTANDING
  // control had no owner, no target date, no age, no overdue signal — a
  // static status a human tracked by hand. This is the honestly-scoped
  // fix: assignment tracking only, no reminders/notifications/ticketing
  // (the app has no backend to run them from). verdict_id follows the same
  // threaded-from-render pattern as twoloD_reviewed/rule_dissent_filed.
  // Re-assigning is a later event for the same control_id; the UI reads
  // the latest.
  | {
      type: 'control_ownership_assigned';
      verdict_id: string;
      control_id: string;
      owner_name: string;
      target_date: string;
    };

**Both added by round 4 (UC-2).** The duplicate check surfaces a match and the
submitter decides; both outcomes are decisions about the inventory and both are
now recorded. Dismissing a match was previously invisible, so nobody could
afterwards distinguish a genuinely new use case from a duplicate waved through.
Adoption records where the classification came from — and the adopted record
deliberately carries **no verdict of its own**, because nothing was evaluated
for it. The sign-off page states that plainly (`register-lifecycle.md` §15.2),
which is the honest reading: a reviewer must be able to see that this
classification was inherited rather than derived.
```

### 4.4 AuditStore interface (`src/store/audit.ts`)

```typescript
export interface AuditStore {
  // ONLY these two methods exist. No delete, update, or clear.
  append(event: AuditEvent): Promise<void>;
  getAll(useCaseId: string): Promise<AuditEvent[]>;
  getAllForExport(): Promise<AuditEvent[]>;  // 2LoD export — RG-4
}
```

The IndexedDB object store is named `audit_events`. Index: `use_case_id` (for `getAll` queries). The `event_id` is the primary key.

Implementation uses `idb` library:
```typescript
const db = await openDB('aigate-audit', 1, {
  upgrade(db) {
    const store = db.createObjectStore('audit_events', { keyPath: 'event_id' });
    store.createIndex('by_use_case', 'use_case_id', { unique: false });
  }
});

// append — the only write path
export async function append(event: AuditEvent): Promise<void> {
  await db.add('audit_events', event);  // add() (not put()) — throws if event_id already exists
}

export async function getAll(useCaseId: string): Promise<AuditEvent[]> {
  return db.getAllFromIndex('audit_events', 'by_use_case', useCaseId);
}
```

Using `db.add()` (not `db.put()`) means duplicate event IDs throw an error rather than silently overwriting. This is the application-layer immutability guarantee.

---

## 5. Verdict Display (VD-1, VD-2, VD-8, RA-11)

### 5.1 VerdictDisplay component structure

`src/components/VerdictDisplay.tsx` renders the verdict after evaluation. Receives `verdict: Verdict` and `auditEvents: AuditEvent[]` as props.

**Layout (VD-1 — visible above the fold):**
```
┌─────────────────────────────────────────────────────┐
│  [APPROVED WITH CONTROLS]  High tier · Track II      │
│  ──────────────────────────────────────────────────  │
│  Binding constraint: PE-DATA-3 — MNPI → Zone A       │
│  [Correct this classification?]                       │
│  ──────────────────────────────────────────────────  │
│  Controls required:  C-ENC-1, C-ZONE-2              │
│  Downstream reviews: InfoSec assessment required     │
└─────────────────────────────────────────────────────┘
```

The verdict status (`approved`, `approved_with_controls`, `rejected`) and tier/track are in an `<h2>` element rendered before any scrollable content. Plain-language labels: "Approved", "Approved with controls", "Rejected" (not the raw enum values).

### 5.2 Binding constraint display (VD-2)

Below the status block:
- Rule ID as a `<code>` element
- Graph path rendered as `inputNode.label → processingNode.label → outputNode.label`
- Plain-language explanation from the `Verdict.reasoning_trace` field (generated by `reasoning-trace.ts`)

### 5.3 Confidence caveats (RA-11)

Before the verdict status is shown, the component checks `verdict.confidence_caveats`:
- If any caveat has `confidence: 'low'`: render a full-page warning block; status shows "Provisional — legal review required". The verdict body is still visible but clearly marked provisional.
- If any caveat has `confidence: 'medium'`: render an inline warning box below the verdict status. The verdict is not provisional but the specific rule is called out.
- `confidence: 'high'` caveats are not shown (no caveat needed).

### 5.4 Reasoning trace (VD-8)

The reasoning trace is displayed in a collapsible `<details>` element below the verdict summary. The trace is stored in the `verdict_produced` audit event's `payload.reasoning_trace` field. If the LLM call failed or no API key is present, the UI falls back to a structured-data summary (rule ID + plain-language equivalent from the policy file's `description` field).

---

## 6. Correction Flow (VD-3)

### 6.1 Flow

From `VerdictDisplay.tsx`, the submitter can click "Correct a classification" which transitions `IntakeFlow.tsx` back to `graph_review` state with a pre-populated correction flag.

State data carried forward:
```typescript
type CorrectionFlowData = {
  originalVerdictId: string;
  graphToCorrect: DataFlowGraph;
  corrections: GraphCorrection[];
};
```

The correction re-enters the `graph_review` → `questionnaire` → `confirmation` → `evaluation_pending` → `verdict` path. The engine evaluates the corrected graph as a fresh call; there is no "partial re-evaluation".

### 6.2 Audit trail on correction

When correction completes, `audit.ts` appends two events in sequence:
1. `graph_corrected` event with the `GraphCorrection` record
2. `verdict_corrected` event with the new `Verdict` and an `original_verdict_id` back-reference

The original `verdict_produced` event is never modified. `getAll(useCaseId)` returns both the original and corrected verdict events. The register view shows the **most recent** verdict status; the audit trail shows the full chain.

### 6.3 Immutability guarantee

The `AuditStore.append()` method is the only write path. Calling `append` twice with the same `event_id` throws because the underlying IndexedDB `add()` operation rejects duplicate keys. This prevents the correction flow from accidentally overwriting the original verdict event.

---

## 7. Reasoning Trace Generator (`src/llm/reasoning-trace.ts`)

```typescript
export interface VerdictTraceData {
  status: Verdict['status'];
  tier: Tier;
  track: Track;
  binding_constraint_id: string;
  binding_constraint_description: string;  // From policy file
  binding_path: string;
  tripped_invariants: TrippedInvariant[];
  controls_required: ControlDetail[];
  downstream_reviews: string[];
  applied_overrides: AppliedOverride[];
  confidence_caveats: ConfidenceCaveat[];
  policy_version: string;
  pack_versions: Record<string, string>;
}

export async function generateReasoningTrace(
  traceData: VerdictTraceData,
  apiKey: string
): Promise<Result<string, LlmError>>
```

**Prompt structure:**
1. System instruction: "You are a regulatory documentation assistant. Write a plain-English reasoning trace that a non-technical bank auditor can follow. Reference only the data below. Do not infer, interpret, or add any information not present in the structured input. Use complete sentences. Cite regulatory documents by name and section where provided."
2. The `VerdictTraceData` object serialised as JSON
3. User instruction: "Write the reasoning trace."

The resulting prose is stored in the `verdict_produced` audit event alongside the structured verdict data. If the LLM call fails (no API key, network error, parse error), the verdict is still stored with `reasoning_trace: null`. The UI falls back to a template-based summary.

**No API key fallback:** If `dangerouslyAllowBrowser` is set but no API key is present, `generateReasoningTrace` returns `{ ok: false, error: { kind: 'no-api-key' } }` without throwing. The verdict display proceeds; the trace section shows: "Narrative summary not generated — this optional plain-English retelling needs an Anthropic API key (Settings). It adds nothing to the outcome above: the rules, citations and required controls shown on this page are the complete basis for the decision." (V2-D: reworded — the trace is an optional narrative layer over an already-complete explanation, not a missing capability.)

---

## 8. API Boundary — Verdict Record (IndexedDB ↔ Register View)

The `AuditStore.getAll(useCaseId)` function returns `AuditEvent[]`. The register view reads the latest `verdict_produced` or `verdict_corrected` event to derive current verdict status.

**Verdict summary record shape** (derived view — not stored separately):
```typescript
interface VerdictSummary {
  use_case_id: string;
  current_status: 'approved' | 'approved_with_controls' | 'rejected' | 'provisional';
  tier: Tier;
  track: Track;
  living_status: 'approved' | 'amber' | 'breached' | 'revoked';
  last_verdict_at: string;       // ISO 8601
  has_correction: boolean;
  policy_version: string;
  confidence_caveats_count: number;
}
```

This shape is computed by `src/store/register.ts` by scanning `AuditEvent[]` — it is not persisted as a separate record. This avoids dual-write inconsistency (Kleppmann, Ch. 11: derived views should be computed, not independently maintained).

---

## 9. Integration Points

| Integrates with | Direction | Contract |
|---|---|---|
| `evaluation-engine.ts` | Consumes `Verdict` | Defined in `evaluation-engine.md §3.9` |
| `src/store/audit.ts` | Produces audit events | `AuditEvent` — §4.3 above |
| `src/store/register.ts` | Consumes audit events | `VerdictSummary` computed view — §8 above |
| `IntakeFlow.tsx` | Bidirectional | Correction flow re-enters intake at `graph_review` state |
| `src/llm/reasoning-trace.ts` | Calls Anthropic API | `VerdictTraceData` → `string` |
| Policy file | Reads `description` fields for fallback display | `PolicyFile` type from `policy-schema.md` |

---

## 10. Error Handling & Edge Cases

| Case | Handling |
|---|---|
| LLM call fails for reasoning trace | Verdict stored with `reasoning_trace: null`; UI shows template fallback |
| `append()` called twice with same `event_id` | IndexedDB `add()` throws `ConstraintError`; logged to console; UI shows error toast |
| IndexedDB unavailable (private browsing) | `openDB` fails; store returns `{ ok: false, error: 'storage-unavailable' }`; UI warns "Audit trail cannot be persisted in this browser mode" |
| Verdict with no confidence caveats | `confidence_caveats: []`; no caveat UI shown |
| Verdict `reasoning_trace` very long | Display in scrollable `<details>` element; no truncation — audit completeness over UX polish |
| Low-confidence verdict sent to legal | Status shown as "Provisional"; submitter cannot advance lifecycle until 2LoD manually updates status via register |

---

## 11. Requirement Traceability

| Requirement | Coverage |
|---|---|
| VD-1 | §5.1 — status, tier, track above the fold |
| VD-2 | §5.2 — binding constraint display with graph path |
| VD-3 | §6 — correction flow; both verdicts in audit trail |
| VD-4 | §4.4 — `AuditStore` exposes no delete/edit API; `add()` not `put()` |
| VD-5 | §4.3 `verdict_produced` event carries `policy_version` and `pack_versions` |
| VD-6 | §4.1 `living_status` in `Verdict` type (via evaluation-engine.md); §8 `VerdictSummary` exposes it |
| VD-7 | §4.1 `VerdictConditions` schema |
| VD-8 | §5.4 reasoning trace display; §7 `reasoning-trace.ts` implementation |
| NF-2 | §3 ADR-006; §4.4 append-only store; V1 limitation documented |
| NF-8 | §7 reasoning trace carries full regulatory provenance from `VerdictTraceData` |
| RA-11 | §4.2 `ConfidenceCaveat`; §5.3 UI rendering logic |

---

## 12. Test Case References

| Test cases | Spec section |
|---|---|
| TC-VD-1-01 | §5.1 VerdictDisplay layout |
| TC-VD-2-01 | §5.2 binding constraint display |
| TC-VD-3-01, TC-VD-3-02 | §6 correction flow and audit trail |
| TC-VD-4-01 | §4.4 audit store — no delete/edit surface |
| TC-VD-5-01 | §4.3 `verdict_produced` event payload |
| TC-VD-7-01 | §4.1 `VerdictConditions` schema |
| TC-VD-8-01 | §7 reasoning trace prose requirements |
| TC-RA-11-01, TC-RA-11-02 | §5.3 confidence caveat rendering |

---

*Developed using the Grounded Vibe Methodology*

---

## 13. Round 3 — Stating What Was Not Checked (R3-JU-3, R3-JU-6)

The verdict must carry two distinct things when no regulatory basis was
applied. They are separate because they address separate readers, and an
implementation providing one has met one requirement, not both.

| | R3-JU-3 — the consequence | R3-JU-6 — the cause |
|---|---|---|
| Reader | The submitter, now | A later reader of the record |
| Form | Prose, in the verdict body | A labelled reason on the verdict |
| Says | "No regulatory rules were applied, so there are no citations" | `no_regulatory_basis` |
| Source | Rendered from `provisional_reasons` | `provisional_reasons` itself |

### 13.1 Absence is never communicated by absence

Before round 3, a verdict with no active packs simply had no REGULATORY
REASONING CHAIN panel. A reader could not distinguish "no regulation applies
here" from "we did not check" from "the panel failed to render". All three look
identical: nothing.

R3-JU-3 requires the explanation to be **present**, not the panel to be absent.
The assertion in TC-R3-JU-3-01 is therefore on the presence of a statement, and
TC-R3-JU-3-03 asserts the converse — a verdict with active packs carries no such
statement.

### 13.2 Rendering the reasons

Where `provisional_reasons` is non-empty, the verdict states each reason it
contains. Where both are present, both are stated (TC-R3-JU-6-03). The
`unsigned_pack_rules` reason keeps its existing NF-7 wording; the
`no_regulatory_basis` reason is new.

The two must be textually distinguishable, not merely both present under one
"Provisional" banner. A reader must be able to tell, without opening the policy,
whether rules were applied and not yet adopted, or not applied at all.

### 13.2a Policy-authored content is rendered as text, never as markup (I-6)

**Design review round 1, I-6.** R3-RD-1 puts policy-authored strings —
`source_text`, control evidence detail, invariant descriptions, standing
conditions — onto a second rendering surface. Pack content is human-authored
and partly external in origin; `eu-ai-act.yaml` says in its own header that its
text has not been verified by a lawyer.

Today nothing is interpreted as markup, because JSX interpolates children as
text and `dangerouslySetInnerHTML` appears nowhere in `src/`. But that is a
framework default, not a stated rule, and TC-R3-RD-5-01 is a single test — a
test is not a control.

**Invariant:** all content sourced from `PolicyFile` or a `JurisdictionPack` is
rendered as plain text through JSX child interpolation. `dangerouslySetInnerHTML`
and any markdown or HTML renderer are prohibited on those fields. A future
change adding markdown rendering for quoted `source_text` — plausible, since it
already renders inside a blockquote — must not apply it to pack-sourced fields.

### 13.3 Constraint — the verdict-query collision (HR3-08)

Existing UI tests assert the verdict screen with a single-match
`/approved|rejected/i` query. Round 3 adds rendered strings here and, via
`register-lifecycle.md` §15, puts the verdict status on a second screen for the
first time. Any new string introduced by §13 must avoid the words "approved" and
"rejected", and the register-side queries must be tightened before that change
lands. This is a build-ordering constraint, recorded here so it is not
discovered by a red suite.

### 13.4 The sign-off event must name the verdict it attests to (R3-RD-3)

**Design review round 1, C-1.** The `twoloD_reviewed` payload is
`{ type, action, notes? }` — it carries no reference to the verdict being
signed off. R3-RD-3's fit criterion ("the audit event written on sign-off
refers to that same verdict") is therefore unimplementable as the schema
stands, and TC-R3-RD-3-02 could only be written vacuously.

The payload gains `verdict_id: string`, following the pattern the schema
already uses — `verdict_corrected.original_verdict_id` and
`reasoning_trace_generated.verdict_id`. The value is the id of the verdict the
page actually rendered, threaded from the render, **not** re-derived by a
second "latest event" lookup at write time. A second lookup would reintroduce
precisely the race this closes.

**The race it closes.** Without the id, a `verdict_corrected` event landing
between the page's load and the reviewer's click means the attestation is
recorded against whatever is current, with nothing recording what the reviewer
saw. It could never afterwards be established — for or against — which verdict
was attested. For an attestation this product frames as carrying legal weight,
that is the defect, not an edge case.

Where the rendered verdict's id no longer matches the latest verdict-bearing
event at write time, the write is refused and the reviewer is told the verdict
changed while they were reading, rather than silently attesting to the new one.

### 13.5 Traceability

| Requirement | Section | Test cases |
|---|---|---|
| R3-JU-3 | §13, §13.1 | TC-R3-JU-3-01, -02, -03 |
| R3-JU-6 | §13.2 | TC-R3-JU-6-01 … -04 |

## 14. Round 10 — Speaking the Reviewer's Language (R10)

Spec for `requirements/requirements-010.md`. Standard 2LoD concepts in
AIGate's own design language; no engine decision change anywhere.

**ADR-VA-R10-1 — the memo is presentation, generated from persisted
data, writing nothing.** `src/components/challenge-memo.ts` (Rule 4:
presentation) exports a pure `buildChallengeMemo(...)` → markdown string,
assembled ONLY from the verdict object, the register summary, and the
audit events already on screen — no store reads of its own, no writes
(R10-NF-1). Download via Blob from both the intake verdict screen and the
2LoD sign-off page. Appetite vocabulary throughout; every honesty marker
(provisional causes, evidence status, name-not-verified) is carried
verbatim — a memo that flatters the record would be the exact overclaim
this product refuses.

**ADR-VA-R10-2 — inherent/residual are LABELS on the existing
computation.** The verdict already shows the position before controls
(tripped rules) and with the minimal set (status + controls). R10-IR adds
the standard vocabulary as framing labels only; nothing is recomputed.

**ADR-VA-R10-3 — evidence grows two optional axes, backward compatible.**
`ControlVerificationEvidence` gains optional `design` and `operating`
sub-assessments ({ status: 'effective' | 'deficient' | 'not_assessed',
detail? }). Legacy single-status evidence remains valid and renders
unchanged; where axes are present the UI renders two chips (COSO
vocabulary). VERIFIED continues to mean what it means — operating
evidence exists.

## 15. Round 12 — Sampling, Cause Families, the Memo Hash (R12-AB, R12-BD-3, R12-MISC-1)

Spec for `requirements/requirements-012.md`.

**ADR-VA-R12-1 — the sampling queue is a pure selection over verdict ids;
the trail records reviews, never selections.** `isSampledForReview(
verdictId, samplingRate)` — a deterministic hash-mod-K over the verdict
id (stable across sessions, no randomness anywhere near the engine). The
2LoD register view derives "sampling review due" by applying the function
at render time to self-served Low-tier verdicts; nothing is written until
a human actually reviews, which appends a `sampling_reviewed` audit event
(append-only idiom, in-flight ref guard, same as every other 2LoD write).
Selection-at-render + event-on-review means the queue needs no stored
state and can never drift from the trail.

**ADR-VA-R12-2 — provisional causes render in two families, mapped in
presentation only.** Sign-off gaps (closeable paperwork):
`unsigned_pack_rules`, unattested translation. Substantive caveats:
`no_regulatory_basis`, `unclassified_decision_type`. The engine's
`provisional_reasons` enum is unchanged — the family mapping is a
presentation-layer table, and the register's pilot line ("N of M would be
final once sign-offs land") counts verdicts whose ONLY causes are in the
sign-off-gap family.

**ADR-VA-R12-3 — the memo carries a policy content hash the CALLER
computes.** `buildChallengeMemo` stays synchronous and pure; it accepts
an optional `policyHash` string the caller derives (SHA-256 over the
active policy YAML via WebCrypto) and prints it in the header. Absent =
legacy call sites, line reads "not computed". The memo is thereby tied to
the enforced ruleset, not a paraphrase (Power's audit-ritual risk, A-5).

## 16. Changelog

| Date | Change |
|---|---|
| 2026-08-18 | §15 added — round 12. ADR-VA-R12-1 (stateless deterministic sampling queue), ADR-VA-R12-2 (provisional cause families in presentation), ADR-VA-R12-3 (caller-computed policy hash on the memo). |
| 2026-08-17 | §15 added — round 10. Challenge-memo export as pure presentation (ADR-VA-R10-1), inherent/residual as labels (ADR-VA-R10-2), two-axis evidence backward compatible (ADR-VA-R10-3). |
| 2026-07-29 | §13 added — round 3. The verdict states both the consequence (prose, for the submitter) and the cause (labelled reason, for the record); they are separate assertions because they serve separate readers. |
