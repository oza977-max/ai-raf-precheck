# Every rule in AIGate

> **Generated from `policy/appetite.yaml` and `policy/packs/*.yaml` by
> `npm run docs:rules`. Do not edit by hand — regenerate after any policy
> change.** Conditions are rendered in plain English; the YAML is the
> authority.

Policy version **1.3** · 5 hard lines · 6 tracks · 4 tiers · 18 invariants · 19 controls · 7 pack rules across 4 jurisdictions

---

## 1. Hard lines — checked first, nothing can fix them

If one of these matches, evaluation stops immediately and the answer is no.
No control set changes it. Tier and track are never even assigned.

| # | When | Why | Basis |
|---|---|---|---|
| `HL-001` | autonomy ≥ 4 **and** reversible? = irreversible **and** who sees it is client-facing / market-facing | Fully autonomous irreversible action reaching a client or the market leaves no point of human control before harm is done. | SS1/23 §3.8; SR 26-2 §IV |
| `HL-002` | information type is MNPI **and** where it sits is NOT Zone C | MNPI outside Zone C violates market abuse prevention requirements. | MAR Article 8; MiFID II |
| `HL-003` | autonomy ≥ 4 **and** decision fed is credit-decision / lending-decision **and** human check = false | A lending decision taken with no human review removes the accountable decision-maker the regulation assumes exists. | EU AI Act Annex III §5(b); Consumer Credit Directive 2023/2225 |
| `HL-004` | autonomy ≥ 4 **and** decision fed is trading | Autonomous market execution can move positions faster than any human control can intervene. | RAF §5 rule; MiFID II Article 17 |
| `HL-006` | AI type is agentic **and** autonomy ≥ 4 **and** weight is binding | An agent that both chooses its own actions and binds the firm to them has no point at which a human ratifies the decision. | SR 26-2 §III.C (agentic AI); OSFI E-23 §4.3 |

## 2. Tracks — which governance route it takes

First match wins, evaluated in id order.

| # | Track | When | Basis |
|---|---|---|---|
| `TRACK-III-AGENTIC` | Track III — Agentic AI governance | AI type is agentic | SR 26-2 footnote 3 (agentic AI outside MRM scope; issued 2026-04-17, exclusion stated as temporary) |
| `TRACK-II-REPLACE` | Track II — Replaces a prior model | replaces a model = true | RAF §5 rule 3 |
| `TRACK-II-AUTONOMY` | Track II — High autonomy | autonomy ≥ 3 | RAF §5 rule 4 |
| `TRACK-III` | Track III — AI Governance | AI type is llm / generative-ai **and** weight is non-binding | SR 26-2 footnote 3 (generative and agentic AI outside MRM scope; issued 2026-04-17, exclusion stated as temporary) |
| `TRACK-I` | Track I — Traditional MRM | AI type is statistical / traditional-ml | SS1/23 §3.4; SR 26-2 §II.A |
| `TRACK-II` | Track II — AI on MRM | AI type is ml / deep-learning / llm / generative-ai | SS1/23 §3.4 (technology-agnostic); OSFI E-23 §2.1 |

## 3. Tiers — how serious it is

Impact-dominant: every trigger is evaluated and the highest tier reached wins.

| # | Tier | Any of these triggers |
|---|---|---|
| `TIER-CRITICAL` | **Critical** | decision fed is credit-decision / lending-decision / fraud-detection **or** who sees it is market-facing **or** decision fed is pricing |
| `TIER-HIGH` | **High** | who sees it is client-facing **or** decision fed is regulatory-reporting **or** autonomy ≥ 3 **or** information type is Client PII / MNPI **or** decision fed is hiring **or** weight is binding |
| `TIER-MEDIUM` | **Medium** | who sees it is internal-shared **or** autonomy is 2 **or** weight is material |
| `TIER-LOW` | **Low** | who sees it = internal-only |

## 4. Invariants — the things that must hold

Every one is checked. Each that trips is a gap the solver must close.

### `INV-DATA-01` — High

Client PII must not flow to an external model endpoint without encryption in transit

- **Trips when:** information type is Client PII **and** where it sits is Zone A / Zone B
- **Closed by:** `CTRL-ENC-01`
- **Basis:** GDPR Art. 32(1)(a)

### `INV-DISCLOSE-01` — High

A person interacting with an AI system must be told they are interacting with an AI

