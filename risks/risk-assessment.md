---
schema_version: 1
---

# Risk Assessment — AI Risk Appetite Pre-Check Engine

Prepared from product brainstorming sessions (May 2026). Reviewed by project owner before requirements started.

---

## Value Risk

The demand signal is strong and multi-layered. Banks are under simultaneous pressure from five regulatory regimes — SR 26-2 (US), SS1/23 (UK), EU AI Act, OSFI E-23 (Canada), and MAS FEAT (Singapore) — with enforcement timelines converging in 2026 and 2027. Each of these creates a forcing function: banks must demonstrate auditable, defensible AI governance or face regulatory censure. The current state — manual Word-document frameworks and one-time Big 4 consulting engagements — is structurally incapable of scaling to the AI estates banks are now building. The Second Line of Defence is the documented bottleneck, and the bottleneck is not a people problem but a tooling problem. The pre-check engine directly addresses this by making risk appetite executable rather than interpretive. Value risk is mitigated further by the builder's own firm being a first customer — internal use provides a validation loop that is independent of external sales. The risk that remains is adoption speed: financial institutions move slowly on tooling, particularly in risk functions where change management is conservative. This is a real friction point but not a value question — the problem exists regardless of how long it takes to address.

questioner: Kshitij Oza

---

## Usability Risk

The primary users are risk professionals (2LoD), not software engineers. This is a significant usability constraint. The tool must produce outputs that a CRO or Head of AI Risk can present to a Board Risk Committee without translation — the language must be governance-native (Track I/II/III, Critical/High/Medium/Low, Accept/Tolerate/Reject), not technical. The intake flow is the single biggest usability risk: if submitting a use case requires a developer to accurately self-describe data flows, autonomy levels, and jurisdictional exposure, the system will be gamed — not out of malice, but out of optimism and deadline pressure. The meeting-notes copilot that "accidentally" touches MNPI is the canonical failure mode. Mitigation requires disambiguation prompts that catch contradictions, not just a form that accepts whatever is typed. A secondary usability risk is configuration — the bank's RAF must be expressible in the engine's schema without specialist help. The starter configuration (derived from the AI Risk Appetite Supplement template) must be functional out of the box, with bank-specific overlays added incrementally. If initial setup requires a consultant, the product has failed on usability for its primary adopter.

questioner: Kshitij Oza

---

## Feasibility Risk

The core engine — evaluating a data-flow graph against a set of RAF invariants and solving for the minimal satisfying control set — is technically feasible. It is essentially a constraint satisfaction problem over a small, bounded search space (the control library has approximately 10-15 controls; the invariant set for a typical bank RAF has 20-40 rules). The solver does not require machine learning or probabilistic methods; it is deterministic, which is exactly what auditability demands. The two technically hard problems are: first, the intake problem — reliably extracting a structured, trustworthy data-flow graph from a natural-language use case description, including detecting when self-attested claims are internally inconsistent; and second, the jurisdiction override logic — correctly applying the most demanding applicable standard when a use case spans multiple regulatory regimes. Both are solvable but require careful design. The regulatory pack maintenance problem — keeping SR 26-2, EU AI Act, SS1/23, and the others current as they evolve — is an operational feasibility risk rather than a technical one. The MVP is client-side with no backend, which eliminates an entire class of infrastructure, security, and compliance concerns for the initial build and makes it forkable and demoable without installation.

A specific feasibility risk that requires a design decision before V2: the regulatory pack update workflow is not yet specified. The requirements establish that override packs (SR 26-2, SS1/23, EU AI Act, OSFI E-23, MAS FEAT, DORA, FSA Japan) are versioned files that can be updated independently — but they do not define who updates them, through what mechanism, or how updates reach deployed instances. Three options exist: centralised maintenance by the product owner with distribution to banks (the strongest commercial and governance case, aligning with the recurring subscription model); bank-maintained packs (feasible but creates staleness risk); or a hybrid where the product owner ships a baseline and banks override locally. The technical feasibility of each option differs: centralised distribution requires a delivery mechanism (package registry, signed download, or manual release); bank-maintained requires tooling to help 2LoD track regulatory changes; hybrid requires a merge and override model in the policy file schema. This is captured as OQ-6 in the requirements and must be resolved before V2 architecture is designed.

questioner: Kshitij Oza

---

## Viability Risk

The addressable market is approximately one thousand banks globally with material AI programmes, at an estimated annual contract value of two hundred thousand to one million dollars per institution for regulatory infrastructure tooling. This is a viable commercial market even at modest penetration. The recurring revenue layer — regulatory pack subscriptions that update when SR 26-2 RFI lands, EU AI Act Annex III kicks in December 2027, or OSFI E-23 takes effect January 2027 — creates the renewal mechanism that transforms a one-time tool into a subscription business. The primary viability risk is that the Big Four consulting firms, once they observe a working product, will build equivalent tooling or acquire the company before it reaches scale. This is a real competitive risk but also a validation signal and an exit path. A secondary viability risk is that the builder uses the tool internally without commercialising it, in which case viability is not the question — value has still been delivered, and the business case can be revisited. The moat against fast-following competitors is the encoded regulatory pack library, the AI inventory that accumulates per bank over time (high switching cost), and the depth of bank-native vocabulary that horizontal governance platforms have not and will not develop because their commercial incentive is breadth, not depth.

questioner: Kshitij Oza
