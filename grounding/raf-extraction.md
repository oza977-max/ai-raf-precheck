# RAF → Pre-Check Engine: Rule Extraction (A–H)

**Purpose.** This file is the verbatim grounding reference for the AI Risk Appetite *pre-check* engine. It extracts the firm's Risk Appetite Framework (`ai-raf-template.html`, the AI RAF Supplement) into the components the engine evaluates. It is the *rulebook* the pre-check runs a use case against.

**Source of truth.** `grounding/ai-raf-template.html`. Where the two disagree, the HTML governs. `[FIRM]` placeholders and all KRI thresholds are illustrative pending firm calibration — they are inputs to be set, not standards to copy.

**How the engine consumes this file**

| Section | Becomes, in the engine |
|---|---|
| A. Axes | the coordinate system / data-flow map a use case is described in |
| B. Hard lines | absolute rejects — no control set can satisfy them |
| C. Track rules | the ordered classifier → Track I / II / III |
| D. Tier rules | impact-dominant tiering → Critical / High / Medium / Low (+ overrides) |
| E. Appetite positions | the boundary — Accept / Tolerate-with-controls / Reject |
| F. Control library | the set the solver picks from to bring a use case inside the boundary |
| G. Drift signals (KRIs) | standing conditions that can flip an approved use case in → out |
| H. Jurisdiction packs | overrides that raise the bar by where the use case operates |
| I. Model approval | the approved-model registry; an unlisted/unapproved model trips an invariant, one level deeper than vendor-approval already does |
| J. Risk-knowledge awareness | advisory only — flags coverage gaps against an external taxonomy; structurally incapable of a verdict effect |

The engine's job per use case: **(1)** build the map (A), **(2)** check the hard lines (B), **(3)** classify track (C) and tier (D) with overrides (H), **(4)** read the boundary position (E), **(5)** solve for the minimal control set from (F) that brings residual risk inside the boundary — or return "reject" if none exists, **(6)** attach the standing drift conditions (G) the use case must stay within after approval, **(7)** check the declared model against the registry (I), **(8)** surface any risk-knowledge advisory (J) beside the verdict, never inside it.

---

## A. Axes — the coordinate system (RAF §4 + §5 properties)

**Six risk dimensions** (each maps to an existing firm risk category):
1. **Performance & Model** — accuracy, hallucination, drift, explainability, fitness → *Model Risk*
2. **Data & Privacy** — leakage, residency, PII, MNPI, training-data exposure, zone breaches → *Operational / Data Risk*
3. **Technology, Cyber & Resilience** — availability, prompt injection, supply-chain, failover, perimeter → *Technology / Cyber Risk*
4. **Conduct & Fairness** — bias, client harm, MiFID II / MAR, market abuse, IP infringement → *Conduct Risk*
5. **Third-Party & Concentration** — vendor dependence, model/hyperscaler concentration, exit → *Operational / Third-Party Risk*
6. **Autonomy & Agentic** — action scope, oversight level, reversibility, tool-use risk → *Operational Risk (new sub-category)*

**Cross-cutting properties every use case is located on** (used by the classifier and tierer):
- **Reversibility** — can the action be undone?
- **Autonomy level** — 0–4 (see §7 / Section E below)
- **Exposure** — internal / client-facing / market-facing
- **Decision bindingness** — informs vs decides
- **Data sensitivity** — public → internal → confidential → PII / MNPI
- **Scale / blast radius** — limited vs at-scale / external
- **Jurisdiction(s)** — drives the override packs (H)
- **Data zone** — A = open cloud · B = private/controlled cloud · C = on-premises only

---

## B. Hard lines — outside appetite, no control set can fix (RAF §6 reject rows + §7)

- **Fully autonomous trading decision** → Do not accept
- **Autonomous lending decision (no human)** → Do not accept
- **Any external system processing MNPI** → Do not accept (Zone C only; prohibited externally)
- **Level 4 autonomy on irreversible, client- or market-facing actions** → Do not accept
- **Any irreversible action without human approval** → not allowed; irreversible actions require autonomy Level 1 or below **regardless of tier**

