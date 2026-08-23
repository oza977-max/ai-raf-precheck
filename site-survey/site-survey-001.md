# AIGate — Site Survey 001

**Date:** 2026-08-18 · **Surveyed at:** v0.13.0 (commit 4ec0049, working tree clean) · **Scope:** full repository

## 1. Executive Summary

AIGate is a **Coherent** codebase (Scenario 1) — one consistent, deliberately enforced architecture, verified mechanically in this survey, with a test estate larger than its source (13,982 test LoC vs 12,885 source LoC, 597 tests across 62 files) and documentation discipline (21 requirements files, 9 paired spec documents with ADRs, per-round test-case docs, a backtest corpus with pinned predictions) that exceeds what most production teams maintain. The health scorecard is 5/5 on four of seven dimensions. The intended next work — the "R12 trust mechanics" round distilled from the three-panel concept review — is a user-facing feature round, so the recommended pipeline entry point is **`/gvm-requirements`** (as `requirements-012.md`), seeded by the panel findings. The risk register below carries one Critical item (automation-bias exposure on the self-service path) inherited from the concept review, not from code quality.

## 2. Codebase Profile

| Attribute | Value |
|---|---|
| Language / framework | TypeScript (strict), React 18, Vite, Vitest, Zod, idb (IndexedDB), js-yaml |
| Source size | 12,885 LoC (src, excl. tests) · 13,982 LoC tests · 62 test files, 597 tests |
| Modules | `engine/` 2,956 LoC (25 test files) · `components/` 6,750 (25) · `store/` 1,303 (6) · `llm/` 719 (3) · `seeds/` 867 (3) |
| Policy corpus | `policy/appetite.yaml` 988 lines · 3 jurisdiction pack files · `grounding/risk-knowledge.yaml` 174 lines (14 curated MIT-taxonomy entries) |
| Git history | 206 commits, single contributor (`oza977-max`), v0.2.0 → v0.13.0 across ~5 weeks of intense activity |
| Hotspots | `IntakeFlow.tsx` (41 modifications), `App.css` (42), `VerdictDisplay.tsx` (25), `WalkingSkeleton.test.tsx` (29) — all consistent with the UI-round cadence, not churn from defects |
| CI | GitHub Actions: test + tsc + build + spec-parity on every push; public repo, GitHub Pages deploy |

**Git archaeology note:** commit messages are uniformly disciplined (`feat:`/`fix:`/`docs:` + requirement/round references), each release tagged. The hotspot files are the two largest UI composition points — expected for a product that shipped nine UI-heavy rounds; neither shows fix-after-fix churn patterns.

## 3. Architectural Map

**Pattern:** a four-boundary layered monolith, declared in `specs/cross-cutting.md` §7 and CLAUDE.md, and — the survey's key finding — **actually true under mechanical verification**, not just claimed:

1. **`src/engine/*` — pure functional island.** Fresh grep across all non-test engine files for React, the Anthropic SDK, store/llm/component imports, `Date.now()` and `Math.random()`: zero violations (two grep hits are comments stating the rule). `evaluate(graph, policy) → Verdict` is a pure function; determinism is enforced by a 10-run whole-result serialization test (TC-PE-1-01) and policy collections are sorted before iteration.
2. **`src/llm/*` — sole SDK boundary.** `@anthropic-ai/sdk` imported in exactly one file (`llm/client.ts`); the local-model path (`local-provider.ts`) enforces loopback-only at probe and send. LLM output enters the system only through a Zod canonical-vocabulary gate plus verbatim quote-verification (R6), with unverifiable fields demoted to "guessed."
3. **`src/store/*` — persistence only.** Repository pattern over IndexedDB (Kleppmann-informed append-only audit store: no delete/update API surface); no React imports (verified). Register is a real adjacency-list graph (nodes + edges), not a flat table — including the `ai_model`/`uses_model` schema activated in R11.
4. **`src/components/*` — presentation only.** Calls engine/store functions; business logic pushed down. In-flight `useRef` guards against double-write races into the append-only trail (a real defect class, twice fixed, now conventionalized).

**Enterprise patterns present:** Repository (store), append-only event log (audit trail), pure-function evaluation core, discriminated-union event payloads (Vanderkam-style), advisory-by-construction subsystems (precedents, knowledge lens — structurally incapable of touching the verdict).

**Conventions:** uniform; reserved-words guard (`/approved|rejected/i`) enforced suite-wide; plain-language copy as a stated functional requirement; every rendered honesty state (PROVISIONAL, UNVERIFIED, "pending adoption") deliberate.

## 4. Health Scorecard