- **Trips when:** AI type is llm / generative-ai / agentic **and** who sees it is client-facing
- **Closed by:** `CTRL-DISCLOSE-01`
- **Basis:** EU AI Act Art. 50(1) — applies from 2026-08-02, NOT postponed by the Digital Omnibus

### `INV-SYNTHMARK-01` — Medium

AI-generated content leaving the firm must be machine-readably marked as artificially generated

- **Trips when:** AI type is llm / generative-ai / agentic **and** who sees it is client-facing / market-facing **and** what it does is draft / recommend / execute
- **Closed by:** `CTRL-SYNTHMARK-01`
- **Basis:** EU AI Act Art. 50(2) (applies from 2 August 2026)

### `INV-TRACK2-01` — High

AI model versions must be pinned and outputs monitored for silent substitution

- **Trips when:** AI type is ml / deep-learning / llm / generative-ai / agentic **and** weight is advisory / material / binding
- **Closed by:** `CTRL-FINGERPRINT-01`, `CTRL-INDEP-VAL-01`
- **Basis:** RAF §5 — Track II baseline; zero tolerance for unmonitored vendor model change

### `INV-HALLUC-01` — High

Generative output informing a material decision must be grounded in retrievable source material

- **Trips when:** AI type is llm / generative-ai / agentic **and** weight is material / binding
- **Closed by:** `CTRL-GROUND-01`
- **Basis:** RAF §9 — grounding verification mode

### `INV-CITE-01` — Medium

Generated text presented to a human must carry resolvable citations to its sources

- **Trips when:** AI type is llm / generative-ai / agentic **and** what it does is read / draft / recommend
- **Closed by:** `CTRL-CITE-01`
- **Basis:** RAF §9 — grounding minimum requirements

### `INV-AGENT-01` — High

Agentic systems must log every tool call and expose an immediate stop control

- **Trips when:** AI type is agentic
- **Closed by:** `CTRL-LOG-01`
- **Basis:** RAF §6 — agentic / tool-use controls

### `INV-AUTONOMY-01` — Critical

A system acting independently on a material or binding decision must have a human decision gate or a bounded authority envelope

- **Trips when:** autonomy ≥ 2 **and** weight is material / binding **and** what it does is execute / trade / approve
- **Closed by:** `CTRL-AUTONOMY-BOUND-01`, `CTRL-HITL-02`
- **Basis:** RAF §7 — autonomy ceiling

### `INV-AUTONOMY-02` — High

A system acting independently in front of a client must have a bounded authority envelope

- **Trips when:** autonomy ≥ 2 **and** who sees it is client-facing / market-facing **and** what it does is execute / trade / approve
- **Closed by:** `CTRL-AUTONOMY-BOUND-01`, `CTRL-HITL-02`
- **Basis:** OSFI E-23 §4.3; FCA Consumer Duty PRIN 2A

### `INV-IRREV-01` — Critical

An irreversible action taken with limited human oversight must have a reversal window before it commits

- **Trips when:** reversible? is irreversible **and** autonomy ≥ 2
- **Closed by:** `CTRL-REVERSAL-01`
- **Basis:** SS1/23 §3.8; GDPR Art. 5(1)(e)

### `INV-CONDUCT-01` — High

Client-facing and market-facing AI must be conduct-tested before launch and periodically after

- **Trips when:** who sees it is client-facing / market-facing
- **Closed by:** `CTRL-CONDUCT-01`
- **Basis:** RAF §4 — conduct & fairness

### `INV-FAIRNESS-01` — High

AI informing a decision about a person must be tested for disparate outcomes across protected groups

- **Trips when:** decision fed is credit-decision / lending-decision / hiring / pricing / fraud-detection
- **Closed by:** `CTRL-BIAS-01`
- **Basis:** EU AI Act Annex III §5(b) and §4(a); ECOA/Reg B; FCA Consumer Duty PRIN 2A

### `INV-ESCALATE-01` — High

Client-facing AI must offer a route to a human

- **Trips when:** who sees it is client-facing
- **Closed by:** `CTRL-ESCALATE-01`
- **Basis:** RAF §4 — client harm / escalation

### `INV-DRIFT-01` — High

A model informing a material or binding decision must be monitored for performance drift

- **Trips when:** AI type is statistical / traditional-ml / ml / deep-learning / llm / generative-ai / agentic **and** weight is material / binding
- **Closed by:** `CTRL-DRIFT-01`, `CTRL-INDEP-VAL-01`
- **Basis:** RAF §8 — drift signals; SS1/23 §3.4

### `INV-EXPLAIN-01` — Medium

