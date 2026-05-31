# GVM Initialisation Report — AI Risk Appetite Pre-Check Engine

**Date:** May 2026  
**Project:** ai-raf-precheck  
**Project root:** `/Users/kshitijoza/RAF`  
**GitHub:** https://github.com/oza977-max/ai-raf-precheck (private)  
**Business domain:** Financial Services — AI Risk Governance (Regulated Industry)  
**Pipeline phase:** Init (pre-requirements)

---

## Expert Panel

| Expert | Work | Tier | Role in This Project |
|--------|------|------|----------------------|
| Paul Clements | *Documenting Software Architectures* (2nd ed.) | Tier 1 | Specification decomposition — which views are needed |
| Simon Brown | *Software Architecture for Developers*, C4 Model | Tier 1 | Architecture visualisation, container boundaries |
| George Fairbanks | *Just Enough Software Architecture* | Tier 1 | Risk-driven depth calibration |
| Michael Keeling | *Design It!* | Tier 1 | ADR-style decision capture |
| Kent Beck | *Test-Driven Development: By Example* | Tier 1 | Outside-in TDD discipline throughout the build |
| Martin Fowler | *Patterns of Enterprise Application Architecture*, *Refactoring* | Tier 1 | Pragmatic patterns; anti-bloat lens |
| Steve McConnell | *Code Complete* (2nd ed.) | Tier 1 | Code construction discipline |
| NIST | *AI Risk Management Framework (AI RMF 1.0)* | Tier 2b | Govern/Map/Measure/Manage framework; trustworthiness characteristics |
| EU AI Act | *Regulation (EU) 2024/1689* | Tier 2b | Annex III high-risk classification; transparency obligations |
| Federal Reserve / OCC / FDIC | *SR 26-2* (2026) | Tier 2b | US MRM scope (GenAI excluded pending RFI); triple-track rationale |
| PRA | *SS1/23* (2023) | Tier 2b | UK technology-agnostic MRM; the ceiling for global firms |
| MAS | *FEAT Principles* (2019) | Tier 2b | Singapore fairness/ethics/accountability/transparency obligations |
| OSFI | *Guideline E-23* (2027) | Tier 2b | Canada's broadest-definition MRM; Track II extension for Canadian entities |
| Cathy O'Neil | *Weapons of Math Destruction* | Tier 2b | Algorithmic bias; conduct risk from AI; opacity/scale/harm framework |
| Stuart Russell | *Human Compatible* | Tier 2b | Agentic AI control; corrigibility; minimal footprint; autonomy levels |
| Virginia Eubanks | *Automating Inequality* | Tier 2b | Algorithmic accountability; attestation as accountability mechanism |
| Emanuel Derman | *Models.Behaving.Badly* | Tier 2b | Model risk philosophy; limitations of models as analogies |
| Christoph Molnar | *Interpretable Machine Learning* (2nd ed.) | Tier 2b | Explainability; SHAP/LIME for Track II model validation |
| Nassim Nicholas Taleb | *The Black Swan*, *Statistical Consequences of Fat Tails* | Tier 2b | Tail risk; model fragility; skin in the game |
| Philippa Girling | *Operational Risk Management* (2nd ed.) | Tier 2b | KRI design; three lines of defence; risk appetite in measurable terms |
| James Lam | *Enterprise Risk Management* (2nd ed.) | Tier 2b | ERM integration; risk appetite framework cascading |
| COSO | *Enterprise Risk Management — Integrating with Strategy and Performance* (2017) | Tier 2b | Governance and culture; risk appetite definition and monitoring |

---

## 1. Executive Summary

The Grounded Vibe Methodology has been initialised for the **AI Risk Appetite Pre-Check Engine** — a tool that models AI use cases as data-flow graphs and evaluates them against a bank's machine-readable Risk Appetite Framework (RAF), returning a deterministic verdict: in/out of appetite, what invariant was violated, the binding constraint, and the minimal control set to satisfy it.

**Business domain:** Financial Services — AI Risk Governance. A deeply regulated, multi-jurisdictional domain with rapidly evolving regulatory expectations and significant consequences for non-compliance.

**Domain summary:** The domain is unusually rich in authoritative sources. Five major regulatory frameworks are directly in scope (SR 26-2, SS1/23, EU AI Act, MAS FEAT, OSFI E-23), and they materially disagree — particularly on whether generative AI falls within model risk management scope. This disagreement is not a gap to be filled; it is the core design problem the triple-track classification system solves. The expert roster has been calibrated to hold all five frameworks simultaneously and reason about their interactions.

**A critical gap was identified and filled:** No AI Governance industry domain file existed in the GVM reference library. This file has been created at `~/.claude/skills/gvm-design-system/references/industry/ai-governance.md` and covers: NIST AI RMF, EU AI Act, SR 26-2, SS1/23, MAS FEAT, OSFI E-23, Cathy O'Neil, Stuart Russell, and Virginia Eubanks.

---

## 2. Process Experts (Tier 1)

Tier 1 defaults confirmed without modification. For a regulated financial services domain, all Tier 1 process experts remain appropriate:

