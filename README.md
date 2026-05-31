# AIGate

**AI Risk Appetite Pre-Check Engine for banks.**

A developer describes an AI tool they want to build. AIGate asks a handful of targeted questions, evaluates the use case against the bank's risk rules, and returns a clear answer: approved / approved with these controls / rejected — with the exact reason, documented and on record.

Replaces multi-hundred-question intake forms and three-month committee cycles with a consistent, auditable verdict in minutes.

---

## Before you use this — read this first

AIGate works by checking AI use cases against a **Risk Appetite Framework (RAF)** — a set of rules that defines what AI risk the bank will and won't accept. Every verdict, every control requirement, every jurisdiction override traces back to a rule in that framework.

**This means AIGate is only as good as the rules you give it.**

### If your bank has a formal AI Risk Appetite Framework

You are in the best position. You translate your existing RAF into AIGate's policy file format (YAML). The engine enforces your rules consistently. Verdicts are traceable to your own documented policy.

### If your bank has some AI governance, but it's scattered

Most banks are here — a model risk policy, an AI ethics statement, some vendor guidelines, nothing unified. AIGate ships with a starter policy file derived from a regulator-grounded AI Risk Appetite template. Use it as your starting point. Customise it to reflect your actual committees, thresholds, and appetite. You are not starting from nothing.

### If your bank has no AI-specific governance yet

The starter config effectively becomes your AI risk appetite framework. It is grounded in SR 26-2 (US), SS1/23 (UK PRA), EU AI Act, OSFI E-23, MAS FEAT, DORA, and FSA Japan. It is a credible, defensible starting point — but it is not your framework until your CRO or equivalent has reviewed and adopted it.

**The starter config is a template. You own what you adopt.**

Using the starter config verbatim without review is an implicit governance decision. Document that decision. The starter config includes placeholder markers (`[FIRM]`) for content your organisation must fill in — committees, thresholds, legal entity references. A verdict produced before those are filled is provisional, not final.

---

## How regulatory grounding works — and its limits

AIGate evaluates use cases against **regulatory override packs** — structured rule files for SR 26-2, SS1/23, EU AI Act, OSFI E-23, MAS FEAT, DORA, and FSA Japan. These drive jurisdiction-aware verdicts: a use case touching UK entities is evaluated against SS1/23's technology-agnostic MRM standard; one touching EU borrowers with credit-scoring characteristics triggers EU AI Act Annex III's forced-Critical classification.

**Regulations evolve. This is the hardest problem in the product.**

SR 26-2 RFI will land and change the US position on generative AI. EU AI Act Annex III obligations take effect December 2027. OSFI E-23 becomes effective January 2027. Supervisory statements and implementing acts change the picture continuously. A product that encodes a snapshot of today's regulations and never updates is not a governance tool — it is a liability.

### How AIGate approaches this

**Every rule cites its primary source — the verbatim regulatory text it derives from.**

Not: *"Track II if quantitative output into a regulated decision"*

But: *"Track II — derived from SS1/23 §3.4: 'models that produce quantitative outputs used in material decisions require independent validation.' Confidence: High."*

This means:
- The verdict shows you the exact regulatory text behind every decision. You can verify it yourself against the source.
- When a regulation changes, only the rules citing the changed sections need review — not the whole pack.
- Ambiguous rules carry a confidence score (High / Medium / Low) so you know where solid ground is and where judgment is required.

**Every rule requires a human reviewer sign-off** — name, role, date — against the primary source text. AIGate does not interpret regulations autonomously. A bank that tells the PRA "our AI interpreted SS1/23" does not have a defensible answer. A qualified person must stand behind every regulatory determination. AIGate makes that accountability traceable and minimal in effort: reviewers sign off only on rules citing changed text, not the whole pack every time.

**Verdicts show the full reasoning chain:** regulatory text → derived rule → verdict. A regulator asking "why was this Track II?" sees the SS1/23 section, the rule, and who reviewed it — not just a version number.

**When a bank disagrees with the central interpretation**, they can override locally — but they must cite the competing text and record their reasoning. Silent overrides are not permitted.

**What this does not solve:** genuine legal ambiguity. When regulatory text is contested, AIGate flags the rule as Low confidence and routes to the bank's legal team. It does not pretend to resolve what qualified lawyers disagree about. That is the honest boundary of what a tool can do.

---

## What AIGate does not do

- It does not write your risk appetite for you. It enforces the one you give it.
- It does not replace InfoSec review, vendor risk assessment, cloud security approval, or FinOps sign-off. It triggers those reviews as mandatory downstream steps when a use case requires them.
- It does not monitor AI systems after deployment (that is V2 — live KRI monitoring).
- It does not catch AI systems that bypass the intake process (shadow AI discovery is V2).

---

## Getting started

1. Open `policy/appetite.yaml` — read the preamble, understand the starter rules
2. Replace `[FIRM]` placeholders with your organisation's details
3. Review the materiality tiers and adjust thresholds to match your actual risk appetite
4. Submit your first use case

Full documentation: `requirements/requirements.html`

---

## Project status

Currently in requirements and design phase. Built using the [Grounded Vibe Methodology](https://github.com/gerquinn1978/gvm).

*Developed using the Grounded Vibe Methodology*
