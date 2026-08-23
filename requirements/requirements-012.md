# AIGate Requirements — Round 12

## Round 12 — Trust Mechanics: Every Panel Finding Closed

**Status: APPROVED by the user (2026-08-18) — "fix every finding." Full
scope: all 17 findings from the three-panel concept review (A-1..A-7,
B-1..B-6, C-1..C-6, as recorded in site-survey/site-survey-001.md §6),
plus a README legibility pass requested in the same approval.**

## Provenance

Three-panel GVM concept review (2026-08-18): Panel A (AI governance —
NIST RMF, SS1/23, EU AI Act, Michael Power), Panel B (frontier AI — evals
culture, model cards, OWASP LLM, MLOps), Panel C (operational efficiency —
Reinertsen flow, Fogg behavior design, enterprise adoption). Convergent
theme: the product's honesty machinery is state-of-the-art except on the
TIME axis (staleness trusts calendars) and the SALIENCE axis (some badges
over- or under-claim), and its adoption path optimizes for honesty over
champion wins. This round closes every finding or records an explicit,
argued deviation.

## 1. Functional Requirements

### R12-ST — Staleness becomes machine-enforced (A-1, B-4, C-2)

**R12-ST-1 (Must):** Jurisdiction pack files gain `retrieved_date` (already
present) plus `max_staleness_days` (per pack, authored). The ENGINE — not
the UI — computes, at evaluation time, whether any fired pack rule's
source is past its window, and appends a `stale_sources` list to the
verdict (pack code, retrieved date, days overdue). A verdict citing an
overdue source renders an undismissable "review overdue" marker in the
same honesty idiom as PROVISIONAL. Determinism: computed from
`graph`/`policy`/`packs` data plus an `evaluated_at` date the CALLER
passes in (the engine stays clock-free; NF-1 preserved — same inputs incl.
date → same output).

**R12-ST-2 (Must):** The Appetite framework screen's pack list shows each
pack's age ("retrieved N days ago · window D days") with an overdue state
— the lapsed-owner visibility Panel C asked for.

**R12-ST-3 (Must):** `grounding/risk-knowledge.yaml` gains a header block:
`curated_by`, `curated_date`, `taxonomy_version_reviewed`,
`review_owner`, `max_staleness_days`. The knowledge panel renders an age
warning when overdue, and names the review owner (closes A-3 and A-6
together: attribution + a named coverage-gap triage owner).

### R12-BD — Badge and cause recalibration (A-2, B-1, B-6, C-3)

