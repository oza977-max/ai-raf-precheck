# AIGate Requirements — Round 5

## Round 5 — The Graph Review That Explains Itself

**Status: APPROVED by the user (2026-08-16) — full scope, Musts + Shoulds +
Could.** Tech spec: `specs/intake-flow.md` §15 (ADR-IF-R5-1, ADR-IF-R5-2).

## Provenance

Raised by the user during the first live-model session (2026-08-16), after
running a real description through the local open model: *"the graph can
actually show you whether it's right or wrong. It can explain better. I
think it's a bit more naive right now."* Grounded in two observed live
failures: a systematic Zone A default (closed at the prompt, v0.5.x) and a
silently-forced wrong enum (`training` → `trade`) that carried no
uncertainty flag. The prompt now defends against both; this round makes the
**review screen** carry its share, because prompt fixes only lower the error
rate — the screen is where remaining errors must become visible.

## 1. Purpose

The graph review screen is where a machine's guess becomes a human's claim.
Today it renders values (`Zone A`, `L2`, `non-binding`) without saying what
they mean, which rules read them, or which ones the model was unsure about.
A submitter cannot catch a wrong value they don't understand, and the
attestation that follows is only as honest as this screen makes catchable.
Round 5 turns the screen from a display into an explanation.

## 2. Target User

**James (1LoD submitter)** — a business or technology user, not a risk
expert. He must be able to see that "Zone A" means the open internet, notice
it is wrong for an internal platform, and fix it — without knowing the
rulebook.

## 3. Functional Requirements

### R5-GR — Explainable Graph Review

**R5-GR-1 (Must): Every decision-bearing field explains its value in plain
English, and names its consequence.** For each classified field on a node
(data class, data zone, model type, autonomy level, action type, exposure,
bindingness, reversibility, scale, decision type, HITL, vendor), the review
screen shows: the value's plain-language meaning (e.g. "Zone A — the open
internet or consumer tools"), and a one-line consequence ("the strictest
zone rules apply; several hard lines read this field"). Meanings come from a
single static field-copy table — deterministic, no LLM.

> Fit criterion: for a rendered graph, every decision-bearing field displays
> a meaning string distinct from its raw enum value; a field whose value
> changes shows the changed meaning.

**R5-GR-2 (Must): Model-proposed values are visibly unconfirmed until a
human touches them.** On the LLM intake path, every decision-bearing field
starts in a "proposed by the model" state, visually distinct. Proceeding
past graph review requires every decision-bearing field to be explicitly
confirmed (per node or per field — design decision for the tech spec) or
corrected. The guided-form path is exempt: a human typed those values.

> Fit criterion: with an LLM-extracted graph, Proceed is unavailable until
> all decision-bearing fields are confirmed/corrected; the confirmation is
> recorded on the graph (so the attestation covers it); the form path shows
> no proposed-state chrome.

**R5-GR-3 (Must): Uncertainty is loud and must be resolved.** Nodes the
model flagged `uncertain: true` are visually prominent (not a subtle chip),
say plainly "the model was not confident here — check every value on this
node", and cannot be confirmed en bloc: each uncertain node requires its own
confirm/correct action.

> Fit criterion: an uncertain node renders the warning; Proceed is
> unavailable while any uncertain node is unresolved.

**R5-GR-4 (Should): Deterministic plausibility warnings.** The existing
description-vs-graph signal table (2 patterns today) is extended to the
misreads live runs have actually produced: internal/on-prem wording vs a
Zone A/B value; training/fine-tuning wording vs any action type; "reviews
every"/"human approves" wording vs `hitl: false` or autonomy ≥3; "no human"
wording vs autonomy ≤1. Warnings are advisory flags on the affected field —
they never block and never change a value.

> Fit criterion: each new signal pair fires on a fixture built from the live
> transcript that motivated it, and does not fire on a neutral description.

**R5-GR-5 (Could): One-use-case hygiene hint.** When the graph contains two
or more processing nodes, the review screen shows a static hint: "If these
are really two separate tools, submit them separately — one use case per
pre-check gets sharper verdicts." Purely informational.

### R5-GX — Extraction Output Hygiene

**R5-GX-1 (Must): Unrecognised jurisdictions are surfaced, not silently
carried.** Jurisdiction strings outside the known set (those the packs and
intake vocabulary recognise) are removed from the graph at the parse gate
and reported on the review screen as "ignored: not a recognised
jurisdiction" — so `"Internal"` can neither silently match nothing nor look
adopted.

> Fit criterion: an extraction returning `jurisdictions: ["Internal","UK"]`
> yields a graph with `["UK"]` and a rendered notice naming what was
> dropped.

## 4. Non-Functional (carried invariants)

- **R5-NF-1 (Must):** No engine change; `evaluate()` byte-identical
  (TC-PE-1-01 unchanged). All explanation copy is presentation-layer.
- **R5-NF-2 (Must):** Review renders write nothing to the audit trail.
- **R5-NF-3 (Must):** No rendered string matches `/approved|rejected/i`;
  all model-derived text renders as text, never markup.

## 5. Out of Scope (deliberate)

- LLM-judged validation of the graph ("is this graph right?" asked of a
  model) — that puts a model's opinion in the judgment path; the dissent
  panel design (FN-009) is the governed home for machine opinions.
- Re-prompting/multi-turn extraction repair.
- Changing the closed vocabularies (training as a new action type is a
  policy-schema question for a future round, decided by a human).

## 6. Requirements Index

| ID | Summary | Priority |
|---|---|---|
| R5-GR-1 | Every decision-bearing field explains value + consequence in plain English | Must |
| R5-GR-2 | Model-proposed fields visibly unconfirmed; confirm-all gate before Proceed (LLM path) | Must |
| R5-GR-3 | Uncertain nodes loud; individually resolved before Proceed | Must |
| R5-GR-4 | Plausibility warning table extended to live-observed misreads | Should |
| R5-GR-5 | Two-processing-node hygiene hint | Could |
| R5-GX-1 | Unknown jurisdictions dropped at parse and surfaced | Must |
| R5-NF-1..3 | Determinism, no-write render, reserved words | Must |

## Changelog

| Date | Change |
|---|---|
| 2026-08-16 | Round 5 drafted from live-model session findings; awaiting approval. |
