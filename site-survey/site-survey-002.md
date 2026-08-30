# AIGate — Site Survey 002

**Date:** 2026-08-26 · **Surveyed at:** v0.17.0 (commit 69e412a, working tree clean at survey time) · **Scope:** full repository · **Prior survey:** site-survey-001 (2026-08-18, v0.13.0)

## 1. Executive Summary

AIGate remains a **Coherent** codebase (Scenario 1) eight days and one full UI redesign (R15, five chunks, v0.17.0) later. Phase 2 ran as a genuine module-per-agent fan-out for the first time — the first live use of the newly-wired `gvm-graph` skill — with every architectural claim independently verified against real code rather than trusted from a single worker's report. The core four-boundary architecture holds: the engine's "pure island" claim, the store's append-only audit trail, and the LLM SDK's single-import boundary were all re-verified true, not just re-asserted. Two real, fixable issues surfaced that survey-001 did not have to catch: a UI label-mapping regression introduced during R15 (`RegisterDetail.tsx` shows a raw enum where the register list correctly shows a plain-language label), and three high-severity dependency CVEs (js-yaml, nanoid, postcss), all fixable via `npm audit fix` with no breaking changes. Neither is architectural — both are the kind of thing a healthy, fast-moving codebase accumulates between surveys. The health scorecard is unchanged at the top (Documentation and Currency both 5/5) with one new score this round (Usability, now tracked given R15's redesign) and one real deduction (Dependency Health, 3/5, for the unpatched CVEs). Two tracks follow from this survey: a **targeted fix** round (`/gvm-build` directly) for the two issues found here, and — separately — **`/gvm-requirements`** for the post-deployment monitoring work (V2) already scoped in `strategy/post-deployment-positioning.md`, which should be fed in as seed input rather than started from a blank page.

## 2. Codebase Profile

| Attribute | Value |
|---|---|
| Language / framework | TypeScript (strict), React 18, Vite 8, Vitest 4, Zod, idb (IndexedDB), js-yaml, Anthropic SDK |
| Source size | ~30,447 LoC across `src/` (incl. tests) · 76 test files, 682 tests |
| Modules | `engine/` 24 files, 3,138 LoC · `components/` 21 files, 7,975 LoC · `store/` 12 files, 1,372 LoC · `llm/` 6 files, 721 LoC · `seeds/` 4 files, 912 LoC · `types/` 2 files, 51 LoC |
| Policy corpus | `policy/appetite.yaml` + jurisdiction packs + `grounding/risk-knowledge.yaml` (MIT AI Risk Repository-derived, 13 curated entries) |
| Git history | 239 commits, single contributor (`oza977-max`), all activity within the last year |
| Hotspots | `App.css`, `IntakeFlow.tsx`, `VerdictDisplay.tsx`, `engine/types.ts`, `engine/evaluate.ts` — all expected round-cadence files, no fix-after-fix churn pattern |
| Documentation | 14 requirements docs (rounds 002–015), 8 paired spec docs, 14 test-case docs, a requirements health-report with a decisions log, CHANGELOG.md, HANDOVER.md, plus user-facing docs (approach, glossary, regulator brief, user guide) |
| Dependency health | **3 high-severity CVEs found this round** (js-yaml — production, exponential-time DoS in flow-collection parsing; nanoid and postcss — dev/build tooling), all fixable via `npm audit fix`, no `--force` required |

## 3. Architectural Map

**Pattern:** the same four-boundary layered architecture from survey-001, re-verified independently this round via `gvm-graph`'s module-per-agent fan-out rather than a single sequential pass:

1. **`src/engine/*` — pure functional island, re-verified.** A rules-engine pipeline: `evaluate()` orchestrates ~9 named steps, each delegated to a single-purpose module. Fresh grep across all non-test engine imports found only type imports, relative imports, and `zod` (schema validation, no I/O) — no React, no SDK, no `Date.now()`/`Math.random()` outside comments stating the rule. Determinism mechanism confirmed concrete: policy collections explicitly sorted by id before iteration (`evaluate.ts:44-48`). `Result<T,E>` discriminated unions used consistently instead of exceptions.
2. **`src/store/*` — persistence only, one nuance worth naming.** Repository pattern over IndexedDB (`db.ts` centralises all `openDB` access). The audit trail is genuinely append-only at the write layer — `append()` uses `db.add()`, not `put()`, and throws on duplicate ID (`audit.ts:24-29`), with no update/delete function anywhere in the module. A real store-layer concurrency mechanism exists (a monotonic tie-breaker for same-millisecond writes, `audit.ts:15-22`), distinct from the UI's `useRef` guard. One thing that looked like a boundary violation on first read and was independently verified benign: `register.ts` imports `isVerdictProvisional` and `isSampledForReview` from `src/engine` — both are pure, side-effect-free predicates (confirmed by reading their implementations), matching the code's own ADR comment ("read the engine's determination, never re-derive it") rather than contradicting the stated persistence-only rule. Two limitations are acknowledged in-code, not hidden: register updates and their audit-event writes are not transactional (documented V1 limitation), and `getUseCases` has an N+1 query pattern (documented as an accepted V1 scaling limit).
3. **`src/llm/*` — sole SDK boundary, re-verified.** A thin gateway pattern (`client.ts`) wraps the Anthropic SDK; a parallel gateway (`local-provider.ts`) wraps a local Ollama model behind the same `LlmResult` contract. Project-wide grep for `@anthropic-ai/sdk` found exactly one real import (`client.ts`) — every other hit is a `vi.mock(...)` stub in a test file. `isLoopbackUrl` is enforced twice independently in the local-model path as deliberate defence-in-depth, called out in comments as "belt and suspenders."
4. **`src/components/*` — presentation only, mostly holds, one confirmed regression.** No component defines its own evaluation/scoring logic — all business logic is delegated to `src/engine`/`src/store`. The `useRef` in-flight-guard convention against duplicate audit writes was applied faithfully across every new state-heavy component R15 introduced. **Confirmed bug:** `RegisterDetail.tsx:569` renders the raw `lifecycle_stage` enum value directly (e.g. `pre_checked`) instead of mapping it through `STAGE_LABELS`, even though `RegisterView.tsx` (same data, same field-copy module) correctly shows the plain-language label on the register list. `RegisterDetail.tsx` only imports `TIER_MEANINGS`/`TRACK_MEANINGS` from `field-copy.ts`, confirming this is a real omission, not an unused-import artefact. This is exactly the kind of inconsistency R15-C1 was built to eliminate — it fixed the register list and missed the detail page. Separately, `field-copy.ts` (the shared copy source) is imported by only 5 of 16 top-level components — worth a light convention pass, not urgent.
5. **`src/seeds/*` — genuinely uses the real engine, re-verified.** All three seed generators (`sample-register.ts`, `ib-portfolio.ts`, `aigate-self-assessment.ts`) call `evaluate()` from `src/engine` and construct persisted verdicts from its real output — none fabricate a result. One real inconsistency: the three seed files disagree on failure handling when `evaluate()` fails — one throws, one silently skips — not yet unified.

**Enterprise patterns present:** Repository (store), append-only event log (audit trail), pure-function evaluation core, gateway/adapter (LLM boundary, dual-provider), discriminated-union error handling, advisory-by-construction subsystems (risk-knowledge lens, precedents — structurally incapable of touching the verdict).

## 4. Health Scorecard

| Dimension | Score | Evidence |
|---|---|---|
| Coherence | **4** | Consistent patterns verified across all four modules; two real inconsistencies found this round (RegisterDetail label gap, field-copy.ts partial adoption) keep it off 5 |
| Currency | **5** | React 18, TypeScript 5.6, Vite 8, Vitest 4 — nothing dated |
| Testability | **4** | 682 tests; IndexedDB and network properly mocked in every relevant test; a handful of files (`client.ts`, `duplicate-check.ts`, two small components, `knowledge-lens-for-seed.ts`) have no dedicated test file |
| Modularity | **4** | Engine's pure-island boundary independently re-verified true; store access is spread across 8 of 16 top-level components rather than centralised through fewer containers |
| Documentation | **5** | Inline Rule/ADR citations at every boundary; 14 requirements docs, 8 specs, 14 test-case docs, CHANGELOG, HANDOVER — exceeds what most production teams maintain |
| Dependency Health | **3** | 3 high-severity CVEs found this round (js-yaml production, nanoid + postcss dev), all trivially fixable via `npm audit fix`, none abandoned |
| Usability | **4** | R15 specifically targeted this dimension (plain-language labels, accessible disclosures); the confirmed RegisterDetail bug is precisely the kind of regression this score exists to catch |

## 5. Diagnosis

**Scenario: Coherent (unchanged from survey-001).** The score pattern — high coherence, high currency, high documentation, with narrow and specific deductions rather than diffuse ones — matches a single disciplined author following one methodology consistently across 239 commits and five UI redesign rounds since the last survey. Nothing found this round suggests drift or fracture; the two issues found are the ordinary residue of fast, real shipping, not evidence of an eroding design. The user confirmed this diagnosis matches their own sense of the codebase before this survey proceeded to expert selection.

## 6. Risk Areas

| Priority | Finding | Evidence |
|---|---|---|
| **Important** | `RegisterDetail.tsx` shows a raw `lifecycle_stage` enum value instead of the plain-language `STAGE_LABELS` mapping that `RegisterView.tsx` correctly uses for the same field — a real UI inconsistency a 2LoD reviewer would see on the detail page after seeing the correct label on the list. | `src/components/RegisterDetail.tsx:569` vs `src/components/RegisterView.tsx:268,347` |
| **Important** | Three high-severity dependency CVEs: js-yaml (production, exponential parsing time / DoS in flow collections — the library that parses `policy/appetite.yaml`), nanoid and postcss (dev/build tooling). All fixable via `npm audit fix` with no breaking-change flag required. | `npm audit` output, 2026-08-26 |
| **Minor** | Register updates and their corresponding audit-event writes are not transactional — a partial-write risk under failure, acknowledged in-code as a documented V1 limitation. | `src/store/register.ts:188-226` |
| **Minor** | Three seed generators disagree on failure-handling philosophy when `evaluate()` fails (throw vs silent skip) — not itself a bug, but an inconsistency worth unifying. | `src/seeds/aigate-self-assessment.ts:127-129` vs `src/seeds/sample-register.ts:176-177` |
| **Minor** | Shared copy source `field-copy.ts` is imported by only 5 of 16 top-level components — worth a light convention sweep to confirm the other 11 have no duplicate-string exposure, not urgent. | `src/components/RegisterView.tsx:9` vs absence in `StepTracker.tsx`, `AboutPanel.tsx`, `SimilarCases.tsx`, `ContradictionReview.tsx` |
| **Minor** | `client.ts`, `duplicate-check.ts`, `knowledge-lens-for-seed.ts`, `StepTracker.tsx`, and `ContradictionReview.tsx` have no dedicated test file — exercised only indirectly via other files' tests. | `src/llm/` and `src/components/__tests__/` directory listings |

## 7. Diagnostic Experts Used

| Expert | Role in this survey | Cited in diagnosis? |
|---|---|---|
| Martin Fowler (*Refactoring* 2e, *PoEAA*) | Pattern identification — rules-engine pipeline, repository, gateway patterns | Yes — architectural map §3 |
| Michael Feathers (*Working Effectively with Legacy Code*) | Legacy/testability assessment — seams, characterisation, test coverage gaps | Yes — health scorecard, risk areas |
| Martin Kleppmann (*Designing Data-Intensive Applications*) | Data-layer diagnosis — append-only trail verification, concurrency handling, N+1 pattern | Yes — architectural map §3, risk areas |
| Sam Newman (*Building Microservices* 2e) | Boundary assessment — module boundaries, SDK import confinement | Yes — architectural map §3 |

## 8. Expert Coverage Assessment

No new domain, pattern, or technology surfaced this round that isn't already covered by the project's existing 53-expert roster (accumulated across prior GVM rounds). The stack is unchanged since survey-001; the one new activity this round — `gvm-graph`'s module-per-agent fan-out — is itself the execution mechanism, not a domain requiring its own grounding expert. No gaps found; no new experts discovered or added.

## 9. Recommended Project Experts

The existing roster (53 experts, accumulated across 15+ prior GVM rounds) remains current and sufficient. Full roster spans:

**Tier 1 (architecture, testing, requirements, writing):** Martin Fowler, Frederick Brooks, Kent Beck, Robert C. Martin, Sandi Metz, Steve McConnell, Andrew Hunt, Paul Clements, Simon Brown, George Fairbanks, Michael Keeling, Bass/Clements/Kazman, Boris Beizer, Cem Kaner, Lee Copeland, Dan North, Karl Wiegers, Jeff Patton, Mike Cohn, Alan Cooper, Jean-luc Doumont, Robert McKee, George Orwell, Gerald Weinberg, William Zinsser, Joseph Williams, Janice Redish, Robert Marzano, Stevens & Levi, Tom Gilb, Clayton Christensen.

**Tier 2a (data & service patterns):** Martin Kleppmann, Sam Newman, Michael Feathers.

**Tier 2b (banking / AI-risk regulatory):** PRA SS1/23, OSFI E-23, Federal Reserve/OCC/FDIC SR 26-2, NIST AI RMF, EU AI Act, COSO ERM, MAS FEAT, James Lam, Philippa Girling, Emanuel Derman, Cathy O'Neil, Christoph Molnar, Stuart Russell, Virginia Eubanks, Nassim Nicholas Taleb.

**Discovered (Tier "discovered"):** Michael Power (*The Audit Society*), Margaret Mitchell et al. (Model Cards), OWASP (LLM Top 10), BJ Fogg (*Tiny Habits*), Donald Reinertsen (Product Development Flow).

Status: all existing, none newly added this round.

## 10. Route Recommendation

Two separate tracks follow from this survey, because two kinds of work are waiting:

**Track A — targeted fix, route to `/gvm-build` directly.** The RegisterDetail label bug and the dependency CVEs are both well-understood, well-scoped fixes in a Coherent codebase. Per the route matrix (Coherent + Targeted fix → `/gvm-build`), no requirements phase is needed — the fix is the requirement.

**Track B — user-facing feature, route to `/gvm-requirements`.** The post-deployment monitoring work (V2) already scoped in `strategy/post-deployment-positioning.md` and `design-vision.md`'s V2 section is new functionality that changes what a 2LoD reviewer experiences. Per the route matrix (Coherent + User-facing feature → `/gvm-requirements`), and per this skill's own rule on existing documentation as seed input (§5.4), both documents should be fed into that round rather than starting from a blank page.

The user decides which track to run first, or both — the survey recommends, it does not mandate.

## 11. Open Questions

- Whether the three-seed-file failure-handling inconsistency (throw vs. silent skip) should be unified now or left as a low-priority convention item — not assessed as urgent by this survey, left to the owner.
- Whether `field-copy.ts`'s partial adoption (5 of 16 components) reflects components that genuinely have no shared-copy needs, or latent duplicate-string exposure — would need a closer per-file read than this survey's module-level scan performed.

---

*Developed using the Grounded Vibe Methodology*
