# Build contract: CR6 fixes — code review 006 findings, under full GVM build discipline

**Status:** v2 (2026-10-03) — v1 corrected after an independent plan check (8 problems, all applied; see the changelog at the end). Owner triage recorded in `code-review/code-review-006.html`: fix all 6 Critical; fix 16 Important
(EBT-1 accepted as a labelled exception); fix every Minor item and the stub flag; then a second full review round.

**BC-001.** Every statement about existing code below cites `(verified: path:line)` as read at commit **9348882**
(HEAD before this work; the review artefacts landed after it at 63f5c25 and touch no source). Before changing a cited
place, re-read it; if it no longer says what this contract says, stop that item and report it.
**BC-002 and BC-003 apply to every item that touches a boundary** (`reviews/build-checks.md`): integrity checks over data as
written; one recogniser checks and feeds the consumer; persisted state versioned; boundary tests use data the real producer wrote.

**TDD (GVM TDD-1).** For every item: write the test first, run it, and record that it FAILS on the current code (paste the
failure line); then fix; then show it passes. Each builder commits in its own worktree: one commit with the failing tests
("test: … (red)"), then the fix ("fix: … (green)"). Name every test with its `TC-CR6-…` id below. Never weaken an existing
test to make a fix pass — if an existing test pins the old (wrong) behaviour, change it and say why in the commit message.

**Project rules that bind every change (CLAUDE.md):** the four boundaries (engine pure — no React/idb/SDK/Date.now()/
Math.random()/I/O; llm the only SDK importer; store persistence only; components presentation only); NF-1 determinism; the
audit trail is append-only; no rendered "approved"/"rejected"; plain language on submitter screens; WCAG 2.1 AA on changed
screens; `aigate` identifiers stay. Tests run with `npm test -- <path>` (never bare vitest).

**Specs and test-case files are NOT edited by builders.** Each builder reports, at the end, the spec sentences and test-case
rows its changes need; the main loop applies them to both twins (`.md` + `.html`) and writes `test-cases/test-cases-025.md`.

---

## Wave 1 (three builders in parallel, disjoint files)

### FX-1 — Hand-off integrity (store)
Files owned: `src/store/handoff.ts`, `src/store/audit.ts` (only if needed), `src/components/RegisterView.tsx` (one string),
`src/store/handoff.test.ts`, `src/components/__tests__/RegisterView.handoff.test.tsx`, `src/store/register.test.ts`
(comment only), `src/components/__tests__/VerdictDisplay.memo-download.test.tsx` (comment only).

- **CR6-01 (Critical) — import rejects every real case as "tampered".** `validateBundle` parses with zod and returns the
  parsed bundle (verified: src/store/handoff.ts:694-698); the seal and the chain are then checked on the parsed events
  (verified: src/store/handoff.ts:719, 734) and the parsed events are what get stored (verified: src/store/handoff.ts:838,
  915). zod object parsing rebuilds keys in schema order; `eventContent` hashes `JSON.stringify(payload)` in whatever order
  the object has (verified: src/store/audit.ts:79-81). The hand-off schemas contain no transform, default or coercion
  (verified: `grep -n "\.transform(\|\.default(\|\.coerce\|preprocess" src/store/handoff.ts` → none), so the raw and parsed
  events differ only in key order. **Fix:** validate with the schema exactly as today (shape, bounds, passthrough), then use
  the RAW events from the input — as written — for the seal, `verifyChainOf`, and storage (both the tail import and the
  replace). Keep typed access to the parsed bundle wherever only fields are read. Do not change `eventContent` (changing the
  hash function would break every existing local trail).
  Tests (BC-003 — data the real producer wrote):
  - TC-CR6-01a: the app's own self-assessment case, written by `seedAigateSelfAssessment` with the real policy, exported with
    `exportBundle`, round-tripped through `JSON.parse(JSON.stringify(…))`, imported on a fresh machine → `imported_into_empty`
    (fails today with `tampered`).
  - TC-CR6-01b: a `verdict_corrected` payload in the real writer's key order — `corrections_count` immediately after
    `knowledge_lens_matched_entry_ids`, then `submitter_note`, `assumptions`, `evidence_scope` (verified:
    src/components/IntakeFlow.tsx:1229-1251) → imports.
  - TC-CR6-01c: after TC-CR6-01a's import, `verifyChain()` on the receiving machine reports the chain intact (the stored
    events keep their original bytes).
  - TC-CR6-01d: replace-with-bundle (`replaceWithBundle`) of the same real case succeeds and the local chain verifies.
  - Keep the tamper tests green: an edited payload must still be caught.
