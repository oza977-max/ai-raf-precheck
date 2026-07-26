# Every rule in AIGate

> **Generated from `policy/appetite.yaml` and `policy/packs/*.yaml` by
> `npm run docs:rules`. Do not edit by hand — regenerate after any policy
> change.** Conditions are rendered in plain English; the YAML is the
> authority.

Policy version **1.0** · 5 hard lines · 5 tracks · 4 tiers · 14 invariants · 14 controls · 10 pack rules across 7 jurisdictions

---

## 1. Hard lines — checked first, nothing can fix them

If one of these matches, evaluation stops immediately and the answer is no.
No control set changes it. Tier and track are never even assigned.

| # | When | Why | Basis |
|---|---|---|---|
| `HL-001` | autonomy ≥ 4 **and** reversible? = irreversible **and** who sees it is client-facing / market-facing | No control set can bring fully autonomous, irreversible, client-facing AI within appetite. | SS1/23 §3.8; SR 26-2 §IV |
| `HL-002` | information type is MNPI **and** where it sits is Zone A | MNPI outside Zone C violates market abuse prevention requirements. | MAR Article 8; MiFID II |
| `HL-003` | autonomy ≥ 4 **and** decision fed is lending-decision / credit-decision **and** human check = false | EU AI Act Annex III §5(b) + Consumer Credit Directive require human oversight on credit decisions. | EU AI Act Annex III §5(b); Consumer Credit Directive 2023/2225 |
| `HL-004` | autonomy ≥ 4 **and** decision fed is trading | Fully autonomous trading decisions with no human oversight are outside appetite at any tier. | RAF §5 rule; MiFID II Article 17 |
| `HL-005` | reversible? = irreversible **and** autonomy ≥ 2 | Irreversible actions require Level 1 or below regardless of tier. | HTML §7 — Irreversible actions require Level 1 or below regardless of tier |

## 2. Tracks — which governance route it takes

First match wins, evaluated in id order.

| # | Track | When | Basis |
|---|---|---|---|
| `TRACK-I` | Track I — Traditional MRM | AI type is statistical / traditional-ml **and** weight is material / binding | SS1/23 §3.4; SR 26-2 §II.A |
| `TRACK-II` | Track II — AI on MRM | AI type is ml / deep-learning / llm / generative-ai **and** weight is material / binding / advisory | SS1/23 §3.4 (technology-agnostic); OSFI E-23 §2.1 |
| `TRACK-II-REPLACE` | Track II — Replaces prior model | replaces a model = true | RAF §5 rule 3 |
| `TRACK-II-AUTONOMY` | Track II — High autonomy | autonomy ≥ 3 | RAF §5 rule 4 |
| `TRACK-III` | Track III — AI Governance | AI type is llm / generative-ai / agentic **and** weight is non-binding | SR 26-2 footnote 3 (generative and agentic AI outside MRM scope; issued 2026-04-17, exclusion stated as temporary) |

## 3. Tiers — how serious it is

Impact-dominant: every trigger is evaluated and the highest tier reached wins.

| # | Tier | Any of these triggers |
|---|---|---|
| `TIER-CRITICAL` | **Critical** | decision fed is credit-decision / lending-decision / fraud-detection **or** who sees it is market-facing **or** decision fed is pricing |
| `TIER-HIGH` | **High** | who sees it is client-facing **or** decision fed is regulatory-reporting **or** autonomy ≥ 3 **or** information type is Client PII / MNPI |
| `TIER-MEDIUM` | **Medium** | who sees it is internal-shared **or** autonomy is 2 |
| `TIER-LOW` | **Low** | who sees it = internal-only |

## 4. Invariants — the things that must hold

Every one is checked. Each that trips is a gap the solver must close.

### `INV-DATA-01` — High

Client PII must not flow to an external model endpoint without encryption in transit

- **Trips when:** information type is Client PII **and** where it sits is Zone A / Zone B
- **Closed by:** `CTRL-ENC-01`
- **Basis:** GDPR Art. 32(1)(a)