A model informing a material or binding decision must be able to explain a single outcome

- **Trips when:** AI type is ml / deep-learning / llm / generative-ai / agentic **and** weight is material / binding
- **Closed by:** `CTRL-EXPLAIN-01`, `CTRL-INDEP-VAL-01`
- **Basis:** RAF §5 — Track II transparency

### `INV-SEC-01` — Medium

A model consuming text or documents it did not author must be adversarially tested

- **Trips when:** AI type is deep-learning / llm / generative-ai / agentic **and** who sees it is internal-shared / client-facing / market-facing
- **Closed by:** `CTRL-REDTEAM-01`
- **Basis:** RAF §9 — adversarial verification mode

### `INV-VENDOR-01` — High

A third-party component outside the firm's registry must have a third-party risk assessment

- **Trips when:** vendor is NOT internal / VENDOR-APPROVED-LLM
- **Closed by:** `CTRL-TPRM-01`
- **Basis:** DORA Art. 28-30; OSFI B-10

### `INV-SAMPLE-01` — Medium

Recommendations issued at scale must be sampled and reviewed against outcomes

- **Trips when:** what it does is recommend **and** scale is at_scale
- **Closed by:** `CTRL-SAMPLE-01`
- **Basis:** RAF §9 — behavioural verification mode

## 5. Controls — what closes a gap

The solver picks the **smallest set** that covers every tripped invariant,
preferring lower burden. Controls without evidence render UNVERIFIED.

| # | Control | Burden | Closes | Evidence |
|---|---|---|---|---|
| `CTRL-ENC-01` | Encryption in transit (TLS 1.3+) | 2 | `INV-DATA-01` | **VERIFIED** |
| `CTRL-DISCLOSE-01` | AI interaction disclosure | 1 | `INV-DISCLOSE-01` | UNVERIFIED |
| `CTRL-SYNTHMARK-01` | Synthetic content marking | 3 | `INV-SYNTHMARK-01` | UNVERIFIED |
| `CTRL-FINGERPRINT-01` | Output fingerprinting + version pinning | 2 | `INV-TRACK2-01` | UNVERIFIED |
| `CTRL-INDEP-VAL-01` | Independent validation (2LoD) | 5 | `INV-TRACK2-01`, `INV-DRIFT-01`, `INV-EXPLAIN-01` | UNVERIFIED |
| `CTRL-CITE-01` | Resolvable citations | 2 | `INV-CITE-01` | UNVERIFIED |
| `CTRL-ESCALATE-01` | Human escalation route | 2 | `INV-ESCALATE-01` | UNVERIFIED |
| `CTRL-LOG-01` | Tool-call logging + stop control | 3 | `INV-AGENT-01` | UNVERIFIED |
| `CTRL-AUTONOMY-BOUND-01` | Bounded authority envelope + sampled post-hoc review | 4 | `INV-AUTONOMY-01`, `INV-AUTONOMY-02` | UNVERIFIED |
| `CTRL-HITL-02` | Human decision gate on every action | 5 | `INV-AUTONOMY-01`, `INV-AUTONOMY-02` | UNVERIFIED |
| `CTRL-REVERSAL-01` | Reversal window before irreversible commit | 3 | `INV-IRREV-01` | UNVERIFIED |
| `CTRL-DRIFT-01` | Drift monitoring | 3 | `INV-DRIFT-01` | UNVERIFIED |
| `CTRL-EXPLAIN-01` | Single-outcome explanation | 3 | `INV-EXPLAIN-01` | UNVERIFIED |
| `CTRL-REDTEAM-01` | Adversarial testing | 3 | `INV-SEC-01` | UNVERIFIED |
| `CTRL-TPRM-01` | Third-party risk assessment | 4 | `INV-VENDOR-01` | UNVERIFIED |
| `CTRL-BIAS-01` | Disparate outcome testing | 4 | `INV-FAIRNESS-01` | UNVERIFIED |
| `CTRL-SAMPLE-01` | Outcome sampling | 2 | `INV-SAMPLE-01` | UNVERIFIED |
| `CTRL-GROUND-01` | Retrieval grounding + confidence reporting | 4 | `INV-HALLUC-01` | UNVERIFIED |
| `CTRL-CONDUCT-01` | Conduct testing + transcript audit | 4 | `INV-CONDUCT-01` | UNVERIFIED |

<details><summary>What each control actually requires</summary>

- **`CTRL-ENC-01`** — All data in transit to external endpoints must use TLS 1.3 or higher
  - _Verified by:_ Deployment manifest shows TLS 1.3 endpoint; no HTTP fallback
