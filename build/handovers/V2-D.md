# V2-D — handover-ready packaging

**Goal:** make the repo something a non-developer risk practitioner can be
handed and actually test real use cases with. Not new capability — the
missing packaging around capability that already existed.

Driven directly by the user's question: *"what needs to be done for me to
give this repo to someone who can use and test real use cases"*, with the
constraint that no Anthropic API key is available.

## What changed

**1. Hosting path (`.github/workflows/deploy.yml`)**
Build → test/typecheck gates → GitHub Pages. AIGate is backend-less
(NF-3) and `vite.config.ts` already sets `base: './'`, so `dist/` is a
complete deployment. Turns "clone and npm install" into a URL.

*Blocked on token scope:* the session's OAuth token lacks `workflow`
scope, so `.github/workflows/deploy.yml` could not be pushed. The file now
lives at `docs/github-pages-workflow.yml` for the user to install via the
GitHub web UI if they want automated deploys.

*Shipped instead:* the current static build is pushed to a `gh-pages`
branch, which needs no special scope. Enabling Pages against that branch is
one dropdown in repository settings. Trade-off: the branch is a snapshot and
goes stale — it must be regenerated after changes, which the workflow would
have automated.

*Left to the user deliberately:* enabling Pages is the act that publishes.
On a private repo it needs a paid plan and makes the site public. Not an
action to take on someone's behalf.

*Correction to the specs:* NF-4 / `vite.config.ts` claim `file://`
compatibility. They are wrong — the built page loads via
`<script type="module">`, which browsers refuse to load from a `file://`
origin. Documented in the README and tester guide rather than silently
carried forward. Serving is required.

**2. Sample register (`src/seeds/sample-register.ts`)**
Six use cases, seeded on demand, **evaluated by the real engine against the
currently-loaded policy** — no fabricated verdicts, and they move if the
policy moves. Modelled on `aigate-self-assessment.ts`. Idempotent via an
existence check on stable ids; `[SAMPLE]` prefix so testers can distinguish
demo data from their own work.

Verified live spread (policy v1.0):

| Sample | Status | Tier / Track |
|---|---|---|
| Coding assistant for risk analysts | approved_with_controls | Low / III |
| Daily VaR & IRC commentary | approved_with_controls | Medium / II |
| Credit review drafting | approved_with_controls | High / II |
| Client-facing wealth chatbot | approved_with_controls → renders **Provisional** (unsigned packs, NF-7) | High / II |
| Deal memo drafting on cloud LLM | rejected (unsatisfiable invariant) | High / II |
| Autonomous credit-line reduction | rejected (hard line) | Critical / I |

Two rejections for two different reasons; four tiers; three tracks. The
`produces a genuine spread` test pins this so a future policy edit that
collapses the demo back to one repeated verdict fails loudly — this is the
regression guard for the "all verdicts look the same" problem V2-C fixed.

**3. Reset (`src/store/reset.ts` + SettingsPanel)**
Deletes both IndexedDB databases and the role key, then reloads (db.ts
caches open handles at module scope, so a reload is required, not
cosmetic). Two-step confirm; the saved API key is deliberately preserved —
it is a machine setting, not test data, and the one thing a tester cannot
re-derive themselves.

**4. Intake reframed as a mode, not a defect**
`"Structured intake mode — LLM graph extraction is not configured"` →
guided-intake wording that states the determinism property positively.
Same for the verdict page's reasoning-trace fallback: the trace is an
optional narrative over an already-complete explanation, so
`"Reasoning trace unavailable"` overstated the loss.

Both strings were **pinned in the specs** (`intake-flow.md` §5.1,
`verdict-audit.md` §7) and asserted verbatim in tests. Updated spec `.md`
*and* `.html` (parallel files, no generation link) plus 3 test files.

*Note:* the new demo-data copy deliberately avoids the words
"approved"/"rejected". SettingsPanel renders in the always-present sidebar,
and the acceptance suite uses a single-match `/approved|rejected/i` query —
"in appetite" / "out of appetite" keeps that assertion unambiguous.

**5. Docs**
- `docs/tester-guide.md` — plain-language, non-developer. What it is, the
  run-through, what to send back, and an explicit known-gaps section so
  testers don't spend the hour reporting the deliberate limitations
  (no identity, no sharing, no import, not tamper-proof, self-attested
  intake, unadopted packs).
