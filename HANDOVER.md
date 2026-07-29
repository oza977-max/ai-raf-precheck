# Handover — 2026-07-29

Written to end a very long session cleanly. Everything below was verified with a
command, not remembered. Supersedes the 2026-07-28 handover.

---

## Repo state

| | |
|---|---|
| Branch | `main`, pushed, clean |
| Last commit | `e38ef98` feat: jurisdiction answered-state complete [P8-C01] |
| Tests | **283 passing**, 33 files (was 275 at session start) |
| `npx tsc --noEmit` | clean |
| `npm run build` | clean |
| `python3 scripts/spec-parity-check.py` | clean (R1–R8) |
| Live site | **STALE** — last published at `20ab942`, several commits behind |

---

## What happened this session

Two threads ran. Both are complete and committed.

### 1. GVM skills synced to the book (separate repo)

`~/.claude/skills` is now a **git repo** — it was not before, no version control
at all. Three commits:

- `6d3debb` baseline of the installed skills
- `288801a` read-only audit against the book's appendices
- `fb0369e` the sync itself — 27 files, +685/−160

Highlights: `DR-1` was **absent entirely** from `gvm-build` and is now Hard Gate
10; the expert-scoring protocol was missing step 6 (the recall check);
`gvm-test-cases` looked for the impact map at the wrong path, so its trace gate
could never fire; code review had no concurrency panel; `gvm-status` misstated
`/gvm-deploy`'s gate. Fifteen ahead-of-book divergences preserved and logged in
`~/.claude/skills/DIVERGENCES.md`.

**The book extracts are deliberately NOT in any repo.** They are in
`~/Downloads` only. RAF is public; the skills repo is local-only with no remote.
Do not commit them anywhere.

### 2. AIGate round 3 — discovery through the first build chunk

| Phase | Commit | Result |
|---|---|---|
| explore-test charter 003 | `d96517b` | 8 defects — but see the correction below |
| explore-test charter 004 | `5febc8d` | Corrects 003. 6 defects, 3 observations |
| requirements round 3 | `6ec6cc4`, `88ffd40` | 13 requirements — R3-JU / R3-RD / R3-NF |
| test-cases round 3 | `c18fc34` | 33 cases → 38 after design review |
| tech-spec round 3 | `871e15e` | 4 spec deltas + Phase 8, six chunks |
| design-review round 1 | `4caeedf` | **Build with caveats**, 15 findings, 2 Critical |
| build P8-C01 | `e38ef98` | Complete, review converged `[(1,3),(2,0)]` |

---

## The thing worth reading twice

**Four separate times this session, a claim was written down without being
checked against the code — and each check was one command.**

1. Charter 003's D-002 claimed the guided form had no jurisdiction field. It has
   six checkboxes. The walk had enumerated only `<select>` elements and read a
   truncated page dump.
2. Charter 003's D-005 and D-008 both rested on an uncleared browser carrying a
   previous session's data into what was assumed to be a first run. Both
   withdrawn in charter 004.
3. Phase 8 originally sequenced a query-tightening chunk first, on the premise
   that existing tests would break. They could not — the assertions fire on the
   verdict screen before the test ever reaches the register. Chunk dropped;
   seven became six.
4. Design review found two Criticals and two Importants of the same shape: the
   sign-off payload was assumed able to carry a verdict reference (it cannot),
   control evidence status was assumed to live on the Verdict (it lives on
   PolicyFile), an affordance was assumed suppressible by omission (its button is
   ungated), and StrictMode semantics were assumed backwards.

This is now **BC-001**, a permanent build check in `reviews/build-checks.md`:
*a spec claim about an existing symbol must cite the `file:line` it was verified
against.* It is active and was applied during P8-C01 — where it caught a wrong
storage key in a test I had just written.

---

## Where Phase 8 stands

Six chunks. **P8-C01 is done.** Five remain.

| Chunk | Delivers | Depends on |
|---|---|---|
| ~~P8-C01~~ | ~~Jurisdiction answered-state~~ | **done** — `e38ef98` |
| P8-C02 | Required-field markers; a single required-field list driving both `isComplete` and the markers (the review budgeted this refactor) | P8-C01 |
| P8-C03 | Draft migration — **see FN-001, mostly already done** | P8-C01 |
| P8-C04 | `Verdict.provisional_reasons`; both existing derivations become reads | — |
| P8-C05 | Verdict renders the prose statement and the labelled causes | P8-C04 |
| P8-C06 | Register detail: six decision-bearing elements, `verdict_id`, policy prop path, optional `onCorrect`, exported helper | P8-C04 |

**`specs/forward-notes.md` FN-001:** P8-C03's scope is largely discharged by
P8-C01. The draft envelope means a pre-round-3 draft loads as unanswered by
construction, and two tests cover it. C03 should add the `TC-R3-JU-7-01/02` trace
IDs and close — not re-implement. Review pass 2 reached this independently.

**P8-C06 is oversized** and the design review said so. It now carries the schema
change, the prop path, the contract change, the exported helper and the
rendering. Split it before building.

---

## Standing constraints (unchanged)

- **Confidentiality is absolute.** RAF is PUBLIC. No internal figures, no
  employer name, no internal team names, anywhere in the repo or its history.
- `design-vision.md` and `backtest/outcomes-local.md` are gitignored — never
  commit them.
- **Run tests with `npm test`, never bare `npx vitest`** — Node 26 shadows
  jsdom's localStorage polyfill.
- Specs are parallel `.md` + `.html` with no generation link, and
  `spec-parity-check.py` reads only `.md`. **RF-2 has now recurred four rounds
  running** and drifted twice during this session's own edits, caught only by
  scripted probes. `requirements-003` and `test-cases-003` are now generated from
  their markdown; the four domain specs are still hand-maintained twins.
  Generating them is overdue.
- The audit trail is append-only; a path that can fire a write twice is a
  data-integrity bug. StrictMode double-invokes mount effects **within a single
  mount** — charter 004's TC-R3-NF-2-01 originally had this backwards.

---

## The next step

`/gvm-build` P8-C02 — or split P8-C06 first. The build gates all currently pass:
DR-1 cleared by `design-review-002.html`, MVP-1 satisfied, wiring matrix has 21
rows with no empty cells, WS-5 not applicable (no skeleton adopted).

**Do not start with:** another review round, or `/gvm-test` — the latter will
fail VV-4(d) until charter 004's Criticals are fixed in code, which is what
Phase 8 is for.

One housekeeping item: `npm run publish-site` is several commits behind.