- **`CTRL-DISCLOSE-01`** — The interface states plainly that the person is interacting with an AI system, before the interaction begins
  - _Verified by:_ Screenshot or interface copy showing the disclosure at first contact
- **`CTRL-SYNTHMARK-01`** — AI-generated content leaving the firm is marked in a machine-readable format as artificially generated
  - _Verified by:_ Output carries provenance metadata (e.g. C2PA) detectable by a third party
- **`CTRL-FINGERPRINT-01`** — Model version pinned; outputs fingerprinted against a fixed probe set to detect silent substitution
  - _Verified by:_ Probe set and baseline fingerprints on file; alert on step-change in aggregate grounding confidence
- **`CTRL-INDEP-VAL-01`** — A validation team independent of the builders reviews the model, its limitations and its monitoring plan before use
  - _Verified by:_ Signed independent validation report naming the validator and the date
- **`CTRL-CITE-01`** — Every generated statement carries a citation a reader can open and check against the source
  - _Verified by:_ Sampled outputs show citations that resolve to the cited passage
- **`CTRL-ESCALATE-01`** — The client can reach a human at any point, and the route is visible without asking for it
  - _Verified by:_ Escalation path documented and exercised in test
- **`CTRL-LOG-01`** — Every tool call is logged with its arguments; an immediate stop control exists and permissions are least-privilege
  - _Verified by:_ Log sample showing tool calls and arguments; stop control exercised in test
- **`CTRL-AUTONOMY-BOUND-01`** — The system acts only inside a written authority envelope with hard value and volume limits, anything outside it stops for a human, an immediate stop control exists, and a defined sample of actions is reviewed after the fact against outcomes
  - _Verified by:_ Authority envelope document with limits; stop control exercised in test; post-hoc review sampling rate and results on file
- **`CTRL-HITL-02`** — Every action proposed by the AI is reviewed and signed off by a human before it takes effect
  - _Verified by:_ Workflow evidence showing no action executes without a recorded human decision
- **`CTRL-REVERSAL-01`** — The action is staged in a recoverable state for a defined window, reconciled, and only then committed; a dry-run mode exists
  - _Verified by:_ Window length documented; a reversal exercised end-to-end in test; reconciliation report on file
- **`CTRL-DRIFT-01`** — Model performance is monitored against the KRI thresholds in this file, with a named owner for breaches
  - _Verified by:_ Monitoring dashboard and breach escalation history
- **`CTRL-EXPLAIN-01`** — For any individual output the system can produce the factors that drove it, in language the affected person could follow
  - _Verified by:_ Worked explanation for a sampled individual outcome
- **`CTRL-REDTEAM-01`** — The system is tested against hostile input — injection, evasion and forged documents — before launch and after material change
  - _Verified by:_ Red-team report with findings and their remediation
- **`CTRL-TPRM-01`** — The supplier is assessed for security, resilience, data handling, concentration and exit before use, and reassessed periodically
  - _Verified by:_ Completed third-party assessment and a signed exit plan on file
- **`CTRL-BIAS-01`** — Outcomes are tested for disparity across protected groups against the bias thresholds in this file, before launch and periodically after
  - _Verified by:_ Disparity test results against kri_thresholds.conduct.bias_disparity_pct, with the population and method stated
- **`CTRL-SAMPLE-01`** — A defined sample of recommendations is reviewed against what actually happened, with the rate stated
  - _Verified by:_ Sampling rate documented and review results on file
- **`CTRL-GROUND-01`** — Output is generated only from retrieved source material, and low-confidence answers say so rather than guessing
  - _Verified by:_ Retrieval logs showing sources per output; abstention behaviour exercised in test
- **`CTRL-CONDUCT-01`** — Pre-launch and periodic conduct testing, with sampled transcript audit for client harm and fairness
  - _Verified by:_ Conduct test results and transcript audit sampling on file

</details>

## 6. Jurisdiction packs — local law, on top of the above

These never classify anything by themselves. They only raise a tier, add a
control, add a review, or prohibit outright. See
[`approach.md`](approach.md) for why a large regulation yields few rules.

### DORA · EU — Regulation (EU) 2022/2554 (DORA)

_v0.2-draft · in force 2025-01-17 · sign-off: [FIRM] — Technology Risk ([DATE]) · text retrieved, awaiting human review_

**`DORA-EU-REV-01`** — Third-party AI concentration risk must be assessed

