# AIGate — Site Survey 003

**2026-08-31 — AI-Engineering-Fundamentals + "What Are We Not Pre-Detecting" Audit**

> Requested by the owner after reading an AI-engineering-skills essay (five
> pillars: full-stack, data management, system architecture,
> security/reliability, production readiness) alongside source material on
> the August 2026 Hugging Face rogue-agent incident at OpenAI. Scope: audit
> AIGate against the five pillars, and — the owner's explicit addition —
> identify what AIGate is not yet pre-detecting, at the build/dev-practice
> level and at the product/domain level. **Diagnosis only; no code changed.**
> Findings feed the V2 backlog the owner has deliberately not started yet.

---

## 1. Executive Summary

AIGate is a **Coherent** codebase (see §4) — one architecture, applied
consistently, for 254 commits by a single committer. The five-pillars audit
finds the current client-side-only, no-backend, no-production shape is an
**appropriate simplification for what this product is today** (a demo/pilot
tool, not a live production system), not a corner cut. Nothing here blocks
continued work at the current scope.

Two real gaps surfaced under the owner's explicit "what are we not
pre-detecting" lens (§6), both grounded in evidence, neither hypothetical:

- **Build/dev-practice**: `scripts/publish-site.sh` force-pushes straight to
  the public `gh-pages` branch with **no CI gate between the decision to
  publish and the live public site**. `main` has no branch protection.
  There is no secrets-scanning or dependency-audit step in CI.
- **Product/domain**: AIGate's own hard-line rules (`policy/appetite.yaml`)
  gate agentic systems with *binding decision authority* (HL-006), but the
  intake form's `decision_type` vocabulary has no category for
  infrastructure/system-access/deployment AI — the shape of use case the
  Hugging Face incident represents. A bank using AIGate to pre-check that
  kind of system could go through intake without ever being prompted to
  name it that way.

Neither finding requires action today — the survey's job is naming them, not
fixing them. **Route recommendation (§10): file both as V2 backlog items,
route through `/gvm-requirements` when V2 starts.** Do not fix piecemeal now.

---

## 2. Codebase Profile

| | |
|---|---|
| Language | TypeScript (React 19, Vite, no backend) |
| Size | 31,689 lines across `src/*.ts`/`*.tsx` |
| Tests | 77 test files, 692 tests (per this session's own `npm test` runs) |
| Commits | 254, single committer (`oza977-max`) |
| Dependencies | 8 runtime (`@anthropic-ai/sdk`, `idb`, `js-yaml`, `react`, `react-dom`, `uuid`, `zod`, `zustand`), 13 dev |
| `npm audit` | 0 vulnerabilities at any severity (checked live, this survey) |
| CI | GitHub Actions, `.github/workflows/ci.yml` — runs on push/PR to `main`: `npm test`, `tsc --noEmit`, `npm run build`, `scripts/spec-parity-check.py` |
| Deployment | GitHub Pages, `gh-pages` branch, published via local `npm run publish-site` (§6.1 — not part of CI) |
| Storage | Client-side only — two IndexedDB stores (`aigate-audit`, `aigate-register`), confirmed empty `localStorage`/`sessionStorage` on the live site (checked via `indexedDB.databases()` this session) |

Single committer across 254 commits means the standard "code review catches
what one person misses" mechanism has never applied here by construction —
worth naming plainly rather than treating as an oversight (§6.1).

---

## 3. Architectural Map

Already self-documented in `specs/cross-cutting.md` §7 and enforced by
convention (not tooling) at four boundaries, confirmed present in the code
this session touched directly:

1. `src/engine/*` — pure island. No React, no `idb`, no SDK, no `Date.now()`,
   no `Math.random()`, no I/O anywhere in its call graph.
2. `src/llm/*` — the only place the Anthropic SDK is imported.
3. `src/store/*` — persistence-only (IndexedDB via `idb`), no evaluation
   logic, no React.
4. `src/components/*` — presentation-only, calls engine/store functions,
   never inlines business logic.

This session's own work (`src/components/RegisterDetail.tsx`,
`src/components/VerdictDisplay.tsx`, `src/store/types.ts`,
`src/store/audit.ts`) is consistent with all four boundaries — no
cross-boundary import was added while building the hash-chained audit trail
or the completion-tracking feature.

