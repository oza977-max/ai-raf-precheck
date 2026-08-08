# Handover — 2026-08-07

Written to close out a very long session and set up the finish. Everything
below was verified with a command, not remembered. Supersedes 2026-08-04.

**The goal now is to END this build with something pitchable, internally or
externally.** Not to make it perfect. Read the stopping rule before doing
anything else.

---

## Repo state

| | |
|---|---|
| Branch | `main`, pushed, clean |
| Last commit | `05a1e8c` feat: the sign-off records who signed |
| Tests | **376 passing**, 39 files |
| `npx tsc --noEmit` | clean |
| `npm run build` | clean |
| `python3 scripts/spec-parity-check.py` | clean (R1–R8) |
| Live site | published at `0a40e85` — a few commits behind, `npm run publish-site` |

---

## THE STOPPING RULE — read this before running anything

This build has been circling: every review finds findings, every fix earns
another review. That loop does not terminate on its own.

**From here, anything a step surfaces goes into exactly two buckets:**

1. **Blocks release** — the product lies to a user, or a core flow is broken.
2. **Logged for V1.5** — everything else.

**The default is logged.** Do not open a new fix-and-review round inside this
build. Do not run `/gvm-code-review` again. If you find yourself writing a
fifth review report, stop and ship.

---

## What is left: three steps

| Step | Command | Ends with |
|---|---|---|
| 1 | `/gvm-test` (Full mode) | A current release verdict |
| 2 | `/gvm-doc-write` then `/gvm-doc-review` | README, changelog, a usable guide |
| 3 | `/gvm-deploy` | Tagged release, notes, site published |

**Step 2 is the one that matters most for a pitch.** Nobody reads a test
report; they read the README and they watch a demo. Budget accordingly.

### Expect Demo-ready, and say so plainly

`/gvm-test`'s verdict comes from a decision table whose inputs include the
acceptance-test walk. **69 of 148 test cases have covering tests that do not
carry their trace ID.** That is bookkeeping, not missing coverage — build
verification 003 walked them by running the tests that cover them — but the
evaluator cannot tell the difference, so VV-2(a) will fail and the verdict will
be **Demo-ready**.

That is the honest verdict for this product and a perfectly good one to pitch:
it does what it claims, end to end, and states its limits on screen. Do not
inflate it, and do not spend a session closing 69 trace IDs to buy a word.

---

## What this product is, for the pitch

A pre-check gate for banks. An AI use case is a data-flow graph; the firm's
risk appetite is a set of invariants over that graph; the engine returns a
**deterministic** verdict — in or out of appetite, what is violated, the
minimal control set that fixes it, and the regulatory citation behind every
step.

**The three things that make it different, and that the docs should lead with:**

1. **Deterministic, not generative.** The same answers always produce the same
   verdict. No LLM is involved in the decision — one is optional, only for
   reading a plain-English description into a graph, and the product says so on
   the intake screen. This is the whole pitch to a model-risk audience.
2. **It refuses to fabricate.** Unsigned rules make a verdict provisional and
   say why. Absent evidence renders UNVERIFIED, never a blank. Three regulatory
   decks were deliberately deleted because their source text could not be
   retrieved. A confidence score was removed as "fabricated precision". These
   are not caveats to apologise for — they are the product.
3. **Every obligation is traceable.** A required control names the invariant
   that demanded it; a downstream review names the policy rule that triggered
   it; a verdict names the regulation behind each step.

**Deliberately not:** a chatbot, and not a Big-4 deliverable generator.

---

## Honest limits — the V1.5 list

Have this ready. Being able to hand someone the list of what it does *not* do
is worth more in a bank than any feature.

| Limit | Detail |
|---|---|
| **No authentication** | The 2LoD role is a dropdown. The sign-off now records a typed name and says on the page that it is self-asserted and unverified. Real identity needs a backend this build does not have. |
| **No segregation of duties** | Nothing stops a submitter approving their own use case. |
| **Client-side storage** | Audit trail is append-only but held in the browser — proof-of-concept grade, not tamper-evident. Stated in the app. |
| **Pack rules unadopted** | Every shipped deck carries `[FIRM]` sign-off placeholders, so verdicts relying on them are provisional until a CRO adopts them. Stated on the verdict. |
| **Translation fidelity unattested** | The starter policy's attestation block is a placeholder, so the header says "unattested". Computed, not hardcoded. |
| **Four decks only** | SS1/23, SR 26-2, EU AI Act, DORA. More can be added as content, no code change. |
| **Condition language cannot scope to a node type** | `data_zone` exists on input and processing nodes, so a "cloud security approval" rule cannot be written correctly yet (FN-005). |

---

## Open forward notes

`specs/forward-notes.md` — FN-003 (requirement wording that invites an
overclaim), FN-004 (two affordances share one switch), FN-005 (condition
scoping). All are V1.5 material. None blocks release.

---

## Traps that have actually cost time

- **Run tests with `npm test`, never bare `npx vitest`** — Node 26 shadows
  jsdom's localStorage polyfill.
- **Agent worktrees under `.claude/` are excluded in `vite.config.ts`.** Without
  it the suite silently runs twice, counts double, and interaction-heavy tests
  time out — which reads as a code failure and is not one.
- **Specs are `.md` + `.html` twins with no generation link** for most files,
  and `spec-parity-check.py` reads only `.md`. Edit both.
  `requirements/requirements.html` is worse than drifted — it carries 55 of 79
  requirements. There is a warning at the top of it.
- **Do not call `indexedDB.deleteDatabase()` from the page while the app holds a
  connection.** It wedges storage for that origin: `open()` never settles and
  every screen hangs on its first read. It looks exactly like a product bug. A
  fresh browser session clears it.
- **Green is not evidence.** Four times this round a test was green and could
  not have failed. Delete the code the test protects and watch it go red. It
  caught something every single time it was run.
- **A fix pass is not a safe pass.** Three of code review 003's six findings
  were introduced during the round-4 fix session — including one where an audit
  write was added without the double-click guard that sat fourteen lines away.

---

## Where the deeper context lives

| Need | Read |
|---|---|
| What each chunk built and why | `build/handovers/*.md` (newest `P8-C08.md`) |
| The last full verification, all 148 cases walked | `test/test-003.html` |
| The last code review, six findings | `code-review/code-review-003.html` |
| Owed decisions | `specs/forward-notes.md` |
| The approach, explained for firms | `docs/approach.md` |
| Standing user rules and project history | `~/.claude/projects/-Users-kshitijoza-RAF/memory/` |

---

## Standing constraints

- **Confidentiality is absolute.** RAF is PUBLIC. No internal figures, no
  employer name, no internal team names, anywhere in the repo or its history.
- `design-vision.md` and `backtest/outcomes-local.md` are gitignored.
- The audit trail is append-only; a path that can write twice is a
  data-integrity bug.
- **BC-001 is active:** a claim about an existing symbol cites the `file:line`
  it was verified against — and citations go stale, so check before trusting.
