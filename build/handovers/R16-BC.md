# Handover: R16-BC — The plain-language guided form + "what we understood"

## Status: Complete
## Commit: `d80307b` — feat: R16 chunks B+C and D1 — plain-language form, "what we understood", verdict first screen
## Branch: main

This commit carries **two** chunks released together per the contract's
own ordering (D-18/D-34: B+C and D1 built in parallel, one release unit).
This handover covers **B+C only** (UC-8, UC-9, UC-10, UC-11, UC-12 —
`build/prompts/R16.md` v2.1 §2–§3): the guided form that asks about the
submitter's situation instead of engine categories, and the "Here's what we
understood" summary. See `R16-D1.md` for the verdict first-screen half of
the same commit.

## Files Created (this chunk's own)
- `src/components/plain-copy.ts` — every question, option, assumption and
  summary text, in one code-free module (§2.4), shared with chunk D1's
  "also completes" copy and (later) chunk E's questionnaire.
- `src/engine/plain-intake.ts` + `.test.ts` — the pure mapping,
  `plainAnswersToFormValues(answers, policy) → { values, assumptions }`.
- `src/components/UnderstoodSummary.tsx` + `.test.tsx` — "Here's what we
  understood", rendered by `ConfirmationStep` on both the form and
  description paths.
- `src/engine/backtest-parity.test.ts` (blind) and
  `backtest-parity-nonblind.test.ts` (UC-9…13) — the parity suite; see
  below.
- `test-cases/test-cases-019.md` — TC-R16-B-01…32, TC-R16-C-01…10,
  TC-UC-3a-01…03, adapted TC-R3-JU-*.

## Files Modified (this chunk's own)
`StructuredForm.tsx` (rewritten around the new question set) + its test;
`ConfirmationStep.tsx` + test (now renders `UnderstoodSummary`);
`intake-draft.ts` + test (versioned draft key, legacy-draft detection);
`intake-state.ts` (form-related reducer state); `build-graph-from-form.ts`
(multi-input-node support for tick-all data classes);
`graph-summary.ts` + test (`dataClassesBySeverity`, `destinationDescription`,
multi-row rendering); `src/App.css` (its own `/* R16-B/C … */` block);
`specs/intake-flow.md/.html`; `GraphReview.r9.test.tsx`,
`IntakeFlow.back.test.tsx`, `IntakeFlow.resume.test.tsx`,
`WalkingSkeleton.test.tsx` (adapted to the new form). `IntakeFlow.tsx` is
shared with chunk D1 in this same commit — this chunk's share is the form
submission/routing side.
Test-case retirement (the `## Superseded` mechanism `23ac538` just built):
`test-cases/test-cases-003.md` (3 jurisdiction-tri-state cases retired —
the tick-all Q11 has no separate answered/unanswered flag to test),
`test-cases/test-cases-015.md` (5 R15-C3 field-by-field form cases
retired in full), `test-cases/test-cases.md` (one entry, TC-UC-3a-04 —
dropdown-equals-canonical-vocabulary retired; the mapping's own
constraint-to-permitted-set is now tested directly in `plain-intake.ts`).

## Tests (verified)
Not recorded in the commit message for this commit (unlike A1/A2/W, no
"`N` tests × 3" line appears). `test-cases-019.md`'s own Verification
section states the ritual was run (`npm test` ×3, `tsc`, build,
spec-parity, trace-check, live walkthrough of the guided form and summary
screen) but does not pin a count.

## Diff Summary
The commit as a whole: 40 files changed (13 created, 27 modified), 6,885
insertions / 1,819 deletions. Not separable by chunk from `git log` alone
since both chunks share one commit; the file lists above are my best
attribution by filename and by what `test-cases-019.md`/`test-cases-020.md`
each claim ownership of.

## Parity test: blind answers vs. the worked-case predictions, as at this commit
`backtest/worked-case-answers.json`'s answers were written blind (narrative
only, by a separate agent, before this mapping existed — §2.3). Per the
contract, every difference from the pinned prediction is asserted and
explained in the test itself, not silently normalised away:

