# Oracle round 001 — results

Run 2026-07-27 against policy `1.0`. Method: `backtest/oracle-protocol.md`.
Two blind adjudicators (Claude Fable 5, Claude Opus 4.8) independently scored
all 31 corpus cases from `policy/appetite.yaml` + `policy/packs/*.yaml`,
without sight of the engine's verdicts, its tests, its code, or any written
prediction.

## Headline

| Measure | Result |
|---|---|
| **Verdict status, three-way agreement** | **30 / 31** |
| Binding constraint, unanimous | 24 / 31 |
| Binding constraint, engine is the outlier | 3 |
| Binding constraint, oracles disagree with each other | 2 |
| Binding constraint, all three differ | 2 |

**Every single disagreement is about *which rule is binding* when several
fire. Not one is about the outcome.** That is a precise and bounded
diagnosis: the engine routes correctly and decides correctly; what it cannot
do reliably is name the reason.

For a product whose entire pitch is "the binding rule and its citation", that
is not a cosmetic gap.

## The disagreements

| Case | Engine | Fable | Opus | Reading |
|---|---|---|---|---|
| C-02 | INV-DATA-01 | INV-HALLUC-01 | INV-HALLUC-01 | **Engine outlier** |
| F-03 | INV-CONDUCT-01 | INV-HALLUC-01 | INV-HALLUC-01 | **Engine outlier** |
| G-06 | INV-DATA-01 | EU-AIACT-TIER-02 | EU-AIACT-TIER-02 | **Engine outlier** |
| B-03 | INV-CONDUCT-01 | INV-DISCLOSE-01 | INV-CONDUCT-01 | Oracles split → rule ambiguous |
| G-05 | INV-CONDUCT-01 | INV-DISCLOSE-01 | INV-CONDUCT-01 | Oracles split → rule ambiguous |
| G-01 | INV-DRIFT-01 | INV-TRACK2-01 | EU-AIACT-TIER-01 | Three-way → rule ambiguous |
| D-01 | *(no verdict)* | TRACK-I | INV-SAMPLE-01 | Coverage hole; all three agree it is unroutable |
| H-01 | approved_with_controls | **approved** | approved_with_controls | Only status disagreement in the corpus |

### Root cause — one rule, six symptoms

`policy/appetite.yaml` **does not define which tripped invariant is binding
when several share the top severity.** C-02 trips `INV-DATA-01`,
`INV-TRACK2-01` and `INV-HALLUC-01` — all severity `High`. The engine
tie-breaks (in practice, on declaration order); the adjudicators tie-break on
burden or on which control does the most work. Nobody is wrong, because the
policy never says.

The same hole explains B-03, F-03, G-01, G-05 and G-06. **Six of the seven
binding-constraint disagreements have a single cause.**

Related, and visible in G-01/G-06: when a jurisdiction pack's `tier_floor` is
what actually drove the outcome, both adjudicators name the **pack rule** as
binding; the engine names a firm invariant. For a bank asked "why is this
Critical?", "EU AI Act Annex III §4(a)" is the true answer and
"INV-DATA-01" is not.

### H-01 — the one status disagreement

Fable read the platform inheritance as fully discharging the control, giving
a clean `approved`; Opus and the engine kept it as `approved_with_controls`
with the control inherited rather than removed. Both readings are defensible
from the text, so this is a **rulebook ambiguity**: the policy never states
whether an inherited control leaves the use case with zero residual burden or
merely with a pre-satisfied requirement. It matters — it is the difference
between the only clean `approved` in the corpus and yet another
`approved_with_controls`.

## Verified structural defects

Each mechanically confirmed against the YAML, not taken on the adjudicators'
word.

| # | Defect | Status |
|---|---|---|
| 1 | **9 of 28** `model_type` × `bindingness` combinations match **no track**, incl. `agentic` + advisory/material/binding | verified by enumeration |
| 2 | `CTRL-HITL-02` is the **only** control resolving `INV-AUTONOMY-01`, and reads *"Every action ... approved by a human before execution"* — so the "minimal fix" for any autonomous design **abolishes it** | verified |
| 3 | `HL-001` is **wholly subsumed** by `HL-005` — 2 matching combinations, 0 escape HL-005; its SS1/23 citation never operative | verified exhaustively |
| 4 | `CTRL-SYNTHMARK-01` has `resolves: []` — unreachable by the solver; the only such control. EU AI Act Art. 50(2) marking can never be required | verified |
| 5 | `HL-002` condition (`Zone A`) contradicts its own `reason` ("MNPI outside Zone C"). MNPI in Zone B rejects via an unsatisfiable invariant, not a named hard line | verified |

Defect 2 is the most damaging to the product claim. The engine answers
"approved with controls" for E-03 and F-01 when the honest answer is **"out
of appetite as designed"** — the control set it prescribes is a demand to
build a different system. This is also a large part of why **25 of 31 cases
land on `approved_with_controls` and none on plain `approved`**: the control
library is too coarse to distinguish mitigation from prohibition.

