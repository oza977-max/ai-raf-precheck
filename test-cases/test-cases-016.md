# Counterpoise — Test Cases, Round 16

*Written 2026-09-28 — a traceability backfill, not a new build. RG-8
(hand-off bundle) and RG-9 (control-evidence attestation) shipped several
rounds ago (commits `b484d83`, `6023103`, hardened by code-review-005) but
had no test-case entries, so `scripts/trace-check.py` could not see them.
This round adds cases for both, mapped to the automated tests that already
prove them — no new test was written; existing test titles were prefixed
with their new TC id. `requirements/requirements.md`'s 2026-09-28 amendment
explains the RG-6/RG-7 -> RG-8/RG-9 relabelling this file follows (the
labels collided with the existing, unrelated, unbuilt RG-6/RG-7).*

Test files: `src/store/handoff.test.ts`,
`src/components/__tests__/RegisterView.handoff.test.tsx`,
`src/store/audit.test.ts`, `src/store/register.test.ts`,
`src/components/__tests__/RegisterDetail.eventDetail.test.tsx` (RG-8);
`src/components/__tests__/RegisterDetail.controlEvidence.test.tsx`,
`src/components/__tests__/VerdictDisplay.cr005.test.tsx` (RG-9).

## RG-8 — Hand-off bundle (export/import between two machines)

`requirements/requirements.md`, RG-8: "The register and its audit trail
shall be transferable between two installations as a single file. Import
shall re-verify every audit entry and the file's seal, shall merge only when
one history continues the other, shall otherwise offer a user-confirmed
replace that requires a saved backup first, and shall never overwrite
silently. The product shall state that these checks detect damage and
simple edits but cannot prove who made the file."

### Export

| ID | Asserts |
|---|---|
| TC-RG-8-01 | Given a register with a local case, when the reviewer clicks "Export hand-off bundle", then a success message names the event/entry counts and a sealed bundle downloads — `RegisterView.handoff.test.tsx` |
| TC-RG-8-02 | Given the same setup, when the browser's download mechanism throws, then an `alert`-role "Export failed" message is shown, not swallowed — `RegisterView.handoff.test.tsx` |

### Import — tamper and forgery detection

