# AIGate Requirements — Round 7

## Round 7 — Jurisdictions Are Confirmed, Never Assumed

**Status: APPROVED by the user (2026-08-17, "Fix R7") — scope as recorded in
`test/sweep-001.md`.** Tech spec: `specs/intake-flow.md` §17.

## Provenance

Sweep-001 (15-case domain sweep, 2026-08-16): the extractor **hallucinated
`US` as a jurisdiction** on a description naming no country. `US` is a
recognised code, so it silently activates the US regulatory pack — the one
kind of junk the R5 filter cannot catch, because it is not junk. On the
form path the jurisdiction answer is explicit and mandatory (R3-JU-1); on
the LLM path it was only passively visible before attestation. A field that
selects which REGULATIONS apply must never be model-asserted.

## Functional Requirements

**R7-JC-1 (Must):** The review screen shall display the extracted
jurisdictions as an explicit, labelled item — each code with its full name
from the policy, or "none stated — only the firm's own appetite will
apply" when the list is empty. Model-proposed, and it says so.

> Fit criterion: a graph extracted with `["US"]` renders the jurisdictions
> item naming the United States; an empty extraction renders the
> none-stated wording.

**R7-JC-2 (Must):** On the LLM path, Proceed shall be refused until the
jurisdictions are explicitly confirmed or edited — the same
refuse-with-a-message posture as the R5 card gate. Editing offers exactly
the policy's declared jurisdictions as choices (plus clearing all); a
hallucinated code can therefore be removed in one tap, and nothing outside
the policy's set can be introduced. The form path is exempt (its answer is
already explicit, R3-JU).

> Fit criteria: Proceed refuses with a plain-English message while
> unconfirmed; confirming opens it; an edit (which is itself confirmation)
> opens it; the form path shows no jurisdiction gate.

**R7-JC-3 (Must):** A jurisdiction edit shall be recorded as a graph
correction (node reference `graph`, field `jurisdictions`), versioned like
any other correction, so the attested record shows what the model proposed
and what the human changed it to.

> Fit criterion: removing a hallucinated code appends a correction with the
> original and corrected lists and bumps the graph version; the engine
> evaluates the corrected list.

**R7-NF-1 (Must):** No engine change (`evaluate()` byte-identical); no
rendered string matches `/approved|rejected/i`.

## Out of Scope (recorded)

- Enum-forcing artifacts on odd outputs (sweep-001: website chatbot →
  `trade`) — already surfaced as guessed/questions by R6; a vocabulary
  change is a policy-schema question for a human, not a prompt patch.
- Provisional semantics for "none stated" — the engine already marks
  no-pack verdicts provisional (R3-JU-6); unchanged.

## Index

| ID | Summary | Priority |
|---|---|---|
| R7-JC-1 | Extracted jurisdictions rendered explicitly, named, or "none stated" | Must |
| R7-JC-2 | LLM path gates Proceed on explicit jurisdiction confirm/edit; choices limited to the policy's set | Must |
| R7-JC-3 | Jurisdiction edits recorded as versioned graph corrections | Must |
| R7-NF-1 | Engine untouched; reserved words respected | Must |

## Changelog

| Date | Change |
|---|---|
| 2026-08-17 | Round 7 created from sweep-001's recorded gap; approved via "Fix R7". |
