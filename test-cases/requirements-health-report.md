# AIGate — Requirements Health Report

**Generated:** June 2026  
**Requirements version:** 1.0  
**Skill:** /gvm-test-cases — Phase 1

---

## Expert Panel

| Expert | Work | Role in This Document |
|--------|------|-----------------------|
| Lee Copeland | *A Practitioner's Guide to Software Test Design* | Testability assessment — identifying untestable requirements |
| Cem Kaner | *Testing Computer Software* (2nd ed.) | Risk-based triage — severity and priority of each issue |
| Boris Beizer | *Software Testing Techniques* (2nd ed.) | Missing coverage detection — error guessing, edge cases |
| NIST | *AI Risk Management Framework (AI RMF 1.0)* | AI governance domain grounding |
| EU AI Act | *Regulation (EU) 2024/1689* | Regulatory compliance domain grounding |

---

## Summary

10 issues found across the requirements document.  
- 2 are inconsistencies (contradictory claims)  
- 4 are untestable or missing fit criteria  
- 4 are missing requirements (implied but absent)

None block test generation outright. Issues are resolved or acknowledged before proceeding.

---

## Issues Found

### Issue HR-01 — Untestable: "substantially similar" undefined (UC-2)

**Requirement:** UC-2  
**Type:** Untestable — vague language  
**Severity:** Medium  

UC-2 requires duplicate detection for "substantially similar" use cases with similarity "above a configurable threshold." The fit criterion does not define a default threshold, the algorithm (semantic vs keyword, per OQ-4), or what constitutes a "match." Tests for UC-2 cannot be written with concrete pass/fail criteria until OQ-4 is resolved and a default threshold is stated.

**Suggestion:** Add to UC-2 fit criterion: "Default similarity threshold: 0.80 (configurable). Algorithm: LLM-based semantic comparison if API key present; keyword/tag match otherwise (per OQ-4 recommended default)."

---

### Issue HR-02 — Untestable: "standard laptop" undefined (NF-5)

**Requirement:** NF-5  
**Type:** Untestable — missing hardware baseline  
**Severity:** Low  

The 30-second verdict target is measurable, but the fit criterion says "on a standard laptop" without defining what that means. Performance tests cannot be written against an undefined baseline.

**Suggestion:** Define "standard laptop" as: MacBook Air M-series or equivalent (8GB RAM, no dedicated GPU), or state the test will be run on the development machine and the result recorded as a baseline.

---

### Issue HR-03 — Near-duplicate requirements: CF-1 / PE-7 (policy file)

**Requirements:** CF-1, PE-7  
**Type:** Duplicate — overlapping scope  
**Severity:** Low  

PE-7 (Policy Engine domain) and CF-1 (Configuration domain) both require a human-readable, versioned YAML policy file. PE-7 adds the requirement that all invariants, tier rules, track rules, hard lines, control library, and KRI thresholds are in the file. CF-1 adds role assignments and tier-to-workflow mappings. They are not identical but substantially overlap. Tests written for PE-7 will largely cover CF-1.

**Suggestion:** Acknowledge as intentional — two different frames on the same artefact (engine behaviour vs configuration). Tests can be written once and traced to both IDs.

---

### Issue HR-04 — Near-duplicate requirements: PE-5/6 / RA-1/2 (jurisdiction logic)

**Requirements:** PE-5, PE-6, RA-1, RA-2  
**Type:** Duplicate — overlapping scope  
**Severity:** Low  

PE-5 and PE-6 specify jurisdiction override logic from the engine's perspective. RA-1 and RA-2 specify the same behaviour from a regulatory compliance perspective. This creates test redundancy but is intentional — the two domains provide different accountability frames (engine correctness vs regulatory correctness).

**Suggestion:** Acknowledge as intentional. Cross-trace tests to both IDs where they cover the same behaviour.

---

### Issue HR-05 — Missing requirement: fallback form intake (no API key path)

**Type:** Missing requirement  
**Severity:** High  

