# AIGate Requirements — Round 15

## Round 15 — Option B: The Targeted Redesign

**Status: APPROVED by the owner (2026-08-25) — "Lets go option B",
with the standing operating regime (build/OPERATING-REGIME.md) and the
GVM pipeline ("GVM style build as always"). Scope: the chair's
reconciled proposal from design-deliberation-001
(reviews/design-deliberation-001/proposal.md — the SOURCE OF TRUTH for
per-screen target states; this document indexes it and binds the
amendments), as AMENDED by the two adversarial skeptics' fixes below.**

## Provenance

design-deliberation-001 (2026-08-23): six GVM panels (clarity /
interaction design / information layout & accessibility / AI governance /
regulation / banking practice), four rounds (blind papers →
cross-examination, 32 objections → chair reconciliation, 9 conflicts by
stated principle, 13 dissents recorded → adversarial check, both
skeptics "survives with amendments"). Unanimous verdict:
**targeted redesign** — presentation only; engine, audit model, honesty
markers and three-lever architecture untouched.

## 1. Functional Requirements — five chunks, in the chair's order

Each chunk implements the named proposal section VERBATIM as the design
contract, subject to the gates in §2. Wireframes and per-move rationale
live in the proposal; do not re-derive them.

**R15-C1 (Must) — Register list + stage labels + role-switcher honesty.**
Proposal §3.3 + §3.8. `STAGE_LABELS` in field-copy.ts (`pre_checked` →
"Awaiting 2LoD sign-off", `approved` → "Cleared" — the reserved-word
gate forbids "Approved"; builder must confirm both labels against the
Low-tier self-service lifecycle before landing); grouped filter chips
with an always-visible legend; 2LoD default view "awaiting your
sign-off (N)" with Show-all one click away; provisional roll-up as a
banner; Stale/Sampling merged into one "Flags" column with accessible
empty-state names; distinct self-assessment row; header role switcher
relabelled "Viewing as" + eight-word no-sign-in note, and the 1LoD
register note reworded to match. **Skeptic amendment S4 (Must):** the
Flags-column merge contradicts register-lifecycle.md §10.2's Must-level
column set (TC-RG-2-02) — chunk 1 STARTS with a requirements amendment
to §10.2 (both .md and .html) and the test update, in the same commit
as the change, never silently.

**R15-C2 (Must) — Verdict / sign-off recomposition.** Proposal §3.1,
REFRAMED per skeptic amendment S1: R14 already delivered a partial
R9-idiom pass (folds, honesty floor, what-to-do first) — chunk 2
FINISHES the job (provisional banner position, plain status lead
sentence, "Before you sign off" checklist, one-line-per-rule reasoning
list with all rules visible, controls summary-then-detail, section nav,
spec-ID strip, "firm rules (invariants)" wording). **Skeptic amendment
S2 (Must):** the "Before you sign off" checklist uses jump-link
affordances (chevron/bullet), NOT checkbox glyphs — it is
read-and-jump, not completable tasks; and the sticky section nav does
NOT include a direct "Sign-off" item (a one-click path from page-load to
Approve is the rubber-stamp risk the chair rejected in ID-4 — the
reviewer reaches sign-off by scrolling through the reasoning, as
today). **Skeptic amendment S3 (Must):** the self-asserted caveat
appears at the sign-off block (already verbatim-protected) AND the role
indicator carries the same no-sign-in honesty at the point of approval,
not only in the header.

**R15-C3 (Must) — Guided form + Confirm & attest + questionnaire tag.**
Proposal §3.2 + §3.5 + §3.7. Five plain-language sections
(fieldset/legend), technical term as muted always-visible suffix (never
tooltip), help paragraphs behind accessible "Why we ask" disclosures
with load-bearing sentences kept visible, "(optional — blank means: …)"
phrasing, NO field behind any toggle, single scroll. **Skeptic
amendment S1b (Must):** the raw-code fix is made at the SHARED source —
`graph-summary.ts#graphSummaryRows()` routes through field-copy.ts
labels — so BOTH call sites (ConfirmationStep and VerdictDisplay's
"What you told us" fold) are fixed at once; chunk 2 depends on this,
so the shared fix lands in whichever of C2/C3 builds first and the
other verifies it.

**R15-C4 (Must) — Appetite framework split + header chip.** Proposal
§3.4 + §3.8. Readable rulebook as the default view for every role; YAML
editor behind a closed-by-default disclosure with the honest no-sign-in
line; NOT role-gated. Header "translation fidelity: unattested"
compressed to a warning chip with an accessible disclosure (button +
aria-expanded, replacing the title= tooltip), full sentence preserved
in the disclosure and as the verdict checklist line.

**R15-C5 (Must) — Graph review refinements + rule-improvement queue.**
Proposal §3.6 + §3.9 + §3.10's one-line describe-step note. Field
labels reuse the form's question words (engine name as quiet code);
"model confident — no verified basis" reworded to "not found in your
text — worth a second look" keeping its OWN label, badge family shared
with guessed, three provenance states and no-plain-confirm gating
untouched; "not stated" quiet badge for silent decision-type/human-check;
aria-expanded on the disclosure buttons; long quotes truncate-with-expand
but values never collapse. Queue: plain rule name first, "has applied to
N decided cases", reviewer-vs-lens source tags, advisory paragraph
verbatim.

## 2. Gates — every chunk (the chair's G1–G7, binding)

G1 reserved words on every new string; G2 the three classes of code
(spec IDs deleted / rule-control IDs quiet beside plain names /
citations kept as chips — named in every build prompt so one regex
cannot eat citations); G3 accessibility (no hover-only meaning,
programmatic open/closed state, sticky nav collapses at high zoom); G4
boundaries (nothing in src/engine, presentation-only, determinism
untouched, no new writes from rendering); G5 protected strings verbatim
(self-asserted-name caveat, memo caption, "Outstanding means…",
audit-trail proof-of-concept sentence, "Informs — the rules decide",
provisional banner text, the model-proposed gate note); G6 no new
role-conditional rendering beyond today's; G7 the house ritual per
chunk (tests ×3, tsc, build, spec-parity with both twins, live
walkthrough, commit and push per milestone — the audit-trail regime).

## 3. Requirements Index

| ID | Proposal source | Amendments bound | Priority |
|---|---|---|---|
| R15-C1 | §3.3, §3.8 | S4 (register-lifecycle §10.2 amendment) | Must |
| R15-C2 | §3.1 | S1 (R14 framing), S2 (no checkbox glyphs, no nav shortcut to sign-off), S3 (role honesty at approval point) | Must |
| R15-C3 | §3.2, §3.5, §3.7 | S1b (graphSummaryRows fixed at shared source) | Must |
| R15-C4 | §3.4, §3.8 | — | Must |
| R15-C5 | §3.6, §3.9, §3.10 | — | Must |
| Gates | §7 (G1–G7) | — | Must, every chunk |

## 4. Out of scope (recorded)

Everything the deliberation's dissents rejected stays rejected: sticky
Approve bar, merging provenance states, advanced-toggle field hiding,
removing the fidelity marker, role-gating the YAML editor, collapsing
attested values. Option C (full redesign) declined by the owner.

## Changelog

| Date | Change |
|---|---|
| 2026-08-25 | Round 15 drafted from design-deliberation-001's Option B + skeptic amendments; approved by the owner the same day. |

---

*Developed using the Grounded Vibe Methodology*
