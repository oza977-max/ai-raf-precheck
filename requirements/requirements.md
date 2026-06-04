# AIGate — Requirements

**Version:** 1.0  
**Date:** May 2026  
**Project:** ai-raf-precheck  
**Status:** Draft — awaiting approval  
**Owner:** Kshitij Oza

---

## Version Guide

This document contains requirements for all stages of AIGate. Each requirement in the index is tagged:

- **V1** — Build this. The core product: intake, policy engine, verdict, basic register, YAML config.
- **V1.5** — First credible deployment (adds append-only store, artifact binding, basic 2LoD workflow). Not a new product — V1 + the minimum to be a system of record.
- **V2+** — Documented and safe but not built yet. Continuous monitoring, estate graph queries, CI/CD enforcement, full PV platform registry.

**If you are reading this to understand what AIGate V1 does:** read only the V1 rows in the Requirements Index. Everything else is future work, not current scope.

---

## Expert Panel

| Expert | Work | Role in This Document |
|--------|------|-----------------------|
| Karl Wiegers | *Software Requirements* (3rd ed.) | Requirements classification, MoSCoW prioritisation, ID structure |
| Gause & Weinberg | *Exploring Requirements* | Probing, ambiguity resolution, safety net audit |
| Jeff Patton | *User Story Mapping* | User journey discovery, now/later slicing |
| Alan Cooper | *About Face* (4th ed.) | Persona definition, goal-directed requirements |
| Clayton Christensen / Bob Moesta | *Competing Against Luck* / *Demand-Side Sales 101* | Job statement, push/pull framing |
| Suzanne & James Robertson | *Mastering the Requirements Process* (3rd ed.) | Non-functional categories, fit criteria |
| NIST | *AI Risk Management Framework (AI RMF 1.0)* | Govern/Map/Measure/Manage framing; trustworthiness characteristics |
| EU AI Act | *Regulation (EU) 2024/1689* | Annex III high-risk classification; transparency obligations |
| Federal Reserve / OCC / FDIC | *SR 26-2* (2026) | US MRM scope; triple-track rationale |
| PRA | *SS1/23* (2023) | Technology-agnostic MRM; jurisdiction ceiling |
| MAS | *FEAT Principles* (2019) | Fairness, accountability, transparency requirements |
| OSFI | *Guideline E-23* (eff. 2027) | Broadest-definition MRM; Canadian entity override |
| Philippa Girling | *Operational Risk Management* (2nd ed.) | KRI design; three lines of defence |
| Stuart Russell | *Human Compatible* | Agentic AI control; corrigibility; minimal footprint |

---

## 1. Purpose & Vision

**Job statement (Christensen):** When a business team wants to deploy an AI tool at the bank, we want to know immediately whether it is within our risk appetite and what conditions apply — so we can govern AI adoption at scale without the Second Line of Defence becoming the bottleneck.

**The problem it solves:** Banks today assess AI use cases through manual processes — Word documents, committee meetings, bespoke memos. A single assessment can take months and run to hundreds of questions, regardless of whether the use case is a low-risk internal copilot or a critical credit-scoring system. The process is slow (blocking AI adoption), inconsistent (two identical use cases can receive different outcomes from different reviewers), and gameable (self-attested intake is rarely challenged). The Second Line spends its time on process rather than judgement.

**What changes:** A developer describes their AI use case in plain language. The engine extracts a structured data-flow graph, detects any inconsistencies, asks only the questions this specific use case needs, and evaluates the confirmed graph against the bank's machine-readable Risk Appetite Framework. Within minutes, the result is: *in appetite / in appetite with these controls / rejected*, with the exact reason, the specific invariant that tripped, and the minimal set of controls that satisfies it. The verdict is attested, versioned, and permanently on record.

**Why this is not a chatbot and not a Big Four deliverable:** The evaluation is deterministic — the same use case against the same policy always produces the same verdict. Every verdict is traceable to a specific rule in the bank's own RAF. Corrections and re-evaluations are recorded in an immutable audit trail. The bank's rules drive the outcome; the engine enforces them consistently.

---

## 2. Target Users

### Primary persona — Priya, Head of AI Governance (2LoD)

Priya leads the AI risk function at a mid-sized UK bank. She has a team of three. Her firm is deploying AI tools at a rate her team cannot manually review. She sits on the AI Governance Committee and reports to the CRO. Her primary frustration: she finds out about AI tools when they are already built and being used. By then, fixing governance gaps is expensive and disruptive.

**End goal:** Every AI use case at the bank has a defensible, consistent, auditable governance record — without her team manually reviewing each one.
**Experience goal:** She wants to feel in control of the AI estate, not permanently behind it.

### Secondary persona — James, AI Developer (1LoD)

James is a developer on the trading desk who builds internal AI tools. He is technically capable but has no risk management background. His frustration: he doesn't know if his idea is viable until three months of work and a committee meeting later. He wants to know on day one.

**End goal:** Fast, clear guidance on whether his idea is going to fly and exactly what he needs to build to make it compliant.
**Experience goal:** He wants to feel like governance is helping him ship faster, not blocking him.

---

## 3. User Journeys

### Journey 1 — Developer submits a new use case (James)

1. James has an idea — an AI that reads incoming client emails and drafts replies for the RM team.
2. He opens the pre-check engine and types a two-sentence description.
3. The engine checks for duplicate or similar use cases already in the inventory.
4. If none found, it extracts a preliminary data-flow graph and shows James what it understood.
5. It asks 3–8 targeted questions based on the risk signals it detected (client data, external-facing output).
6. James answers; the engine detects a potential contradiction ("you said no client data, but your description includes client emails") and asks him to resolve it.
7. James confirms the corrected graph — this is his attestation.
8. The engine evaluates and returns a verdict: *Approved with controls — High tier, Track III*.
9. James sees exactly which rule was the binding constraint and what three controls he must implement.
10. The verdict is saved to the register. Priya's team can see it.

### Journey 2 — 2LoD reviews the register (Priya)

1. Priya opens the register view. She sees all use cases across all teams, their tiers, statuses, and verdicts.
2. She filters by Critical and High tier to focus attention.
3. She clicks into a High-tier use case and reviews the full audit trail: description, confirmed graph, questions asked, answers given, verdict reasoning, controls assigned.
4. She is satisfied the verdict is defensible. No action needed.

### Journey 3 — Regulatory pack updated, estate re-evaluated

1. EU AI Act Annex III obligations come into force (December 2027).
2. The bank's 2LoD team updates the EU AI Act regulatory pack in the policy file.
3. The engine re-evaluates all approved use cases in the inventory against the updated pack.
4. A diff is produced: *"8 use cases changed tier. 2 now require Critical-tier controls. 1 fell out of appetite."*
5. Priya reviews the affected use cases and initiates remediation for the 3 that need action.

---

## 4. Functional Requirements

### UC — Use Case Intake