**Data flow**: use case → `engine/evaluate()` (pure, deterministic) →
`Verdict` → `store/audit.ts` (`append()`, hash-chained, `IndexedDB`) →
`components/*` render. No network calls in the decision path — the About
page states this as a security property ("no model in the decision path,
so there is no model to jailbreak into a verdict"), and this survey's
network-request check on the live site (read-only, this session) found no
external calls beyond the GitHub Pages asset bundle itself.

---

## 4. Health Scorecard

| Dimension | Score (1–5) | Evidence |
|---|---|---|
| Coherence | 5 | Four boundaries stated in `specs/cross-cutting.md` and observed intact across every file this session touched |
| Currency | 4 | React 19, Vite, modern TS; no legacy async patterns found |
| Testability | 5 | 692 tests, engine is pure functions (trivially testable), `fake-indexeddb` isolates store tests |
| Modularity | 5 | Boundary rule enforced by convention and, per this session's own edits, held without exception |
| Documentation | 5 | `CLAUDE.md`, `specs/*`, inline rationale comments throughout — an unusually well-documented codebase for its size |
| Dependency Health | 5 | 8 runtime deps, all current, `npm audit` clean |
| Usability (UI present) | 4 | Strong copy discipline (NF-2 honesty rule), but this session's own exploratory testing (explore-010, in progress) found a real navigation defect — browser Back does not return to the register list, because the app never calls the History API (§6, Risk Areas) |

**Scenario: Coherent.** High coherence, balanced scores, one architecture
applied consistently by one committer with strong documentation discipline.
No drift, no bolted-on modules, no competing patterns.

---

## 5. Diagnosis

Coherent codebases route new work straight through extension of the
existing pattern (§10) — there is no remediation debt to clear first. The
five-pillars audit below is organized as **applies now** vs **would need
answers before V2**, per the owner's explicit framing.

### 5.1 Full-stack basics

**Applies now**: React component architecture, state management (React
state + `zustand` where used), form design (the 19-question guided intake,
`src/components/IntakeFlow.tsx`), accessibility basics (native `<details>`,
`<label>` associations — confirmed via this session's `read_page`
accessibility-tree checks on the live site).

**Does not apply yet, correctly**: authentication (there is none — the
role selector is a stated "view preference, not a permission," and the
About page says so explicitly), session management, server-side API design.
These are not gaps — a client-side, no-sign-in demo has no server to design
an API for.

**Would need real answers before V2**: the moment V2 introduces a
`model_version_changed` event with any server-side trigger (per
`strategy/post-deployment-positioning.md`), authentication and API design
stop being "doesn't apply" and become load-bearing decisions.

### 5.2 Data management

**Applies now**: the append-only, hash-chained audit trail
(`src/store/audit.ts`) is a genuinely considered data model — write-queue
mutex for concurrency safety, `verifyChain()` for tamper evidence, explicit
about what it cannot prove (tamper-*proof*, not just tamper-*evident*,
requires an external anchor V1 does not have — stated on the live product
itself, not just in docs).

**Genuine risk, not merely a simplification**: all case data — including
category fields like "personal details of clients" that the intake form
itself asks about — lives **only** in the submitting user's own browser
IndexedDB. Clearing browser data destroys the record permanently; nothing
on the live product warns of this. For a demo this is an acceptable
tradeoff. For anything closer to a real records-retention obligation
(§5.4), it is a genuine gap, not a stylistic one — flagged here as new,
this survey found no prior mention of it in `design-vision.md` or
`CLAUDE.md`.

**Would need real answers before V2**: any monitoring/re-evaluation
feature needs a data model for "this event happened to a model already in
the register" — the re-evaluation queue exists today
(`re_evaluation_queued` event type) but nothing currently *originates* such
an event from outside the app itself.

### 5.3 System architecture

**Applies now**: the four-boundary convention (§3) is the whole
architecture, and it is well-suited to what this product is — deterministic
evaluation, append-only audit, presentation. No premature microservices, no
over-engineered abstraction.

**Would need real answers before V2**: "the right architecture is a moving
target" (the owner's pasted essay's own words) applies directly here — a
`model_version_changed` trigger implies *something* outside the browser
tab knows a model changed, which the current architecture has no place for.
This is exactly the kind of decision `/gvm-requirements` + `/gvm-tech-spec`
exist to make deliberately, not the kind to back into.

### 5.4 Security & reliability

**Applies now, and done well**: `npm audit` clean; no secrets committed
(checked via `git log --all` for `.env`/`secret`/`credential` filenames
this session, found none); no external network calls beyond static asset
hosting; the "no AI in the decision path" design is stated as a deliberate
security property, not an accident.

**Genuine gap, not a simplification — see §6.1**: no branch protection on
`main`, no secrets-scanning step in CI, no CODEOWNERS, and — the sharpest
finding — the publish step that puts code on the live public internet has
**zero automated gate**, run entirely by local script invocation.

### 5.5 Scaling & production readiness

**Does not apply yet, correctly**: there are no real users, no load, no
uptime commitment, no incident process — because there is no production
deployment in the sense the essay means it (a static GitHub Pages site with
zero backend has no server to scale). Not a gap; a fact about what this
product is today.

**Would need real answers before V2**: the moment V2 introduces any
server-side component (even a lightweight webhook receiver for
`model_version_changed`), the full SDLC list from the essay — deployment
environment, release strategy, CI/CD, observability, incident handling —
goes from "not applicable" to "day one requirement."

---

## 6. Risk Areas — "What Are We Not Pre-Detecting" (owner's explicit lens)

Kept separate from §5's general fundamentals findings per the owner's
instruction — these are specifically about detection gaps, not general
code quality.

### 6.1 Build/dev-practice level — **Important**

**Finding**: there is no gate between an agent's (or any committer's)
decision to publish and the live public site going live.