| Dimension | Score | Evidence |
|---|---|---|
| Coherence | **5** | One architecture, mechanically verified boundaries, uniform conventions across 9 build rounds |
| Currency | **5** | React 18 / Vite / Vitest / Zod / strict TS — current idioms throughout |
| Testability | **5** | Test LoC > source LoC; pure engine; determinism property tests; 597 green; fake-indexeddb for store isolation |
| Modularity | **5** | Four enforced boundaries; single SDK import point; advisory subsystems isolated by construction |
| Documentation | **5** | 21 requirements docs, 9 paired specs with ADRs, CLAUDE.md gotcha log, backtest corpus with pinned predictions, CHANGELOG per release |
| Dependency Health | **4** | 8 runtime deps, all maintained; minor version lag on `@anthropic-ai/sdk` and `zustand` 4.x; nothing vulnerable or abandoned |
| Usability (UI) | **4** | Plain-language discipline and honest states are strong; known concern: feature surface has outgrown the first-time-user path (panel finding C-4), 15+ field intake (C-1) |

## 5. Diagnosis — Scenario 1: Coherent

High, balanced scores; consistent patterns throughout; conventions followed; tests present and meaningful. New work should **extend** the existing design, not restructure it. Typical cause matches this project exactly: a single disciplined author with a methodology (GVM rounds: requirements → spec → test cases → build → ritual) applied consistently. No traces of drift, no mid-migration seams, no dead patterns.

One caveat the coherence itself creates: the codebase's health is **method-dependent and single-owner**. The discipline lives in CLAUDE.md, the specs, and one contributor's practice — a bus-factor observation echoed by the operational panel (C-2), not a structural defect.

## 6. Risk Areas

| Priority | Risk | Source |
|---|---|---|
| **Critical** | Automation bias on the Low-tier self-service path: fast, confident, unreviewed verdicts with no sampling audit — a consumer acting on this survey without addressing it would ship the exact failure mode the product warns others about | Concept-review panel A-4 |
| Important | Corpus staleness is calendar-enforced, not machine-enforced: no `max_staleness_days`, no verdict-level "review overdue" state | A-1 / B-4 / C-2 (three-panel convergence) |
| Important | "VERIFIED" quote badge oversells: proves verbatim presence, not that the quote supports the assigned value | B-1 |
| Important | Model-family approval (`version_pattern`) lacks a re-attest cadence — approves future releases nobody benchmarked | B-2 |
| Important | First-time-user surface: reviewer machinery (challenges, precedents, lens) visible on the developer path; intake length | C-1 / C-4 |
| Minor | Knowledge-lens entries lack `curated_by`/date attestation; memo attests a paraphrase not the YAML (hash gap); judge-002 rerun untracked | A-3 / A-5 / B-5 |

## 7. Diagnostic Experts Used

| Expert | Work | Role in survey | Cited |
|---|---|---|---|
| Martin Fowler | *Refactoring* 2e / *PoEAA* | Pattern recognition (Repository, event log, layering) | Yes — §3 |
| Michael Feathers | *Working Effectively with Legacy Code* | Testability/seam assessment | Yes — §4 Testability |
| Martin Kleppmann | *Designing Data-Intensive Applications* | Data-layer diagnosis (append-only log, adjacency-list register, schema evolution) | Yes — §3 |
| Sam Newman | *Building Microservices* 2e | Boundary assessment (module boundaries within monolith) | Yes — §3 |

## 8. Expert Coverage Assessment

