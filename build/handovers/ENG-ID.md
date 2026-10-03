# Handover — ENG-ID: the engine mints no ids

*2026-10-03. Built on `cc480da` (CR6 on main).*

## What was built, in plain words

The form turns your answers into a diagram of the AI use: what goes in, what
the AI does and what comes out. Each box in that diagram needs a unique label
(an id). The engine used to invent those labels itself with a random-number
call. So the same answers never gave exactly the same diagram, and that broke
the engine's rule of no clocks, no randomness and no outside calls. CR6 fix
B-15 already did the same for the date and time. Now whoever calls the engine
also hands it the id source:

- `buildGraphFromForm(values, extractedAt, newId)`: `newId` is required. The
  engine draws ids in a fixed order: the graph, the processing node, the
  output node, then each input.
- The form (`StructuredForm.tsx`) and both seed files
  (`sample-register.ts`, `ib-portfolio.ts`) pass `() => crypto.randomUUID()`.
  The product behaves exactly as before.
- A new guard in `engine-boundary.test.ts` reads every engine source file's
  syntax tree. It fails if anyone calls `Date.now()`, `new Date()` with no
  arguments, `Math.random()`, `performance.now()` or `crypto` there again.
  It sees through a `globalThis.` prefix and bracket access. It does not
  catch aliasing; the comment says so.

## Tests and specs

- `test-cases/test-cases-026.md` + `.html`: TC-ENG-ID-01..05. TC-R16-A1-19 is
  amended to assert that the whole graph is identical.
- Spec twins amended (ENG-ID): `cross-cutting` §7 Rule 1, `intake-flow` §5.3,
  ADR-IF-R16-1 and the change log, and `implementation-guide`'s
  function list.
- The back-test expected verdicts are unchanged.

## Verification

- `npm test` ×3: 1540/1540.
- `npx tsc --noEmit` and `npm run build`: clean.
- `spec-parity-check` and `trace-check`: clean.
- Live walkthrough on a fresh origin (port 5174, this worktree):
  - The seeds built 17 cases.
  - A form-path case went Describe → Similar checks → Your answers → Confirm
    → Result.
  - The result rendered with no console errors.

## Review passes

Format: `[(pass, Critical+Important found)]`.

- `[(1, 0)]`. 4 Minor:
  - Guard false negatives (a `globalThis.` prefix, bracket access): fixed,
    with samples added to TC-ENG-ID-05.
  - The guard flags any name `crypto`: kept on purpose, because erring strict
    is safe.
  - The `StructuredForm.tsx` comment did not mention the ids: fixed.
  - A stray blank line at the end of a test file: fixed.
