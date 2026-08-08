# AIGate

**AI risk appetite as code, for banks.**

A bank's board approves a Risk Appetite Framework as prose. AIGate turns it into executable rules — and turns AI use-case approval from a months-long, multi-hundred-question committee process into a deterministic pre-check that returns a verdict in minutes: **approved / approved with these controls / rejected**, with the exact regulatory reasoning on record.

Describe the AI use case (plain language or a short structured form). AIGate maps it to a data-flow graph, evaluates it against the firm's machine-readable appetite plus jurisdiction packs (SS1/23, EU AI Act, SR 26-2, DORA), and returns:

- a **verdict with its "why"** — which rule set the tier, which invariant tripped, each with its regulatory citation;
- the **minimal control set** that brings the use case inside appetite (solved, not suggested), each control carrying a VERIFIED/UNVERIFIED evidence status;
- a **regulatory reasoning chain** quoting the verbatim source text, the basis of the rule drawn from it, and the human sign-off behind every jurisdictional rule that fired;
- **standing conditions** — the operating bounds the approval assumes (the verdict is a hypothesis; drift outside the bounds voids it);
- an entry in a **graph-based AI register** with a role-gated 2LoD approval workflow and an append-only audit trail of every event.

Same inputs, same verdict, every time — no LLM in the decision path. The LLM only helps at the edges (reading descriptions in, explaining verdicts out).

## What works today (V1 proof-of-concept)

The full gate, end to end: intake (LLM or form) → duplicate check against the register → graph review with corrections → targeted questions with contradiction detection → attestation → deterministic verdict → register with lifecycle governance (Low self-serves; Medium/High/Critical await 2LoD sign-off) → policy editing with automatic re-evaluation queuing → JSON export. AIGate submits itself through its own gate on first launch.

**Honest limits, stated in the UI itself**: verdicts are provisional until the firm's CRO adopts the framework and signs the pack rules; the audit trail is client-side (proof-of-concept grade — the system-of-record store is V1.5); artifact binding (reading deployment configs instead of trusting descriptions) and live post-approval monitoring are V1.5/V2.

## Run it

```
npm install
npm run dev      # app on http://localhost:5173
npm test         # 376 tests
npm run docs:rules   # regenerate docs/rules.md from the policy files
```

No backend, no database, no API key required. The whole app is a static
build (`npm run build` → `dist/`), so it can be hosted anywhere.

**It is already live** at
<https://oza977-max.github.io/ai-raf-precheck/> — served from the `gh-pages`
branch, no install needed to try it.

To republish after a change, one command:

```
npm run publish-site   # builds, then pushes dist/ to gh-pages
```

