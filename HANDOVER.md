# Handover — 2026-08-15 (updated 2026-08-17, post-v0.9.0 — read the
# CURRENT STATE block below first; sections beneath it age progressively)

Written at the user's request before a context clear, replacing the 2026-08-07
handover in full; **updated in place after the v0.4.0 session resolved the
open thread** (see "RESOLVED" below — read that section first, it supersedes
the old OPEN THREAD). Everything below was true at the moment of writing and
verified by command where it's a claim about state. Read this top to bottom
before doing anything.

---

## CURRENT STATE (2026-08-25) — supersedes everything below

**v0.16.0 live, 659 tests, CI green.** Read build/OPERATING-REGIME.md
first — three standing owner rules (context handover, model router,
audit-trail check-ins) apply to every session.

Since the 2026-08-17 block below: R10 (reviewer's language: memo export,
inherent/residual, two-axis evidence, v0.12.0) → R11 (third lever: model
governance + MIT risk-knowledge lens, v0.13.0) → three-panel concept
review + site-survey-001 (verdict: Coherent) → R12 (trust mechanics: all
17 findings, v0.14.0) → expert-scoring-001 (5 new roster experts) → R13
(knowledge lens earns its place, v0.15.0) → v0.15.1 (verdict to-do plain
language) → R14 (verdict screen folds per design panel, v0.16.0) →
**design-deliberation-001** (6 panels, 4 rounds, unanimous: targeted
redesign; reviews/design-deliberation-001/ holds proposal + conflicts +
dissents + skeptic amendments).

**IN FLIGHT: R15 = Option B targeted redesign, APPROVED by owner
2026-08-25** ("Lets go option B") — five build chunks per the chair's
proposal AMENDED by the two skeptics' fixes (read
reviews/design-deliberation-001/summary.json "skeptics" — four
must-fix amendments: graphSummaryRows fixed at the shared source; no
sticky Sign-off nav jump / no rubber-stamp path; role caveat at the
sign-off block; R14-already-shipped framing correction; plus the
register Flags-column change needs a register-lifecycle.md §10.2
amendment). Chunk order: register → verdict → form+confirm →
policy+header → graph-review+queue. requirements-015.md is the next
artifact; then GVM pipeline as always (test cases → build → review →
verify → doc → deploy). Session caps: subagent work hit the session
limit 2026-08-25 (resets 11pm Asia/Calcutta) — build chunks should
dispatch after reset; main-loop doc work is unaffected.

---

## CURRENT STATE (2026-08-17) — superseded, kept for history

**v0.9.0+ live, 537 tests, CI green on GitHub (first run 2026-08-17).**
Since the sections below were written, five releases shipped in two days:

- **v0.5.0** — local open model (qwen3:4b via Ollama, one generic slot;
  loopback-only ENFORCED). First-ever live LLM run. `src/llm/local-provider.ts`.
- **v0.6.0** — explainable graph review: per-field plain-English meanings +
  consequences (field-copy.ts is the single copy source), per-card confirm
  gate, plausibility warnings (engine/plausibility.ts), jurisdiction junk
  filter. intake-flow.md §15.
- **v0.7.0/0.7.1** — provenance quotes mechanically verified as substrings
  (fabricated → guessed → mandatory questions); ANSWERS NOW WRITE BACK as
  corrections (10th computed-never-consumed defect, found+fixed);
  questionnaire rebuilt (plain-English buttons, undo, honest counts,
  validation gate coerceAnswerValue). §16, ADR-IF-R6-1..3.
- **v0.8.0/0.8.1** — jurisdictions confirmed never assumed (panel + gate,
  §17); vendor API key UI REMOVED — one generic model slot (user decision).
- **v0.9.0** — similar decided cases (engine/precedent.ts, appetite
  vocabulary, "precedent informs, the rules decide", §18); 'inform' action
  type; CI enabled; code-review-004 + first doc review, ALL findings fixed;
  judge-001 ran (1/11 — schema field-order artifact, reason-first rerun is
  the recorded next step, FN-009); 15-case domain sweep (test/sweep-001.md).
- **Docs**: README rebuilt for first contact (worked example, moat block,
  component map); docs/policy-to-yaml.md conversion guide; per-jurisdiction
  regulatory tripwires (design-vision, private) + FN-010; EU pack reviewed
  2026-08-17 (quotes verbatim, Art 50 live law); MAS pack deliberately
  deferred to final Guidelines (consultation stage).
- **In flight at handover time**: delta code review (post-004 code) + first
  DESIGN review (is the accumulated review screen still one screen?) — the
  design findings are expected R9 material alongside FN-010.
