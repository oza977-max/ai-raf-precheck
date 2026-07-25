---
name: verify
description: Verify an AIGate change actually works — determinism-safe test runs, typecheck, build, spec parity, and a live browser walkthrough of the affected screen. Use before committing any change to src/, policy/, or specs/.
---

# Verifying an AIGate change

Green tests are necessary but not sufficient here: this product's claims are
determinism, auditability, and honest labeling, and each has a failure mode
tests alone have missed. Work through the gates that apply, then drive the
change in the browser.

## Gates

Run from the repo root.

```
npm test                              # NEVER bare `npx vitest` — see below
npx tsc --noEmit
npm run build
python3 scripts/spec-parity-check.py  # exit 0 = clean
```

**`npm test`, never bare `npx vitest`.** Node 26 shadows jsdom's localStorage
polyfill; the npm script sets `NODE_OPTIONS=--no-experimental-webstorage`.
Running vitest directly yields a wall of phantom failures unrelated to the
change — this has repeatedly misled reviews. Same for `npm test -- <path>`.

**Run `npm test` three times consecutively** when the change touches timing,
event ordering, the audit trail, or anything async in a React effect. A
same-millisecond audit-ordering flake once passed one run in three.

## Change-specific checks

- **Engine (`src/engine/`)** — confirm TC-PE-1-01 (10-run determinism) still
  passes untouched. Any new `EvaluationResult` field is covered by it
  automatically, so a `Date.now()`/`Math.random()`/unsorted-iteration slip
  fails there. Also check the module boundary held: no React, idb, or SDK
  import reached the engine.
- **Policy or pack YAML** — run `npm test`; `src/engine/backtest-predictions.test.ts`
  pins the documented expected verdicts in `backtest/use-cases.md`, so a rule
  edit that silently changes an outcome fails loudly. Update the doc if the
  change was intended.
- **Anything rendered on the verdict screen** — including strings that come
  from policy/pack YAML — must avoid the words "approved"/"rejected", which
  collide with the single-match `/approved|rejected/i` acceptance assertion.
- **Specs** — `.md` and `.html` are parallel files with no generation link;
  the parity script only reads `.md`. Edit both.
- **Any new write path** (audit events, register mutations) — the trail is
  append-only evidence, so verify no double-fire is possible: React
  StrictMode double-invokes mount effects, and buttons get double-clicked.
  A synchronous `useRef` guard is the pattern used elsewhere; a state flag
  lands too late.

## Live walkthrough

Start the dev server via the `aigate-dev` config in `.claude/launch.json`
(preview tooling, not a bare shell command), then drive the affected screen
end to end rather than only asserting in tests. Worked inputs with expected
verdicts are in `backtest/use-cases.md`.

Screens and what to actually look at:

| Changed | Drive this |
|---|---|
| Engine, policy, packs | Full intake → verdict; check tier/track, the "Why this verdict" citations, and the RA-9 chain if jurisdictions are ticked |
| Register, lifecycle, audit | Open a register row → detail view; confirm the timeline shows the new events in order |
| 2LoD actions | Approve or request-correction as 2LoD; confirm both audit events appear and the stage chip updates on return to the list |
| Policy editor | Save a policy version; confirm the header version updates and the register shows the re-evaluation banner + stale badges |
| Intake form / graph | Submit through the duplicate gate; confirm the gate stops the flow and the graph view renders node attributes |

Capture a screenshot of the changed screen as evidence before reporting done.

## Honesty check

The UI must never claim more than it can prove. If the change touches
verdict, control, pack, or audit labeling, confirm: unsigned pack rules
still render the verdict provisional (NF-7), controls without evidence still
read UNVERIFIED, pack chips still say "pending adoption", and the audit-trail
caveat still states client-side / proof-of-concept grade (NF-2). Never soften
these to make a demo read better.
