# AIGate — Implementation Guide

**Version:** 1.0  
**Date:** June 2026  
**Status:** Draft  
**Phase numbering base:** P1 (no prior build phases — `build/handovers/` is empty)

---

## Expert Panel

| Expert | Work | Role in This Document |
|--------|------|-----------------------|
| Mike Cohn | *Agile Estimating and Planning* (Prentice Hall 2005); *User Stories Applied* (Addison-Wesley 2004) | INVEST chunk sizing; vertical slicing; dependency-aware sequencing |
| Martin Kleppmann | *Designing Data-Intensive Applications* (O'Reilly 2017) | Share-nothing parallel execution; interface contracts at chunk boundaries |
| Andrew Hunt & David Thomas | *The Pragmatic Programmer* (20th anniversary ed., Addison-Wesley 2019) | Walking skeleton; tracer bullets; DRY |
| Kent Beck | *Test-Driven Development: By Example* (Addison-Wesley 2002) | TDD at every chunk; test co-location rule |
| Frederick Brooks | *The Mythical Man-Month* (Addison-Wesley 1995) | Conceptual integrity across all slices |

---

## 1. Dependency Matrix

Each chunk is tagged: **depends on** / **enables** / **parallel with**.

| Chunk | Title | Depends on | Enables | Parallel with |
|---|---|---|---|---|
| P1-C01 | Project scaffold + walking skeleton | — | Everything | — |
| P2-C01 | Policy loader + Zod validation | P1-C01 | P3-C01, P4-C01, P5-C01 | P2-C02 |
| P2-C02 | IndexedDB stores (audit + register) | P1-C01 | P3-C01, P4-C01, P5-C01 | P2-C01 |
| P3-C01 | Evaluation engine — 8-step pipeline | P2-C01 | P3-C02, P4-C01 | P3-C02 (after C01) |
| P3-C02 | Greedy set-cover control solver | P3-C01 | P4-C01 | — |
| P4-C01 | Intake flow — LLM graph extraction + state machine | P2-C01, P2-C02, P3-C01, P3-C02 | P4-C02 | P5-C01 |
| P4-C02 | Intake flow — structured form fallback (UC-3a) | P4-C01 | P4-C03 | P5-C01 |
| P4-C03 | Question generation + contradiction detection | P4-C01 | P4-C04 | P5-C01 |
| P4-C04 | Attestation + confirmation → evaluation | P4-C03, P3-C01, P3-C02 | P5-C01, P5-C02 | — |
| P5-C01 | Verdict display + correction flow | P4-C04, P2-C02 | P5-C02 | P5-C02 (after P5-C01 API) |
| P5-C02 | Plain-English reasoning trace (VD-8) | P5-C01 | P6-C01 | — |
| P6-C01 | Register view — 1LoD + 2LoD + role access | P2-C02, P4-C04 | P6-C02 | P6-C02 (after API) |
| P6-C02 | Lifecycle stage + tier routing + policy re-eval trigger | P6-C01, P3-C01 | P7-C01 | — |
| P7-C01 | AIGate self-assessment seed | P6-C01, P3-C01, P3-C02, P2-C02 | P7-C02 | — |
| P7-C02 | Export (RG-5) + parity check script | P6-C01, P7-C01 | P7-C03 | — |
| P7-C03 | Integration closure + product startup verification | All chunks | — | — |

---

## 2. ASCII Dependency Network

Two tracks: **Engine track** (top) and **UI track** (bottom). Cross-links show where they join.

```
ENGINE TRACK
───────────────────────────────────────────────────────────
P1-C01  →  P2-C01  →  P3-C01  →  P3-C02  ──────────────────────────┐
           |                                                          |
           └──→  P2-C02  ──────────────────────────────────────┐     |
                                                                |     |
UI TRACK                                                        ↓     ↓
───────────────────────────────────────────────────────────────
           P4-C01  →  P4-C02  →  P4-C03  →  P4-C04  →  P5-C01  →  P5-C02
           ↑                                    ↑
           └── requires P2-C01, P2-C02 ─────────┘
           └── requires P3-C01, P3-C02 ─────────┘

REGISTER TRACK
───────────────────────────────────────────────────────────────
                                             P6-C01  →  P6-C02  →  P7-C01  →  P7-C02  →  P7-C03
                                             ↑
                                             └── requires P2-C02, P4-C04
```

**Parallel opportunities:**
- P2-C01 ∥ P2-C02 (policy loader and IndexedDB stores share no files)
- After P4-C04: P5-C01 can begin; P6-C01 can begin in parallel (share no source files until integration)

---

## 3. Critical Path

The longest sequential chain determines minimum build time:

```
P1-C01 → P2-C01 → P3-C01 → P3-C02 → P4-C01 → P4-C03 → P4-C04 → P5-C01 → P5-C02 → P6-C01 → P6-C02 → P7-C01 → P7-C02 → P7-C03
```

14 chunks on the critical path. P2-C02 and P4-C02 are off the critical path — they can be built in parallel without blocking the main sequence.

---

## 4. Wiring Matrix

Every entry point, its consumed modules, the chunk that owns the call site, and the chunk whose failing test demanded the producer.

| Entry point | Consumed modules | Wiring chunk | Demanded by |
|---|---|---|---|
| `IntakeFlow.tsx` (UC-3 path) | `src/llm/graph-extractor.ts`, `src/engine/question-generator.ts`, `src/engine/contradiction.ts`, `src/store/audit.ts` | P4-C01 | P4-C04 (intake acceptance test: confirmed graph → verdict) |
| `IntakeFlow.tsx` (UC-3a path) | `src/components/StructuredForm.tsx`, `buildGraphFromForm()`, `src/engine/question-generator.ts` | P4-C02 | P4-C04 (intake acceptance test: form path → verdict) |
| `evaluate.ts` (engine entry) | `evaluateHardLines()`, `assignJurisdiction()`, `assignTier()`, `assignTrack()`, `solvControls()`, `assembleVerdict()` | P3-C01 | P4-C04 (verdict acceptance test: evaluate(graph, policy) → Verdict) |
| `solvControls()` | `greedy-solver.ts` | P3-C02 | P3-C01 (engine pipeline test: approved-with-controls verdict requires solver) |
| `reasoning-trace.ts` | Anthropic SDK, `VerdictTraceData` | P5-C02 | P5-C01 (verdict display test: reasoning trace section renders prose) |
| `AuditStore.append()` | `idb` library, `aigate-audit` database | P2-C02 | P4-C04 (audit acceptance test: verdict_produced event written after evaluation) |
| `RegisterStore.addNode()` / `addEdge()` | `idb` library, `aigate-register` database | P2-C02 | P6-C01 (register acceptance test: use case appears in register after intake) |
| `RegisterView.tsx` (2LoD) | `RegisterStore.getUseCases('all')`, `getBlastRadius()` | P6-C01 | P6-C02 (lifecycle test: stage badge visible in register) |
| `RegisterView.tsx` (export) | `RegisterStore.exportAll()` | P7-C02 | P7-C01 (AIGate self-assessment test: AIGate entry present in export) |
| `onPolicyUpdated()` | `RegisterStore.getUseCases('all')`, `AuditStore.append()`, `RegisterStore.updateLifecycleStage()` | P6-C02 | P6-C02 (re-evaluation test: all active cases queued on policy update) |
| `workflow-router.ts` | Policy `tier_workflows` config | P6-C02 | P6-C01 (register test: Low-tier verdict shows self-service final) |
| `aigate-self-assessment.ts` (seed) | `AIGATE_USE_CASE_GRAPH`, `evaluate()`, `AuditStore.append()`, `RegisterStore.addNode()` | P7-C01 | P7-C01 (self-assessment test: AIGate appears in register with valid verdict) |
| `PolicyEditor.tsx` | `src/store/policy.ts`, js-yaml, Zod schema | P2-C01 | P3-C01 (engine test: evaluate() receives a loaded PolicyFile) |
| `src/engine/question-generator.ts` | `DataFlowGraph`, `PolicyFile`, `JurisdictionPack[]` — internal engine module | P4-C03 | P4-C03 (question generation test: uncertain nodes generate targeted questions) |
| `src/engine/contradiction.ts` | `DataFlowGraph`, `QuestionAnswer[]` — internal engine module | P4-C03 | P4-C03 (contradiction test: conflicting answers transition to contradiction_review) |
| `scripts/spec-parity-check.py` | Reads `specs/*.md` — no runtime consumer | P7-C02 | Demanded by: internal helper, no consumer demanded — rationale: cross-spec parity tool used by CI and /gvm-design-review; not a runtime entry point |
| `StructuredForm.tsx` (round 3) | jurisdiction answered-state, `loadFormDraft()` migration | P8-C01 | P8-C01 (form gate test: untouched jurisdiction question disables Continue) |
| `evaluate.ts` (round 3) | `provisionalReasons()` — internal engine module | P8-C04 | P8-C04 (engine test: no active pack yields `no_regulatory_basis`) |
| `VerdictDisplay.tsx` (round 3) | `verdict.provisional_reasons` — read, no longer derived locally | P8-C05 | P8-C05 (verdict test: statement and labelled cause both render) |
| `RegisterDetail.tsx` (round 3) | `VerdictDisplay`, latest verdict-bearing `AuditEvent` payload | P8-C06 | P8-C06 (sign-off test: six decision-bearing elements present) |
| `store/register.ts` (round 3) | `verdict.provisional_reasons` — read, no longer derived locally | P8-C04 | P8-C04 (register test: row status agrees with verdict status) |

---

## 5. Build Phases

### Phase 1 — Walking Skeleton

**Goal:** End-to-end wired boundary. No real business logic — but every external boundary is exercised by a **real interaction with an observable outcome** (GVM walking-skeleton rule, Ch. 12). Proves the wiring works before any domain chunk fills it in.

**MVP-1 note:** Phase 1 delivers a runnable product: the user can type a description, click through the intake wizard, see a hardcoded verdict, and view it in the register. The skeleton is interactive and end-to-end — not a page template.

**Boundary registry (2 external boundaries — both wired for real in this chunk, no stubs):**
- **persistence** — IndexedDB via the `idb` library: the skeleton writes one real row and reads it back (observable outcome), not an in-memory/console substitute.
- **network / third-party** — Anthropic API (`claude-sonnet-4-6`, `dangerouslyAllowBrowser: true`): the skeleton makes one real `tool_use` call and inspects the structured JSON response. This is our single riskiest integration (browser-side key handling, CORS, structured-output parsing) — proven at chunk 1, not deferred to P4.

---

#### P1-C01 — Project scaffold + walking skeleton

**Spec reference:** `cross-cutting.md` — project structure, toolchain, module boundaries  
**Estimated time:** 2–3 hours  
**Parallel with:** nothing (everything depends on this)

**Deliverables:**
- Vite 5 + React 18 + TypeScript 5 strict project created with `npm create vite@latest`
- `tsconfig.json` with `strict: true`, `noUncheckedIndexedAccess: true`
- Directory structure: `src/engine/`, `src/llm/`, `src/store/`, `src/components/`, `src/types/`, `src/seeds/`
- Boundaries wired REAL (no stubs — walking-skeleton rule):
  - `src/store/audit.ts` — real `idb` call: open `aigate-audit`, write one row, read it back. Minimal schema, but a real persisted row with an observable outcome.
  - `src/llm/graph-extractor.ts` — real Anthropic `messages.create` with a `tool_use` call; parse and inspect the structured JSON response. Trivial extraction is fine; the point is the boundary is exercised. Test gated on API key presence; skips cleanly without one.
- Business logic still stubbed (deepened in later phases):
  - `src/engine/evaluate.ts` — accepts graph + policy, returns a hardcoded `Verdict` stub
  - `src/store/register.ts` — in-memory stub
  - `src/store/policy.ts` — returns a hardcoded stub `PolicyFile`
  - `IntakeFlow.tsx` — minimal 3-step wizard (description → real extraction → verdict)
  - `VerdictDisplay.tsx` — renders the hardcoded verdict stub
  - `RegisterView.tsx` — shows a single hardcoded use case row
- Walking skeleton smoke test: `describe('Walking Skeleton') → it('completes full flow end-to-end with real boundaries')`
- `npm run dev` starts without errors
- `npm run build` completes without TypeScript errors

**Tests:** Boundary test (real IndexedDB write→read round-trips a row; real Anthropic call returns parseable structured output — LLM test skips cleanly without an API key) + full-flow smoke test. Tests must pass before moving to Phase 2.

---

### Phase 2 — Infrastructure

**Goal:** Real persistence and real policy loading. Engine and UI stubs still in place.

**Parallel work:** P2-C01 and P2-C02 can run in parallel — they modify different `src/store/` files.

---

#### P2-C01 — Policy loader + Zod validation

**Spec reference:** `policy-schema.md §3, §4, §5` — YAML schema, condition language, validation rules  
**Estimated time:** 3–4 hours  
**Parallel with:** P2-C02

**Deliverables:**
- `src/store/policy.ts` — real implementation replacing stub:
  - `loadPolicy(yaml: string): Result<LoadedPolicy, PolicyValidationError[]>` using `js-yaml` + Zod
  - Validates required top-level sections per `policy-schema.md §6`: `version`, `translation_attestation`,
    `hard_lines` (may be empty array), `controls` (non-empty), `tracks` (≥1 rule), `tiers` (≥1 rule),
    `tier_workflow` (all four tiers mapped), `safety_margin` (0.0–1.0)
  - Validates condition language: `gte`, `lte`, `in`, `not_in`, bare-equality operators only (per §8 ADR-002)
  - Validates all condition values against the §3.0 canonical vocabulary (`DataClass`, `DataZone`,
    `ModelType`, `Exposure`, `DecisionBindingness`, `ActionType`, `DecisionType`)
  - `PolicyFile` and `PolicyValidationResult` TypeScript types (per `policy-schema.md §5–6` — NOT
    `LoadedPolicy`/`PolicyError`, which do not exist in the canonical spec)
- Regenerate `policy/appetite.yaml` to the real `policy-schema.md §3.1` structure — the existing file
  predates tech-spec and uses a stale, non-matching schema (`meta:` wrapper, `track_classification_rules`,
  `control_library`, `platform_registry`, etc.). Replace with the canonical starter file per
  `policy-schema.md §10` (Starter Config Pre-Population): flat top-level `version`/`policy_id`/`firm_name`,
  the 3 starter hard lines, 3 track rules, 4 tier rules, minimal invariants/controls, `kri_thresholds`
  as green/amber/red bands, `jurisdictions` array (`pack_files` as array per policy-schema.md §3.8 DORA
  fix), `tier_workflow`, `translation_attestation` with `[FIRM]` markers. Full 3-pack wave-1 authoring is
  P2-C03 (human-led) — this chunk's regenerated file may reference empty/placeholder jurisdiction packs.
- `PolicyEditor.tsx` — file upload or paste textarea; shows validation errors inline
- All `PolicyValidationError` variants typed and surfaced in the UI
- `src/types/policy.ts` — all shared policy types (re-exported from `src/engine/types.ts` where the
  canonical vocabulary lives per §3.0 — do not redefine the enums here)

**Tests:**
- `TC-CF-1-01` — policy file editable in plain text without developer tooling
- `TC-CF-5-01` — policy file with missing required field prevents evaluation
- `TC-CF-5-03` — valid policy file and packs load without error
- `TC-PE-8-01` (cross-traced, CF-2) — regenerated starter config loads and evaluates a use case with no
  hand-authoring required
- Invalid condition operator produces validation error (condition-language regression, no dedicated TC ID)
- Condition value outside §3.0 canonical vocabulary produces validation error

---

#### P2-C02 — IndexedDB stores (audit + register)

**Spec reference:** `verdict-audit.md §4.4`, `register-lifecycle.md §4.3`  
**Estimated time:** 3–4 hours  
**Parallel with:** P2-C01

**Deliverables:**
- `src/store/audit.ts` — real IndexedDB implementation:
  - `aigate-audit` DB, `audit_events` object store, `by_use_case` index
  - `append(event: AuditEvent): Promise<void>` using `db.add()` (not `put()`)
  - `getAll(useCaseId: string): Promise<AuditEvent[]>`
  - `getAllForExport(): Promise<AuditEvent[]>`
- `src/store/register.ts` — real IndexedDB implementation:
  - `aigate-register` DB, `register_nodes` and `register_edges` stores
  - All indexes: `by_type`, `by_submitted_by`, `by_from_node`, `by_to_node`
  - All `RegisterStore` interface methods
- Both stores open cleanly on first launch (schema migration)
- `idb` library imported and used

**Tests:**
- `TC-VD-4-01` — append() twice with same event_id throws ConstraintError
- `getAll()` returns events in insertion order
- `getBlastRadius()` returns correct nodes for a known component
- Schema migration runs without error on empty IndexedDB

---

### Phase 3 — Evaluation Engine

**Goal:** The core pure function. No UI changes — the stub in `IntakeFlow.tsx` still calls `evaluate()`. By end of Phase 3, `evaluate()` is real and deterministic.

---

#### P3-C01 — Evaluation engine — 8-step pipeline

**Spec reference:** `evaluation-engine.md §3.1–3.8`  
**Estimated time:** 4–5 hours  
**Parallel with:** P3-C02 can begin as a spike after P3-C01 is half complete

**Deliverables:**
- `src/engine/evaluate.ts` — real 8-step pipeline replacing stub:
  1. Validate graph + policy schema
  2. Load jurisdiction overrides (most-demanding-standard)
  3. Evaluate hard lines → immediate Rejected if any trip
  4. Assign tier (impact-dominant)
  5. Assign track (first-matching rule)
  6. Evaluate invariants → collect tripped invariants
  7. Solve controls (calls `solvControls()` — stubbed as `return []` until P3-C02)
  8. Assemble Verdict
- `src/types/verdict.ts` — full `Verdict`, `VerdictConditions`, `ConfidenceCaveat` interfaces
- `src/engine/jurisdiction.ts` — jurisdiction override: most-demanding-standard
- `src/engine/tier.ts` — tier assignment
- `src/engine/track.ts` — track assignment
- Engine accepts the stub policy from P2-C01 (or the stub if P2-C01 is not yet complete in parallel builds)

**Tests:**
- `TC-PE-1-01` — determinism property: same graph + policy → identical verdict × 10 runs
- `TC-PE-2-01` — track assignment: signal-based track selection
- `TC-PE-3-01` — tier assignment: tier-triggering rule named in verdict
- `TC-PE-4-01` — hard line trip → immediate Rejected, no control solving
- `TC-PE-5-01` — jurisdiction override: most-demanding-standard applies

---

#### P3-C02 — Greedy set-cover control solver

**Spec reference:** `evaluation-engine.md §4`  
**Estimated time:** 2–3 hours  
**Parallel with:** none (replaces the stub used by P3-C01)

**Deliverables:**
- `src/engine/greedy-solver.ts`:
  - `solvControls(trippedInvariants, controlLibrary, inheritedControls, margin): SolverResult`
  - Greedy set-cover: at each step, add the control that resolves the most remaining invariants
  - Safety margin: solver must satisfy all invariants with `margin`% headroom
  - Returns `{ ok: true, controls: string[] }` or `{ ok: false, unsatisfiable: string[] }`
- `P3-C01` updated to call real solver instead of stub

**Tests:**
- `TC-CS-1-01` — greedy solver picks minimum set for a known invariant/control combination
- `TC-CS-1-02` — inherited platform controls reduce required controls
- `TC-CS-2-01` — unsatisfiable invariant set → Rejected with named invariants
- `TC-CS-3-01` — triggered downstream reviews appear in verdict

---

### Phase 4 — Intake Flow

**Goal:** Real intake wizard. LLM extraction, structured form, questions, contradiction detection, attestation. By end of Phase 4, a user can complete the full intake flow and receive a real verdict.

---

#### P4-C01 — Intake flow — LLM graph extraction + state machine

**Spec reference:** `intake-flow.md §3, §4`  
**Estimated time:** 4–5 hours  
**Parallel with:** P6-C01 can begin after P4-C04 (separate files)

**Deliverables:**
- `src/components/IntakeFlow.tsx` — real 9-state machine with `useReducer`; `IntakeState` discriminated union
- `src/llm/graph-extractor.ts` — Anthropic SDK call; tool_choice forced; Zod parse of response
- `DataFlowGraph` type with all node types from `intake-flow.md §4.2`
- `graph_review` state — renders graph nodes; `uncertain: true` nodes highlighted; Edit button per node
- Duplicate detection: semantic comparison (LLM) when API key present; keyword match fallback
- `GraphCorrection` interface and correction recording

**Tests:**
- `TC-UC-3-01` — LLM-extracted graph has correct structure
- `TC-UC-3-02` — uncertain nodes highlighted in graph review
- `TC-UC-7-01` — correction recorded with before/after values + identity

---

#### P4-C02 — Structured form fallback (UC-3a)

**Spec reference:** `intake-flow.md §5`  
**Estimated time:** 2–3 hours  
**Parallel with:** P6-C01 (after P4-C04 API boundary is stable)

**Deliverables:**
- `src/components/StructuredForm.tsx` — all 12 fields from `intake-flow.md §5.2`; all select options from loaded policy (no hardcoded enums)
- `buildGraphFromForm(formValues): DataFlowGraph` — `intake_method: 'structured_form'`
- `usePolicy()` hook — `hasApiKey: boolean` drives path selection in `IntakeFlow.tsx`
- "Guided intake" banner shown when no API key

**Tests:**
- `TC-UC-3a-01` — structured form produces a valid `DataFlowGraph`
- `TC-UC-3a-02` — `intake_method: 'structured_form'` in audit trail
- `TC-UC-3a-03` — select options come from policy, not hardcoded
- `TC-UC-3a-04` — no error when no API key configured

---

#### P4-C03 — Question generation + contradiction detection

**Spec reference:** `intake-flow.md §6, §7`  
**Estimated time:** 3–4 hours  
**Parallel with:** nothing on this phase's critical path

**Deliverables:**
- `src/engine/question-generator.ts` — generates `IntakeQuestion[]` from graph + policy + active packs; count limits (max 5 low-tier, max 15 critical-tier)
- `src/engine/contradiction.ts` — `detectContradictions(description, answers, graph): Contradiction[]`
- `src/components/QuestionnaireStep.tsx` — renders questions; each answer dispatches to `IntakeFlow` reducer
- `src/components/ContradictionReview.tsx` — shows conflicting statements; forces resolution before advancing

**Tests:**
- `TC-UC-4-01` — uncertain nodes generate targeted questions
- `TC-UC-4-02` — question count does not exceed the tier-proportionate limit
- `TC-UC-5-01` — conflicting answers surface contradiction
- `TC-UC-5-02` — contradiction blocks advance to confirmation

---

#### P4-C04 — Attestation + confirmation → evaluation

**Spec reference:** `intake-flow.md §9`, `verdict-audit.md §4.3`  
**Estimated time:** 2–3 hours  
**Parallel with:** nothing — gating chunk for Phase 5+

**Deliverables:**
- `src/components/ConfirmationStep.tsx` — "Confirm and evaluate" button; shows final graph summary
- On confirm: `audit.append({ event_type: 'graph_confirmed', ... })` → `evaluate(graph, policy)` → `audit.append({ event_type: 'verdict_produced', ... })` → transition to `verdict` state
- `IntakeFlow.tsx` `evaluation_pending` state with loading indicator (< 200ms expected)
- Both audit events written before UI transitions

**Tests:**
- `TC-UC-6-01` — confirmation event written to audit trail before verdict
- `TC-UC-6-02` — verdict_produced event contains full Verdict object
- `TC-UC-6-03` — attested_by field matches current role

---

### Phase 5 — Verdict Display

**Goal:** Complete verdict UI. Correction flow. Plain-English trace.

---

#### P5-C01 — Verdict display + correction flow

**Spec reference:** `verdict-audit.md §5, §6`  
**Estimated time:** 3–4 hours  
**Parallel with:** P6-C01 (separate components after P4-C04 API is stable)

**Deliverables:**
- `src/components/VerdictDisplay.tsx` — status above the fold, binding constraint, controls list, downstream reviews
- Confidence caveat rendering (RA-11): Medium caveat inline; Low caveat as full-page warning with "Provisional" status
- Correction flow: "Correct a classification" → transition back to `graph_review` with `originalVerdictId` carried
- On re-evaluation: `audit.append({ event_type: 'graph_corrected' })` + `audit.append({ event_type: 'verdict_corrected' })`
- Original verdict event is never modified

**Tests:**
- `TC-VD-1-01` — verdict status visible above the fold
- `TC-VD-2-01` — binding constraint with graph path shown
- `TC-VD-3-01` — both original and corrected verdict in audit trail
- `TC-VD-3-02` — correction record includes identity and timestamp
- `TC-RA-11-01` — Medium confidence caveat displayed
- `TC-RA-11-02` — Low confidence verdict shows "Provisional" status

---

#### P5-C02 — Plain-English reasoning trace (VD-8)

**Spec reference:** `verdict-audit.md §7`  
**Estimated time:** 2–3 hours  
**Parallel with:** P6-C01 (separate module)

**Deliverables:**
- `src/llm/reasoning-trace.ts` — Anthropic SDK call; `VerdictTraceData` → prose
- Prompt: passes all structured verdict fields verbatim; instructs "reference only data provided"
- Trace stored in `verdict_produced` audit event `payload.reasoning_trace` field
- Fallback: `reasoning_trace: null` → UI shows template-based summary
- `<details>` element in `VerdictDisplay.tsx` for the reasoning trace

**Tests:**
- `TC-VD-8-01` — reasoning trace contains at least one regulatory citation (e.g. "SS1/23 §3.4")
- Trace unavailable renders fallback without error
- No API key: trace section shows "configure API key" message

---

### Phase 6 — Register

**Goal:** Full register view. Role access. Lifecycle stages. Tier routing. Policy re-eval trigger.

---

#### P6-C01 — Register view — 1LoD + 2LoD + role access

**Spec reference:** `register-lifecycle.md §5, §10`  
**Estimated time:** 3–4 hours  
**Parallel with:** P5-C01, P5-C02 (different components)

**Deliverables:**
- `src/components/RegisterView.tsx` — two views: 1LoD (own use cases), 2LoD (all use cases)
- Role driven by `localStorage['aigate:role']`; filter applied at `RegisterStore.getUseCases(role)` level
- 2LoD view: tier/track/stage filter chips; full-text search over use case names
- Use case row: name, submitter (2LoD only), tier, track, lifecycle stage, stale badge
- `stale_assessment` computed from comparing current pack versions vs verdict's `pack_versions`

**Tests:**
- `TC-RG-2-01` — 1LoD sees only own use cases
- `TC-RG-2-02` — 2LoD sees all use cases
- `TC-RG-3-01` — filter by Critical tier returns only Critical

---

#### P6-C02 — Lifecycle stage + tier routing + policy re-eval trigger

**Spec reference:** `register-lifecycle.md §6, §7, §8`  
**Estimated time:** 3–4 hours  
**Parallel with:** nothing — depends on P6-C01

**Deliverables:**
- `src/engine/workflow-router.ts` — reads `policy.tier_workflows`; returns `WorkflowAction`
- `register.updateLifecycleStage()` used throughout intake and verdict flows to advance stage
- `src/store/policy.ts` `onPolicyUpdated()` — queues re-evaluation for all active use cases
- "Policy updated" banner in 2LoD register view
- `register-lifecycle.md §6` lifecycle stage constants and transition guards

**Tests:**
- `TC-LC-1-01` — stage advances Exploring → Pre-checked after verdict
- `TC-LC-2-01` — Low-tier verdict: lifecycle advances to Approved automatically
- `TC-LC-2-02` — High-tier verdict: lifecycle stays Pre-checked pending 2LoD action
- `TC-LC-4-01` — policy update queues all active use cases for re-evaluation

---

### Phase 7 — Integration & Closure

**Goal:** AIGate self-assessment. Export. Spec parity script. Full product startup verification.

---

#### P7-C01 — AIGate self-assessment seed (LC-6)

**Spec reference:** `register-lifecycle.md §9`  
**Estimated time:** 2–3 hours  
**Parallel with:** nothing — depends on P6-C01

**Deliverables:**
- `src/seeds/aigate-self-assessment.ts` — `AIGATE_USE_CASE_GRAPH` constant
- Called once on first launch (empty register check)
- Runs real `evaluate()` against loaded policy
- Inserts use case node, Anthropic vendor node, edges, and verdict event into IndexedDB
- If AIGate's own verdict is Rejected: UI shows "AIGate does not satisfy its own controls — policy review required" governance alert

**Tests:**
- `TC-LC-4-02` — AIGate appears in register with a real verdict
- AIGate verdict contains policy_version from the current loaded policy
- Re-evaluation is triggered when policy updates (LC-4 applies to AIGate's use case record)

---

#### P7-C02 — Export + spec parity check script

**Spec reference:** `register-lifecycle.md §10.3`  
**Estimated time:** 2 hours  
**Parallel with:** nothing

**Deliverables:**
- `RegisterStore.exportAll()` → JSON download in `RegisterView.tsx` (2LoD only)
- `scripts/spec-parity-check.py` — checks cross-spec invariants:
  - R1: `Verdict` interface fields consistent between `evaluation-engine.md` and `verdict-audit.md`
  - R2: All TypeScript types referenced in specs are defined in at least one spec
  - R3: `LifecycleStage` values consistent across `register-lifecycle.md` and `verdict-audit.md`
  - R4: All module paths referenced in specs exist in `src/` directory (when project is built)
  - R5: All `AuditEventType` variants referenced in specs match the discriminated union definition
- Exit code 0 = clean, 1 = findings, 2 = script error

**Tests:**
- `TC-RG-5-01` — exported JSON contains all nodes and edges
- Parity script: `python3 scripts/spec-parity-check.py` exits 0 on the current spec suite

---

#### P7-C03 — Integration closure + product startup verification

**Spec reference:** All specs — closes all deferred wiring seams  
**Estimated time:** 3–4 hours  
**Parallel with:** nothing — final chunk

**Deliverables (wiring seams closed):**
- Verify `reasoning-trace.ts` output is written to `verdict_produced` audit event (P5-C02 deferred to P7)
- Verify `workflow-router.ts` output drives lifecycle stage update in `IntakeFlow.tsx` after verdict (P6-C02 deferred to P7)
- Verify `stale_assessment` badge in `RegisterView.tsx` correctly computes from audit events (P6-C01 deferred to P7)
- Verify `PolicyEditor.tsx` triggers `onPolicyUpdated()` on save (P6-C02 deferred to P7)
- Verify AIGate self-assessment runs on every first launch (P7-C01 integration check)

**Product startup verification:**
1. `npm run build` — TypeScript compilation passes with zero errors
2. `npm run dev` — Vite dev server starts on localhost:5173
3. Load default policy (starter config from CF-2)
4. Submit the example use case from the requirements walkthrough scenario
5. Verify: verdict produced, reasoning trace generated, use case appears in register, AIGate self-assessment entry present, export produces valid JSON
6. `python3 scripts/spec-parity-check.py` — exits 0

All smoke tests in this chunk are manual verification steps — they supplement (not replace) the automated test suite.

---

## 6. Claude-Specific Chunking Rules

**Context loading per chunk:** Each chunk's Claude prompt must include:
1. This implementation guide (or the relevant Phase section)
2. `cross-cutting.md` (conventions section only — §5 and §6)
3. The one domain spec most relevant to the chunk (e.g., `intake-flow.md` for P4 chunks)
4. The prior chunk's handover file (`build/handovers/P{N}-C{N}.md`) if available

**Do NOT re-load all 6 domain specs per chunk.** The domain spec for the current chunk is sufficient. If a type definition is needed from another spec, quote the relevant interface only.

**Chunk size guidance:** Each chunk fits comfortably in one context window (this guide + one domain spec + one handover = ~15K tokens). If a chunk's deliverable list feels too large, split by data variation (Cohn): e.g., if P4-C01 proves too large, split into "LLM path" and "state machine" as separate chunks.

**Large spec sections:** `evaluation-engine.md §3` is long. For P3-C01, load `evaluation-engine.md §1–3` only. Load `§4` (solver) only for P3-C02.

---

## 7. Test Co-location Rule

Every non-spike chunk includes its tests in the same delivery. The convention:
- `src/engine/evaluate.ts` → `src/engine/evaluate.test.ts` (engine/store colocate tests as siblings, not a `__tests__/` subfolder — only `src/components/*` uses `__tests__/`, per the actual convention adopted in P1-C01)
- `src/store/audit.ts` → `src/store/audit.test.ts`
- `src/components/VerdictDisplay.tsx` → `src/components/__tests__/VerdictDisplay.test.tsx`

**Never create a separate "write tests" chunk.** If tests are separate from the implementation in a chunk's deliverable list, the chunk is not complete.

Test framework: Vitest + Testing Library (per `cross-cutting.md`).

---

## 8. Parallel Work Identification

The following pairs can run as parallel Claude subagents dispatched in the same session:

| Pair | Why safe |
|---|---|
| P2-C01 ∥ P2-C02 | Different files: `policy.ts` vs `audit.ts` / `register.ts` |
| P5-C01 ∥ P6-C01 | Different components: `VerdictDisplay.tsx` vs `RegisterView.tsx`. Both require P4-C04 to be complete. |
| P5-C02 ∥ P6-C01 | `reasoning-trace.ts` and `RegisterView.tsx` share no source files |

**Merge strategy for parallel pairs:** Sequential merge. Each parallel chunk targets a different file set (share-nothing). Review both PRs for type compatibility (the `AuditEvent` and `Verdict` types are shared) before merging the second.

---

## 9. Integration Closure Verification

Before marking any phase complete, verify:
- [ ] All TypeScript: `npm run build` exits 0
- [ ] All tests: `npm run test` — no failures
- [ ] Handover file written to `build/handovers/P{N}-C{XX}.md`
- [ ] Spec parity: `python3 scripts/spec-parity-check.py` exits 0 (after P7-C02 exists)

Phase 7-C03 additionally verifies the product starts and the primary user flow completes end-to-end (manual verification steps above).

---

## 10. Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-06-04 | Initial creation. Starts at P1 — no prior build phases in `build/handovers/`. |

---

*Developed using the Grounded Vibe Methodology*

---

## 11. Phase 8 — Round 3: Reachable Reasoning

Round 3 is an increment to a running product. It implements
`requirements-003.md` (13 requirements) against `test-cases-003.md` (33 test
cases), and touches four specs: `intake-flow.md` §13, `evaluation-engine.md`
§13, `verdict-audit.md` §13, `register-lifecycle.md` §15.

**Base phase number.** P8 — P1–P7 are in use by the V1 build (collision scan
over `build/handovers/` and this guide, 2026-07-29). The intervening
V1.1/V1.2/V2 handovers are ad-hoc chunk IDs from a period when the build
departed from the P{N}-C{XX} scheme; round 3 returns to it.

**MVP-1.** The first user-facing chunk is P8-C01, which delivers a complete
user-visible behaviour end to end: the user is asked a question, cannot proceed
without answering it, and the answer reaches the graph the engine evaluates.
No MVP-1 exemption is claimed.

### 11.1 The verdict-query constraint (HR3-08) — corrected

An earlier draft of this guide made query-tightening a standalone first chunk,
on the belief that rendering the verdict on the register detail page would break
existing tests. **That was not verified and is not true.**

The `/approved|rejected/i` assertions live at `WalkingSkeleton.test.tsx:79` and
`:135`. Both fire on the **verdict screen**, before the test navigates to the
register at line 85, and that navigation reaches `RegisterView` (the list), not
`RegisterDetail`. There is no `RegisterDetail.test.tsx` at all. No existing
query can break.

The real risk is forward-looking, and it belongs to P8-C06: that chunk writes
the first tests against a `RegisterDetail` that now renders "Approved with
controls". Its queries must be scoped — to a container, a role, or a test id —
never a bare single-match on verdict text. That is recorded as a constraint on
P8-C06 rather than as a chunk of its own.

The correction is kept in the record rather than quietly removed: the original
claim was inherited from a standing warning in `CLAUDE.md` and applied without
checking whether it fit this change.

### 11.2 Chunks

| Chunk | Delivers | Specs | Test cases | Depends on |
|---|---|---|---|---|
| **P8-C01** | Jurisdiction answered-state: three states, "none / not sure" control, help text naming the consequence | intake-flow §13.1, §13.2 | TC-R3-JU-1-01…-05, TC-R3-JU-4-01 | — |
| **P8-C02** | Required-field markers — visible marker + `aria-required`, set-equal in both directions | intake-flow §13.3 | TC-R3-JU-5-01, -02 | P8-C01 |
| **P8-C03** | Draft migration — pre-round-3 drafts load as unanswered | intake-flow §13.4 | TC-R3-JU-7-01, -02 | P8-C01 |
| **P8-C04** | `Verdict.provisional_reasons`; both existing derivations replaced by reads | evaluation-engine §13 | TC-R3-JU-2-01…-03, TC-R3-JU-6-01…-04, TC-R3-NF-1-01, -02 | — |
| **P8-C05** | Verdict renders the prose statement and the labelled causes | verdict-audit §13 | TC-R3-JU-3-01…-03 | P8-C04 |
| **P8-C06** | Register detail renders the six decision-bearing elements; no-verdict case; no write on render. **Constraint:** its new `RegisterDetail` tests must scope queries to a container or role — never a bare single-match on verdict text (§11.1). | register-lifecycle §15 | TC-R3-RD-1-01…-03, -2-01, -02, -3-01, -02, -4-01, -5-01, TC-R3-NF-2-01, -02 | P8-C04 |

### 11.3 Dependency network

```
P8-C01 ──┬── P8-C02
         └── P8-C03

P8-C04 ──── P8-C05
   └────────────────────── P8-C06
```

**Critical path:** P8-C04 → P8-C06 (engine field, then the page that reads it).

### 11.4 Parallelism (share-nothing)

Two tracks touch disjoint files and may run in parallel:

| Track | Chunks | Files |
|---|---|---|
| Intake | P8-C01 → P8-C02, P8-C03 | `StructuredForm.tsx`, `intake-draft.ts`, `build-graph-from-form.ts` |
| Verdict | P8-C04 → P8-C05 | `src/engine/*`, `VerdictDisplay.tsx`, `store/register.ts` |

P8-C06 is the closing chunk — it modifies
`RegisterDetail.tsx`, which no other round-3 chunk touches, and depends on the
verdict track's output.

**The one shared file is `store/register.ts`**, edited by P8-C04 (replacing the
local Provisional derivation with a read). No other chunk touches it, so the
share-nothing rule holds.

### 11.5 Integration closure

P8-C06 is the closing chunk: after it, every round-3 seam is wired — the form
produces an answered-state, the engine emits reasons, the verdict renders them,
and the register page reads the verdict. The verification is a live walkthrough
of both changed screens, plus `npm test` ×3 (per the ordering-sensitivity rule
in `CLAUDE.md`), `npx tsc --noEmit`, `npm run build`, and
`python3 scripts/spec-parity-check.py`.

An exploratory re-walk (`/gvm-explore-test` charter 005) should follow, to
confirm charter 004's D-001, D-002 and D-005 no longer reproduce. Charter 004's
remaining defects — D-001 (intake description discarded), D-004 (register shows
the input-node name), D-006 (vendor silently defaulted) — are **not** in Phase 8.
They are defects against existing behaviour with no round-3 requirement, and
need their own routing.

### 11.6 Changelog

| Date | Change |
|---|---|
| 2026-07-29 | Phase 8 added — round 3. Base phase P8 chosen after collision scan over `build/handovers/` (P1–P7 in use). Wiring matrix extended with five round-3 rows. The standalone query-tightening chunk from the first draft was dropped after verification showed no existing test breaks (§11.1); the constraint moved onto P8-C06. |