**R12-BD-1 (Must):** The quote-verification affordance stops implying
validation: copy becomes "quote found verbatim in your description —
check it supports the value" (exact wording may vary; the claim may not
exceed what was checked). Where the model reports confidence
(`uncertain: false`) but the field has NO verified quote, the two signals
render TOGETHER as one combined state ("model confident — no verified
basis"), not as two independent badges a reviewer must cross-reference.

**R12-BD-2 (Must):** `derived`-basis pack rules render a distinct marker
at equal salience to `judgement`: "the regulator has not confirmed this
reading" — on the verdict's regulatory chain and in the memo export.

**R12-BD-3 (Must):** Provisional causes split visibly into two families:
**sign-off gaps** (closeable paperwork: unadopted packs, unattested
translation) vs **substantive caveats** (legal ambiguity, unclassified
decision types). The register view gains a pilot-mode line: "N of M
verdicts would be final once the outstanding sign-offs land."

### R12-AB — Automation-bias countermeasures (A-4 — Critical)

**R12-AB-1 (Must):** Deterministic **sampling queue**: every self-served
Low-tier verdict is eligible; selection is a pure function of the verdict
id (e.g. hash mod K), so the same verdicts are always selected — no
randomness in the engine's world. Selected cases surface on the 2LoD
register view as "sampling review due", with an event written when the
review happens (append-only trail, existing idiom). K configurable in
policy (`sampling_rate`), honest default documented.

**R12-AB-2 (Must):** The Rule challenges screen shows a per-rule
**challenge-rate instrument**: for each rule ever challenged, how many
verdicts it fired on vs how many challenges it drew — the leading
indicator Panel A asked for, computed from existing audit events, no new
writes.

### R12-MG — Model governance hardening (B-2, B-3, A-7)

**R12-MG-1 (Must):** Family entries (`is_family`) gain `reattest_by`
(ISO date). At evaluation, a family entry past its date no longer confers
approval — the declared model routes to the same model-governance review
as unlisted (date supplied by the caller, engine clock-free). Starter file
carries an honest example.

**R12-MG-2 (Must):** The Settings probe surfaces the local model's Ollama
digest next to the model name, so a firm deployment has something to diff
against a benchmarked build.

**R12-MG-3 (Should):** A-7 (re-evaluation on model change): policy edits
already queue all active use cases for re-evaluation, which covers
approved_models edits. The residual case — a deployed model changing
without any policy edit — is a RUNTIME-monitoring concern; recorded as an
explicit V2 note in forward-notes, not silently dropped.

### R12-AD — Adoption path (C-1, C-4, C-5, C-6)

**R12-AD-1 (Must):** README "Getting started" reordered: step 1 is
"back-test 10 of your own past committee decisions" (the backtest pack),
before any YAML editing. Plus the round's README legibility pass: a
first-screen "What am I looking at?" orientation (what this is, who it's
for, the three levers in one breath, where to click first) written for a
reader with zero context.

**R12-AD-2 (Must):** The 1LoD role's sidebar hides the reviewer-only
surface (Rule challenges) — the entry surface stays as narrow as the
pitch. Nothing is removed; the 2LoD role sees everything as today.

**R12-AD-3 (Must):** docs gain a "bring people back" section: the
bookmarkable deep-link pattern and a described CI/ticket-template
integration recipe (documentation of the trigger, not a new build
surface).

**R12-AD-4 (Deviation — recorded, not built):** C-1's "accept all
AI-drafted fields" one-click fast path is NOT built: it directly
contradicts the Critical finding A-4 (a one-click accept is automation
bias with a button). The per-field confirm gate stands. This deviation is
deliberate and argued here.

### R12-MISC (A-5, B-5)

**R12-MISC-1 (Must):** The challenge memo header carries a SHA-256 hash
of the active policy file content at generation time, so the memo is
verifiably tied to the enforced ruleset, not a paraphrase (A-5's intent,
proportionate V1 form).

**R12-MISC-2 (Must):** judge-002 (reason-before-prediction rerun) is
recorded in specs/forward-notes.md with an owner and trigger, no longer a
closed-looking experiment log.

## 2. Non-Functional (carried invariants)

- **R12-NF-1:** `evaluate()` byte-identical for identical inputs — the
  evaluation date becomes an explicit INPUT, never a clock read.
- **R12-NF-2:** No rendered string matches /approved|rejected/i; all new
  markers use appetite/honesty vocabulary.
- **R12-NF-3:** Append-only trail discipline for the sampling-review
  event; no new write paths beyond it.

## 3. Requirements Index

| ID | Closes | Priority |
|---|---|---|
| R12-ST-1/2/3 | A-1, B-4, C-2, A-3, A-6 | Must |
| R12-BD-1/2/3 | B-1, B-6, A-2, C-3 | Must |
| R12-AB-1/2 | A-4 (Critical) | Must |
| R12-MG-1/2/3 | B-2, B-3, A-7 | Must/Should |
| R12-AD-1/2/3/4 | C-6+README, C-4, C-5, C-1 | Must / recorded deviation |
| R12-MISC-1/2 | A-5, B-5 | Must |

## Changelog

| Date | Change |
|---|---|
| 2026-08-18 | Round 12 drafted from the three-panel concept review + site-survey-001; approved same day ("fix every finding"). |
| 2026-08-18 | Built and shipped in v0.14.0 — all 17 findings closed or deliberately deviated (R12-AD-4); suite 657 tests. |

---

*Developed using the Grounded Vibe Methodology*
