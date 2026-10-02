# AIGate — Test Cases, Round 19

*Written 2026-10-02. R16 chunks B and C — the plain-language guided form
(UC-8, UC-10, UC-11) and "Here's what we understood" (UC-9, UC-12),
released as one unit (`build/prompts/R16.md` v2.1 §2–§3, D-18). Chunk A1/A2
(the schema, engine and policy text this round's form and summary read)
are covered in `test-cases-018.md`; chunk D1/D2 (the verdict's own first
screen) is a separate, parallel chunk with its own test-case file.*

Test files: `src/engine/plain-intake.test.ts`,
`src/engine/build-graph-from-form.test.ts`,
`src/components/intake-draft.test.ts`,
`src/components/__tests__/StructuredForm.test.tsx`,
`src/components/graph-summary.test.ts`,
`src/components/__tests__/graph-summary.verdict-record.test.tsx`,
`src/components/__tests__/UnderstoodSummary.test.tsx`,
`src/components/__tests__/ConfirmationStep.test.tsx`,
`src/engine/backtest-parity.test.ts`,
`src/engine/backtest-parity-nonblind.test.ts`.

## §2.1 — Data shapes and the mapping (`plain-intake.ts`)

| ID | Asserts |
|---|---|
| TC-R16-B-01 | Q4 "Not sure" maps to `agentic`, listed back as an assumption with the exact §2.2 text — `plain-intake.test.ts` |
| TC-R16-B-02 | UC-10: ticking two different kinds of information (Q5, tick-all) produces one input node per distinct class — `plain-intake.test.ts` |
| TC-R16-B-03 | Q6 "Not sure" maps to execute/level 4/no hitl/binding, listed back as an assumption with the exact §2.2 text — `plain-intake.test.ts` |
| TC-R16-B-04 | Q7 "Not sure" maps to market-facing, listed back as an assumption with the exact §2.2 text — `plain-intake.test.ts` |
| TC-R16-B-05 | Q9 "Not sure" maps to irreversible, listed back as an assumption with the exact §2.2 text — `plain-intake.test.ts` |
| TC-R16-B-06 | Q13 "Not sure" maps to all three non-`none` access kinds, listed back as an assumption — `plain-intake.test.ts` |
| TC-R16-B-07 | A draft under the pre-R16 key is detected, cleared, and reported exactly once (`probeLegacyFormDraft`) — `intake-draft.test.ts` |

Every Q3/Q3a/Q3supplier/Q4/Q5/Q6/Q6a/Q6b/Q7/Q8/Q9/Q10/Q11/Q12/Q13/Q14 branch
in the §2.2 mapping table has at least one direct unit test in
`plain-intake.test.ts` beyond the ids above (e.g. the dynamic-platform
zone/vendor resolution, the "earliest letter" rule, the never-matched
free-text supplier name, the 3a/3aWhich company-assistant resolution with
0/1/many registered vendors) — named by scenario rather than by a separate
TC id per branch, consistent with test-cases-018.md's own density for
`access-scope.test.ts`.

## §2.1 — `buildGraphFromForm` extended for several input nodes

Covered by the existing `build-graph-from-form.test.ts` (unchanged ids from
round 18) plus new, unnamed assertions for `inputDataClasses` producing N
input nodes and N edges, falling back to the singular `inputDataClass`
field byte-identically when absent — see that file directly; no new TC id
was needed because the single-input case is provably unchanged (every
TC-UC-3a-01/02 assertion there still passes) and the multi-input case is
exercised end-to-end via TC-R16-B-02 above and the StructuredForm/parity
tests below.

## §2.2 — The guided form (`StructuredForm.tsx`)

| ID | Asserts |
|---|---|
| TC-R16-B-08 | No question or option renders a bare engine term or code (Zone letters, MNPI, "LLM", "agentic", tier/track names) — principle 1 — `StructuredForm.test.tsx` |
| TC-R16-B-09 | Q3a appears only when Q3 is "An AI assistant or website run by an outside company", and its answer is cleared when Q3 changes away — `StructuredForm.test.tsx` |
| TC-R16-B-10 | Q13/Q14 appear only for the agentic option at Q4, or Q4 "Not sure" — and nowhere else — `StructuredForm.test.tsx` |
| TC-R16-B-11 | Q13 "Nothing beyond what it's given for the task" is exclusive with the other ticks, and vice versa — `StructuredForm.test.tsx` |
| TC-R16-B-12 | A platform or supplier without a `plain_name` shows "Your firm's AI service {n}" / "Supplier {n}", never its raw registry name or a bare `[FIRM]` placeholder (D-23) — `StructuredForm.test.tsx` |
| TC-R16-B-13 | A draft under the pre-R16 key shows "Your saved draft was from an older version of this form and couldn't be reused — please start again." exactly once, and never blocks the fresh form — `StructuredForm.test.tsx` |
| TC-R16-B-14 | The guided form's answers round-trip across a remount under the new versioned draft key — `StructuredForm.test.tsx` |
| TC-R16-B-15 | Q8 "Something else" requires the free-text description before Continue enables — `StructuredForm.test.tsx` |

### UC-3a survives (requirements.md's 2026-10-02 amendment)

| ID | Asserts |
|---|---|
| TC-UC-3a-01 | The guided form produces a valid `DataFlowGraph` with one node per category — adapted to the new questions (firm-built / llm / everyday-information / read / jurisdictions-none path) — `StructuredForm.test.tsx` |
| TC-UC-3a-02 | The guided form sets `intake_method` to `structured_form` — adapted — `StructuredForm.test.tsx` |
| TC-UC-3a-03 | Continue is disabled until every required question is answered — adapted from "mandatory field missing — blocked" — `StructuredForm.test.tsx` |

### Jurisdictions (tick-all), adapted from round 3 (R3-JU)

| ID | Asserts |
|---|---|
| TC-R3-JU-1-01 | An untouched jurisdiction question (Q11) blocks progress; ticking a real jurisdiction unblocks it — adapted — `StructuredForm.test.tsx` |
| TC-R3-JU-1-02 | "Somewhere else, or not sure" submits an empty `jurisdictions` array — the engine contract is unchanged — adapted — `StructuredForm.test.tsx` |
| TC-R3-JU-1-03 | Ticking a real jurisdiction unblocks progress — adapted — `StructuredForm.test.tsx` |
| TC-R3-JU-5-01 | Every unconditional base question that blocks progress carries both a visible marker and `aria-required` — adapted and narrowed to the 12 base questions (each conditional follow-up's own requiredness is covered by its own dedicated test, TC-R16-B-09/10/15) — `StructuredForm.test.tsx` |
| TC-R3-JU-5-02 | Optional free-text fields (3supplierName, 3model) carry neither signal — adapted — `StructuredForm.test.tsx` |

## §3 — "Here's what we understood" (`UnderstoodSummary.tsx`, `graph-summary.ts`)

| ID | Asserts |
|---|---|
| TC-R16-C-01 | `graphSummaryRows`: a single input node renders exactly as before this chunk (unchanged "Input data" label) — `graph-summary.test.ts` |
| TC-R16-C-02 | `VerdictDisplay`'s "What you told us" record grid renders two "Input data N" rows for a two-input graph, without any source change to `VerdictDisplay.tsx` itself (D-62) — `graph-summary.verdict-record.test.tsx` |
| TC-R16-C-03 | `destinationDescription` resolves each zone to plain words with no bare zone letter in the output (§1.2's `{destination}` token, read in reverse from a zone) — `graph-summary.test.ts` |
| TC-R16-C-04 | `dataClassesBySeverity` ranks distinct input data classes most-sensitive-first, using the same ranking as `DATA_CLASS_RANK` (D-03) — `graph-summary.test.ts` |
| TC-R16-C-05 | The destination section names the plain zone description and, when resolvable, the supplier's plain name — never a bare zone letter — `UnderstoodSummary.test.tsx` |
| TC-R16-C-06 | Every distinct data class is listed, most sensitive first, with no bare code — `UnderstoodSummary.test.tsx` |
| TC-R16-C-07 | Form path: every assumption appears under "Things we assumed because you weren't sure", with its exact text — `UnderstoodSummary.test.tsx` |
| TC-R16-C-08 | Description path: uncertain node labels appear under "Things we couldn't tell from your description" — `UnderstoodSummary.test.tsx` |
| TC-R16-C-09 | "Change an answer" calls the navigation callback and performs no write of its own — `UnderstoodSummary.test.tsx` |
| TC-R16-C-10 | "Show the details the rules use" holds the existing `graphSummaryRows` grid, collapsed by default — `UnderstoodSummary.test.tsx` |

`ConfirmationStep.test.tsx`'s existing TC-R15-C3-01/02/03 assertions
(the plain-phrase-then-code attest grid, the retired internal-id tag) are
re-run unedited against `ConfirmationStep` now rendering `UnderstoodSummary`
internally — all three still pass, proving the exact-string grid contract
`graph-summary.ts`'s own header comment promises is unbroken by moving the
grid behind the new "Show the details" disclosure.

## §2.3 — Parity test: blind answers vs the worked-case predictions

`backtest/worked-case-answers.json` holds the blind answers (written from
each worked case's narrative only, by a separate agent, before this
mapping was built — see that file's own `note` field). Every difference
from the pinned prediction is asserted and explained in the test itself,
per the contract; none are mapping defects.

| ID | Asserts |
|---|---|
| TC-R16-B-16 | UC-1: matches in full, plus the cloud-assistant platform's `vendor_id` link (chunk A2) correctly adds "Vendor risk assessment" — `backtest-parity.test.ts` |
| TC-R16-B-17 | UC-2: matches in full (rejected via HL-002), same added vendor-risk review on the hard-line rejection — `backtest-parity.test.ts` |
| TC-R16-B-18 | UC-3: DIFFERS — "Not sure yet" (Q3) adds the unregistered-vendor obligation; the tick-all Q5 correctly adds a second data class (Confidential) the old single-field form could never express; Q8 correctly captures a decision type (credit-decision) the old recording never set at all, forcing Critical tier and a fairness obligation — `backtest-parity.test.ts` |
| TC-R16-B-19 | UC-4: status and binding (HL-001) match; the 4a branch's model-type reading ("ml" vs the original's recorded "traditional-ml") is verdict-neutral since tier/track are skipped on a hard-line rejection and the hard line itself never reads model_type — `backtest-parity.test.ts` |
| TC-R16-B-20 | UC-5: DIFFERS — "Not sure yet" again adds the unregistered-vendor obligation; a defensible independent reading of the narrative's own data (Confidential, not Internal) and output weight (drafts/material, not recommend/advisory) changes the binding constraint from INV-TRACK2-01 to INV-HALLUC-01 — `backtest-parity.test.ts` |
| TC-R16-B-21 | UC-6a: matches in full (rejected via HL-002), same added vendor-risk review — `backtest-parity.test.ts` |
| TC-R16-B-22 | UC-6b: DIFFERS — the contract's own documented case: the in-house platform's "earliest letter among its allowed zones" rule resolves to Zone B, not the originally-recorded Zone C, flipping the verdict to rejected under HL-002 — `backtest-parity.test.ts` |
| TC-R16-B-23 | UC-7: DIFFERS — three narrative-supported facts the old single-field recording never carried (an unlisted named supplier, confidential-not-internal data, standing credentials ticked at Q13) correctly add obligations and change the binding constraint to the more severe INV-AGENT-CRED-01; status/tier/track unaffected — `backtest-parity.test.ts` |
| TC-R16-B-24 | UC-8: DIFFERS — reproduces the pack's own "UC-8b" entry (Q8 is required, so the blank-decision-type variant is unreachable by design, exactly as the contract anticipates), plus a defensible wider-audience reading (market-facing) that forces Critical tier and changes the binding constraint — `backtest-parity.test.ts` |
| TC-R16-B-25 | Assumption case: Q9 "Not sure" + acting entirely by itself + clients see it → HL-001 ("No"), with the Q9 assumption listed (D-07) — `backtest-parity.test.ts` |
| TC-R16-B-26 | Assumption case: Q4 "Not sure" for a tool described as acting on its own → agent safeguards present (INV-AGENT-01), with the Q4 assumption listed (D-48) — `backtest-parity.test.ts` |
| TC-R16-B-27 | Assumption case: Q6 + Q7 "Not sure" together → the strictest graph (ten tripped invariants at once), with both assumptions listed — `backtest-parity.test.ts` |

## §2.3 — NON-blind: UC-9..13 (recorded field values, no narrative)

| ID | Asserts |
|---|---|
| TC-R16-B-28 | UC-9 (EU retail credit scoring): matches in full — `backtest-parity-nonblind.test.ts` |
| TC-R16-B-29 | UC-10 (EU CV screening): DIFFERS, verdict-neutral — declaring the in-house platform here genuinely fits its approved envelope, so two controls are satisfied by PV-3 inheritance instead of being solved for directly; same tripped invariants, status, tier, track, binding and downstream reviews — only which control discharges INV-EXPLAIN-01 differs — `backtest-parity-nonblind.test.ts` |
| TC-R16-B-30 | UC-11 (UK-only quant VaR model): matches in full; the fixed autonomy level the "suggests" branch carries is verdict-neutral here, same documented class as UC-4/UC-7 — `backtest-parity-nonblind.test.ts` |
| TC-R16-B-31 | UC-12 (Canada model): matches in full; same verdict-neutral autonomy-level note — `backtest-parity-nonblind.test.ts` |
| TC-R16-B-32 | UC-13 (SG+JP client-facing assistant): matches in full — `backtest-parity-nonblind.test.ts` |

### Verification

Every touched/new file was run individually via `npm test -- <path>`
(never bare `vitest`) three times consecutively, then the full suite three
times via `npm test`. `npx tsc --noEmit`, `npm run build`,
`python3 scripts/spec-parity-check.py` and `python3 scripts/trace-check.py`
all clean. Live browser walkthrough of the guided form and the summary
screen at `http://localhost:5173`.

| Date | Change |
|---|---|
| 2026-10-02 | Written for R16 chunks B and C (plain-language guided form, understood summary). |

---

*Developed using the Grounded Vibe Methodology*
