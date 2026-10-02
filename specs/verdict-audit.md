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
- The `AuditStore` IndexedDB wrapper — append-only, with one bounded, user-confirmed exception for hand-off replace (VD-4, NF-2, RG-8 — §4.4, §16)
- The `VerdictConditions` and `ConfidenceCaveat` data models (VD-6, VD-7, RA-11)
- The correction flow: user corrects a graph node → re-evaluation → both verdicts preserved (VD-3)
- The plain-English reasoning trace via `src/llm/reasoning-trace.ts` (VD-8, NF-8)
- Policy and pack version stamping in the audit record (VD-5)

The `Verdict` TypeScript interface is defined in `evaluation-engine.md §3.9`. This spec consumes it — it does not redefine it.

---

## 2. Architecturally Significant Requirements

| ASR | Requirement | Architectural Impact |
|---|---|---|
| Append-only audit trail, with one bounded exception | NF-2, VD-4, RG-8 | `AuditStore` exposes no general `delete` or `update` API; the sole exception is the user-confirmed hand-off replace (§4.4, §16), gated by full import verification and a two-step UI confirmation |
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

**Decision:** IndexedDB via `idb`. Every write path used in day-to-day operation is append-only: `append(event)` adds one event (`db.add()`, never `put()` — a duplicate `event_id` throws rather than overwriting), and the read paths (`getAll`, `getAllForExport`) never mutate. There is exactly one bounded exception, added for the RG-8 hand-off feature (§16): `backupAndReplaceAllRawEvents`, reachable only from a user-confirmed replace of a bundle that has already passed full import verification, only after a two-step UI confirmation, and which captures what it discards inside the same queued step that replaces it (§16.8). V1's remaining limitation — this is still a client-side store a technically sophisticated user could edit at the OS level — is documented in the UI as a disclaimer.

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
  | 'control_ownership_assigned' // design-vision.md L-6 — an owner + target date assigned to an outstanding control; assignment only, no automation
  | 'control_evidence_attested'; // RG-9 — a named reviewer attests a control is in place, with an evidence note; a human claim on the record, NOT machine-verified

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
    }
  // RG-9 (2026-09-01; relabelled from RG-7 — see the amendment note after
  // this type). A named reviewer's attestation, on the register, that
  // a control is in place, with a free-text evidence pointer. Distinct from
  // the policy's machine/hand-edited verification_evidence.status: this is a
  // self-asserted human claim ("name not verified", no sign-in) rendered as
  // "attested (not verified)", NEVER as machine-verified. No file upload — a
  // client-side store holds the claim and the pointer, not the evidence, and
  // must not pretend otherwise (NF-2/L-3). Re-attesting is a later event; the
  // UI reads the latest per control_id per verdict.
  | {
      type: 'control_evidence_attested';
      verdict_id: string;
      control_id: string;
      attested_by_name: string;
      evidence_note: string;
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

**Amended 2026-09-28 (code review 005).** The `control_evidence_attested`
event above is RG-9. It was first built and committed under the label
"RG-7" (commit `6023103`), which collided with this product's existing,
unrelated RG-7 (periodic sampling cadence, V2+, unbuilt) — see
`requirements/requirements.md`'s own amendment note for the matching RG-8
(hand-off) relabelling. The commit message is permanent history and keeps
the old label; every reference in this spec has been updated to RG-9.

### 4.4 AuditStore interface (`src/store/audit.ts`)

```typescript
export interface AuditStore {
  // The append-only surface used day to day. append() and the two export
  // reads never mutate; a duplicate event_id on append() throws (db.add(),
  // never put()) rather than overwriting.
  append(event: AuditEvent): Promise<void>;
  getAll(useCaseId: string): Promise<AuditEvent[]>;
  getAllForExport(): Promise<AuditEvent[]>;  // 2LoD export — RG-4; also used by the hand-off bundle (RG-8, §16)

  // The hand-off MERGE path (RG-8, §16.5). Appends a verified continuation
  // onto the existing chain — it never rewrites, reorders, or removes an
  // existing event, only extends the trail, inside the same write queue as
  // every other write (§16.6).
  importTailIfContinues(bundleEvents: readonly AuditEvent[]): Promise<ImportTailOutcome>;

  // The ONE bounded exception (RG-8 hand-off replace, §16.8) — reachable
  // only from replaceWithBundle(), only on a bundle that has already passed
  // full import verification (§16.3), and only after the user completes the
  // two-step UI confirmation ("Save a backup of mine first", then "I have
  // my backup — replace my register"). Reads what is about to be discarded
  // and installs `events` in the SAME queued step, so nothing else can
  // write in the gap between the two. This is the only function in this
  // module that can remove an event that was ever successfully appended.
  backupAndReplaceAllRawEvents(events: readonly AuditEvent[]): Promise<AuditEvent[]>;
}
```

The IndexedDB object store is named `audit_events`. Index: `use_case_id` (for `getAll` queries). The `event_id` is the primary key.

```typescript
const db = await openDB('aigate-audit', 1, {
  upgrade(db) {
    const store = db.createObjectStore('audit_events', { keyPath: 'event_id' });
    store.createIndex('by_use_case', 'use_case_id');
  }
});
```

`append()` resolves the monotonic `occurred_at`, looks up the current chain tip, computes this event's hash, and calls `db.add('audit_events', event)` — `add()`, never `put()`, so a duplicate `event_id` throws `ConstraintError` instead of silently overwriting. `importTailIfContinues()` uses the same `db.add()` per event, for the same reason. `backupAndReplaceAllRawEvents()` is the only function in this module that calls `clear()` on this store, and it does so only inside the one queued step described above — see §16.8 for the full hand-off replace flow this is part of.

**The guard test is an allowlist, not a keyword search.** TC-NF-2-01 / TC-VD-4-01 (`src/store/register.test.ts`) asserts that the set of names `audit.ts` exports equals an exact, explicit list — `append`, `getAll`, `getAllForExport`, `importTailIfContinues`, `backupAndReplaceAllRawEvents`, `verifyChain`, `verifyChainOf`, `sha256Hex`, plus two test-only reset helpers. Before code-review-005 (F7), this test was a keyword blocklist (`'update'`, `'delete'`, `'remove'`, `'edit'`, `'clear'`, `'put'`), which a function named `backupAndReplaceAllRawEvents` evaded by name alone — a blocklist can only catch names someone thought to list. An allowlist inverts the failure mode: any new write path, whatever it is called, fails this test until someone adds it to the list on purpose.

---

## 5. Verdict Display (VD-1, VD-2, VD-8, VD-9, VD-10, RA-11)

### 5.1 VerdictDisplay component structure

`src/components/VerdictDisplay.tsx` renders the verdict after evaluation. Receives `verdict: Verdict` and `auditEvents: AuditEvent[]` as props.

**Layout, amended by R16 chunk D1 (VD-9, VD-10) — the page is now two parts, in this order:**

1. **The first screen** (§5.5/§5.6) — plain language only, no engine vocabulary or bare codes (NF-11): a headline answering "can I start, and what has to happen first"; why, in at most two reasons; the submitter's own next steps; the safeguards that must be in place (yours first); the checks other teams run; who signs off; what could still change it; and a correct-your-answers link, on every verdict.
2. **The reviewer section** (§5.7) — a single fold, collapsed by default for the submitter and open by default for a 2LoD reviewer, titled "The full reasoning — every rule checked, the evidence, the sources, and the reviewer's actions", containing everything the page showed before this round, unchanged: the layout below, §5.2's binding constraint, §5.3's confidence caveats, §5.4's reasoning trace, the control evidence panel, the regulatory reasoning chain, provenance, and platform/vendor inheritance.

**The reviewer section's own layout (VD-1's original fit criterion — "visible above the fold, never behind a fold" — applied to THIS section before VD-9 amended it for a first-time reader; see the round-16 amendment note in `requirements/requirements.md`):**
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