- **CR6-30 (Minor) — "an Counterpoise".** "This file is not an Counterpoise hand-off bundle." (verified:
  src/store/handoff.ts:679, 696); "…it is not an Counterpoise hand-off bundle." (verified:
  src/components/RegisterView.tsx:147). → "a Counterpoise". Update the two negative-assertion literals in tests
  (verified: src/store/handoff.test.ts:341; src/components/__tests__/RegisterView.handoff.test.tsx:330). TC-CR6-30.
- **EBT-1 (accepted) / EBT-2 / EBT-3 (Minor) — label the deliberate test seams.** Add a short comment at each spy saying it is
  a deliberate fault-injection seam and why no real input can produce the failure: memo builder (verified:
  src/components/__tests__/VerdictDisplay.memo-download.test.tsx:65), register store (verified:
  src/components/__tests__/RegisterView.handoff.test.tsx:375,452,549,658; src/store/handoff.test.ts:1122,1146,1170,1222),
  console (verified: src/store/register.test.ts:570). No behaviour change; no TC id.

### FX-2 — Intake flow: abandoned work, navigation gates, announcements, crash safety
Files owned: `src/components/IntakeFlow.tsx`, `src/components/intake-state.ts`, `src/components/intake-draft.ts`,
`src/components/StepTracker.tsx`, `src/components/QuestionnaireStep.tsx` (the Undo control only), new
`src/components/ErrorBoundary.tsx`, `src/App.tsx` or `src/main.tsx` (mounting the boundary only), `src/components/plain-copy.ts`
(ADD new exports only — wave 2 edits other parts), and their tests (`IntakeFlow*.test.tsx`, `intake-state.test.ts`,
`intake-draft` tests, `QuestionnaireStep*.test.tsx`, `StepTracker` tests, `IntakeFlow.back.test.tsx`, `IntakeFlow.r16f.test.tsx`).

- **CR6-02 (Critical) — "Start over" leaves earlier work running.** `handleStartOver` resets only `confirmInFlight` and the
  refusal (verified: src/components/IntakeFlow.tsx:104-125); `dupCheckInFlight` (verified: :368), `confirmNewInFlight` (:424),
  `retryExtractionInFlight` (:426), `adoptInFlight` (:501) stay set until their own `finally` runs; the duplicate-check effect
  has no cleanup or cancellation (verified: :370-415), unlike the precedents effect's `cancelled` flag (verified: :877-925).
  The "Start over instead" banner shows on every step after a restore (verified: :90, :110, :1607). **Fix:** an attempt
  token (a `useRef` counter) bumped by `handleStartOver` and by every new-case entry; every async handler and the
  duplicate-check effect captures the token when it starts and drops its result (no dispatch, no setState) if the token has
  changed. `handleStartOver` releases every in-flight guard (`confirmNewInFlight`, `retryExtractionInFlight`,
  `adoptInFlight`, `formSubmitInFlight`) AND resets the duplicate-check trio together — `setDuplicateCheckDone(false)`,
  `setDuplicateMatch(null)`, `dupCheckInFlight.current = false` — exactly as `handleStepBack` already does and for the reason
  its comment gives (verified: src/components/IntakeFlow.tsx:145-160; clearing only one re-arms the early return and
  re-introduces explore-005 D-001). **Do NOT add a `cancelled` cleanup flag to the duplicate-check effect:** unlike the
  precedents effect it relies on the synchronous `dupCheckInFlight` ref to stop StrictMode's second mount firing a second
  model call (verified: :368-376; the app root renders in `<StrictMode>`, verified: src/main.tsx:11); a cleanup flag that
  gates its `finally` would hang the step on "Looking through earlier checks…" on every first entry under StrictMode. The
  attempt token alone discards a stale result safely. Tests: TC-CR6-02a (Continue on the new case works while the abandoned
  extraction is still pending — use a held model-call mock), TC-CR6-02b (an abandoned duplicate check's match never appears
  on the new case), TC-CR6-02c (Try again and Use the earlier result work on the new case after Start over),
  TC-CR6-02d (rendered inside `<StrictMode>`, the duplicate check still completes and shows its result exactly once).
