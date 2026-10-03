# Handover — CR7 fixes (code review 007)

*2026-10-03/04, overnight, unattended under the owner's stated boundaries (fix review findings as
recommended; cautious option on product questions, listed below for confirmation; push only when
green; docs rewrite held for the owner). Contract: `build/prompts/CR7-fixes.md` v2.2. Driver: the
"Move random id generation out of the engine" session (one GVM pipeline).*

## What was fixed, in plain words

All 12 Important and 28 Minor findings of code review 007, plus CR7-41 (found during the round) and
the test-hardening work (FX7-6). CR7-35 was done by the CR6 session (2c93511, ba1062d). The user-docs
rewrite (CR7-12) is drafted on a separate branch and NOT published — see "Waiting for the owner".

- **Intake (FX7-1).** A reload while the description is being read no longer hangs. "Change an
  answer", a failed result, correcting from the result, and Back from the questions all keep the "Not
  sure" assumptions and the safety checks; Back asks every guessed question again from the values
  before the questions, so an AI guess the person rejected can no longer reach the result. Countries
  can be edited whenever the panel shows. A hidden model name no longer survives changing "Where does
  the AI come from?". A 1LoD person no longer sees another person's case name after "Use the earlier
  result". Form answers survive a policy-check refusal. Corrections are written to the audit trail on
  a fresh confirm too, and a retry never writes the same correction twice — the trail's net value
  always equals the value the result was worked out on. Old drafts from earlier builds migrate to an
  honest review screen. Plain sentences replace raw policy errors.
- **Storage and timing (FX7-2).** Two tabs no longer fork the audit trail. Double-clicking Save in the
  policy editor queues each case once; a failed or partial save says exactly what happened. "Clear
  all data" clears the drafts, the hand-off marker and the welcome flag and says so; it no longer
  reports "blocked" because of the tab's own database. Seeds can't double-write across tabs. The
  optional reasoning-trace call times out at 15 s. The policy screen's sign-off line is computed per
  rule ("none / N of M / all signed off").
- **Engine and policy checks (FX7-3).** One rule decides when the model question shows and is read.
  "Somewhere else, or not sure" plus a listed country keeps the listed country and lists the unknown
  one back as an assumption (owner decision). The policy checker refuses three kinds of dangling
  reference and no longer claims placeholders work where they don't. Filler in "other decision" is
  dropped. The register's model record now judges acceptance the way the engine does (family match,
  expiry applied).
- **What renders (FX7-4).** Register rows open from the keyboard. Faint text meets contrast. A case
  signed off by the AI risk team says so, and never "no sign-off needed"; a case that needed sign-off
  but has none on record never says "you can start". "No model was named" appears for reviewers where
  it can be proved. No raw registry ids on the result. The overdue-source warning is on the first
  screen. "machine-verified" is gone. The About page counts the shipped rules.
- **Test hardening (FX7-6).** The intake tests pass 3 full runs in a row under very heavy load, 3–4×
  faster (paste instead of character-by-character typing). No assertion weakened, no global timeout.
  Details: `build/handovers/FX7-6-results.md`.

## Review passes

Format: `[(pass, Critical+Important found)]`. Every chunk reviewed by fresh-context Sonnet reviewers
until a pass found none.

- Plan check (before any code): 24 problems in v1, all applied → v2 (then v2.1 FX7-6, v2.2 CR7-41).
- FX7-1 intake: `[(1, 3), (2, 1), (3, 1), (4, 0)]` — pass 1: countries locked, Back after a re-entered
  review, the failed-evaluation guard lost through the questions; pass 2: the correction de-duplication
  could skip A→B after A→C; pass 3: the form rebuilds node ids, so a synthesised correction wrote null.
- FX7-2 storage/timing: `[(1, 1), (2, 0)]` — pass 1: retry after a part-way policy save duplicated events.
- FX7-3 engine/policy: `[(1, 0)]`.
- FX7-4 renders: `[(1, 1), (2, 1), (3, 0)]` — pass 1: "signed off" gated on the current policy; pass 2:
  "you can start" with no sign-off on record.
- FX7-6 test hardening: `[(1, 0)]`.
- Every pass's Minor findings were fixed too (none deferred).

## Main-loop work at merge

- FX7-1's local copy of the Q3 rule replaced by the engine's (`TC-CR7-04e` pins it; proven to fail when
  they differ).