- **Requirements rounds 004–008 all built, 100% traced at birth.**
- **v0.10.0/0.11.x since**: R9 review-screen recomposition (design-review
  driven); IB portfolio seed (16 cases, 1LoD→2LoD chains, one-click, live);
  two cases app-driven end-to-end which exposed + fixed the form path's
  missing use_case_created event. **R10 agreed, not built** (see
  design-vision competitive note): challenge-memo export, inherent/residual
  vocabulary, design/operating control effectiveness. User has more ideas
  incoming — bundle before building.
- Gotchas added since: reasoning models + schema-forced decoding loop
  (/no_think + num_predict guards); GitHub workflow-scope needed for CI
  pushes (granted 2026-08-17); preview-pane profiles lose localStorage.

## What this product is

**AIGate — AI risk appetite as code, for banks.** An AI use case is described
as a data-flow graph; the firm's risk appetite is a set of executable rules
over that graph; a **deterministic engine** (no LLM in the decision path,
ever) returns a verdict — inside appetite / inside with a named minimal
control set / outside — with the rule, the regulatory citation and the human
sign-off behind every step. Register, 2LoD sign-off, append-only audit trail.

The three differentiators, in the product's own order: **deterministic, not
generative** (same answers → same verdict, asserted byte-identical by test);
**it refuses to fabricate** (provisional-until-signed, UNVERIFIED-never-blank,
packs deleted rather than shipped on unread sources); **every obligation is
traceable** (158/158 acceptance criteria carry the id of the test that proves
them).

**The one distinction that unlocks user confusion** (the user themselves hit
it): *the app is never rule-less; it is authority-less until a human claims
it.* Complete starter ruleset works out of the box; adoption removes only the
provisional stamp. And the three sign-offs: pack sign-off (once per
regulation), translation attestation (once), 2LoD (per case — the only
recurring one). First two = one afternoon, once.

- Repo: https://github.com/oza977-max/ai-raf-precheck — **PUBLIC**
- Live: https://oza977-max.github.io/ai-raf-precheck/ (gh-pages;
  `npm run publish-site` republishes; **the browser caches index.html — always
  hard-reload after publishing before concluding anything is broken**)
- Engine island rules, twins discipline, gotchas: `CLAUDE.md` (still accurate)

## State right now

| | |
|---|---|
| Tags | v0.1.0 → **v0.4.0**, all pushed. Doc commits after the v0.4.0 tag are on main, untagged (round-4 requirements/test-cases + doc sweep; README diagram update) |
| Tests | **471 passing**, 46 files; ritual = `npm test` ×3, `npx tsc --noEmit`, `npm run build`, `python3 scripts/spec-parity-check.py`, live browser walk |
| Release verdict | **Ship-ready** — verification 006 (`test/test-006.html`), first ever. VV-2(a) passed on 158/158 traceability; OQ-5 manual-gate applied (no CI exists) and the **user chose ship**, caveat on the record |
| Working tree | clean, pushed |

## What this session did (v0.1.0 → now), compressed

1. **Released v0.1.0** (first tag), docs (README fix, CHANGELOG, user guide),
   published site. Then the user started *using* it — and almost everything
   good after that came from their five-minute findings, not from reviews.
2. **v0.1.1** — user: "no back option." STEP_BACK bounded at the attestation;
   stepper's fake-clickable ✓ made real. **v0.1.2** — self-hosted fonts (zero
   external requests), responsive ≥~375px, track_floor spec-drift closed, four
   property tests written (fast-check; both first drafts passed vacuously —
   anti-vacuity guards added).