The verdict status (`approved`, `approved_with_controls`, `rejected`) and tier/track are in an `<h2>` element, still plain-language-labelled ("Approved", "Approved with controls", "Rejected" — not the raw enum values) — this heading is simply no longer the first thing on the page.

### 5.2 Binding constraint display (VD-2)

Below the status block (now inside the reviewer section, §5.7):
- Rule ID as a `<code>` element
- Graph path rendered as `inputNode.label → processingNode.label → outputNode.label`
- Plain-language explanation from the `Verdict.reasoning_trace` field (generated by `reasoning-trace.ts`)

### 5.3 Confidence caveats (RA-11)

Inside the reviewer section (§5.7), the component checks `verdict.confidence_caveats`:
- If any caveat has `confidence: 'low'`: render a full-page warning block; status shows "Provisional — legal review required". The verdict body is still visible but clearly marked provisional.
- If any caveat has `confidence: 'medium'`: render an inline warning box below the verdict status. The verdict is not provisional but the specific rule is called out.
- `confidence: 'high'` caveats are not shown (no caveat needed).

A medium caveat also surfaces on the **first screen** (§5.6), independent of whether the verdict is provisional for any other reason — the view-model's `couldStillChange` line (§5.5) carries it there too, so it is never only one click away for a reader who never opens the reviewer section.

### 5.4 Reasoning trace (VD-8)

The reasoning trace is displayed in a collapsible `<details>` element below the verdict summary, inside the reviewer section (§5.7). The trace is stored in the `verdict_produced` audit event's `payload.reasoning_trace` field. If the LLM call failed or no API key is present, the UI falls back to a structured-data summary (rule ID + plain-language equivalent from the policy file's `description` field).

### 5.5 The verdict view-model (VD-9, VD-10, D-02)

`src/components/verdict-view-model.ts` is a pure module (no React, no store calls — cross-cutting.md §7) exporting one function:

```typescript
function buildVerdictView(
  verdict: Verdict,
  policy: PolicyFile | undefined,
  graph: DataFlowGraph | undefined,
  ownership: ControlOwnership | undefined,
  attestations: ControlAttestations | undefined,
  stage: LifecycleStage | undefined,
): VerdictView
```

It is the one computation behind both the first screen and three existing readers that previously each derived a safeguard's status independently — `WhatToDo`, `SignOffChecklist`, and the control-evidence panel (including its no-policy branch) — closing the "one computation per fact" gap those three readers' independent derivations risked (principle 0.5 of `build/prompts/R16.md`). For each safeguard (control) it resolves:

- **status** — `verified` (machine-evidenced) | `attested` (a reviewer's on-record claim, not machine-verified) | `outstanding` | `unknown` (no policy loaded and no attestation). Same precedence every reader used before this chunk: verified beats attested beats outstanding/unknown.
- **plain action** — the control's `plain_action` (CF-6), or its formal name + description + a pointer line when absent, or `"Safeguard {n}"` (by position in `verdict.controls`, never the bare id) when the control cannot be found in the loaded policy at all (NF-11 — no bare code ever reaches the output of this module).
- **owner** — `plain_owner` resolved: `@submitter` → "you or your manager (as the person responsible for this use)", marked `yours`; `@model_owner` → "…working with the supplier" (marked `yours`) when the graph's processing-node vendor is not the engine's `'internal'` sentinel, otherwise "the team that built the model" (not `yours`); free text renders verbatim; `plain_owner_with` appends a partner clause. A register-assigned owner (design-vision.md L-6) overrides all of the above: `"{name} (assigned on your firm's register), due {date}"` — no "not verified" wording, which is reserved for attestations.
- **plain reasons** — from the tripped invariants that require this control, each invariant's `plain_reason` (CF-6) with `{audience}` (widest exposure across the graph's output nodes) and `{destination}` (least-controlled zone on ANY node — inputs and processing — A > B > C, because the data rules match a zone on any node) filled in; when the graph is not available (a case reopened from the register, where the graph is not persisted) they read "clients or the public" and "a system outside your firm's own" — true for every rule that uses them, never the most reassuring value — and `@model_owner` reads "the team responsible for the model"; falling back to the invariant's captured description plus a pointer line when `plain_reason` is absent; de-duplicated.
- **covered reviews** — the verdict's per-instance `downstream_review_sources` (§1.3 of `build/prompts/R16.md`) whose base id (the part before the first `:`) appears in the control's own `covers_reviews` list.