- **CR6-14 (Important) — stale extraction error.** Set at :475, cleared only at :589 and :614, rendered at :1763 (verified).
  **Fix:** clear it in `handleStartOver` and when a new extraction starts. TC-CR6-14.
- **CR6-03 (Critical) — Back from the questions switches off the guessed-value check.** `STEP_BACK` from `questionnaire`
  rebuilds `graph_review` without `guessedFields`, `provenance`, `unconfirmedNodeIds`, `jurisdictionsConfirmed`,
  `ignoredJurisdictions` (verified: src/components/intake-state.ts:438-448); Continue then regenerates questions from
  `state.guessedFields ?? {}` (verified: src/components/IntakeFlow.tsx:721) and the review screen's gate turns off when
  `unconfirmedNodeIds` is undefined (verified: src/components/GraphView.tsx:605). **Fix:** carry `guessedFields` and
  `provenance` from `graph_review` into `questionnaire` (on QUESTIONS_GENERATED) and restore them on Back, together with
  CONCRETE gate values — `unconfirmedNodeIds: []` (every card was checked before Continue was allowed) and
  `jurisdictionsConfirmed: true` — never leaving them `undefined` on this path. Do NOT change what `undefined` means in
  `GraphView` (`gated = unconfirmedNodeIds !== undefined`, verified: src/components/GraphView.tsx:605): "no gate" is the
  intended state for the form path and for correction/evaluation-failure re-entries, pinned by TC-R5-GR-2-03 (verified:
  src/components/__tests__/GraphReview.r5.test.tsx:164-169). The carried `guessedFields` means "still to ask": a guessed field
  answered in the questionnaire drops out of it. `uncertainNodeIds` keeps its recorded meaning and stays frozen at
  QUESTIONS_GENERATED (F-7/DR7-07, verified: specs/intake-flow.md:1019-1027, src/components/intake-state.ts:115-124) — it
  records what the description did not say, which stays true after the person answers; the summary's "couldn't tell" list
  is unchanged. Tests: TC-CR6-03a (Back then Continue: every guessed field not yet answered is asked again), TC-CR6-03b (the
  review screen after Back still shows its quotes and its checked state), TC-CR6-03c (answered guessed fields are not
  re-asked), TC-CR6-03d (the form path's Back still produces no gate — TC-R5-GR-2-03 stays green).
- **CR6-04 (Critical) — Undo crashes on a session saved by an older build.** `ANSWER_UNDONE` reads `undo.questions` and
  `undo.assumptionsLen` (verified: src/components/intake-state.ts:683-694); before 9348882 the snapshot was
  `{ graph, correctionsLen }` (verified: `git show b1e146b:src/components/intake-state.ts` :66); `loadDraft` checks only
  `step` (verified: src/components/intake-draft.ts:39-50); `QuestionnaireStep` indexes `questions[answeredCount]`
  (verified: src/components/QuestionnaireStep.tsx:118); no error boundary exists. **Fix (BC-002):** version the saved draft;
  on restoring an older draft, drop the incompatible `undo` snapshot (Undo is then unavailable for that one answer — say
  nothing false); defensive fallbacks in `ANSWER_UNDONE`; add an error boundary around the intake flow that shows a plain
  message and a "Start a fresh check" button that clears the saved draft. Tests: TC-CR6-04a (a draft in the old shape, Undo
  clicked → no crash), TC-CR6-04b (old draft versions are migrated, current ones untouched), TC-CR6-04c (a render error in
  the intake flow shows the boundary's message and its button clears the draft).
- **C-3 (Minor) — Undo stays live after its one use.** **Fix:** show Undo only while an undo snapshot exists. TC-CR6-C3.
- **CR6-08 (Important) — the result arrives silently for screen-reader users.** `evaluation_pending` and `verdict` share one
  step label (verified: src/components/StepTracker.tsx:26); the announcement effect sets the same text (verified:
  src/components/IntakeFlow.tsx:1575-1587); "Evaluating…" has no live region (verified: :2062); "Looking through earlier
  checks…" and "Nothing similar found" have none (verified: :1699, :1732-1735). **Fix:** distinct announcements for "working
  out your result" and "your result is ready" (the visible tracker can keep one "Result" step); `role="status"` on the
  in-progress lines. Tests: TC-CR6-08a (announcement text changes when the result arrives), TC-CR6-08b (the in-progress lines
  are status regions).
- **CR6-15 (Important) — navigating away mid-confirm.** The confirm runs to completion after the component unmounts; the
  draft is cleared only by an effect on `state.step === 'verdict'` (verified: src/components/IntakeFlow.tsx:862-867), so it
  stays at `confirmation`; on return Confirm is refused with "…probably confirmed in another tab or window" (verified: :75).
  **Fix:** clear the saved draft directly when the result has been recorded (not only via the effect); reword the
  'already-decided' message so it claims no cause it cannot know ("This case already has a result. Open it from the register
  to see it."). Tests: TC-CR6-15a (unmount mid-confirm → on return no stale confirmation screen), TC-CR6-15b (message text).
- **CR6-17 (Important) — an invalid policy makes two buttons fail silently.** `checkPolicyGate` throws when the policy is
  invalid (verified: src/components/IntakeFlow.tsx:673-684); `handleProceedFromGraphReview` (verified: :707) and
  `handleFormSubmitted` (verified: :790, try/finally with no catch) do not catch it. **Fix:** return the invalid-policy case
  as a message like the reference-error case; show it at the button. TC-CR6-17a (form), TC-CR6-17b (review screen).
- **CR6-12 (Minor) — raw engine error text.** `throw new Error(\`Evaluation failed: ${evalResult.error.kind}\`)` (verified:
  :1147) is shown as "Evaluation could not complete: … Review your answers and try again." (verified: :1804) and at
  :1845-1848. **Fix:** a plain message per engine error kind (new export in plain-copy.ts) that does not blame the person's
  answers when the cause is the firm's rules. TC-CR6-12.
- **B-10 (Minor) — a contradiction found at form submission is not shown when questions come first.** `FORM_SUBMITTED`'s
  questionnaire branch ignores `action.contradictions` (verified: src/components/intake-state.ts:524-533). **Fix:** keep the
  F-6 routing order (questions first) but carry the submission-time contradictions into the questionnaire state so they are
  reviewed when the questions end even if no answer re-detects them. TC-CR6-B10.
- **E-2 (Minor) — stale comment.** The comment at src/components/IntakeFlow.tsx:769-771 describes an `await appendAuditEvent`
  this function no longer has (verified). Correct it.
- **D-1 (Minor) — one concept, two spellings.** Reducer `method: 'llm' | 'form'` (verified: src/components/intake-state.ts:15)
  vs graph `intake_method: 'llm' | 'structured_form'` (verified: src/engine/types.ts:135); a test fixture uses the invalid
  `intake_method: 'form'` (verified: src/components/__tests__/IntakeFlow.back.test.tsx:56). **Fix:** correct the fixture; add
  a comment on `method` pointing at `intake_method`. TC-CR6-D1 (the fixture's case now exercises the form branch).
- **CI — TC-R16-F-71 timing.** Its final `toBeEnabled()` runs one render before the effect clears `confirmPending` on slower
  runners (CI run 37121363027). **Fix:** wait for the state (`waitFor`) — the behaviour is correct.

### FX-3 — Engine, extraction and policy references
Files owned: `src/llm/graph-extractor.ts`, `src/engine/plain-intake.ts`, `src/components/StructuredForm.tsx` (the
`isAnswered` check and the `buildGraphFromForm` call only — wave 2 edits its markup), `src/engine/build-graph-from-form.ts`,
`src/seeds/sample-register.ts`, `src/seeds/ib-portfolio.ts`, `src/engine/evaluate.ts`, `src/engine/jurisdiction.ts`,
`src/store/policy-references.ts`, their tests, `src/components/plain-copy.test.ts` (TC-R16-E-11 only), a new
`src/store/assumption-fields.test.ts`, and — for the `buildGraphFromForm` call change only —
`src/components/form-corrections.test.ts`, `src/components/__tests__/VerdictDisplay.inheritance.test.tsx`,
`src/engine/try-these.test.ts`, `src/engine/backtest-parity-nonblind.test.ts`, `src/engine/backtest-parity.test.ts`.

- **CR6-05 (Critical) — "replaces something you already use?" is never asked on the description path.** The tool schema
  requires `replaces_prior_model` (verified: src/llm/graph-extractor.ts:67, 84) but `QUOTE_FIELDS.processing` omits it
  (verified: :255-268), so an unquoted value is never guessed and never becomes a question (verified:
  src/engine/question-generator.ts:126-142), though TRACK-II-REPLACE routes on it (verified: policy/appetite.yaml:279-286).
  **Fix:** add it to `QUOTE_FIELDS.processing` AND to the tool schema's processing-node `basis_quotes.properties` (verified:
  src/llm/graph-extractor.ts:78-84 — the per-field list that tells the model what it may quote; the natural-language prompt
  names no fields, verified: :152-156);
  `QUESTIONNAIRE_COPY.replaces_prior_model` already exists (verified: src/components/plain-copy.ts:649-658). Tests:
  TC-CR6-05a (a realistic model reply with no quote for it → guessed → a question is generated), TC-CR6-05b ("Not sure" →
  true, recorded as an assumption and listed back), TC-CR6-05c (a reply that quotes it verbatim from the description →
  verified, not asked).
- **CR6-25 (Important) — TC-R16-E-11's field list is hand-typed.** (verified: src/components/plain-copy.test.ts:127-159).
  **Fix:** export `QUOTE_FIELDS` and `AGENT_REACH_FIELDS` and derive the list at test time from them plus the condition keys
  of the real `policy/appetite.yaml` and packs (the pattern `src/store/plain-language-coverage.test.ts` already uses). Keep
  the TC-R16-E-11 id.
- **CR6-06 (Critical) — stored answers outside the current options skip the stricter-reading rule.** Stale supplier,
  company-assistant and platform ids map to "weren't sure" wording without an assumption (verified:
  src/engine/plain-intake.ts:142-145, 186-191, 248-252); the default branches of questions 4, 6, 7 and 12 map an
  unrecognised value to a less strict value without an assumption (verified: :293-295, :420-424, :442-445, :514-517);
  `isAnswered` accepts any non-empty value (verified: src/components/StructuredForm.tsx:329-335). **Fix (BC-002 point 4):**
  every unrecognised or stale value takes that question's own "Not sure" path — the strictest value AND its assumption,
  listed back; `isAnswered` counts a single-select answer only when it is one of the question's current options (including
  the policy-driven ones), so a stale stored answer shows as unanswered and must be picked again. Tests: TC-CR6-06a (stale
  supplier id → strict + assumption), TC-CR6-06b (stale platform id → Zone A + assumption), TC-CR6-06c (unrecognised Q6 value
  → strictest + assumption), TC-CR6-06d (a stale stored answer leaves Continue disabled until re-picked).
- **B-8 (Minor) — a node with no quotes at all skips the guessed-field mechanism.** `basis_quotes` is required in the tool
  schema (verified: src/llm/graph-extractor.ts:48, 84, 110) but optional in the zod gate (verified: :180, 216, 229) and
  `undefined` short-circuits to "nothing guessed" (verified: :293-298 — the comment, then the return at :298). **Fix:** treat a missing `basis_quotes` as `{}` —
  every quote field guessed. TC-CR6-B8.
- **B-9 (Minor) — the extraction cannot mark an unclassified decision.** `decision_type_other` (verified:
  src/engine/types.ts:213) is not in the output tool/zod schemas. **Fix:** add `decision_type_other` (bounded string) to the
  output-node tool schema and zod gate so the engine's unclassified-decision safety net can fire on the description path.
  TC-CR6-B9.
- **B-15 (Minor) — clock call inside the engine.** `extracted_at: new Date().toISOString()` (verified:
  src/engine/build-graph-from-form.ts:154). **Fix:** take the timestamp as a parameter; callers pass it. Every
  caller (verified by `grep -rn "buildGraphFromForm(" src`): src/components/StructuredForm.tsx:357,
  src/seeds/sample-register.ts:182, src/seeds/ib-portfolio.ts:300, and the tests src/engine/build-graph-from-form.test.ts,
  src/components/form-corrections.test.ts:39, src/components/__tests__/VerdictDisplay.inheritance.test.tsx:20,
  src/engine/try-these.test.ts:44, src/engine/backtest-parity-nonblind.test.ts:120, src/engine/plain-intake.test.ts:768,
  src/engine/backtest-parity.test.ts:195, 375. FX-3 owns all of these for the call change only. The backtest-parity tests pin
  engine-verified verdicts (backtest/use-cases.md): their expected verdicts must not change — only the call. TC-CR6-B15
  (identical inputs + timestamp → identical graph).
- **Stub flag — `emptyExplanation()`** (verified: src/engine/evaluate.ts:638-648). **Fix:** inline the default explanation
  at its one use (verified: :623) — no behaviour change; NF-1 test (TC-PE-1-01) must stay green.
- **C-5 (Minor) — review sources can carry duplicate rule ids.** De-dup removed (verified: src/engine/jurisdiction.ts:245-248;
  src/engine/evaluate.ts:502-504). **Fix:** de-duplicate `downstream_review_sources` by `rule_id` (keep first, deterministic)
  and correct the comment; warn in `checkPolicyReferences` when two loaded packs share a rule id. TC-CR6-C5a, TC-CR6-C5b.
- **A-5 (Minor) — `platforms[].vendor_id` is never checked.** (verified: src/store/policy-references.ts — no `vendor_id`
  check; consumer src/engine/plain-intake.ts:246). **Fix:** an error when a platform's `vendor_id` is not a vendor id.
  TC-CR6-A5.
- **CR6-27 (Minor) — invariant test.** Every field the question generator can emit is in the hand-off's
  `ASSUMPTION_GRAPH_FIELDS` (verified: src/store/handoff.ts:224-230; generator sources src/engine/question-generator.ts:126-167).
  New test file `src/store/assumption-fields.test.ts`, TC-CR6-27. The main loop exports `ASSUMPTION_GRAPH_FIELDS` from
  `src/store/handoff.ts` and commits it BEFORE wave 1 starts, so FX-3's test has a meaningful red (not an import error) and
  FX-1 starts from the same base.

## Wave 2 (one builder, after wave 1 is merged)

### FX-4 — What renders: accessibility, wording, display fallbacks, styles, docs
Files owned: `src/components/VerdictDisplay.tsx`, `src/components/verdict-view-model.ts`, `src/components/RegisterDetail.tsx`,
`src/components/PolicyEditor.tsx`, `src/components/UnderstoodSummary.tsx`, `src/components/plain-copy.ts`,
`src/components/QuestionnaireStep.tsx`, `src/components/StructuredForm.tsx` (markup), `src/engine/types.ts`
(`ApprovedModel.plain_name` only), `src/store/policy.ts` (that one schema field), `src/App.css`, `docs/rules.md` (regenerate),
`build/prompts/R16*.md` (one banner line each), and their tests.

- **CR6-07 (Important) — required questions not announced as required.** (verified: src/components/StructuredForm.tsx:69-76,
  123, 151, 185-189, 439). **Fix:** `required`/`aria-required` on the free-text controls; radio groups as `role="radiogroup"`
  with `aria-required`; tick-all groups say "(tick at least one)" in their legend; RequiredMark carries visually hidden text
  "(required)"; a visible line by Continue says what is still missing, tied with `aria-describedby`. Update TC-R3-JU-5-01 to
  check the free-text controls too. TC-CR6-07a/b.
- **CR6-09 (Important) — faint text below 4.5:1.** `.verdict__first-also-covers` (verified: src/App.css:3539-3543), the
  access-scope legend (verified: :1448-1455) on `--card-bg`; `.verdict__chain-source` (verified: :3604-3615) on `--paper`;
  `--ink-faint` #857f70 gives 3.85:1 and 3.20:1. **Fix:** use `--ink-soft` (or a darker token) for these three; a test that
  computes the ratio from the CSS tokens. TC-CR6-09.
- **CR6-10 (Important) — correction source never shown.** (verified: src/components/RegisterDetail.tsx:54-55). **Fix:**
  "(from the form / the review screen / an answer to a question)"; nothing when absent (older records). TC-CR6-10.
- **CR6-11 (Important) — "N controls inherited" over an empty list on the register.** (verified:
  src/components/VerdictDisplay.tsx:1048-1049, 2108-2131; RegisterDetail passes no graph, verified:
  src/components/RegisterDetail.tsx:1083-1098). **Fix:** when both are declared and no graph is available, show one combined
  entry built from the verdict's own `inheritance` with a note that this record does not keep the two apart. Test with the
  real PLAT-CLOUD-LLM platform. TC-CR6-11.
- **CR6-13 (Important) — a pack's own review name is never used.** (verified: src/components/verdict-view-model.ts:461-487,
  823; real data policy/packs/ss1-23.yaml:47-51, policy/appetite.yaml:984-995). **Fix:** pass `options.packs` to
  `buildReviewInstances`/`resolveReviewPlain` and use a pack rule's own `plain_name`/`plain_owner` before the generic fallback.
  TC-R16-D1-07f pins the fallback for this exact rule — update it to expect the pack's own words (BC-003: use the real pack
  file). TC-CR6-13.
