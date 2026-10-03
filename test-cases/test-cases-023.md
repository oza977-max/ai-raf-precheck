# Counterpoise — Test Cases, Round R16-D2

*Written 2026-10-03. `build/prompts/R16-D2.md` v2.2 — the "No" screen
(VD-10), saved assumptions carried to the result screen and the register,
correcting a form-built verdict through the form, and the register's
"already in place" lines agreeing with the result screen's. Built on top
of R16-F (commit `52b2edf`).*

Test files: `src/engine/plain-intake.test.ts`,
`src/components/plain-copy.test.ts`,
`src/components/verdict-view-model.test.ts`,
`src/components/form-corrections.test.ts`,
`src/components/intake-state.test.ts`,
`src/components/__tests__/VerdictDisplay.r16d2.test.tsx`,
`src/components/__tests__/RegisterDetail.test.tsx`,
`src/components/__tests__/RegisterDetail.eventDetail.test.tsx`,
`src/components/__tests__/IntakeFlow.r16d2.test.tsx`,
`src/store/handoff.test.ts`, `src/store/packs.test.ts`,
`src/store/policy-references.test.ts`.

## §1 — One assumption shape, carrying its own fields (D-95)

`AssumptionRef`/`Assumption` gain `fields: string[]` (the graph fields a
"Not sure" branch sets) and the worded `Assumption` also gains
`shortLabel`. The guard test proves the mapping's own reported `fields`
can never silently drift from what the graph actually shows, for any of
the 14 questions that offer "Not sure" (or, for 3supplier, its "dont-know"
equivalent).

| ID | Asserts |
|---|---|
| TC-R16-D2-19 | For every one of the 14 "Not sure"/"dont-know" assumptions, the union of graph fields that differ between the "Not sure" graph and each of the question's other answers equals the mapping's own reported `fields` — `plain-intake.test.ts` |

## §2 — The "No" screen (VD-10, §2)

`buildVerdictView`'s `no` block, computed for every rejected verdict:
`kind`, `reason`, `change`, `contributingAssumptions`,
`otherAssumptionCount`. Pack hard-line plain fields (`plain_reason`/
`plain_change`) and their loader-check placeholder scan are a prerequisite
this section's pack tests also cover.

| ID | Asserts |
|---|---|
| TC-R16-D2-01 | A firm hard line with `plain_reason`/`plain_change` — exact "Why"/"What would change" text, with the hard-line coda — `verdict-view-model.test.ts` |
| TC-R16-D2-02 | A firm hard line with neither field falls back to its description + the §4.4 pointer, for both reason and change — the description closed as a sentence and the pointer AFTER the whole sentence, never spliced into it (corrected while verifying the build) — `verdict-view-model.test.ts` |
| TC-R16-D2-03 | A pack hard line with plain fields names the pack's own jurisdiction in the reason — `verdict-view-model.test.ts` |
| TC-R16-D2-04 | A pack hard line with neither field names the jurisdiction in the fallback reason, plus the pointer line — `verdict-view-model.test.ts` |
| TC-R16-D2-62 | A pack's jurisdiction is named in words from the policy's own list — "the European Union", but "Canada" — and a code the policy does not list is never shown (found while verifying: the first build printed the code, and its tests passed only because their sample packs spelled codes out as words) — `verdict-view-model.test.ts` |
| TC-R16-D2-05 | CS-2 (unsatisfiable invariant), no `plain_reason` — the invariant's description + pointer, plus the no-safeguard clause and the CS-2 change text, with no stray period-comma — `verdict-view-model.test.ts` |
| TC-R16-D2-05b | CS-2 with a `plain_reason` present uses it, still with the no-safeguard clause — `verdict-view-model.test.ts` |
| TC-R16-D2-06 | An id found nowhere loaded never renders the bare id, and offers no "what would change" line (`change` is `undefined`) — `verdict-view-model.test.ts` |
| TC-R16-D2-07 | An assumption contributes when any of its `fields` appears in the binding hard line's own condition keys; a non-matching assumption does not — `verdict-view-model.test.ts` |
| TC-R16-D2-07b | No assumptions at all — `contributingAssumptions` empty, `otherAssumptionCount` zero — `verdict-view-model.test.ts` |
| TC-R16-D2-08 | For a pack hard line, the PACK rule's own condition is checked for contribution, not the firm's — `verdict-view-model.test.ts` |
| TC-R16-D2-26 | A pack `hard_line` effect with `plain_reason`/`plain_change` loads and carries both — `packs.test.ts` |
| TC-R16-D2-27 | A pack `hard_line` effect with neither field still loads — both optional, same as a firm `HardLine` — `packs.test.ts` |
| TC-R16-D2-28 | A pack `hard_line` effect's `plain_reason`/`plain_change` are scanned for unknown placeholders, exactly as a firm hard line's are — `policy-references.test.ts` |
| TC-R16-D2-28b | `{audience}`/`{destination}` in a pack hard line's plain fields are recognised and do not warn — `policy-references.test.ts` |
| TC-R16-D2-29 | A firm hard line's Why/change/"who to talk to" all render on the first screen; no safeguards list, no next steps, no who-signs-off; no reserved word — `VerdictDisplay.r16d2.test.tsx` |
| TC-R16-D2-30 | Exactly one correction control renders on a "No" — the first screen's own, reworded; the reviewer section's second one does not render — `VerdictDisplay.r16d2.test.tsx` |
| TC-R16-D2-31 | On a non-rejected verdict, both correction controls still render with their usual, unreworded text — `VerdictDisplay.r16d2.test.tsx` |
| TC-R16-D2-32 | The contributing-assumptions line appears only when a case assumption meets the binding rule's condition, joined "a, b and c", with the pointer clause when other assumptions exist — `VerdictDisplay.r16d2.test.tsx` |
| TC-R16-D2-33 | No contributing assumption — the line does not render, even though the case has (non-contributing) assumptions — `VerdictDisplay.r16d2.test.tsx` |
| TC-R16-D2-34 | A pack hard line resolves against the loaded `packs` prop, naming the jurisdiction, on the real rendered component — `VerdictDisplay.r16d2.test.tsx` |
| TC-R16-D2-35 | An id found nowhere loaded renders the generic fallback, never the bare id, on the first screen — `VerdictDisplay.r16d2.test.tsx` |
| TC-R16-D2-36 | The "already in place" note names the platform this case uses, once, never doubled (DR7-34) — `VerdictDisplay.r16d2.test.tsx` |

