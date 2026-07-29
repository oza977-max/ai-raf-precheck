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
