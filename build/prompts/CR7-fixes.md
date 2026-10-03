# Build contract: CR7 fixes — code review 007 findings, under full GVM build discipline

**Status:** v2.1 (2026-10-03) — v1 corrected after an independent plan check (24 problems, all applied; see the changelog).
Owner triage recorded in `code-review/code-review-007.html`: fix all 12 Important and all 28 Minor. CR7-23 (owner, two
decisions): keep the listed country when "Somewhere else, or not sure" is also ticked, and list the unknown country back as
an assumption — the result is NOT marked provisional on that account. The 5 stub flags are allowlisted (`.stub-allowlist`,
done); EBT-2 and EBT-3 accepted as labelled exceptions; EBT-4 dismissed. **CR7-35 is done** by the parallel UNSIGNED-MODEL
work (2c93511) — verify only.

**Base.** Every builder branches from origin/main once it contains **2c93511** (UNSIGNED-MODEL, which changes
`policy-references.ts`, `plain-copy.ts`, `verdict-view-model.ts`, `GraphView.tsx`, `QuestionnaireStep.tsx`). Line numbers
below are verified at bdb5d50 (`(verified: …)`); in the files 2c93511 touched they shift (verdict-view-model ≈ +14) —
re-find them by the quoted code. BC-001: re-read a cited place before changing it; if it no longer says what this contract
says, stop that item and report.

**Build checks that bind every item** (`reviews/build-checks.md`): BC-002, BC-003 (boundary tests use data the real
producer wrote), **BC-004** (every return path keeps the safety and honesty fields — one test per path an item names),
**BC-005** (say no more than the code can prove — a test renders the FALSE case and asserts the claim is absent).

**TDD (GVM TDD-1).** For every item: write the test first, run it, record that it FAILS on the current code (paste the
failure line); then fix; then show it passes. Each builder works in its own worktree and commits "test(FX7-n): … (red)"
then "fix(FX7-n): … (green)". Name every test with its `TC-CR7-…` id. Never weaken an existing test to make a fix pass —
if one pins the old (wrong) behaviour, change it and say why in the commit message. Checkers left probe tests in
`/private/tmp/claude-501/-Users-kshitijoza-RAF--claude-worktrees-jolly-mendel-40f775/009733fd-f205-40af-abf6-dd2fc88cc718/scratchpad/copy-v1`
(`src/components/__tests__/probe-v1*.test.tsx`), `copy-v2` (`src/store/probe-v2.test.ts`), `copy-v3` — adapt them as red tests.

**Project rules (CLAUDE.md):** the four boundaries (engine pure; llm only SDK importer; store persistence-only and never
imports components; components presentation-only); NF-1; the audit trail is append-only (a path that can write twice is a
data-integrity bug — synchronous `useRef` guard); no rendered "approved"/"rejected"; plain language on submitter screens;
WCAG 2.1 AA on changed screens; `aigate` identifiers stay. Tests: `npm test -- <path>` only. Run the whole suite before
committing green; backtest predictions (`src/engine/backtest-*.test.ts`) must not change.

**Specs and test-case files are NOT edited by builders.** Each builder ends its report with the spec sentences and
test-case rows its changes need; the main loop applies them to both twins and writes **`test-cases/test-cases-029.md`**
(027 and 028 are taken).

**Not in scope** (code review 007 observations, deliberately not fixed this round): O-1 (unused exports), O-2 (vocabulary
in two places), O-3, O-4, O-5 (draft/hand-off edge shapes), O-10 (questionnaire lock on a refusal no input reaches),
O-11 (countries checkboxes after Back — becomes moot under CR7-03's restore). O-6, O-7, O-8, O-9 ARE taken (FX7-5, FX7-1,
FX7-4).

---

## Wave 1 (three builders in parallel, disjoint files)

Dependency: FX7-3 exports `q3ShowsModelQuestion` (CR7-04) — FX7-1 keeps a local copy of the predicate with a test that pins
it equal to FX7-3's export once both are merged (the main loop replaces the copy with the import at merge).

### FX7-1 — Intake state and flow
Files owned: `src/components/intake-state.ts`, `src/components/intake-draft.ts`, `src/components/IntakeFlow.tsx`,
`src/components/StructuredForm.tsx`, `src/components/ConfirmationStep.tsx`, and their tests
(`src/components/intake-state.test.ts`, `intake-draft.test.ts`, `src/components/__tests__/IntakeFlow*.test.tsx`,
`StructuredForm*.test.tsx`, `ConfirmationStep*.test.tsx`).

