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

## Integration (session 2, 2026-10-03)
- Branch `cr6-fixes` from main 4d346b3: FX-1 cherry-picked (red re-committed WITH the GVM trailer), then FX-3, FX-2 —
  15 commits, no conflicts. tsc clean; full suite 1456/1472 — exactly the predicted 16 (B-8 mocks + TC-R16-F-69).
- Running in parallel: a builder fixing those 16 mocks in the main tree (uncommitted), and three independent
  review-loop pass-1 reviewers (one per chunk, read-only, against each worktree branch).
- FX-1 review pass 1: PASS, 0 Critical/Important (red-on-old-code re-proved by the reviewer; a partial fix that checks raw
  but stores parsed also fails 01c/01d). 3 Minor, all fixed in the main tree (uncommitted): spec twins verdict-audit
  .md/.html "an"→"a"; new TC-CR6-30 test for RegisterView's not-JSON message (shown to fail on the old wording); the
  EBT-2 comment ×5 now says no bundle content can CAUSE the put() failure, only a storage fault.
- FX-3 review pass 1: FAIL, 3 Important (main loop verified 2 and 3 in code): (1) TC-R16-F-69 fixture — with the mock
  builder; (2) a stale Q5 multi-select tick counts as answered and silently maps to 'Internal' (less strict, no assumption);
  (3) C-5 de-dup by rule_id alone drops a DIFFERENT review from a second pack → under-reports. Decision: collapse only
  identical (rule_id, review); warn on firm-vs-pack id collisions too. Minors: TC-CR6-05b vacuous (form path, not
  description path); B-9 tool schema lacks maxLength 200; Q9/Q14/Q6a unknown-value defaults without assumption.
  All five dispatched to an FX-3 fix builder in the main tree (uncommitted). Pass 2 after it lands.
- Mock fallout fixed and committed (ccef96c); FX-1 minors committed (9ade19c).
- FX-2 review pass 1: FAIL, 5 Important + 5 Minor. I-1 ErrorBoundary false claim; I-2 fresh-check misses form draft;
  I-3 B-10 carryover only fires on an ALREADY-resolved contradiction (main loop verified: detectContradictions ignores
  answers) → remove it, re-detect on the current graph when questions end; I-4 adoptedFrom survives Start over;
  I-5 attempt token not bumped on Back/new entry → stale dup card + wrong-candidate duplicate_dismissed. Minors: guards
  released by abandoned calls; ignoredJurisdictions/uncertainNodeIds lost on Back; "Nothing similar found" not a live
  region; restored evaluation_pending hangs; no test that App wraps the boundary. All dispatched to an FX-2 fix builder.

## Next steps, in order
1. (done) FX-2 checked — see above.
2. Integration branch: merge FX-1 (re-commit red with trailer), FX-3, FX-2; fix the B-8 mocks + TC-R16-F-69 fixture;
   tsc + full suite.