### `INV-ZONE-01` — Critical

MNPI must remain within Zone C

- **Trips when:** information type = MNPI **and** where it sits is NOT Zone C
- **Closed by:** _no control resolves this — tripping it is a rejection_
- **Basis:** MAR Article 8; MiFID II

### `INV-DISCLOSE-01` — High

A person dealing with an AI must be told they are dealing with an AI

- **Trips when:** who sees it is client-facing **and** AI type is llm / generative-ai / agentic
- **Closed by:** `CTRL-DISCLOSE-01`
- **Basis:** EU AI Act Art. 50(1) — applies from 2026-08-02, NOT postponed by the Digital Omnibus

### `INV-TRACK2-01` — High

Track II baseline — hosted models can be substituted without notice; output fingerprinting and version pinning are mandatory

- **Trips when:** AI type is ml / deep-learning / llm / generative-ai **and** weight is advisory / material / binding
- **Closed by:** `CTRL-FINGERPRINT-01`
- **Basis:** RAF §5 — Track II baseline; zero tolerance for unmonitored vendor model change

### `INV-HALLUC-01` — High

Generative output feeding a material decision must be grounded — every claim resolves to a retrievable source

- **Trips when:** AI type is llm / generative-ai **and** weight is material / binding
- **Closed by:** `CTRL-GROUND-01`
- **Basis:** RAF §9 — grounding verification mode

### `INV-CITE-01` — Medium

Generative drafting must attach resolvable citations; unverified output is marked as such

- **Trips when:** AI type is llm / generative-ai **and** what it does is draft
- **Closed by:** `CTRL-CITE-01`
- **Basis:** RAF §9 — grounding minimum requirements

### `INV-AGENT-01` — High

Tool-using systems require minimal permissions, full tool-call logging and a kill switch

- **Trips when:** AI type is agentic
- **Closed by:** `CTRL-LOG-01`
- **Basis:** RAF §6 — agentic / tool-use controls

### `INV-AUTONOMY-01` — Critical

Autonomy at L2 or above on a material or binding decision requires a human decision gate

- **Trips when:** autonomy ≥ 2 **and** weight is material / binding
- **Closed by:** `CTRL-HITL-02`
- **Basis:** RAF §7 — autonomy ceiling

### `INV-CONDUCT-01` — High

Client- or market-facing AI output requires conduct testing and transcript audit

- **Trips when:** who sees it is client-facing / market-facing
- **Closed by:** `CTRL-CONDUCT-01`
- **Basis:** RAF §4 — conduct & fairness

### `INV-ESCALATE-01` — High

Conversational client-facing systems require a documented human escalation path

- **Trips when:** AI type is llm / generative-ai **and** who sees it is client-facing
- **Closed by:** `CTRL-ESCALATE-01`
- **Basis:** RAF §4 — client harm / escalation

### `INV-DRIFT-01` — High

Quantitative models informing material decisions require drift monitoring against validation baseline

- **Trips when:** AI type is statistical / traditional-ml / ml / deep-learning **and** weight is material / binding
- **Closed by:** `CTRL-DRIFT-01`
- **Basis:** RAF §8 — drift signals; SS1/23 §3.4

### `INV-EXPLAIN-01` — Medium

Machine-learned models informing material decisions require explainability documentation

- **Trips when:** AI type is ml / deep-learning **and** weight is material / binding
- **Closed by:** `CTRL-EXPLAIN-01`
- **Basis:** RAF §5 — Track II transparency

### `INV-SEC-01` — Medium

Prompt-injectable systems shared beyond a single team require periodic adversarial red-teaming

- **Trips when:** AI type is llm / generative-ai / agentic **and** who sees it is internal-shared / client-facing / market-facing
- **Closed by:** `CTRL-REDTEAM-01`
- **Basis:** RAF §9 — adversarial verification mode

### `INV-SAMPLE-01` — Medium

Recommendation or classification at scale requires continuous behavioural sampling against human ground truth

