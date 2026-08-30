---
schema_version: 0
---

# Review Calibration — AIGate

Carried forward between review rounds. Round 2 reads this and applies a
strict criterion; round 1 ran liberal because there was nothing to calibrate
against.

## Score history

| Round | Date | Type | Panels | Critical | Important | Minor/Sugg | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | 2026-07-26 | code | A,B,C,D,E | 7 | 6 | 7 | Merge |
| 1 | 2026-07-26 | test | full mode | 0 | 0 | 0 | **Demo-ready** |
| 1 | 2026-07-26 | explore | interruption | 1 | 1 | 1 | 3 defects, 1 obs |
| 2 | 2026-07-27 | explore | confirmation | 0 | 1 | 1 | D-001 fix confirmed |
| 2 | 2026-07-27 | test | full mode | 0 | 0 | 0 | **Ship-ready** |
| 1 | 2026-07-27 | oracle | fable+opus, blind | — | — | — | 30/31 status, 24/31 binding |
| 2 | 2026-07-27 | oracle | fable+opus, blind | — | — | — | 30/31 status, **31/31 binding** |
| 2 | 2026-07-28 | code | A,B,C,D,E | 3 | 3 | 3 | **Merge with caveats** |
| 1 | 2026-07-29 | design | A,B,C,D,E,F | 2 | 11 | 2 | **Build with caveats** |
| 3 | 2026-08-04 | test | full mode | 0 | 7 | 9 | **Demo-ready** |
| 3 | 2026-08-06 | code | A,B,C,D,E | 0 | 6 | 0 | **Merge with caveats** |
| 4 | 2026-08-08 | test | full mode | 0 | 2 | 1 | **Demo-ready** |
| 5 | 2026-08-09 | test | full mode | 0 | 0 | 0 | **Demo-ready** |
| 6 | 2026-08-15 | test | full mode | 0 | 0 | 0 | **Ship-ready** (OQ-5: user chose ship; no CI, manual evidence) |
| 1 | 2026-08-25 | doc | A,B,C,D (standalone) | 2 | 15 | 10 | **Do not publish — revise first** ("After Deployment" briefing, 2nd ed.; all C+I fixed same-session per owner triage → 3rd ed. republished; R2 recommended) |
| 2 | 2026-08-25 | doc | A,B,C,D strict | 0 | 3 | 4 | **Publish with revisions** (3rd ed. scored 8.2 — integrity 9 ↑, transparency 8 ↑, prose 6 ↓ regression from R1 fixes; all 3 Importants + prose pass fixed per owner triage → 4th ed.; stopping rule not yet met, targeted R3 optional) |
| 2 | 2026-08-31 | design | A,B,C,D,E,G (G supplementary, strict) | 6 | 8 | 3 | **Build with caveats** (verdict/sign-off screen; triggered by explore-006's 3 Critical UX findings; 4 panels independently converged on the same fix mechanism for the core finding; owner chose fix-everything) |
| 3 | 2026-08-31 | design | A,C,D,E,G strict (no B/F — no contract/quality-attribute change) | 2 | 6 | 3 | **Build with caveats** (verdict screen information architecture and narrative flow — not another leak sweep; owner's own proposed 5-beat restructure independently stress-tested rather than rubber-stamped; both Criticals are proposal-design gaps, not pre-existing code bugs — beat 4 forced grouping [C+G converged] and binding-constraint deletion's false premise [A+D converged]; triage pending) |
| 4 | 2026-08-31 | design | A,C,D,E, + Panel G fanned out one sub-panel per screen (9 screens) — 13 panels total (no B/F) | 10 | 14 | 8 | **Build with caveats** (app-wide narrative flow — same audience-hospitality lens applied to every screen outside the already-fixed verdict screen; owner asked "look at all screens with same lens"; strongest signal is 3-panel convergence [A+C+D] that the round-3 fix — Fold, NF-11 — was built as a one-screen patch, not a reusable house convention, and did not propagate; triage pending) |

## Round 1 measurements

**Capture-recapture.** Panels A and B independently found the same defect
(`platform_satisfies` unconsumed) — one overlapping pair. Lincoln-Petersen
on a single pair estimates ~30 total against 26 unique found, ≈87% coverage.
**One overlap makes this estimate very noisy**; treat it as "probably most of
them", not a number. Round 2 was optional on this evidence, not indicated.

**Borderline filter.** 4 borderlines raised, 2 kept (50%). Kept: the N=1
margin degeneracy (independently raised by two panels — promoted per the
multi-panel rule) and the `pack_files` drift risk. Discarded: two `source_url`
provenance nits already covered by a stronger finding.

**Where the defects were.** 9 of 13 Critical/Important findings were in code
written the same day as the review. The oldest untouched code produced almost
nothing. This is the single most useful calibration signal from round 1:
recency predicts defect density here far better than complexity does.

## Build verification 001 (test phase)

Verdict **Demo-ready**, emitted by `gvm_verdict.evaluate` over the
thirteen-criterion table. Ship-ready blocked by a single gate:

**VV-2(c) FAIL — exploratory testing has never been performed.** No
`test/explore-NNN.md` charter exists. Every VV-3 gate passed and no VV-4
trigger fired, so the fall-through is Demo-ready rather than Not shippable.

Measurements worth carrying:
- 60/80 requirements IMPLEMENTED, 0 PARTIAL, 0 STUB, 20 deferred. No
  in-scope Must unimplemented.
- Zero blocking integration seams.
- **Acceptance-criterion traceability is 30/116 (26%).** A seven-case sample
  of the untraceable ones found a verifying test for every one — so the gap
  is traceability, not coverage. It is nonetheless the same mechanism that
  hid CS-1 for two months behind a duplicate id, and it is a poor answer for
  a product selling auditability.
- Real-chain test is exemplary: whole App, real engine and store, with the
  Anthropic SDK the only mock in the suite.

**The verdict understates the real gap.** Demo-ready is about the build. The
substantive issue is that zero historical committee decisions have ever been
compared against an engine verdict — the product's core thesis is untested,
and no amount of green suite changes that.

## Oracle rounds (new artefact type — see backtest/oracle-protocol.md)

A blind adjudication method with no GVM skill behind it, built because the
back-test needed a ground truth and committee recollection was rejected as one.
Two independent adjudicators (Claude Fable 5, Claude Opus 4.8) score every
corpus case from `policy/appetite.yaml` alone — no sight of the engine's
verdicts, its tests, its code, or any written prediction. Disagreements are the
output; agreement is weak evidence.

**Reading the disagreement pattern is the whole method:**

| Pattern | Diagnosis |
|---|---|
| Both oracles agree, engine differs | Engine defect |
| Oracles disagree with each other | The RULE is ambiguous |
| All three agree but the answer is wrong | Rulebook defect |
| Engine cannot decide | Coverage hole |

**Round 001 → 002 measurements.** Binding-constraint agreement went 24/31 →
**31/31** after the tie-break was fixed; status held at 30/31 (the persistent
disagreement is H-01, inheritance semantics the policy never defines). Round
001 found 9 of 28 model_type × bindingness pairs unrouted and five verified
structural defects. Round 002's brief added a REGRESSION hunt, and that is what
made it valuable.

**RF-4 — a fix that displaces the defect one rule down.** NEW recurring
finding, and the most important lesson of the two rounds. Both adjudicators
independently observed that several round-001 fixes reintroduced the same
defect one rule further on: promoting the special tracks made TRACK-III-AGENTIC
unreachable for autonomy≥3 agents; widening HL-002 orphaned INV-ZONE-01;
CTRL-AUTONOMY-BOUND-01 fixed abolish-the-use-case in INV-AUTONOMY-01 and
INV-AUTONOMY-02 inherited it; fixing the tie-break in code left the rule absent
from the policy; applying "obligations follow the affected person" to conduct
and fairness left the sibling rules gated on model family.

**The mechanism behind RF-4 is a process failure, not a reasoning failure.**
All of it was built outside the GVM discipline — no chunk prompts, no
handovers, and no independent review convergence loop. The convergence loop is
exactly what catches a fix that displaces a defect. Code review 002 confirms
it: the panels found the vacuous totality test in one pass, and it had already
been cited three times as evidence.

## Recurring findings

**RF-1 — "declared, threaded, never consumed".** Now seven confirmed
instances: regulatory citations dropped at verdict assembly (V1);
`platform_satisfies` (twice — the field itself, and again when PV-A added a
parallel mechanism instead of removing it); `safety_margin` discarded as
`_margin`; `resolveActivePacks` ignoring the jurisdiction registry; the CS-1
margin fields computed and never rendered; `ConfidenceCaveat.field`.

Mechanical guards added: parity rules **R6** (engine parameters named `_x`,
with `.parity-allowlist` requiring written rationale) and **R7** (no
test-case id used by two different tests). R6 found three further instances
on its first run.

**R6 does not catch the variants that matter most.** It matches only the
`_paramName` spelling. It did not catch the CS-1 margin fields (computed,
persisted, unrendered) or `ConfidenceCaveat.field` (written, never read).
A field-level read/write analysis would. **Round 2 should treat "find the
variants R6 cannot see" as a standing panel mandate.**

**RF-2 — parallel `.md`/`.html` artefacts drift silently.** Two instances in
one day: `verdict-audit.html` missing a V2-D reword, and nine test cases
written to `test-cases.md` and never rendered into the HTML. The parity
script reads `.md` only, by design, so it cannot see this class at all.
Candidate for an R8 rule.

## Anchor examples

**Worst — a duplicate id concealing an unbuilt requirement.** `TC-CS-1-02`
meant three different things across requirements, spec and code. CS-1's
safety margin was half-built for two months while the traceability matrix
reported it covered, because the code test carrying that id asserted
something else entirely. Cost: a Must requirement unbuilt and unnoticed.

**Worst — a documented lesson violated while visible.** `sample-register.ts`
used check-then-act on an append-only trail. `aigate-self-assessment.ts` sat
beside it doing it correctly, and CLAUDE.md documents the exact fix. Being
told is not the same as being guarded.

**Best — a latent defect caught by asking what the tests structurally cannot
see.** C-6 was invisible to 245 passing tests because the inheritance block
only renders when a platform is declared and no test declared one. Panel D
found it by reading the convention rather than running the suite.

**Best — honesty machinery verified rather than assumed.** Panel E confirmed
placeholder quotes genuinely produce their caveat, `[FIRM]`/`[DATE]` reads as
unsigned, and OB-1..5/PV-4/PV-7 are unclaimed anywhere in code. Zero
Criticals on the product's core claim.

## Resolved this round

All 13 Critical and Important findings fixed and verified (253 tests, 3
consecutive runs, tsc, build, parity R1–R7, live browser check).

## Round 2 (code) measurements — 2026-07-28

Range `f256308..HEAD`: 8 commits, 38 files, +4652/-565, built entirely outside
the GVM discipline. Verdict **Merge with caveats**. 3 Critical, 3 Important,
3 Minor.

**Capture-recapture.** Panels A (3) and D (4) overlapped on 1 finding.
Lincoln-Petersen: (3×4)/1 = 12 estimated, 9 unique found, ≈75% coverage.
**One overlapping pair makes this extremely noisy** — the same caveat as round
1. Nominally <80% indicates a round 3; the finding distribution argues against
it, because 7 of 9 share one mechanical root cause and a third round would
mostly re-scan documentation.

**The single most valuable finding of either code round: the vacuous test.**
`track.test.ts` asserted `if (!assignTrack(g, tracks))`. `assignTrack` returns a
`Result` OBJECT — always truthy — so `unrouted` could never be populated and the
test passed against ANY policy. Proven by deleting TRACK-I and watching all four
tests stay green. It was written specifically to guard the defect class that had
already shipped twice, it guarded nothing, and its green tick was cited in the
policy comments, the commit message and the round-002 report as proof of
totality. **A test that cannot go red is worse than no test, because it is
quoted as evidence.** Fixed, plus a mutation guard that breaks the routing on
purpose and requires the checker to notice.

**RF-2 confirmed again, at scale.** 7 of 9 findings are one root cause: the
pack deletion was applied to code and policy and propagated to nothing else —
README, `specs/policy-schema.md` + `.html`, two MUST-priority test cases in both
twins, `docs/approach.md`, `docs/rules.md`, `backtest/use-cases.md`. Shared rule
24. `spec-parity-check.py` reads only `.md` and structurally cannot see the
`.html` half.

**Cross-panel synthesis that neither panel could reach alone.** Panel A verified
`docs/rules.md` regenerates byte-for-byte identical; Panel D found its header
count wrong. Both correct — the defect is in the GENERATOR, not the file.

**Where the defects were, again.** Zero engine defects survived inspection.
Panel B returned zero findings and Panel C cleared totality, reachability,
subsumption, termination and ordering by programmatic enumeration. Every
Critical was either a test that could not fail or a document contradicting
shipped behaviour. Recency still predicts density — but this round says
something sharper: **the code was fine and the claims about it were not.**

## Open

**SR-1 — PV-2 and PV-5 unreachable from intake.** `deferred — awaiting
triage`. Promotion route to `requirements.md` not yet chosen. Re-prompt at
the next checkpoint per shared rule 27.

## For round 3

1. Strict criterion continues. **Dual review triggers** (shared rule 16 — two
   completed code rounds now exist).
2. **Standing mandate: hunt vacuous assertions.** Round 2's Critical was a test
   that could never fail. For every test that guards a named defect class, the
   reviewer must mutate the thing under guard and confirm the test goes red.
   Reading the assertion is not verification.
3. **Standing mandate: RF-4.** For every fix in the range, ask what it displaced
   — check the rule immediately after it in any ordered list, and every sibling
   of the rule that was changed.
4. Verify documentation claims against behaviour, not against other documents.
   Round 2's remaining Criticals were all prose contradicting shipped code.
5. An R8 parity rule for `.md`/`.html` divergence is now overdue — RF-2 has
   recurred in three consecutive rounds.

## For round 2 (superseded — retained as the record)

1. Apply the strict criterion (consumer FAIL only).
2. Standing mandate: hunt the RF-1 variants R6 cannot pattern-match.
3. Weight panel attention toward recently-written code.
4. Consider an R8 parity rule for `.md`/`.html` divergence.
5. Dual review does not trigger until round 3.
6. Ship-ready achieved in run 002 after explore-001 found D-001 (Critical),
   it was fixed, and explore-002 confirmed the fix.

## Lesson from the 001 -> 002 sequence

The verdict got WORSE before it got better. Run 001 returned Demo-ready with
VV-2(c) failing purely because no exploratory session existed. Once one did,
VV-2(c) passed but VV-4(d) triggered on the Critical that session found — a
re-run at that moment would have been Not shippable. Only fixing D-001 and
re-testing produced Ship-ready.

Demo-ready in run 001 was therefore partly a reward for not having looked.
Worth remembering when a gate passes on absence of evidence.

**Methodology gap:** `ExploreDefect` has no `resolved` field, so a fixed
defect cannot be marked fixed inside its artefact. Clearing VV-4(d) requires
an entirely new session, which creates pressure to edit the record instead.
`explore-001.md` was deliberately left unedited. A `resolved:` / `fixed_in:`
field would close this.

**RF-3 — the guard existed but not everywhere.** D-001 was the same
state-lands-too-late pattern as code-review C-5, on a handler that lacked the
ref guard its neighbours had. explore-002 checked adjacent surfaces (2LoD
approve) and found them guarded, so the defect was isolated rather than
systemic. When a defect class is fixed in one place, audit every sibling
call site — not just the one that failed.

---

## Round 1 (design) measurements — 2026-07-29

First recorded design round. `design-review-001.html` exists but carries no
verdict string and no score-history row, so there was no design baseline; this
round establishes one.

**Capture-recapture.** 3 cross-panel overlaps (B∩C ×2 on `onCorrect` and
`findLatestVerdictEvent`; C∩E ×1 on the missing `verdict_id`). Lincoln-Petersen
across those pairs estimates ~11 against 15 unique found — coverage above the
80% threshold, so R2 was not indicated. Treat the estimate as soft: three
overlaps is a thin basis.

**Panel yield.** A 2, B 5, C 4, D 5, E 3, F 1. Panel B and Panel D carried the
round — both by reading source rather than specs. Panel A's single Important
(R3-JU-6 untraced) was the one finding no code read could have produced.

**The dominant failure mode, and it is not new.** Both Criticals and two
Importants (I-1, I-5) have one cause: a claim written into a spec and never
checked against the code it describes. Specifically — the sign-off payload was
assumed able to carry a verdict reference; the reclassification affordance was
assumed suppressible by not mentioning it; control evidence status was assumed
to live on the Verdict; StrictMode semantics were assumed backwards. Each check
was one command.

This is the third occurrence in recent project history: charter 003's D-002
(claimed a form field absent that was present), the Phase 8 query-tightening
premise (claimed tests would break that could not), and now these four. Round
2 (code) already recorded "verify documentation claims against behaviour, not
against other documents" and its Criticals were all prose contradicting shipped
code. **Two consecutive rounds is the promotion threshold under shared rule 21
approaching; a third makes it mandatory.** Promoted to a build check now rather
than waiting — see `build-checks.md` BC-001.

**What held.** ADR-EE-R3-1 was probed by two panels as possible scope creep and
independently defended by both. Panel F found the (H,H) risk lower than the tree
assumed — `VerdictDisplay` has no effects at all. No vacuous tests in the
original 33, which is a change from round 2 where the Critical was exactly that.

## Anchor examples — design (new)

**Worst, contracts (score 6):** register-lifecycle §15.1 stated the
reclassification affordance was "deliberately not carried over" while
`VerdictDisplay`'s `onCorrect` prop was required and its button ungated. The
spec described an outcome the component could not produce.

**Worst, coverage (score 8):** R3-JU-6 ("a Provisional verdict states its
cause") was never traced onto the sign-off page — a rendering surface the same
round created. The requirement was not scoped to one screen; the design assumed
it was.

**Best, structure (score 7 despite):** ADR-EE-R3-1 diagnosed a real pre-existing
duplication, rejected the cheap fix with a stated reason, and disclosed the
scope expansion in the chunk plan. Two panels probed it for scope creep and both
cleared it.

## For round 4

1. Strict criterion continues. Dual review now genuinely triggers — three
   completed rounds across types.
2. **BC-001 applies** (see build-checks.md): every spec claim about an existing
   symbol must cite the file:line it was verified against.
3. RF-2 (.md/.html divergence) recurred again this round — four consecutive.
   Round 3 mitigated it for requirements and test-cases by generating the HTML;
   the four domain specs are still hand-maintained twins and drifted twice
   during this session's edits, caught only by scripted probes. Generating them
   is now overdue.

| 2026-08-04 | /gvm-test 003 (full mode, post-Phase-8) | Demo-ready | 148 cases walked: 123 PASS, 7 FAIL, 9 STUB, 5 deliberate deviations, 1 BLOCKED. VV-2(a) failed; no VV-4 trigger. Systemic finding: five deviations decided in code comments and never written back to requirements.md. |
| 3 | 2026-08-07 | code | A,B,C,D,E,blind | 1 | 5 | 2 | **Merge with caveats** — 3 of 6 findings introduced during the round-4 fix pass; blind panel found the identity gap |

## Doc review round 1 (2026-08-25) — "After Deployment" briefing

**Scores (Panel D, analytic):** Argument 9 · Factual integrity 8 ·
Evidence transparency 7 · Prose/audience fit 7 · Dataviz 9 → **8.0
overall** (whitepaper threshold 9.0; public-facing 9.3).

**Capture-recapture:** ~30 unique findings, only 2 confirmed cross-panel
overlaps (Fig-2 arithmetic B∩D; dek A∩C) — sparse overlap implies
estimated coverage well under 80%; **R2 recommended** after fixes.
**Borderline filter:** 5 raised, 3 kept (60%).

**Anchor examples (doc dimension):**
- Factual integrity, worst: "EU AI Act high-risk live 2 Aug 2026" —
  false at publication (Digital Omnibus postponed Annex III to Dec
  2027, OJ 24 Jul 2026); survived TWO editions and a 4-agent research
  pass because everyone verified the statistic's original source, not
  its current status. Regulatory-status claims age; re-check at every
  edition, not just at first citation.
- Factual integrity, worst-2: Fig-2 caption exclusions double-counted
  (654+323+3≠977); panels caught what the author's own arithmetic
  missed. Always have someone re-add the figure captions.
- Evidence transparency, best: withdrawn-statistics paragraph naming
  what failed verification and why — panels called it exemplary.
- Dataviz, best: bar-width encodings spot-checked to reconcile with
  labelled counts within rounding across all figures.

**Recurring-candidate (watch in R2):** press-graded stats drifting into
settled-fact prose (Stanford/McKinsey pattern); ledger scope gaps
(claims that aren't numbers escaping the ledger).

## Doc review round 2 (2026-08-25) — strict, same day

**Key lesson: fixes create defects.** Both genuinely new R2 findings
were introduced BY R1 fixes (the closing verdict contradicting the
build-status box; the no-common-cause caveat breaking the "four
mechanisms" framing), and Panel D measured a prose REGRESSION (long
paragraphs 2→6) caused by fix-density. Verification rounds must diff
the fixes, not just re-scan the document.

**Second lesson, confirming R1's:** the IBM "63% no AI governance
policy" was the same either/or-combined-stat error already fixed once
for the Wolters Kluwer 72% — the correction standard must be applied to
ALL stats when one instance is found, not just the flagged one.
Candidate build-check if it recurs in R3.

All external spot-checks this round verified verbatim at primary
sources (Fed FEDS Notes, EUR-Lex OJ date for Reg 2026/1744, IBM 20%/
+$670K); MAS consultation confirmed via cache.

## Design review round 2 (2026-08-31) — verdict/sign-off screen, audience hospitality

**Scores (full review):** Requirements coverage 6 · Interface contracts 5 ·
Structural soundness 6 · Implementability 8 · Security 10 · Audience
hospitality (Panel G, supplementary) 3. No dimension gap flagged as
structural — every finding, including the core one, has a proven fix
using patterns already in the codebase.

**Multi-panel convergence — the strongest signal this round.** Four
independent panels (A, C, D, G) landed on the identical root cause and
fix mechanism for the review's central finding ("Why this verdict" has
no fold seam) without seeing each other's output. This is the pattern
calibration should watch for going forward: when 3+ panels converge
unprompted on one fix, treat it as high-confidence even before manual
verification — though manual verification still ran and confirmed it.

**Anchor examples:**
- Worst, audience hospitality: the sign-off checklist (the screen's
  designated "fast first read") leads with a bare rule ID before any
  plain-language gloss reaches the reader — found independently by 4
  panels, the single clearest instance of "jargon precedes its own
  gloss" in the whole review.
- Worst, interface contracts: `RegisterDetail.tsx`'s audit-trail
  timeline renders the literal word "rejected" — a live violation of
  the project's own explicit reserved-word rule (HR3-08), caught by a
  panel whose mandate was contract mismatches, not reserved words —
  cross-panel scanning found what a reserved-word-specific check would
  have caught directly, worth noting as a coverage argument for keeping
  panels orthogonal by defect class rather than by area.
- Best, implementability: every Critical finding except the core one
  had a working precedent already in the same file — `findRuleDescription`
  used two hundred lines away for an identical problem, `STAGE_LABELS`
  correctly used for the same field the audit trail gets wrong. The
  fixes are consistency fixes, not new capability.

**Recurring-candidate, watch in future rounds:** ID-before-gloss is now
confirmed as a *pattern*, not a single defect — 6 separate instances
found this round alone. If this recurs in a future round after the
current fix pass, promote to a build check (grep for bare `{verdict.*id}`
or `<code>{...}</code>` renders with no adjacent label resolution).

## Design review round 3 (2026-08-31) — verdict screen information
architecture and narrative flow

**Scope note.** This round did not re-scan for jargon or leaked IDs —
that class was round 2's job and is fixed. This round targeted a
different defect class entirely: the screen's *shape* — is it organized
by data type (one panel per engine field) or by narrative arc (decision
→ why → action → risk → record)? The owner's own diagnosis and a
sketched 5-beat restructure (Minto Pyramid Principle) were the object
under review, not the code as-shipped — a deliberate departure from
prior rounds, where the review target was always the current build.

**Scores (full review):** Requirements coverage 7 · Structural soundness
6 · Implementability 7 · Security 9 · Audience hospitality (Panel G,
supplementary) 7. Panels B (interface contracts) and F (quality
attributes) did not run — no API/data contract changes and no new
quality-attribute scenario in scope; both explicitly recorded as
not-applicable rather than silently skipped.

**Multi-panel convergence — again the strongest signal.** Two
independent pairs of panels, each scanning for an unrelated defect
class, converged on the same two problems in the *proposal itself*: (C
+ G) on beat 4 being a forced grouping — only expiry-conditions
actually fits "what could change this"; (A + D) on the binding-constraint
deletion resting on a false premise — the appetite line the proposal
claimed made it redundant never actually renders the rule ID at all.
Consistent with round 2's finding: unprompted convergence across
orthogonal panels is the highest-confidence signal this methodology
produces, this time catching flaws in the *reviewer's own proposal*
rather than in shipped code — the panels did not rubber-stamp the
diagnosis they were handed.

**Anchor examples:**
- Worst, structural soundness: beat 4 ("what could change this") bundles
  fragility (present-tense, not forward-looking), inheritance
  (provenance, not risk), and living-status (a status readout) alongside
  the one panel that actually belongs there (expiry) — bucketed for
  beat-count symmetry, not conceptual unity. The clearest instance this
  project has produced of a synthesis step imposing a clean-sounding
  structure the underlying content doesn't actually support.
- Worst, audience hospitality: the proposal folds beat 4 away by default
  for non-2LoD readers — hiding "this decision could expire or fall
  apart" from exactly the first-time, non-technical reader the owner
  named as the person they're most worried about losing. A fix aimed at
  that reader that would have made their actual worry *less* visible if
  built as sketched.
- Best, implementability: Panel D produced a concrete, six-step
  incremental build sequence (each step independently shippable and
  test-verifiable) rather than treating the restructure as one big-bang
  change — directly actionable, no further design work needed to start
  building steps 1-4.

**Recurring-candidate, watch in future rounds:** this is the second
round in a row (round 2, round 3) where a reviewing panel found a real
defect the main-loop synthesis had missed *before* dispatching the
panels — round 2 found the reserved-word "rejected" leak outside its
own mandate; round 3 found the binding-constraint deletion's premise
was factually wrong. If a third round produces a similar catch, promote
"synthesis-stage claims about existing code get independently verified
by at least one panel before being treated as ground truth" to a
standing process note in this skill's Hard Gates, not just an
observation here.

**Root-cause finding, not just a defect list (Panel A):** no requirement
in this project forbids internal spec-ID leaks into rendered text, and
none specifies fold-state-by-audience — that requirements gap, not a
coding mistake, is why 5 prior design rounds (R9, R12, R13, R14, R15-C2)
never caught this. The fix pass this round should close the code-level
defects AND add the missing requirement, or the class of bug can recur
in a future feature.

## Design review round 4 (2026-08-31) — app-wide narrative flow

**Scope note.** The owner asked to apply round 3's audience-hospitality
lens to every screen in the app, not just the one it was built for.
Nine screens/steps (the 6-step intake flow, the register list, the
appetite framework, rule challenges + about) were scanned in parallel
by Panel G, one sub-panel per screen — the first time this skill has
fanned a single panel out across that many independent targets in one
round. Four holistic panels ran once, app-wide, excluding the verdict
screen (already fixed). No Panel B/F — same rationale as round 3.

**Scores (full review):** Requirements coverage 6 · Structural soundness
5 · Implementability 6 · Security 9 · Audience hospitality (Panel G,
averaged across 9 screens) 4. Lowest Panel G score of any design round
run so far on this project — worse than the verdict screen scored
*before* round 3's fix (3/10).

**Multi-panel convergence — the strongest signal, again, but this time
about a systemic gap rather than a single defect.** Three panels
(A, C, D), each scanning for an unrelated defect class, independently
converged on the same root cause: round 3's fix was built as a
one-screen patch, not a reusable house convention, so it could not
propagate. Panel A found NF-11 already violated on two other screens
(regression-by-omission, not a new gap). Panel C and Panel D
independently found the `Fold` component that made the fix work is a
private, unexported function — reinvented three different ways
elsewhere with three different accessibility semantics, rather than
reused once. Three-panel convergence on a *process* gap, not a code
defect, is a new pattern for this project's calibration history — worth
watching whether it recurs.

**Anchor examples:**
- Worst, audience hospitality: the intake flow's duplicate-check step,
  where the on-screen instruction text for a non-2LoD user ("contact
  AI Risk to adopt") is directly contradicted by a fully clickable
  button right next to it that performs the adoption itself with zero
  role gating — the screen's words and its only interactive affordance
  disagree with each other.
- Worst, requirements coverage: `NF-10` rendered bare, unglossed, inside
  an `alert`-role banner on the Appetite framework screen — the single
  highest-visibility NF-11 violation found, because alert-role content
  is precisely what a screen reader or a scanning eye lands on first.
- Best, implementability: Panel D didn't just flag the Fold-reuse gap,
  it ranked all four candidate screens by fix risk (RuleImprovementQueue
  easiest → graph-review step hardest, with a named reason for each) and
  caught a real DOM-semantics trap in advance — swapping PolicyEditor's
  hand-rolled disclosure for the extracted Fold would change whether
  collapsed content is removed from the DOM or merely hidden, which an
  existing test already guards, but only if the implementer knows to
  check it.

**Recurring-candidate, now confirmed a pattern across 3 consecutive
rounds:** round 2 found a defect outside its panel's own mandate
(reserved-word leak), round 3 found the reviewer's own proposal
contained a factual error, round 4 found the reviewer's own round-3 fix
never propagated past the screen it shipped on. Per the round-3 note,
this is the third instance — promote "synthesis-stage claims about
existing code or prior fixes get independently verified by at least one
panel before being treated as settled" to a standing process note in
`gvm-design-review`'s Hard Gates, not just an observation here.

**Process implication, not just a defect list:** the implementation
path for this round explicitly sequences "extract Fold into a shared
component" as step 1, before any screen-specific fix — every other
fix in this round's findings depends on that extraction existing.
Future design reviews of newly-added screens should check reusable
patterns (Fold, NF-11's gloss discipline) as part of Panel A's
requirements-coverage pass by default, not wait for a dedicated
app-wide round to discover the drift.
