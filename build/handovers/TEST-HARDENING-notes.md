# TEST-HARDENING — findings so far (paused, uncommitted)

Status: **paused 2026-10-03 by the owner's decision** (one GVM pipeline at a
time; CR7 wave 1 rewrites the same intake-flow tests). No test or source file
was changed. Nothing committed. This note is for folding into the CR7 plan.

## How it was reproduced

- Baseline, no load: `npm test` green, 1546/1546, ~30 s (8-core Mac).
- Under load: run `npm test` (JSON reporter) while 16 CPU-burning processes
  (`yes > /dev/null` ×16) run alongside it. It reproduces on the first try:
  - run A: 7 failures / 1546
  - run B: 17 failures / 1546
  (a third run, a 24-process run and a `--sequence.shuffle` run were stopped
  when the pause arrived.)
- Script used (scratchpad, not in the repo): start N stressors, run
  `npm test -- --reporter=json --outputFile=<x>.json`, kill stressors, list
  failed tests with their durations.

## Every test that failed under load (union of runs A and B)

Two different kinds of failure — **most are NOT one-render-early reads**.

### Kind 1 — whole test ran past vitest's 5 s per-test limit (~5000–5500 ms)

These are long, end-to-end UI flows. Each step waits correctly; the test is
simply slow, and under load it runs out of time.

| File | Test |
|---|---|
| IntakeFlow.r16d2 | TC-R16-D2-48, -49, -50, -51 |
| IntakeFlow.r16w | TC-R16-W-58, -62, -63, -65, -66, -67 |
| IntakeFlow.r16f | TC-R16-F-24 |
| IntakeFlow.cr6-fx2 | TC-CR6-08b |
| WalkingSkeleton | "completes full flow end-to-end", P4-C02, P4-C04, P5-C01, TC-LC-2-02 (P6-C02), "titles the use case after the system…", "renders what the user typed… [TC-UC-1-01]" |

Likely cost driver (not yet measured): `user.type(...)` of long strings
character by character into controlled inputs — every keystroke re-renders the
whole `<App />`. WalkingSkeleton types ~200–350 characters (description +
`DETAIL`); the r16d2/r16w helpers type the description, the name and the
form description. Plus `fillMinimalForm` does ~12 clicks, each a full re-render.

Proposed fix (not applied): make these tests cheaper rather than give them more
time — e.g. `user.click(field); await user.paste(text)` for long text where the
test is not about typing itself (one input event instead of hundreds), and
measure per-test durations unloaded before/after. Do not raise the global
`testTimeout`. Raising per-test timeouts is the fallback only if a flow stays
slow after that, and needs an owner call.

### Kind 2 — a single wait gave up (fast failure, 1–3 s)

| File | Test | What happened |
|---|---|---|
| IntakeFlow.cr6-fx2 | TC-CR6-02k (1.6 s) | `findByRole('use the earlier result')` timed out after RTL's 1 s default. DOM at failure: still "Looking through earlier checks…" — the duplicate check over a 38-case register (portfolio auto-seeds on first visit) is real IndexedDB work that took >1 s under load. The wait is on the right thing; its budget is too short. |
| WalkingSkeleton | P5-C02 (3.2 s) | `findByRole('confirm and evaluate')` at line ~807 timed out after 1 s. Same shape as above (DOM not yet inspected in detail). |
| IntakeFlow.cr6-fx2 | TC-CR6-15a (1.5 s) | `expected "generateReasoningTraceForVerdict" to be called at least once` — likely a `waitFor` on the spy hitting the 1 s budget, or a sync expect after an await of something else. **Not yet inspected — the best candidate for a true one-render-early read.** |

Candidate one-render-early read spotted by inspection (has not failed yet):
TC-CR6-02k line 1082 checks the "Picked up where you left off" banner is gone
synchronously right after `findByText('earlier result used from')`; if the
banner is removed one render later this fails. Fix: `await waitFor(() =>
expect(queryByText(...)).not.toBeInTheDocument())` — still fails if the
banner stays.

Precedent in repo for Kind 2: `confirmAndReachVerdict` in
IntakeFlow.r16d2.test.tsx already gives the verdict wait `{ timeout: 5000 }`
on that one call (slow real IndexedDB work), with a comment explaining why.

## Fixes made

None. No files changed apart from this note.

## Next steps for whoever picks this up (after CR7 wave 1 lands)

1. Re-run the load harness against the CR7-rewritten tests — the list above
   may shift.
2. Measure unloaded per-test durations; the slowest flows are the targets.
3. Kind 1: cut typing/click cost; Kind 2: inspect each DOM at failure, fix
   genuine early reads with `findBy`/`waitFor` on the exact condition, give
   slow-IO waits a targeted budget only where the precedent applies.
4. Prove each fix with ≥3 loaded runs, then the normal ritual.