These short-circuit the engine: if a use case crosses one, the verdict is **Reject** and no minimal-control solve is attempted.

---

## C. Track classification — triple-track, applied in order (RAF §5)

Evaluate in sequence; first match wins:
0. **Autonomy Level 4 on irreversible, client- or market-facing actions** → outside appetite, do not classify (see B / §7)
1. **Traditional quantitative model** → **Track I**
2. **Quantitative output into a regulated decision** → **Track II**
3. **Replaces a prior model** → **Track II**
4. **Autonomy Level 3+, or human override rate < 5% at registration** → **Track II**
5. else → **Track III**

**Track populations & regime:**
- **Track I — Traditional MRM:** regression, GBM, scorecards, VaR, IRB. Full validation, monitoring, conceptual soundness — all jurisdictions.
- **Track II — AI on MRM:** GenAI/agentic producing a quantitative output for a material decision, or replacing a Track I system. Full MRM **plus** AI-specific controls (grounding, drift, fingerprinting).
- **Track III — AI Governance:** GenAI/agentic that informs but does not decide (narrative, productivity, augmentation). Inventory, tier, HITL, sampling, perimeter — lighter than full MRM. **Where the governing jurisdiction applies a technology-agnostic MRM standard (e.g. UK SS1/23), Track III is supplemented with that standard's obligations; track assignment never reduces the jurisdictional minimum (see H).**

**Re-classification:** annual; trigger-based on autonomy change, use-case expansion, or jurisdictional update.

---

## D. Materiality tiering — impact-dominant (RAF §5)

Assigned by rules, not multiplication. **Impact dominates** — a high-impact use case cannot be down-tiered by low complexity or low reliance.

| Tier | Trigger (impact-dominant) | Approval | Validation |
|---|---|---|---|
| **Critical** | Regulated decision, capital, client financial outcome, or external-facing at scale | CRO + Board committee | Full validation + ongoing monitoring |
| **High** | Material internal decision, risk-measurement input, or confidential data at scale | AI Governance Cttee + Model Risk | Independent 2LoD validation |
| **Medium** | Analytical support, client-adjacent, limited blast radius | 2LoD review | Documented design review + sampling |
| **Low** | Internal productivity, no regulated decision, low data sensitivity | Fast Track | 1LoD self-attestation |

**Overrides:**
- **EU AI Act Annex III** (e.g. credit scoring, employment) → forced to **Critical** regardless of internal tiering outcome (see H).
- **Anti-gaming:** Low-tier (Fast Track) is still subject to periodic 2LoD sampling and audit. Registering a use case as Low to avoid oversight is a **conduct matter**, not a classification choice.

---

## E. Appetite positions — the boundary (RAF §6, binding)

Representative register. Each entry: use case → Tier / Track → position → mandatory controls.

| Use case | Tier | Track | Position | Mandatory controls |
|---|---|---|---|---|
| Internal productivity copilot (no client data) | Low | III | **Accept** | Zone A only; output logging |
| Regulatory change monitoring & drafting | Medium | III | **Accept** | Human review before filing; grounding verification |
| Counterparty document summarisation | High | III | **Tolerate** | Zone B; citation resolution; sampling |
| AI-assisted credit analysis (input to decision) | Critical | II | **Tolerate** | Full validation; mandatory human decision; + Track II baseline |
| AI-enhanced market-risk scenario synthesis | High | II | **Tolerate** | Explainability; 2LoD validation; drift monitoring; + Track II baseline |
| Read-only agentic workflow (data retrieval) | Medium | III | **Tolerate** | Minimal permissions; tool-call logging; kill switch |
| Client-facing chatbot | Critical | III | **Tolerate** | Escalation path; conduct testing; transcript audit |
| Fully autonomous trading decision | Critical | — | **Reject** | Outside appetite |
| Autonomous lending decision (no human) | Critical | — | **Reject** | Outside appetite |
| Any external system processing MNPI | Critical | — | **Reject** | Zone C only; prohibited externally |