The handoff document, CLAUDE.md, and NF-3 all reference a fallback to structured form intake when no LLM API key is configured. UC-3 describes only the LLM extraction path. No requirement covers:
- What the structured form looks like
- Which fields are presented
- What the minimum required fields are
- How the form output maps to a data-flow graph

Without this requirement, the fallback path has no test cases.

**Suggestion:** Add UC-3a: "When no LLM API key is configured, the system shall present a structured intake form covering the minimum graph attributes required for evaluation (data class, autonomy level, data zone, output exposure, jurisdictions). The form output shall produce a data-flow graph equivalent to LLM extraction."

---

### Issue HR-06 — Missing requirement: policy file validation / load failure handling

**Type:** Missing requirement  
**Severity:** High  

RA-7 states "a pack without source citations is invalid and rejected on load" — but no requirement specifies what happens on rejection: does the application refuse to start? Show an error screen? Fall back to the previous valid version? NF-1 says evaluation must be deterministic, which implies the policy file must be in a known-valid state before evaluation can begin. The behaviour on load failure is unspecified.

**Suggestion:** Add CF-5: "The system shall validate the policy file on load. If the file fails validation (missing required fields, malformed YAML, pack rules lacking source citations per RA-7, policy file lacking translation attestation per NF-10), the system shall display an explicit error identifying the invalid rule or field, and prevent evaluation until the error is resolved. It shall not silently fall back to a previous version."

---

### Issue HR-07 — Missing requirement: API key configuration UX

**Type:** Missing requirement  
**Severity:** Medium  

NF-3 states the user supplies their own LLM API key, but no requirement describes the configuration mechanism: How does the user enter the key? Where is it stored? Is it validated on entry? What is shown when the key is invalid or absent? This affects UC-3 (LLM graph extraction), UC-2 (semantic duplicate detection), and the fallback path (HR-05).

**Suggestion:** Add NF-11: "The system shall provide a configuration screen for the LLM API key. The key is stored in the browser's localStorage, never transmitted by the application itself, and displayed as a masked field. If the key is absent or invalid, the system falls back to structured form intake (UC-3a) and keyword-based duplicate detection."

---

### Issue HR-08 — Inconsistency: NF-2 provisional audit trail vs VD-4 absolute claim

**Requirements:** NF-2, VD-4  
**Type:** Inconsistency — contradiction between requirements  
**Severity:** High  

NF-2 honestly states: "V1 is therefore honestly positioned as provisional / proof-of-concept grade for audit purposes. Any deployment intended to produce a regulator-defensible audit trail requires V1.5." VD-4, however, says: "No verdict, correction, or attestation can be deleted or modified after the fact" and "the audit trail is available to 2LoD on demand" — stated as absolutes with no provisional caveat.

This means VD-4's fit criterion is unachievable for V1 as specified. Tests written for VD-4 will pass (the application shows records and has no delete button), but the underlying storage is editable, making the absolute claim misleading.

**Suggestion:** Add the NF-2 provisional caveat to VD-4's fit criterion: "For V1, immutability is enforced at the application layer — there is no delete or edit function. Physical immutability (regulator-defensible) requires V1.5. Verdicts issued under V1 are marked 'Provisional audit trail — V1 client-side deployment.'"

---

### Issue HR-09 — Missing fit criterion: RG-1 graph query performance

**Requirement:** RG-1  
**Type:** Untestable — missing performance criterion  
**Severity:** Low  

RG-1 requires the data model to be a graph and states that queries like "which use cases share this vendor model?" are "answerable without full-table scans." This is a non-functional constraint but has no latency bound. Tests for graph query performance cannot be written without a target.

**Suggestion:** Add to RG-1 fit criterion: "Blast-radius and shared-component queries complete in under 2 seconds on a register of 500 use cases on the reference hardware defined in NF-5."

---

### Issue HR-10 — Missing requirement: behaviour when AIGate fails its own pre-check (LC-6)

**Requirement:** LC-6  
**Type:** Missing — edge case  
**Severity:** Medium  

