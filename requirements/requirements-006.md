# AIGate Requirements — Round 6

## Round 6 — Show Your Working: Provenance, Field-Level Questions, Context

**Status: APPROVED by the user (2026-08-16). Tech spec:
`specs/intake-flow.md` §16.**

## Provenance

Raised by the user (2026-08-16, same live-model session as round 5): *"make
the user interact more and ask questions if the LLM can't answer … or give a
confidence score on each interpretation."* The confidence-score half is
deliberately reshaped: this product already replaced a numeric confidence
with a verifiable basis once (pack rules, `basis: verbatim/derived/
judgement`) because nobody could check the number. The same reasoning
applies here — a model's self-reported percentage is unverifiable theatre;
**the phrase it read is checkable in one second**. Quotes are the honest
form of the user's idea, and that decision is recorded as this round's
ADR-to-be.

## 1. Purpose

Round 5 made the review screen explain what values *mean*. Round 6 makes the
model show *where each value came from* — and turns "the model wasn't sure"
from a card-level warning into specific questions a person answers. The
target state: no value reaches attestation whose origin the submitter has
not seen, and no uncertainty leaves the flow unresolved or unexplained.

## 2. Functional Requirements

### R6-PV — Per-Field Provenance

**R6-PV-1 (Must):** The extraction schema shall require, for every
decision-bearing field, the verbatim phrase from the submitter's description
the value was based on (`basis_quote`), or an empty string when the
description does not state it.

> Fit criterion: the extraction request's schema requires basis quotes; a
> response carrying them survives the parse gate with quotes attached to
> the graph's nodes.

**R6-PV-2 (Must):** A field whose basis quote is empty, or whose quote does
not appear in the description (case- and whitespace-insensitive substring
check — deterministic, no fuzzy matching), shall be treated as **guessed**:
the field is marked unsure regardless of what the model claimed, and the
quote is not rendered as provenance.

The substring check is the whole point: it makes provenance *checkable by
machine* against the submitter's own words, where a confidence number is
checkable against nothing.

> Fit criteria: a fabricated quote (not present in the description) demotes
> the field to guessed; an empty quote likewise; a genuine quote passes.

**R6-PV-3 (Must):** The review screen shall render, under each field's
meaning (R5-GR-1), its provenance: "based on: '<quote>'" for quoted fields,
and a visually distinct "the description does not say — the model guessed"
for guessed fields.

> Fit criterion: both renderings appear for a mixed fixture; the guessed
> marker never appears on a quoted field or vice versa.

**R6-PV-4 (Must):** Guessed fields feed the R5 confirm gate: a card with
guessed fields cannot be confirmed until each guessed field is either
corrected or explicitly answered via a question (R6-QN). "Looks right —
confirm" alone is not enough for a value nobody stated.

> Fit criterion: a card with a guessed field shows no plain confirm action;
> correcting the field (or answering its question) restores it.

### R6-QN — Field-Level Questions

**R6-QN-1 (Must):** Every guessed or uncertain decision-bearing field shall
generate a targeted question in the Questions step, phrased from the
existing field copy ("Where does the data actually live?" with the same
plain-English options as the form), whose answer writes the field through
the existing correction path (recorded as a graph correction, versioned).

> Fit criterion: a guessed data_zone produces a data_zone question; the
> answer updates the graph and is recorded as a correction; no question is
> produced for quoted fields.

**R6-QN-2 (Should):** The blunt card-level "not confident" warning (R5-GR-3)
remains, but names the specific fields in question rather than "check every
value".

> Fit criterion: an uncertain node with one guessed field names that field.

### R6-CX — Context for the Reviewer

**R6-CX-1 (Should):** Each targeted question shall carry an optional
free-text "anything the reviewer should know about this answer?" box. The
text is human-read only — never engine input (the reviewer-note rule,
v0.2.3: closed vocabularies stay closed) — persisted with the attestation
and rendered to 2LoD on the sign-off page alongside the submitter note.

> Fit criterion: context typed on a question reaches the sign-off page
> labelled as submitter context; the engine result is byte-identical with
> and without it.

## 3. Non-Functional (carried invariants)

- **R6-NF-1 (Must):** No engine change; `evaluate()` byte-identical. Quotes
  and context are intake/presentation artifacts.
- **R6-NF-2 (Must):** Quotes and context render as text, never markup; no
  rendered string matches `/approved|rejected/i`.
- **R6-NF-3 (Must):** Works identically for both LLM providers (local
  model and Anthropic); the form path is untouched (a human types those
  values — provenance is the typing).

## 4. Out of Scope (deliberate)

- Numeric per-field confidence scores — reshaped into quotes (see
  Provenance). Recorded, not forgotten: if a future model exposes
  *calibrated* logprob-based confidence, revisit with evidence.
- Multi-turn conversational repair with the model.
- Any LLM judgment of whether a quote "really supports" a value — the
  substring check is deterministic; semantic support is the human's call.

## 5. Requirements Index

| ID | Summary | Priority |
|---|---|---|
| R6-PV-1 | Schema requires a basis quote per decision-bearing field | Must |
| R6-PV-2 | Empty or fabricated quotes demote the field to guessed (deterministic check) | Must |
| R6-PV-3 | Review screen renders provenance, or says the model guessed | Must |
| R6-PV-4 | Guessed fields block plain confirmation until corrected or answered | Must |
| R6-QN-1 | Guessed/uncertain fields become targeted questions writing through corrections | Must |
| R6-QN-2 | Card warning names the fields in question | Should |
| R6-CX-1 | Optional human-read context box per question, surfaced at sign-off | Should |
| R6-NF-1..3 | Determinism, text-not-markup/reserved words, provider parity | Must |

## Changelog

| Date | Change |
|---|---|
| 2026-08-16 | Round 6 drafted from user ideas (interaction, confidence); numeric scores reshaped into verifiable provenance quotes. Awaiting approval. |