**UC-1 (Must):** The system shall accept a plain-language description of an AI use case as the primary intake mechanism. The submitter types a free-text description of what the AI tool does, what data it touches, and what actions it takes. No structured form required at submission.

> Fit criterion: A description of 1–5 sentences is sufficient to initiate the intake flow. The system does not require field-by-field form completion at this stage.

**UC-2 (Must):** Before beginning intake questions, the system shall check the existing AI inventory for duplicate or substantially similar use cases and surface any matches to the submitter.

> Fit criterion: If a match is found with similarity above a configurable threshold, the system presents the existing use case(s) with their tier, track, and verdict. The submitter may adopt the existing classification or confirm their use case is genuinely new.

**UC-3 (Must):** The system shall extract a structured data-flow graph from the free-text description using an LLM. The graph shall represent: input data nodes (with data class labels), processing nodes (AI model, autonomy level, data zone), output nodes (action type, exposure level), and the edges between them.

> Fit criterion: The extracted graph is presented to the submitter for review before any questions are asked. The submitter can see and correct the graph before confirming.

**UC-3a (Must):** When no LLM API key is configured, the system shall present a structured intake form as a fallback to UC-3. The form shall collect the minimum graph attributes required for evaluation: data class of inputs, autonomy level, data zone, output exposure type, and applicable jurisdictions. The form output shall produce a data-flow graph in the same structure as LLM extraction.

> Fit criterion: A user with no API key configured can complete the full intake flow using the structured form and receive a verdict. The form presents each graph attribute as a labelled field with permitted values from the policy file. The resulting graph is marked "structured form intake" in the audit trail (not "LLM-extracted"). The system transitions to structured form intake without error and without requiring the user to configure an API key first.

> Health report: Added via HR-05 resolution (June 2026). Surfaced during /gvm-test-cases Phase 1 — the fallback path was referenced in CLAUDE.md and NF-3 but had no requirement.

**UC-4 (Must):** The system shall ask targeted follow-up questions based on the risk signals detected in the extracted graph. The number of questions shall be proportionate to the risk profile of the use case.

> Fit criterion: A Low-tier use case shall require no more than 5 follow-up questions. A Critical-tier use case shall require no more than 15. The system shall never present a fixed list of all possible questions regardless of use case type.

**UC-5 (Must):** The system shall detect internal contradictions between the free-text description and the answers to follow-up questions, and surface them to the submitter for resolution before graph confirmation.

> Fit criterion: If the submitter answers a question in a way that contradicts a prior statement (e.g., "no client data" contradicted by "the tool reads client call notes"), the system flags the contradiction with the specific conflicting statements and requires resolution before proceeding.

**UC-6 (Must):** The system shall require the submitter to explicitly confirm the final data-flow graph before evaluation begins. This confirmation is the submitter's attestation — it is timestamped, attributed to the submitter, and permanently recorded in the audit trail.

> Fit criterion: Evaluation cannot begin without an explicit confirmation action. The confirmation records: submitter identity, timestamp, graph version confirmed, and any corrections made from the initial extraction.

**UC-7 (Must):** The system shall allow the submitter to correct any node in the extracted graph before confirmation. Each correction shall be recorded (what changed, from what, to what, by whom, when).

> Fit criterion: If a submitter corrects a node (e.g., changes data class from "Internal" to "MNPI"), the correction is recorded alongside the original extraction. The audit trail shows both the original LLM-extracted value and the human-corrected value.

---

### PE — Policy Engine

**PE-1 (Must):** The system shall evaluate the confirmed data-flow graph against the bank's RAF invariants and return a verdict: *Approved*, *Approved with controls*, or *Rejected*.

> Fit criterion: The evaluation is deterministic — the same confirmed graph against the same policy version always produces the same verdict. No probabilistic outputs.

**PE-2 (Must):** The system shall classify every use case into one of three governance tracks using the ordered classification test from the bank's policy file: Track I (Traditional MRM), Track II (AI on MRM), Track III (AI Governance).

> Fit criterion: Track assignment follows the ordered rules in the policy file and short-circuits at the first matching rule. The track assigned and the rule that matched are included in the verdict output.

**PE-3 (Must):** The system shall assign a materiality tier (Critical / High / Medium / Low) using impact-dominant rules from the policy file. A high-impact trigger shall always result in Critical or High regardless of low complexity or low reliance scores.

> Fit criterion: Tier assignment is rule-based, not multiplicative. The tier-triggering rule is named explicitly in the verdict output.

**PE-4 (Must):** The system shall evaluate hard lines first, before any control solving. A use case that trips a hard line shall receive an immediate *Rejected* verdict. No control set can bring a hard-line violation into appetite.

> Fit criterion: Hard lines include (at minimum): Level 4 autonomy on irreversible client/market-facing actions; any external system processing MNPI; fully autonomous trading or lending decisions. Hard lines are configurable in the policy file.

**PE-5 (Must):** The system shall apply jurisdiction override packs based on the jurisdictions the use case touches. The most demanding applicable standard governs.

> Fit criterion: A use case touching UK entities applies SS1/23 (technology-agnostic MRM) as the ceiling. A use case touching EU entities with Annex III characteristics (e.g., credit scoring) is forced to Critical tier regardless of the internal tiering outcome. Override packs are configurable and versioned independently of the main policy file.

**PE-6 (Must):** When a use case spans multiple jurisdictions, the system shall apply the most demanding applicable standard across all jurisdictions. Track and tier assignments shall never be reduced below the jurisdictional minimum.

> Fit criterion: A use case that is Track III under SR 26-2 (US) but Track II under SS1/23 (UK) shall be classified as Track II when the use case touches UK entities.

**PE-7 (Must):** The bank's Risk Appetite Framework shall be expressed as a human-readable, versioned YAML/JSON policy file. All invariants, tier rules, track rules, hard lines, control library, and KRI thresholds are defined in this file.

> Fit criterion: A technically capable risk manager can read and edit the policy file without developer assistance. Changes to the policy file produce a new version. The version in force at the time of each verdict is recorded in the audit trail.

**PE-8 (Must):** The system shall ship with a starter policy file pre-loaded with the AI Risk Appetite template rules (from `grounding/raf-extraction.md`). Banks customise this file for their own tier names, committee names, thresholds, and use cases.

> Fit criterion: A bank can be operational — submitting use cases and receiving verdicts — without creating a policy file from scratch. The starter file covers all six risk dimensions, triple-track classification, impact-dominant tiering, hard lines, control library, and the seven jurisdiction override packs.

---

### CS — Control Solve

**CS-1 (Must):** When a use case is in appetite but requires controls, the system shall compute the control set that satisfies all tripped invariants while maintaining a configurable safety margin from the appetite boundary. "Minimal" means smallest set that achieves the required margin — not closest to the line.