- CR7-41 follow-up: the register's model snapshot uses the expiry-applied policy (`TC-CR7-41d`, red then
  green).
- FX7-2's new policy-editor test policy gained the two controls the EU pack requires — FX7-3's new
  reference check (correctly) refused it at merge.
- One id per test: builders had reused ids across tests; renumbered `-1..-n` (180 CR7/FX7 ids, no
  duplicates).
- Spec twins (intake-flow, verdict-audit, register-lifecycle, policy-schema, cross-cutting) and
  `test-cases/test-cases-029` (wave 1 and wave 2).
- Live walkthrough on a fresh origin (wave 1): hidden model name cleared on Q3 change; UK + "Somewhere
  else" listed back; honest confirm notice; policy Save double-click → 19 events for 19 cases, re-save →
  "0 queued (19 already waiting)"; sign-off line "none signed off"; Clear all data → welcome back, drafts
  and marker gone, policy kept, register rebuilt; no console errors.
- Live walkthrough (wave 2): register case opened by keyboard (Enter on the case-name button; accessible
  name "{label} — {tier} tier, {stage}"); a High case awaiting sign-off reads "Not yet… once your AI
  risk team has signed it off"; signed off as 2LoD (name required first) → "your AI risk team has signed
  it off" in the headline, who-signs-off line and stage note, no "self-service"/"no sign-off needed";
  a genuine Low self-service case still reads "nobody"; "No model was named" shown for a seed case
  with no model; About shows "5 hard lines, 23 appetite rules"; no console errors.

## Decisions taken overnight (cautious option) — owner to confirm

1. **No sign-off on record** (legacy/imported case that needed one): the headline says "No sign-off
   from your AI risk team is on record for this version — confirm with them before you start." It does
   not say "you can start".
2. **Countries panel** is editable whenever it shows (before, checked countries were locked).
3. **Old drafts** saved by earlier builds open on the review screen with: "This was saved by an earlier
   version of this tool. The values from your earlier answers are on the cards below — please check
   each one."; cards whose origin wasn't saved say "Where this came from wasn't saved — please check
   this".
4. **"Clear all data"** keeps the saved appetite framework and model settings, and clears drafts,
   role, hand-off marker and the welcome flag — the confirmation says exactly this.
5. **"No model was named" on the register** is shown only when provable (no model link, case newer than
   2026-08-18, no correction naming a model, no failed link write); otherwise nothing is said.
6. **CR7-23 wording** (your decision, our words): "we assumed only the countries you listed apply — you
   also ticked “somewhere else, or not sure”, and no other country’s rules were checked."
7. **Policy-problem sentence** for submitters: "Your firm's rules file has a problem, so this can't be
   checked right now. Nothing about your answers is at fault — your AI risk team can fix it in the
   Appetite framework screen."

## Waiting for the owner

- **CR7-12 user docs (draft, not published):** branch `worktree-agent-ae14bdaa6d84702cb`, commit
  103ea3b (`docs/try-these.md`, `docs/user-guide.md` + `.html`). All 11 worked cases re-verified through
  the real form mapping and engine. Two outcome lines in try-these.md were already stale against the
  engine and are left for you: case 10 says "Track I" (engine and its pinned test: Track II); case 7 says
  "1 downstream review" (the form path gives 2: information security review and vendor risk
  assessment). `docs/tester-guide.md` likely has similar old-form wording (not in scope).

## Known residuals (stated, not hidden)

- Audit chain across tabs: another tab's replace that leaves the event count unchanged is not seen until
  reload (documented in audit.ts).
- If both the model-link write and the flag write fail, the register may say "No model was named" for a
  case whose model was named (double storage failure).
- A remount mid-extraction starts a second model call; the first result is ignored.
- `DUP_CHECK_WAIT` (5 s): the duplicate check reads the whole register — the first wait to watch if the
  register grows.
- Tooling gap: `scripts/spec-parity-check.py` rule R7 only matches upper-case ids (`TC-[A-Z0-9-]+`), so
  reused ids like `TC-CR7-02a` slip past it; found by hand this round. Worth widening.
- Pre-existing twin drift (RF-2): `verdict-audit.html` and `register-lifecycle.html` lack some older
  sections the `.md` has; CR7 text was added to both, older gaps not back-filled.

## Next (GVM)

A review of this fix round (the owner chose fix-all after code review 007), then `/gvm-test`. Not
started overnight, per the boundaries.