- **CR6-16 (Important) — the summary omits what an autonomous AI does.** (verified: src/components/plain-copy.ts:1039-1043,
  1064-1075; no tests). **Fix:** clauses for read, inform, draft, recommend; tests for every action type at every autonomy
  level. TC-CR6-16.
- **CR6-18 (Minor) — stray ". " / ", " on the "No" screen.** (verified: src/components/verdict-view-model.ts:652-660, 737-741,
  752-759). **Fix:** when the core text is empty, compose the sentence without it. TC-CR6-18.
- **A-2 (Minor) — `plain_change` placeholders never filled.** (verified: src/components/verdict-view-model.ts:670-674).
  **Fix:** run `fillPlaceholders` on `plain_change` like `plain_reason`. TC-CR6-A2.
- **CR6-19 (Important) — raw model ids on description-path buttons.** (verified: src/components/QuestionnaireStep.tsx:30-34, 56;
  `ApprovedModel` has no plain-name field, verified: src/engine/types.ts:558-582). **Fix:** optional `plain_name` on
  `ApprovedModel` (types + zod); labels and the Recorded line use `plain_name ?? model_id`. Do NOT edit
  `policy/appetite.yaml` (rule and policy text is owner-authored): report that the shipped placeholder `VENDOR-LLM-v1`
  needs an owner-approved plain name. TC-CR6-19.
