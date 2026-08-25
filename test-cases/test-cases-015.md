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
| 2026-08-25 | R15-C4 section added. |

---

## R15-C4 — Appetite framework split + header chip

Proposal §3.4, §3.8. Readable rulebook (levers, action-required banner,
jurisdiction packs, hard lines, risk knowledge) is now the default view of
`PolicyEditor.tsx` for every role; the YAML editor sits behind a
closed-by-default `aria-expanded` disclosure carrying the honest no-sign-in
line. The header's "translation fidelity" chip drops its `title=` tooltip
for a visible warning + an `aria-expanded` disclosure carrying the same
`attestation.reason` text.

| ID | Asserts |
|---|---|
| TC-R15-C4-01 | `PolicyEditor`'s YAML-editor disclosure button renders `aria-expanded="false"` on first render and the `#policy-yaml-input` textarea is not in the document until it is opened — the readable panels above it (levers, jurisdiction packs, hard lines, risk knowledge) render regardless, satisfying "readable rulebook is the default view" |
| TC-R15-C4-02 | Opening the disclosure flips `aria-expanded` to `true`, reveals the textarea, Validate/Save and the verbatim honesty sentence "This build has no sign-in — anyone can open this. A real deployment restricts it to the rule authors." |
| TC-R15-C4-03 | All pre-existing `PolicyEditor.test.tsx` and `PolicyEditor.r12.test.tsx` coverage (pre-fill, validate, save success/failure, ACTION REQUIRED banner, jurisdiction pack list, hard lines, pack age/overdue, invalid-YAML panel suppression) is unchanged in behaviour — only renegotiated to open the disclosure first before querying the textarea |
| TC-R15-C4-04 | `WalkingSkeleton.test.tsx`'s P7-C03 Part B save-flow integration test opens the disclosure before finding the textarea; the real-save assertion (queued count, header policy version bump) is otherwise unchanged |
| TC-R15-C4-05 | No role prop is read by `PolicyEditor`, and none was before this chunk — confirmed by reading the component and its call site in `App.tsx` (`<PolicyEditor onSaved={...} />`, unconditional). The "NOT role-gated" requirement (§3.4) was already true structurally; this chunk adds a code comment recording the check rather than removing gating that did not exist. This is the documented exception to G6 (§7 gates), not a violation of it |
| TC-R15-C4-06 | `App.tsx`'s fidelity chip no longer renders a `title=` attribute; a button with `aria-expanded` toggles a `<p>` containing `attestation.reason` verbatim — verified by reading the JSX (no automated App.tsx test previously covered the `title=` tooltip, so none needed renegotiating) |
| TC-R15-C4-07 | `VerdictDisplay.tsx`'s "Rulebook translation: unattested — the jurisdiction pack rules used here are proposed readings your firm has not yet adopted." checklist line (added R15-C2) is untouched — confirmed by diff; this chunk only touches the header instance |

### Verification

`npm test` ×3 — 682/682, identical across runs (up from 680 in R15-C3; six
tests added, four renegotiated in place). `npx tsc --noEmit` clean.
`npm run build` clean. `python3 scripts/spec-parity-check.py` — clean
(R1–R8 all pass; no spec `.md`/`.html` file was touched this chunk). No
live browser walkthrough — this build pass did not have that tooling
available; verified instead by reading the rendered JSX, the full test
suite, and TypeScript's structural checks.

---

*Developed using the Grounded Vibe Methodology*