> Fit criterion: The policy file defines a `safety_margin` parameter (default: 10% of the distance from the boundary). The system solves for the smallest control set that satisfies all invariants AND keeps the use case inside the margin. If no such set exists within the margin but one exists inside appetite, the verdict is "Approved with controls — boundary proximity warning." A use case approved at the margin is explicitly flagged as higher-revocation-risk than one with headroom. Optimising for minimum controls without margin optimises for developer convenience at the cost of governance resilience.

**CS-2 (Must):** If no combination of controls from the library can satisfy all tripped invariants, the system shall return a *Rejected* verdict with the specific unsatisfiable invariant(s) identified.

> Fit criterion: A *Rejected* verdict names the invariant(s) that cannot be resolved and explains why no control set addresses them (e.g., "this use case requires Level 4 autonomy on an irreversible client-facing action, which is a hard line outside appetite").

**CS-3 (Must):** The verdict shall include any downstream reviews triggered by the use case's characteristics — InfoSec review, vendor risk assessment, cloud security approval, or other bank-configured processes — as mandatory steps separate from the AI risk pre-check.

> Fit criterion: Triggered downstream reviews are listed as required next steps in the verdict, with the policy rule that triggered each one named. The pre-check is complete; the downstream reviews are additional obligations, not part of the pre-check evaluation.

**CS-4 (Should):** The verdict shall include a residual risk margin showing how close to the appetite boundary the use case sits after controls are applied.

> Fit criterion: A use case sitting close to the boundary (within a configurable margin) is flagged as "proximity warning" — it is in appetite but a minor change in behaviour could move it out. This feeds the ongoing monitoring signal (V2).

---

### VD — Verdict & Certificate

**VD-1 (Must):** The verdict shall state clearly and prominently: *Approved*, *Approved with controls*, or *Rejected* — with the tier and track assigned.

> Fit criterion: The verdict status, tier, and track are visible without scrolling on any standard screen. No jargon the submitter cannot interpret without a glossary.

**VD-2 (Must):** The verdict shall show the exact invariant that was the binding constraint — the specific rule in the policy file that determined the outcome — and the specific path in the data-flow graph that triggered it.

> Fit criterion: The submitter can read the verdict and understand precisely why the outcome is what it is, without asking a risk manager to interpret it. Example: *"Client email data (classified as potential MNPI) flows to an external model in Zone A. Policy rule PE-DATA-3 prohibits MNPI from flowing outside Zone C."*

**VD-3 (Must):** The verdict shall allow the submitter to contest the reasoning by correcting graph nodes they believe were misclassified. A correction triggers a re-evaluation. Both the original verdict and the corrected verdict are permanently recorded.

> Fit criterion: A correction is not a deletion of the original verdict. The audit trail shows: original graph, original verdict, correction made, corrector identity, timestamp, and revised verdict. The correction is the submitter's attestation that their correction is accurate.

**VD-4 (Must):** Every verdict shall be permanently recorded in an immutable audit trail. No verdict, correction, or attestation can be deleted or modified after the fact.

> Fit criterion: The audit trail for a use case includes: all versions of the data-flow graph, all questions asked and answers given, all corrections made, the policy file version in force, the regulatory pack versions in force, and the verdict at each stage. The audit trail is available to 2LoD on demand.

**VD-5 (Must):** The verdict record shall include the version of the policy file and the version of each regulatory pack that was active at the time of evaluation.

> Fit criterion: If the policy file or a regulatory pack is updated after a verdict is issued, the existing verdict record is unchanged. The record shows the rules that were in force when it was made — not the current rules.

**VD-6 (Should):** The verdict shall carry a living status field that can be updated when KRI conditions change after approval (V2 — live KRI monitoring). For MVP, the status field exists in the data model but is set only at verdict time.

> Fit criterion: The data model for a verdict record includes a `status` field (Approved / Amber / Breached / Revoked) and a `status_updated_at` timestamp. In MVP, status is set at verdict time and not updated automatically. V2 connects live KRI feeds.

**VD-7 (Must):** The verdict data model shall include a `conditions` block — the KRI values, behavioural bounds, and control verification states that the approval is conditional on. This is the hypothesis the runtime eventually tests against.

> Fit criterion: The `conditions` block is populated at verdict time with the specific bounds: e.g. `model_drift_threshold: 5%`, `override_rate_minimum: 5%`, `zone: B`, `model_version: pinned`. In MVP these are static records. V2 uses them as the monitoring target. This schema cannot be retrofitted — it must be in the data model from V1.

**VD-8 (Must):** The verdict shall produce a plain-English reasoning trace that a non-technical auditor can follow without developer assistance or knowledge of the policy schema.

> Fit criterion: The reasoning trace reads as prose: "This use case was classified Track II because it produces a credit score that feeds a lending decision (SS1/23 §3.4 — 'quantitative outputs in material decisions require validation'). It was forced to Critical tier because it operates on EU borrowers and credit scoring is an Annex III high-risk use case under the EU AI Act. The following controls are required to bring it within appetite: [list]." An auditor can follow this trace and verify each step against the cited regulatory text without opening the policy YAML.

---

### LC — Use Case Lifecycle

**LC-1 (Must):** Every use case shall have a lifecycle stage: *Idea → Exploring → Pre-checked → Approved → In Production → Monitored → Retired.*

> Fit criterion: The stage is visible on every use case record in the register. Stage transitions are recorded with timestamp and actor.

**LC-2 (Must):** The tier assigned by the engine shall determine the governance process the use case must follow after the pre-check.

> Fit criterion: Low tier → self-service, verdict is final on submitter confirmation. Medium tier → 2LoD notified, verdict is provisionally approved, 2LoD has a configurable window to object. High / Critical tier → 2LoD must actively approve before the use case can advance to *Approved* stage. Tier-to-workflow mapping is configurable in the policy file.

**LC-3 (Should):** For Medium, High, and Critical tier use cases, the system shall support a 2LoD review step where the risk manager can approve, reject, or request corrections to the verdict before it becomes final.

> Fit criterion: The 2LoD review action (approve / reject / request correction) is recorded in the audit trail with the reviewer's identity and timestamp. For MVP, this can be a simple status update in the register — a full workflow notification system is V2.

**LC-4 (Must):** The tier and track of a use case shall be re-evaluated when: (a) the policy file is updated, (b) a regulatory pack is updated, (c) the use case's scope or autonomy level changes, or (d) annual re-classification is triggered.

**LC-5 (Must):** Re-evaluation queues from policy or regulatory pack changes shall be prioritised and triaged automatically. Critical and High tier use cases are surfaced first. Low tier use cases that are unaffected by the changed provisions are auto-carried-forward without human review.

> Fit criterion: A major regulatory pack update does not dump the entire inventory onto the 2LoD team's review queue. The system determines which use cases are affected by the specific provisions that changed, surfaces Critical/High tier affected use cases for immediate review, and auto-carries Low tier unaffected use cases. The triage decision is recorded in the audit trail. Untriaged queue items are flagged as a risk, not silently accumulating.

**LC-6 (Must):** AIGate shall be submitted as a use case under its own pre-check. The resulting verdict — including tier, track, required controls, and reasoning chain — shall be stored in the inventory register and kept current.