- **Trips when:** what it does is recommend **and** scale = at_scale
- **Closed by:** `CTRL-SAMPLE-01`
- **Basis:** RAF §9 — behavioural verification mode

## 5. Controls — what closes a gap

The solver picks the **smallest set** that covers every tripped invariant,
preferring lower burden. Controls without evidence render UNVERIFIED.

| # | Control | Burden | Closes | Evidence |
|---|---|---|---|---|
| `CTRL-ENC-01` | Encryption in transit (TLS 1.3+) | 1 | `INV-DATA-01` | **VERIFIED** |
| `CTRL-DISCLOSE-01` | AI interaction disclosure | 1 | `INV-DISCLOSE-01` | UNVERIFIED |
| `CTRL-SYNTHMARK-01` | Synthetic content marking | 3 | _pack-required only_ | UNVERIFIED |
| `CTRL-FINGERPRINT-01` | Output fingerprinting + version pinning | 2 | `INV-TRACK2-01` | UNVERIFIED |
| `CTRL-CITE-01` | Citation resolution | 2 | `INV-CITE-01` | UNVERIFIED |
| `CTRL-ESCALATE-01` | Human escalation path | 2 | `INV-ESCALATE-01` | UNVERIFIED |
| `CTRL-LOG-01` | Tool-call logging, kill switch and minimal permissions | 2 | `INV-AGENT-01` | UNVERIFIED |
| `CTRL-HITL-02` | Human decision gate (HITL L2) | 3 | `INV-AUTONOMY-01` | UNVERIFIED |
| `CTRL-DRIFT-01` | Drift monitoring | 3 | `INV-DRIFT-01` | UNVERIFIED |
| `CTRL-EXPLAIN-01` | Explainability documentation | 3 | `INV-EXPLAIN-01` | UNVERIFIED |
| `CTRL-REDTEAM-01` | Adversarial red-teaming | 3 | `INV-SEC-01` | UNVERIFIED |
| `CTRL-SAMPLE-01` | Behavioural sampling | 3 | `INV-SAMPLE-01` | UNVERIFIED |
| `CTRL-GROUND-01` | Grounding verification | 4 | `INV-HALLUC-01` | UNVERIFIED |
| `CTRL-CONDUCT-01` | Conduct testing + transcript audit | 4 | `INV-CONDUCT-01` | UNVERIFIED |

<details><summary>What each control actually requires</summary>

- **`CTRL-ENC-01`** — All data in transit to external endpoints must use TLS 1.3 or higher
  - _Verified by:_ Deployment manifest shows TLS 1.3 endpoint; no HTTP fallback
- **`CTRL-DISCLOSE-01`** — The interface states plainly that the user is interacting with an AI system, before or at the point of interaction
  - _Verified by:_ Screenshot or UX spec showing the disclosure at first contact
- **`CTRL-SYNTHMARK-01`** — AI-generated content leaving the firm is marked in a machine-readable format as artificially generated
  - _Verified by:_ Output carries provenance metadata (e.g. C2PA) detectable by a third party
- **`CTRL-FINGERPRINT-01`** — Model version pinned; outputs fingerprinted against a fixed probe set to detect silent substitution
  - _Verified by:_ Probe set and baseline fingerprints on file; alert on step-change in aggregate grounding confidence
- **`CTRL-CITE-01`** — Every generated claim carries a resolvable citation; unverified claims are visibly marked
  - _Verified by:_ Sampled outputs show citations resolving to retrievable sources
- **`CTRL-ESCALATE-01`** — Documented route from the AI interaction to a human owner, surfaced to the client
  - _Verified by:_ Escalation route documented, staffed, and exercised in testing
- **`CTRL-LOG-01`** — All tool invocations logged to an append-only store; kill switch disables execution within 1 hour; permissions scoped to the minimum required
  - _Verified by:_ Log store is append-only; kill-switch procedure documented and tested
- **`CTRL-HITL-02`** — Every action proposed by the AI is reviewed and approved by a human before execution
  - _Verified by:_ UI shows human approval step; audit trail records approval identity and timestamp