LC-6 requires AIGate to submit itself as a use case under its own pre-check. The fit criterion says: "If AIGate cannot satisfy its own gates, the gates are reconsidered." This is a policy statement, not a testable behaviour. No requirement covers the process for what "reconsidering the gates" means — who is notified, what the action is, what is recorded.

**Suggestion:** Add to LC-6 fit criterion: "If AIGate's self-assessment produces a Rejected verdict, the system shall display a prominent warning to the 2LoD role: 'AIGate self-assessment: REJECTED — [invariant]. This system is operating outside its own appetite. The 2LoD owner must review and either resolve the invariant or formally accept the deviation.' The warning is shown on first login each session until resolved."

---

## Decisions Required

Each issue needs one of: **Fix** (go back to /gvm-requirements and resolve before test generation), **Acknowledge** (record and proceed — test coverage will note the gap), or **Proceed** (continue without recording, may resurface next run).

| Issue | ID | Severity | Recommended disposition |
|---|---|---|---|
| "Substantially similar" undefined | HR-01 | Medium | Acknowledge — OQ-4 deferred to tech-spec; write tests against both algorithm paths |
| "Standard laptop" undefined | HR-02 | Low | Acknowledge — record development machine as test baseline |
| CF-1 / PE-7 near-duplicate | HR-03 | Low | Acknowledge — intentional dual-frame; cross-trace tests |
| PE-5/6 / RA-1/2 near-duplicate | HR-04 | Low | Acknowledge — intentional; cross-trace tests |
| Missing fallback form requirement | HR-05 | High | **Fix recommended** — fallback path has no coverage without a requirement |
| Missing policy validation requirement | HR-06 | High | **Fix recommended** — load failure behaviour is testable and important |
| Missing API key config requirement | HR-07 | Medium | Acknowledge — implicit in NF-3; write tests against reasonable defaults |
| NF-2 / VD-4 inconsistency | HR-08 | High | Acknowledge — inconsistency is known and documented in NF-2; test against application-layer immutability |
| RG-1 missing performance criterion | HR-09 | Low | Acknowledge — 2-second default assumed for tests |
| LC-6 missing failure behaviour | HR-10 | Medium | Acknowledge — write test against the intent (warning displayed), not the unspecified process |

---

*Developed using the Grounded Vibe Methodology*


---

# Health Report — Run 2 (2026-07-26)

Triggered by `/gvm-status`, which flagged test-cases as stale and PV as
uncovered. **Both flags needed correcting.** Findings below supersede the
`/gvm-status` reading where they conflict.

## HR-11 — Staleness alarm was a FALSE POSITIVE (methodology finding)

`/gvm-status` reported `requirements.md` (mtime 2026-07-12) newer than
`test-cases.md` (mtime 2026-06-13) — a 29-day drift implying the test cases
were derived from superseded requirements.

**Not true.** Git shows both files were last changed *in the same commit*:

```
c6f1892  2026-06-13  review: Section 6 — Remaining significant fixes
  requirements/requirements.md | 24 +++---
  test-cases/test-cases.md     | 95 +++++++++++++++++++
```

The 2026-07-12 mtime came from the `git filter-repo` history rewrite performed
that day, which rewrites every file and resets mtimes without changing
content. Content-wise the two artefacts are **in sync**.

**GVM gap worth recording:** shared rule 19 specifies mtime comparison for
staleness detection. In any repository that has had `git filter-repo` (or
`rebase`, or a fresh clone) run, mtimes are unreliable and the check produces
false positives across the whole pipeline at once. The commit date of the last
content change is the sound signal. This project has had **two** history
rewrites (2026-07-12 and 2026-07-26), so every mtime-based staleness reading
here is suspect.

**Disposition:** no test-case regeneration required for staleness.

## HR-12 — PV was built despite being a recorded V2+ deferral

`/gvm-status` reported PV-1..PV-8 as having zero test coverage, which is
literally true. But the traceability matrix records *why*:

```
| PV-1 through PV-8 | Must/Should | V2+ | — (V2+ scope, out of MVP) |
| OB-1 through OB-5 | Must/Should | V1.5/V2+ | — (V1.5/V2+ scope, deferred) |
```

PV was **deliberately deferred to V2+**, not overlooked. Zero coverage was the
correct state for the MVP.

Implementation for PV-1/2/3/5/6/8 was nonetheless written (commit `f640005`),
on the mistaken basis that PV was an unbuilt V1 gap. It is working and tested
(9 tests, 236 passing), but it is **out-of-scope work against the recorded
plan**, and two artefacts now disagree with reality:

1. The traceability matrix still says PV is V2+ / not built.
2. Earlier completion reporting treated PV and OB as V1 shortfalls, producing
   a "75% of Round 1" figure. Excluding the 13 deliberately-deferred
   requirements, V1's actual MVP scope is 67 requirements and is complete.
   **The 75% figure was wrong and is withdrawn.**

**Disposition required from the practitioner** — this is a scope decision, not
a test-design one.

## HR-13 — `TC-CS-1-02` denotes three different tests

| Artefact | Meaning |
|---|---|
| `test-cases/test-cases.md` | Safety margin maintained — control set keeps use case inside margin |
| `specs/implementation-guide.md` (line 286) | Inherited platform controls reduce required controls |
| `src/engine/greedy-solver.test.ts` | Tie-breaks equal-coverage candidates by lowest burden |

Three definitions of one ID across requirements, spec and code. The
implementation-guide meaning describes PV inheritance — behaviour that the
matrix says was deferred, so the guide was referencing a test for
functionality that was out of scope, under an ID already in use.

Per shared rule 24 (fix-propagation), resolving this requires edits to all
three artefacts in one pass, not just to `test-cases.md`.

**Disposition required from the practitioner.**


## HR-14 — CS-1 (Must) is half implemented, and the ID collision was hiding it

Resolving HR-13 surfaced a larger problem. CS-1 states:

> When a use case is in appetite but requires controls, the system shall
> compute the control set that satisfies all tripped invariants **while
> maintaining a configurable safety margin from the appetite boundary**.
> "Minimal" means smallest set that achieves the required margin — not
> closest to the line.

Its fit criterion is explicit: *"The system solves for the smallest control
set that satisfies all invariants AND keeps the use case inside the margin."*
It then names the failure mode directly: *"Optimising for minimum controls
without margin optimises for developer convenience at the cost of governance
resilience."*

**What is actually implemented:**

| CS-1 element | Status |
|---|---|
| Smallest set satisfying all tripped invariants | Built |
| Safety margin honoured during selection | **Not built** |
| Boundary-proximity warning | Built |

`safety_margin` is declared in the policy schema, validated to 0.0–1.0 in
`src/store/policy.ts`, and threaded through `evaluate.ts` into
`solvControls` — where the parameter is named `_margin`. The underscore is
the TypeScript convention for *deliberately unused*. The value is read,
validated, passed, and discarded.

So the engine performs exactly the optimisation CS-1 names as wrong.

**Why nobody noticed:** the traceability matrix records CS-1 as covered by
`TC-CS-1-01, TC-CS-1-02`. TC-CS-1-01 (minimal set) is genuinely covered.
TC-CS-1-02 was *supposed* to cover the margin — but its ID had been reused in
code for a burden tie-break test, so the suite passed and coverage looked
complete. **The duplicate ID was concealing an unimplemented Must
requirement.**

This is the third instance of the same defect class in this project:
regulatory citations computed and dropped at verdict assembly (V1),
`platform_satisfies` declared and never read (fixed today by PV-A), and now
`safety_margin`. CLAUDE.md already warns about it: *"A field that is computed
but never consumed is a bug in waiting."* The warning exists because it keeps
happening.

**Disposition required from the practitioner** — this is a build gap, not a
test-design one, and per shared rule 25 it must not be silently skipped.