> Fit criterion: The AIGate system appears in the AI inventory register with a verdict produced by AIGate's own evaluation engine. If AIGate cannot satisfy its own gates, the gates are reconsidered. This is not a formality — it is a live test of whether the rules are honest and complete.

> Fit criterion: Re-evaluation produces a new verdict record linked to the original. The register shows the current verdict and flags use cases whose verdict has changed since the last review.

---

### RG — Register & Inventory

**RG-1 (Must):** The system shall store the AI inventory as a **graph**, not a flat list. Use cases are nodes. Models, platforms, data flows, and controls are shared nodes connected to the use cases that depend on them. Shared infrastructure components appear once and are referenced by multiple use case nodes.

> Fit criterion: The underlying data model is a graph structure. The UI may present it as a list, but queries like "which use cases share this vendor model?" and "what is the blast radius if this platform approval is withdrawn?" are answerable without full-table scans. This is a non-negotiable data model decision — it cannot be retrofitted from a flat store after V1.

> Fit criterion: The register persists across sessions. All use cases submitted since the bank started using the tool are visible in the register (subject to access control).

**RG-2 (Must):** The full register — all use cases from all teams — shall be visible to 2LoD and above. Submitters (1LoD) shall see their own use cases and verdicts only.

> Fit criterion: Access to the full register is controlled by role configuration in the policy file. The 2LoD role has read access to all records. The 1LoD role has read/write access to their own records only.

**RG-3 (Should):** The register shall support filtering and search by: tier, track, lifecycle stage, jurisdiction, submitting team, verdict status, and date range.

> Fit criterion: A 2LoD user can filter the register to show only Critical-tier use cases that are currently *Pre-checked* (awaiting approval) across all teams.

**RG-4 (Should):** When the policy file or a regulatory pack is updated, the system shall re-evaluate all active use cases in the register and produce a diff showing which use cases changed tier, track, or appetite position.

> Fit criterion: The diff output names each affected use case, its previous verdict, and its new verdict. Use cases that fall out of appetite are highlighted. The diff is saved as a versioned record alongside the policy update.

**RG-5 (Could):** The register shall be exportable in a machine-readable format (CSV or JSON) for import into external risk reporting tools.

**RG-6 (Should):** The estate graph shall be queryable for concentration and blast-radius analysis. At minimum: "which use cases share this model/vendor?", "which use cases would be affected if this platform approval changes?", "what is the total blast radius of a change to this shared component?"

> Fit criterion: A 2LoD user can run a blast-radius query on any shared component and receive a list of affected use cases with their tiers and current statuses. This query completes without manual cross-referencing of the register.

**RG-7 (Should):** The system shall maintain a periodic sampling cadence where a configurable percentage of approved Low and Medium tier use cases are flagged for human re-review, independent of any KRI breach or regulatory update.

> Fit criterion: Sampling exists as a mechanism for detecting systematic rule error — a wrong activation condition that consistently approves things it should not. The sampling rate is configurable (default: 10% of Low tier, 5% of Medium tier, annually). Sampled use cases are added to the 2LoD review queue with the reason "periodic sample — systematic rule check."

> Fit criterion: Export produces a complete snapshot of the register at the time of export, with all fields included.

---

### OB — Observed Reality Binding

**OB-1 (Must):** For use cases where a code repository, infrastructure-as-code file, or deployment manifest is provided, the system shall derive graph attributes from those artifacts and treat them as authoritative over self-attested values.

> Fit criterion: An artifact-derived attribute (e.g. cloud zone read from a Terraform file) overrides a self-attested value for the same attribute. The verdict records which attributes were artifact-derived and which were self-attested. A use case with artifact-derived attributes is marked as higher-confidence than one that is entirely self-attested.

**OB-2 (Must):** The system shall flag discrepancies between self-attested values and artifact-derived values as contradictions requiring resolution before evaluation proceeds.

> Fit criterion: If a developer attests "Zone B — private cloud" but the IaC file shows an OpenAI API endpoint with no private network routing, the system flags: "Attested zone contradicts deployment artifact. Resolve before evaluation." Extends UC-5 to cover artifact contradictions, not just self-description contradictions.

**OB-3 (Should):** The system shall read deployment manifests and infrastructure config files to verify: claimed data zone, cloud region, model endpoint (and whether it is pinned or floating), and declared tool/action permissions.

> Fit criterion: For a use case providing a deployment manifest, the system extracts zone, model endpoint, and tool permissions directly. Self-attestation of these fields is not required if the artifact is present. The artifact version read is recorded in the audit trail.

**OB-4 (Should):** The system shall read model configuration and tool-use permission files to verify the autonomy level claimed in the data-flow graph.

> Fit criterion: If a use case claims "Level 1 autonomy — human approves each action" but the model config shows auto-execution of write operations, the system flags the contradiction. Cannot detect omissions not present in the artifact — this limitation is stated explicitly in the verdict.

**OB-5 (Must):** The verdict shall state explicitly, for every material attribute, whether the value was artifact-derived or self-attested. Self-attested attributes are labelled as such in the audit trail.

> Fit criterion: The verdict output distinguishes: "Data zone: Zone B — **verified from deployment manifest v1.3**" vs "Autonomy level: L1 — **self-attested, not verified by artifact**." A regulator can see immediately which claims have machine-backed evidence and which rely on the developer's word.

---

### PV — Platform & Vendor Envelope

**PV-1 (Must):** The policy file shall support an approved-platform registry. Each entry records its approved envelope — maximum data class, exposure level, autonomy level, jurisdiction set, and network zone — together with the controls the platform approval already satisfies.

> Fit criterion: A platform entry expresses, for example: `Azure OpenAI (internal zone) — approved for data class ≤ Internal, exposure ≤ internal-only, autonomy ≤ L2, UK/EU; satisfies controls C-ENC-1, C-ACC-2, C-LOG-1, C-RES-3.` The registry is part of the versioned policy structure.

**PV-2 (Must):** The policy file shall support an approved-vendor/model registry, structured identically to the platform registry. Each entry records the vendor or model's approved envelope and the controls its approval satisfies.

> Fit criterion: A use case using a model on the registry within its envelope inherits the model's cleared controls. A use case using a model not on the registry is treated as a new vendor (see PV-5).

**PV-3 (Must):** During evaluation, the system shall determine whether the use case's risk envelope (drawn from the confirmed data-flow graph) sits inside the envelope of its declared platform and vendor/model. Inheritance is per-dimension and conditional — controls are inherited only for dimensions where the use case fits inside the approved envelope.

> Fit criterion: If a use case runs on a platform approved for data class ≤ Internal but the use case touches MNPI, the platform's data-handling controls are not inherited for that dimension; the relevant invariants are evaluated as if no platform clearance existed for them. The policy schema shall support declaring control clusters as coupled — if any dimension in a coupled cluster is exceeded, all controls in that cluster fall away (not just the exceeded dimension's controls).

