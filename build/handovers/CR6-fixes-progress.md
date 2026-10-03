# CR6 fixes — progress checkpoint (2026-10-03)

Contract: build/prompts/CR6-fixes.md v2 (base commit fe29bfb). Review: code-review/code-review-006.html (63f5c25).

## Wave 1 (builders in their own worktrees, branched from fe29bfb)
- FX-1 hand-off — DONE, main-loop checked: branch `worktree-agent-aa704d08ca6bc3e0b`, red 4c59713 (commit message lacks
  the GVM trailer — re-commit with the trailer when merging), green 21d160b. Raw events verified/stored; schema stays
  passthrough at every event level, so no extra fields slip in. Full suite on its branch: 1420 pass.
- FX-3 engine/extraction — DONE, main-loop checked: branch `worktree-agent-a16f3eebf7e90d3fe`, red 40ed6aa, greens
  9a44992, d062044, d5a102f, 11ff93f, 3d08938. Known cross-chunk fallout to fix at integration: B-8 makes 15 tests fail
  whose model-reply mocks omit basis_quotes (WalkingSkeleton, GraphReview.r5/r6/r9, IntakeFlow.r16e) — give the mocks
  realistic verbatim quotes (BC-003); TC-R16-F-69's fixture uses plainAnswers['4']='llm' (never a real option) — use 'language'.
- FX-2 intake flow — DONE (its session ended before it reported; main loop verified its worktree instead):
  branch `worktree-agent-a992dceedaa4e65d3`, red b11ef12, greens ac27d49, 51bfb9a, c9600ad, 203ed7d; no uncommitted work.
  On its branch: tsc clean, full suite 1446/1446, all 22 planned TC-CR6 ids present (02d and C3 already passed before the
  fix — stated in the red commit as regression guards). Still to check at integration: TC-R16-F-71 CI fix and the D-1
  fixture (IntakeFlow.r16f / IntakeFlow.back tests changed). MAIN-LOOP FINDING for its review loop: ErrorBoundary's text
  ("This did not touch your firm's record … only this one, unfinished check could not be shown") is an unconditional
  claim (RF-5) — false if a render crash happens after a confirm has written the result; reword to claim only what is
  known (e.g. anything already saved stays in the register; this unfinished page is cleared). Also: its "Start a fresh
  check" clears the intake draft but not the guided-form draft (handleStartOver clears both).

## Main tree (uncommitted until this checkpoint)
- A-6 done: TC-R15-C1-01..10 rows (test-cases-015) and TC-RG-8-49 (test-cases-016), html regenerated, trace clean.
- `.claude/skills/gvm-graph/SKILL.md` header repair from /doctor — left uncommitted for the owner (doctor rule).

## Next steps, in order
1. (done) FX-2 checked — see above.
2. Integration branch: merge FX-1 (re-commit red with trailer), FX-3, FX-2; fix the B-8 mocks + TC-R16-F-69 fixture;
   tsc + full suite.
3. Independent review loop per chunk (Hard Gate 3) until 0 Critical/Important; record `Review passes`.
4. Wave 2: FX-4 (what renders, a11y, CSS, docs) on the integrated base; its review loop.
5. Main loop: spec twins (builders' reported sentences), test-cases-025 (+html), handover CR6-fixes.md, ritual ×3,
   tsc, build, parity, trace, live walkthrough incl. a real hand-off export (localhost:5173) → import ([::1]:5173).
6. Commit, push, CI green. Then the second full review round (owner's choice), then /gvm-test.