3. Independent review loop per chunk (Hard Gate 3) until 0 Critical/Important; record `Review passes`.
4. Wave 2: FX-4 (what renders, a11y, CSS, docs) on the integrated base; its review loop.
5. Main loop: spec twins (builders' reported sentences), test-cases-025 (+html), handover CR6-fixes.md, ritual ×3,
   tsc, build, parity, trace, live walkthrough incl. a real hand-off export (localhost:5173) → import ([::1]:5173).
6. Commit, push, CI green. Then the second full review round (owner's choice), then /gvm-test.

## Spec sentences + test-case rows collected so far (apply in step 5, both twins)
- FX-3 pass-1 fixes committed 094f82c. Spec: "Every unrecognised stored answer, including a stale tick in a tick-all
  question (Q5) and the Q6a, Q9 and Q14 values, takes that question's own Not sure path — the strictest value plus a
  listed-back assumption. A multi-select counts as answered only when it is non-empty and every tick is a current
  option; the first tick after a stale load drops the stale keys." / "downstream_review_sources collapse only entries
  identical in both rule_id and review text; a shared id with different text keeps both, sorted by rule_id then review."
  / "A firm downstream-review id equal to a loaded pack rule id raises a load-time warning naming the pack." /
  "decision_type_other is bounded to 200 characters in both the tool schema and the validation gate."
- Rows: TC-CR6-06e, 06f, C5a (both distinct kept), C5c (identical collapse), C5d (firm-vs-pack warning), 05b (replaced:
  description path Not sure → true, listed back, Track II), B9b (tool schema maxLength 200), TC-CR6-30 (RegisterView
  not-JSON message).
- FX-3 review pass 2 running.
- FX-3 review pass 2: FAIL, 1 Important (TC-CR6-05b flaky — read a seeded case) + 1 Minor (duplicate React key on
  review sources) → both fixed by main loop, a7fb862. FX-3 pass 3 running.
- FX-2 pass-1 fixes committed ef703ad (full suite 1492/1492, tsc clean). FX-2 pass 2 running; it is also judging the
  disclosed side effect (Back mid-adopt releases the adopt guard → could a second adoption double-write?).
- FX-2 spec sentences (intake-flow twins): token also bumped by Back and description submit, guards released only by
  their current attempt (Back/Start over release themselves); Start over clears adopted screen + evaluation error; a
  contradiction is shown only if it still holds on the current graph (nothing carried from submission); Back keeps the
  "We ignored X" notice and frozen uncertainNodeIds; dup-check progress + outcome share one persistent role="status";
  an evaluation_pending draft is never restored (notice: interrupted, any finished result is on the register); crash
  screen claims only "anything already saved is on the register", fresh check clears both draft keys; App wraps the
  intake flow in the boundary.
- FX-2 rows: TC-CR6-04d, 04c (strengthened), 04e, 04a (UI), B10 (rewritten a/b), 02e, 02f, 02g, 03e, 08c, 15c.
- FX-3 review pass 3: PASS, 0 Critical/Important → FX-3 CONVERGED (Review passes: 3). Out-of-scope, pre-existing:
  buildGraphFromForm still calls crypto.randomUUID() inside the engine — offered to the owner as a separate task.
- FX-1 CONVERGED at pass 1.
- FX-2 review pass 2: FAIL, 2 Important — (1) introduced by ef703ad: Back during an in-flight adoption releases the guard
  → Back/Next/adopt again = second adoption (double write); (2) pre-existing: a finished adoption stays an open step
  (draft at duplicate_check, Back allowed) → re-adopt after leaving/refresh; false "Earlier result used" after Back.
  Minors: M-4 notice says "interrupted" though the confirm may still finish; boundary says "Something went wrong" twice;
  explained contradictions re-raised on every later answer (main loop verified — pre-existing since R6, fixed now).
  Dispatched to an FX-2 pass-2 fix builder (main tree): decisionPending lock like confirmPending, adoption = final.
- Wave 2 FX-4 builder started in its own worktree from cr6-fixes (disjoint files) in parallel.
- FX-2 pass-2 fixes committed c29bac9 (1498/1498). FX-2 pass 3 running. Spec sentences: decision lock (Back ×2, Start
  over, gate buttons disabled during adopt / "Mine is different" writes; Back never releases those guards); adoption
  final (draft cleared, no Back, "+ New pre-check" resets); M-4 notice wording; crash screen says it once; explained
  contradictions remembered (persisted with draft), a different one still shows. Rows: 02g (rewritten), 02h, 02i,
  02c (adopt, rewritten), 15c (updated), 04d (updated), B10c. Known narrow gap: refresh inside the adoption write.
- OWNER INSTRUCTION (2026-10-03): a separate session ("Move random id generation out of the engine") is WAITING for CR6
  to land on main. When CR6 is pushed to main: remind the owner; if no reply, tell that session to proceed (or, if it
  is gone, start a fresh session with the same task).
- FX-2 review pass 3: PASS, 0 Critical/Important → FX-2 CONVERGED (Review passes: 3). Its 3 Minors fixed by the main
  loop test-first, 6d7146d: TC-CR6-02j (decision lock released only by its own attempt), 02k (resume banner hidden on
  adopted + verdict screens; 02e reroutes via "+ New pre-check"), 02l (failed adopt / dismiss save shown plainly).
  TC-R16-F-71's last step amended (86f3c36): banner gone on the result, "+ New pre-check" usable — amend its row.
- FX-4 built in worktree, cherry-picked as 2abd8f0→(red) / e6e0529 (green). Full suite 1524/1524, tsc clean.
  OWNER ACTION (CR6-19): policy/appetite.yaml approved_models VENDOR-LLM-v1 and qwen3:4b need owner-approved plain_name.
  FX-4 spec sentences: required questions announced (radiogroup + aria-required, required on free text, hidden
  "(required)", tick-all legends "(tick at least one)", "Still to answer" line tied to Continue); combined inheritance
  entry when both declared and no graph, saying the record doesn't keep them apart; pack's own plain_name/plain_owner
  for owed reviews; correction source in plain words (omitted for older records); ApprovedModel.plain_name optional,
  shown as plain_name ?? model_id; unlisted country → "another country"; unmatched id-shaped supplier → "a supplier not
  on your firm's list"; count heading only when something is outstanding.
  FX-4 rows: TC-CR6-07a/b/c, 09, 10, 11, 13 (amends TC-R16-D1-07f), 16, 18, A2, 19/19b, 20, 21, 22, 23, 29, D2, G7,
  G8/G8b; amend TC-R3-JU-5-01 (aria-required on radiogroups + free text).
- FX-4 review pass 1 running. Docs builder (spec twins + test-cases-025) started in parallel.
- FX-4 review pass 1: FAIL, 1 Important (CR6-11 combined entry says "Nothing inherited / not on the registry" when the
  platform IS registered and its controls WERE inherited — mixed registered platform + unlisted supplier) + 5 Minor
  ("Still to answer" punctuation; double "required" announcement; G-7 regex masks Q-Corp/ACME-Vision etc.; CR6-13 shared
  id picks first pack's words; "another country, another country"). Contrast recomputed: ink-soft 9.08/7.53:1; no dark
  theme. docs/rules.md byte-identical on regen. All dispatched to an FX-4 fix builder.
- Docs committed 2be8b34: test-cases-025 (+html), spec twins ×7 pairs, TC-CR6-30 split (RegisterView one → 30b).
  STILL TO DO after the FX-4 fix builder: TC-CR6-23 is used by two tests (UnderstoodSummary.test.tsx and
  plain-copy.cr6-fx4.test.ts) — rename one (careful: the FX-4 builder may add 23b) and split its 025 row, regenerate
  html; add rows/spec sentences for FX-4 pass-1 fixes; parity must then be clean.
