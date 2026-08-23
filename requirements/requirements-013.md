# AIGate Requirements — Round 13

## Round 13 — The Knowledge Lens Earns Its Place

**Status: APPROVED by the user (2026-08-18) — "experts to judge how this
will practically work and solve that in the tool." Scope: every finding
from the two practical-judgment reviews (2LoD practitioner live-drive +
AI-risk taxonomist file audit).**

## Provenance

Practitioner verdict on the R11 knowledge panel as built: "a real 2LoD
team would not keep this panel on past month one." Empirics: a
client-facing LLM case matched 9 of 13 entries, 8 rendered as identical
"already covered" lines with the single gap visually indistinguishable;
the file-a-gap button gave no feedback; the panel sat below the entire
decision record; 17 pre-R11 register cases showed nothing with no
explanation. Taxonomist: three entries are near-single-field conditions
tagging whole model families; KL-SOCECON-01's vendor sentinel
(`"in-house"`) does not exist in the data model (real sentinels:
`"internal"`, `"VENDOR-APPROVED-LLM"`), so the entry misfires and its
empty `covering_rule_ids` reads as a principled gap while actually being
a curation miss beside the real INV-VENDOR-01.

**Design note (recorded):** the practitioner's claim that coverage is
"hard-coded" is not literally true — `covered` is computed per-case as
`covering_rule_ids ∩ rules-that-fired` — but because entry conditions
largely mirror their covering rules' conditions, they co-fire almost
always, making coverage *behave* static. The fix is condition
de-mirroring (R13-DATA), not a coverage redesign.

## 1. Functional Requirements

### R13-DATA — Curation fixes (taxonomist findings 1-3)

**R13-DATA-1 (Must):** Fix `KL-SOCECON-01`'s condition to the data
model's real vendor sentinels (`not_in: ["internal", "VENDOR-APPROVED-LLM"]`).
Its `covering_rule_ids` stays empty as a now-DELIBERATE decision,
documented in a comment: INV-VENDOR-01 addresses per-case vendor risk
assessment, not portfolio concentration — the gap claim is about
concentration specifically.

**R13-DATA-2 (Must):** Tighten the three family-tag conditions so each
entry earns its match:
- `KL-MALUSE-01` (autonomous action outside scope): add
  `autonomy_level: { gte: 2 }` — agentic AND meaningfully autonomous.
- `KL-HCI-02` (no route to a human): add
  `decision_bindingness: { in: ["material", "binding"] }` — the harm
  described ("wrongly-decided matter") presupposes a decision at stake.
- `KL-PRIV-02` (adversarial inputs): narrow exposure to
  `["client-facing", "market-facing"]` — the external attack surface,
  de-mirroring it from INV-SEC-01's broader trigger.
Comments on each entry state the R13 tightening and why.

### R13-UI — The panel directs attention (both reviewers' top fix)

**R13-UI-1 (Must):** Gaps render FIRST, in a visually distinct treatment
(the advisory idiom's alert-adjacent variant — border/icon), before any
covered entry.

**R13-UI-2 (Must):** Covered entries collapse by default into one
summary line — "N known risk domains already addressed by firm or pack
rules — show" — expandable to the full detail. Nothing hidden, attention
directed (the honesty posture, applied to salience).

**R13-UI-3 (Must):** Filing feedback: after "file as coverage gap"
succeeds, the entry flips to a persistent "Filed — on the
rule-improvement queue" state with the button gone/disabled. The state
derives from the audit events already on screen (a
`rule_dissent_filed` event whose rule_id names the risk domain) — no new
storage; re-render from the trail, so it survives reloads.

**R13-UI-4 (Must):** When a case's stored verdict PREDATES the lens
(payload lacks `knowledge_lens_matched_entry_ids` entirely), the detail
page renders one quiet line: "Not evaluated against the risk-knowledge
taxonomy — decided before this check existed." Absence of the check and
absence of matches become distinguishable claims.

**R13-UI-5 (Must):** When (and only when) uncovered gaps exist for a
case, a compact one-line notice renders near the top of the detail page
("N known risk classes have no covering rule — see the risk-knowledge
panel"), so a gap cannot hide below the fold. No gaps → no notice; the
panel stays in its current position.

## 2. Non-Functional (carried invariants)

- **R13-NF-1:** `evaluate()` untouched; lens condition edits change only
  advisory matches, never verdicts (the R11 byte-identity test stands).
- **R13-NF-2:** Reserved words; append-only trail (no new write paths —
  R13-UI-3 reads existing events).
- **R13-NF-3:** Legacy verdicts and legacy lens files keep rendering
  (R13-UI-4 is additive).

## 3. Requirements Index

| ID | Closes | Priority |
|---|---|---|
| R13-DATA-1 | Taxonomist F2 (sentinel bug + accidental gap) | Must |
| R13-DATA-2 | Taxonomist F1/F3 (family-tag conditions) | Must |
| R13-UI-1/2 | Practitioner F2, Taxonomist F5 (wallpaper) | Must |
| R13-UI-3 | Practitioner F3 (silent filing) | Must |
| R13-UI-4 | Practitioner F5 (silent absence) | Must |
| R13-UI-5 | Practitioner F4 (buried below the fold) | Must |

## Changelog

| Date | Change |
|---|---|
| 2026-08-18 | Round 13 drafted from the two practical-judgment reviews; approved in the same instruction ("solve that in the tool"). |
| 2026-08-18 | Built and shipped in v0.15.0 — all findings closed; 659 tests. |

---

*Developed using the Grounded Vibe Methodology*