For automated deploys instead, `docs/github-pages-workflow.yml` is a
ready-made Actions workflow — copy it to `.github/workflows/` (adding it
requires a token with `workflow` scope, or use GitHub's web UI) and set Pages
source to "GitHub Actions".

The hosted page pulls IBM Plex from Google Fonts. On a network that blocks
`fonts.googleapis.com` the typography falls back to a system serif; nothing
else is affected.

Note that the built page loads as a JavaScript module, so it must be
*served* — opening `dist/index.html` from the filesystem will not work.

An Anthropic API key is optional and only enables plain-language intake,
semantic duplicate matching, and a narrative retelling of a verdict. Nothing
in the decision path uses it.

**Handing this to someone to test?** Send them
[`docs/tester-guide.md`](docs/tester-guide.md) — what to try, what to
ignore, and the known gaps — and ask them to fill in
[`backtest/capture-template.md`](backtest/capture-template.md). In the app,
**Demo data → Load sample use cases** seeds six worked examples spanning
Low→Critical and in/out of appetite, all scored by the real engine.

---

**New here?** [`docs/approach.md`](docs/approach.md) explains the thinking —
what question this actually answers, why a 200-page regulation yields two
rules, how pack sign-off works in practice and what it costs, and what the
approach honestly cannot do.

## Before you use this — read this first

AIGate works by checking AI use cases against a **Risk Appetite Framework (RAF)** — a set of rules that defines what AI risk the bank will and won't accept. Every verdict, every control requirement, every jurisdiction override traces back to a rule in that framework.

**This means AIGate is only as good as the rules you give it.**

### If your bank has a formal AI Risk Appetite Framework

You are in the best position. You translate your existing RAF into AIGate's policy file format (YAML). The engine enforces your rules consistently. Verdicts are traceable to your own documented policy.

### If your bank has some AI governance, but it's scattered

Most banks are here — a model risk policy, an AI ethics statement, some vendor guidelines, nothing unified. AIGate ships with a starter policy file derived from a regulator-grounded AI Risk Appetite template. Use it as your starting point. Customise it to reflect your actual committees, thresholds, and appetite. You are not starting from nothing.

### If your bank has no AI-specific governance yet

The starter config effectively becomes your AI risk appetite framework. It is grounded in SR 26-2 (US), SS1/23 (UK PRA), EU AI Act and DORA. Canada, Singapore and Japan are declared operating jurisdictions with no assessed pack — the starter packs for those were deleted in policy v1.3 because their rule text was illustrative and their sources were never retrieved, and a rule citing a source nobody read is worse than no rule. It is a credible, defensible starting point — but it is not your framework until your CRO or equivalent has reviewed and adopted it.

**The starter config is a template. You own what you adopt.**

Using the starter config verbatim without review is an implicit governance decision. Document that decision. The starter config includes placeholder markers (`[FIRM]`) for content your organisation must fill in — committees, thresholds, legal entity references. A verdict produced before those are filled is provisional, not final.

---

## How regulatory grounding works — and its limits

AIGate evaluates use cases against **regulatory override packs** — structured rule files for SR 26-2, SS1/23, EU AI Act and DORA. These drive jurisdiction-aware verdicts: a use case touching UK entities is evaluated against SS1/23's technology-agnostic MRM standard; one touching EU borrowers with credit-scoring characteristics triggers EU AI Act Annex III's forced-Critical classification.

**Regulations evolve. This is the hardest problem in the product.**

SR 26-2 landed in April 2026 and carved generative and agentic AI out of the model definition entirely — the US position moved, and a firm's own appetite now has to cover the gap. The EU AI Act's Digital Omnibus postponed Annex III high-risk obligations to 2 December 2027, while leaving Article 50 transparency live from 2 August 2026. OSFI E-23 comes into force 1 May 2027. Supervisory statements and implementing acts change the picture continuously. A product that encodes a snapshot of today's regulations and never updates is not a governance tool — it is a liability.

### How AIGate approaches this

**Every rule cites its primary source — the verbatim regulatory text it derives from.**

Not: *"Track II if quantitative output into a regulated decision"*

But: *"Track II — from SS1/23 §3.4: 'models that produce quantitative outputs used in material decisions require independent validation.' Basis: states the quoted text."*

This means:
- The verdict shows you the exact regulatory text behind every decision. You can verify it yourself against the source.
- When a regulation changes, only the rules citing the changed sections need review — not the whole pack.
- Every rule declares its **basis** — whether it restates the quoted text, infers from it, or rests on legal judgement. That is something a reviewer can check by reading the rule against its own citation, rather than a confidence score somebody had to invent.

**Every pack requires a human reviewer sign-off** — name, role, date — against the primary source text. Sign-off is per regulation, not per rule: Legal issues a position on SS1/23, they do not countersign each line of a config file. (A single rule can carry its own sign-off where a firm deviates from the central reading.) AIGate does not interpret regulations autonomously. A bank that tells the PRA "our AI interpreted SS1/23" does not have a defensible answer. A qualified person must stand behind every regulatory determination. AIGate makes that accountability traceable and minimal in effort: reviewers sign off only on rules citing changed text, not the whole pack every time.

**Verdicts show the full reasoning chain:** regulatory text → derived rule → verdict, with the basis of each step stated. A regulator asking "why was this Track II?" sees the SS1/23 section, the rule, and who reviewed it — not just a version number.

**When a bank disagrees with the central interpretation**, they can override locally — but they must cite the competing text and record their reasoning. Silent overrides are not permitted.

**What this does not solve:** genuine legal ambiguity. When regulatory text is contested, AIGate marks the rule `judgement`, renders the verdict provisional, and routes to the bank's legal team. It does not pretend to resolve what qualified lawyers disagree about. That is the honest boundary of what a tool can do.

---

## What AIGate does not do

- It does not write your risk appetite for you. It enforces the one you give it.
- It does not replace InfoSec review, vendor risk assessment, cloud security approval, or FinOps sign-off. It triggers those reviews as mandatory downstream steps when a use case requires them.
- It does not monitor AI systems after deployment (that is V2 — live KRI monitoring).
- It does not catch AI systems that bypass the intake process (shadow AI discovery is V2).

---

## Getting started

1. `npm install && npm run dev`, open http://localhost:5173
2. Open `policy/appetite.yaml` — read the preamble, understand the starter rules
3. Replace `[FIRM]` placeholders with your organisation's details
4. Review the materiality tiers and adjust thresholds to match your actual risk appetite
5. Submit your first use case — `backtest/use-cases.md` has worked examples with expected verdicts, or load the six in-app samples from **Demo data**

**Using it for real?** [`docs/user-guide.md`](docs/user-guide.md) is the
task-oriented guide for a risk reader — how to read a verdict, what each
honesty marker means, how to run a sign-off, and what the tool will not tell
you.

The full requirement set is [`requirements/requirements.md`](requirements/requirements.md)
(81 requirements). Read the markdown, not the HTML twin — the HTML carries
only 55 of them and has drifted; it says so at the top.

---

## Licence

All rights reserved — published for reading and evaluation, not for
redistribution or commercial use. See [LICENSE](LICENSE), which also
explains how to open it up later if that becomes the right call.

---

## Project status

**V1 build complete, verified Demo-ready.** Engine, intake, register,
lifecycle, jurisdiction packs, audit trail — 376 tests, and the full
acceptance suite of 158 cases walked with evidence in
[`test/test-004.html`](test/test-004.html).

*Demo-ready* rather than *ship-ready* is the honest verdict, and the reason is
worth stating plainly: 76 of those 158 acceptance criteria do not carry a
trace ID, so a reader cannot get from a criterion to the test that proves it
without knowing the codebase. Coverage exists; the audit path does not. For a
product that sells auditability, that is the right thing to be held to, and it
is the first thing V1.5 closes.

V1 is an engine-validation proof-of-concept. Artifact binding and the
system-of-record audit store arrive in V1.5; live KRI monitoring against
standing conditions is V2. Built with the
[Grounded Vibe Methodology](https://github.com/gerquinn1978/gvm).

*Developed using the Grounded Vibe Methodology*
