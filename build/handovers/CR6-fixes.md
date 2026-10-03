# Handover: CR6 fixes — code review 006 findings, fixed under full GVM build discipline

## Status: Complete — every chunk converged (0 Critical / 0 Important on its last pass)
## Branch: `cr6-fixes`, fast-forwarded onto `main` when the ritual is green
## Contract: `build/prompts/CR6-fixes.md` v2 · Review: `code-review/code-review-006.html` (63f5c25)

Code review 006 reviewed the whole R16 redesign and returned "Do not merge": 6 Critical, 17 Important. The owner's
triage: fix all 6 Critical, 16 Important (EBT-1 accepted as a labelled exception), every Minor item and the stub flag,
then a second full review round. This round does that. In plain words, it makes four things true again:

1. **A case handed from one machine to another imports.** Before, every real case was rejected as "tampered", because
   the import re-checked a re-ordered copy of the events instead of the bytes that were written (FX-1).
2. **The intake flow never mixes up two cases.** "Start over", Back, leaving the page and coming back, a crash, or a
   double click can no longer let an abandoned case's late result land on the new one, or write the same decision twice
   into the permanent record (FX-2).
3. **An answer the tool doesn't recognise is treated as "Not sure".** It takes the strictest reading and is listed back,
   never a quietly gentler one. The description path also asks every question it should, including "does it replace
   something you already use?" (FX-3).
4. **The screens say only what is true and are usable with a screen reader.** Required questions are announced,
   faint text meets contrast, the register never says "nothing inherited" when controls were inherited, and real
   supplier names are never hidden (FX-4).

## How it was built

- Wave 1, three builders in parallel in their own worktrees on disjoint files: FX-1 (hand-off), FX-2 (intake flow),
  FX-3 (engine, extraction, policy references). Each committed its failing tests first ("red"), then the fix ("green").
- Integration on branch `cr6-fixes`: the three branches applied in order (FX-1's red commit re-made with the GVM
  trailer it lacked). The only fallout was the one predicted: B-8 made older test mocks of the model's reply unrealistic
  (no quotes), and TC-R16-F-69 used an answer that was never a real option. Mocks now carry quotes that really appear in
  the text each test types (BC-003); no assertion changed.
- Wave 2, one builder: FX-4 (what renders), on the integrated base.
- Each chunk then went through independent reviews (fresh context, read-only) until a pass returned no Critical or
  Important finding. Fixes between passes were test-first; every new test was shown failing before its fix.

## Decisions taken in the loop (beyond the contract)

- **C-5, review sources.** The contract said "de-duplicate by rule id, keep first". Review showed that drops a second
  pack's *different* review that happens to share an id, so the verdict under-reported an owed review. Sources now
  collapse only when the rule id AND the review text are identical; a firm-rule/pack-rule id collision also warns.
- **B-10, contradictions at form submission.** The contract said carry them into the questions. Review showed the check
  reads only the description and the graph, so a carried copy could only ever re-raise a contradiction an answer had
  already fixed. Removed. A contradiction now shows if and only if it still holds, and one the person has explained is
  remembered and not raised again on every later answer. That was a pre-existing nag loop from R6.
- **Adoption ("Use the earlier result") is a final, locked decision.** It now follows the same rule Confirm already
  did. While its three writes run, Back, Start over and both buttons are disabled. Once it is done, the saved draft is
  cleared and the screen cannot be re-entered. Before, Back mid-write or a return visit could create a second record.
- **A draft saved mid-evaluation is not restored.** It holds too little to redo the check faithfully. A notice says the
  check was still being worked out when the person left, and that if it completed it is on the register.
- **The resume banner ("Picked up where you left off… unfinished pre-check") is hidden on finished screens** (result,
  adopted). TC-R16-F-71's last step follows it: on the result screen, "+ New pre-check" is the way to a new case.
- **Supplier ids (G-7).** Only a value with the id shape AND a prefix the policy's own ids use is masked as "a supplier
  not on your firm's list". Real names like Q-Corp or ACME-Vision are always shown as written.
- **Failed adopt or dismiss saves are said plainly.** The adoption message says "check the register before trying
  again", because it is three writes and a part may already be there. The dismissal message says "please try again",
  because it is one write.

## Known gaps, stated honestly

- A tab refresh inside the few milliseconds of an adoption's own writes can still restore the pre-adoption draft, or
  leave a register entry without its audit events. This was judged acceptable by review; not new in this round.
- Only the intake flow has an error boundary. The verdict and register views do not yet; the cross-cutting spec says so.
- `buildGraphFromForm` still mints node ids inside the engine (`crypto.randomUUID`). B-15 moved only the clock out.
  A separate task is queued for after this merges.
- **Owner action (CR6-19):** `policy/appetite.yaml` approved models `VENDOR-LLM-v1` and `qwen3:4b` have no
  `plain_name`, so their description-path buttons still show the raw id until the owner approves plain names.

## Review passes

Format: `[(pass, Critical+Important found)]`.

- FX-1: `[(1, 0)]`. 3 Minor fixed: a test for the register's not-JSON message; spec grammar; seam comment wording.
- FX-3: `[(1, 3), (2, 1), (3, 0)]`.
  - Pass 1: TC-R16-F-69 fixture; a stale tick on question 5 was silently less strict; C-5 dropped a distinct review.
  - Pass 2: TC-CR6-05b was flaky, because it read an app-seeded case instead of its own.
- FX-2: `[(1, 5), (2, 2), (3, 0)]`.
  - Pass 1: the crash screen claimed the record was untouched; "fresh check" missed the form draft; B-10 re-raised fixed
    contradictions; the adopted screen survived Start over; the attempt token was not bumped on Back.
  - Pass 2: Back mid-adoption could adopt twice; a finished adoption was still an open step.
  - Pass 3's 3 Minors were fixed by the main loop (TC-CR6-02j/k/l).
- FX-4: `[(1, 1), (2, 0)]`.
  - Pass 1: the combined inheritance entry said "nothing inherited" when controls were inherited.
  - Pass 2's 3 Minors were fixed by the main loop:
    - Every real company name used as sample data in this round's tests and docs was replaced with an invented one.
      One was a Big-4 firm's name, and the repo is public.
    - The fold summary now says "from the other one, which is".
    - TC-CR6-11c: when the listed component itself inherits nothing, the entry says it is outside the covered envelope.

## Tests

- Test cases: `test-cases/test-cases-025.md` (+ html). Every TC-CR6 id in a test has a row. The "Amended existing
  cases" section lists every older test whose assertion changed, and why.
- Specs: intake-flow, verdict-audit, evaluation-engine, policy-schema, cross-cutting, register-lifecycle and
  implementation-guide, `.md` and `.html` together, each change marked "(CR6, 2026-10-03)".