- **CR7-01 (Important) — restored "Reading your description…" never finishes.** `extractGraph` is called only at
  (verified: IntakeFlow.tsx:642, :799); the restored screen (verified: :2045-2073) has no control and no Back (verified:
  `canStepBack` :218-232); restore at (verified: :88-112). **Fix:** an effect with `[]` deps that runs ONLY when the state
  was restored from a draft (`restoredDraft` / the restore flag) and the restored step is `graph_extraction` with method
  `'llm'`; guarded by `retryExtractionInFlight`; calls `handleRetryExtraction()`. It must not fire on the normal path
  (`handleConfirmNewUseCase` dispatches NO_DUPLICATE_FOUND then calls `extractGraph` itself). If the key/local model has
  since been removed, `extractGraph` returns an error and the Try again panel shows. **Tests:** TC-CR7-01a restored draft →
  extractor called exactly once (also under StrictMode); TC-CR7-01b restored + extraction fails → Try again panel;
  TC-CR7-01c a fresh, non-restored description path calls the extractor exactly once.

- **CR7-02 (Important) — re-entries into the review screen drop the "Not sure" assumptions.** The re-entries into
  `graph_review` are GRAPH_EXTRACTED, STEP_BACK from the questionnaire (verified: intake-state.ts:514-540), CHANGE_ANSWER
  (verified: :928-963), EVALUATION_FAILED (verified: :986-1030) and CORRECT_VERDICT (verified: :1032-1043; dispatched at
  IntakeFlow.tsx:1606 without assumptions although `lastConfirmed.assumptions` is in scope). `graph_confirmed` writes
  assumptions only when non-empty (verified: IntakeFlow.tsx:1350). The countries panel renders only when
  `jurisdictionsConfirmed !== undefined` (verified: :2215); CHANGE_ANSWER leaves it undefined. `provenance` /
  `guessedFields` / `ignoredJurisdictions` are not carried on `confirmation` by design — do not add them. **Fix:**
  1. Add `assumptions` and `uncertainNodeIds` to the `graph_review` variant; carry them through CHANGE_ANSWER and
     EVALUATION_FAILED (from `confirmation` / `evaluation_pending`) and CORRECT_VERDICT (from `lastConfirmed`; add
     `uncertainNodeIds` to `lastConfirmed` at IntakeFlow.tsx:1399); QUESTIONS_GENERATED keeps them.
  2. STEP_BACK from the questionnaire carries NO assumptions — they are re-asked (CR7-03). Say so in a comment.
  3. ANSWER_SUBMITTED replaces any existing assumption with the same questionId, and removes it when the person now gives
     a definite answer (otherwise a re-answer after Change an answer duplicates it or leaves a stale "assumed" line — BC-005).
  4. The undo snapshot stores the assumptions ARRAY instead of `assumptionsLen` (ANSWER_UNDONE slices by length today,
     verified :826-828, which breaks once (3) replaces in place).
  5. CHANGE_ANSWER sets `jurisdictionsConfirmed: true` as EVALUATION_FAILED does.
  6. Add `reentry: true` to `graph_review` on CHANGE_ANSWER / EVALUATION_FAILED / CORRECT_VERDICT; FX7-4 makes GraphView
     show no "no basis" badge when it is set (today every value reads "no basis" on re-entry — verified: GraphView.tsx
     :388-410 — a BC-005 false claim).
  **Tests (BC-004, one per path):** TC-CR7-02a Change an answer → Continue → Confirm keeps the "Not sure" assumption on the
  result and in `graph_confirmed`; TC-CR7-02b same after EVALUATION_FAILED; TC-CR7-02c countries panel present after
  Change an answer; TC-CR7-02d correct-from-verdict keeps it in `verdict_corrected`; TC-CR7-02e re-answer after Change an
  answer — "Not sure" again → exactly one assumption; a definite answer → none; TC-CR7-02f Undo after a replaced
  assumption restores the previous array.

