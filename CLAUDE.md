# AIGate — AI risk appetite as code

A pre-check gate for banks: AI use cases are data-flow graphs, the firm's
risk appetite is a set of invariants over those graphs, and the engine
returns a deterministic verdict — in/out of appetite, what's violated, the
minimal control set that fixes it, and the regulatory citation behind every
step. Source-of-truth rulebook: `grounding/raf-extraction.md` (derived from
`grounding/ai-raf-template.html`). Built via the GVM pipeline.

GitHub: https://github.com/oza977-max/ai-raf-precheck — **PUBLIC**. Live at
https://oza977-max.github.io/ai-raf-precheck/ (served from the `gh-pages`
branch). Every push is world-readable the moment it lands, so the
confidentiality rule below has no margin for a quiet fix-up.

The product's value is determinism + auditability + minimal-fix solving. It
is deliberately *not* a chatbot and not a Big-4 deliverable generator.

---

## Architecture in one breath

Four boundaries (`specs/cross-cutting.md` §7), enforced by convention and
checked at review:

1. **`src/engine/*` is a pure island** — imports only engine types and
   stdlib. No React, no idb, no SDK, no `Date.now()`, no `Math.random()`,
   no I/O anywhere in its call graph.
2. **`src/llm/*` is the only place the Anthropic SDK is imported.**
3. **`src/store/*` is persistence-only** — no evaluation logic, no React.
4. **`src/components/*` is presentation-only** — calls engine/store
   functions, never inlines business logic.

**Determinism is a product requirement, not a style preference (NF-1).**
`evaluate()` must be byte-identical across runs for identical inputs; policy
collections are sorted by id before iteration, and TC-PE-1-01 asserts this
over 10 runs by comparing the whole serialized result — so any new field is
covered automatically and a non-deterministic addition fails loudly.

---

## Gotchas that have actually cost time

Every item here caused a real bug or a wasted cycle. This is the part of
this file worth reading twice.

- **Run tests with `npm test`, never bare `npx vitest`.** Node 26 shadows
  jsdom's localStorage polyfill; the npm script sets
  `NODE_OPTIONS=--no-experimental-webstorage` to compensate. Bare `vitest`
  produces a wall of phantom failures — this has misled subagent reviews
  more than once. Same for `npm test -- <path>`.
- **Specs are parallel `.md` + `.html` files with no generation link.** Edit
  one and the other silently drifts; `scripts/spec-parity-check.py` only
  reads `.md`, so it will not catch it. Always edit both.
- **The verdict screen is asserted with a single-match `/approved|rejected/i`
  query.** That means *policy YAML content* rendered on the verdict can break
  UI tests — a control evidence string reading "Approved platforms pin TLS
  1.3" did exactly that. Avoid those two words in any new rendered string,
  including pack rule text.
- **The audit trail is append-only evidence, so any path that can fire a
  write twice is a data-integrity bug, not a UX nit.** Duplicate events
  cannot be cleaned up afterwards, by design. React StrictMode double-invokes
  mount effects (the AIGate self-assessment seeding race) and users
  double-click buttons (2LoD approve/request-correction) — both were closed
  with a synchronous `useRef` in-flight guard, because a state update lands
  too late to prevent the second call.
- **Run the full suite 3× consecutively** before calling anything done that
  touches timing, ordering, or the audit trail. This is what surfaced a
  same-millisecond audit-ordering flake that single runs hid.
- **A field that is computed but never consumed is a bug in waiting.**
  Regulatory citations were computed by the engine and discarded at verdict
  assembly for the whole of V1 — no test failed, because nothing asserted
  they reached the user. Audit for this class deliberately.
- **Honesty is a functional requirement, not tone.** The UI must never claim
  more than it can prove: unsigned pack rules make verdicts provisional
  (NF-7), controls without evidence render UNVERIFIED, pack chips say
  "pending adoption", the audit trail states it is client-side and
  proof-of-concept grade (NF-2 / design-vision L-3). Never soften these to
  make a demo look better.

---

## Where the deeper context lives

Load these when the task needs them, not upfront.

| Need | Read |
|---|---|
| What a chunk built, why, and what it deliberately deviated from | `build/handovers/*.md` (newest: `V2-A.md`) |
| The contract a chunk was built against | `build/prompts/*.md` |
| Remaining gaps vs. the design mockup | `build/design-gap-audit.md` |
| Worked cases with engine-verified expected verdicts | `backtest/use-cases.md` (predictions pinned by `src/engine/backtest-predictions.test.ts`) |
| Product north star, honest limitations, moat, deployment phases | `design-vision.md` — local only, gitignored, **purged from history 2026-07-26**. Never commit it: it holds the moat analysis and the internal-adoption plan. |
| Rule/pack authoring — human-led, never generated | `grounding/PACK-AUTHORING.md` |
| Engine, intake, register, policy schema, cross-cutting specs | `specs/` |
| Long-form project history and standing user rules | `~/.claude/projects/-Users-kshitijoza-RAF/memory/` |

---

## House rules

- **The user is non-technical on git/GitHub — handle all mechanics.**
  Auto-commit and push at every meaningful milestone; never ask them to run
  git commands.
- **Confidentiality is a hard rule.** No internal company figures, no
  employer name, no internal team or committee names — anywhere in the repo
  or its git history. Street-generic references only ("hundreds of
  questions", "Risk Committee", "2LoD"). Check new content before every
  commit; see the confidentiality entry in project memory for the full rule
  and the history-rewrite record.
- Plain language over jargon in anything user-facing.
- Verification ritual before commit: `npm test` ×3, `npx tsc --noEmit`,
  `npm run build`, `python3 scripts/spec-parity-check.py`, and a live
  browser walkthrough of the affected screen.