It also resolves, once: the **headline** (four variants — rejected, sign-off-needed, self-service, each with singular/plural safeguard counts); **why** (the distinct plain reasons, binding constraint first, capped at two); **next steps** (sign-off, safeguard ownership, other teams' reviews, `no_regulatory_basis`, a closing "start" line, each step omitted when its condition is false); **reviews still owed** (not covered by any safeguard on this verdict, de-duplicated by plain name — so the firm's two information-security rules show once, D-04); **who signs off**; and **could still change** (gated on `isVerdictProvisional`, D-19, plus the independent RA-11 medium-confidence-caveat line from §5.3, which surfaces whether or not the verdict is otherwise provisional).

A review's plain name resolves against `policy.downstream_reviews` for a firm rule id, a fixed pair of product-level strings for the two engine sentinels (`PV-UNREGISTERED`, `MODEL-REGISTRY`), or a generic "ask your AI risk team which" line for anything else (necessarily a pack rule id, by §1.3's four-source enumeration) — `buildVerdictView` has no `packs` parameter, so a pack rule's own `plain_name` cannot be resolved here by design; this is the §4.4 fallback, not a gap.

A verdict with no `downstream_review_sources` at all (predating this round) folds nothing away: every review in `downstream_reviews` lists separately, per §4.4's "nothing folded away" rule.

A rejected verdict returns a minimal view (headline only; every other field empty) — its own first-screen composition is VD-10/chunk D2's slice; this module deliberately does not fabricate it.

### 5.6 The first screen (VD-9, VD-10)

Rendered by a `FirstScreen` component at the top of `VerdictDisplay`, in `buildVerdictView`'s own order: headline; why; next steps (numbered); the safeguards that must be in place (outstanding, yours first — each with its plain action, "Who:", a "yours" chip where it applies, "Because …", and a "(This also covers …)" note per covered review; a yours-and-outstanding safeguard also gets a "Go to this safeguard" link); already-in-place and attested safeguards (summary lines, no action needed); checks other teams run; who signs off; could still change; and a correction link ("Think we got something wrong? Correct your answers and check again.") wired to the same `onCorrect` prop as the existing correction button, on every verdict (including rejected). No string here contains "approved" or "rejected" (the suite-wide single-match guard, BC-V12B-03 — the one allowed match is the formal status label inside the reviewer section).

"Go to this safeguard" opens the reviewer section, adds the control to `WhatToDo`'s per-control expanded set (lifted to `VerdictDisplay`'s own state so an external click can control it — D-26/D-63: an anchor alone would be closed again on the next render, since the disclosure is React-controlled), then scrolls to it.

### 5.7 The reviewer section (VD-9, principle 0.1/0.7)

A single `<details>` (`#verdict-reviewer-section`), titled "The full reasoning — every rule checked, the evidence, the sources, and the reviewer's actions", wrapping everything that rendered before this round, unchanged and additive: the formal status heading (§5.1), binding constraint (§5.2), confidence caveats (§5.3), `WhatToDo`, `SignOffChecklist` (when shown), the Why/fragility/regulatory-chain/control-evidence folds, provenance, platform/vendor inheritance, living status, the pre-existing correction button, the reasoning trace (§5.4), and the memo export. Its open/closed default is the existing `reasoningDefaultOpen` prop — now defaulting to `false` (was `true`): `RegisterDetail` always passes it explicitly (`role === '2LoD'`) so its behaviour is unchanged; `IntakeFlow`'s submitter-facing render never passed it, so it now starts closed, which is the "collapsed for the submitter, open for 2LoD" rule with no edit to `IntakeFlow.tsx`.

`WhatToDo`, `SignOffChecklist`, and the control-evidence panel keep their pre-existing rendered text and structure (Rule 4 — presentation only) but now read each safeguard's status, and which reviews it covers, from `view.safeguards`/`view.coveredReviewFormalNames` (§5.5) instead of deriving it independently. `describesSameObligation` (a significant-word text heuristic guessing when a control and a review named the same real-world obligation) is deleted; the referential `covers_reviews` field (CF-6, §1.3) replaces the guess with a firm-authored claim, checked at policy-load time like any other condition (`grounding/PACK-AUTHORING.md`'s reviewer checklist) rather than inferred from two authors' independent wording.

The platform/vendor inheritance panel (PV-6) now labels each declared component's header, and each of its dimension rows, by source ("Platform" / "Supplier") — a platform and a supplier can now be declared on the same processing node (the platform's `vendor_id` link, CF-6 §1.6) and constrain the same dimension; D-61 required the two not to show unlabelled. The common case (only one of the two declared) needs no recomputation; when both are declared, the panel calls the engine's own exported `fitsEnvelope`/`inheritableControls` again, split by source — the same computation the engine already ran once merged, not a second one that could disagree with it.

### 5.8 Walkthrough fixes (R16-W: W-5, W-6, W-7, W-8)

A live walkthrough of the committed D1 build found four defects — none in `buildVerdictView` itself, all in how its callers render or scope what it computes.

**W-5 — the knowledge-lens panel off the first screen (D-75).** `IntakeFlow.tsx` rendered `KnowledgeLensPanel` as a sibling AFTER `VerdictDisplay`, outside `VerdictDisplay`'s own collapsed reviewer section (§5.7) — so "Risk-knowledge awareness… curated by project maintainer (2LoD practitioner)…" sat unfolded on a newcomer's first screen, the one surface §5.6 says should hold only the nine first-screen items. The panel is now wrapped in its own collapsed-by-default `<details>`, summary "What outside research says about this kind of AI use (for your AI risk team)", placed after `VerdictDisplay`'s own output — so it is still DOM-sequentially after the reviewer section, just no longer expanded by default. `RegisterDetail` (the reviewer's own page) renders the panel unwrapped, unchanged — the fix is scoped to the submitter-facing intake screen only.

