# AIGate — Test Cases, Round 15

*Written 2026-08-25 alongside the R15 build (targeted UI redesign,
`requirements/requirements-015.md`, `reviews/design-deliberation-001/proposal.md`).
R15-C1 and R15-C2 shipped without new automated test cases; this file starts
with R15-C3.*

## R15-C3 — Guided form + Confirm & attest + questionnaire tag

Proposal §3.2, §3.5, §3.7. Skeptic amendment S1b (Must): the raw-vocabulary
fix lands at the shared source, `graph-summary.ts#graphSummaryRows()`, so
both ConfirmationStep and VerdictDisplay's "What you told us" fold pick it
up from one function.

| ID | Asserts |
|---|---|
| TC-R15-C3-01 | `graphSummaryRows()` routes Input data / Model / Autonomy / Data zone / Output through `field-copy.ts`'s `plainWithCode()` — the rendered value is `"<short plain phrase> · <code>"`, not the raw enum alone (S1b) |
| TC-R15-C3-02 | The same fixed row shape appears at BOTH call sites from one function: ConfirmationStep's attest grid (`ConfirmationStep.test.tsx`, pre-existing coverage, unaffected by this change) and VerdictDisplay's "What you told us" fold (`VerdictDisplay.test.tsx`, renegotiated in this round — see below) |
| TC-R15-C3-03 | The `UC-6 · CONFIRM & ATTEST` internal-id tag no longer renders on the Confirm & attest screen |
| TC-R15-C3-04 | The `UC-4 · TARGETED QUESTIONS` internal-id tag no longer renders on the targeted-questions screen |
| TC-R15-C3-05 | `StructuredForm` renders five `<fieldset>`/`<legend>` sections ("About it", "What it uses", "What the AI is and how it runs", "What comes out and who it reaches", "Where it applies") — verified live; no automated DOM-structure assertion added (out of scope for this pass) |
| TC-R15-C3-06 | No form field is hidden behind an "advanced" toggle — all pre-existing `getByLabelText` queries in `StructuredForm.test.tsx` still resolve unchanged, proving every field stayed on the single scroll |
| TC-R15-C3-07 | The load-bearing zone-crossing sentence ("not where the data is stored — where it gets sent...") and the load-bearing bindingness sentence ("be honest about what happens in practice...") stay visible outside their "Why we ask" `<details>` — pre-existing `StructuredForm.test.tsx` assertions on both sentences continue to pass unchanged |
| TC-R15-C3-08 | Optional fields (platform, vendor, decision type, human-in-the-loop) state the consequence of leaving them blank in the field label itself ("optional — blank means: …") |
| TC-R15-C3-09 | `FIELD_CONSEQUENCES` (field-copy.ts, R5-GR-1) — computed since that round and never rendered anywhere — is now consumed by `StructuredForm`'s "Why we ask" disclosures, closing a computed-but-never-consumed gap |

### Renegotiated

- `VerdictDisplay.test.tsx` — "renders the record & provenance panel..."
  previously asserted the raw `'Client notes · Client PII'` /
  `'Drafting model · llm'` strings. Renegotiated (not weakened) to assert
  the plainWithCode() form the shared fix now produces:
  `'Client notes · Personal details of clients · Client PII'` /
  `'Drafting model · A chatbot or writing assistant · LLM'`.

### Verification

`npm test` ×3 — 680/680, identical across runs. `npx tsc --noEmit` clean.
`npm run build` clean. `python3 scripts/spec-parity-check.py` — clean (R1–R8
all pass). No new automated tests target TC-R15-C3-05 (fieldset structure)
or the questionnaire rule-name-with-quiet-id change (§3.7) directly — both
were verified by reading the rendered JSX and by TypeScript's structural
checks, not by a live browser walkthrough, which this build pass did not
have tooling access to run.

| Date | Change |
|---|---|
| 2026-08-25 | Written with the R15-C3 build. |

---

*Developed using the Grounded Vibe Methodology*
