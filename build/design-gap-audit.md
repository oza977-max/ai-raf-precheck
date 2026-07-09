# Design Gap Audit — AIGate Demo (Claude Design) vs Built V1.1

**Date:** 2026-07-10
**Source:** `Mockup prototype request/AIGate Demo.dc.html` (full extraction of
all screens + embedded demo data), audited against the app at commit 9439717.
**Trigger:** user acceptance testing — "the output had so much details, what
we have built is still not checking all boxes."

Legend: ✓ built · ◐ partial · ✗ missing.
**[UI]** = data already exists, only rendering is missing.
**[ENGINE]** = the engine never computes/populates this — real build work.
**[PACKS]** = blocked on jurisdiction-pack loading, V1's standing deviation.

---

## A. Verdict screen (the design's centerpiece)

| # | Design element | Status | Kind |
|---|---|---|---|
| A1 | Tier/Track stat cards | ✓ | — |
| A2 | Header: "UC-2041 · evaluated {date}" + "In appetite — position: Tolerate. 4 controls required, 2 downstream reviews triggered." | ✗ | [UI] — use-case id, date, appetite-position phrasing, counts line all derivable today |
| A3 | CONFIDENCE: MEDIUM banner — "Verdict relies on PE-JUR-EU-2, which involves interpretive judgment. Verify with Compliance (RA-11)." | ◐ | [ENGINE] — the banner UI exists (P5-C01) but `confidence_caveats` is ALWAYS `[]`; no rule carries a confidence rating, so the banner can never fire. RA-11 unimplemented at the data level. |
| A4 | BINDING CONSTRAINT (VD-2) block with citation + "forced to Critical tier" narrative + binding path | ◐ | Largely covered by V1.1-C01's "Why this verdict"; the force-tier narrative needs pack overrides (A6) |
| A5 | Plain-English reasoning trace (VD-8) | ✓ | needs API key at runtime |
| A6 | **REGULATORY REASONING CHAIN (RA-9)** — per fired rule: verbatim source text ("AI systems intended to be used to evaluate creditworthiness … are classified as high-risk"), doc + section, per-rule confidence chip, DERIVED interpretation, SIGN-OFF line ("A. Mensah, Model Risk Lead · 14 May 2026") | ✗ | [PACKS] — verbatim `source.text`/`sign-off`/`confidence` live in pack rule schema; the engine never loads packs, `applied_overrides` always `[]`. The design's whole UC-2041 story (EU applicant → Annex III → forced Critical) is impossible in the current engine. |
| A7 | **MINIMAL CONTROL SET with VERIFIED/UNVERIFIED chips** — each control: id, name, "patches" line, verification status | ◐ | [ENGINE] — we list bare control IDs. Proof-carrying controls (design-vision decision #3) never made it into the schema: `Control` has no `verification_evidence`/status field. |
| A8 | **STANDING CONDITIONS (VD-7)** — "the hypothesis this approval is conditional on": drift bounds, override-rate band, pinned zone, max autonomy, fairness tolerance | ✗ | [ENGINE] — `VerdictConditions.hypotheses` is always `[]` and never rendered. design-vision: "V1 populates them statically" from `kri_thresholds` — never done. |
| A9 | DOWNSTREAM REVIEWS (CS-3) with "triggered by" attributions | ◐ | [ENGINE] — UI renders the field but no rule ever populates `downstream_reviews`; always `[]`. |
| A10 | RECORD & PROVENANCE panel (input/model/autonomy/zone/output/jurisdictions on the verdict itself, incl. "(corrected)" marker) | ✗ | [UI] — we show this on the Confirm step only; verdict screen lacks it |
| A11 | "Saved to register — Critical tier, awaiting active 2LoD approval" status line | ✗ | [UI] — lifecycle stage is known at verdict time |
| A12 | Honesty footer: "Audit trail is append-only. V1 is client-side — provisional / proof-of-concept grade for audit purposes (NF-2)." | ✗ | [UI] — one static line; design-vision L-3 says this labeling is mandatory |

## B. Register

| # | Design element | Status | Kind |
|---|---|---|---|
| B1 | Stat strip (counts by status/tier) | ✗ | [UI] |
| B2 | Columns: ID, use case, team · jurisdiction, tier, track, verdict, color-coded stage | ◐ | [UI] — we lack use-case IDs in the table, team, jurisdictions, stage colors |
| B3 | **Register DETAIL view** — click a row → full record | ✗ | [UI] — biggest single gap; no detail view exists at all |
| B4 | **IMMUTABLE AUDIT TRAIL timeline** (VD-4/NF-2) — typed, timestamped, actor-attributed event feed with colored dots | ✗ | [UI] — every event is already in IndexedDB; never rendered anywhere |
| B5 | **2LoD action bar** — "Critical tier — active 2LoD approval required (LC-2). Approve / Request correction," with lifecycle advance + audit event | ✗ | [ENGINE+UI] — `twoloD_reviewed` audit type exists, unused; no approval action anywhere. Known open item, confirmed as designed scope. |
| B6 | 1LoD scope explainer ("You're viewing as 1LoD — you see your own team's records…") | ✗ | [UI] — one line |

## C. Intake flow

| # | Design element | Status | Kind |
|---|---|---|---|
| C1 | Duplicate-check match card — redacted: "tier High — full detail visible to 2LoD; contact AI Risk to adopt its classification" (UC-2/RG-2 leak rule) | ◐ | [UI+ENGINE] — ours is a plain warning line, no tier, no redaction semantics |
| C2 | Questionnaire budget indicator — "2/5 · budget ≤15 (provisional Critical)" | ✗ | [UI] — generateQuestions computes tier-based budget internally; never surfaced (and `question_budget_basis` never audited) |
| C3 | Per-question "triggered by {rule-id}" | ✗ | [UI] — `IntakeQuestion.triggered_by` exists and is populated; never rendered |
| C4 | Contradiction screen: side-by-side "YOU ANSWERED / YOUR DESCRIPTION SAYS" + consequence explanation + two explicit resolution paths | ◐ | [UI] — machinery is real (P4-C03); presentation is far leaner than design |
| C5 | Confirm & attest incl. correction diff + attestation sentence with role name + date | ✓ | minor: role/date in the attest line |

## D. Appetite framework view

| # | Design element | Status | Kind |
|---|---|---|---|
| D1 | Dark syntax-styled YAML panel | ✗ | [UI] — ours is a bare textarea |
| D2 | **Jurisdiction packs list with fired/loaded chips** (SS1/23, EU AI Act, SR 26-2, E-23, MAS FEAT, DORA, FSA Japan) | ✗ | [PACKS] for "fired"; a static configured-packs list with an honest "declared, not loaded by V1 engine" state is [UI] |
| D3 | HARD LINES panel ("no control set can fix — checked first, PE-4") | ✗ | [UI] — policy data exists |
| D4 | NF-10 "ACTION REQUIRED — [FIRM] markers unfilled — verdicts provisional until CRO adopts" banner | ✗ | [UI] — we only show the small header status |

## E. Shell

| # | Design element | Status | Kind |
|---|---|---|---|
| E1 | Role switcher personas ("1LoD James · Dev / 2LoD Priya · AI Risk") | ◐ | [UI] |
| E2 | Register count badge in sidebar | ✗ | [UI] |

---

## The underlying pattern

Half the "missing detail" is **data the system already has but never shows**
(audit timeline, triggered-by, budget, hard lines, provenance) — cheap, high-
impact UI work. The other half is **engine capability the demo promises that
V1 genuinely lacks**: per-rule confidence (RA-11), populated standing
conditions (VD-7), downstream-review rules (CS-3), proof-carrying control
verification (design decision #3), and above all **jurisdiction packs +
overrides (RA-9)** — the regulatory reasoning chain that is the demo's
centerpiece and the product's stated moat ("pack authoring IS the real work",
design-vision).

## Proposed build order

1. **V1.2-A — Register detail + audit timeline + 2LoD Approve/Request-correction** (B3/B4/B5/B6, plus `twoloD_reviewed` wiring). Highest functional value; nearly all data exists.
2. **V1.2-B — Verdict completeness** (A2/A8-static/A10/A11/A12 + C2/C3 questionnaire surfacing + E1/E2). Standing conditions populated statically from `kri_thresholds` per design-vision.
3. **V1.2-C — Appetite view honesty** (D1–D4) + duplicate-check redaction card (C1).
4. **V1.3 — Proof-carrying controls** (A7): `verification_evidence` on Control, VERIFIED/UNVERIFIED in verdict + register detail.
5. **V2 direction — jurisdiction pack loading + RA-9 chain + RA-11 confidence** (A3/A6/D2-fired): the big one; requires PACK-AUTHORING (human-led rule content) plus engine pack support.