- **CR6-20 (Important) — the evidence-scope caveat looks like verified evidence.** (verified:
  src/components/VerdictDisplay.tsx:1898-1899; no CSS rule, src/App.css:1762-1770). **Fix:** a distinct, contrast-safe style for
  `--scope`. TC-CR6-20.
- **CR6-21 (Minor) — the questions' tick-all list unstyled.** (verified: src/components/QuestionnaireStep.tsx:354-361).
  **Fix:** rules mirroring `.plain-form__option` and the editor's fieldset reset. TC-CR6-21.
- **CR6-22 (Minor) — "No" screen paragraphs unstyled.** (verified: src/components/VerdictDisplay.tsx:1110-1127, 1258).
  **Fix:** rules consistent with `.verdict__first-why`. TC-CR6-22.
- **CR6-23 (Important) — bare country code on the summary.** (verified: src/components/UnderstoodSummary.tsx:138-140).
  **Fix:** a neutral fallback like `countryPhrase`'s (one shared helper). TC-CR6-23.
- **CR6-29 (Important) — reserved words rendered.** (verified: src/components/RegisterDetail.tsx:765;
  src/components/PolicyEditor.tsx:321; PolicyEditor.test.tsx:224 pins "rejected immediately"). **Fix:** use
  `ACTION_LABEL.approved` ("Cleared") in the banner; reword the policy screen ("is ruled out straight away"); update the test.
  TC-CR6-29.