- **Track II baseline** (every Track II system): version pinning + output fingerprinting, with **zero tolerance for unmonitored vendor model change**.
- **Zones:** A = open cloud · B = private/controlled cloud · C = on-premises only.
- Register entries are subject to the §5 re-classification triggers (annual; or on autonomy, use-case, or jurisdiction change).

---

## F. Control library — what the solver picks from (RAF §6 + §9)

Each control is tagged with the problem(s) it patches. The solver finds the **minimal set** that brings residual risk inside the boundary.

| Control | Patches |
|---|---|
| **Zone restriction (A/B/C)** | Data leakage, residency, PII/MNPI exposure |
| **Human decision gate (HITL)** | Autonomy, irreversibility, decision-bindingness |
| **Grounding verification** (claim-level resolution + citation + per-claim confidence + immutable audit log) | Hallucination/fabrication in RAG, synthesis, summarisation |
| **Output fingerprinting + version pinning** | Silent substitution (vendor model change) |
| **Drift monitoring** | Model drift since validation |
| **Adversarial red-teaming** (injection, jailbreak, exfil, role confusion; quarterly min, pre-launch for Track II) | Security / prompt-injection / resilience |
| **Tool-call logging + kill switch + minimal permissions** | Agentic / autonomy / tool-use |
| **Conduct testing + transcript audit** | Conduct, fairness, client harm |
| **Sampling** | Behavioural verification / ongoing quality |
| **Citation resolution** | Grounding sub-control (counterparty/doc summarisation) |
| **Explainability** | Track II model transparency |

**Three verification modes (§9)** — the assurance backbone behind several controls:
- **Grounding** (RAG/synthesis/summarisation): every claim resolves to a retrievable source; citation-confidence scoring; failed grounding → human review.
- **Behavioural** (recommendation/classification/routing): continuous sampling vs human ground truth; disagreement triage; concept-drift detection.
- **Adversarial** (all systems, periodic): structured red-teaming; quarterly minimum; pre-launch for Track II.

**Grounding minimum requirements:** claim-level resolution (semantically sufficient, not lexical); per-claim confidence (High/Medium/Low) with escalation threshold; citation attachment (unverified output marked); immutable audit log (claim, source, confidence, timestamp, model version) available to 2LoD.

**Silent substitution:** hosted models change without notice → output fingerprinting against a fixed probe set; a step-change in aggregate grounding confidence on a stable corpus also triggers a fingerprint check. **Zero tolerance for unmonitored model change on Track II.**

---

## G. Drift signals — standing conditions / KRIs (RAF §8)

Thresholds **illustrative, pending firm calibration**. These are the live conditions a use case must stay within *after* approval; a breach can flip an approved certificate from in → out of appetite.

| Dimension | KRI | Green | Amber | Red |
|---|---|---|---|---|
| Performance | Output quality (sampled accuracy) | ≥ target | −5% | −10% → revalidate |
| Performance | Model drift since validation | < 3% | 3–5% | > 5% |
| Data | Zone violations (attempted) | 0 successful | — | any successful |
| Data | PII/MNPI in Zone A output | 0 | — | any |
| Technology | Prompt-injection detection rate | monitored | rising | successful bypass |
| Conduct | Fairness metric (where applicable) | within ±tol | drift | breach |
| Conduct | IP / third-party content infringement (sampled) | 0 flagged | review | confirmed instance |
| Third-Party | Single-provider spend concentration | within limit | approaching | over limit |
| Third-Party | Silent substitution (fingerprint change) | 0 unreviewed | — | any unreviewed |
| Autonomy | Human override rate (HITL) | > 5% | 1–5% | < 1% → reclassify |

---

## H. Jurisdiction override packs (RAF §3)

**Operating rule:** where a use case touches multiple jurisdictions, the **most demanding applicable standard governs**. Track assignment never reduces the jurisdictional minimum.