**W-6 — one "also completes" note per safeguard, in grammatical English (D-76).** §5.6 described the safeguards list as rendering "a `(This also covers …)` note **per covered review**" — for a safeguard covering two reviews that was two notes, and the per-review template read "(This also covers the supplier is assessed — one piece of work.)" when a review's plain name was a clause rather than a noun phrase. `SafeguardView` (§5.5) now computes `alsoCompletesNote?: string` once per safeguard — `"(Doing this also completes {list} — one piece of work.)"`, `list` joined "a" / "a and b" / "a, b and c" over every covered review's plain name — and `FirstScreen` renders that one string instead of mapping over `coveredReviews`. The fix also required two review plain names to become actual noun phrases: `PV-UNREGISTERED`'s sentinel name ("the supplier is assessed — it isn't on your firm's list yet" → "adding the supplier to your firm's list"), `MODEL-REGISTRY`'s sentinel name ("the model is added to your firm's list of known models" → "adding the model to your firm's list of known models"), and the firm's own `DR-VENDOR-01.plain_name` ("the supplier is assessed" → "a supplier assessment", policy v1.8). Because these plain names are the SAME strings §5.5's owed-reviews list and §5.6's "Checks other teams run" section already render, `grounding/PACK-AUTHORING.md` now carries a standing rule: a review's `plain_name` must be a noun phrase, checked at authoring time (not machine-checkable — grammar isn't a condition).