- **CR7-03 (Important) — Back from the questions loses answers; a rejected supplier/model guess survives.** STEP_BACK
  (verified: intake-state.ts:514-540) restores the trimmed `guessedFields`; ANSWER_SUBMITTED trims the answered field even
  for "Not on this list" (verified: :778-788; IntakeFlow.tsx:1647-1700); graph and corrections keep the answered values.
  **Fix:** on QUESTIONS_GENERATED snapshot `backGraph` (the graph), `backCorrections` and `askedGuessedFields` (the untrimmed
  guessed list). Thread the three through every step that can lead back to the review screen via STEP_BACK — QUESTIONS_
  GENERATED, ANSWER_SUBMITTED, ANSWER_UNDONE (untouched by undo), CONTRADICTIONS_DETECTED (verified :857-863) and
  CONTRADICTION_RESOLVED (verified :894-898). STEP_BACK from the questionnaire restores graph, corrections and guessed list
  from the snapshot, so every guessed question is asked again from the pre-questionnaire values. Drafts saved before this
  change have no snapshot: fall back to today's behaviour (CR7-28 covers the old-draft hole). **Tests:** TC-CR7-03a "Not
  sure" → Back → Continue asks the field again and the result lists the assumption; TC-CR7-03b vendor guess → "Not on this
  list" → Back → Continue asks the supplier again and no AI guess reaches the result; TC-CR7-03c same for
  `declared_model_id`; TC-CR7-03d decision type "Something else" → Back → asked again; TC-CR7-03e Back → Continue →
  Confirm writes no duplicate `graph_corrected` events (read the real trail).

- **CR7-04 (Important, form half) — changing Q3 keeps a hidden model name.** The Q3 change clears sub-answers but not `3model`
  (verified: StructuredForm.tsx:263-277); visibility is `showQ3Model = q3 === 'outside-assistant' || showQ3Supplier`
  (verified: :326) — it depends on Q3 only. **Fix:** when Q3 moves from an option that shows the model question to one
  that does not, delete `3model`. Use the predicate (local copy now, FX7-3's export at merge — see Dependency). **Test:**
  TC-CR7-04a type a model under "outside assistant", switch Q3 to "Something a team in your firm built", finish → no model
  governance review and no `declared_model_id` (end-to-end; passes fully once FX7-3 is merged — mark which assertion
  depends on FX7-3).

- **CR7-10 (Important, intake half) — "Use the earlier result" shows another person's case name to a non-2LoD view.**
  (verified: IntakeFlow.tsx:747, :1942). The duplicate check deliberately matches across all submitters (verified: :448) —
  that stays; the redaction is in what is rendered. **Fix:** for a non-2LoD view render "an earlier result on your firm's
  register". The audit-line half is FX7-4. **Tests:** TC-CR7-10a 1LoD adopts → the matched label is absent from the DOM;
  TC-CR7-10b 2LoD still sees it.

- **CR7-13 (Minor) — form answers cleared before the policy check accepts them.** `clearFormDraft()` at (verified:
  StructuredForm.tsx:421); the gate returns early at (verified: IntakeFlow.tsx:1010-1014). **Fix:** remove the clear from the
  form; clear immediately after `dispatch(FORM_SUBMITTED)` in `handleFormSubmitted`. The other clearers (ErrorBoundary.tsx:43,
  `handleStartOver` :169) stay. **Test:** TC-CR7-13 invalid policy → Continue → remount → answers still there.
- **CR7-16 (Minor) — an abandoned confirm or adopt can wipe a newer case's draft.** Unconditional `clearDraft()` at (verified:
  IntakeFlow.tsx:1573 confirm, :745 adopt). **Fix:** add `clearDraftIfCase(useCaseId)` to `intake-draft.ts` — clears when the
  stored draft is absent or carries this `useCaseId`; leaves a draft with a different or no `useCaseId`. Use it at both sites.
  **Tests:** TC-CR7-16a confirm path; TC-CR7-16b adopt path.
- **CR7-17 (Minor) — a failing self-assessment seed leaves the duplicate check waiting forever.** (verified:
  IntakeFlow.tsx:446-455). **Fix:** try/catch around the seed wait; always load the register and set `registerLoaded`.
  **Test:** TC-CR7-17.
- **CR7-21 (Minor) — a retry after a failed evaluation writes the same correction events twice.** Corrections are written
  before evaluation (verified: IntakeFlow.tsx:1281-1293). Do NOT move them after evaluate(): CONFIRMED drops `corrections`
  (verified: intake-state.ts:965-981) and EVALUATION_FAILED returns `corrections: []` (verified: :1021), so a failed
  evaluation would lose them for good. The duplicate arises on the form path, where `formCorrections` mints new ids on each
  retry (verified: form-corrections.ts:53). **Fix:** inside the case lock, read `getAuditEvents(useCaseId)` and skip a
  correction when a `graph_corrected` event since the last `verdict_produced`/`verdict_corrected` has the same `node_id`,
  `field`, `original_value`, `corrected_value` and `correction_source`. **Tests:** TC-CR7-21a form-path correction → failed
  evaluation → retry → one set of events; TC-CR7-21b description-path correction → failed evaluation → retry → the correction
  is on the trail exactly once.
