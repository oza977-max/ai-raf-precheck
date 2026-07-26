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

## Open

**SR-1 — PV-2 and PV-5 unreachable from intake.** `deferred — awaiting
triage`. Promotion route to `requirements.md` not yet chosen. Re-prompt at
the next checkpoint per shared rule 27.

## For round 2

1. Apply the strict criterion (consumer FAIL only).
2. Standing mandate: hunt the RF-1 variants R6 cannot pattern-match.
3. Weight panel attention toward recently-written code.
4. Consider an R8 parity rule for `.md`/`.html` divergence.
5. Dual review does not trigger until round 3.
6. Ship-ready needs `/gvm-explore-test` (VV-2(c)) — it is the only gate
   standing between the current build and the top verdict.
