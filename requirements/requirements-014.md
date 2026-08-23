# AIGate Requirements — Round 14

## Round 14 — The Verdict Screen Recomposed

**Status: APPROVED by the user (2026-08-18) — "collapse the rest like R9,
then I'll test it … get experts, like GVM, be smart." Scope: the
GVM design-review panel's recommendation (Cooper / Krug / Fogg / Few
grounding) applied to the verdict screen, under the R9 ADR: aggregation
and priority, never deletion.**

## Provenance

User report after v0.15.1: the verdict is "not straightforward — too much
happening." v0.15.1 fixed the to-do list (plain three-line control
explanations, one-sentence headline, grouping). This round composes the
rest of the screen per the design-review panel.

## Functional Requirements

**R14-1 (Must) — honesty floor never folds:** provisional banner,
headline, appetite line, tier/track, binding constraint, "What you need to
do", downstream reviews, living status, memo export, and any UNVERIFIED /
overdue / provisional marker stay visible.

**R14-2 (Must) — "Why this verdict" stays open.** It is the load-bearing
defensibility claim; the folded panels are its substantiation (panel's
judgment call, argued via Krug's trunk test).

**R14-3 (Must) — one-click folds, each with a data-carrying gist line:**
How fragile (rules on a single control · margin vs target); Platform &
vendor inheritance (registry state · controls inherited); Regulatory
reasoning — the rules from law (count · pending sign-off) — the
no-rulebook single-sentence disclosure stays visible; What would make this
verdict expire (condition count); What you told us. The control set folds
ONLY when every control is VERIFIED ("N controls — all VERIFIED");
otherwise it stays open (Fogg: the prompt sits where the ability gap is).

**R14-4 (Must) — order:** "What you need to do" moves directly under the
headline, before tier/track and the binding rule — the submitter's first
question answered first; identifiers follow for the reviewer.

**R14-5 (Must) — copy:** binding constraint gains "— the single rule that
decided this"; "HEADROOM" → "Margin of safety"; all-caps arrow labels
(DERIVED / INHERITED / NOTHING INHERITED / RESTING ON A SINGLE CONTROL) →
sentence case; COSO axes → "built right (design)" / "working right
(operating)"; "(RA-9)" dropped from a user-facing heading.

## Non-Functional

R14-NF-1: presentation only — no engine change, no new data; every gist is
computed from fields already on the verdict. R14-NF-2: reserved words;
headings keep their roles (the fold title is a real h3 in the summary).

## Changelog

| Date | Change |
|---|---|
| 2026-08-18 | Drafted from the design-review panel; approved; built and shipped in v0.16.0 (659 tests). |

---

*Developed using the Grounded Vibe Methodology*