| ID | Asserts |
|---|---|
| TC-RG-8-03 | A bundle whose register was altered after export (seal mismatch) is refused as `tampered`, with no writes — `handoff.test.ts` |
| TC-RG-8-04 | A bundle whose audit payload was edited without recomputing the downstream hash chain is refused as `tampered` ("chain is broken") — `handoff.test.ts` |
| TC-RG-8-05 | The documented limit, pinned on purpose: a bundle edited AND fully re-hashed downstream (payload + every later hash + the seal, using only the module's own public functions) is ACCEPTED — the product only claims to catch an edit that skipped recomputing the chain, never to prove authorship — `handoff.test.ts` |

### Import — bad-file fixtures (`invalid_format`)

| ID | Asserts |
|---|---|
| TC-RG-8-06 | A malformed (non-ISO) `occurred_at` on any event is refused — `handoff.test.ts` |
| TC-RG-8-07 | A register node whose `metadata.node_type` disagrees with its own `node_type` is refused — `handoff.test.ts` |
| TC-RG-8-08 | An unknown `event_type` is refused — `handoff.test.ts` |
| TC-RG-8-09 | A payload missing a field required for its type is refused — `handoff.test.ts` |
| TC-RG-8-10 | Two different events sharing the same `event_id` inside one bundle are refused, with a message naming the duplicate — `handoff.test.ts` |
| TC-RG-8-11 | An unsupported `format_version` gets its own distinct "different version of Counterpoise" message, not the generic "not a bundle" one — `handoff.test.ts` |

### Import — sync outcomes

| ID | Asserts |
|---|---|
| TC-RG-8-12 | Merge of a continuation: B adopts A's bundle, appends a sign-off, and A imports B's bundle back — outcome `merged`, exactly the one new event added, chain verifies — `handoff.test.ts` |
| TC-RG-8-13 | Up to date: re-importing a bundle identical to the current state reports `up_to_date` with zero events added — `handoff.test.ts` |
| TC-RG-8-14 | Local-ahead: importing a bundle the local copy already extends does nothing (`local_ahead`), local state untouched — `handoff.test.ts` |
| TC-RG-8-15 | Import into an empty store: an empty machine adopts a bundle wholesale (`imported_into_empty`), the transplanted chain verifies against the live store — `handoff.test.ts` |
| TC-RG-8-16 | "Different histories" message — the first time this browser has ever received a case: the calm "this is normal" wording, never "warning" — `handoff.test.ts` |
| TC-RG-8-17 | "Different histories" message — after a previous successful sync: a later divergence is worded as a warning asking the user to check with the sender — `handoff.test.ts` |

### Two-step replace

| ID | Asserts |
|---|---|
| TC-RG-8-18 | Backup failure aborts: when the backup download throws, "Couldn't create a backup, so nothing was replaced" is shown and the confirm-replace button never appears — `RegisterView.handoff.test.tsx` |
| TC-RG-8-19 | Confirm replaces: after a successful backup, step 2's confirm button actually replaces the register with the bundle's contents — `RegisterView.handoff.test.tsx` |
| TC-RG-8-20 | Keep leaves it: "Keep my register" cancels the pending replace at step 1, no destructive action offered — `RegisterView.handoff.test.tsx` |
| TC-RG-8-21 | An unrelated failed import (a completely different, broken file) does not clear a valid pending replace decision — `RegisterView.handoff.test.tsx` |

### Concurrency (append-only data-integrity)

| ID | Asserts |
|---|---|
| TC-RG-8-22 | A local `append()` racing a concurrent `importBundle()` of an extending bundle cannot fork the chain or silently lose either write — `handoff.test.ts` |
| TC-RG-8-23 | Two concurrent imports of the same extending bundle apply it exactly once — no duplicate `event_id` write — `handoff.test.ts` |

### Supporting invariants the hand-off bundle depends on

| ID | Asserts |
|---|---|
| TC-RG-8-24 | The monotonic clock floor is restored from the stored trail after a reset (simulated page reload), instead of restarting at zero — protects an imported chain from a later local append landing "before" a far-future imported timestamp — `audit.test.ts` |
| TC-RG-8-25 | Chain verification and export order follow hash links, not `occurred_at` — a clock-skewed, out-of-time-order pair still verifies and exports in true chain order, exactly the shape a chain imported from another machine has — `audit.test.ts` |
| TC-RG-8-26 | The register list skips an unreadable row instead of throwing and freezing the whole list — `register.test.ts` |
| TC-RG-8-27 | An unrecognised event type (from a newer app version, or a damaged record) still renders a visible timeline line naming it, instead of a blank line — `RegisterDetail.eventDetail.test.tsx` |

The audit-export allowlist guard (every function the audit module exports
must be named on an explicit allowlist, so a new write path fails this test
until someone consciously adds it — the safeguard hand-off's own replace
primitive had to be added to) is also an RG-8 invariant, but it already
carries its own ids — **`TC-NF-2-01` / `TC-VD-4-01`**, in `register.test.ts`
("the audit trail exposes no update or delete path"). Referenced here, not
renamed or re-numbered, per this round's brief.

### Round 2 fixes (code-review-005 round 2, N1-N9 and the noted test gap)

*Unlike the backfill above, every row in this table names a genuinely NEW
test, written before its fix (reproduce first, then fix) per the round-2
brief. `partially_replaced`, `backup_out_of_date` and `finish_out_of_date`
are new `ImportOutcome` values (`verdict-audit.md` §16.4/§16.8); the
`finishRegisterReplace` export and the "Finish updating the register" UI
action are new surface for RG-8 (§16.8 amended). N3's lock-order rule (audit
outer, register inner — `verdict-audit.md` §16.6, `register-lifecycle.md`
§15.1c) is a new cross-cutting invariant, not scoped to one function.*