Evidence, read directly this session:

- `.github/workflows/ci.yml` runs `npm test`, `tsc --noEmit`, `npm run
  build`, and `scripts/spec-parity-check.py` — but only on `push`/`pull_request`
  to `main`. It does not run on, gate, or even observe a publish.
- `scripts/publish-site.sh` builds `dist/` locally and runs
  `git push -q -f origin gh-pages` — a **force push**, run by whoever (or
  whatever agent) executes `npm run publish-site` locally. Nothing between
  the build and this push re-checks anything.
- `gh api repos/oza977-max/ai-raf-precheck/branches/main/protection`
  returned `404 Branch not protected` (checked live, this session) — `main`
  itself accepts a direct push with no required review or status check.
- No secrets-scanning tool (gitleaks, trufflehog, or equivalent) appears in
  CI or as a pre-commit hook. `git log --all` search for `.env`/secret/
  credential filenames found none committed — clean today, but nothing
  mechanically prevents a future one.
- No `CODEOWNERS` file exists.

**Why this is the real parallel to the incident the owner flagged**: the
Hugging Face incident's structural shape (per the owner's source list —
not independently verified by this survey, no article was fetched) was an
autonomous agent with broad system access acting with no gate before
consequence. AIGate's own dev workflow has exactly one place where that
shape exists: Claude Code, in this repo, has filesystem, git-push, and
publish-site execution access, and nothing *mechanical* stops a bad build
from reaching the public internet — only the verification ritual in
`CLAUDE.md` (`npm test` ×3, `tsc`, `build`, spec-parity, live walkthrough),
which is a **process** followed by an agent, not a **gate** enforced
independently of the agent.

**This is not a hypothetical dressed up as a finding**: `docs/github-pages-
workflow.yml` already exists in the repo, unused, as a written-down "proper
fix" (an Actions workflow that would rebuil on every push instead of a
local force-push) — its own comment in `publish-site.sh` says installing it
"needs a token with `workflow` scope, so until then, run: `npm run
publish-site`." The gap was already identified by a prior session and
deliberately deferred, not missed.

### 6.2 Product/domain level (dogfooding self-check) — **Important**

**Finding**: AIGate's own rulebook has a hard line for agentic systems with
*binding decision authority*, but no vocabulary for agentic systems with
*broad system/infrastructure access* — a materially different risk shape,
and the one the Hugging Face incident represents.

Evidence, read directly from `policy/appetite.yaml` this session:

```yaml
- id: "HL-006"
  description: "Agentic system holding binding decision authority at full autonomy"
  condition:
    model_type: { in: ["agentic"] }
    autonomy_level: { gte: 4 }
    decision_bindingness: { in: ["binding"] }
  reason: "An agent that both chooses its own actions and binds the firm to
    them has no point at which a human ratifies the decision."
  regulatory_basis: "SR 26-2 §III.C (agentic AI); OSFI E-23 §4.3"