**W-7 — "already in place" only where the evidence covers this tool (D-77).** `CTRL-ENC-01`'s stored `verification_evidence` is firm-level ("platform allow-list pins TLS 1.3; platform attestation on file") — true about the firm's own allow-listed platforms and suppliers, not about every use case that happens to trip the control, including a personal ChatGPT account the firm has no contract with. `ControlVerificationEvidence` (policy-schema.md) gains `applies_to?: { platforms?: string[]; vendors?: string[] }`; `checkPolicyReferences` (policy-schema.md §loader checks) rejects an id that isn't a registered platform/vendor on the same policy. §5.5's safeguard-status resolution now takes this into account: `verified` only when `applies_to` is absent (unscoped, the pre-W-7 default) or the processing node's platform id is in `applies_to.platforms` or its vendor id is in `applies_to.vendors`; when the evidence is scoped away from this graph, or the graph is unavailable to check (a case reopened from the register with no graph persisted), the safeguard reads `outstanding` — counted in the headline's N like any other outstanding safeguard, never silently dropped. The evidence panel (§5.7's control-evidence fold) renders a new line in that case instead of the detail text: *"Your firm's records show this for {plain names} — not for this tool."* (scoped away) or *"…— we couldn't check whether that includes this tool."* (no graph). RG-9 is amended accordingly (requirements.md).

**W-8 — owner wording and a rendering bug (D-78).** `CTRL-CONDUCT-01`'s `plain_owner_with: "compliance"` rendered "…responsible for this use), with compliance" — readable as "in compliance" rather than naming a team — changed to `"your compliance team"` (policy v1.8). Separately: the "yours" chip (§5.6) followed the owner text with no space in the JSX between two expression children on adjacent lines — JSX drops an all-whitespace line between them entirely rather than collapsing it to one space — so an owner ending in a word immediately before the chip read as one run-together word ("complianceyours") to anything reading the element's text content, assistive tech included. Fixed with an explicit `{' '}` text node before the chip.

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

### 6.3 Append-only guarantee within the correction flow

Within the correction flow, `AuditStore.append()` is the only write path — the RG-8 hand-off replace (§4.4, §16.8) is a separate, UI-gated exception elsewhere in this module and is never reachable from correction. Calling `append` twice with the same `event_id` throws because the underlying IndexedDB `add()` operation rejects duplicate keys. This prevents the correction flow from accidentally overwriting the original verdict event.

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
| VD-1 | §5.1 — status, tier, track, now inside the reviewer section (§5.7); amended by VD-9 for the first screen |
| VD-2 | §5.2 — binding constraint display with graph path |
| VD-9 | §5.5/§5.6 — the view-model and the first screen: can I start, why, my next steps, safeguards, checks other teams run, who signs off, could still change |
| VD-10 | §5.5 — `buildVerdictView` returns a minimal view for a rejected verdict (headline only); the "No" screen's own composition is chunk D2 |
| VD-3 | §6 — correction flow; both verdicts in audit trail |
| VD-4 | §4.4 — `AuditStore`'s day-to-day surface is append-only (`add()`, not `put()`); the one bounded exception (hand-off replace, §16.8) is guarded by an explicit export allowlist (TC-NF-2-01/TC-VD-4-01) |
| VD-5 | §4.3 `verdict_produced` event carries `policy_version` and `pack_versions` |
| VD-6 | §4.1 `living_status` in `Verdict` type (via evaluation-engine.md); §8 `VerdictSummary` exposes it |
| VD-7 | §4.1 `VerdictConditions` schema |
| VD-8 | §5.4 reasoning trace display; §7 `reasoning-trace.ts` implementation |
| NF-2 | §3 ADR-006; §4.4 append-only store; V1 limitation documented |
| NF-8 | §7 reasoning trace carries full regulatory provenance from `VerdictTraceData` |
| RA-11 | §4.2 `ConfidenceCaveat`; §5.3 UI rendering logic; §5.5/§5.6 — the medium-caveat line also surfaces on the first screen, independent of provisional status |
| CF-6 | §5.5 — `buildVerdictView` renders every plain-language policy field (`plain_action`, `plain_owner`, `plain_owner_with`, `plain_reason`, `plain_change`, `plain_name`), with the §4.4 fallback chain applied where a field is absent |
| NF-11 | §5.5/§5.6 — no control or review id reaches the first screen unresolved; an unresolvable control renders `"Safeguard {n}"`, never the bare id |
| RG-8 | §16 — hand-off bundle format, seal, import validation, outcome vocabulary, merge rule |
| RG-9 | §4.3 `control_evidence_attested` event — a named reviewer's attestation, rendered as a human claim, never machine-verified |

---

## 12. Test Case References

| Test cases | Spec section |
|---|---|
| TC-VD-1-01 | superseded — test-cases.md's own Superseded section; VD-1's "never behind a fold" fit criterion now describes the reviewer section (§5.7), amended by VD-9 |
| TC-VD-2-01 | §5.2 binding constraint display |
| TC-VD-3-01, TC-VD-3-02 | §6 correction flow and audit trail |
| TC-VD-4-01 | §4.4 audit store — explicit allowlist of exports (append-only, plus the one named, bounded hand-off-replace exception) |
| TC-VD-5-01 | §4.3 `verdict_produced` event payload |
| TC-VD-7-01 | §4.1 `VerdictConditions` schema |
| TC-VD-8-01 | §7 reasoning trace prose requirements |
| TC-RA-11-01, TC-RA-11-02 | §5.3 confidence caveat rendering |
| TC-R16-D1-01 … -23 | §5.5/§5.6/§5.7 — the view-model (every branch) and the first-screen component; test-cases/test-cases-020.md |

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

## 16. Hand-off Bundle — Submitter/Reviewer Transfer (RG-8)

AIGate's whole value depends on a SUBMITTER and a REVIEWER being different
people, but V1 runs entirely in one browser with no server and no shared
database — "1LoD" and "2LoD" were, until this feature, just a role toggle on
one machine. The hand-off bundle (`src/store/handoff.ts`) lets the register
and its append-only audit trail move from one machine to another as a single
file, with the hash chain (§4.3) used exactly as intended: an accidentally
damaged file, or one edited without recomputing the chain downstream of the
edit, is caught on arrival.

### 16.1 Bundle shape

```typescript
export const HANDOFF_FORMAT_VERSION = 1;

export interface HandoffBundle {
  format: 'aigate-handoff';
  format_version: typeof HANDOFF_FORMAT_VERSION;
  exported_at: string;          // ISO 8601
  app_version: string;
  register: { nodes: RegisterNode[]; edges: RegisterEdge[] };
  audit_events: AuditEvent[];   // chain-ordered
  seal: string;                 // §16.2
}
```

`exportBundle(appVersion)` builds this by calling `register.exportAll()` and `audit.getAllForExport()` — both already queued against every other writer to their own store (§16.6) — and computing the seal over the result.

### 16.2 The seal — what it proves, and what it does not

`computeSeal(register, events)` is a SHA-256 hash (`sha256Hex`) over a canonical JSON serialisation of:

- `register.nodes`, sorted by `node_id`
- `register.edges`, sorted by `edge_id`
- `audit_tip` — the last event's `hash`, or the literal string `'EMPTY'` when there are no events
- `audit_count` — the number of audit events

This is an **unkeyed** hash — no secret, no external anchor. What it catches: accidental damage to the file in transit, and an edit that was made without recomputing the chain and the seal downstream of it — the common case, and the one this product used to leave open. What it does **not** prove: who made the file. Anyone holding the bundle can edit it, recompute every downstream hash and the seal, and a fresh import will accept the result — proved in code by `handoff.test.ts`'s F2 test, which builds exactly that forgery with `audit.ts`'s own `__recomputeChainForTests` and asserts `importBundle` accepts it. This is the same tamper-evident-not-tamper-proof limit `AuditEvent.hash` already states for the local trail (§4.3) — a hand-off file just makes the file itself the thing an attacker could hold. The product's stated position, shown to the user on import: only import a bundle from someone you trust, sent by a route you trust.

### 16.3 Import validation, before any write

`importBundle` and `replaceWithBundle` share one `validateBundle` step that runs, in order, before either function touches a store:

1. **Envelope check first.** `format`/`format_version` are checked before the full schema, so an unsupported version gets its own honest message — "This hand-off file was made by a different version of AIGate and can't be imported here." — distinct from "This file is not an AIGate hand-off bundle." for a file that is not a bundle at all.
2. **Full shape and semantic validation** (`zod`): every timestamp must be a real ISO datetime, not merely a string that looks like one — an unparseable `occurred_at` would otherwise poison the monotonic clock `audit.ts` uses to keep timestamps strictly increasing across a tab session, breaking every later local write until reload (code-review-005 F4); every audit event's `event_type` is one of the known values (§4.3) **and** matches `payload.type`; each payload variant's own required fields are checked, not just "some object with the right `type`"; every register node's `node_type` matches its `metadata.node_type`, and each metadata variant's own required fields are checked. Round 2 (N4) broadened the load-bearing `Verdict` subset this schema checks: `confidence_caveats`, `controls`, `downstream_reviews`, `conditions`, `margin_achieved`, `margin_target`, `single_covered_invariants`, `boundary_proximity`, non-null `tier`/`track`, `attested_at`, and `living_status` are now all required (and, where present, `explanation`'s own nested shape) — every field `register.ts`'s `toSummary`/`isVerdictProvisional` or `VerdictDisplay`/`RegisterDetail` dereference without a `??`/`?.` guard. A bundle missing `confidence_caveats` used to pass this step, then throw the first time anything read the verdict back — dropping the case from the register list (`getUseCases`'s per-row `Promise.allSettled` skips it) and hanging its own page on "Loading…" forever (`getUseCase`/`RegisterDetail` had no error path). Both now do: `getUseCase`'s rejection is caught by `RegisterDetail`'s `load()` and shown as "This case couldn't be loaded: …", with the way back — defence in depth for a corrupt row from any source, not only a hand-off bundle.
3. **Duplicate `event_id` values inside one bundle** are rejected by name: "This bundle has more than one event with the id "X" and cannot be imported."
4. **The seal is recomputed and compared** (§16.2) — a mismatch is reported as `tampered`, not `invalid_format`.
5. **The incoming chain's own internal integrity is walked in full** (`verifyChainOf` — linkage and every event's content hash), independently of the local store, so a payload edited in transit is caught even in a case the seal alone would not cover (the seal binds only the tip).

### 16.4 Outcomes

`ImportOutcome` is exactly these twelve values:

| Outcome | Meaning |
|---|---|
| `invalid_format` | Not a bundle, or the schema failed — includes an unsupported `format_version` |
| `tampered` | The seal or the incoming chain's own internal linkage/hash is broken |
| `up_to_date` | The bundle equals the local trail; nothing to do |
| `local_ahead` | The local trail already extends the bundle; nothing to do |
| `merged` | The bundle's tail extended a non-empty local trail; the tail was absorbed |
| `imported_into_empty` | The local trail was empty; the whole bundle was absorbed (named to avoid colliding with the unrelated `classification_adopted` audit event — code-review-005 F27) |
| `replaced` | User-confirmed: the local trail was discarded (backup already taken) and the bundle installed |
| `diverged` | The two histories cannot be merged; rejected, no writes |
| `partially_replaced` | code-review-005 round 2, N1. The audit trail (source of truth) WAS replaced; the register step that must follow it then failed. Returned, never thrown — see §16.8. |
| `backup_out_of_date` | Round 2, N2. The local audit tip no longer matches the tip the caller's backup file actually exported; refused, nothing written — see §16.8. |
| `finish_out_of_date` | Round 2, N1. `finishRegisterReplace`'s own re-check found the local audit tip has moved on since the partial replace it is trying to finish; refused — see §16.8. |
| `register_needs_finishing` | Round 3, R3-1. The bundle's audit tail is already fully absorbed (the `up_to_date` condition), but the local register does not match the bundle's register — almost always because an earlier `partially_replaced` replace never reached `finishRegisterReplace`. Nothing is written; the caller re-uses `finishRegisterReplace` to catch the register up — see §16.8. |

### 16.5 The merge rule — prefix or nothing

Two chains merge only when one is a byte-for-byte prefix of the other over their shared span — the same `event_id`, `prev_hash`, and `hash` for every event in that span (`chainPrefixMatch`). The hash chain is global across the whole trail, not per use case, so two chains grown independently on two machines share no common suffix and cannot be honestly concatenated; anything short of a clean prefix relationship is `diverged` and rejected outright, with no writes.

The read, the compare, and the write are not three separate calls. `importTailIfContinues` performs "read the local chain, check the prefix, write the tail" as **one** step inside the audit write queue (§16.6), re-verifying the tail still joins the current tip immediately before inserting it. This closes a race a three-step version had: a second import, a local `append()`, or another tab's write landing between the check and the write could otherwise attach the new tail to a tip that had already moved. The merge path never rewrites, reorders, or removes an existing event — it only appends the verified tail, using `db.add()`, never `put()`.

### 16.6 Concurrency — per-store write queues

Both `audit.ts` and `register.ts` serialise every write — and every read that must not observe a torn mid-write state, such as export — through a queue (`createWriteQueue`, `src/store/db.ts`). Each IndexedDB database gets its own named queue (`aigate-audit-write`, `aigate-register-write`), so a lock on one store never blocks the other. Same-tab calls are always serialised; where the browser supports `navigator.locks`, the same named lock is also taken across tabs, so a second tab performing the same kind of operation is locked out too. This is feature-detected: this project's test environment (jsdom) has no `navigator.locks` and silently falls back to same-tab-only queuing, which is why cross-tab behaviour is exercised by design but not asserted by the automated suite.

**One fixed nesting order: audit outer, register inner (code-review-005 round 2, N3).** An operation that must touch both queues — write to the register AND the audit trail, as one logical unit — nests them, rather than taking them as two separate top-level calls. Before round 2, two call sites nested (or should have nested) this in opposite directions: `register.ts`'s `updateLifecycleStage` held the REGISTER queue and awaited the AUDIT queue (via `append()`) from inside it; this section's own `replaceWithBundle` took the audit queue, released it, and only then took the register queue, with a real gap between the two. Raced against each other, opposite nestings can deadlock outright — each holds the queue the other is waiting for, so neither call can ever resolve. This is not a hypothetical: reverting only `updateLifecycleStage` to its pre-round-2 form, with `replaceWithBundle`'s round-2 fix left in place, makes the reproducing test (`TC-RG-8-32`, `handoff.test.ts`) time out rather than merely fail an assertion. Short of a full deadlock, leaving the two queues genuinely un-nested lets a third write land in the gap between them and leave the two stores disagreeing — §16.8 below is the replace-side reproduction of exactly that.

The fix is one rule applied everywhere both queues are touched, with no exception: **audit outer, register inner.** `audit.ts` exports `withAuditQueue()` for a caller to hold that queue across a nested call into `register.ts`'s own queue (`enqueueRegister`, unexported — reached only through `register.ts`'s functions, which is what "nested" means in practice). A caller already inside `withAuditQueue()` must use the `*WithinQueue` siblings (`appendWithinQueue`, `backupAndReplaceAllRawEventsWithinQueue`, `importTailIfContinuesWithinQueue`, `currentTipWithinQueue`) rather than a plain, self-queuing call — calling a self-queuing function again from inside a callback the SAME queue is already running would schedule the new turn after the current one, which is the one awaiting it: the same deadlock shape, self-inflicted. Every production call site that touches both queues now follows this order: `register.ts`'s `updateLifecycleStage` (register-lifecycle.md §15.6) and this file's `replaceWithBundle`, `finishRegisterReplace`, and `importBundle` (§16.8).

### 16.7 "Different histories" — first receipt vs. a warning

When the outcome is `diverged`, the message shown depends on whether this browser has ever synced successfully before. A per-browser marker (`localStorage`, key `aigate-handoff-last-synced-tip`) records the last bundle tip absorbed by any successful `up_to_date`, `local_ahead`, `merged`, `imported_into_empty`, or `replaced` outcome; it is best-effort (private browsing can block `localStorage`) and never load-bearing — it decides only which message is shown, never whether an import is accepted.

- **First time** (no prior successful sync recorded): "This bundle and your copy have different histories, so they can't be merged. The first time you receive a case this is normal — your browser starts with its own demo cases. You can save a backup of yours and replace it with this bundle."
- **After a previous successful sync:** "Warning: this bundle doesn't continue the history you last synced. That shouldn't happen at this stage — it can mean the wrong file, both of you changing the case at once, or a file that was altered. Check with the sender before replacing anything."

The user-facing term for this state is always "different histories". The internal `ImportOutcome` value is named `diverged`; "fork" is not used in any user-facing copy.

### 16.8 The two-step replace

`replaceWithBundle` is reachable only after (1) the bundle has passed every check in §16.3, and (2) the user has completed a two-step, UI-enforced confirmation in `RegisterView.tsx`: "Save a backup of mine first" — which must itself succeed, since a browser can silently block or cancel a download — before "I have my backup — replace my register" becomes available. Only the second step calls `replaceWithBundle`. Step 1 has its own synchronous in-flight guard (code-review-005 round 2, N8) — a double-click cannot download the backup twice.

**The whole operation is one `withAuditQueue()` turn (round 2, N3).** `replaceWithBundle(raw, expectedBackupTip?)`, in order, ALL inside that one turn:

1. Calls `audit.backupAndReplaceAllRawEventsWithinQueue(bundle.audit_events, expectedBackupTip)` — reads what is about to be discarded and, if `expectedBackupTip` is given and still matches the current tip, replaces it with the bundle's events; otherwise refuses (`backup_out_of_date`, below) and writes nothing. Reading, checking, and writing as one unbroken step (rather than three separate calls) closes the gap the pre-round-2 version left open (code-review-005 F16) and adds the round-2 staleness check on top of it.
2. Calls `register.backupAndReplaceRegister(bundle.register.nodes, bundle.register.edges)`, NESTED inside the same turn — this is the audit-outer/register-inner nesting §16.6 requires, not a second, separate top-level call.

The audit trail (source of truth) is replaced **first**; the register (a derived view) **second** (code-review-005 F6) — a failure between the two steps leaves the source of truth already correct and only the presentation layer stale, never the reverse.

**N2 — the backup can go stale between step 1 and step 2.** The case page renders inside `RegisterView`, so a user can open a case and sign it off (reachable in ONE tab) while a replace is still pending confirmation — that change is not in the backup file the success message points to, and the pre-round-2 code discarded it silently. `RegisterView` now records the tip (hash + event count) the step-1 backup ACTUALLY exported and passes it as `expectedBackupTip`; if the live trail has moved past it by step 2, `replaceWithBundle` returns `backup_out_of_date` — "Your register changed after you saved the backup, so nothing was replaced. Save a new backup of yours, then replace." — and the UI returns to step 1 with the same pending bundle, never discarding it.

**N1 — a register-step failure after the audit trail was replaced is a distinct, honest, RETURNED outcome, never a thrown error with a fixed sentence appended to it.** Before round 2, this path threw `"Your audit trail was replaced, but the register view could not be updated: …"`, and `RegisterView`'s catch block appended `"Your register was not changed — your pending replace is still available."` to WHATEVER error reached it — a direct self-contradiction on this specific path, since the audit trail (also shown on the same screen) really had just been replaced. Now: a register-step failure here returns `partially_replaced` — `"Your audit trail was replaced with this bundle's (N events) — that part is done and cannot be undone. The register view could not be updated to match: …. Use \"Finish updating the register\" to try again, or reload to see the latest audit trail."` — and `RegisterView` offers a "Finish updating the register" action instead of "Keep my register" (keeping is no longer honest once the audit side has already changed). That action calls the new `finishRegisterReplace(raw)`, which — also inside its own `withAuditQueue()` turn — re-reads the current tip (`audit.currentTipWithinQueue()`) and compares it against the bundle's own tip before retrying JUST the register step: equal, it proceeds and returns `replaced`; different (something else wrote to the audit trail since the partial replace — another approval, another import), it refuses as `finish_out_of_date` — "Your audit trail has changed since it was replaced, so the register can't be safely finished from here. Reload the page to see the current state." — rather than install a register that no longer matches what the audit trail says. An audit-step failure (the transaction inside `backupAndReplaceAllRawEventsWithinQueue` aborts atomically) is a different, genuinely honest case where "nothing was replaced" — `RegisterView`'s catch block still says exactly that, but now only reaches this path, never the register-step failure above.

The merge path (`importBundle`) is now ALSO one `withAuditQueue()` turn (its audit step, `importTailIfContinuesWithinQueue`, then its nested `register.importRegister` call) for the same N3 reason, but its own register-step failure wording is unchanged from before round 2 — no self-contradiction existed on that path (`RegisterView`'s import handler never appends a fixed sentence to a caught error), so round 2 fixed only the lock ordering around it: "The audit trail was updated (N events), but the register view could not be refreshed: &lt;error&gt;. Reload to see the latest state." (still thrown, not returned).

**R3-1 — a pending `partially_replaced` finish is recoverable even after the only record of it (`RegisterView`'s own `awaitingFinish`/`pendingReplace`/`backupReady` state) is lost.** That state is plain React state: switching views unmounts `RegisterView` (`App.tsx`), and a reload clears it too — and the `partially_replaced` message itself used to offer reload as a neutral option. Before round 3, re-importing the exact same bundle afterwards fell straight into `up_to_date` ("Your copy is already up to date with this bundle. Nothing to import.") without ever looking at the register, and no control on screen could reach `finishRegisterReplace` any more — the register stayed silently wrong, permanently. `importBundle`'s `up_to_date` branch now also compares the local register against the bundle's register (`registersMatch` — same node/edge sets by id and, for each id present on both sides, the exact fields the bundle carries, compared via the same sorted-and-canonicalised serialisation the seal itself hashes, so storage order never matters). A mismatch returns `register_needs_finishing` instead of `up_to_date`; `RegisterView` offers "Finish updating the register" for it, calling the SAME `finishRegisterReplace(raw)` (and its own tip re-check) a still-pending finish would have called. The `partially_replaced` message was reworded to match: it no longer offers reload as a neutral alternative, and instead says plainly that re-importing the same file after leaving the page will offer the finish step.

**R3-2 — a second bundle must never be able to land while a replace or finish is pending.** `RegisterView`'s `diverged` branch set `pendingReplace`/`backupReady` for the new bundle but left `awaitingFinish` untouched; importing a second, diverging file while an earlier `partially_replaced` finish was still pending could show BOTH "Keep my register" (for the new bundle) and "Finish updating the register" (for the old one) at once, and "Keep" silently abandoned the finish — the register then carries nodes whose audit events the (already-replaced) trail no longer has. The fix is at the control, not just the state: "Import hand-off bundle" (both the button and the underlying file input) is disabled, with the visible reason "Finish or cancel the pending replace first.", for as long as `pendingReplace !== null` — a replace or finish is always exactly one bundle at a time. The import handler itself also refuses a bundle while one is already pending, as defence in depth, and every place that replaces `pendingReplace` with a new bundle resets `awaitingFinish` too, so a stale `true` from an earlier decision can never leak into a new one.

### 16.9 Honest limits

- **No cross-database atomicity.** `aigate-audit` and `aigate-register` are two separate IndexedDB databases; nothing in `idb`/IndexedDB can wrap a write to both in one transaction. §16.6's write queues make each store internally consistent on its own; they cannot make the pair atomic. §16.8's write-order rule (audit first) is the mitigation, not a substitute for atomicity.
- **The pause between the two replace steps is a UI control, not a cryptographic or server-enforced one.** This build has no backend at all; the two-step confirmation sequences the destructive write behind an explicit human acknowledgement, and nothing more.

### 16.10 Traceability

| Requirement | Section | Test coverage |
|---|---|---|
| RG-8 | §16 | `TC-RG-8-01` through `-27` (`test-cases/test-cases-016.md`), across `src/store/handoff.test.ts`, `src/store/audit.test.ts`, `src/store/register.test.ts` (TC-NF-2-01/TC-VD-4-01 export allowlist), `src/components/__tests__/RegisterView.handoff.test.tsx`, `src/components/__tests__/RegisterDetail.eventDetail.test.tsx`. `TC-RG-8-28` through `-41` (code-review-005 round 2, N1-N9 and the noted test gap) add `handoff.test.ts`, `src/components/__tests__/RegisterDetail.test.tsx`, and `src/components/__tests__/VerdictDisplay.cr005.test.tsx` to that list. `TC-RG-8-42` through `-48b` (code-review-005 round 3, R3-1/R3-2/R3-4; R3-3 rides alongside, same as round 2's N5/N6/N7/N9) add `src/components/challenge-memo.test.ts` and `src/components/__tests__/VerdictDisplay.memo-download.test.tsx` to that list. |

## 17. Changelog

| Date | Change |
|---|---|
| 2026-10-02 | §5 rewritten — R16 chunk D1 (VD-9, VD-10). The page is now a plain-language first screen (§5.6) over a collapsed reviewer section (§5.7) holding everything §5 described before this round, unchanged. New §5.5 documents the one view-model (`verdict-view-model.ts`) behind the first screen and the three existing readers (`WhatToDo`, `SignOffChecklist`, the control-evidence panel) that previously derived a safeguard's status independently. `describesSameObligation` (a text heuristic) is deleted, replaced by the referential `covers_reviews` field. The platform/vendor inheritance panel (§5.7) now labels each declared component by source ("Platform"/"Supplier", D-61). TC-VD-1-01 superseded (test-cases.md) — its "never behind a fold" criterion now describes the reviewer section, not the first screen. |
| 2026-10-02 | §16.4/§16.8 amended — code review 005 round 3 (R3-1, R3-2, R3-4; R3-3/R3-5 are outside this file's scope). One new `ImportOutcome` value, `register_needs_finishing`: `importBundle`'s `up_to_date` branch now also compares the local register against the bundle's register and, on a mismatch, offers the same `finishRegisterReplace` recovery a still-pending `partially_replaced` finish would have — closing the gap where losing `RegisterView`'s in-memory finish state (a view switch, a reload) left the register silently, permanently wrong. The `partially_replaced` message no longer offers reload as a neutral alternative. "Import hand-off bundle" is now disabled, with a visible reason, for as long as a replace or finish is pending, closing a race where a second bundle could show two unrelated pending decisions (Keep vs. Finish) at once. §16.10 traceability row extended with `TC-RG-8-42` through `-48b`. |
| 2026-09-28 | §16.4/§16.6/§16.8 amended, §16.3 extended — code review 005 round 2 (N1-N4, N8-N9). Three new `ImportOutcome` values (`partially_replaced`, `backup_out_of_date`, `finish_out_of_date`) and the new `finishRegisterReplace` export; the audit-outer/register-inner lock order made explicit and applied to `replaceWithBundle`/`importBundle` (register-lifecycle.md §15.6 does the same for `updateLifecycleStage`); the verdict-schema load-bearing subset broadened (N4); step 1 of the two-step replace gets a synchronous in-flight guard (N8). §16.10 traceability row extended with `TC-RG-8-28` through `-41`. |
| 2026-09-28 | §16 added — code review 005 (F10). Hand-off bundle spec (RG-8): bundle shape, seal limits, import validation, outcome vocabulary, merge rule, two-step replace, concurrency, honest limits. §4.3/§4.4 rewritten (F7): the append-only guarantee now states its one bounded exception (`backupAndReplaceAllRawEvents`) precisely, and the guard test is documented as an explicit export allowlist, not a keyword search. `control_evidence_attested` relabelled RG-7 → RG-9 throughout (collided with the existing RG-7, periodic sampling cadence). |
| 2026-08-18 | §15 added — round 12. ADR-VA-R12-1 (stateless deterministic sampling queue), ADR-VA-R12-2 (provisional cause families in presentation), ADR-VA-R12-3 (caller-computed policy hash on the memo). |
| 2026-08-17 | §15 added — round 10. Challenge-memo export as pure presentation (ADR-VA-R10-1), inherent/residual as labels (ADR-VA-R10-2), two-axis evidence backward compatible (ADR-VA-R10-3). |
| 2026-07-29 | §13 added — round 3. The verdict states both the consequence (prose, for the submitter) and the cause (labelled reason, for the record); they are separate assertions because they serve separate readers. |