- **CR7-22 (Minor) — "corrections are preserved in the audit trail" when a fresh confirm writes only a count.** (verified:
  ConfirmationStep.tsx:116-121; IntakeFlow.tsx:1294-1353). **Fix:** write one `graph_corrected` per correction on a fresh
  confirm (with CR7-21's skip), so the trail backs the sentence. **Test:** TC-CR7-22 (BC-005, read the real trail).
- **CR7-24 (Minor) — Start over and Back keep the previous screen's error line.** (verified: `handleStartOver` :156,
  `handleStepBack` :235-270). **Fix:** `setReviewGateError(null)` in both. **Test:** TC-CR7-24.
- **CR7-28 (Minor) — a questions draft saved before CR6 restores without the guessed list.** (verified: intake-draft.ts:83-100;
  `DRAFT_VERSION = 2` :34; a pre-CR6 draft is a bare state treated as version 1). **Fix:** a version-1 draft at
  `questionnaire` or `contradiction_review` on the description path (no `plainAnswers`, method not the form) restores as
  `graph_review` with `unconfirmedNodeIds` = every node id, `jurisdictionsConfirmed: false`, no `guessedFields`/`provenance`,
  carrying `useCaseId`, `corrections`, `originalVerdictId`, `description`; and shows the interrupted notice. **Test:**
  TC-CR7-28.
- **CR7-30 (Minor, writer half) — "→ undefined" in the audit trail.** Writers at (verified: IntakeFlow.tsx:865, :1747; the
  third, :2243, writes arrays and is fine). **Fix:** `?? null` on `original_value`/`corrected_value` at the two writers. The
  render half is FX7-4. **Test:** TC-CR7-30a the payload holds `null`.
- **CR7-34 (Minor) — attempt-token comment says "ONLY Start over".** (verified: :116-122; `handleStepBack` bumps it at :262).
  **Fix:** reword to "Start over and Back". Check whether a new description also bumps it before writing that.
- **CR7-37 (Minor) — raw policy error text shown to a submitter.** (verified: IntakeFlow.tsx:891, :1266-1272). **Fix:** one
  plain sentence — the firm's rules file has a problem; nothing about your answers is at fault; your AI risk team can fix it
  in the Appetite framework screen — kept in IntakeFlow for now (FX7-4 moves it to plain-copy); the detail goes to
  `console.error`. **Test:** TC-CR7-37 no field path in the rendered alert.
- **O-8 (no severity)** ConfirmationStep "can't be edited" → match the audit trail's own caveat wording.

### FX7-2 — Store, timing and the policy screen's save
Files owned: `src/store/audit.ts`, `src/store/db.ts`, `src/store/reset.ts`, `src/store/handoff.ts` (one new export only),
`src/seeds/*.ts`, `src/llm/reasoning-trace.ts`, `src/components/PolicyEditor.tsx`, `src/components/SettingsPanel.tsx`, and
their tests.

- **CR7-05 (Important) — the audit trail forks across two tabs.** (verified: audit.ts:62 `cachedLastHash`, :125-134
  `lastChainHash`, :186-193 `appendUnqueued`; db.ts:47-62 `createWriteQueue`). Reading the tip per append is O(n): `getAll`
  + `chainOrder` (and `clockFloor` :40-46 another `getAll`); the only index is `by_use_case` (db.ts:109-114). **Fix:** keep a
  cached `{hash, ms, count}` hint; inside the locked append compare `db.count('audit_events')` with the cached count; if it
  differs, rescan with the existing `chainOrder` and refresh both caches. Keep the existing in-tab invalidations (audit.ts
  :229, :317, :396). Document the residual in a comment: a cross-tab replace that leaves an identical event count is not
  seen. No schema bump. **Test:** TC-CR7-05 two module instances over one fake-indexeddb (`vi.resetModules()`), appends A,
  B, A with the first instance's cache stale → `verifyChain().ok === true` (adapt V2's probe — it fails today with
  "prev_hash does not match the preceding event"). jsdom has no `navigator.locks`: the test exercises the hint check.
