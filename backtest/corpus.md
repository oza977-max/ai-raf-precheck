# Back-test corpus — AIGate

**Purpose.** Establish whether the engine reaches the decisions your governance
would actually reach. This is the kill-or-continue test from the design
vision: *if verdicts need constant human override, stop building and write the
paper instead.*

**How this corpus was designed.** Two axes, deliberately:

1. **Realism** — grouped by the [Financial Stability Board's four AI use-case
   categories](https://www.fsb.org/uploads/P101025.pdf): customer-focused
   (front-office), operations-focused (back-office), trading and portfolio
   management, and RegTech/compliance. Every case is a thing banks actually do.
2. **Coverage** — each case is chosen to exercise a *specific decision boundary*
   in your rulebook. Industry breadth alone would over-sample the easy middle
   and miss the edges. Coverage of the rules is what makes a back-test
   conclusive rather than merely reassuring.

**Pairs matter most.** Where two cases differ by exactly one variable
(marked ⇄), they are the sharpest test available: if the engine cannot
separate a pair, the premise is in trouble regardless of how the other cases
score.

---

## What "historical outcome" means, and what is needed from you

For each case, three columns must be filled **before** you run it in AIGate:

| Column | Meaning | Who supplies it |
|---|---|---|
| **Predicted** | What you expect AIGate to say, written before you look | You |
| **Historical outcome** | What your governance *actually decided* when a use case of this shape went through — approved / approved with conditions / rejected; the tier or model-risk rating assigned; the controls required; any reviews triggered | **You. This cannot be researched.** |
| **AIGate said** | The verdict the tool produced | The tool |

**"Historical outcome" is the ground truth.** A published article saying a bank
uses AI for fraud detection tells you the use case exists; it tells you nothing
about what that bank's risk committee decided, what tier they assigned, or what
controls they demanded. That knowledge lives in committee minutes, model
inventories, and the heads of the people who sat in the room.

This is why the corpus below can be built from public sources but the back-test
cannot. **The scenarios are researchable. The decisions are not.**

### If you have no historical decision for a case

Say so and mark it `—`. A case with no ground truth still has value as a
*prediction* test (does the engine agree with your professional judgement?),
but it cannot settle the thesis. Be honest about which is which — a corpus
where half the outcomes are guesses, presented as evidence, is worse than a
smaller honest one.

### Confidentiality — read before filling anything in

Real use cases plus real committee decisions are the most sensitive material
this project will ever touch, and **this repository is public**. Fill in
`backtest/outcomes-local.md`, which is gitignored and never committed. Keep
names, systems, desks and figures out of the public corpus below — the shapes
are what matter, not the identities.

---

## Coverage map

Every hard line, track and tier is exercised at least once. Invariants marked
where a case is the primary test for one.

| Boundary | Cases |
|---|---|
| HL-001 autonomous + irreversible + client-facing | B-04 |
| HL-002 MNPI outside Zone C | A-02 ⇄ |
| HL-003 autonomous credit decision, no human | C-03 ⇄ |
| HL-004 autonomous trading | D-02 ⇄ |
| HL-005 irreversible above autonomy L1 | E-04 |
| TRACK-I traditional MRM | C-01, D-01 |
| TRACK-II AI on MRM | A-01, C-02, F-01 |
| TRACK-II-REPLACE replaces a prior model | C-05 |
| TRACK-II-AUTONOMY autonomy ≥ 3 | E-03 |
| TRACK-III AI governance (gen/agentic, non-binding) | B-01, B-02 |
| Tier Critical | C-02, C-03, D-02, G-01 |
| Tier High | A-01, B-03, E-01, F-02 |
| Tier Medium | A-01, E-02 |
| Tier Low | B-01, B-02 |
| Unsatisfiable invariant (rejection, not hard line) | A-02 |
| Jurisdiction packs | G-01 EU, G-02 UK, G-03 US, G-04 CA, G-05 SG+JP |
| Platform inheritance (PV-3) | H-01 ⇄ H-02 |
| Unapproved vendor (PV-5) | H-03 |

---

## A · Front office — market and client reporting

**A-01 · Daily VaR and IRC commentary** ⇄ *pairs with A-02*
> Drafts day-on-day market risk commentary from overnight VaR, stressed VaR and
> IRC moves plus desk P&L attribution. A market risk manager approves every
> commentary before it circulates.

Tests: TRACK-II baseline, Medium/High tier, INV-TRACK2-01, INV-HALLUC-01.

**A-02 · The same tool, with private-side names added** ⇄ *one variable changed*
> As A-01, but the input now includes an unannounced-transaction watchlist —
> price-sensitive information — and the model runs on the vendor-hosted service.

Tests: **HL-002 / INV-ZONE-01.** The single most important pair in the corpus:
the tool is identical, the data class is not. If the engine cannot separate
A-01 from A-02 it has not understood the appetite at all.

---

## B · Front office — assistance and productivity

**B-01 · Coding assistant for risk analysts**
> Agentic assistant proposing reconciliation scripts and data-quality checks.
> Analysts review and apply every change themselves.

Tests: TRACK-III, Low tier, INV-AGENT-01 (tool-call logging, kill switch).

**B-02 · Internal document search and summarisation**
> Retrieval over internal policy and procedure documents; answers carry
> citations. Read-only, no decision authority.

Tests: TRACK-III, INV-CITE-01, the clean low-tier path.

**B-03 · Client-facing wealth chatbot**
> Answers wealth clients' product and portfolio questions in natural language,
> with a human adviser escalation route.

Tests: High tier, **INV-DISCLOSE-01** (EU AI Act Art. 50, live 2 Aug 2026),
INV-CONDUCT-01, INV-ESCALATE-01.

**B-04 · Autonomous client communications**
> Generates and sends client emails about account changes with no human review;
> messages cannot be recalled once sent.

Tests: **HL-001.** Autonomy L4 + irreversible + client-facing.

---

## C · Credit

**C-01 · Retail credit scorecard (traditional)**
> Logistic scorecard producing a probability of default that feeds the lending
> decision. Statistical, no ML.

Tests: TRACK-I, INV-DRIFT-01, the traditional-MRM route.

**C-02 · Credit review drafting and covenant monitoring** ⇄
> Summarises financial spreads and covenant history into annual review memos.
> The credit officer owns the rating and the final review.

Tests: Critical tier via decision_type, INV-DATA-01 (Client PII),
INV-EXPLAIN-01.

**C-03 · Autonomous credit-line reduction** ⇄ *C-02 with the human removed*
> Automatically reduces limits on deteriorating retail accounts with no human
> review; customers are notified afterwards.

Tests: **HL-003.** The pair with C-02 isolates human oversight as the variable.

**C-04 · Collections prioritisation**
> Ranks delinquent accounts for collections contact. Advisory to the
> collections team; affects vulnerable customers.

Tests: conduct risk on a non-obvious path — INV-CONDUCT-01 without a
client-facing interface.

**C-05 · Replacing an existing PD model with a gradient-boosted one**
> Same purpose, same output, new technique. The incumbent model is retired.

Tests: **TRACK-II-REPLACE.** The only case exercising replaces_prior_model.

---

## D · Trading and portfolio management

**D-01 · Execution-cost / market-impact estimation**
> Estimates market impact to inform execution strategy. Traders decide.

Tests: TRACK-I, advisory bindingness, market data.

**D-02 · Autonomous execution agent** ⇄ *D-01 with authority*
> Places and adjusts orders within pre-set limits, no human checkpoint.

Tests: **HL-004.** Pair with D-01 isolates decision authority.

**D-03 · Research summarisation for portfolio managers**
> Summarises sell-side research and internal notes for PMs. Advisory.

Tests: INV-HALLUC-01 grounding on material decisions.

---

## E · Back office and operations

**E-01 · Operational-risk event classification and RCSA drafting**
> Classifies incidents into the taxonomy and drafts RCSA narratives. Risk
> managers review.

Tests: Medium/High, INV-SAMPLE-01 (recommendation at scale).

**E-02 · Reconciliation break investigation**
> Investigates and proposes causes for reconciliation breaks. Ops confirms.

Tests: Medium tier, internal-shared exposure.

**E-03 · Payment exception auto-repair**
> Repairs malformed payment instructions within defined tolerances and releases
> them, acting independently inside a pre-approved scope.

Tests: **TRACK-II-AUTONOMY** (autonomy ≥ 3).

**E-04 · Automated data deletion for retention compliance**
> Identifies and deletes records past their retention period. Deletion is
> irreversible.

Tests: **HL-005** (irreversible above L1).

---

## F · RegTech and compliance

**F-01 · AML transaction-monitoring alert triage**
> Scores and triages AML alerts, closing the lowest-risk automatically.
> Financial-crime analysts handle the rest.

Tests: Critical via fraud/financial-crime decision_type; the auto-close
threshold is the interesting boundary.

**F-02 · KYC document extraction and verification**
> Extracts and verifies identity-document data at onboarding.

Tests: Client PII, INV-DATA-01, high-volume at_scale.

**F-03 · Regulatory reporting narrative drafting (Pillar 3 / CCAR)**
> Drafts the narrative sections of regulatory submissions. Finance reviews
> before filing.

Tests: regulatory-reporting decision_type, market-facing exposure,
irreversibility once filed.

**F-04 · Trade-surveillance alert review**
> Reviews communications and trades for market-abuse indicators.

Tests: MNPI-adjacent data handling, INV-SEC-01 (prompt-injectable content
from external parties).

---

## G · Jurisdiction pack tests

**G-01 · EU retail credit scoring** — EU AI Act Annex III §5(b) forced Critical.
**G-02 · UK-only quantitative model** — SS1/23 independent validation.
**G-03 · US generative-AI assistant** — SR 26-2 carve-out routing to AI governance.
**G-04 · Canadian model at autonomy L2** — OSFI E-23 required control.
**G-05 · Singapore + Japan client-facing assistant** — multi-jurisdiction stacking.
**G-06 · EU CV-screening tool** — Annex III §4(a) forced Critical on hiring.

---

## H · Platform and vendor envelope

**H-01 · Internal-platform model, inside the envelope** ⇄
> Runs on an approved internal platform, within every approved dimension.

Tests: **PV-3** inheritance reduces the required control set.

**H-02 · The same model, one dimension outside** ⇄ *one variable changed*
> As H-01 but processing Client PII, which the platform is not cleared for.

Tests: **PV-3** per-dimension withdrawal. The pair proves inheritance is
conditional, not all-or-nothing.

**H-03 · Model on an unlisted third-party service**
> A vendor absent from the approved registry.

Tests: **PV-5** unapproved-component routing.

---

## Scoring

For each case record: **Predicted**, **Historical outcome**, **AIGate said**,
and **Agree?**

Then the only question that matters, for every disagreement:

> **Is the rule wrong, or was the wrong question asked?**

A wrong rule is an afternoon's work. A wrong question — the engine never asked
the thing that actually determined the decision — is a design problem, and it
is the finding that should stop the project.

### Reading the result

- **Agreement above ~80% with explicable disagreements** — the thesis holds;
  fix the rules and continue.
- **Systematic disagreement in one domain** — the rulebook is wrong in a
  bounded way. Fixable.
- **Disagreement requiring case-by-case override** — the kill criterion. Stop
  and write the paper.

---

*Nothing here is legal, regulatory or compliance advice. Scenarios are
composites drawn from public sources; none describes any specific firm.*
