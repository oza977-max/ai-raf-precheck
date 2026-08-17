# AIGate Requirements — Round 10

## Round 10 — Speaking the Reviewer's Language

**Status: APPROVED by the user (2026-08-17; scope agreed in-session, order
confirmed at R11 approval: R10 ships first).**

## Provenance

Competitive-landscape review (2026-08-17, recorded in the private design
notes): an adjacent public tool independently arrived at AIGate's posture,
and three STANDARD industry concepts it uses well are missing here — all
three pre-date that tool by decades (SR 11-7 coined "effective challenge";
COSO owns design/operating effectiveness; inherent/residual is Basel-era
vocabulary). Implemented in AIGate's own design language; nothing —
no code, text, taxonomy or wording — is taken from the adjacent repo.

## Functional Requirements

**R10-CM-1 (Must): Effective-challenge memo export.** Any verdict (intake
verdict screen and 2LoD sign-off page) can export a committee-ready
memo: case identity and description, the verdict in appetite vocabulary
with tier/track, the rules that fired with their citations and basis,
the minimal control set with each control's evidence status, sign-offs
present and pending (named, "not verified" caveats preserved), the
provisional causes, and the standing conditions. Markdown, downloaded as
a file — banks circulate documents, not screenshots.

> Fit criteria: exported memo contains all listed sections for a fixture
> verdict; honesty markers (provisional causes, UNVERIFIED, name-not-
> verified) survive into the memo verbatim; no memo string matches
> /approved|rejected/i outside the appetite-vocabulary mapping's needs —
> the memo uses appetite vocabulary throughout.

**R10-IR-1 (Must): Inherent/residual vocabulary.** The verdict screen
frames its existing computation in the standard words: the position
BEFORE controls (inherent) and the position WITH the minimal control set
(residual), as labels on what is already shown — zero logic change.

> Fit criteria: both labels render on a with-controls verdict; the
> determinism test is unchanged and green.

**R10-CE-1 (Must): Design vs operating effectiveness on control evidence.**
`verification_evidence` grows two optional axes — design (is the control
the right shape) and operating (is it actually running, with tested
evidence) — rendered as two chips where present. Existing single-status
evidence stays valid (backward compatible); VERIFIED requires operating
evidence, matching the existing meaning.

> Fit criteria: a control with both axes renders two chips; legacy
> single-status controls render exactly as today; policy validation
> accepts both shapes.

## Non-Functional

- **R10-NF-1 (Must):** No engine decision change; no reserved words
  rendered; memo generation writes nothing to the audit trail.

## Index

| ID | Summary | Priority |
|---|---|---|
| R10-CM-1 | Effective-challenge memo export (markdown download) | Must |
| R10-IR-1 | Inherent/residual labels on the verdict | Must |
| R10-CE-1 | Design/operating effectiveness axes on control evidence | Must |
| R10-NF-1 | No decision change; reserved words; no-write export | Must |

## Changelog

| Date | Change |
|---|---|
| 2026-08-17 | Round 10 created from the competitive-landscape review; approved. |
