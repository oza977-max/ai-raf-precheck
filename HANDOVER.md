# Handover — 2026-08-04

Written at the close of Phase 8. Everything below was verified with a command,
not remembered. Supersedes the 2026-07-29 handover.

---

## Repo state

| | |
|---|---|
| Branch | `main`, pushed, clean |
| Last commit | `0a40e85` feat: the sign-off names the verdict it attests to [P8-C08] |
| Tests | **334 passing**, 36 files (was 283 at the start of Phase 8) |
| `npx tsc --noEmit` | clean |
| `npm run build` | clean |
| `python3 scripts/spec-parity-check.py` | clean (R1–R8) |
| Live site | current — published at `0a40e85` |

---

## Phase 8 is complete — all eight chunks

Round 3 fixed three things, and each one was a case of the product knowing
something and not telling the user.

| Chunk | Delivers |
|---|---|
| P8-C01 | Jurisdiction must be answered before you can proceed |
| P8-C02 | Required fields marked, from one list that also drives the gate |
| P8-C03 | Pre-round-3 drafts cannot slip past the new gate |
| P8-C04 | The engine emits **why** a verdict is provisional |
| P8-C05 | The verdict states the consequence and the labelled cause |
| P8-C06 | `VerdictDisplay` reusable on a reviewer's page |
| P8-C07 | **The sign-off page shows the verdict** |
| P8-C08 | The sign-off record names the verdict it attests to |

P8-C07 is the one that mattered most: charter 004 measured the sign-off page at
779 characters, and a 2LoD reviewer was being asked to attest to a decision the
page did not show them.

**Round 3 coverage is complete.** Every `TC-R3-*` id in `test-cases-003.md` has
a test, except `TC-R3-JU-6-03`, recorded UNREACHABLE with rationale in both
twins — its two trigger conditions are mutually exclusive by construction,
which contradicts ADR-EE-R3-1's claim that they can co-occur.

---

## The thing worth reading twice

**Green is not evidence. Deleting the code the test protects is.**

Four times this round a test was green and could not have failed:

1. **P8-C03** — the draft-migration tests, until mutation confirmed they broke
   when the envelope inferred the answer from array length.
2. **P8-C05** — a fixture set `binding_regulatory_basis: null`, and that
   emptiness was the *only* reason a false claim looked true. Two drafts of the
   same sentence shipped past three review passes because of it.
3. **P8-C07** — `renderDetail(id, undefined)` silently substituted the default
   policy, so the "no policy loaded" test exercised the *with*-policy path.
4. **P8-C08** — the double-submission test, twice. First an awaited click
   serialised the handler; then jsdom flushed a re-render between synthetic
   events. Both looked convincing. Neither would have been caught by reading.

The check is one command: delete the guard, run the test, see if it goes red.
It caught something **every time it was run this round**.

**The second pattern, four chunks running:** data sourced correctly and
communicated dishonestly. The reasoning chain that simply vanished; the empty
invariant list that read as "nothing was triggered"; the evidence status that
said nothing at all when no policy was loaded; the historical/current split
that was right in the code and invisible on the page. In every case a reader
could not distinguish "we checked and found nothing" from "we did not check".

Both patterns are already in `reviews/build-checks.md` territory and worth
promoting to standing checks.

---

## After Phase 8

Nothing is scheduled. Five things are known and owed — each with a pointer to
where it is actually specified, not a restatement.

| Item | Where it lives |
|---|---|
| Charter 004's unrouted defects — D-001 (intake description discarded), D-004 (register shows the input-node name), D-006 (vendor silently defaulted) | `specs/implementation-guide.md` §11.5 |
| Charter 005's observations — O-001 (`submittedDescription` not persisted, so a restored questionnaire checks contradictions against an empty string), O-002 (the register load races the self-assessment seeding, so the duplicate check can report a count it has not finished counting) | `test/explore-005.md` §O — **in no spec, no chunk, no requirement** |
| The exploratory re-walk confirming round 3's defects no longer reproduce | `specs/implementation-guide.md` §11.5 — run `/gvm-explore-test` |
| RF-2: the `.md`/`.html` spec twins still drift; `spec-parity-check.py` reads only `.md`. `requirements-003` is generated; `test-cases-003` and the four domain specs are still hand-maintained | Standing constraint below; generator at `scripts/render-requirements-003.py` |
| FN-003 and FN-004, both open | `specs/forward-notes.md` |

**The stale release verdict.** `test/test-002.html` says **Ship-ready**, and it
predates both exploratory charters. Treat it as stale. `/gvm-test` was correctly
blocked during Phase 8 because it would have failed on the very defects Phase 8
was fixing — **that reason is now gone.** Re-running it is the natural next
step, and its verdict is the honest answer to "is this shippable".

Suggested order: `/gvm-test` for a current verdict → `/gvm-explore-test`
charter 006 to confirm round 3 holds under a real walk → then route charter
004's and 005's leftovers into a round 4, or decide the product is where it
needs to be.

---

## Standing constraints (unchanged)

- **Confidentiality is absolute.** RAF is PUBLIC. No internal figures, no
  employer name, no internal team names, anywhere in the repo or its history.
- `design-vision.md` and `backtest/outcomes-local.md` are gitignored — never
  commit them.
- **Run tests with `npm test`, never bare `npx vitest`** — Node 26 shadows
  jsdom's localStorage polyfill.
- **Agent worktrees under `.claude/` are excluded from the test run**
  (`vite.config.ts`). Without it the suite silently runs twice, every count
  doubles, and the two copies starve each other of CPU until interaction-heavy
  tests time out — which reads as a code failure and is not one.
- Specs are parallel `.md` + `.html` with no generation link for most files.
  Edit both, every time.
- The audit trail is append-only; a path that can fire a write twice is a
  data-integrity bug.
- **BC-001 is active:** a claim about an existing symbol cites the `file:line`
  it was verified against.

---

## One housekeeping note

The browser's IndexedDB for `localhost:5173` can be wedged by calling
`indexedDB.deleteDatabase()` while the app holds a connection — `open()` then
never settles, and every page hangs on its first store read. It looks exactly
like a product bug. If the register hangs on "Loading…" or the intake hangs on
"Evaluating…", check that first. A fresh browser session clears it; Vite binds
to `localhost` only, so a second origin is not available as an escape hatch.