## §2 item 7 / §7 — The reviewer section lists every assumption; evidence claims name their tool

| ID | Asserts |
|---|---|
| TC-R16-D2-37 | Every assumption the case has renders in the reviewer section, contributing or not, for a REJECTED verdict — `VerdictDisplay.r16d2.test.tsx` |
| TC-R16-D2-38 | The same list also renders for a NON-rejected verdict with assumptions — a case fact, not "No"-specific — `VerdictDisplay.r16d2.test.tsx` |
| TC-R16-D2-39 | No assumptions at all — the fold does not render — `VerdictDisplay.r16d2.test.tsx` |
| TC-R16-D2-09a | No scoped in-place safeguard at all — `inPlaceScopeName` undefined, note stays generic — `verdict-view-model.test.ts` |
| TC-R16-D2-09b | A scoped, matched in-place safeguard names the platform — `verdict-view-model.test.ts` |
| TC-R16-D2-09c | Scoped to both platform and vendor, both match — the platform's name wins — `verdict-view-model.test.ts` |
| TC-R16-D2-09d | Vendor-only match names the vendor — `verdict-view-model.test.ts` |
| TC-R16-D2-63 | A matched platform with no plain name leaves the "already in place" note generic — never its internal id on the first screen (found while verifying) — `verdict-view-model.test.ts` |
| TC-R16-D2-64 | A safeguard with no plain wording and no description reads "{name}. {pointer}" — a missing description degrades, never crashes the page (found in the verification ritual, where the first version of the full-stop fix crashed 37 sign-off-page tests) — `verdict-view-model.test.ts` |
| TC-R16-D2-65 | A registry plain name written to start a line ("Your firm's …") is lower-cased mid-sentence in the "already in place" note; a proper name is left alone (found in the walkthrough) — `verdict-view-model.test.ts` |
| TC-R16-D2-09e | No graph (the register path) falls back to `options.evidenceScope` and still names the match — register and intake agree — `verdict-view-model.test.ts` |
| TC-R16-D2-09f | No graph and no `evidenceScope` — a legacy event still renders, with the existing "we couldn't check" note, and no scope name — `verdict-view-model.test.ts` |

## §3/§4 — Assumptions survive to the result screen, the register, and the hand-off bundle (D-96, D-81, DR7-15/16/19)

