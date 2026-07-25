# Handover: V2-C — Starter policy enrichment (demo variety)

## Status: Complete
## Branch: main

## Problem

Every verdict looked the same. Root cause was content, not code: the
starter policy carried **2 invariants and 3 controls**, and two of those
three controls had `resolves: []`, so the greedy solver could never
select them. In practice one usable control resolved one invariant —
so almost every use case returned a bare "Approved, nothing triggered".
The 1,627-line engine was running on a fixture.

## What changed

**Policy content, derived from `grounding/raf-extraction.md` §E (worked
examples) and §F (control library)** — not invented:

- **13 invariants** (was 2): Track II baseline fingerprinting, grounding
  verification for generative output in material decisions, citation
  resolution for drafting, agentic tool-call logging, human decision gate
  above autonomy L1, conduct testing for client/market-facing, escalation
  path for conversational client-facing, drift monitoring and
  explainability for quantitative models, adversarial red-teaming,
  behavioural sampling at scale — plus the original PII and MNPI rules.
- **12 controls** (was 3), each with a real `resolves` mapping, burden
  1–5, and verification text from §F. `CTRL-HITL-02` and `CTRL-LOG-01`
  now actually resolve something. Only `CTRL-ENC-01` carries verification
  evidence, so the VERIFIED/UNVERIFIED contrast is visible in one verdict.
- Every invariant except `INV-ZONE-01` has a resolving control;
  INV-ZONE-01 stays deliberately unresolvable (MNPI outside Zone C is a
  reject, not a control problem).
- Regulatory basis cites the firm's own RAF sections where the rule comes
  from the framework rather than a regulation — no invented citations.

**Engine fix the enrichment exposed:** `binding_constraint` — the
headline field on every verdict, spec-defined as "the rule that
determined the outcome" — was `tripped[0]`, i.e. the alphabetically
first tripped invariant. Invisible with 2 invariants; with 13 it named an
arbitrary rule. Now selects the highest-severity tripped invariant,
ties broken by id (determinism preserved).

**Scoping correction found while fixing tests:** `INV-SEC-01`
(red-teaming) initially had no exposure condition, which made *every*
approvable use case trip something and eliminated the clean-approval
verdict entirely. Scoped to systems shared beyond a single team, which
restores grounding §E row 1 (internal productivity copilot → Low/III,
clean) as a reachable outcome.

## Result

15 back-test cases now produce **12 distinct control sets**, nine
different binding rules, tiers across Low→Critical, tracks I/II/III, and
three rejections for three different reasons. Live example (UC-3 credit
review): High/II, five tripped invariants with severities and citations,
five solved controls with one VERIFIED and four UNVERIFIED.

## Test updates (all outcome changes were intended and pinned)

- `backtest-predictions.test.ts` — 15 predictions updated; this file is
  what makes the change safe, since it fails loudly on any policy edit
  that moves an outcome.
- `evaluate.test.ts` — added a `CLEAN_*` fixture (internal copilot, the
  genuinely trivial case) for the clean-approval tests; a Track I
  quantitative model necessarily trips drift monitoring now.
- `WalkingSkeleton.test.tsx` — the questionnaire answering loop assumed
  data-zone questions; now answers whatever option the current question
  offers (budget can reach 15).
- `backtest/use-cases.md` — predicted verdicts rewritten to match.

## Gates

215 tests × 3 clean runs · `tsc --noEmit` clean · build clean ·
spec-parity clean · live browser walkthrough of UC-3.

## Note for pack authoring

The invariants are STARTER content marked as such in the file. They
encode the grounding document's own control library, not a firm's
adopted appetite. Adjusting thresholds and scope is the human step, and
the back-test predictions test will catch every outcome shift.
