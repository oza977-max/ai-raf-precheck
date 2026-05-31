# Application Brief — AI Risk Appetite Pre-Check Engine

**Date:** May 2026  
**Prepared by:** Kshitij Oza  
**Status:** Draft — for review

---

## 1. Problem Statement

Banks are deploying AI faster than their risk frameworks can absorb it. Every business line wants generative AI. Every competitor is adopting it. But the Second Line of Defence (2LoD) — the risk function that governs AI adoption — is drowning.

The specific challenge is threefold:

**Bottleneck.** Risk managers review AI tools the same way they reviewed spreadsheet models: Word documents, committee meetings, bespoke memos. A single use case can take three months to clear. By the time it clears — or is killed — the developer has already built it, or the business has moved on.

**Inconsistency.** Because each review is a human judgment call, two identical use cases submitted by different teams can receive different outcomes. There is no canonical, repeatable answer to "is this in appetite?" That inconsistency is itself a regulatory risk.

**Blind spots.** Self-attested intake is gameable. A developer who says "internal productivity tool, no client data" when the tool actually summarises client calls and feeds into regulated records will pass most manual reviews — because nobody asks the right follow-up question.

The consequence: things slip through that shouldn't. Or things are blocked that should be approved. And when the PRA, Fed, or EU supervisor walks in, there is no audit trail — only a pile of emails and slide decks.

---

## 2. Proposed Solution

A **pre-check engine** that sits between "I have an idea for an AI tool" and "we build it."

The use case is modelled as a data-flow graph: what data flows in, what decisions or actions come out, how autonomous the system is, what jurisdictions it touches. The bank's Risk Appetite Framework (RAF) — specifically its AI Risk Appetite Supplement — is expressed as a set of invariants over that graph (the machine-readable version of "we don't allow MNPI to flow to an external model in open cloud").

The engine runs the graph against the invariants and returns:
- **In / out of appetite** — a clear verdict
- **What tripped** — the exact invariant violated, and on which path in the graph
- **The binding constraint** — the single dimension that's driving the verdict
- **The minimal control set** — the smallest combination of controls (zone restriction, human gate, grounding, version pinning, etc.) that brings it inside appetite — or "cannot satisfy: reject"

This is deterministic, reproducible, and jurisdiction-aware: the same use case correctly gets a different verdict in the UK (SS1/23 includes it in MRM) vs the US (SR 26-2 excludes GenAI from MRM, pending RFI).

The engine issues an attested certificate per use case — a living object with a status that can self-revoke if KRI conditions are breached after approval.

---

## 3. Value Proposition

**For the CRO:** AI risk review stops being the bottleneck that slows AI adoption. Every use case has a documented, auditable verdict — derived from the bank's own rules, not a consultant's opinion. When the regulator asks, you hand them a register, not a pile of emails.

**For the 2LoD team:** The engine handles the mechanical classification (Track I/II/III, Tier Critical/High/Medium/Low, jurisdiction override) and the minimal-control solve. The risk team focuses on edge cases, policy calibration, and escalations — the work that actually requires judgment.

**For the business:** Clear, fast answers on day one instead of three months of uncertainty. "Build this and add these three controls" beats "it's under review."

**The key differentiator:** This is not a one-time snapshot (the Big 4 deliverable). The certificate is a standing condition: it stays green only while the controls hold. When a KRI breaches — model drift, override rate drops, silent vendor substitution detected — the certificate turns amber or red automatically. That is what transforms governance from a paper exercise into something a regulator can rely on.

---

## 4. Existing Landscape

**Manual frameworks (Word docs / Big 4 consulting):** The current state. Expensive, slow, non-repeatable, non-living. A $500K–$2M engagement produces a document that is stale the day after approval.

**Horizontal AI governance tools (Credo AI, Holistic AI, ModelOp, Arthur, Robust Intelligence):** General-purpose AI governance platforms. None speak RAF/3LoD/MRM natively. They are not jurisdiction-aware at the level of SS1/23 vs SR 26-2. They do not understand triple-track classification, impact-dominant tiering, or the autonomy-level framework that regulators expect. Being narrow — deeply bank-shaped — is the moat.

**Internal build:** Some large banks are attempting to build this themselves. The gap is the regulatory content (the encoded packs for SR 26-2, SS1/23, EU AI Act Annex III, OSFI E-23, MAS FEAT) and the minimal-control solver — neither of which is a natural internal capability.

---

## 5. High-Level Solution Shape

- **Type:** Web application (MVP: client-side, local; V2: hosted SaaS with bank-controlled deployment)
- **Users:** Small team initially — CRO/Head of AI Risk (2LoD), AI developers submitting use cases (1LoD)
- **Scale:** Team → department → enterprise-wide as adoption grows
- **Connects to:**
  - The bank's RAF / AI Risk Appetite Supplement (as a configuration file — YAML/JSON)
  - An AI use case register (internal — output of the engine accumulates here)
  - Regulatory content packs (SR 26-2, SS1/23, EU AI Act Annex III, OSFI E-23, MAS FEAT — maintained and updated as regulations evolve)
  - (V2) KRI monitoring feeds that can trigger certificate status changes

The bank's RAF is the config — they bring their own rules, thresholds, and committee names. The engine, schema, and regulatory packs are the reusable IP.

---

## 6. Stakeholders and Users

| Role | Relationship to product |
|---|---|
| **CRO / Board Risk Committee** | Approval authority; primary audience for the Board-level register and certificate evidence |
| **Head of AI Risk (2LoD)** | Owner and primary operator; configures the RAF, reviews escalations, uses the register |
| **AI developers / product teams (1LoD)** | Submit use cases; consume verdicts and the minimal control set |
| **Internal Audit (3LoD)** | Consume certificate evidence as part of AI governance audit |
| **Regulators (PRA, Fed, MAS, etc.)** | Consume the attested register and audit trail on request |
| **Kshitij Oza (builder / owner)** | Also a potential internal user — the tool addresses a real problem in the builder's own firm |

---

## 7. Constraints

- **Regulator quality or not at all.** The verdict must be traceable to a written policy, inputs must be attested, the audit trail must be immutable, and the verdict must be reproducible. A tool that produces non-defensible outputs is worse than no tool.
- **Bank's RAF is sacrosanct.** The engine reads the bank's own rules; it does not impose an external framework. The starter configuration is derived from the AI Risk Appetite template (`grounding/ai-raf-template.html`) but every bank can override it.
- **No sensitive data leaves the tool.** For MVP, the engine runs locally. In V2, it runs in the bank's own cloud or on-premises.
- **Jurisdiction-aware by design.** A use case that is in appetite under SR 26-2 may be out of appetite under SS1/23. The engine must handle this correctly without manual intervention.
- **MVP is local and client-side.** No backend, no authentication, no database for V1. The policy is a file. The register is a file. This keeps it demoable and forkable.

---

## 8. Possible Outcomes

This brief documents the case for building the pre-check engine. The approval authority may:

- **Approve** — proceed to `/gvm-requirements`
- **Approve with conditions** — scope changes, constraint additions (e.g. "MVP must be single-bank only, not SaaS")
- **Absorb into existing project** — redirect scope to an existing AI governance programme
- **Defer** — merit acknowledged, timing not right
- **Decline** — business case does not justify investment

---

*Developed using the Grounded Vibe Methodology*