| ID | Asserts |
|---|---|
| TC-R16-D2-20 | A bundle whose `graph_confirmed` carries valid assumptions imports successfully and keeps them — `handoff.test.ts` |
| TC-R16-D2-21 | A bundle whose `graph_confirmed` has no `assumptions` field at all (pre-D2) still imports — absence is legacy, not malformed — `handoff.test.ts` |
| TC-R16-D2-22 | A bundle whose `graph_confirmed` assumption is malformed (unknown questionId; unknown graph field; empty or oversized shortLabel) is rejected, nothing imported — `handoff.test.ts` |
| TC-R16-D2-23 | A bundle whose `verdict_corrected` carries assumptions, evidence_scope and corrections_count imports successfully and keeps all three — `handoff.test.ts` |
| TC-R16-D2-25 | `correction_source` rides through a `graph_corrected` event's correction — a valid value imports, an invalid one is rejected — `handoff.test.ts` |
| TC-R16-D2-43 | An uncorrected case shows its confirmation's own assumptions in the reviewer section — `RegisterDetail.test.tsx` |
| TC-R16-D2-44 | A corrected case shows the CORRECTION's assumptions, not the original confirmation's — `RegisterDetail.test.tsx` |
| TC-R16-D2-57 | `eventDetail` on `graph_confirmed` with two assumptions says "2 answers were 'Not sure'." — `RegisterDetail.eventDetail.test.tsx` |
| TC-R16-D2-57b | `eventDetail` on `graph_confirmed` with exactly one assumption uses the singular "1 answer was" — `RegisterDetail.eventDetail.test.tsx` |
| TC-R16-D2-57c | `eventDetail` on `graph_confirmed` with no assumptions at all adds nothing — `RegisterDetail.eventDetail.test.tsx` |
| TC-R16-D2-58 | `eventDetail` on `verdict_corrected` with assumptions also adds the count — `RegisterDetail.eventDetail.test.tsx` |

## §4b — The register's "already in place" agrees with the result screen's (D-97, W-7)

| ID | Asserts |
|---|---|
| TC-R16-D2-24 | A bundle whose `verdict_produced` carries an `evidence_scope` with an empty platform string is rejected — `handoff.test.ts` |
| TC-R16-D2-46 | A scoped control whose `evidence_scope` matches renders "already in place", naming the platform — the same text the intake screen shows for the same case — `RegisterDetail.test.tsx` |
| TC-R16-D2-47 | A legacy `verdict_produced` with no `evidence_scope` still renders, with the existing "we couldn't check" note — `RegisterDetail.test.tsx` |

## §5 — Correcting a form-path verdict through the form (D-82, DR7-17/DR7-22)

`src/components/form-corrections.ts`'s pure diff, the reducer's
`CORRECT_VERDICT_WITH_FORM`/`originalGraph` threading, and the real,
end-to-end flow.

