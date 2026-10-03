# Counterpoise — Test Cases, Round ENG-ID (the engine mints no ids)

*Written 2026-10-03. The last non-deterministic call in the engine:
`buildGraphFromForm` (`src/engine/build-graph-from-form.ts`) called
`crypto.randomUUID()` for every node id and the graph id, so two builds from
identical answers never produced the same graph. That broke the engine's
"pure island" rule (`specs/cross-cutting` §7 Rule 1) and left a hole in NF-1
(identical inputs, identical output). Code review 006 fix B-15 already moved
the clock out by making the timestamp a parameter; this round does the same
for ids. The caller now passes an id source; the form and the seed cases pass
`() => crypto.randomUUID()`, so the product behaves exactly as before. Built on
top of CR6 (commit `cc480da`). The amended spec sections are marked "ENG-ID" in
`specs/cross-cutting`, `specs/intake-flow` and `specs/implementation-guide`.*

Test files: `src/engine/build-graph-from-form.test.ts`,
`src/engine/engine-boundary.test.ts`.

## §1 — Identical inputs build an identical graph

| ID | Asserts |
|---|---|
| TC-ENG-ID-01 | The same values, timestamp and id source build a byte-identical graph, with several inputs and an access-scope list — `build-graph-from-form.test.ts` |
| TC-ENG-ID-02 | Every id in the graph comes from the id source, drawn in a fixed order (graph, processing node, output node, then each input node), and the edges use those ids — `build-graph-from-form.test.ts` |
| TC-ENG-ID-03 | A different id source changes only the ids; every other field is the same — `build-graph-from-form.test.ts` |

## §2 — Nothing in the engine reads a clock, a random source or mints an id

| ID | Asserts |
|---|---|
| TC-ENG-ID-04 | No production file under `src/engine/` calls `Date.now()`, `new Date()` with no arguments, `Math.random()`, `performance.now()` or uses `crypto`, read from each file's syntax tree — `engine-boundary.test.ts` |
| TC-ENG-ID-05 | The scan flags each of those calls, and does not flag a comment naming them, the word in a string, or date arithmetic on a passed-in value (`new Date(Date.UTC(...))`) — `engine-boundary.test.ts` |

## Amended existing cases

These cases keep their ids. Their assertions changed because they pinned the old behaviour; each change is a deliberate part of this round, not a weakening.

| ID | What changed |
|---|---|
| TC-R16-A1-19 | Was: shuffled access-scope ticks give the same stored list, with the graph otherwise differing by its random ids. Now: with the same id source the two graphs are byte-identical — `build-graph-from-form.test.ts` |

Every other caller of `buildGraphFromForm` in the tests passes an id source and
is otherwise unchanged; the back-test expected verdicts
(`backtest/use-cases.md`, `src/engine/backtest-*.test.ts`) are unchanged.