3. **v0.2.0** — user: "decision type too specific." "Something else — describe
   it" + third provisional reason `unclassified_decision_type`; free text
   never silently matches. **v0.2.1** — user: "business user won't understand
   the verdict." "What you need to do" panel, controls by name, fragile-
   invariants named, expiry framing. **v0.2.2** — 158/158 traceability
   close-out (found `living_status` computed-but-never-rendered — 9th instance
   of that defect class); banner stopped blaming legal ("Waiting on:" derived
   from the chain's own sign-offs). **v0.2.3** — reviewer note at attestation
   (free text where a HUMAN reads it; closed vocabularies stay closed, that's
   the control). **v0.3.0** — About screen, first-visit card, regulator brief
   (docs/regulator-brief.md), glossary.
4. **Hostile user walkthroughs** (the most productive thing in the session):
   **v0.3.1** — contradiction check was unreachable on the form path (zero
   questions → skip), resolution dead-ended, resolution text evaporated
   (three layers deep — state shape dropped it). **v0.3.2** — duplicate check
   matched against 3-word labels so identical descriptions passed unseen (now
   stores + matches descriptions; legacy entries name-only); Back could walk
   a correction into a blank-draft identity change (now refused at the
   correction's entry step).
5. **Transparency sweep**: the LLM path (description→graph) has **never run
   against the live API** (user's key limits) — now disclosed in all 7 places
   incl. the README mermaid diagram. **Adversarial check** (user sent
   arXiv:2501.18837 constitutional classifiers + haizelabs/llama3-jailbreak):
   architecture holds (no LLM in decision path = nothing to jailbreak into a
   verdict; schema-forced edges; human confirms), one gap fixed — the
   reasoning trace now labels itself non-authoritative ("the panels win").
6. **Docs for first-timers** (user request): rules-vs-authority + three
   sign-offs added to About, user guide, glossary, README. Mermaid flow +
   rules-provenance diagrams in README (render-verified before commit).

## RESOLVED (2026-08-16): the open thread became v0.4.0

The question below was answered and built in the next session. What happened:

1. **arXiv:2502.18018 fetched and verified**: it is Haize's "Verdict: A
   Library for Scaling Judge-Time Compute" (Kalra & Tang) — modular judge
   units (verify/debate/aggregate), small composed judges matching much
   larger ones. Together with j1-micro it *validates* the dissent-panel
   idea: rubric-per-rule panels, tiny judges that can run inside a bank's
   estate.
2. **Decision: build the deterministic half, design-note the LLM half.**
   No working API key → judge code would ship "built, never run live" a
   second time. The design lives in `specs/forward-notes.md` **FN-009**,
   including the first step for whoever gets a key (re-run the oracle
   rounds through a real judge against the eleven pinned cases, get a
   dated concordance number, before any UI).
3. **v0.4.0 shipped — the rule-improvement queue** (tagged, pushed, live):
   - `rule_dissent_filed` audit event (`src/store/types.ts`); "Challenge a
     rule…" on the 2LoD sign-off page (`RegisterDetail.tsx`) — picker
     offers the rules THIS verdict relied on, from its persisted
     explanation; free-typed references stored unresolved (no label);
     verdict_id threaded from the render (§13.4 discipline).
   - "⚑ Rule challenges" screen (`RuleImprovementQueue.tsx`) — derived by
     scanning the audit trail (never a second store), grouped by rule,
     states its advisory posture on the page.
   - **The load-bearing property, asserted by test (TC-R4-RC-2-01): filing
     writes exactly one event and changes NOTHING else.** No lifecycle
     move, no sign-off, no verdict mutation. The moment a dissent can move
     a decision it is an override channel — that is the one thing this
     must never become.
   - 17 new tests (471 total), all carrying TC-R4-* ids.
4. **Doc sweep — the feature reaches every document**: round-4 requirements
   (`requirements/requirements-004.md`+.html, R4-RC-1..6 / R4-NF-1..2) and
   test cases (`test-cases/test-cases-004.md`+.html, 15 cases, 100%
   traceability at birth); user guide, glossary (2 entries), regulator
   brief, approach.md (§5 subsection: the queue keeps the corpus
   calibrated after launch), tester guide (adversarial charter: try to
   make a challenge move a decision), About screen (reserved-word guard
   respected), README prose + **both mermaid diagrams** (dashed advisory
   exit on the flow; feedback loop into both rule sources on the
   provenance diagram — render-verified via `public/__mcheck.html`
   pattern before commit, file removed after).
   The verdict-audit.html twin's §4.3 was already a stale generation
   (camelCase/hash-chain era) — it got a **drift notice** pointing at the
   .md as authoritative rather than a fake sync.
5. **Traps dodged, worth knowing**: the dissent form's name field is
   labelled "Filed by", not "Your name" — the sign-off bar already has a
   "Your name" input and duplicate labels broke label queries (and are a
   screen-reader problem). The dissent block has its own `useRef` in-flight
   guard, separate from the sign-off's, so neither blocks the other.
   `findByRole('alert')` is ambiguous on the sign-off page (VerdictDisplay
   renders one) — match refusal messages by text.

**Still deliberately open** (recorded in requirements-004 §6): resolving/
closing a challenge (deferred until the rule authors' real workflow is
observed); LLM judges (FN-009); "+ New pre-check" reset; CI; stale code
review.

## The original OPEN THREAD (superseded — kept for context)

User asked: *"anything we can add as a feature or improve from these?"*
- https://github.com/haizelabs/j1-micro — fetched: tiny (0.6B/1.7B) judge
  models, rubric-first ("Self-Principled Critique Tuning"), inference-time
  compute > model scale.
- https://arxiv.org/abs/2502.18018 — **NOT yet fetched** (likely Haize's
  "Verdict" judge-time-compute library; verify, don't assume).

The standing idea to evaluate against them (from earlier session discussion):
an **advisory dissent panel** — LLM judges evaluate a case blind against the
rulebook; disagreement NEVER overrides, it files a dissent → rule-improvement
queue. The session already ran this by hand as "oracle rounds"
(reviews/calibration.md, 31/31 concordance round 2). Honest constraint: user
has no working API key, so any LLM feature ships "built, never run live" like
the extraction path — weigh whether to build vs design-note it. Answer the
user's question first thing.

## People & near-term intents

- **Gerard** (GVM methodology author) will test — send tester-guide +
  try-these; his charter: "a verdict you'd argue with beats any bug."
- **Conor** (top finance IT/AI expert) — send README + regulator-brief +
  approach; his charter: (1) is deterministic-first right or about to age
  badly, (2) where does this die in a real bank IT estate, (3) what's
  missing. Cover-note drafts were given in-session; user sends them.
- User's essay ("Words Are a Menu. The World Is Not." — world models; the
  judge/governance gap; MRM as the missing institution) — local file, NOT in
  repo. One agreed sharpening: SS1/23's tech-agnostic definition already
  captures learned simulators (PRA already asks; the field doesn't know) —
  verified against the engine. Do NOT force-fit AIGate↔essay links; the user
  called that out once already.

## Open items (all recorded, none blocking)

- "+ New pre-check" doesn't reset a completed flow (changelog v0.3.2, known).
- No CI — the OQ-5 caveat on Ship-ready; ready-made workflow in docs/.
- Code review stale (code-review-003 predates ~7 feature rounds; stopping
  rule suspended reviews). Doc review never run (recorded in RELEASE-NOTES).
- FN-005 (condition can't scope to node type), FN-007 (spec-parity can't see
  code — how track_floor drift survived), FN-008 (unreproduced 1-test flake;
  capture full output on first occurrence next time).
- LLM edge paths never live-exercised; whoever first gets a key should run
  the plain-language path and convert "never run live" into a dated first run.
- Optional: GitHub Support scrub of orphaned commit 6e0de60 (see below).

## Hard rules & lessons paid for in this session

1. **Confidentiality is absolute** (public repo): no employer name, no
   internal figures, street-generic teams. **Leak incident 2026-08-15**:
   stale remote branch `review-fixes` still exposed design-vision.md after
   the July history purge — branch deleted, sweep clean; lesson in memory
   (`repo-public-and-rewrites.md`): after any purge, sweep EVERY remote ref.
   Strategy stays in gitignored `design-vision.md`; public repo = what it
   does, private = why it wins.
2. **The reserved-words trap fired FOUR times**: any rendered string matching
   /approved|rejected/i breaks the suite's single-match guard — including
   substrings ("board-approved"!). Say "inside/outside appetite", "signed off
   at board level". About surfaces carry a pinned guard test.
3. **`npm test`, never bare `npx vitest`** (Node webstorage). Full ritual
   before commit; run suite ×3.
4. **Hostile user-walking finds what 450 green tests cannot** — every defect
   since v0.1.0 lived in gaps BETWEEN correct components (check that runs on
   a path nobody takes; exit into a room with no door; note written into
   state that's discarded; matching against labels while tests used
   sentence-shaped fixtures). Friendly fixtures hide wiring gaps.
5. **Green is not evidence** — mutation-check new tests (both property tests
   and the attestation-boundary guard only earned trust red/green).
6. **Twins & generated docs**: specs/docs .md+.html drift silently
   (parity-check reads only .md); test-cases twins carry drift notices;
   regenerate user-guide/glossary twins after edits (haiku subagent pattern).
7. **Verify mermaid renders before committing** (public/__mcheck.html
   pattern); verify fonts/artifacts by network tab, not by assumption.
8. **NARRATE.** The user explicitly said: "just coz you are auto doesn't mean
   you don't tell me." Tell them what you're doing as you do it. They also
   want recommendations, not option menus — but genuine forks (like OQ-5) are
   theirs: ask, one question, recommended option first.
9. User is non-technical on git — handle all mechanics, commit+push at
   milestones, publish-site after app-visible changes.

## Where deeper context lives

| Need | Read |
|---|---|
| Product gotchas, boundaries, house rules | `CLAUDE.md` |
| Current release verdict + walk evidence | `test/test-006.html` |
| Review/verdict history | `reviews/calibration.md` (rounds 1–6) |
| What each release changed, user-voice | `CHANGELOG.md` |
| The eleven demo cases, all pinned | `docs/try-these.md` + `src/engine/try-these.test.ts` |
| First-timer explanations | About screen, `docs/user-guide.md`, `docs/glossary.md`, `docs/regulator-brief.md` |
| Owed decisions & lessons | `specs/forward-notes.md` (FN-001…FN-009; FN-009 = the dissent-panel design + first step when an API key exists) |
| The rule-challenge feature's contract | `requirements/requirements-004.md` + `test-cases/test-cases-004.md` (written against the build, 100% traced) |
| Standing user rules, leak record | `~/.claude/projects/-Users-kshitijoza-RAF/memory/` |