| Case | Result at this commit | Reason |
|---|---|---|
| UC-1 | Matches (status/tier/track/binding) | + "Vendor risk assessment" review (A2's platform→vendor link) |
| UC-2 | Matches (rejected, HL-002) | Same added review on the hard-line rejection |
| UC-3 | **Differs** — tier Critical, binding INV-FAIRNESS-01 (was High/INV-HALLUC-01) | Unregistered vendor (Q3 "Not sure yet"); tick-all Q5 captures a second data class the old single-field form could not; Q8 captures `credit-decision`, never recorded before at all |
| UC-4 | Matches (rejected, HL-001) | 4a resolves `model_type: ml` not `traditional-ml` — verdict-neutral, the hard line never reads it |
| UC-5 | **Differs** — binding INV-HALLUC-01 (was INV-TRACK2-01); status/tier/track unaffected | Unregistered vendor; Q5 reads Confidential not Internal; action reads as "drafts"/material not "suggests"/advisory |
| UC-6a | Matches (rejected, HL-002) | Same added review |
| UC-6b | **Differs — flips to rejected (HL-002)**, was `approved_with_controls` | The in-house platform's "earliest letter among its allowed zones" rule resolves Zone B, not the originally-recorded Zone C. Named in the contract as an expected, documented risk (§2.3). **Fixed in R16-W (W-9) — see `R16-W.md`.** |
| UC-7 | **Differs** — binding INV-AGENT-CRED-01 (was INV-AGENT-01); status/tier/track unaffected (Low/III) | Named-but-unlisted supplier → unregistered vendor; Q5 reads Confidential; Q13 ticks `credentialed_systems` |
| UC-8 | **Differs** — reproduces the separate "UC-8b" pinned verdict (Q8 is required, so UC-8's own blank-decision-type variant is unreachable by design — anticipated in the contract), plus tier Critical/binding INV-CONDUCT-01 (UC-8b was High/INV-HALLUC-01) | Q8 = regulatory-reporting; a wider-audience reading (market-facing, not internal-shared) |
| Assumption case (TC-R16-B-25) | `rejected`, HL-001 | Q9 "Not sure" + acts entirely alone + clients see it; Q9 assumption listed |
| Assumption case (TC-R16-B-26) | `approved_with_controls`, INV-AGENT-01 present | Q4 "Not sure" for a tool described as acting on its own; Q4 assumption listed |
| Assumption case (TC-R16-B-27) | `approved_with_controls`, tier Critical, binding INV-AUTONOMY-01 | Q6 + Q7 "Not sure" together produce the strictest graph (10 tripped invariants); both assumptions listed |

Non-blind (`backtest-parity-nonblind.test.ts`, recorded field values, no
narrative — UC-9…13): UC-9 (EU retail credit scoring) matches in full;
UC-10 (EU CV screening) **differs, verdict-neutral** — declaring the
in-house platform here fits its approved envelope, so PV-3 inheritance
discharges INV-EXPLAIN-01 instead of a direct control, same status/tier/
track/binding/downstream reviews; UC-11, UC-12, UC-13 match in full (UC-11/
UC-12 carry the same verdict-neutral fixed-autonomy-level note as UC-4/UC-7).

## Code Review Findings
None yet — no code-review round exists for any R16 code (see `R16-A1.md`).

## Deviations from Spec (found by the owner-side live walkthrough, fixed in R16-W)
Honestly recorded, per the task: this chunk's own commit message already
flags that a walkthrough found issues "fixed in the next commit." Specific
to this chunk (B+C):
1. **The form path still passed through the old field-card screen**
   (`graph_review` — DATA_ZONE/MODEL_TYPE cards with a "not found in your
   text" flag that is always false on the form path) between Continue and
   the summary — engine vocabulary the redesign was meant to remove.
2. **The form re-asked the description** — question 2 started blank even
   though the first screen already asked for it.
3. **Summary wording drifted from the form's own wording** — "Here's what
   we understood" read the reviewer cards' labels (e.g. "carries little
   weight") rather than the newcomer-tested question phrasing.
4. **Assumptions were not persisted across a refresh** — `formAssumptions`
   was a bare `useState`, not restored from the draft.
5. **"Change an answer" (and Back) reopened a blank form** rather than the
   form filled in with the submitter's own answers.

All five were found on the running app during the same owner-side
walkthrough and fixed in `4a52661` (R16-W) — W-1 through W-4 and §2. See
`R16-W.md`.

## Surfaced Requirements
None newly numbered in this chunk itself. The UC-6b parity break (above)
is a documented, contract-anticipated risk, not a surprise — but its actual
fix (a new follow-up question, W-9) and the requirement language around it
were only written once this chunk's own parity test exposed the concrete
flip; see `R16-W.md`'s Surfaced Requirements for the RG-9 amendment that
chunk's own walkthrough produced (a different finding, on the verdict side).

## Notes for Downstream Chunks
Chunk E (not yet built) is expected to reuse `plain-copy.ts`'s shared copy
for the questionnaire/contradiction-review/GraphView surfaces per §2.4/§5 —
not evidenced here since chunk E has no commit yet.
