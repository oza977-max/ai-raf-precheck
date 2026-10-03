# Build contract: CR8 fixes — code review 008 findings, under full GVM build discipline

**Status:** v2 (2026-10-04) — v1 checked independently (17 problems); the **v2 amendments** section at the end OVERRIDES the item text above wherever they differ. Read it first. Owner triage (`code-review/code-review-008.html`):
fix all 4 Important code findings and all 15 Minor; CR8-05 — publish the drafted user docs with two outcome
corrections; dismiss the 7 stub flags (allowlist); accept the 37 test spies as labelled exceptions and label them.

**Base:** origin/main 900593d. Citations below are from the review's panels and checkers at ea01a1a, marked
`(cited: …)` — re-read before changing (BC-001); the plan check verifies them.

**Build checks:** BC-002, BC-003, **BC-004 incl. its new converse** (for every field a fix carries forward, test
the actions that must remove or reset it), **BC-005 incl. "every surface of one fact"** (headline, next steps,
stage note, banner, confirm notice checked together). TDD-1 red→green per item, `TC-CR8-…` ids (one id per test;
suffix -1, -2), `npm test` only, never weaken a test, run the whole suite and the backtests before green. Builders
don't edit specs/ or test-cases/ — they report the sentences and rows; the main loop writes them
(`test-cases/test-cases-030.md`).

**Property statements (state these in code comments next to the fix and test them directly):**
- P1 (correction planner): for every (node, field), the latest `graph_corrected` value on the trail since the last
  result equals the evaluated graph's value, after ANY sequence of edits, retries and reversals.
- P2 (assumptions): an assumption is listed back only while the graph still holds the value it assumed.
- P3 (Back guard): once a case has a confirmed attestation, no navigation can start a new case id for it.
- P4 (sign-off): no surface says the person can start when a required sign-off is not on record.
- P5 (chain wording): no surface claims the audit check detects more than linkage and hashes of the events present.

---

## Wave 1 (three builders in parallel, disjoint files)

### FX8-1 — Intake (intake-state.ts, intake-draft.ts, IntakeFlow.tsx, ConfirmationStep.tsx + their tests,
incl. src/components/__tests__/IntakeFlow*.test.tsx)

- **CR8-01 (Important, P2) — card edit keeps a stale assumption.** CORRECTION_APPLIED (cited: intake-state.ts
  ~870-935) and JURISDICTIONS_SET (~945-955) never touch `assumptions`. **Fix:** in CORRECTION_APPLIED drop every
  assumption whose `fields` include the corrected field; in JURISDICTIONS_SET drop those whose `fields` include
  `jurisdictions`. (`Assumption.fields` has no node id — match on field.) Keep undo coherent (the undo snapshot is
  questionnaire-only; say so). **Tests (one per re-entry path, BC-004 converse):** TC-CR8-01a Change an answer →
  edit the assumed field's card → Confirm: no assumption in graph_confirmed or on the result; -01b same after a
  failed evaluation; -01c same via correction from the result (verdict_corrected); -01d countries edit removes the
  CR7-23 jurisdictions assumption; -01e an edit to a DIFFERENT field keeps the assumption.
- **CR8-03 (Important, P3) — the Back guard is lost through the confirmation.** PROCEED_TO_CONFIRMATION
  (cited: ~1176-1197) drops it; CHANGE_ANSWER (~1199-1245) doesn't restore it; STEP_BACK (~681). **Fix:** carry
  `afterFailedEvaluation` on `confirmation` and `evaluation_pending`; CHANGE_ANSWER restores it. Then audit P3
  across the whole step × action table: any other way a case with a confirmed attestation can reach
  duplicate_check or mint a new id (Start over is a deliberate exit — keep it, but say so). **Tests:** TC-CR8-03a
  reducer: EVALUATION_FAILED → QUESTIONS_GENERATED(no questions) → PROCEED_TO_CONFIRMATION → CHANGE_ANSWER →
  STEP_BACK is refused; -03b UI: same sequence, Back not offered, same useCaseId on Confirm.
- **CR8-06 (Minor, P1) — planner skips the second of B→C, C→B in one batch.** (cited: ~598-607). **Fix:** walk the
  pending corrections in order against a running latest map (seeded from the trail; update it as each is kept);
  the synthesis step treats keys handled by the walk as covered. **Tests:** TC-CR8-06a unit [B→C, C→B] over a trail
  holding A→B → both written, net B; -06b a plain form-path retry re-minting [A→B] over latest B is still skipped;
  -06c a property-style test: random sequences of edits/retries/reversals on one field → the net trail value
  always equals the graph (P1).
