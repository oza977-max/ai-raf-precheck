# Handover — CR8 fixes (code review 008)

*2026-10-04. Contract: `build/prompts/CR8-fixes.md` v2 (v1 checked independently: 17 problems applied before
any code). Owner triage: fix all 4 Important code findings and all 15 Minor; publish the user docs (CR8-05) with
two outcome corrections; dismiss the stub flags (allowlisted); label the test spies.*

## What was fixed, in plain words
- **"Not sure" notes stay honest.** Editing a field on the review screen removes that field from the "we
  assumed…" note (and drops the note when nothing it covered is left); notes about other fields stay. The
  "somewhere else, or not sure" country note is never removed by a country edit — it stays true.
- **Back can't abandon a case after a failed result**, even via the confirmation and "Change an answer".
- **The audit-trail recorder** now ends on the evaluated value even when a field is edited and changed back
  in one retry (proved by a 300-run property test and a reviewer's 2000-run probe).
- **Correcting from the result** shows the countries question again.
- **Sign-off wording:** no screen says "you can start" or "nobody signs off" unless the case is determined
  self-service; a missing or unknown sign-off says to confirm with the AI risk team.
- **Audit-trail claims** everywhere now say what the check really proves: edits and earlier deletions show;
  removing the newest entries does not. The register banner reads "No break found in the N events present."
- **Two tabs:** the trail's cached last-entry check now also confirms the entry still exists (closes the
  Clear-all-data + reload case). **Policy saves** in two places at once queue each case once. **Sample data**
  interrupted mid-load recovers without duplicate entries.
- **Wording and screens:** the model-review sentence reads cleanly and is always true; the header tagline is
  readable; submitters no longer see raw policy field paths anywhere; the failed-result alert no longer blames
  their details; "Clear all data" names everything it clears and keeps; the overdue-regulatory-text line counts
  only rules this case used.
- **Docs:** the user guide and "try these" page describe the current form (all 11 worked cases re-verified;
  case 10 is Track II, case 7 has two reviews); README and tester guide wording match the app.
- **Specs:** both twins updated (intake-flow, verdict-audit, register-lifecycle, cross-cutting);
  register-lifecycle.html brought into line with its .md; `test-cases/test-cases-030`.

## Review passes
Format `[(pass, Critical+Important)]`; every Minor in every pass fixed.
- Plan check: 17 problems in v1 → v2.
- FX8-1 intake: `[(1, 0)]`. FX8-2 store/timing/seeds: `[(1, 0)]` (one of my Minor instructions — an O(n)
  check on every audit append — was reverted on the builder's evidence; the limit is pinned by TC-CR8-07b).
- FX8-3 what renders: `[(1, 1), (2, 0)]` — pass 1: a model-review wording that could be false against
  today's policy.

## Main loop
Docs merge and corrections (engine-verified); register-lifecycle.html twin; two intake tests re-pointed to
the plain policy sentence (CR8-13 moved raw paths to 2LoD); checked FX8-1's narrowed GRAPH_EXTRACTED guard;
spec twins + test-cases-030; ritual ×3 (1797 tests), tsc, build, parity, trace, no reused ids; live
walkthrough on a fresh origin: header contrast, the integrity banner and caveat, a self-service Low case (still
permissive, correct), a High case awaiting sign-off ("Not yet… once your AI risk team has signed it off"), the
Clear-all confirmation text.

## Known limits (stated)
- Assumptions carry no node id: an edit of a field on one node narrows notes about that field on any node.
- The audit tip hint can't see tampering that deletes an earlier entry and then appends (the app never
  deletes entries) — TC-CR8-07b pins it.
- A reload before an ib-portfolio sample case's scripted 2LoD events recovers it at the router stage with no
  review.
- Legacy drafts saved before this round lack the failed-evaluation flag.
- Observations not taken (recorded in the contract): O-3, O-6, O-7, O-8, O-9, O-10, O-12.

## Next (GVM)
Review of the CR8 fix round, then `/gvm-test`.
