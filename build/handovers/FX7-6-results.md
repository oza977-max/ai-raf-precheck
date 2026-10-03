# FX7-6 — test hardening under load: results

Test files only (`IntakeFlow*.test.tsx`, `WalkingSkeleton.test.tsx`, `GraphReview.r9.test.tsx`, and the helper
`src/components/__tests__/fillText.ts`). No production code, no assertion weakened, no test id changed or added, global
`testTimeout` untouched. Method: 16 `yes > /dev/null` burners beside `npm test` (JSON reporter), burners killed afterwards.
The machine was never idle (other sessions' test runs), so every "load" figure below already includes ambient load —
the loaded runs were roughly 10-40x oversubscribed on 8 cores, harsher than the notes' recipe.

## Failures before and after (full 1679-test runs)

| Run | State | Load at start -> end | Failures |
|---|---|---|---|
| ambient | original | 38 -> 38 | 0 |
| A | original, burners | 31 -> 121 | 3: TC-R16-D2-48, D2-49, W-67 (5 s timeouts) |
| B | original, burners | 52 -> 133 | 11: D2-48/49/50/51, W-58/66/67, P4-C02, TC-LC-2-02, "titles the use case…", GraphReview.r9 (all 5 s timeouts) |
| C | after paste + delay:null | 125 -> 193 | 1: W-67 |
| D | + cr7 seed-order fix, targeted waits | 147 -> 173 | 1: D2-48 |
| E, F | + 15 s on two-flow tests | 110 -> 165, 156 -> 224 | 0, 0 |
| G | same | 224 -> 295 | 13 (spike far above the recipe; includes unowned files) |
| H | same | 30 -> 176 | 0 |
| I | same | 165 -> 163 | 1: TC-LC-2-02 (5 s) |
| J, K | + SLOW_FLOW_MS | 160 -> 325, 341 -> 463 | 1 each: GraphReview.r9 (then unowned) |
| L | same | 452 -> 377 | 1: TC-CR6-02a (1 s wait, duplicate check) |
| **M** | + DUP_CHECK_WAIT | 301 -> 287 | **0** |
| **N** | same | 283 -> 278 | **0** |
| **O** | same | 278 -> 266 | **0** |

M, N, O are the three consecutive clean loaded runs. Three normal `npm test` runs (ambient load 273-295) gave 140/140 files,
1679/1679 each. The GraphReview.r9 changes landed after M-O; one further loaded run (P, load 65 -> 156) with them: 0 failures.

## Per-test durations (ms)

| Test | Original (ambient ~38) | After paste | After paste + delay:null |
|---|---|---|---|
| WalkingSkeleton "completes full flow end-to-end" | 3181 | — | — |
| WalkingSkeleton "titles the use case…" | 2536 | — | 613 |
| WalkingSkeleton TC-LC-2-02 | 2479 | 1015 | 674 |
| WalkingSkeleton P4-C02 | 2252 | 1005 | 682 |
| r16w TC-R16-W-67 | 2627 | 1498 | 960 |
| r16w TC-R16-W-58 | 2109 | 1303 | 722 |
| r16d2 TC-R16-D2-48 | 2373 | 1578 | 872 |
| r16d2 TC-R16-D2-50 | 2439 | 1029 | 650 |
| r16d2 TC-R16-D2-51 | 1869 | — | 596 |
| r16f TC-R16-F-59 | 2107 | 1133 | — |

(— = not in that run's top list.) Cost drivers: every typed character and every click's timer yield re-rendered `<App />`.

## Why each per-test or per-wait budget exists

- `fillText` / `userEvent.setup({ delay: null })`: not a budget; they make flows cheaper (one input event instead of one per
  character, no timer yield per action).
- `SLOW_FLOW_MS` (15 s) on multi-screen flows measured above 3 s under load (and TC-R16-D2-48..51, W-67, which each run two
  complete form-to-verdict flows by design, and GraphReview.r9's form-path birth-event test): each wait inside is correct;
  the flow is about 1 s idle but passes 5 s when the machine is heavily loaded. IntakeFlow.cr7-fx1 already carried 30/60 s.
- `DUP_CHECK_WAIT` (5 s) on the "Continue →" that appears after the duplicate check, plus an inline 5 s on TC-CR6-02k's "use
  the earlier result": slow IndexedDB, not an early read (DOM at failure was still "Looking through earlier checks…"). Also
  P5-C02's confirm/verdict waits (5 s, precedent-based) and TC-CR6-15a's spy wait (5 s; confirm takes the case lock and writes
  the hash-chained trail before the trace call).
- TC-CR6-02k "banner gone" is now a `waitFor` (an early read; still fails if the banner stays).
- `failNextEvaluation()` (cr7-fx1, up to 10 s, inside every caller's 30/60 s limit): the background demo-register seeding
  also calls `evaluate()`, so a one-shot failure armed too early was used up by a seeded case (TC-CR7-02b-1 failed). It waits
  for seeding to settle first, with named failure messages. The seed returns early only on a policy reference error, which none
  of those tests set up; an invalid policy would show as the named "seeding did not finish" message. A test-side ordering fix,
  not a product race.

## Product note

The duplicate check reads the whole register (the 16-case portfolio auto-seeds on first visit). `DUP_CHECK_WAIT` is therefore
the first wait to watch if the register grows: if it starts timing out, the check is getting slower with register size, which
is a product-performance signal and not only a test-budget one.

## Product race

None found.