## Convergent rulebook findings

Raised **independently by both adjudicators** — the strongest signal available,
since neither saw the other's work.

- **`TRACK-II-REPLACE` and `TRACK-II-AUTONOMY` are unreachable** for their
  stated purpose. Tracks are first-match/short-circuit and TRACK-I/II are
  declared first, so a replacing model routes to TRACK-II anyway. The rule
  that exists to force Track II "regardless of model type" can never change
  an outcome.
- **`agentic` is excluded from `INV-TRACK2-01`, `INV-HALLUC-01`,
  `INV-CITE-01` and `INV-DRIFT-01`.** A tool-using agent producing material
  output inherits *fewer* generative-risk controls than a plain LLM doing the
  same work — the inverse of the intended risk ordering.
- **`INV-CITE-01` is keyed to `action_type: draft`**, so a
  retrieval-and-summarisation assistant (`read`) — the canonical hallucination
  surface — carries no citation obligation.
- **`INV-CONDUCT-01` is keyed on delivery channel, not on who is affected.**
  A consumer credit scorecard (C-01) and a collections model over customers in
  financial difficulty (C-04) trip **no fairness or bias obligation**, because
  their interface is internal. This contradicts the regulation the Critical
  tier itself cites. `kri_thresholds` defines `bias_disparity_pct` and no
  invariant ever requires it to be measured.
- **`INV-EXPLAIN-01` and `INV-DRIFT-01` exclude LLMs.** An LLM feeding a
  Critical-tier credit decision needs neither explainability nor drift
  monitoring; a logistic regression doing less needs drift.
- **`INV-AUTONOMY-01` exempts `advisory`**, so a client-facing system at
  autonomy 2 with `hitl: false` gets no human gate. Advisory output delivered
  straight to a retail client *is* the decision.
- **Platform envelope ordinals are never defined in the policy.**
  `max_data_class` / `max_exposure` are ordinal comparisons, and nothing in
  `appetite.yaml` states that Internal < Confidential < Client PII < MNPI.
  H-02's whole verdict rests on an unwritten ranking. (The engine declares it
  in `src/engine/envelope.ts` — correctly, and deliberately not derived from
  vocabulary order — but **the policy file a bank would sign off does not
  contain it**.)
- **An empty `jurisdictions` list silently de-scopes every pack.** F-03 drafts
  regulatory filings and E-04 deletes Client PII with no jurisdiction
  declared, so no jurisdictional rule can fire. A data-entry omission becomes
  regulatory de-scoping.
- **An unapproved vendor has no consequence** beyond losing inheritance — no
  invariant, no tier bump, no required review. H-03 lands at the same posture
  as a vetted internal deployment.
- **Placeholder packs still fire.** MAS-FEAT, FSA-JP and OSFI-E23 carry
  `[ILLUSTRATIVE — NOT VERBATIM]` text and `retrieved_date: [NOT RETRIEVED]`,
  yet their rules add controls and reviews to G-04 and G-05. Per the packs'
  own headers those verdicts are **unreviewable**, not merely provisional.

### Raised by one adjudicator, worth recording

- **Tracks have no downstream effect.** No invariant, tier, control or
  workflow rule references a track id, so track selection is inert — TRACK-III,
  the whole point of the SR 26-2 carve-out, attaches no consequence beyond
  what `model_type`-keyed invariants already do.
- **Invariant severity does not floor the tier.** G-04 trips
  `INV-AUTONOMY-01` (severity `Critical`) and lands at tier `Medium`, whose
  workflow is *2LoD-notify*. A Critical-severity breach never reaches 2LoD
  approval.
- **`decision_type: hiring` triggers no base tier.** A CV screener is Critical
  only if the EU pack is loaded; the identical tool elsewhere is High or lower.
- **`E23-CA-CTL-01` mandates `CTRL-LOG-01`** — "tool-call logging, kill
  switch, minimal permissions", the agentic control — for any autonomy ≥2
  model. Applied to a non-agentic scorer it has no tool calls to log.
- **`DORA-EU-REV-01` uses `data_zone: Zone B` as a proxy for third-party ICT**
  while the graph carries a populated `vendor` field the rule ignores.
- **`HL-005` rejects routine retention deletion** outright with no control
  path, though automated deletion under GDPR storage-limitation is standard.

## What this round does and does not establish

**Establishes.** The engine is a faithful executor of the written appetite on
outcome: 30/31 status agreement with two independent readers who never saw its
answer. Routing and decision are sound.

**Establishes.** The rulebook has real defects — a third of the model×
bindingness space unrouted, a control library that cannot express bounded
autonomy, a fairness invariant that misses consumer credit, and a dead
control.

**Does not establish.** That the appetite is *correct*. The oracle tests the
engine against the rulebook, never the rulebook against the world. The
convergent findings above are two careful readers' judgement, not authority.

**Does not establish.** Anything about the jurisdiction layer's substance
while three of seven packs remain unauthored placeholders.