**Covered by existing reference files:** AI governance & regulation (`industry/ai-governance.md`: NIST AI RMF, EU AI Act, SR 26-2, SS1/23, OSFI E-23, MAS FEAT, Russell, O'Neil, Eubanks — all pre-scored, mostly Canonical); model risk (`industry/model-risk.md`: SR 11-7, SS1/23, Derman, Rebonato, Wilmott, Taleb, Molnar, BCBS 239); architecture & data (`architecture-specialists.md`, `domain/data-intensive.md`); stack (TypeScript/React/testing via existing stack references used in specs: Vanderkam, Dodds, Beck).

**Gaps found (candidates surfaced by the concept-review panels, not yet in any reference file):**

| Candidate | Work | Gap covered | Proposed classification | Status |
|---|---|---|---|---|
| Michael Power | *The Audit Society* (OUP 1997) | Audit-ritual risk — attestation drifting from enforcement (finding A-5) | Established (pending scoring) | Discovered — awaiting user approval to persist |
| Donald Reinertsen | *Principles of Product Development Flow* (2009) | Adoption economics, queues, cost of delay (C-1) | Established (pending scoring) | Discovered — awaiting approval |
| BJ Fogg | *Tiny Habits* / Fogg Behavior Model | Voluntary-use trigger design (C-5) | Recognised (pending scoring) | Discovered — awaiting approval |
| Mitchell et al. | "Model Cards for Model Reporting" (FAT* 2019) | Model documentation tradition backing the approved-model registry (B-2/B-5) | Established (pending scoring) | Discovered — awaiting approval |
| OWASP | *LLM Top-10* (2023-25) | Prompt-injection / LLM-security grounding for the intake edge (B-1/B-6) | Established (pending scoring) | Discovered — awaiting approval |

## 9. Recommended Project Experts

| Expert | Work | Tier | Classification | Reference file | Status |
|---|---|---|---|---|---|
| Martin Fowler | *Refactoring* 2e / *PoEAA* | 1 | Canonical | architecture-specialists.md | Existing |
| George Fairbanks | *Just Enough Software Architecture* | 1 | Established | architecture-specialists.md | Existing |
| Michael Keeling | *Design It!* | 1 | Established | architecture-specialists.md | Existing |
| Kent Beck | *Test-Driven Development: By Example* | 1 | Canonical | architecture-specialists.md | Existing |
| Martin Kleppmann | *Designing Data-Intensive Applications* | 2a | Canonical | domain/data-intensive.md | Existing |
| Michael Feathers | *Working Effectively with Legacy Code* | 2a | Recognised | domain/legacy-code.md | Existing |
| NIST AI RMF 1.0 | Govern/Map/Measure/Manage | 2b | Canonical | industry/ai-governance.md | Existing |
| EU AI Act | Regulation (EU) 2024/1689 | 2b | Canonical | industry/ai-governance.md | Existing |
| SR 26-2 | Fed/OCC/FDIC MRM 2026 | 2b | Canonical | industry/ai-governance.md | Existing |
| PRA SS1/23 | MRM Principles for Banks | 2b | Canonical | industry/model-risk.md | Existing |
| OSFI E-23 | Enterprise-Wide MRM | 2b | Canonical | industry/ai-governance.md | Existing |
| MAS FEAT | FEAT Principles | 2b | Established | industry/ai-governance.md | Existing |
| SR 11-7 | Supervisory Guidance on MRM | 2b | Canonical | industry/model-risk.md | Existing |
| Stuart Russell | *Human Compatible* | 2b | Established | industry/ai-governance.md | Existing |
| Cathy O'Neil | *Weapons of Math Destruction* | 2b | Established | industry/ai-governance.md | Existing |
| Emanuel Derman | *Models.Behaving.Badly* | 2b | Established | industry/model-risk.md | Existing |
| Christoph Molnar | *Interpretable Machine Learning* 2e | 2b | Established | industry/model-risk.md | Existing |
| Dan Vanderkam | *Effective TypeScript* 2e | 3 | Established | stack references | Existing |
| Kent C. Dodds | Testing Library | 3 | Established | stack references | Existing |
| Michael Power | *The Audit Society* | 2b | Pending scoring | — (candidate) | Newly discovered |
| Donald Reinertsen | *Product Development Flow* | 2a | Pending scoring | — (candidate) | Newly discovered |
| BJ Fogg | Fogg Behavior Model | 2a | Pending scoring | — (candidate) | Newly discovered |
| Mitchell et al. | "Model Cards" | 2b | Pending scoring | — (candidate) | Newly discovered |
| OWASP LLM Top-10 | LLM security | 2b | Pending scoring | — (candidate) | Newly discovered |

## 10. Route Recommendation

**Work type:** user-facing feature round — the R12 "trust mechanics" scope distilled from the three-panel concept review (staleness enforcement, honesty-badge recalibration, family re-attest cadence, Low-tier sampling audit, pilot-mode provisional split).

**Route:** Coherent + user-facing feature → **`/gvm-requirements`**, producing `requirements/requirements-012.md` in "new round" mode, following the same numbered-round pattern as rounds 3–11.

**Seed input:** the three concept-review panel reports (A-1..A-7, B-1..B-6, C-1..C-6) and the synthesis, plus the quick-wins list (README reorder, `curated_by` fields, badge copy, judge-002 tracking) which can bypass the pipeline as documentation-only fixes under shared rule 7.

**Existing documents as seed:** requirements-001..011 (requirements), test-cases-003..011 (test cases), specs/ (7 spec domains) — all conform to the round pattern; R12 continues the sequence rather than restarting anything.

## 11. Open Questions

1. Whether the five discovered expert candidates should be scored and persisted to the reference files (user approval required per discovery process).
2. Whether R12 should also absorb the two deferred Should-items (R11-KL-4 coverage map; judge-002 rerun) or leave them parked.
3. The bus-factor observation (§5): no code answer exists — it is an adoption/organizational question for the deployment phase.

---

*Developed using the Grounded Vibe Methodology*