- **D-2 (Minor) — "vendor" beside "Supplier".** (verified: src/components/VerdictDisplay.tsx:2158-2161) → "supplier and
  platform". TC-CR6-D2.
- **G-7 (Minor) — supplier fallback shows a raw value.** (verified: src/components/plain-copy.ts:742-750). **Fix:** an
  id-shaped value with no matching registry entry (capitals, digits and hyphens/underscores, no spaces) reads "a supplier
  not on your firm's list"; ordinary words are shown as written. TC-CR6-G7.
- **G-8 (Minor) — "(0)" above a non-empty list.** (verified: src/components/VerdictDisplay.tsx:1097, 1151). **Fix:** the count
  heading only when something is outstanding; the in-place/attested lines keep their own wording. TC-CR6-G8.
- **CR6-24 (Important) — `docs/rules.md` stale (1.7 vs 1.8).** **Fix:** `npm run docs:rules`; commit the regenerated file.
- **CR6-26 (Minor) — historical citations.** **Fix:** one line at the top of each `build/prompts/R16*.md`: these code
  citations are pinned at the commits named in the header; the handover says where things live now.

## Main loop after the builders
A-6 test-case rows (TC-R15-C1-01..09, TC-RG-8-49) and the stale "shipped without new automated test cases" sentence
(test-cases-015.md:5, test-cases-016.md); `test-cases/test-cases-025.md` (+ html via `scripts/test-cases-html.py`);
spec twins; `build/handovers/CR6-fixes.md` with the review-loop record; the full ritual ×3; a live walkthrough including a
real hand-off: export from one origin (`http://localhost:5173`) and import into a fresh one (`http://[::1]:5173`);
commit, push, CI green. Then the second full review round.

## Review loop (Hard Gate 3)
After each builder: an independent reviewer pass on that builder's diff (fresh context, the criteria above), fix, repeat
until a pass returns no Critical/Important; at pass 5 with no decrease, stop and ask the owner.

## Changelog
| Date | Change |
|---|---|
| 2026-10-03 | v2 after an independent plan check (fresh context, read every citation): B-15's caller list completed (7 more call sites, incl. the backtest-parity tests) and given to FX-3; CR6-02 now resets the duplicate-check trio like handleStepBack and forbids a cleanup flag that would hang under StrictMode (+ a StrictMode test); CR6-03 supplies concrete gate values on Back instead of changing what `undefined` means in GraphView, and keeps `uncertainNodeIds` frozen (F-7); CR6-05 also adds the field to the tool schema's quotable list (+ a quoted-path test); B-8's citation corrected to :298; CR6-27's export lands before wave 1. |
| 2026-10-03 | v1 written from code review 006's verified findings. |