**PV-4 (Must):** The system shall ask intake questions only for the residual — risk dimensions not covered by an inherited envelope, plus genuinely use-case-specific dimensions (purpose, data class confirmation, output exposure, human oversight, fairness, explainability obligations). Questions whose answers are determined by inherited envelope controls shall not be asked.

> Fit criterion: Refines UC-4. A low-risk use case on a fully covering approved platform using an approved model within envelope is asked only use-case-intrinsic questions. The question budget is reduced by whatever the envelope covers, not a fixed list.

**PV-5 (Must):** When a use case declares a platform or vendor/model not present in the approved registry, the system shall route it to the full vendor/platform risk process as a triggered downstream review and shall not inherit any controls for the unapproved component.

> Fit criterion: An unapproved vendor produces a verdict including "full vendor risk assessment required" as a mandatory downstream step (consistent with CS-3). The verdict names the unapproved component explicitly.

**PV-6 (Must):** The verdict and audit trail shall record the full inheritance chain: which platform and vendor/model were declared, which envelope each was approved for, which controls were inherited, and which dimensions fell outside the envelope and were evaluated directly.

> Fit criterion: If a regulator asks "was data residency assessed for this use case?", the audit trail answers: "inherited from Platform X approval vN, cleared for UK/EU residency; use case is within that envelope." Inheritance is never asserted without the chain that justifies it. Extends VD-4 and VD-5.

**PV-7 (Must):** When a platform or vendor approval changes — envelope narrows or approval is withdrawn — the system shall re-evaluate all use cases that inherited from it and flag any whose inherited controls are no longer valid.

> Fit criterion: If Platform X's approval is narrowed to exclude EU jurisdictions, every use case that inherited EU coverage from Platform X is flagged for re-evaluation, with the affected dimension named. Extends LC-4 re-evaluation triggers and RG-4 diff mechanics.

**PV-8 (Should):** The starter policy file shall ship with a small set of example platform and vendor envelope entries, illustrating the envelope structure and at least one over-envelope case, so a bank can see the inheritance mechanics working before defining its own registry.

> Fit criterion: A bank installing the tool can run a sample use case demonstrating inheritance (fits envelope, questions reduced) and a sample demonstrating the envelope breaking (exceeds envelope, questions return), without first building its own registry.

---

### CF — Configuration

**CF-1 (Must):** The bank's Risk Appetite Framework shall be expressed as a human-readable YAML or JSON policy file stored locally within the project. The file defines all invariants, tier rules, track rules, hard lines, control library, KRI thresholds, role assignments, and tier-to-workflow mappings.

> Fit criterion: The policy file can be opened and edited in any text editor. Changes are tracked via the project's version control system (git).

**CF-2 (Must):** The system shall ship with a pre-populated starter policy file derived from the AI Risk Appetite Supplement template (`grounding/raf-extraction.md`). The starter file is functional out of the box — no configuration required to begin evaluating use cases.

> Fit criterion: A bank can install the tool and immediately submit a use case using the starter config. The first customisation step is editing the file to replace `[FIRM]` placeholders with the bank's own names, not starting from scratch.

**CF-3 (Must):** The policy file shall be versioned. Each change to the file produces a new version. The version in force at the time of each verdict is recorded in the verdict's audit trail.

> Fit criterion: The policy file includes a `version` field that is incremented on each change. The versioning is compatible with git version control.

**CF-4 (Must):** Regulatory override packs (SR 26-2, SS1/23, EU AI Act, OSFI E-23, MAS FEAT, DORA, FSA Japan) shall be stored as separate, versioned files within the policy structure. Packs can be updated independently of the main policy file.

> Fit criterion: Updating the EU AI Act pack does not require editing the main policy file. Each pack file has its own version. The verdict audit trail records the version of each pack in force at evaluation time.

**CF-5 (Must):** The system shall validate the policy file and all loaded regulatory packs on startup. If validation fails, the system shall display an explicit error message identifying the specific invalid field or rule, and prevent use case evaluation until the error is resolved.

> Fit criterion: If the policy file is missing a required field (e.g. `version`, `hard_lines`, `controls`), is malformed YAML, or contains a pack rule lacking a `source` citation block (per RA-7), the system displays: "Policy file invalid — [field/rule ID]: [reason]. Evaluation is disabled until this is resolved." The error is shown on the main screen. The system does not silently fall back to a default policy or proceed with partial evaluation. If the file is valid, startup proceeds normally with no error shown.

> Health report: Added via HR-06 resolution (June 2026). Surfaced during /gvm-test-cases Phase 1 — RA-7 references "rejected on load" but the load-failure behaviour was unspecified.

---

### RA — Regulatory Alignment

**RA-1 (Must):** The system shall correctly identify the applicable regulatory frameworks for a use case based on the jurisdictions specified in the data-flow graph, and apply them during evaluation.

> Fit criterion: A use case specifying UK and EU jurisdictions activates SS1/23 and EU AI Act override packs. A use case specifying US only activates SR 26-2. Jurisdiction selection is part of the intake flow.

**RA-2 (Must):** When multiple jurisdictions apply, the system shall apply the most demanding applicable standard as the governing standard. Track and tier assignments shall never be reduced below any applicable jurisdictional minimum.

> Fit criterion: A use case that is Track III under SR 26-2 but Track II under SS1/23 (because it is technology-agnostic MRM) shall be classified as Track II. The governing standard and the rule it imposed are named in the verdict.

**RA-3 (Must):** The audit trail for every verdict shall record the version of each regulatory pack that was active at the time of evaluation.

> Fit criterion: If a bank is audited and the regulator asks "was this use case assessed against SS1/23?", the audit trail answers yes — specifically which version of the SS1/23 pack, on which date.

**RA-4 (Should):** When a regulatory pack is updated, the system shall re-evaluate all active use cases in the inventory against the updated pack and produce a diff showing which use cases are affected.

> Fit criterion: The diff identifies: use cases that changed tier or track, use cases that fell out of appetite, and use cases that now require additional controls. The diff is presented to 2LoD for action.

**RA-5 (Should):** The system shall flag use cases whose regulatory pack version at last evaluation is older than the current pack version — indicating the use case may need re-evaluation.

> Fit criterion: The register view shows a "stale regulatory assessment" indicator on use cases evaluated against an older pack version. The indicator does not change the verdict — it prompts re-evaluation.

**RA-6 (Could):** The system shall provide a regulatory timeline view showing upcoming regulatory obligation dates (EU AI Act Annex III December 2027, OSFI E-23 January 2027, SR 26-2 RFI outcome) and which use cases in the inventory are likely to be affected.

> Fit criterion: The regulatory timeline view lists known upcoming dates with the anticipated impact on the inventory, based on current use case classifications.

**RA-7 (Must):** Every rule in a regulatory override pack shall cite its primary source — the exact regulatory text it derives from — including the document name, section or article reference, and verbatim text relied upon.

