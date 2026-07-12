# Phase C Back-Test Pack — Risk Management Use Cases

Eight realistic risk-management use cases for back-testing AIGate's
verdicts against practitioner judgment (deployment strategy Phase C:
"verdicts vs actual committee outcomes is the pass/fail test of the
appetite-as-code thesis").

**How to run each one** (no API key needed): New pre-check → paste the
description → Read & extract → the structured form opens → enter the
form values given → Build graph → Proceed → Confirm and evaluate.
Compare the verdict against the **predicted outcome** (computed by hand
against `policy/appetite.yaml` v1.0) and — more importantly — against
**what your committee would actually have decided**. Disagreement with
the committee is the finding; disagreement with the prediction is a bug.

**Known V1 form limitations (honest caveats):**
- ~~`decision_type`/`hitl` unreachable via the form~~ **Closed in V2-A**:
  both are now optional form selects.
- ~~Packs not loaded~~ **Closed in V2-A**: all seven packs load and
  apply. Their sign-offs are `[FIRM]` placeholders, so pack-touched
  verdicts are honestly provisional until adoption.

---

## UC-1 · Market Risk — daily VaR / IRC commentary generation

**Description (paste this):**
> Generates the day-on-day market risk commentary for the daily risk
> pack. An LLM reads overnight VaR, stressed VaR and IRC moves plus desk
> P&L attribution from the risk warehouse and drafts the movement
> narrative (drivers, limit utilisation, notable desk changes). A market
> risk manager edits and approves every commentary before circulation to
> the risk committee.

**Form values:** data class `Confidential` · input zone `Zone B` · model
`llm` · autonomy `1` · processing zone `Zone B` · action `draft` ·
exposure `internal-shared` · bindingness `advisory` · `reversible` ·
`at_scale`

**Predicted:** **Approved · Medium · Track II** (llm + advisory →
TRACK-II, SS1/23 §3.4; internal-shared → TIER-MEDIUM). No invariants
trip. Lifecycle `pre_checked` (Medium = 2LoD-notify, 5-day
auto-approve). Standing conditions use the low-risk override band.

---

## UC-2 · Market Risk — same tool, private-side names added (MNPI test)

**Description:**
> Extension of the daily commentary tool: the credit desk wants the
> commentary to also cover private-side watchlist names, pulling
> issuer-level non-public credit information into the same cloud LLM
> pipeline.

**Form values:** as UC-1 but data class `MNPI`, input zone `Zone B`.

**Predicted:** **REJECTED · High · Track II** — INV-ZONE-01 ("MNPI must
remain within Zone C", MAR Article 8; MiFID II) trips and **no control
in the library can resolve it** → no-control-set rejection. The
"Why this verdict" panel should show the MAR/MiFID citation. This is the
zone rules doing exactly their job: same tool, one data-class change,
opposite verdict.

---

## UC-3 · Credit Risk — annual review drafting + covenant monitoring

**Description:**
> Drafts annual credit review memos for the corporate loan book: an LLM
> summarises financial spreads, covenant compliance history and account
> conduct into the review template, and flags covenant breaches for the
> credit officer. Files include personal guarantees, so borrower
> personal data is in scope. The credit officer owns the rating and the
> final review — the tool recommends, never decides.

**Form values:** data class `Client PII` · input zone `Zone B` · model
`llm` · autonomy `1` · processing zone `Zone B` · action `recommend` ·
exposure `internal-shared` · bindingness `material` · `reversible` ·
`at_scale`

**Predicted:** **Approved with controls · High · Track II** — Client PII
triggers TIER-HIGH; INV-DATA-01 trips (Client PII in Zone B, GDPR Art.
32(1)(a)) and CTRL-ENC-01 resolves it (VERIFIED chip from the starter
attestation example). `boundary_proximity: true` (single control, zero
redundancy). Lifecycle `pre_checked` — awaiting active 2LoD sign-off:
go approve it in the register as 2LoD and watch the audit trail.

---

## UC-4 · Credit Risk — autonomous credit-line reduction (hard-line test)

**Description:**
> Behavioural model that automatically reduces credit limits on
> deteriorating retail accounts. The model executes the line decrease
> directly in the account system with no human review; customers are
> notified after the fact. Reinstatement requires a manual remediation
> process, so in practice the action is not reversible for the customer.

**Form values:** data class `Client PII` · input zone `Zone C` · model
`traditional-ml` · autonomy `4` · processing zone `Zone C` · action
`execute` · exposure `client-facing` · bindingness `binding` ·
`irreversible` · `at_scale`

**Predicted:** **REJECTED immediately — HL-001** ("Level 4 autonomy on
irreversible client-facing actions", SS1/23 §3.8; SR 26-2 §IV). Tier and
track show ceiling values (Critical / I) with the honest "assignment
skipped" note; the reason and citation render in red. Note: the *true*
rule for this case is HL-003 (autonomous credit decisions), but the form
cannot express `decision_type`/`hitl` — via the LLM path this same
description should trip HL-003.

---

## UC-5 · Operational Risk — event classification & RCSA drafting

**Description:**
> Classifies operational risk events into Basel event categories,
> drafts the root-cause and lessons-learned narrative for each incident
> record, and suggests RCSA control mappings. The op-risk analyst
> reviews every classification before it enters the loss database.

**Form values:** data class `Internal` · input zone `Zone B` · model
`llm` · autonomy `1` · processing zone `Zone B` · action `recommend` ·
exposure `internal-shared` · bindingness `advisory` · `reversible` ·
`at_scale`

**Predicted:** **Approved · Medium · Track II**, no controls, lifecycle
`pre_checked` (notify). Clean-approval explanation should read
"Evaluated against 5 hard lines and 2 invariants — none triggered."

---

## UC-6a · Deal memos on a cloud LLM (should fail)

**Description:**
> Summarises data-room documents into credit committee deal memo
> sections for live (unannounced) transactions, using the firm's cloud
> LLM service. Deal teams paste extracts from confidential information
> memoranda and draft term sheets.

**Form values:** data class `MNPI` · input zone `Zone B` · model `llm` ·
autonomy `1` · processing zone `Zone B` · action `draft` · exposure
`internal-shared` · bindingness `material` · `reversible` · `limited`

**Predicted:** **REJECTED — INV-ZONE-01** (MNPI outside Zone C), same
mechanics as UC-2.

## UC-6b · Deal memos on the internal Zone C deployment (should pass)

**Description:** same as UC-6a, but running on the firm's internal
Zone C model deployment — deal content never leaves firm-controlled
infrastructure.

**Form values:** as UC-6a but input zone `Zone C`, processing zone
`Zone C`.

**Predicted:** **Approved · High · Track II** (MNPI data class →
TIER-HIGH; no invariant trips in Zone C; no controls required).
Lifecycle `pre_checked` — 2LoD approval required. The 6a/6b pair is the
cleanest demonstration of appetite-as-code: identical use case, the
deployment zone alone flips the verdict, and both verdicts cite why.

---

## UC-7 · Claude Code deployment for risk business users

**Description:**
> Deploys an agentic coding assistant to risk analysts for building and
> maintaining their own tooling — VaR reconciliation scripts, data
> quality checks, report automation. It reads internal code repositories
> and data schemas and proposes code; analysts review and apply every
> change themselves. Output is engineering tooling, not risk decisions.

**Form values:** data class `Internal` · input zone `Zone B` · model
`agentic` · autonomy `1` · processing zone `Zone B` · action `draft` ·
exposure `internal-only` · bindingness `non-binding` · `reversible` ·
`at_scale`

**Predicted:** **Approved · Low · Track III** (agentic + non-binding →
TRACK-III "AI Governance track", SR 26-2 §III.C GenAI exclusion;
internal-only → TIER-LOW). Lifecycle **`approved`** — the only
self-service-final case in this pack. Worth stress-testing the
classification honestly: if analysts' scripts feed risk numbers used in
decisions, is `non-binding` really true? Re-run with `advisory` and
watch it move to Track II / pre_checked.

---

## UC-8 · Regulatory reporting — Pillar 3 / CCAR narrative drafting

**Description:**
> Drafts the qualitative narrative sections of regulatory returns
> (Pillar 3 disclosures, CCAR supporting narratives) from approved
> quantitative outputs. Reporting managers own every submitted word;
> the tool produces first drafts only.

**Form values:** data class `Confidential` · input zone `Zone B` · model
`llm` · autonomy `1` · processing zone `Zone B` · action `draft` ·
exposure `internal-shared` · bindingness `material` · `reversible` ·
`limited`

**Predicted (form path):** **Approved · Medium · Track II**. **Known
under-tiering:** the grounding says regulatory-reporting decision types
are TIER-HIGH, but the form cannot express `decision_type` — via the
LLM path this should tier High. If your committee would call this High
(it should), that's the form-path limitation showing, not the appetite
logic — a good back-test observation to record.

---

## Jurisdictional cases (V2-A — packs now load; run with jurisdiction boxes ticked)

The form now has **Decision type** and **Human-in-the-loop** selects, so
the earlier caveats are closed: HL-003/HL-004 are reachable, and UC-8
tiers High when you select `regulatory-reporting`. Every pack rule is
signed `[FIRM] — pending adoption`, so any verdict a pack touches is
honestly **provisional** (NF-7) until your CRO adopts the packs.

### UC-9 · EU retail credit scoring (the design's UC-2041)
As UC-3's form values plus: decision type `credit-decision` · HITL `Yes`
· scale `at_scale` · jurisdictions **UK + EU**.
**Verified prediction:** Approved with controls · **Critical** · Track II
· CTRL-ENC-01 · downstream reviews: ICT third-party concentration (DORA
Art. 28) + Independent model validation (SS1/23 §3.4) · RA-9 chain shows
3 fired rules with source text · **provisional** (unsigned packs).

### UC-10 · EU CV-screening tool (the visible "forced tier" demo)
Data class `Internal` · zones `Zone B` · model `ml` · autonomy `1` ·
action `recommend` · exposure `internal-shared` · bindingness `material`
· reversible · at_scale · decision type `hiring` · jurisdiction **EU**.
**Verified prediction:** Approved · **Critical — FORCED from Medium** by
EU AI Act Annex III §4(a); the chain entry quotes the recruitment text
and reads "Tier forced to Critical (was Medium) — most demanding
standard applies."

### UC-11 · UK-only VaR model (statistical, internal)
`Internal` · `Zone C` both zones · `statistical` · autonomy `0` ·
`recommend` · `internal-only` · `material` · reversible · at_scale ·
jurisdiction **UK**.
**Verified prediction:** Approved · Low · Track I — but SS1/23
supplements "Independent model validation (2LoD)" as a downstream
review. Obligations added without reclassifying: the supplement model.

### UC-12 · Canada model at autonomy L2
`Internal` · `Zone C` · `ml` · autonomy `2` · `recommend` ·
`internal-shared` · `advisory` · reversible · limited · jurisdiction
**CA**.
**Verified prediction:** **Approved with controls** · Medium — the OSFI
E-23 pack ADDS CTRL-LOG-01 with zero invariants tripped: a control
requirement sourced entirely from a jurisdiction pack.

### UC-13 · SG+JP client-facing LLM assistant
`Internal` · `Zone B` · `llm` · autonomy `1` · `recommend` ·
`client-facing` · `advisory` · reversible · at_scale · jurisdictions
**SG + JP**.
**Verified prediction:** High tier with two pack reviews — FEAT fairness
(MAS) + explainability documentation (FSA Japan) · provisional.

**Engine verification:** all 15 predictions (9 original + 6
jurisdictional) are asserted in
`src/engine/backtest-predictions.test.ts` against the real policy and
the real pack files — the pack cannot silently drift.

## Recording results

For each case note: (1) tool verdict vs prediction — any mismatch is a
bug in engine or prediction; (2) tool verdict vs what your committee
would actually decide — mismatches here are the real Phase C data:
either the starter policy needs tuning (rules too loose/strict), the
form needs more expressiveness, or the thesis has a gap. Per the kill
criterion: "if verdicts need constant human override, stop building and
write the paper instead."