| Regime | Jurisdiction | Position on GenAI | Override effect on the engine |
|---|---|---|---|
| **SR 26-2** | US (Fed/OCC/FDIC) | Excluded from MRM; separate RFI pending | Do **not** rely on MRM exclusion — apply AI Governance (Track III) minimum |
| **SS1/23** | UK (PRA) | Included; technology-agnostic | Most demanding; sets the ceiling. Supplements Track III with MRM obligations |
| **E-23** | Canada (OSFI) | Very broad — any technique whose output feeds a decision/risk control | Expansive MRM scope; Canadian entities, effective 2027 |
| **EU AI Act** | EU | Parallel "high-risk system" regime | Annex III (credit, employment) → **force Critical**; Arts 9/13/17. Digital Omnibus: Annex III obligations → Dec 2027; Art. 50(2) transparency → Dec 2026 (systems on-market before Aug 2026) |
| **MAS FEAT / TRM** | Singapore | Principles-based; covers AI in decisions | Mandatory explainability + human accountability |
| **DORA** | EU | AI as critical ICT where applicable | Third-party concentration; incident reporting includes AI |
| **FSA Japan** | Japan | Guidelines tightening through 2026 | Explainability + audit-trail requirements |

---

## I. Model approval and provenance (RAF §9 "Model approval and provenance")

**Approved-model registry.** Every AI use case declares which model runs it. A model absent from the firm's approved list, or present but not yet approved, trips an invariant whose resolution is a named control/required review — the vendor-approval pattern (§H concentration tracking), one level deeper: not just *which vendor*, but *which model*.

**Provenance classes** (firm-visible attribute; never itself a pass/fail gate — rules may condition on it):
1. **Vendor-hosted** — called via a third party's API; subject to the silent-substitution controls (§F) and vendor concentration tracking (§H's Third-Party dimension).
2. **Open-weights, self-hosted** — no vendor substitution risk, but the firm carries the full validation burden itself.
3. **Fine-tuned in-house** — inherits its base model's class plus training-data governance obligations.

**Approval evidence:** named benchmark suite + date. General-capability benchmarks alone are insufficient where the use case is financial — a finance-domain evaluation is required for any Track I/II use, and for any Track III use touching client-facing or regulated content.

**Engine consumption:** the register carries an `ai_model` node type (name/version, provenance class, license note, approval status, benchmark evidence); use cases link to it via a `uses_model` edge. An unlisted or unapproved model is itself an invariant trigger, independent of tier/track.

---

## J. Risk-knowledge awareness (RAF §9 "Risk-knowledge awareness")

**What it is not.** Not a rule source. Not a pack. Has no field capable of expressing a tier, control, hard line, or verdict effect — structurally, not by convention.

**What it is.** A curated mapping from graph-attribute conditions to entries in an external, recognized AI-risk taxonomy (the public option: the MIT AI Risk Repository, 1,700+ risks from 65 frameworks, CC BY 4.0 licensed, updated quarterly). Each entry: the matching condition, the risk domain/subdomain, a one-line plain-English description, and the taxonomy's attribution.

**What it does.** Two effects only, both advisory:
1. **Advisory flag** — a matched entry renders beside the verdict (review screen, sign-off page), in the established advisory idiom, "informs — the rules decide," never blocking.
2. **Coverage-gap note** — where a matched entry's risk class is covered by no firm or pack rule, the panel says so, and a one-tap action files it into the rule-improvement queue as a coverage gap — the same governed channel that already turns dissent into rule-authoring work.

**Engine consumption:** the lens rides beside the verdict, never inside it. `evaluate()`'s decision output must be byte-identical with the lens present or absent — this is a determinism invariant, not a preference. Curation is human and versioned; the file is only as current as its last sync against the source taxonomy, which is a monitoring-loop tripwire, not an automated process.

---

*Firm overlays still required (not yet encoded): live AI inventory replacing representative register entries; calibrated KRI thresholds; committee/RACI names; legal-entity ↔ jurisdiction mapping; chosen grounding tooling + confidence threshold + log retention.*