| ID | Asserts |
|---|---|
| TC-RG-8-28 | N1: a register-step failure after the audit trail was replaced returns a distinct `partially_replaced` outcome — never a thrown, self-contradicting message — and the audit trail really is replaced — `handoff.test.ts` |
| TC-RG-8-29 | N1: `finishRegisterReplace` completes the register step when the local audit tip still matches the bundle it already replaced — `handoff.test.ts` |
| TC-RG-8-30 | N1: `finishRegisterReplace` refuses as `finish_out_of_date`, writing nothing, when the audit trail has moved on since the partial replace — `handoff.test.ts` |
| TC-RG-8-31 | N2: `replaceWithBundle` refuses as `backup_out_of_date`, writing nothing, when a local write landed after the tip the caller's backup actually exported — `handoff.test.ts` |
| TC-RG-8-32 | N3: an `updateLifecycleStage` approval racing a concurrent `replaceWithBundle` can never leave the audit trail and register disagreeing (fixed lock order: audit outer, register inner, everywhere both queues are touched) — `handoff.test.ts` |
| TC-RG-8-33 | N4: a bundle whose verdict is missing `confidence_caveats` is rejected as `invalid_format` at import, instead of passing and failing later — `handoff.test.ts` |
| TC-RG-8-34 | N9: `__APP_VERSION__` equals `package.json`'s version — the assertion `src/vite-env.d.ts`'s comment cites — `handoff.test.ts` |
| TC-RG-8-35 | N4: a corrupt stored verdict (missing `confidence_caveats`, written directly, bypassing hand-off import) shows "This case couldn't be loaded" with a way back, instead of hanging on "Loading…" — `RegisterDetail.test.tsx` |
| TC-RG-8-36 | N5: with no policy loaded, a control with a recorded attestation shows ATTESTED — NOT VERIFIED with the attester and evidence note, not EVIDENCE UNKNOWN — `VerdictDisplay.cr005.test.tsx` |
| TC-RG-8-38 | N1 (UI): after a register-step failure, "Finish updating the register" appears in `RegisterView` and completes the replace — `RegisterView.handoff.test.tsx` |
| TC-RG-8-39 | N2 (UI): a local write after saving the backup sends the UI back to step 1, keeping the same pending bundle — `RegisterView.handoff.test.tsx` |
| TC-RG-8-40 | N8: double-clicking "Save a backup of mine first" downloads only once — `RegisterView.handoff.test.tsx` |
| TC-RG-8-41 | Test gap (noted alongside round 1): a second import started while one is in flight is ignored (the `importInFlight` guard) — `RegisterView.handoff.test.tsx` |

N7 (the plain export success message overclaiming that the file was saved)
changes existing copy rather than adding a behaviour — `TC-RG-8-01`'s own
test was updated to assert the corrected wording in place, not re-numbered.

### Round 3 fixes (code-review-005 round 3, R3-1 through R3-5)

*Same discipline as round 2: every row below names a genuinely NEW test,
written before its fix (reproduce first, confirm it fails, then fix).
`register_needs_finishing` is a new `ImportOutcome` value
(`verdict-audit.md` §16.4/§16.8, amended). R3-3 and R3-5 touch
`src/components/challenge-memo.ts`/`VerdictDisplay.tsx` and a test-file
comment respectively, not the hand-off bundle itself — numbered into this
same sequence because, like round 2's N5/N6/N7/N9, they are this round's fix
pass, not a separate feature.*