> Fit criterion: A rule cannot be added to a pack without a `source` block containing: `document` (e.g. "SS1/23"), `section` (e.g. "§3.4"), and `text` (the verbatim passage). A pack that contains rules without source citations is invalid and rejected on load. Example: `Track II if quantitative output into a regulated decision — derived from SS1/23 §3.4: "models that produce quantitative outputs used in material decisions require independent validation."`

**RA-8 (Must):** Every rule in a regulatory override pack shall carry a confidence score reflecting the clarity of the regulatory text and the degree of interpretive judgment required: High (unambiguous text, multiple reviewers agree), Medium (judgment involved, text is ambiguous), or Low (contested or genuinely unclear territory).

> Fit criterion: The confidence score is declared in the rule definition. A pack without confidence scores on all rules is invalid. The score is set by the human reviewer at sign-off, not computed automatically.

**RA-9 (Must):** The verdict shall display the full reasoning chain for every regulatory override that fired: the primary source text, the rule derived from it, and how the rule applies to the specific use case. The bank shall be able to verify the reasoning against the original regulatory text without asking the product owner.

> Fit criterion: For every regulatory override in a verdict, the output shows: document name, section, verbatim text, derived rule, and the specific graph attribute that triggered it. Example: *"EU AI Act Annex III §5(b) states: 'AI systems used for creditworthiness assessment are high-risk.' This use case produces a credit score — forced to Critical tier."*

**RA-10 (Must):** When a regulatory pack is updated, the system shall identify which rules cite regulatory text that has changed, and surface only those rules for human review. Rules citing unchanged text do not require re-review.

> Fit criterion: The pack update workflow produces a diff showing: old text, new text, affected rules, and proposed rule changes. The human reviewer reviews and signs off only the affected rules — not the entire pack. Rules not citing any changed section are automatically carried forward with their existing sign-off.

**RA-11 (Must):** Verdicts that rely on Medium confidence rules shall carry an explicit caveat naming the rule and the nature of the ambiguity. Verdicts that rely on Low confidence rules shall route to the bank's legal team for determination before the verdict is considered final.

> Fit criterion: A verdict with at least one Medium confidence rule displays: *"This verdict relies on [rule ID], which involves interpretive judgment. Confidence: Medium. Verify this reasoning with your compliance team before relying on it."* A verdict with a Low confidence rule displays: *"[Rule ID] covers contested regulatory territory. This verdict is provisional — your legal team must determine the applicable interpretation before it is final."*

**RA-12 (Should):** When a bank overrides a central pack interpretation at the local level, the override shall cite the competing regulatory text and record the bank's reasoning. Silent overrides — changing a rule without citing the source — are not permitted.

> Fit criterion: A local override entry requires: the competing source text, the bank's interpretation, the name and role of the person making the determination, and a date. An override without these fields is rejected on load. The audit trail for any verdict relying on a local override shows both the central interpretation and the bank's override with full provenance.

---

## 5. Non-Functional Requirements

**NF-10 (Must):** A named role shall own the translation-fidelity gap — the responsibility for verifying that the YAML activation conditions in the policy file faithfully encode the board-approved prose RAF. A periodic attestation ("the encoded rules match the board-approved RAF as of this date") shall be required and stored.

> Fit criterion: The policy file includes a `translation_attestation` block: attested_by, role, date, and a reference to the board-approved RAF version it was checked against. A policy file without a current attestation (within a configurable period, default 12 months) produces verdicts marked "translation fidelity unattested."

**NF-7 (Must):** The system shall not autonomously assert that a regulatory determination is authoritative. Every rule in a regulatory pack must be traceable to a primary source citation (RA-7) and a human reviewer sign-off. The reviewer signs off on the affected rules only — those citing changed regulatory text — not the whole pack on every update (RA-10).

> Fit criterion: A pack rule without a primary source citation (RA-7) or without a reviewer sign-off is invalid. A verdict relying on an unsigned or uncited rule is flagged as provisional with an explicit warning: *"This verdict relies on [rule ID], which has not been signed off against a primary regulatory source."*

**NF-8 (Must):** The verdict audit trail shall record, for every regulatory rule that fired: the primary source document, section, and verbatim text; the derived rule; the confidence score; the reviewer name, role, and sign-off date; and whether a local bank override was applied.

> Fit criterion: A regulator asking "why was this classified Track II?" receives: the exact SS1/23 section text, the rule derived from it, the confidence score, who reviewed it and when, and any bank-level override on top. The full reasoning chain is in the record — not just a version number.

**NF-9 (Should):** The system shall display a staleness warning when the regulatory text a rule cites has been superseded or when a pack rule has not been re-reviewed within a configurable threshold (default: 12 months). The warning names the specific rule and section, not just the pack.

> Fit criterion: *"Rule PE-JUR-UK-3 cites SS1/23 §3.4, last reviewed May 2025. Verify this section has not been amended before relying on this verdict."* The warning is at rule level — a pack where most rules are current but one section is stale surfaces only the stale rule, not a blanket pack warning.

**NF-1 (Must):** The evaluation engine shall be deterministic. The same confirmed data-flow graph evaluated against the same version of the policy file shall always produce the same verdict.

> Fit criterion: Given identical inputs (graph + policy version), the output is identical on every run. No randomness, sampling, or model temperature affects the core evaluation.

**NF-2 (Must):** The audit trail shall be immutable. No verdict, attestation, correction, or lifecycle event can be deleted or modified after it is recorded.

> Fit criterion: The audit trail is append-only. There is no delete or edit function for audit records. Historical records are readable but not writable.
>
> **V1 honest limitation:** NF-2 and NF-3 are directly contradictory for a client-side deployment. A local file or browser store is editable by definition — true immutability requires a server-backed, append-only store. V1 is therefore honestly positioned as **provisional / proof-of-concept grade** for audit purposes. Any deployment intended to produce a regulator-defensible audit trail requires V1.5 (append-only server store, even if minimal). This must be stated clearly to any bank deploying V1 as a system of record.

**NF-3 (Must):** No use case data shall leave the user's local environment in the MVP. The engine runs entirely client-side.

> Fit criterion: For MVP, no network requests are made during evaluation. The LLM-powered graph extraction uses a locally configured API key; if not configured, the system falls back to structured form intake. All data persists locally. See NF-2 for the honest implication of this constraint on audit-trail immutability.

> Fit criterion: For MVP, no network requests are made during evaluation. The LLM-powered graph extraction (UC-3) uses a locally configured API key; if not configured, the system falls back to a structured form intake. All data persists locally.

**NF-4 (Must):** The application shall run in any modern browser (Chrome, Firefox, Safari, Edge — latest two major versions) with no installation required beyond opening the application.

> Fit criterion: The application loads from a local file or simple web server. No npm install, no Docker, no configuration beyond the policy YAML and an optional LLM API key.

**NF-5 (Should):** A verdict shall be produced within 30 seconds of the submitter confirming the data-flow graph.

