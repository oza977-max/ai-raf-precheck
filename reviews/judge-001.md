---
schema_version: 0
---

# Judge Experiment 001 — local LLM judge vs. the deterministic engine

**Date:** 2026-08-17. **Model:** `qwen3:4b` (Q4_K_M, via Ollama, local, no data
leaves the machine). **Raised by:** FN-009 (`specs/forward-notes.md`) — "run
the oracle-round protocol through a real judge model against the eleven
pinned cases and compare with the human panel's 31/31." This is that run.

## Protocol

Eleven graph fixtures from `src/engine/try-these.test.ts` / `docs/try-these.md`
(case 5 counted as two sub-cases, 5a/5b, matching the test file). For each
case: a compact rulebook summary (the 5 hard lines + tier logic + 18
invariants + platform inheritance + jurisdiction packs, condensed to ~150
lines) was sent to `qwen3:4b` via `POST /api/chat` with `/no_think`,
`think:false`, `temperature:0`, `num_predict:512`, and a JSON schema forcing
`{prediction: inside|inside_with_controls|outside, reason: string}`. Calls
ran sequentially, 2–19 seconds each. `inside`→`approved`,
`inside_with_controls`→`approved_with_controls`, `outside`→`rejected`,
compared against the engine-verified status pinned by the test file.

This mirrors the oracle protocol in `backtest/oracle-protocol.md` in spirit
(grounding on the rulebook, not on outcomes) but differs from it materially —
see the honesty note at the end.

## Results

| Case | Engine status | Judge prediction | Judge status | Agree? |
|---|---|---|---|---|
| 1 | approved | inside | approved | **yes** |
| 2 | rejected | *(malformed JSON — see below)* | ERROR | no |
| 3 | rejected | inside | approved | no |
| 4 | rejected | inside | approved | no |
| 5a | rejected | inside | approved | no |
| 5b | rejected | inside | approved | no |
| 6 | approved_with_controls | inside | approved | no |
| 7 | approved_with_controls | inside | approved | no |
| 8 | approved_with_controls | inside | approved | no |
| 9 | approved_with_controls | inside | approved | no |
| 10 | approved_with_controls | inside | approved | no |

**Concordance: 1/11 (9%).**

## Disagreement analysis

- **Case 2** — the model's response was not valid JSON (`Unterminated
  string`), so no prediction was recoverable at all. Treated as a
  disagreement/failure, not scored as ERROR-neutral.
- **Cases 3, 4, 5a, 5b** — the judge's own `reason` text correctly identifies
  the binding hard line (HL-003, HL-006, HL-004, HL-004 respectively) and
  states in prose that the case should be rejected — then reports
  `prediction: "inside"` anyway. The stated reasoning and the emitted field
  contradict each other in every one of these four cases.
- **Cases 6, 7, 8, 9, 10** — no hard line applies in any of these (correctly,
  per the judge's own reasoning), but the judge collapsed
  `approved_with_controls` to `inside` rather than `inside_with_controls` in
  all five, even where its own reasoning named a specific control (case 7:
  "it needs the escalation control... So it's approved_with_controls" — yet
  the `prediction` field still reads `inside`).

**The pattern is not random guessing — it is a field-ordering effect.** The
schema's field order is `prediction` then `reason`. Under forced structured
decoding the model appears to commit to `prediction` before generating the
reasoning that would normally inform it, then produces a `reason` that
argues against its own already-committed answer. Every disagreement above
has a `reason` string that, read on its own, gets the case right or close to
right; the `prediction` field is the thing that is wrong, consistently in
the direction of the least-restrictive answer (`inside`). This is a
finding about *this experiment's schema shape* on a 4B model under
`temperature:0`, not evidence that the model cannot reason about the
rulebook — its prose mostly can.

## What this does and does not show

**What it shows:** a genuinely dated, reproducible number — 1/11 — for one
specific tiny local model, one specific prompt, one specific schema field
order, reasoning disabled, run once. It also surfaces an operationally
useful lesson for anyone building the FN-009 panel: schema field order
matters under forced decoding, and `reason`-before-`prediction` (or a
second unforced pass) should be tried before concluding a small model can't
do this task — the prose in every disagreement suggests it mostly can.

**What it does not show:**
- This is not a measure of the rulebook's correctness, only of one judge's
  concordance with the engine's execution of it (same scope boundary as
  `backtest/oracle-protocol.md`).
- It is not comparable to the human oracle rounds' 31/31 concordance
  (`reviews/calibration.md`) on a like-for-like basis. Those rounds used two
  frontier models (Fable and Opus), blind to each other and to the engine,
  reading the full policy YAML and reasoning freely in prose with no forced
  schema — a finer-grained protocol on binding-constraint identification, not
  just status. This run used one small local model, a condensed ~150-line
  rulebook summary rather than the full policy file, a forced JSON schema,
  and pre-structured graph fields rather than blind natural-language case
  text. Any of those four differences alone could move the number; this
  experiment cannot isolate which one dominates.
- One model, one prompt, one run. FN-009's own design calls for a panel of
  several small judges with per-rule rubrics, disagreement as the
  file-worthy signal — not a single generalist judge scored for raw
  agreement. This experiment is upstream of that: it establishes whether a
  single tiny local judge is usable at all before any panel or UI gets
  built on top of it.
- Per FN-009's non-negotiable invariant, none of this ever overrides a
  verdict — the engine remains the only authority in the decision path,
  live or hypothetical. This experiment does not touch the app, the store,
  or the audit trail; it is a standalone script against the model and the
  policy file.

**Bottom line for whoever picks up FN-009 next:** 1/11 concordance is a
scoring artifact of field order under structured decoding, not a verdict on
whether qwen3:4b can execute this rulebook — the model's own prose gets most
of these cases right. Before building any panel UI, re-run with `reason`
before `prediction` in the schema (or two calls: free-text reasoning, then a
separate constrained-choice call) and see whether concordance moves
substantially. If it does not, that is the real finding.