| ID | Asserts |
|---|---|
| TC-RG-8-42 | R3-1: after a partial replace, re-importing the SAME bundle (standing in for the in-memory record of a pending finish being lost — a view switch or a reload) reports `register_needs_finishing`, naming both that the audit trail already matches and that the register does not; `finishRegisterReplace` then completes it and the register matches — `handoff.test.ts` |
| TC-RG-8-43 | R3-1 regression guard: a bundle that is genuinely fully absorbed, register included, still reports plain `up_to_date` — the new register check never fires a false positive — `handoff.test.ts` |
| TC-RG-8-44 | R3-1 (UI): the same recovery through the real file input and buttons — unmounting after a partial replace and re-importing the same file in a fresh mount offers "Finish updating the register" (no backup step) and completes it — `RegisterView.handoff.test.tsx` |
| TC-RG-8-45 | R3-2: while "Finish updating the register" is pending, "Import hand-off bundle" is disabled with a visible reason, and a second, different bundle landing on the import handler anyway is ignored outright — never both a Keep/Save-backup pair and a Finish pending together, and the ignored bundle's content never reaches the register — `RegisterView.handoff.test.tsx` |
| TC-RG-8-46 | R3-4 (Minor): `finish_out_of_date` through the real "Finish updating the register" button (previously only a store-level test, `TC-RG-8-30`, covered this) — the audit trail moving on before the click is reported, and the register step never runs — `RegisterView.handoff.test.tsx` |
| TC-RG-8-47 | R3-3: `buildChallengeMemo` on a verdict with no `explanation` at all (BC-V11C01-04 legacy verdicts) renders the same legacy note `RegisterDetail` shows, with every explanation-derived field falling back to "none recorded", instead of throwing — `challenge-memo.test.ts` |
| TC-RG-8-48 | R3-3: clicking "Download effective-challenge memo" shows a visible error instead of failing silently when memo generation throws — `VerdictDisplay.memo-download.test.tsx` |
| TC-RG-8-48b | R3-3: a later, successful download clears the earlier error — `VerdictDisplay.memo-download.test.tsx` |
| TC-RG-8-49 | The Import control is disabled — not just the chosen file ignored — for as long as a replace is waiting for its second step, and re-enables once that replace is abandoned (row added 2026-10-03, code review 006 A-6) — `RegisterView.handoff.test.tsx` |

R3-5 (a stale code comment in `src/engine/try-these.test.ts` claiming
`docs/try-these.md` was left unedited, when the same commit had already
updated it) is a comment-only correction — no behaviour changed, so no new
test applies.

## RG-9 — Control-evidence attestation

`requirements/requirements.md`, RG-9: "A reviewer shall be able to record,
against the current verdict, that a required control is in place, with
their name and an evidence note. The attestation shall be shown as a human
claim — "attested — not verified" — never as machine-verified, and shall be
counted separately from machine-verified evidence."

| ID | Asserts |
|---|---|
| TC-RG-9-01 | Attesting a control records a `control_evidence_attested` audit event carrying the control id, the attester's name, the evidence note, and the verdict id — `RegisterDetail.controlEvidence.test.tsx` |
| TC-RG-9-02 | The per-control chip in "What you need to do" reads exactly "attested — not verified", lower-case like its neighbours — `VerdictDisplay.cr005.test.tsx` |
| TC-RG-9-03 | The evidence panel shows "ATTESTED — NOT VERIFIED" with the attester and evidence note, distinct from a "VERIFIED" control alongside it — `VerdictDisplay.cr005.test.tsx` |
| TC-RG-9-04 | The sign-off checklist counts machine-verified, attested, and outstanding controls separately, and calls the verified+attested total "addressed" — never "in place", which stays reserved for machine-verified — `VerdictDisplay.cr005.test.tsx` |
| TC-RG-9-05 | With no policy loaded, the sign-off checklist says evidence is unknown instead of a confident outstanding/addressed count — `VerdictDisplay.cr005.test.tsx` |
| TC-RG-9-06 | With no policy loaded, a recorded attestation still names itself on the checklist line, because it comes from the audit trail, not the policy — `VerdictDisplay.cr005.test.tsx` |
| TC-RG-9-07 | Attesting a second, different control while the first control's write is still in flight records both attestations, not just one — the in-flight guard is per control id — `RegisterDetail.controlEvidence.test.tsx` |
| TC-RG-9-08 | When the write fails, the attest form stays open with the error shown inline (typed values preserved) instead of silently closing as if it had saved — `VerdictDisplay.cr005.test.tsx` |
| TC-RG-9-09 | "Independent validation (2LoD)" — a control whose policy entry names a review's base id in `covers_reviews` — renders once, as the control, with an "also covers" note naming the matched review instance — `VerdictDisplay.cr005.test.tsx` |