> Fit criterion: The policy engine evaluation (excluding LLM-powered intake steps) completes within 5 seconds. Total time from graph confirmation to verdict display does not exceed 30 seconds on a standard laptop.

**NF-6 (Must):** The policy file shall be human-readable without specialist tooling. YAML is the preferred format.

> Fit criterion: A risk manager with no programming background can read the policy file and understand what each rule means. Comments are supported in the file format.

---

## 6. Assumptions

- The bank's risk function has at least one person with sufficient domain knowledge to review and customise the starter policy file.
- The regulatory frameworks referenced in the starter policy file (SR 26-2, SS1/23, EU AI Act, OSFI E-23, MAS FEAT, DORA, FSA Japan) are applicable to global financial institutions; banks operating in a single jurisdiction will trim the policy file to their relevant regimes.
- MVP users are internal professionals (risk managers and developers). Consumer accessibility requirements (WCAG) do not apply to MVP.
- The LLM used for graph extraction (UC-3) is accessed via a bank-configured API key. The bank is responsible for data handling compliance for any data sent to the LLM provider.
- "Minimal control set" means the smallest combination of controls in the policy file's control library that satisfies all invariants — not the cheapest or easiest to implement. Cost-weighting of controls is a V2 feature.
- Typical street practice runs to hundreds of intake questions, with separate depth for PoC and production assessments. The pre-check is not intended to replace all of those — it owns the AI risk appetite evaluation and triggers the other required reviews (InfoSec, vendor, cloud, FinOps) as outputs.

---

## 7. Constraints

- **Regulator quality.** Every verdict must be traceable to a written policy rule, inputs must be attested, the audit trail must be immutable, and the verdict must be reproducible. A tool that produces non-defensible outputs is worse than no tool.
- **Bank's RAF is sacrosanct.** The engine reads the bank's own rules. It does not impose an external framework. The starter config is a starting point, not a mandate.
- **No sensitive data leaves the tool (MVP).** Client data, MNPI, and confidential business information must not be transmitted to external services during evaluation. The MVP is client-side.
- **Jurisdiction-aware by design.** A use case operating in multiple jurisdictions must receive the verdict appropriate to the most demanding applicable standard — automatically, without manual selection.
- **MVP is client-side, no backend.** No server, no database, no authentication infrastructure for V1. Policy is a file. Register is a file. This keeps it demoable, forkable, and deployable without IT involvement.

---

## 8. Out of Scope (MVP)

- **Board/CRO dashboard** (V2) — the §2 executive dashboard from the RAF template showing aggregate appetite posture and headline KRIs across the full estate.
- **Stakeholder notifications** (V2) — automated email, Teams, or Slack notifications to 2LoD and configured stakeholders when a use case is submitted or its status changes.
- **Full 2LoD approval workflow** (V2) — formal review-and-approve workflow with task assignment, deadlines, and escalation paths for High/Critical tier use cases.
- **Live KRI monitoring** (V2) — continuous monitoring of KRI conditions that automatically updates a verdict's status when a threshold is breached.
- **Control evidence binding** (V2) — linking each required control in a verdict to proof the control actually exists (config, log, attestation).
- **CI/CD pipeline enforcement** (V2) — blocking deployment when code does not implement the controls mandated by the pre-check verdict.
- **RAF import wizard** (V2) — guided translation of an existing bank RAF from Word/PDF into the engine's policy schema.
- **Shadow AI discovery** (V2) — network scanning or procurement gates to detect AI systems deployed without going through the pre-check.
- **Integrations** (V2) — connectors to ServiceNow, Jira, MLflow, model registries, Azure AI Foundry, Bedrock.
- **Multi-tenant hosted SaaS** (V2) — shared hosted deployment with per-bank isolation.
- **Multi-hundred-question assessment replacement** — the pre-check owns AI risk appetite evaluation. InfoSec, vendor, cloud, and FinOps assessments remain separate processes; the pre-check triggers them as required but does not replace them.

---

## 9. Open Questions

- **OQ-1:** What LLM provider should be used for graph extraction (UC-3) in the MVP? Options: OpenAI, Anthropic, local model. Affects data handling, cost, and offline capability. Deferred to `/gvm-tech-spec`.
- **OQ-2:** How should the register persist in the client-side MVP? Options: localStorage, local JSON file, IndexedDB. Deferred to `/gvm-tech-spec`.
- **OQ-3:** What is the minimal viable 2LoD review mechanism for High/Critical tier use cases in MVP (LC-3)? Options: status flag in register, email link, simple password-gated view. Deferred to `/gvm-tech-spec`.
- **OQ-4:** Should the similarity check for duplicate detection (UC-2) use LLM-based semantic comparison or keyword/tag matching in MVP? Semantic is more accurate; keyword is simpler and offline-capable. Deferred to `/gvm-tech-spec`.
- **OQ-5:** What is the exact format for the audit trail export? Needed to confirm compatibility with the bank's existing risk reporting tools. Deferred to user confirmation before `/gvm-tech-spec`.
- **OQ-PV-1:** How is an envelope expressed for ordinal dimensions (data class, autonomy — needs ≤ ceiling semantics) versus set dimensions (jurisdiction — needs subset semantics)? The policy schema must support both. Deferred to `/gvm-tech-spec`.
- **OQ-PV-2:** When a use case exceeds a platform envelope on one dimension, is the correct behaviour partial inheritance (inherit fitting dimensions, evaluate exceeded ones) or full fallback? PV-3 specifies per-dimension partial inheritance with coupled-cluster support as the default. Needs validation against a real bank's control dependencies before V1 ships — some controls may be tightly coupled such that exceeding one dimension should invalidate a whole cluster.
- **OQ-PV-3:** For firms without envelope-scoped platform approvals, should the tool offer a lightweight "define your platform envelope" onboarding flow, or degrade to asking the full question set until envelopes are defined? Affects time-to-value for less mature firms. Deferred to user confirmation.
- **OQ-6:** Who maintains regulatory override packs, and how are updates distributed? Three options exist: (1) the product owner maintains packs centrally and distributes updates to banks — aligns with the recurring subscription revenue model described in the viability risk assessment; (2) the bank's 2LoD team maintains their own packs — feasible but creates staleness risk if the bank misses a regulatory change; (3) hybrid — the product owner ships pack updates as a baseline and the bank can override locally for jurisdiction-specific interpretations. Option 1 is the most defensible from a regulator-quality standpoint and the strongest commercial lever; options 2 and 3 are fallbacks for banks that require full control over their policy files. This decision affects the V2 distribution model, pricing, and the update mechanism for RA-4 and RA-5. Must be resolved before V2 design begins.

---

## 10. Requirements Index

