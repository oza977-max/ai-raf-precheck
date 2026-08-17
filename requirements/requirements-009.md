# AIGate Requirements — Round 9

## Round 9 — Honest Everywhere AND Legible: the Review Screen Recomposed

**Status: APPROVED by the user (2026-08-17) — full scope including the
R5-GR-1 criterion amendment. Build proceeds after delta-code-review
findings are folded in.**

## Provenance

Design-review-001 (2026-08-17), the first composition review of the graph
review screen after five rounds of additions. Verdict: *"honest everywhere
and legible nowhere."* Each disclosure (R5 meanings/consequences, R6
quotes/guessed markers, R7 jurisdictions, R8 precedents) is individually
correct; their sum is ~1,200–1,600px for a three-card case, with the
constant (consequence lines under every field) visually indistinguishable
from the variable (the two guessed fields that need judgment), up to three
same-styled alarms per card, required actions scattered across columns, and
the user's remaining-obligations list existing only inside the
Proceed-refusal error. **Nothing honest is removed in this round — content
becomes aggregated, prioritised, or one click away.**

## Functional Requirements

**R9-SC-1 (Must): A review checklist heads the screen.** Derived purely
from existing state (`unconfirmedNodeIds`, `guessedFields`,
`jurisdictionsConfirmed`): one line per remaining obligation ("Confirm
'CRM data'", "Fix 2 guessed values on 'Draft email'", "Confirm
jurisdictions"), each scrolling to its card on tap, each disappearing when
done. When empty it says so and points at Proceed.

> Fit criteria: the checklist lists exactly the outstanding obligations for
> a mixed fixture; completing one removes its line; items scroll-focus
> their card; zero-obligations renders the done state.

**R9-SC-2 (Must): Consequence lines move behind one interaction.** The
per-field plain-English *meaning* stays always-visible (it is what the
user checks); the *consequence* line ("hard lines read this field…")
renders on a per-card "why these matter" disclosure, default closed.

> Fit criterion: meanings render by default; consequences render after one
> click and satisfy R5-GR-1's content requirement. **This amends R5-GR-1's
> fit criterion from "displays" to "displays, or reveals in one click" —
> recorded here as a deliberate renegotiation, approved with this round.**

**R9-SC-3 (Must): One alarm per card.** The card-level uncertainty banner
(which already names the guessed fields) is the single alarm styling on a
card. Per-field guessed markers shrink to short badges ("guessed — correct
it, or it becomes a question"); plausibility warnings get a visually
distinct advisory identity so advisory ≠ blocking at a glance.

> Fit criteria: a card with uncertainty + guessed fields + a plausibility
> warning renders exactly one warn-styled banner; badges and advisory
> markers render in their own distinct styles; every R5/R6 rendering
> requirement still satisfied (both guessed and quoted renderings appear).

**R9-SC-4 (Must): Every card ends with a visible next step, and required
actions precede informational content.** Guessed cards — which correctly
have no plain confirm (ADR-IF-R6-2, unchanged) — render a "Fix guessed
values" affordance that opens the card's editor. The jurisdictions panel
moves above the similar-cases panel.

> Fit criteria: a guessed card shows the fix affordance and still no plain
> confirm; clicking it opens the editor; jurisdictions renders before
> similar cases in DOM order.

**R9-SC-5 (Should): Similar cases collapse to a summary line** ("2 similar
decided cases — show"), expanding on demand to the full panel including
its posture line.

> Fit criterion: collapsed by default with an accurate count; expanded
> content satisfies all R8 rendering criteria.

**R9-SC-6 (Could): The "what you told us" description box caps its height**
with expand-on-click for long descriptions.

## Non-Functional (carried invariants)

- **R9-NF-1 (Must):** No honesty disclosure deleted; every R5–R8 gate,
  guard and audit path (NODE_CONFIRMED, corrections, JURISDICTIONS_SET)
  unchanged in behaviour. Engine untouched.
- **R9-NF-2 (Must):** No rendered string matches `/approved|rejected/i`;
  rendering writes nothing.

## Explicitly preserved (from the review's "must not be lost" list)

The gate-note contract sentence; no-bypass on guessed cards; earned
"Confirmed by you"; quiet provenance quotes; the banner naming guessed
fields; ignored-jurisdictions and split-graph notes; appetite vocabulary +
posture line in similar cases; jurisdiction edits through the correction
path.

## Index

| ID | Summary | Priority |
|---|---|---|
| R9-SC-1 | Review checklist header, state-derived, scroll-linked | Must |
| R9-SC-2 | Consequences behind one click (R5-GR-1 criterion amended) | Must |
| R9-SC-3 | One alarm per card; badges + distinct advisory identity | Must |
| R9-SC-4 | Visible next step on every card; actions before information | Must |
| R9-SC-5 | Similar cases collapsed to a count, expand on demand | Should |
| R9-SC-6 | Description box height cap | Could |
| R9-NF-1/2 | Nothing honest removed; gates/audit unchanged; reserved words | Must |

## Changelog

| Date | Change |
|---|---|
| 2026-08-17 | Round 9 drafted from design-review-001's six findings. Awaiting approval. |