| ID | Asserts |
|---|---|
| TC-R16-D2-10 | Two identical submissions produce no corrections at all — `form-corrections.test.ts` |
| TC-R16-D2-11 | A changed processing-node field is recorded against the ORIGINAL node id, not the rebuilt graph's fresh one — `form-corrections.test.ts` |
| TC-R16-D2-12 | A changed output-node field is recorded against the original output node id — `form-corrections.test.ts` |
| TC-R16-D2-13 | A cleared optional field (`declared_model_id`) is recorded with `corrected_value: null`, never `undefined` — `form-corrections.test.ts` |
| TC-R16-D2-13b | A field set FROM absent is recorded with `original_value: null` (symmetric with clearing) — `form-corrections.test.ts` |
| TC-R16-D2-14 | Inputs are diffed as ONE correction on node id `inputs`, field `data_classes` — the sorted set, not a per-node id — `form-corrections.test.ts` |
| TC-R16-D2-14b | Ticking the same input classes in a different order is not a correction (sorted comparison) — `form-corrections.test.ts` |
| TC-R16-D2-15 | Jurisdictions are diffed as one correction on node id `graph`, field `jurisdictions` — `form-corrections.test.ts` |
| TC-R16-D2-15b | The same jurisdictions ticked in a different order is not a correction — `form-corrections.test.ts` |
| TC-R16-D2-16 | Several changed fields across processing, output, inputs and jurisdictions each produce their own correction, all against the same graph-version pair — `form-corrections.test.ts` |
| TC-R16-D2-17 | Never diffs node ids — two submissions differing only because `buildGraphFromForm` minted fresh ids produce no spurious correction — `form-corrections.test.ts` |
| TC-R16-D2-18 | Every `ProcessingNode` key (bar `id`) is diffed when changed alone — `form-corrections.test.ts` |
| TC-R16-D2-18b | Every `OutputNode` key (bar `id`) is diffed when changed alone — `form-corrections.test.ts` |
| TC-R16-D2-18c | Changing every key on both nodes at once reports exactly one correction per key — no cross-talk — `form-corrections.test.ts` |
| TC-R16-D2-52 | A form-path `EVALUATION_FAILED` during a correction carries `originalVerdictId`/`originalGraph` back to the form — `intake-state.test.ts` |
| TC-R16-D2-53 | `STEP_BACK` from the questionnaire during a correction carries `originalVerdictId`/`originalGraph` back to the form too (closing the same hazard reached by a different control) — `intake-state.test.ts` |
| TC-R16-D2-54 | `CHANGE_ANSWER` from confirmation during a correction carries `originalVerdictId`/`originalGraph` back to the form — `intake-state.test.ts` |
| TC-R16-D2-55 | `CORRECT_VERDICT_WITH_FORM` from the verdict step enters `graph_extraction(form)` carrying `originalVerdictId`, `originalGraph`, and the last-confirmed `plainAnswers`/`assumptions` — `intake-state.test.ts` |
| TC-R16-D2-56 | `CORRECT_VERDICT_WITH_FORM` is refused from any step other than `verdict` — `intake-state.test.ts` |
| TC-R16-D2-59 | "Change an answer" in a REVIEW-screen correction of a form-built case (no form answers in hand) returns to the review screen, keeping the correction — never to an empty form (the contract's v2.1 guard, missing from the first build) — `intake-state.test.ts` |
| TC-R16-D2-60 | An evaluation failure in the same situation returns to the review screen, keeping the correction — `intake-state.test.ts` |
| TC-R16-D2-61 | Back from the questions in the same situation returns to the review screen, keeping the correction — `intake-state.test.ts` |
| TC-R16-D2-48 | "Correct" re-opens the FORM filled in, with the correction note; resubmitting with a changed answer writes form-sourced `graph_corrected` events (`correction_source: 'form'`) against the original case, numbered one version above the original (v1 → v2, added while verifying), then `verdict_corrected` — never a second `use_case_created` — `IntakeFlow.r16d2.test.tsx` |
| TC-R16-D2-49 | Resubmitting the form with nothing changed writes `verdict_corrected` with zero `graph_corrected` events and `corrections_count: 0` (F2C-6) — `IntakeFlow.r16d2.test.tsx` |
| TC-R16-D2-50 | "Change an answer" during a form correction keeps the correction — the eventual re-confirm still writes `verdict_corrected`, never refused as "already has a result" — `IntakeFlow.r16d2.test.tsx` |
| TC-R16-D2-51 | A double-click on "Confirm and evaluate" during a form correction writes exactly one `verdict_corrected` — `IntakeFlow.r16d2.test.tsx` |

## §6 — What a reviewer sees about re-tries (DR7-09, D2 part)

| ID | Asserts |
|---|---|
| TC-R16-D2-45 | "Corrected N times by the submitter — each version is in the record below." renders only once a correction exists, naming the count — `RegisterDetail.test.tsx` |

## §8 — Zero-correction resubmission renders as a re-check (F2C-6)

| ID | Asserts |
|---|---|
| TC-R16-D2-40 | `corrections_count: 0` on `verdict_corrected` renders "Re-checked — no answers changed." ahead of the usual status line — `RegisterDetail.eventDetail.test.tsx` |
| TC-R16-D2-41 | `corrections_count > 0` renders the usual status line, with no "Re-checked" wording — `RegisterDetail.eventDetail.test.tsx` |
| TC-R16-D2-42 | A legacy event with no `corrections_count` field at all renders the usual status line, never claimed as a re-check — `RegisterDetail.eventDetail.test.tsx` |

## Untested behaviours

- `handleCorrectVerdict`'s fallback to `CORRECT_VERDICT` (the review screen)
  for a form-built verdict whose form answers are not in hand. No path through
  the live UI reaches it in one session (every form confirm sets the answers);
  it exists for a verdict confirmed before this chunk. What happens AFTER that
  fallback is tested at the reducer level (TC-R16-D2-59 to -61); the
  dispatch choice itself is checked by reading the code, not by a test.

## Changelog

| Date | Change |
|---|---|
| 2026-10-03 | Written for R16-D2 (the "No" screen, saved assumptions, correcting a form answer). |
| 2026-10-03 | Verification pass: TC-R16-D2-59 to -65 added (a correction without its form answers never returns to an empty form; country names in words; no internal id in the evidence note); TC-R16-D2-02 and -48 strengthened. |

---

*Developed using the Grounded Vibe Methodology*