| ID | Domain | Summary | Priority | Version |
|----|--------|---------|----------|---------|
| UC-1 | Intake | Accept free-text description | Must | **V1** |
| UC-2 | Intake | Duplicate detection before intake | Must | **V1** |
| UC-3 | Intake | LLM extracts data-flow graph | Must | **V1** |
| UC-3a | Intake | Structured form fallback (no API key) | Must | **V1** |
| UC-4 | Intake | Risk-proportionate questions (≤15 Critical) | Must | **V1** |
| UC-5 | Intake | Contradiction detection | Must | **V1** |
| UC-6 | Intake | Graph confirmation / attestation | Must | **V1** |
| UC-7 | Intake | Correction recording | Must | **V1** |
| PE-1 | Policy Engine | Deterministic graph evaluation | Must | **V1** |
| PE-2 | Policy Engine | Triple-track classification | Must | **V1** |
| PE-3 | Policy Engine | Impact-dominant materiality tiering | Must | **V1** |
| PE-4 | Policy Engine | Hard line detection (immediate reject) | Must | **V1** |
| PE-5 | Policy Engine | Jurisdiction override packs | Must | **V1** |
| PE-6 | Policy Engine | Most demanding standard governs | Must | **V1** |
| PE-7 | Policy Engine | YAML policy file | Must | **V1** |
| PE-8 | Policy Engine | Starter config pre-loaded | Must | **V1** |
| CS-1 | Control Solve | Control set with safety margin | Must | **V1** |
| CS-2 | Control Solve | Reject when no set satisfies | Must | **V1** |
| CS-3 | Control Solve | Triggered downstream reviews | Must | **V1** |
| CS-4 | Control Solve | Residual risk margin display | Should | V1.5 |
| VD-1 | Verdict | Clear verdict display | Must | **V1** |
| VD-2 | Verdict | Exact invariant and graph path shown | Must | **V1** |
| VD-3 | Verdict | Correction flow with re-evaluation | Must | **V1** |
| VD-4 | Verdict | Immutable audit trail | Must | **V1** |
| VD-5 | Verdict | Policy and pack version recorded | Must | **V1** |
| VD-6 | Verdict | Living status field in data model | Should | **V1** |
| VD-7 | Verdict | Conditions block (hypothesis schema) | Must | **V1** |
| VD-8 | Verdict | Plain-English reasoning trace | Must | **V1** |
| LC-1 | Lifecycle | Use case stages | Must | **V1** |
| LC-2 | Lifecycle | Tier-driven governance process | Must | **V1** |
| LC-3 | Lifecycle | 2LoD review step | Should | V1.5 |
| LC-4 | Lifecycle | Re-evaluation triggers | Must | **V1** |
| LC-5 | Lifecycle | Re-evaluation triage | Must | V2+ |
| LC-6 | Lifecycle | AIGate passes its own pre-check | Must | **V1** |
| OB-1 | Observed Reality | Artifact attributes authoritative | Must | V1.5 |
| OB-2 | Observed Reality | Artifact contradiction detection | Must | V1.5 |
| OB-3 | Observed Reality | Read deployment manifests | Should | V2+ |
| OB-4 | Observed Reality | Read model config for autonomy | Should | V2+ |
| OB-5 | Observed Reality | Label artifact vs self-attested | Must | V1.5 |
| PV-1 | Platform & Vendor | Platform registry with envelopes | Must | V2+ |
| PV-2 | Platform & Vendor | Vendor/model registry | Must | V2+ |
| PV-3 | Platform & Vendor | Per-dimension envelope inheritance | Must | V2+ |
| PV-4 | Platform & Vendor | Ask only residual questions | Must | V2+ |
| PV-5 | Platform & Vendor | New vendor → full review, no inheritance | Must | V2+ |
| PV-6 | Platform & Vendor | Inheritance chain in audit trail | Must | V2+ |
| PV-7 | Platform & Vendor | Re-evaluate on approval change | Must | V2+ |
| PV-8 | Platform & Vendor | Starter registry with examples | Should | V2+ |
| RG-1 | Register | AI inventory (graph data model) | Must | **V1** |
| RG-2 | Register | Role-based access | Must | **V1** |
| RG-3 | Register | Filter and search | Should | **V1** |
| RG-4 | Register | Policy change diff | Should | V1.5 |
| RG-5 | Register | Export CSV/JSON | Could | **V1** |
| RG-6 | Register | Blast-radius queries | Should | V2+ |
| RG-7 | Register | Periodic sampling cadence | Should | V2+ |
| CF-1 | Configuration | YAML policy file | Must | **V1** |
| CF-2 | Configuration | Starter config pre-loaded | Must | **V1** |
| CF-3 | Configuration | Policy file versioning | Must | **V1** |
| CF-4 | Configuration | Versioned regulatory packs | Must | **V1** |
| CF-5 | Configuration | Policy file validation on load | Must | **V1** |
| RA-1 | Regulatory | Jurisdiction pack activation | Must | **V1** |
| RA-2 | Regulatory | Most demanding standard governs | Must | **V1** |
| RA-3 | Regulatory | Pack version in audit trail | Must | **V1** |
| RA-4 | Regulatory | Re-evaluation diff on pack update | Should | V1.5 |
| RA-5 | Regulatory | Stale assessment flag | Should | V1.5 |
| RA-6 | Regulatory | Regulatory timeline view | Could | V2+ |
| RA-7 | Regulatory | Primary source citation per rule | Must | **V1** |
| RA-8 | Regulatory | Confidence scoring per rule | Must | **V1** |
| RA-9 | Regulatory | Full reasoning chain in verdict | Must | **V1** |
| RA-10 | Regulatory | Pack updates: review changed sections only | Should | V1.5 |
| RA-11 | Regulatory | Medium/Low confidence caveat | Must | **V1** |
| RA-12 | Regulatory | Bank overrides cite competing text | Should | V1.5 |
| NF-1 | Non-Functional | Deterministic evaluation | Must | **V1** |
| NF-2 | Non-Functional | Immutable audit trail (V1 = provisional) | Must | **V1** |
| NF-3 | Non-Functional | No data leaves tool | Must | **V1** |
| NF-4 | Non-Functional | Runs in browser, no install | Must | **V1** |
| NF-5 | Non-Functional | Verdict within 30 seconds | Should | **V1** |
| NF-6 | Non-Functional | Human-readable policy file | Must | **V1** |
| NF-7 | Non-Functional | Pack rules require human sign-off | Must | **V1** |
| NF-8 | Non-Functional | Full reasoning chain in audit trail | Must | **V1** |
| NF-9 | Non-Functional | Staleness warning at rule level | Should | V1.5 |
| NF-10 | Non-Functional | Translation-fidelity attestation | Must | **V1** |

---

## 11. Priority Model

- **Must** — Without this, the product fails its core purpose. Present at launch.
- **Should** — High value; included unless time or complexity prevents it. Strong candidate for MVP if feasible.
- **Could** — Useful enhancement; included only if Musts and Shoulds are complete with capacity remaining.
- **Won't (this version)** — Explicitly deferred to V2. Captured to prevent scope creep, not to dismiss the idea.

---

*Developed using the Grounded Vibe Methodology*