### Untested behaviours

None. Every behaviour on the original backfill's brief had an existing test
that already proved it — that pass only added the id. The round-2 fix pass
added genuinely new tests (TC-RG-8-28 through -41, table above) — each one
written first, confirmed to fail, then fixed, per that round's brief. The
round-3 fix pass (R3-1 through R3-5) adds TC-RG-8-42 through -48b, same
discipline — the one exception is R3-5's comment-only correction, which has
no behaviour to test.

### Verification

`python3 scripts/trace-check.py` — clean, every id in this file traced to a
named test, no dangling `[Trace:]` paths. The original backfill re-ran its
seven touched test files individually with `npm test -- <path>` (never bare
`vitest` — this project's Node 26/jsdom `localStorage` gotcha) and produced
the same pass count as before its edits, since no test body, assertion, or
behaviour changed there — only `it()` title strings gained a `TC-RG-8-NN:` /
`TC-RG-9-NN:` prefix; the full suite was explicitly out of scope for that
pass. The round-2 fix pass is different in kind (real behaviour changed) and
was verified accordingly: every touched test file 3x, the full suite 3x
consecutively, `npx tsc --noEmit`, `python3 scripts/spec-parity-check.py`,
and `python3 scripts/trace-check.py`, all clean. The round-3 fix pass
(R3-1 through R3-5) was verified the same way as round 2.

## Superseded

| ID | Reason |
|---|---|
| TC-RG-8-37 | R16 chunk D1 (build/prompts/R16.md v2.1 §4.1) deleted `describesSameObligation`, the significant-word text heuristic this case guarded a subset-vs-equal-set bug in. The replacement mechanism (`covers_reviews`, a firm-authored, referential list of review base ids) does no word comparison at all, so the bug class — two names sharing some but not all significant words wrongly folding together — cannot recur. Superseded by TC-RG-9-09's migrated fixture, `VerdictDisplay.cr005.test.tsx`. |
| TC-RG-9-10 | Same deletion. This case guarded the heuristic's one-significant-word special case ("Validation" never absorbs a review alone). `covers_reviews` has no word-count concept to have that edge case at all — superseded by TC-RG-9-09's migrated fixture and the view-model's own `covers_reviews`/base-id-matching tests (`src/components/verdict-view-model.test.ts`, TC-R16-D1-07). |

## Changelog

| Date | Change |
|---|---|
| 2026-09-28 | Written to close the RG-8/RG-9 traceability gap. |
| 2026-09-28 | Round 2 fix pass (code-review-005 round 2, N1-N9 + the noted test gap): 14 new tests added, TC-RG-8-28 through TC-RG-8-41. |
| 2026-10-02 | Round 3 fix pass (code-review-005 round 3, R3-1 through R3-5): 8 new tests added, TC-RG-8-42 through TC-RG-8-48b. |
| 2026-10-02 | R16 chunk D1: TC-RG-8-37 and TC-RG-9-10 superseded (describesSameObligation deleted, replaced by `covers_reviews`); TC-RG-9-09's description updated to describe the replacement mechanism — see test-cases-020.md for the chunk's own new cases. |
| 2026-10-03 | Code review 006 (A-6): row TC-RG-8-49 added for a test that existed without a row. |

---

*Developed using the Grounded Vibe Methodology*