- **Clements** governs how the system is decomposed into specs — particularly important given the multi-dimensional nature of the pre-check (policy engine, graph model, control library, jurisdiction packs, certificate model).
- **Brown (C4)** provides the visualisation framework for the architecture overview (Context → Containers → Components).
- **Fairbanks** calibrates depth per domain — the policy engine and jurisdiction logic are high-risk and warrant rigorous treatment; the UI shell is lower-risk and warrants lighter treatment.
- **Beck** enforces outside-in TDD throughout the build — every invariant in the policy engine should be a failing test before implementation begins.
- **Fowler** keeps the implementation pragmatic and maintainable — the policy engine must remain simple enough for a 2LoD risk manager to reason about, not just a developer.

No Tier 1 adjustments required. The defaults are appropriate for this domain.

---

## 3. Industry Domain (Tier 2b)

**Five domain files activated:** model-risk, operational-risk, credit-risk, market-risk, and the newly created ai-governance.

### Domain coverage assessment

| Domain | Relevance to this project | Key experts activated |
|---|---|---|
| **AI Governance** (NEW) | **Core** — the primary domain; contains all major regulatory frameworks | NIST AI RMF, EU AI Act, SR 26-2, SS1/23, MAS FEAT, OSFI E-23, O'Neil, Russell, Eubanks |
| **Model Risk** | **Core** — Track I/II classification, MRM validation standards, explainability | Derman, Molnar, Taleb, SR 11-7, SS1/23 |
| **Operational Risk** | **Core** — KRI design, three lines of defence, risk appetite framework, RCSA | Girling, Chapelle, Lam, COSO, BCBS 195 |
| **Credit Risk** | **Supporting** — credit scoring is an Annex III high-risk use case; forces Critical tier | Altman, IFRS 9/CECL, Basel credit framework |
| **Market Risk** | **Supporting** — trading use cases define the "do not accept" hard lines | Jorion, FRTB |

### Gap identified and filled: AI Governance

No AI governance domain file existed in GVM's reference library. The project's core domain — governing AI deployment in regulated financial institutions — had no named authoritative coverage. This would have produced undifferentiated output on the most important domain questions.

**New file created:** `~/.claude/skills/gvm-design-system/references/industry/ai-governance.md`

**Expert discovery results:**

| Expert | Work | Classification | Status |
|--------|------|----------------|--------|
| NIST | *AI RMF 1.0* (2023) | Canonical | Newly added |
| EU AI Act | *Regulation (EU) 2024/1689* | Canonical | Newly added |
| Federal Reserve/OCC/FDIC | *SR 26-2* (2026) | Canonical | Newly added |
| PRA | *SS1/23* (2023) | Canonical | Newly added (also in model-risk.md) |
| MAS | *FEAT Principles* | Established | Newly added |
| OSFI | *Guideline E-23* | Canonical | Newly added |
| Cathy O'Neil | *Weapons of Math Destruction* | Established | Newly added |
| Stuart Russell | *Human Compatible* | Established | Newly added |
| Virginia Eubanks | *Automating Inequality* | Established | Newly added |

All nine experts have been scored and persisted. No unscored experts remain.

### Regulatory divergence: the design problem that experts must hold simultaneously

The five regulatory frameworks do not agree on a core question: is generative AI a "model" subject to Model Risk Management?

| Framework | Position on GenAI | Implication |
|---|---|---|
| SR 26-2 (US, 2026) | **Excluded** from MRM pending RFI | Governance vacuum; Track III AI Governance minimum applies |
| SS1/23 (UK, 2023) | **Included** — technology-agnostic | Most demanding; sets the ceiling for global firms |
| OSFI E-23 (Canada, 2027) | **Included** — broadest definition of any jurisdiction | Canadian entities face the most inclusive MRM scope |
| EU AI Act (EU, 2024) | **Parallel regime** — high-risk system classification, not MRM | Annex III (credit, employment) → forced Critical tier |
| MAS FEAT (Singapore) | **Principles-based** — AI that influences decisions is in scope | Explainability and accountability mandatory |

The expert roster is calibrated to reason about all five simultaneously. The triple-track classification system (Track I Traditional MRM / Track II AI-on-MRM / Track III AI Governance) is the engine that navigates this divergence deterministically.

---

## 4. Expert Roster Summary

