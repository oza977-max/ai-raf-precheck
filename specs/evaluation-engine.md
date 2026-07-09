# AIGate — Evaluation Engine Specification

**Version:** 1.0  
**Date:** June 2026  
**Status:** Draft  
**Covers:** Evaluation pipeline, hard-line detection, track assignment, tier assignment, jurisdiction override, control solver (CS-1/CS-2), determinism guarantee, reasoning trace structure

---

## Expert Panel

| Expert | Work | Role in This Document |
|--------|------|-----------------------|
| Martin Kleppmann | *Designing Data-Intensive Applications* (O'Reilly 2017) | Data flow, determinism, share-nothing evaluation |
| George Fairbanks | *Just Enough Software Architecture* (Marshall & Brainerd 2010) | Risk-driven depth — control solver is the novel/risky part |
| Kent Beck | *Test-Driven Development: By Example* (Addison-Wesley 2002) | TDD discipline — deterministic engine = ideal TDD target |
| Stuart Russell | *Human Compatible* (Viking 2019) | Agentic AI control, corrigibility, minimal footprint — informs autonomy level treatment |
| SS1/23 | PRA *Model Risk Management Principles* (2023) | Track II ceiling, technology-agnostic MRM |
| SR 26-2 | Fed/OCC/FDIC *Model Risk Management* (2026) | Track III assignment, GenAI governance |
| EU AI Act | *Regulation (EU) 2024/1689* | Annex III forced-Critical tier |
| OSFI E-23 | *Enterprise-Wide Model Risk Management* (eff. 2027) | Broadest model definition — Canadian entity override |

---

## 1. Purpose

This spec defines the evaluation engine — the pure-function core of AIGate. It takes a confirmed data-flow graph and a loaded policy (main file + active packs) and returns a deterministic verdict. No LLM calls. No randomness. No external state.

**Files:**
- `src/engine/evaluate.ts` — main pipeline
- `src/engine/greedy-solver.ts` — minimal control set solver
- `src/engine/jurisdiction.ts` — pack application and most-demanding-standard merge
- `src/engine/contradiction.ts` — contradiction detection (UC-5, OB-2)
- `src/engine/types.ts` — shared types (defined in policy-schema spec)

---

## 2. Architecturally Significant Requirements

| ASR | Requirement | Architectural impact |
|---|---|---|
| Deterministic verdict | NF-1, PE-1 | Engine is a pure function: `evaluate(graph, policy) → Verdict`. No side effects, no randomness, no time-dependent logic |
| Hard lines evaluated first | PE-4 | Evaluation order is enforced — hard lines before control solving |
| Most demanding standard governs | PE-6, RA-2 | Jurisdiction merge step takes the maximum across all active packs |
| Minimal control set with safety margin | CS-1 | Solver minimises burden while maintaining configurable headroom from appetite boundary |
| Unsatisfiable invariant named on reject | CS-2 | Rejected verdict must name the invariant and explain why no control resolves it |
| Verdict within 30 seconds | NF-5 | Engine evaluation (excluding LLM) must complete in < 5 seconds; solver complexity must be bounded |

---

## 3. Evaluation Pipeline

### 3.1 Pipeline overview

```
evaluate(graph: DataFlowGraph, policy: PolicyFile): Result<Verdict, EngineError>

Step 1: Resolve active jurisdiction packs
Step 2: Evaluate hard lines → immediate Rejected if any trip
Step 3: Assign track (ordered rules, short-circuit at first match)
Step 4: Assign tier (impact-dominant rules, highest tier wins)
Step 5: Apply jurisdiction overrides → upgrade track/tier to jurisdictional minimum
Step 6: Evaluate invariants against the graph → collect tripped invariants
Step 7: Solve for minimal control set satisfying all tripped invariants + safety margin
Step 8: If no set satisfies → Rejected + name unsatisfiable invariant
Step 9: Assemble and return Verdict
```

This order is non-negotiable. Each step can only access data produced by prior steps — no backward references. This is the determinism guarantee (Kleppmann: data flows forward, no cycles).

### 3.2 Step 1 — Jurisdiction pack resolution

```
resolveActivePacks(
  jurisdictions: string[],          // from graph
  jurisdictionRegistry: JurisdictionEntry[],
  loadedPacks: Map<string, JurisdictionPack>
): JurisdictionPack[]
```

For each jurisdiction code in the graph, look up the corresponding pack file in the registry and return the loaded pack object. If a jurisdiction code has no registered pack, include a warning in the verdict (not an error — unknown jurisdiction = no override applied).

### 3.3 Step 2 — Hard line evaluation

```
evaluateHardLines(
  graph: DataFlowGraph,
  hardLines: HardLine[]
): HardLineResult

type HardLineResult =
  | { tripped: false }
  | { tripped: true; hardLineId: string; reason: string; regulatoryBasis: string }
```

Hard lines are evaluated in order. **First trip returns immediately** — no need to evaluate all hard lines. The reason and regulatory basis from the hard line definition are passed through to the verdict.

If a hard line trips, `evaluate()` returns immediately with:
```typescript
{
  status: 'rejected',
  reason: 'hard-line',
  hardLineId: 'HL-001',
  bindingConstraint: 'HL-001',
  bindingPath: <path from graph that triggered the condition>,
  ...
}
```

No control solving occurs. No jurisdiction overrides are applied (they cannot un-reject a hard line).

### 3.4 Step 3 — Track assignment

```
assignTrack(
  graph: DataFlowGraph,
  trackRules: TrackRule[]
): TrackAssignment

interface TrackAssignment {
  track: Track;
  ruleId: string;    // The rule that matched
  ruleName: string;
}
```

Track rules are evaluated in order. **First match returns** (short-circuit). If no rule matches, the function returns an `EngineError` of kind `'no-track-match'` — this is a policy configuration error, not a use case rejection.

### 3.5 Step 4 — Tier assignment

```
assignTier(
  graph: DataFlowGraph,
  tierRules: TierRule[]
): TierAssignment

interface TierAssignment {
  tier: Tier;
  triggeringRuleId: string;
  triggeringField: string;
  triggeringValue: unknown;
}
```

All tier rules are evaluated. Each trigger in each rule is checked against the graph. **The highest tier whose trigger fires is returned** (impact-dominant, order-independent). Tier hierarchy: Critical > High > Medium > Low.

If no tier rule triggers, the default is Low (a use case with no high-impact signals is Low by default).

**Property test:** permuting the `tiers` array must never change any verdict. TC-PE-3-01 covers this invariant.

### 3.6 Step 5 — Jurisdiction overrides

```
applyJurisdictionOverrides(
  baseTrack: Track,
  baseTier: Tier,
  graph: DataFlowGraph,
  activePacks: JurisdictionPack[]
): JurisdictionOverrideResult

interface JurisdictionOverrideResult {
  finalTrack: Track;
  finalTier: Tier;
  appliedOverrides: AppliedOverride[];   // Which pack rules fired and what they changed
}
```

For each active pack, evaluate each rule's condition against the graph. Collect all `track_floor` and `tier_floor` effects that fire.

**Most demanding standard governs (PE-6, RA-2) — supplement model:**

Pack rules with `supplement_obligations` effect add required controls and validation obligations to the assigned track; they never reduce the track below the jurisdictional minimum. A Track III use case under SS1/23 retains Track III classification but inherits the SS1/23 MRM obligation set. Track classification is unchanged; obligations are additive.

```typescript
const TRACK_ORDER: Record<Track, number> = { 'I': 3, 'II': 2, 'III': 1 };
const TIER_ORDER: Record<Tier, number> = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };

// Tier override: choose the HIGHER tier
finalTier = maxBy(allTiers, t => TIER_ORDER[t]);

// Track: supplement_obligations rules ADD to the obligation set; track classification is unchanged
// (track_floor effect type is removed — use supplement_obligations in pack rules)
appliedObligations = collectSupplementObligations(activePacks, graph);
```

Applied overrides are recorded in the verdict for full traceability (VD-2, RA-9).

### 3.7 Step 6 — Invariant evaluation

```
evaluateInvariants(
  graph: DataFlowGraph,
  invariants: Invariant[]
): TrippedInvariant[]

interface TrippedInvariant {
  invariantId: string;
  description: string;
  graphPath: string;    // e.g. "client_email_data → external_model_zone_a"
}
```

All invariants are evaluated against the graph. All tripped invariants are collected (not short-circuit — we need the complete set for the solver). The graph path that triggered each invariant is recorded for the verdict's `bindingPath` (VD-2).

**Multi-node condition semantics:** a condition over a node attribute matches if ANY node on ANY input→output path satisfies it. The matching path is recorded as `binding_path`. Tests: TC-PE-1-03 (multi-node graph), TC-PE-2-06 (`no-track-match` error surfaced).

### 3.8 Step 7 + 8 — Control solver

See §4 below.

### 3.9 Step 9 — Verdict assembly

`evaluate()` returns a pure `EvaluationResult` — byte-identical across runs for the same inputs. The caller wraps it in a `Verdict` envelope adding `id`, timestamps, and attestation. TC-PE-1-01 / TC-NF-1-01 point at `EvaluationResult`.

```typescript
// Pure result — deterministic, no identity or time fields
interface EvaluationResult {
  status: 'approved' | 'approved_with_controls' | 'rejected';
  tier: Tier;
  track: Track;
  binding_constraint: string;          // ID of the rule/invariant that determined the outcome
  binding_path: string;                // Graph path that triggered the binding constraint
  controls: string[];                  // Control IDs required
  downstream_reviews: string[];        // Triggered downstream review types
  conditions: VerdictConditions;       // VD-7: hypothesis schema for V2 monitoring
  policy_version: string;
  pack_versions: Record<string, string>;
  applied_overrides: AppliedOverride[];
  confidence_caveats: ConfidenceCaveat[];  // Medium/Low confidence rules that fired (RA-11)
  boundary_proximity: boolean;         // True if any satisfied invariant has zero redundant coverage (CS-1)
  explanation: VerdictExplanation;     // V1.1-C01: the "why" — rationale + citations, deterministic
}

// V1.1-C01: wired from data the engine already computed (tier/track
// assignment rationale, hard-line reason + regulatory_basis, tripped
// invariant details) and previously discarded at verdict assembly.
interface RuleRationale {
  rule_id: string;
  rule_name?: string;
  matched_field?: string;
  regulatory_basis?: string;
}

interface TrippedInvariantDetail {
  id: string;
  description: string;
  severity: string;
  regulatory_basis?: string;
  required_controls: string[];
  graph_path: string;
}

interface VerdictExplanation {
  tier_rationale: RuleRationale | null;   // null on hard-line rejection (assignment skipped)
  track_rationale: RuleRationale | null;
  hard_lines_checked: number;
  invariants_checked: number;
  tripped_invariants: TrippedInvariantDetail[];  // the FULL set (closes the P5-C02 one-element approximation)
  binding_reason: string | null;
  binding_regulatory_basis: string | null;
}

// Envelope — added by caller, never by evaluate()
interface Verdict extends EvaluationResult {
  id: string;                          // UUID v4 — added by caller
  use_case_id: string;
  living_status: 'approved' | 'amber' | 'breached' | 'revoked';
  living_status_updated_at: string;    // ISO 8601
  attested_by: string;
  attested_at: string;
  graph_version: number;
  corrections: VerdictCorrection[];
}
```

**Status determination:**
- `rejected` if any hard line tripped OR control solver returned no satisfying set
- `approved_with_controls` if tripped invariants exist AND a satisfying control set was found
- `approved` if no invariants tripped after jurisdiction overrides

---

## 4. Control Solver (CS-1, CS-2)

### 4.1 Problem statement

Given:
- A set of tripped invariants T = {t₁, t₂, ..., tₙ}
- A control library C = {c₁, c₂, ..., cₘ} where each cᵢ has `resolves: string[]` (invariant IDs it satisfies) and `burden: 1..5`
- A safety margin parameter `margin` (default 0.10, meaning the solver must satisfy all invariants with 10% headroom)
- Controls already inherited from approved platforms P ⊆ C

Find: the smallest subset S ⊆ (C \ P) such that:
1. For every invariant tᵢ ∈ T: (∃ cⱼ ∈ S ∪ P such that tᵢ ∈ cⱼ.resolves)
2. The total burden of S is minimised
3. If multiple sets of equal size exist, choose the one with the lowest total burden

If no such S exists: return the unsatisfiable invariant (the one no control in C covers).

### 4.2 Algorithm (greedy, bounded complexity)

The control library is small (O(100) controls at most). A greedy set-cover with burden tie-breaking is O(n × m) where n = invariants, m = controls. This is well within the 5-second budget for any realistic policy file.

```
FUNCTION solve(trippedInvariants, controlLibrary, inheritedControls, margin):
  
  unsatisfied = trippedInvariants
  selected = []
  
  // Remove invariants already satisfied by inherited controls
  FOR each invariant IN unsatisfied:
    IF any inherited control resolves it:
      REMOVE invariant from unsatisfied
  
  // Greedy: at each step, pick the control that resolves the most unsatisfied invariants
  // Tie-break: lower burden wins
  WHILE unsatisfied is not empty:
    candidates = controls that resolve at least one invariant in unsatisfied
    
    IF candidates is empty:
      RETURN { satisfiable: false, unsatisfiableInvariant: first(unsatisfied) }
    
    best = argmax(candidates, score=|resolved ∩ unsatisfied|, tiebreak=min(burden))
    selected.append(best)
    unsatisfied = unsatisfied MINUS best.resolves
  
  RETURN { satisfiable: true, controls: selected }
```

**Safety margin application:** After finding the minimal set, the solver checks whether the use case sits within the safety margin. In MVP, the margin is applied as a flag: if the use case is approved but no control provides headroom above the minimum (all invariants are satisfied at exactly 0 headroom), the verdict includes `boundary_proximity: true` (VD-6 / CS-4). Full margin-aware solving is V1.5.

### 4.3 Unsatisfiable invariant naming (CS-2)

When `candidates is empty` at any iteration, the unsatisfiable invariant is returned with:
- `invariantId`: the invariant ID
- `reason`: assembled from the invariant's description and the fact that no control in the library covers it
- `path`: the graph path that triggered it (from Step 6)

The verdict status is `rejected` with `reason: 'unsatisfiable-invariant'`.

### 4.4 Hard-line interaction

Hard lines (Step 2) are evaluated **before** the solver. Hard-line violations produce `reason: 'hard-line'`, not `reason: 'unsatisfiable-invariant'`. The distinction matters for the user-facing verdict message.

---

## 5. Contradiction Detection (UC-5, OB-2)

Contradiction detection runs **during intake** (not in the evaluation pipeline). It is invoked by the intake flow after each question answer, not by `evaluate()`. It is included in this spec because it shares graph and condition types.

```
detectContradictions(
  description: string,
  answers: QuestionAnswer[],
  graph: DataFlowGraph
): Contradiction[]

interface Contradiction {
  statement1: string;    // The original claim (from description or prior answer)
  statement2: string;    // The contradicting answer
  field: string;         // Which graph field is implicated
  resolveOptions: ContradictionResolution[];
}
```

Contradiction patterns detected:
1. **Description says X, answer says not-X** — e.g., "no client data" in description but "yes" to "does the tool process client relationship notes?"
2. **Two answers contradict each other** — e.g., "autonomy L1 (human approves each action)" combined with "tool can execute write operations without confirmation"
3. **Artifact vs self-attestation (OB-2)** — detected in intake-flow spec

---

## 6. Reasoning Trace Structure (VD-8)

The reasoning trace is assembled after `evaluate()` completes. It is not produced by the engine — it is produced by `src/llm/reasoning-trace.ts` which takes the `Verdict` object and calls the LLM to generate prose. The engine's job is to populate the verdict with enough structured data to make the trace generation deterministic and grounded.

**Verdict fields that ground the trace:**

```typescript
// These fields provide the structured facts the LLM uses for the trace
interface VerdictTraceData {
  track: Track;
  trackRuleId: string;           // e.g. "TRACK-II"
  trackRuleName: string;         // e.g. "Technology-agnostic MRM inclusion"
  tier: Tier;
  tierTriggeringRuleId: string;
  tierTriggeringField: string;
  appliedOverrides: AppliedOverride[];  // Each with source, section, verbatim text
  controls: string[];
  bindingConstraint: string;
  bindingPath: string;
  confidenceCaveats: ConfidenceCaveat[];  // For RA-11
}
```

The LLM prompt for reasoning trace construction includes all of these structured fields verbatim and asks the model to write prose that references them — not to interpret or infer. This keeps the trace grounded and auditable (NF-8).

---

## 7. Determinism Guarantee (NF-1)

The engine guarantees determinism through:

1. **Pure function**: `evaluate(graph, policy)` has no side effects and no access to external state (no Date.now(), no Math.random(), no localStorage reads)
2. **Sorted inputs**: Before evaluation, all arrays (invariants, controls, hard lines, pack rules) are sorted by ID to eliminate ordering non-determinism from YAML load order
3. **No LLM in the evaluation path**: The Anthropic SDK is never called within `evaluate()` or any function it calls
4. **Deterministic solver**: The greedy algorithm is deterministic when tie-breaking is deterministic (lowest burden, then alphabetical by control ID)

**Test strategy for NF-1 (TC-NF-1-01, TC-PE-1-01):** Run `evaluate()` 20 times on the same (graph, policy) pair and assert the result is identical. Include borderline cases (use cases where tier assignment depends on a single field).

---

## 8. ADR-004: Greedy Set-Cover vs SAT Solver for Control Solving

**Decision:** The control solver uses a greedy set-cover algorithm with burden tie-breaking. Not a SAT solver.

**Status:** Accepted

**Context:** The control solver is a set-cover problem (NP-complete in general). Options:
1. **SAT solver** (e.g., a Boolean satisfiability solver) — optimal for large instances; overkill for a control library bounded at O(100) items
2. **Greedy set-cover** — O(n×m); produces near-optimal results; simple to implement and audit; runs in milliseconds for any realistic policy file
3. **Exhaustive search** — O(2^m); infeasible for m > 20 controls

**Decision:** Greedy set-cover. The control library is small and human-curated — exact optimality is less important than auditability and speed. Greedy results are within a log-factor of optimal for set-cover, which is indistinguishable in practice for control libraries of this size.

**Consequences:** Very occasionally, the greedy solver may not return the globally minimal set (e.g., if two controls each resolve 2 invariants but a single control resolves 3). This is acceptable — the solver documentation notes this limitation. If needed, a branch-and-bound upgrade can be added as a V2 enhancement without changing the API.

---

## 9. ADR-005: Evaluation Order Enforcement

**Decision:** The evaluation pipeline is implemented as a sequential function with explicit typed results at each step. Not a rule engine, not a declarative policy language.

**Status:** Accepted

**Context:** Alternative approaches:
1. **Declarative rule engine** (Drools, CLIPS-style) — configurable evaluation order; complex dependency model; harder to reason about; not appropriate for a client-side browser application
2. **Sequential pipeline with typed intermediate results** — evaluation order is baked into code; each step can only access outputs from prior steps; easy to test and audit

**Decision:** Sequential pipeline. The evaluation order (PE-4 through PE-6, §3.1 above) is a hard requirement, not a configuration. Embedding it in code rather than a rule engine makes it auditable and testable with standard unit tests.

**Consequences:** Adding a new evaluation step requires a code change. This is a feature, not a limitation — it means the evaluation order is visible in code review and cannot be silently changed via policy file modification.

---

## 10. Integration Points

| Integrated with | What this spec provides |
|---|---|
| `policy-schema.md` | Consumes `PolicyFile`, `JurisdictionPack`, condition evaluation types |
| `intake-flow.md` | `detectContradictions()` called during intake; `evaluate()` called after graph confirmation |
| `verdict-audit.md` | `Verdict` type is the primary output; stored to IndexedDB by the audit store |
| `register-lifecycle.md` | Re-evaluation (LC-4) calls `evaluate()` with updated policy; result updates the register |

---

## 11. Requirement Traceability

| Requirement | Coverage |
|---|---|
| PE-1 | §3.1 pure function; §7 determinism guarantee |
| PE-2 | §3.4 track assignment |
| PE-3 | §3.5 tier assignment |
| PE-4 | §3.3 hard line evaluation; §4.4 hard-line/solver interaction |
| PE-5 | §3.6 jurisdiction override |
| PE-6 | §3.6 most-demanding-standard logic |
| CS-1 | §4 control solver; §4.2 algorithm |
| CS-2 | §4.3 unsatisfiable invariant naming |
| CS-3 | §3.9 downstream_reviews in verdict |
| NF-1 | §7 determinism guarantee |
| NF-5 | §2 ASR table; §4.2 O(n×m) complexity bound |
| UC-5 | §5 contradiction detection |
| VD-2 | §3.9 binding_constraint + binding_path in verdict |
| VD-7 | §3.9 conditions block in verdict |
| VD-8 | §6 reasoning trace structure |
| RA-2 | §3.6 most-demanding-standard implementation |
| RA-9 | §6 trace grounded in structured verdict data |
| RA-11 | §3.9 confidence_caveats field; verdict assembly |

## 12. Test Case References

| Test cases | Spec section |
|---|---|
| TC-NF-1-01, TC-PE-1-01, TC-PE-1-02 | §7 determinism; §3.1 pipeline |
| TC-PE-2-01 through TC-PE-2-03 | §3.4 track assignment |
| TC-PE-3-01 through TC-PE-3-03 | §3.5 tier assignment |
| TC-PE-4-01 through TC-PE-4-03 | §3.3 hard line evaluation |
| TC-PE-5-01, TC-PE-5-02 | §3.6 jurisdiction override |
| TC-PE-6-01, TC-PE-6-02 | §3.6 most-demanding-standard |
| TC-CS-1-01, TC-CS-1-02 | §4 control solver |
| TC-CS-2-01 | §4.3 unsatisfiable |
| TC-CS-3-01, TC-CS-3-02 | §3.9 downstream_reviews |
| TC-UC-5-01 through TC-UC-5-03 | §5 contradiction detection |
| TC-VD-8-01 | §6 reasoning trace |
| TC-RA-2-01 | §3.6 jurisdiction override |
| TC-RA-11-01, TC-RA-11-02 | §3.9 confidence_caveats |

---

*Developed using the Grounded Vibe Methodology*