- `backtest/capture-template.md` — predict-then-evaluate capture sheet.
  Structured around disagreements, and asks the diagnostic question that
  decides the product's future: *is the rule wrong (fixable) or was the
  wrong question asked (design problem)?*
- README: hosting, the file:// correction, API-key-is-optional, handover
  pointers.

## Verification

- `npm test` — 219 passed (was 215), **run 3× consecutively**, all green
- `npx tsc --noEmit` — clean
- `npm run build` — clean
- `python3 scripts/spec-parity-check.py` — clean (R1–R5)
- Live browser walkthrough: loaded samples (6 added, correct spread in
  register), duplicate check reported "checked 8 register entries",
  guided-intake banner renders, clear-all confirm gate → deletion verified
  by reading IndexedDB directly (only the app's own self-assessment
  re-seeds, by design)

## Still open

- **The LLM path has never run against the real API.** Only ever exercised
  against a mocked SDK. Unknown: prompt quality on real descriptions, error
  handling, cost. Do not ask a tester to exercise it before running it once
  first-hand.
- No import path — export is one-way, so testers' registers cannot be
  combined.
- Enabling GitHub Pages (and the public/paid-plan decision) is the user's.

---

# V2-E — user feedback: business language + workable sign-off

Two pieces of feedback, both acted on.

## 1. "Not very business friendly — how will they know all this?"

The form's labels were the engine's own field names (`input data class`,
`output reversibility`, `processing data zone`) and its options were raw
enum values (`Zone B`, `agentic`, `non-binding`). The data model had leaked
straight into the UI.

Presentation-only fix — the submitted **values** are untouched canonical
vocabulary (policy-schema.md §3.0), because that is what every policy rule
matches on. Only the words changed. Copy lives in
`src/components/field-copy.ts`; each option keeps its canonical term in
parentheses so a model-validation reader can still trace an answer back to
the vocabulary the verdict is written in.

Help text now warns about the two traps that actually produce wrong
answers: confusing where data is *stored* with where it is *processed*
(the zone-crossing rules turn on this), and understating bindingness
relative to what happens in practice.

TC-UC-3a-03 strengthened — it previously only counted options, which a
hardcoded list of the right length would have passed. It now asserts the
option **values** equal the canonical vocabulary.

## 2. "Who signed off and how confident — don't think it's practically implementable"

Assessed rather than accepted wholesale. Two of the three parts were right.

**`confidence: High | Medium | Low` → `basis: verbatim | derived | judgement`.**
The confidence grade was subjective and uncalibrated: two reviewers grade
the same rule differently, and nothing said what "Medium" obliged a reader
to do. That is fabricated precision — the one thing this product must not
produce. `basis` asks what the rule *does to its own quoted text*, which a
reviewer checks by reading the two side by side. Caveats now key off it:
`verbatim` → none, `derived` → medium, `judgement` → low/provisional.

**Sign-off moves from per-rule to per-pack.** Legal issues a position on a
regulation; they do not countersign each line of a YAML file. A per-rule
signature made adoption a task no firm would finish — leaving every
deployment permanently provisional, the exact failure the field existed to
prevent. Pack header carries the sign-off; rules inherit it. Rule-level
fields remain valid but optional, for a firm's local deviation from the
central reading (`chain[].sign_off` says which level it came from).

**What was NOT accepted:** removing human accountability altogether. Without
a named person behind an interpretation, AIGate becomes "the tool that
interprets the EU AI Act for you" — which README correctly calls
indefensible to a regulator. The principle stays; the unit and the basis
changed.

Nothing shipped was fabricated: the packs still carry `[FIRM]`/`[DATE]`
placeholders, so everything reads "pending firm adoption" — honest, and
now achievable in one act per regulation rather than dozens.

## Verification

- 225 tests (was 221), run 3× consecutively, all green
- `npx tsc --noEmit`, `npm run build`, spec parity — all clean
- Specs updated in `.md` **and** `.html` (policy-schema, intake-flow) plus
  `grounding/PACK-AUTHORING.md` and README
- Live: drove an EU credit-scoring case end to end; the chain renders
  "INFERRED FROM THE TEXT" with the plain-English explanation beneath and
  "pending firm adoption" on the sign-off line