- **CR7-06 (Important) — double-clicking Save duplicates permanent audit events.** (verified: PolicyEditor.tsx:93-117,
  :193-195; policy.ts:545-563). **Fix:** synchronous `useRef` in-flight guard + `saving` state that disables Save; try/catch
  around `onPolicyUpdated` that shows a plain error. A failure part-way leaves some events written; a retry then duplicates
  those — make `onPolicyUpdated` skip a case that already has a `re_evaluation_queued` event for this policy version.
  **Tests:** TC-CR7-06a two rapid clicks → one set of `re_evaluation_queued` events (read the real trail); TC-CR7-06b a
  failing `onPolicyUpdated` shows a message; TC-CR7-06c retry after a part-way failure → each case queued once.
- **CR7-15 (Minor) — "Clear all data" leaves the drafts and the hand-off marker.** (verified: reset.ts:30-36; handoff.ts:632,
  :961; the draft keys live in components/intake-draft.ts and the store must not import components — store/types.ts:6).
  **Fix:** `reset.ts` clears the marker via a new `clearHandoffSyncMarker()` exported from `handoff.ts`; `SettingsPanel.tsx`
  (a component) imports `clearDraft`/`clearFormDraft` from `intake-draft` and calls them before reloading (import only — no
  edit of FX7-1's file); also clear the legacy form key `aigate:intake-form-draft`. Decide and state whether
  `aigate:policy-yaml` and `aigate:welcome-dismissed` survive "Clear all data" and make the confirmation wording say exactly
  what is cleared (BC-005). **Test:** TC-CR7-15.
- **CR7-18 (Minor) — seeds check-then-act across tabs.** (verified: seeds/aigate-self-assessment.ts:111-140; ib-portfolio.ts
  :281-298; sample-register.ts:170-180). **Fix:** each case's seed runs under `withCaseLock(id, …)` and re-checks inside the
  lock. **Test:** TC-CR7-18 two concurrent seeds from two module instances → one set of events.
- **CR7-19 (Minor) — the reasoning-trace call has no timeout and holds the case lock.** (verified: reasoning-trace.ts:88;
  IntakeFlow.tsx:1423). `@anthropic-ai/sdk` 0.39.0: `create(body, options?: RequestOptions)` with `timeout` and `maxRetries`
  (verified: node_modules core.d.ts:200-202). **Fix:** `{ timeout: 15000, maxRetries: 0 }` as the second argument. **Test:**
  TC-CR7-19 asserts the second argument (the existing mock, reasoning-trace.test.ts:64).
- **CR7-20 (Minor) — "Clear all data" reports "blocked" because of the tab's own open database.** `reset.ts` resolves on the
  first event: `request.onblocked = () => resolve('blocked')` (verified: reset.ts:17-19); `onblocked` fires whenever any
  connection is open, even one that then closes. **Fix:** in `db.ts`, `blocking() { db.close(); dbPromise = undefined; }`
  (and the register promise) so the next call reopens; in `reset.ts`, on `onblocked` wait for `onsuccess` up to ~3 s before
  reporting "blocked". **Tests:** TC-CR7-20a reset with this tab's own open handle reports success; TC-CR7-20b a write after
  another instance's reset reopens rather than throwing.
- **CR7-38 (Minor) — "not yet signed off" hard-coded for every pack.** (verified: PolicyEditor.tsx:262-270). The engine test is
  per RULE: `isUnsigned(rule, pack)` (verified: engine/jurisdiction.ts:47), a rule's own sign-off overriding the pack's.
  **Fix:** count `rules.filter((r) => isUnsigned(r, p))` and word it "none / N of M / all rules signed off". **Tests:**
  TC-CR7-38a/b/c for none, some, all (BC-005).

### FX7-3 — Engine mapping, policy references, extractor
Files owned: `src/engine/plain-intake.ts`, `src/store/policy-references.ts` (build on 2c93511's `modelPlainNameWarnings`),
`src/llm/graph-extractor.ts`, `src/components/plain-copy.ts` (ONLY the two CR7-23 table entries), and their tests.

- **CR7-04 (Important, engine half).** `plainAnswersToFormValues` reads `3model` unconditionally (verified: plain-intake.ts
  :280). **Fix:** export `q3ShowsModelQuestion(answers)` (Q3 is `outside-assistant` or a supplier option — the same rule as
  StructuredForm.tsx:326) and read `3model` only when it is true. **Test:** TC-CR7-04b.
- **CR7-23 (Minor; owner decisions) — keep the listed country and list the unknown one back.** Today
  `q11.includes('elsewhere-not-sure') ? [] : …` (verified: plain-intake.ts:547-549); `no_regulatory_basis` is raised only when
  NO pack activates (verified: engine/provisional.ts:41-42), so a mixed answer is not provisional — the owner accepted that.
  **Fix:** keep the listed countries; "Somewhere else, or not sure" alone still gives `[]` (unchanged). When both are ticked,
  call `assume('11', 'elsewhere-not-sure', ['jurisdictions'])` and add its `ASSUMPTION_TEXT` and `ASSUMPTION_SHORT_LABEL`
  entries in plain-copy.ts (verified: plain-copy.ts:968-980) — wording along the lines of "You also said somewhere else, or
  not sure — no other country's rules were checked." Check the hand-off `assumptionSchema` accepts the new key. The only
  test that changes is the one pinning "even alongside other ticks" (verified: plain-intake.test.ts:599); say so in the
  commit. `backtest-parity.test.ts:402` and `worked-case-answers.json` use "elsewhere" alone and are unaffected. **Tests:**
  TC-CR7-23a UK + elsewhere → UK pack applies, the assumption is listed, the result does NOT claim provisional on that
  account; TC-CR7-23b elsewhere alone → unchanged. Run the backtests.
- **CR7-26 (Minor) — the checker claims placeholders work in fields that are never filled.** Message at (verified:
  policy-references.ts:47-56); use sites :203-217, :253-256, :290-301. **Fix:** restrict the "recognised" claim to the fields
  that are filled (`plain_reason`, `plain_change`). **Test:** TC-CR7-26.
- **CR7-27 (Minor) — three id references unchecked.** (verified: policy-references.ts:223-262). **Fix:** error-level checks for
  `controls[].resolves` → invariant OR hard-line ids (types.ts:681), platform/vendor `satisfies_controls` and
  `coupled_clusters` → control ids, pack `required_control.control_id` → policy controls (only when packs are loaded, like
  `covers_reviews`). Error level is chosen knowing the effect: `checkPolicyReferences` is a hard gate (IntakeFlow.tsx
  :889-896, :1263-1272; PolicyEditor), so a firm's saved policy with a dangling reference will stop evaluating until fixed —
  the message must name the bad reference. Shipped policy and packs are clean (checked). Run the whole suite and fix any
  fixtures that use partial policies; never weaken the checks. **Tests:** TC-CR7-27a/b/c one per reference; TC-CR7-27d
  shipped policy + packs → no errors.
- **CR7-31 (Minor) — filler in "other decision" makes the result Provisional.** (verified: graph-extractor.ts:115-122 schema,
  :253 zod). **Fix:** give `decision_type_other` a schema description ("only when no listed decision type fits; otherwise
  omit") and drop it in `parseExtraction` when `decision_type` is set. The engine side (provisional.ts:63-69) is deliberately
  untouched. **Test:** TC-CR7-31.

## Wave 2 (after wave 1 is merged)

### FX7-4 — What renders
Files owned: `src/components/verdict-view-model.ts`, `VerdictDisplay.tsx`, `RegisterView.tsx`, `RegisterDetail.tsx`,
`GraphView.tsx`, `field-copy.ts`, `AboutPanel.tsx`, `ContradictionReview.tsx`, `plain-copy.ts`, `src/App.css`, and their
tests. Line numbers in verdict-view-model / GraphView / plain-copy shifted with 2c93511 — re-find by quoted code.

- **CR7-07 (Important) — register rows need a mouse.** (verified: RegisterView.tsx:750-757). **Fix:** the case name as a
  `<button type="button">` that opens the case; keep the row click. **Test:** TC-CR7-07 Tab to the button, Enter opens it.
- **CR7-08 (Important) — `--ink-faint` fails contrast.** (verified: App.css:11). **Fix:** darken the token once (about
  `#686253`; verify ≥ 4.5:1 on `--card-bg`, `--paper`, `--cream`, `--warn-bg`); fix `--warn-text` on `--warn-bg` (4.48:1)
  and the form-control border (1.44:1, needs 3:1). **Test:** TC-CR7-08 parse `:root` in App.css and compute the ratios.
- **CR7-09 (Important) — a signed-off case says "no sign-off needed — self-service".** Two derivations from the stage:
  `verdict-view-model.ts` (verified: :825, :531-538, :946-948) and `VerdictDisplay.tsx` (verified: :1300
  `const needsSignOff = registerStage === 'pre_checked'`, used at :437, :456, :589, :1601, passed at :1660); STAGE_NOTE
  (verified: :133-137). **Fix:** "sign-off was needed" = `policy.tier_workflow[verdict.tier] !== 'self-service'` via the
  engine's `routeToWorkflow` (engine/workflow-router.ts:34). "Signed off" wording needs a `twoloD_reviewed` event with
  `action === 'approved'` and `verdict_id === verdict.id` (a `correction_requested` must not count) — pass what the view
  model needs through `VerdictViewOptions`. The view model returns ONE `needsSignOff`; VerdictDisplay stops re-deriving it.
  Add "Signed off by your AI risk team" wording for the headline, who-signs-off line and stage note. **Tests (BC-005):**
  TC-CR7-09a signed-off Track II → no "nobody"/"no sign-off needed"/"self-service"; TC-CR7-09b genuine self-service
  unchanged; TC-CR7-09c correction-requested → not "signed off"; TC-CR7-09d signed off then corrected → the new verdict is
  not "signed off".
- **CR7-10 (Important, audit-line half).** (verified: RegisterDetail.tsx:99-103). **Fix:** for a non-2LoD view omit the matched
  label in the `classification_adopted` and `duplicate_dismissed` lines. **Test:** TC-CR7-10c.
- **CR7-11 (Important) — UC-11's "No model was named" line missing.** (verified: requirements/requirements.md:163-165;
  build/prompts/R16.md:183, :252). **Fix:** in the reviewer section, when no processing node has `declared_model_id`, render
  "No model was named — your AI risk team may ask which one it uses." **Tests:** TC-CR7-11a shown when absent; TC-CR7-11b
  absent when named.
- **CR7-14 (Minor) — the raw id VENDOR-APPROVED-LLM renders on the result.** (verified: VerdictDisplay.tsx:2166). **Fix:** use
  the existing helpers (`supplierDisplayName`, and 2c93511's `approvedModelLabelFor`) — no new resolver; update TC-CR6-11's
  assertion. **Test:** TC-CR7-14 the firm-account path renders with one `/approved|rejected/i` match only (the status heading).
- **CR7-25 (Minor) — "replaces something you use?" has no row on the review card.** `replaces_prior_model` is absent from
  `PROCESSING_FIELDS` (verified: GraphView.tsx:107-120). **Fix:** add it with `boolean: true` (like `hitl`) and a
  `FIELD_CONSEQUENCES` entry in field-copy.ts (wording exists at plain-copy.ts:649). Check the "Fix N details" count tests.
  Plus CR7-02 (6): no "no basis" badge when `graph_review.reentry` is set. **Tests:** TC-CR7-25; TC-CR7-02g (re-entered review
  shows no "no basis" badge).
- **CR7-29 (Minor) — firm/pack review sharing an id shows the firm's name.** (verified: verdict-view-model.ts:487-491). **Fix:**
  in the firm branch require the review text to match too, else fall through to the pack loop. **Test:** TC-CR7-29.
- **CR7-30 (Minor, render half).** (verified: RegisterDetail.tsx:63 `String(...)`). **Fix:** render `null`/absent as "not
  stated" (legacy events keep `undefined`). **Test:** TC-CR7-30b.
- **CR7-35 — verify only.** Confirm 2c93511 covers: a model without `plain_name` warns; the review card uses the plain name;
  a neutral "Model n" fallback. Report any gap.
- **CR7-36 (Minor) — About says 18 rules; there are 23.** (verified: AboutPanel.tsx:60-61; the sentence is about what ships
  "out of the box"). **Fix:** compute from the SHIPPED `policy/appetite.yaml` (`?raw` import + `loadPolicy`): `invariants.length`
  appetite rules, `hard_lines.length` hard lines — not the firm's edited policy. **Test:** TC-CR7-36 both counts.
- **CR7-37 (placement).** Move FX7-1's plain policy-error sentence into plain-copy.ts beside `engineErrorMessage`.
- **CR7-39 (Minor) — the review-overdue warning hides in a collapsed section.** (verified: VerdictDisplay.tsx:1479;
  `buildCouldStillChange` verdict-view-model.ts:623-645). **Fix:** a "Could still change" line when `stale_sources` is
  non-empty. **Test:** TC-CR7-39.
- **CR7-40 (Minor) — "machine-verified" for evidence typed into the policy file.** (verified: VerdictDisplay.tsx:959 vs
  :606-607). **Fix:** "marked verified in your firm's policy file". **Test:** TC-CR7-40 (BC-005).
- **O-9 (no severity)** ContradictionReview "Nothing is wrong with the use case" → "This isn't a result yet".

### FX7-6 — Test hardening under load (after FX7-1 is merged; parallel with FX7-4)
Files owned: the intake test files only (`src/components/__tests__/IntakeFlow*.test.tsx`, `WalkingSkeleton*.test.tsx`), no
production code. Source: the paused hardening session's notes, copied to `build/handovers/TEST-HARDENING-notes.md`.
Evidence: with 16 CPU-burner processes beside `npm test`, 7 then 17 of 1546 tests failed; CI hit two one-render-early reads
(fixed in 345d96d). 19 failures are 5 s per-test timeouts in long flows that type long strings character by character
(r16d2, r16w, r16f, cr6-fx2, WalkingSkeleton); three are 1 s `findBy`/`waitFor` timeouts — TC-CR6-02k, P5-C02, TC-CR6-15a
(15a not yet inspected; the best candidate for a real early read). **Method:** wait for the specific state, never raise a
global timeout; `user.paste` or a shorter typed text where the typing itself is not under test; a per-test timeout only
with a written reason. **Acceptance:** reproduce first (the burner recipe in the notes), then 3 consecutive full runs under
the same load with 0 failures, plus the normal ritual. **Tests:** no new TC ids — each changed test keeps its id; the
commit lists each test and the cause found (slow vs early read).

### FX7-5 — Docs and spec text (main loop, after FX7-4)
- **CR7-12 (Important) — docs describe the old form.** docs/try-these.md (:13, :37, :54-55, :135), docs/user-guide.md (:37),
  docs/user-guide.html (~:342). **Fix:** rewrite the run steps ("Next →", the form's own question wording) and each worked
  case's answers in the form's words (`backtest/worked-case-answers.json` may help); both user-guide twins.
- **CR7-32, CR7-33 (Minor).** verdict-audit §5.5 (specs/verdict-audit.md:406 + html), the owner bullet (:400), test-cases-020
  rows TC-R16-D1-07f (:93) and TC-R16-D1-05d (:70). **Fix:** match the code, both twins.
- **O-6, O-7.** Correct the four overstated test-case rows (TC-CR6-08c, -11, -29, -02e/02i); add the two missing sentences
  to intake-flow.html ADR-IF-R16-1.
- Every spec sentence and test-case row the builders report; `test-cases/test-cases-029.md` (+ html via
  `scripts/test-cases-html.py`).

## Main loop after the builders
Merge each builder's worktree (replace FX7-1's local `q3ShowsModelQuestion` with FX7-3's import); spec twins;
`test-cases-029`; `build/handovers/CR7-fixes.md` with the review-loop record; the ritual ×3; a live walkthrough on a fresh
origin: reload during extraction; Change an answer with a "Not sure"; Back after "Not on this list"; Q3 switch with a typed
model; UK + "Somewhere else"; two tabs writing the trail; policy Save double-click; register by keyboard; a signed-off case
reopened; a 1LoD adopt; Clear all data mid-intake. Commit, push, CI green. Then a review of this fix round and `/gvm-test`.

## Review loop (Hard Gate 3)
After each builder: an independent reviewer pass on that builder's diff (fresh context; BC-004/005 explicitly), fix, repeat
until a pass returns no Critical/Important; at pass 5 with no decrease, stop and ask the owner.

## Changelog
| Date | Change |
|---|---|
| 2026-10-03 | v2.1: FX7-6 test hardening added (owner instruction relayed by the CR6 session: one GVM pipeline; the paused "Harden load-sensitive intake tests" work joins this round). CR7-35's load-time warning stays with the CR6 session's UNSIGNED-MODEL work. |
| 2026-10-03 | v2 after an independent plan check (24 problems, all applied): base moved to 2c93511 and CR7-35 marked done; test-case file 029; CR7-23 rewritten to the owner's second decision (list back, not provisional — the provisional mechanism cannot express a mixed answer); CR7-21 skips duplicates instead of moving writes after evaluate() (which would lose corrections); CR7-02 covers CORRECT_VERDICT, de-duplicates re-answered assumptions, fixes undo, adds the re-entry flag; CR7-03 snapshots graph/corrections/guessed list and threads them through every step; CR7-20 waits for success and resets the cached handle; CR7-05 uses a count hint, no schema bump; CR7-15 clears drafts from SettingsPanel (store must not import components); CR7-01 mount-only; CR7-09 one derivation from the tier workflow; CR7-36 counts the shipped policy; CR7-04 one shared predicate; CR7-25/38/14/27/28/16/30/13/34/19 corrected; citations verified; "Not in scope" list added. |
| 2026-10-03 | v1 written from code review 007's verified findings and the owner's triage. |