- **CR8-08 (Minor) — correcting from the result hides the countries panel.** CORRECT_VERDICT (~1321-1336) lacks
  `jurisdictionsConfirmed: true`. **Fix:** set it; **Tests:** TC-CR8-08a reducer, -08b the panel renders and a
  country can be edited.
- **CR8-14 (Minor) — the plain policy sentence wrapped in "Check the details below and try again".**
  (cited: IntakeFlow.tsx ~2295-2298). **Fix:** match the form-path wrapper ("Evaluation could not complete: …"),
  no blaming suffix. **Test:** TC-CR8-14.
- **CR8-04 (part) — confirm notice wording (P5).** (cited: ConfirmationStep.tsx ~88-91). **Fix:** "A later edit to
  an earlier entry would show as a break in the record; removing the newest entries would not, and the record is
  kept in this browser with no outside check." **Test:** TC-CR8-04a (no "a later change … would show").
- **CR8-20 / EBT labels.** Label every spy on the app's own modules in the intake test files you own with a
  one-line `// EBT exception (owner-accepted, code review 006/008): <why — fault injection / hold in flight>`.

### FX8-2 — Store, timing, seeds (audit.ts, db.ts, policy.ts, seeds/*, store/types.ts, handoff.ts comment,
reset.ts, SettingsPanel.tsx + their tests, incl. src/store/*.test.ts, src/seeds/*.test.ts,
PolicyEditor/SettingsPanel tests)

- **CR8-07 (Minor) — the tip hint trusts an equal count.** (cited: audit.ts ~62-72). **Fix:** keep the tip event's
  id in the hint; when counts match also require `db.get('audit_events', tip.eventId)` to exist with the same
  hash, else rescan (O(1)). Update the residual comment (~44-49) to what is still undetected. **Test:** TC-CR8-07
  two module instances: A appends 3; DBs reset; B appends 3; A appends → chain verifies.
- **CR8-04 (part) — audit.ts comment (~410-413)** claims "a deleted event" is detected — reword: edits and
  non-tail deletions break the chain; removing the newest events is not detectable without an outside anchor.
  **Test:** TC-CR8-04b a unit test that documents the limit (delete the last event → verifyChain ok), so the
  wording can't drift back.
- **CR8-09 (Minor) — overlapping policy saves both queue.** (cited: policy.ts onPolicyUpdated). **Fix:** run each
  case's check-and-append under `withCaseLock(id, …)`, re-checking inside. **Test:** TC-CR8-09 two module
  instances, `Promise.all` of two onPolicyUpdated → each case queued once.
- **CR8-10 (Minor) — a reload mid-seed can duplicate seed events.** (cited: seeds/*.ts; node written last).
  **Fix:** inside the case lock, treat a case as seeded if its node exists OR it already has audit events (or
  write the node first if the register tolerates a node with no verdict — choose and state). **Test:** TC-CR8-10
  events written, node not, re-seed → no second set.
- **CR8-16 (Minor) — Clear-all wording.** (cited: SettingsPanel.tsx ~119, ~169-173). **Fix:** the confirmation names
  the role; the incomplete message names the welcome flag; both lists equal what reset.ts clears. **Also O-11:**
  say a blocked delete may still complete when the other tabs close. **Test:** TC-CR8-16 (BC-005).
- **CR8-19 (Minor) — stale corrections_count comments.** (cited: store/types.ts ~152; handoff.ts ~319). **Fix:**
  reword to "the graph_corrected events on the trail since the last result for this attempt".
- **Stub allowlist.** Add the two new `blocking()` close-swallow handlers and `selfAssessmentSeeded` to
  `.stub-allowlist` in the tooling's format (`path::symbol | constant | justification`); verify it loads with
  `~/.claude/skills/gvm-code-review/scripts/_allowlist.py` `load_allowlist(path, project_root=…)`.
- **EBT labels** in the store/seed/PolicyEditor/SettingsPanel test files you own, as in FX8-1.

### FX8-3 — What renders (verdict-view-model.ts, VerdictDisplay.tsx, RegisterDetail.tsx, plain-copy.ts,
App.tsx, App.css + their tests)

- **CR8-02 (Important, P4) — next steps say "You can start" under a "no sign-off on record" headline.**
  (cited: verdict-view-model.ts ~939, ~1057, ~700-704). **Fix:** pass `signOffMissing` into buildNextSteps — a
  non-permissive step ("Ask your AI risk team to confirm the sign-off before you start") and a finish line that
  never says "you can start". Then check P4 on EVERY surface for the same state (headline, next steps,
  who-signs-off, stage note, register list chip, memo if it states it) and for O-1 (no stage) and O-2 (no valid
  policy): when sign-off can't be determined, say nothing permissive. **Tests:** TC-CR8-02a `/you can start/i`
  absent from every next step when signOffMissing; -02b no-policy case past pre_checked never says "you can
  start"/"nobody"; -02c no-stage case makes no sign-off claim (fix the view model or the spec sentence — choose
  the cautious one: no claim).
- **CR8-04 (part, P5) — register integrity wording.** (cited: RegisterDetail.tsx ~1403-1416). **Fix:** "an edited
  event, or a deleted event with later events after it, breaks the chain; removing the newest events can't be
  detected from inside this browser"; banner "No break found in the N events present." **Test:** TC-CR8-04c.
- **CR8-11 (Minor) — garbled model review sentence.** (cited: VerdictDisplay.tsx ~144-158). **Fix:** substitute the
  bare plain name (a base-label helper in plain-copy; the button label adds the suffix on top), and word the
  sentence by registry status ("… is listed but not yet accepted by your firm" vs "… is not on your firm's
  model list"). **Test:** TC-CR8-11 whole-sentence assertion with shipped qwen3:4b.
- **CR8-12 (Minor) — header tagline contrast regressed.** (cited: App.css header badge on --header-bg).
  **Fix:** a light colour for `.app-header__badge`; add --header-bg pairs to the contrast token test. **Test:**
  TC-CR8-12.
- **CR8-13 (Minor) — the app-wide policy banner shows raw field paths.** (cited: App.tsx ~341-348). **Fix:** the
  plain POLICY_PROBLEM_MESSAGE for non-2LoD views; paths only for 2LoD / the Appetite framework screen.
  **Test:** TC-CR8-13.
- **CR8-17 (Minor) — the overdue line counts every loaded pack.** (cited: verdict-view-model.ts ~735-739).
  **Fix:** count only stale sources whose pack is in `verdict.pack_versions`; same filter for the reviewer
  banner. **Test:** TC-CR8-17 (a stale pack the verdict didn't use → no line).
- **O-4 (take if cheap):** "No model was named" only when the model question was asked (q3ShowsModelQuestion on
  the form path) — or neutral wording.

## Main loop
- **CR8-05:** merge the docs draft branch `worktree-agent-ae14bdaa6d84702cb` (103ea3b); correct case 10 to Track II
  and case 7 to two reviews (Information security review, Vendor risk assessment) — re-verify both through the
  engine; update both user-guide twins if they repeat them. Also `docs/tester-guide.md` old-form wording.
- **CR8-15:** register-lifecycle.html gains the §4.1 field, the §8 LC-4 amendment and the §12 failure row the .md
  has; fix its changelog row.
- **CR8-18:** "machine-verified" → "marked verified in your firm's policy file" in README.md, docs/tester-guide.md,
  specs/verdict-audit (.md + .html) status definition.
- Spec twins for every behaviour change; `test-cases-030`; merges; ritual ×3; live walkthrough (card edit after
  Change an answer; the failed-evaluation → confirmation → Change an answer → Back path; a no-sign-off-on-record
  case's whole screen; the register integrity banner; Clear all data wording; header contrast); push; CI.

## Review loop (Hard Gate 3)
Per builder: fresh reviewer passes until 0 Critical/Important; the reviewer is told the P1–P5 property for its
items and asked to break it. Stop at pass 5 without a decrease and ask the owner.

## v2 amendments (override the items above)

**Ids.** Letter-suffixed ids (TC-CR8-01a …); each id names exactly ONE test (add -1, -2 if a letter covers
several). Corrected citations: JURISDICTIONS_SET is intake-state.ts ~915-923; audit.ts claim comments are at
~72-75 and ~426-430.

**Running the suite.** Each builder runs its own files red→green and the whole suite before green; tests that
fail ONLY because another wave-1 builder changes shared rendered text (listed below) are expected until merge —
report them, don't edit outside your files. The main loop runs the full ritual after merging.

**CR8-01 (FX8-1) — narrow, don't drop.** `Assumption.fields` is multi-valued (plain-intake.ts:179, 228, 280 —
`['data_zone','vendor']`; :470 — `['action_type','autonomy_level','decision_bindingness','hitl']`). In
CORRECTION_APPLIED and JURISDICTIONS_SET remove only the edited field from each matching assumption's `fields`;
drop the assumption only when `fields` becomes empty. An assumption with absent/empty `fields` (old draft) is
dropped (comment). Accepted, stated: description-path assumptions carry no node id, so an edit of a field on one
node narrows assumptions about that field on any node (over-removal is the honest direction only when the field
is single-node — say so in a comment). Do NOT add nodeId to Assumption (the hand-off schema would strip it,
BC-002). Extra tests: TC-CR8-01f Q6 assumption + a single autonomy edit keeps the other three fields listed;
-01g Q3 assumption + a vendor edit keeps data_zone. Also note: ANSWER_SUBMITTED removes only exact `field:X` ids
— leave it, comment it.

**CR8-02 (FX8-3) — cautious option, chosen.** When sign-off status can't be determined (no stage, or no valid
policy) or is required-but-missing, NO surface says the person can start or that nobody signs off: headline,
next steps (signOffMissing branch; the needsSignOff+outstanding branch must not apply), whoSignsOff ("nobody"),
VerdictDisplay `stageNote()`/`STAGE_NOTE.approved` ("self-service final" only for a determined self-service
case). These pinned tests change deliberately (record each in the commit and report them): TC-R16-D1-01e,
-01f, -01g, -01h, -01i (verdict-view-model.test.ts ~121-165) and TC-CR7-09b (~864-866) — re-fixture the
self-service ones with a policy whose tier_workflow is self-service and an explicit stage, and assert the
cautious wording where stage/policy is absent. The intake result has stage undefined until the save lands, so
a genuine self-service case reads cautiously for that moment — accepted. Tests: TC-CR8-02a (whole nextSteps
array, no /you can start/i when signOffMissing), -02b (no policy, past pre_checked), -02c (no stage), -02d
(determined self-service case still says it can start).

**CR8-03 (FX8-1).** The source at PROCEED_TO_CONFIRMATION is `state.backAfterFailedEvaluation ??
state.afterFailedEvaluation` (the questionnaire has no afterFailedEvaluation). Make it a REQUIRED boolean on the
confirmation variant (BC-004 advice); evaluation_pending doesn't need it (EVALUATION_FAILED sets it). Test
graphs must be non-form (`intake_method !== 'structured_form'`, else returnsToForm routes elsewhere); -03a starts
with CONFIRMED → evaluation_pending → EVALUATION_FAILED. Add -03c converse: a first-time confirmation (no failure)
→ CHANGE_ANSWER → Back IS allowed. Legacy drafts saved before the fix lack the flag — accepted, comment it.

**CR8-04 — every surface (P5).** FX8-1: ConfirmationStep notice. FX8-2: audit.ts comments (~72-75, ~426-430),
store/types.ts ~51-55, plus TC-CR8-04b (delete the newest event → verifyChain ok, so the limit is pinned).
FX8-3: RegisterDetail ~1403-1416, VerdictDisplay ~2393-2394, AboutPanel.tsx ~181 (FX8-3 now owns AboutPanel),
and a sweep test TC-CR8-04d rendering the register detail, result reviewer section and About page asserting no
"deleted event … detectable"/"unbroken"-style claim. Main loop: docs/tester-guide.md:191 and specs/intake-flow
(.md ~380, .html ~534). The existing TC-CR7-O8 regex still passes the new notice.

**CR8-06 (FX8-1).** Running map seeded from `written`; per pending correction in order: skip if norm-equal to
the map entry, else keep and set. Synthesis iterates the ORIGINAL trail keys and skips keys handled by the walk
(`covered`). `sinceLastResult = written.length + toWrite.length`; -06a also asserts sinceLastResult === 3.
fast-check is available (package.json; see src/engine/properties.test.ts): -06c uses a fixed `seed` and
`numRuns`, modelling the form's diff-against-original.

**CR8-09 (FX8-2).** jsdom has no navigator.locks; two module instances don't serialise. Test with
`Promise.all` of two onPolicyUpdated calls in ONE module instance (red before: both pass hasPendingPolicyUpdate
before either appends; green after withCaseLock). Note: a Save now waits behind a Confirm holding the same case
lock — acceptable.

**CR8-10 (FX8-2) — chosen rule.** Inside the case lock: node exists → skip; no audit events → seed fully;
a `verdict_produced` exists but no node → write ONLY the missing node from that event's verdict (id, tier, track,
stage via routeToWorkflow; ib-portfolio cases with scripted 2LoD events after it get the stage those events
imply — state it), appending no events; events but no verdict_produced → skip and console.error (orphan, can't
be completed safely). Writing the node first is NOT allowed (current_verdict_id would point at nothing).

**CR8-11 (FX8-3).** Classify by the engine's `resolveApprovedModel(policy.approved_models, id)` (family
fallback included), on the same policy the verdict was evaluated with where available: undefined → "… is not on
your firm's model list"; listed with is_approved false → "… is listed but not yet accepted by your firm".
Rewrite the whole review sentence (pure function of review, verdict, policy) at all four reviewWords sites
(VerdictDisplay ~614, 2058, 2064, 2077); no banned words; bare plain name (base-label helper; the button label
adds the suffix on top).

**CR8-13 (FX8-3).** Keep the banner heading ("Policy file invalid" / "evaluation is disabled") for every role —
two IntakeFlow tests assert it. Only the `<li>` list changes: raw paths for 2LoD, POLICY_PROBLEM_MESSAGE for
others. Re-scope TC-R16-A1-62 (App.r16a1.test.tsx:56-62) to role 2LoD and add TC-CR8-13 for 1LoD (message present,
path absent); record the row change.

**CR8-14 (FX8-1).** Drop ONLY the suffix " Check the details below and try again."; keep the prefix (5 existing
assertions and TC-R16-E-66d still pass).

**CR8-16 (FX8-2).** The confirmation and the incomplete message each name everything cleared — role, hand-off
marker, welcome flag (reset.ts) and intake drafts (cleared by the panel) — and what is kept; and that a blocked
delete may still complete when the other tabs close.

**CR8-17 (FX8-3).** `const used = verdict.pack_versions ?? {}`; filter stale sources to used packs at DISPLAY
(both the Could-still-change line and the reviewer banner VerdictDisplay ~1459, ~1518-1531); keep
`stale_sources` as recorded. Legacy verdict without pack_versions → no overdue line. Test it.

**CR8-18 (main loop).** Replace only POSITIVE uses (README.md:301, docs/tester-guide.md:199, verdict-audit §5.5
status definition ~399, both twins); leave denials ("NOT machine-verified").

**Stub allowlist (FX8-2).** Symbols: `openAuditDb`, `openRegisterDb` (db.ts ~134, ~175), `selfAssessmentSeeded`
(aigate-self-assessment.ts ~95).

**EBT labels.** FX8-1 also owns ModelLinkFailure.cr7.test.tsx; the cr6-fx2 header must cover the
trace/register/audit spies too.

**Ownership summary.** FX8-1: intake-state.ts, IntakeFlow.tsx, ConfirmationStep.tsx, intake tests,
ModelLinkFailure.cr7.test.tsx. FX8-2: audit.ts, db.ts, policy.ts, seeds/*, store/types.ts, handoff.ts (comment),
reset.ts, SettingsPanel.tsx, .stub-allowlist, store/seed/PolicyEditor/SettingsPanel tests. FX8-3:
verdict-view-model.ts, VerdictDisplay.tsx, RegisterDetail.tsx, AboutPanel.tsx, plain-copy.ts, App.tsx, App.css,
their tests incl. App.r16a1.test.tsx and verdict-view-model.test.ts. Expected cross-builder reds until merge:
IntakeFlow tests that read VerdictDisplay text (CR8-02/11) and the policy banner list (CR8-13).

**Observations disposition (owner triage covered C/I/M only).** Taken: O-1, O-2 (CR8-02), O-4 (FX8-3, cheap),
O-11 (CR8-16), O-5 (FX8-2? no — PolicyEditor is outside the lists: main loop, call onSaved in the save-failed
branch since the YAML is stored). Not taken this round, recorded: O-3 (placeholder source text vs "signed off" —
needs a product decision on what "signed off" means), O-6 (outside range, pre-existing redaction gap in Similar
cases — logged for the next review), O-7 (fresh form-path retry — narrow, planner writes nothing false), O-8
(test stub shape — harmless), O-9 (pack control check over all packs — product decision), O-10 (partial write
failure — narrow), O-12 (millisecond window — accepted).

**CR8-05 merge note.** The docs branch 103ea3b is not a descendant of HEAD (merge-base fd278f0) — expect doc
conflicts; re-verify cases 7 and 10 through the engine after the merge.

## Changelog
| Date | Change |
|---|---|
| 2026-10-04 | v2 after an independent plan check (17 problems): CR8-01 narrows instead of dropping; CR8-02 cautious option with the six pinned tests named; CR8-09 single-instance test; CR8-10 four-case rule; CR8-11 engine resolver; CR8-13/14 keep tested text; CR8-04 every surface; CR8-17 legacy; ownership, ids, observations disposition. |
| 2026-10-04 | v1 from code review 008 and the owner's triage. |