```

HL-006 fires correctly for the business-decision shape it names — a
lending, trading, or pricing agent acting fully autonomously. It does
**not** obviously fire for a *coding or infrastructure* agent: the
intake form's `decision_type` field (read from `src/components/IntakeFlow.tsx`'s
guided form, confirmed live on the published site this session) offers:
`credit-decision`, `lending-decision`, `fraud-detection`, `trading`,
`pricing`, `hiring`, `regulatory-reporting`, `operational`, or
`something-else — let me describe it`. None of these is named
"infrastructure access," "deployment," or "system credentials." A bank
employee pre-checking "an AI coding agent with push access to our
production systems" would most naturally reach for `operational` — a
generic bucket that does not itself prompt anyone to think about the
autonomy/binding-authority combination HL-006 is built to catch, unless
they separately, correctly classify the agent's *output* as `binding` (a
business-decision term) rather than, say, `execute` (which reads more
naturally for "it does the deployment").

**This is a real gap, not a fabricated one**: the schema has no field
capturing "scope of system/credential access" at all — not data
sensitivity (already asked), not autonomy level (already asked), but
literally *what can this thing reach and touch*. That is the dimension the
incident's own reported shape turns on, and it is currently invisible to
AIGate's own intake form.

**Scale of the gap**: this is one missing vocabulary term and possibly one
new hard-line condition, not an architectural rewrite. It fits cleanly
into V2 scope (a new `decision_type` value plus, potentially, a new hard
line analogous to HL-006 but keyed on system-access scope rather than
business-decision bindingness) — flagged here, not designed here.

---

## 7. Diagnostic Experts Used

| Expert | Role | Cited in diagnosis? |
|---|---|---|
| Refactoring specialist (`domain/refactoring.md`) | Pattern recognition | Confirmed Coherent scenario — no refactoring signal found |
| Legacy-code specialist (`domain/legacy-code.md`) | Legacy assessment | Confirmed high testability, no characterisation-test smell |
| Data-intensive specialist (`domain/data-intensive.md`) | Data layer diagnosis | Grounded §5.2's assessment of the hash-chained audit trail and the browser-storage retention gap |
| Service-boundary specialist (`domain/service-boundaries.md`) | Boundary assessment | Grounded §3's four-boundary confirmation |

This survey ran in single-context mode (§Context Window Management) — the
codebase is well within the size where per-module fan-out is unnecessary,
and this session already held deep, freshly-verified context on the exact
files touched (`RegisterDetail.tsx`, `VerdictDisplay.tsx`, `store/types.ts`,
`store/audit.ts`) from the work immediately preceding this survey.

---

## 8. Expert Coverage Assessment

No new domain gap requiring expert discovery — this survey's two novel
findings (§6) are evidence-based facts about specific files (CI config,
policy YAML, intake form), not judgment calls needing a named framework.
The existing Tier-1/2 roster (architecture + the four domain specialists
above) covers the ground this survey needed.

---

## 9. Recommended Project Experts

| Expert | Work | Tier | Classification | Reference file | Status |
|---|---|---|---|---|---|
| (unchanged from prior surveys — this survey did not add or rescore any expert) | | | | | Existing |

No roster change from `site-survey-002`. This survey is a diagnostic
add-on, not a re-scoping of the project's expert panel.

---

## 10. Route Recommendation

**Work type**: neither a user-facing feature nor a targeted fix — this is
a **diagnosis feeding a future requirements round**, per the route matrix's
"technical remediation" row, except there is no remediation debt (§5
found none). The two §6 findings are genuinely new information, not
existing debt.

**Recommendation: do not route anywhere immediately.** Per the owner's own
framing this turn ("we will build [this] ongoing as version 2") — both §6
findings should be filed as V2 backlog items and routed through
`/gvm-requirements` when V2 requirements work actually starts, alongside
`strategy/post-deployment-positioning.md`. Fixing either piecemeal now
would be exactly the kind of un-scoped, un-reviewed change the §6.1 finding
itself warns against — a CI/branch-protection change and a policy-schema
change both deserve the same deliberate process as any other feature, not
a fast follow-up patch.

**One exception worth flagging separately, not acting on unprompted**: §6.1
identifies a specific, small, well-scoped fix (enabling the pre-written
`docs/github-pages-workflow.yml`, requiring a `workflow`-scope token) that
is arguably NOT V2 scope — it is hygiene on the *existing* product, not a
new capability. This survey names it; whether to treat it as an
immediate small fix or bundle it into V2 is the owner's call, not this
survey's.

---

## 11. Open Questions

- Whether the Hugging Face incident's actual technical mechanism matches
  this survey's "broad system access, no human checkpoint" characterisation
  — this survey did not fetch or read any of the owner's cited source
  articles, per scope (a site survey is static analysis of *this*
  codebase, not external research). If the actual incident mechanism
  differs materially, §6.2's proposed new hard-line dimension should be
  revisited before being scoped into V2 requirements.
- Whether "operational" as a `decision_type` value should simply be split,
  or whether a wholly new field (system/credential access scope,
  orthogonal to `decision_type`) is the more honest fix — this is a schema
  design decision for `/gvm-requirements`, not resolved here.
- Whether the owner wants the GitHub Pages Actions-workflow fix treated as
  immediate hygiene or bundled into V2 (§10).