| Expert | Work | Tier | Classification | Reference File | Status |
|--------|------|------|----------------|----------------|--------|
| Paul Clements | *Documenting Software Architectures* (2nd ed.) | Tier 1 | Established | architecture-specialists.md | Existing |
| Simon Brown | *Software Architecture for Developers*, C4 Model | Tier 1 | Established | architecture-specialists.md | Existing |
| George Fairbanks | *Just Enough Software Architecture* | Tier 1 | Recognised | architecture-specialists.md | Existing |
| Michael Keeling | *Design It!* | Tier 1 | Recognised | architecture-specialists.md | Existing |
| Bass, Clements, Kazman | *Software Architecture in Practice* (4th ed.) | Tier 1 | Canonical | architecture-specialists.md | Existing |
| Frederick Brooks | *The Mythical Man-Month* | Tier 1 | Canonical | architecture-specialists.md | Existing |
| Martin Fowler | *Patterns of Enterprise Application Architecture* | Tier 1 | Canonical | architecture-specialists.md | Existing |
| Steve McConnell | *Code Complete* (2nd ed.) | Tier 1 | Established | architecture-specialists.md | Existing |
| Robert C. Martin | *Clean Code* | Tier 1 | Established | architecture-specialists.md | Existing |
| Kent Beck | *Test-Driven Development: By Example* | Tier 1 | Canonical | architecture-specialists.md | Existing |
| Sandi Metz | *Practical Object-Oriented Design* (2nd ed.) | Tier 1 | Established | architecture-specialists.md | Existing |
| Mike Cohn | *Agile Estimating and Planning* | Tier 1 | Established | architecture-specialists.md | Existing |
| NIST | *AI Risk Management Framework (AI RMF 1.0)* | Tier 2b | Canonical | industry/ai-governance.md | Newly added |
| EU AI Act | *Regulation (EU) 2024/1689* | Tier 2b | Canonical | industry/ai-governance.md | Newly added |
| Federal Reserve/OCC/FDIC | *SR 26-2* (2026) | Tier 2b | Canonical | industry/ai-governance.md | Newly added |
| PRA | *SS1/23* (2023) | Tier 2b | Canonical | industry/ai-governance.md | Newly added |
| MAS | *FEAT Principles* (2019) | Tier 2b | Established | industry/ai-governance.md | Newly added |
| OSFI | *Guideline E-23* (eff. 2027) | Tier 2b | Canonical | industry/ai-governance.md | Newly added |
| Cathy O'Neil | *Weapons of Math Destruction* | Tier 2b | Established | industry/ai-governance.md | Newly added |
| Stuart Russell | *Human Compatible* | Tier 2b | Established | industry/ai-governance.md | Newly added |
| Virginia Eubanks | *Automating Inequality* | Tier 2b | Established | industry/ai-governance.md | Newly added |
| Emanuel Derman | *Models.Behaving.Badly* | Tier 2b | Established | industry/model-risk.md | Existing |
| Christoph Molnar | *Interpretable Machine Learning* (2nd ed.) | Tier 2b | Established | industry/model-risk.md | Existing |
| Nassim Nicholas Taleb | *The Black Swan*, *Statistical Consequences of Fat Tails* | Tier 2b | Canonical | industry/model-risk.md | Existing |
| Philippa Girling | *Operational Risk Management* (2nd ed.) | Tier 2b | Established | industry/operational-risk.md | Existing |
| Ariane Chapelle | *Operational Risk Management: Best Practices* | Tier 2b | Established | industry/operational-risk.md | Existing |
| James Lam | *Enterprise Risk Management* (2nd ed.) | Tier 2b | Established | industry/operational-risk.md | Existing |
| COSO | *ERM — Integrating with Strategy and Performance* (2017) | Tier 2b | Canonical | industry/operational-risk.md | Existing |
| BCBS | *Basel III* | Tier 2b | Canonical | industry/credit-risk.md | Existing |
| Edward Altman | *Corporate Financial Distress* (4th ed.) | Tier 2b | Canonical | industry/credit-risk.md | Existing |
| Philippe Jorion | *Value at Risk* (3rd ed.) | Tier 2b | Established | industry/market-risk.md | Existing |
| John Hull | *Options, Futures, and Other Derivatives* (11th ed.) | Tier 2b | Canonical | industry/market-risk.md | Existing |

**Total: 31 experts active.** 9 newly added (all in new ai-governance.md). 22 existing. 0 unscored.

---

## 5. Activation Log

Initialised at: `~/.claude/gvm/expert-activations.csv`  
Entries written: 20 rows (skill: /gvm-init, phase: calibration)  
Prior entries: 0 (first project)

---

## 6. Next Steps

The expert roster is calibrated and the project is ready to proceed through the GVM pipeline.

**Immediate next step:** Run `/gvm-requirements`

The requirements phase will:
- Use `grounding/raf-extraction.md` and `grounding/ai-raf-template.html` as verbatim domain reference files
- Elicit requirements grounded in the expert roster assembled here
- Produce `requirements/requirements-001.md` and `.html`

**Subsequent phases:**
```
/gvm-requirements → /gvm-test-cases → /gvm-tech-spec → /gvm-design-review →
/gvm-walking-skeleton → /gvm-build → /gvm-code-review → /gvm-test →
/gvm-doc-write → /gvm-doc-review → /gvm-deploy
```

**Stack decision:** deferred to `/gvm-tech-spec`. Proposed direction (from pre-pipeline discussion): Vite + React + TypeScript, policy in YAML/JSON, client-side MVP. Stack specialists will activate at tech-spec time.

**Key design decision to resolve in requirements:** How the engine handles the "intake problem" — ensuring that the data-flow graph constructed from a use case description is trustworthy, not just what the developer said it was. This is the most important unsolved design question and the one that separates the pre-check from a rubber stamp.

---

*Developed using the Grounded Vibe Methodology*
