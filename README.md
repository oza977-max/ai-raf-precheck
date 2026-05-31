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
