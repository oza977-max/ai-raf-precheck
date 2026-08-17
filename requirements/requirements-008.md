# AIGate Requirements — Round 8

## Round 8 — Similar Decided Cases: the Corpus Starts Paying

**Status: APPROVED by the user (2026-08-17, "go for all") — the
corpus-as-moat feature from design-vision, first slice.**

## Provenance

The strategy note (2026-08-16): the register + audit trail is the firm's
institutional memory of AI decisions, and retrieval beats training — a
retrieved case is citable evidence. First slice: when someone reviews a
use case, show them how similar cases were actually decided. Deliberately
deterministic (token-overlap scoring, the duplicate check's own idiom) —
no model, no embedding, fully explainable.

## Functional Requirements

**R8-SC-1 (Must):** The graph review screen shall show up to three similar
DECIDED cases (register entries carrying a verdict), each with: its name,
its outcome in appetite vocabulary ("inside appetite" / "inside appetite
with controls" / "outside appetite" — NEVER the status enum words, which
are reserved), tier and track, the controls its verdict required, the
policy version it was decided under, and its date.

> Fit criterion: with two decided similar cases and one undecided one
> seeded, the panel lists the two decided cases with outcome, tier,
> controls and policy version, and not the undecided one.

**R8-SC-2 (Must):** The panel shall state its posture on its face:
precedent informs, the rules decide — these cases change nothing about
this verdict. Presentation-only: nothing from the panel feeds the engine.

> Fit criterion: the posture line renders; the engine result for the case
> under review is byte-identical with the panel present and absent.

**R8-SC-3 (Must):** Similarity shall be a pure, deterministic engine
helper (token-overlap over label + description, ranked, ties broken by
id), computed over candidate summaries supplied by the caller — the
engine island touches no store.

> Fit criteria: same inputs → same ranking (asserted); ranking prefers
> higher description overlap; the current use case is never its own
> precedent.

**R8-SC-4 (Should):** The 2LoD sign-off page shall show the same panel for
the case under review, so the reviewer sees precedent where they sign.

> Fit criterion: the panel renders on RegisterDetail for a case with
> similar decided cases, with queries scoped per §11.1 discipline.

**R8-NF-1 (Must):** No rendered panel string matches `/approved|rejected/i`
(the intake path carries the single-match guard); rendering writes no
audit events; `evaluate()` unchanged.

## Out of Scope

- Retrieval by graph-field similarity — the graph is not persisted on the
  register (ADR-RL-R3-1 consequence); text overlap over label+description
  is the honest signal available today. Recorded as the natural next
  slice if graphs are ever persisted.
- Any model involvement. Retrieval stays citable evidence.

## Index

| ID | Summary | Priority |
|---|---|---|
| R8-SC-1 | Up to 3 similar decided cases with outcome/tier/controls/policy version on graph review | Must |
| R8-SC-2 | Advisory posture stated; presentation-only | Must |
| R8-SC-3 | Pure deterministic similarity helper over caller-supplied summaries | Must |
| R8-SC-4 | Same panel at 2LoD sign-off | Should |
| R8-NF-1 | Reserved words, no writes, engine untouched | Must |

## Changelog

| Date | Change |
|---|---|
| 2026-08-17 | Round 8 created; approved in the "go for all" batch. |