- **`CTRL-DRIFT-01`** — Continuous monitoring of model drift against the validation baseline, with defined amber/red thresholds
  - _Verified by:_ Drift dashboard live; thresholds match the KRI table; breach routes to 2LoD
- **`CTRL-EXPLAIN-01`** — Documented account of how the model reaches its outputs, sufficient for independent validation
  - _Verified by:_ Explainability pack reviewed by independent validation
- **`CTRL-REDTEAM-01`** — Structured red-teaming for injection, jailbreak, exfiltration and role confusion; quarterly minimum, pre-launch for Track II
  - _Verified by:_ Red-team report on file within the last quarter; findings tracked to closure
- **`CTRL-SAMPLE-01`** — Continuous sampling of outputs against human ground truth, with disagreement triage
  - _Verified by:_ Sampling rate and triage process documented; disagreement rate tracked
- **`CTRL-GROUND-01`** — Claim-level source resolution, per-claim confidence scoring, citation attachment, and an immutable audit log available to 2LoD
  - _Verified by:_ Audit log records claim, source, confidence, timestamp and model version; failed grounding routes to human review
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

### FSA-JP · JP — [PRIMARY SOURCE NOT YET IDENTIFIED]

_v0.2-unauthored · in force [TBC] · sign-off: [FIRM] — Compliance ([DATE]) · **1 of 1 rules have placeholder text — not reviewable**_

**`FSAJP-REV-01`** — Governance review for AI in customer-facing financial services

- **When:** who sees it is client-facing → require review: _AI governance review_
- **Source:** [PRIMARY SOURCE NOT YET IDENTIFIED] [SECTION TBC]
- **Basis:** `judgement` — ⚠️ **quote is a placeholder; this rule cannot be reviewed or relied on**

### MAS-FEAT · SG — FEAT Principles (pending replacement by MAS Guidelines on AI Risk Management)

_v0.2-unauthored · in force 2018-11-12 · sign-off: [FIRM] — Compliance ([DATE]) · **1 of 1 rules have placeholder text — not reviewable**_

**`FEAT-SG-REV-01`** — Fairness assessment for AI affecting customer outcomes

- **When:** who sees it is client-facing → require review: _Fairness and conduct assessment_
- **Source:** MAS FEAT Principles [SECTION TBC] ([link](https://www.mas.gov.sg/news/media-releases/2025/mas-guidelines-for-artificial-intelligence-risk-management))
- **Basis:** `judgement` — ⚠️ **quote is a placeholder; this rule cannot be reviewed or relied on**

### OSFI-E23 · CA — Guideline E-23 — Model Risk Management

_v0.2-unauthored · in force 2027-05-01 · sign-off: [FIRM] — Model Risk ([DATE]) · **1 of 1 rules have placeholder text — not reviewable**_

**`E23-CA-CTL-01`** — Logging and kill-switch for autonomy above L1

- **When:** autonomy ≥ 2 → require `CTRL-LOG-01`
- **Source:** OSFI Guideline E-23 [SECTION TBC] ([link](https://www.osfi-bsif.gc.ca/en/guidance/guidance-library/model-risk-management-guideline-2027))
- **Basis:** `judgement` — ⚠️ **quote is a placeholder; this rule cannot be reviewed or relied on**

### SR-26-2 · US — SR 26-2 — Revised Guidance on Model Risk Management

_v0.2-draft · in force 2026-04-17 · sign-off: [FIRM] — Model Risk ([DATE]) · text retrieved, awaiting human review_

**`SR262-US-REV-01`** — Generative and agentic AI are outside MRM scope — governed elsewhere, not ungoverned

- **When:** AI type is generative-ai / llm / agentic → require review: _AI Governance review (outside MRM scope per SR 26-2)_
- **Source:** SR 26-2 Footnote 3 ([link](https://www.federalreserve.gov/supervisionreg/srletters/srletters.htm))
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