- **When:** where it sits is Zone B → require review: _ICT third-party concentration review (DORA Art. 28/29)_
- **Source:** DORA Article 28(4)(c) ([link](https://www.digital-operational-resilience-act.com/Article_28.html))
- **Basis:** `derived`
  > identify and assess all relevant risks in relation to the contractual arrangement, including the possibility that such contractual arrangement may contribute to reinforcing ICT concentration risk as referred to in Article 29

### EU-AIACT · EU — EU AI Act (Regulation (EU) 2024/1689)

_v0.2-draft · in force 2024-08-01 · sign-off: [FIRM] — Legal/Compliance ([DATE]) · text retrieved, awaiting human review_

**`EU-AIACT-TIER-01`** — Annex III high-risk: creditworthiness assessment

- **When:** decision fed is credit-decision / lending-decision → raise tier to **Critical**
- **Source:** EU AI Act Annex III §5(b) ([link](https://artificialintelligenceact.eu/annex/3/))
- **Basis:** `derived`
  > AI systems intended to be used to evaluate the creditworthiness of natural persons or establish their credit score, with the exception of AI systems used for the purpose of detecting financial fraud

**`EU-AIACT-TIER-02`** — Annex III high-risk: recruitment and selection

- **When:** decision fed is hiring → raise tier to **Critical**
- **Source:** EU AI Act Annex III §4(a) ([link](https://artificialintelligenceact.eu/annex/3/))
- **Basis:** `derived`
  > AI systems intended to be used for the recruitment or selection of natural persons, in particular to place targeted job advertisements, to analyse and filter job applications, and to evaluate candidates

**`EU-AIACT-TRANS-01`** — Article 50: people must be told they are dealing with an AI

- **When:** who sees it is client-facing → require `CTRL-DISCLOSE-01`
- **Source:** EU AI Act Article 50(1) ([link](https://artificialintelligenceact.eu/article/50/))
- **Basis:** `derived`
  > Providers shall ensure that AI systems intended to interact directly with natural persons are designed and developed in such a way that the natural persons concerned are informed that they are interacting with an AI system, unless this is obvious from the point of view of a natural person who is reasonably well-informed, observant and circumspect, taking into account the circumstances and the context of use.

**`EU-AIACT-TRANS-02`** — Article 50: synthetic content must be machine-readably marked

- **When:** AI type is generative-ai / llm **and** who sees it is market-facing → require `CTRL-SYNTHMARK-01`
- **Source:** EU AI Act Article 50(2) ([link](https://artificialintelligenceact.eu/article/50/))
- **Basis:** `judgement`
  > Providers of AI systems, including general-purpose AI systems, generating synthetic audio, image, video or text content, shall ensure that the outputs of the AI system are marked in a machine-readable format and detectable as artificially generated or manipulated.

### SR-26-2 · US — SR 26-2 — Revised Guidance on Model Risk Management

_v0.2-draft · in force 2026-04-17 · sign-off: [FIRM] — Model Risk ([DATE]) · text retrieved, awaiting human review_

**`SR262-US-REV-01`** — Generative and agentic AI are outside MRM scope — governed elsewhere, not ungoverned

- **When:** AI type is generative-ai / llm / agentic → require review: _AI Governance review (outside MRM scope per SR 26-2)_
- **Source:** SR 26-2 Footnote 3 ([link](https://www.federalreserve.gov/supervisionreg/srletters/SR2602.htm))
- **Basis:** `judgement`
  > Generative AI and agentic AI models are novel and rapidly evolving. As such, they are not within the scope of this guidance.

### SS1-23 · UK — SS1/23 — Model risk management principles for banks

_v0.2-draft · in force 2024-05-17 · sign-off: [FIRM] — Model Risk ([DATE]) · text retrieved, awaiting human review_

**`SS1-UK-REV-01`** — Quantitative models informing decisions are in scope regardless of technique

- **When:** weight is material / binding → require review: _Independent model validation (2LoD)_
- **Source:** SS1/23 Model definition (Principle 1) ([link](https://www.bankofengland.co.uk/prudential-regulation/publication/2023/may/model-risk-management-principles-for-banks-ss))
- **Basis:** `derived`
  > a quantitative method, system, or approach that applies statistical, economic, financial, or mathematical theories, techniques, and assumptions to process input data into output

---

_Nothing here is legal, regulatory or compliance advice. The starter
appetite and packs are unadopted templates — a verdict produced before your
firm adopts them is provisional, not final._
