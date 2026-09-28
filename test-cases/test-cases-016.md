# AIGate — Test Cases, Round 16

*Written 2026-09-28 — a traceability backfill, not a new build. RG-8
(hand-off bundle) and RG-9 (control-evidence attestation) shipped several
rounds ago (commits `b484d83`, `6023103`, hardened by code-review-005) but
had no test-case entries, so `scripts/trace-check.py` could not see them.
This round adds cases for both, mapped to the automated tests that already
prove them — no new test was written; existing test titles were prefixed
with their new TC id. `requirements/requirements.md`'s 2026-09-28 amendment
explains the RG-6/RG-7 -> RG-8/RG-9 relabelling this file follows (the
labels collided with the existing, unrelated, unbuilt RG-6/RG-7).*

Test files: `src/store/handoff.test.ts`,
`src/components/__tests__/RegisterView.handoff.test.tsx`,
`src/store/audit.test.ts`, `src/store/register.test.ts`,
`src/components/__tests__/RegisterDetail.eventDetail.test.tsx` (RG-8);
`src/components/__tests__/RegisterDetail.controlEvidence.test.tsx`,
`src/components/__tests__/VerdictDisplay.cr005.test.tsx` (RG-9).

## RG-8 — Hand-off bundle (export/import between two machines)

`requirements/requirements.md`, RG-8: "The register and its audit trail
shall be transferable between two installations as a single file. Import
shall re-verify every audit entry and the file's seal, shall merge only when
one history continues the other, shall otherwise offer a user-confirmed
replace that requires a saved backup first, and shall never overwrite
silently. The product shall state that these checks detect damage and
simple edits but cannot prove who made the file."

### Export

| ID | Asserts |
|---|---|
| TC-RG-8-01 | Given a register with a local case, when the reviewer clicks "Export hand-off bundle", then a success message names the event/entry counts and a sealed bundle downloads — `RegisterView.handoff.test.tsx` |
| TC-RG-8-02 | Given the same setup, when the browser's download mechanism throws, then an `alert`-role "Export failed" message is shown, not swallowed — `RegisterView.handoff.test.tsx` |

### Import — tamper and forgery detection

| ID | Asserts |
|---|---|
| TC-RG-8-03 | A bundle whose register was altered after export (seal mismatch) is refused as `tampered`, with no writes — `handoff.test.ts` |
| TC-RG-8-04 | A bundle whose audit payload was edited without recomputing the downstream hash chain is refused as `tampered` ("chain is broken") — `handoff.test.ts` |
| TC-RG-8-05 | The documented limit, pinned on purpose: a bundle edited AND fully re-hashed downstream (payload + every later hash + the seal, using only the module's own public functions) is ACCEPTED — the product only claims to catch an edit that skipped recomputing the chain, never to prove authorship — `handoff.test.ts` |

### Import — bad-file fixtures (`invalid_format`)

| ID | Asserts |
|---|---|
| TC-RG-8-06 | A malformed (non-ISO) `occurred_at` on any event is refused — `handoff.test.ts` |
| TC-RG-8-07 | A register node whose `metadata.node_type` disagrees with its own `node_type` is refused — `handoff.test.ts` |
| TC-RG-8-08 | An unknown `event_type` is refused — `handoff.test.ts` |
| TC-RG-8-09 | A payload missing a field required for its type is refused — `handoff.test.ts` |
| TC-RG-8-10 | Two different events sharing the same `event_id` inside one bundle are refused, with a message naming the duplicate — `handoff.test.ts` |
| TC-RG-8-11 | An unsupported `format_version` gets its own distinct "different version of AIGate" message, not the generic "not a bundle" one — `handoff.test.ts` |

### Import — sync outcomes

| ID | Asserts |
|---|---|
| TC-RG-8-12 | Merge of a continuation: B adopts A's bundle, appends a sign-off, and A imports B's bundle back — outcome `merged`, exactly the one new event added, chain verifies — `handoff.test.ts` |
| TC-RG-8-13 | Up to date: re-importing a bundle identical to the current state reports `up_to_date` with zero events added — `handoff.test.ts` |
| TC-RG-8-14 | Local-ahead: importing a bundle the local copy already extends does nothing (`local_ahead`), local state untouched — `handoff.test.ts` |
| TC-RG-8-15 | Import into an empty store: an empty machine adopts a bundle wholesale (`imported_into_empty`), the transplanted chain verifies against the live store — `handoff.test.ts` |
| TC-RG-8-16 | "Different histories" message — the first time this browser has ever received a case: the calm "this is normal" wording, never "warning" — `handoff.test.ts` |
| TC-RG-8-17 | "Different histories" message — after a previous successful sync: a later divergence is worded as a warning asking the user to check with the sender — `handoff.test.ts` |

### Two-step replace

| ID | Asserts |
|---|---|
| TC-RG-8-18 | Backup failure aborts: when the backup download throws, "Couldn't create a backup, so nothing was replaced" is shown and the confirm-replace button never appears — `RegisterView.handoff.test.tsx` |
| TC-RG-8-19 | Confirm replaces: after a successful backup, step 2's confirm button actually replaces the register with the bundle's contents — `RegisterView.handoff.test.tsx` |
| TC-RG-8-20 | Keep leaves it: "Keep my register" cancels the pending replace at step 1, no destructive action offered — `RegisterView.handoff.test.tsx` |
| TC-RG-8-21 | An unrelated failed import (a completely different, broken file) does not clear a valid pending replace decision — `RegisterView.handoff.test.tsx` |

### Concurrency (append-only data-integrity)

| ID | Asserts |
|---|---|
| TC-RG-8-22 | A local `append()` racing a concurrent `importBundle()` of an extending bundle cannot fork the chain or silently lose either write — `handoff.test.ts` |
| TC-RG-8-23 | Two concurrent imports of the same extending bundle apply it exactly once — no duplicate `event_id` write — `handoff.test.ts` |

### Supporting invariants the hand-off bundle depends on

| ID | Asserts |
|---|---|
| TC-RG-8-24 | The monotonic clock floor is restored from the stored trail after a reset (simulated page reload), instead of restarting at zero — protects an imported chain from a later local append landing "before" a far-future imported timestamp — `audit.test.ts` |
| TC-RG-8-25 | Chain verification and export order follow hash links, not `occurred_at` — a clock-skewed, out-of-time-order pair still verifies and exports in true chain order, exactly the shape a chain imported from another machine has — `audit.test.ts` |
| TC-RG-8-26 | The register list skips an unreadable row instead of throwing and freezing the whole list — `register.test.ts` |
| TC-RG-8-27 | An unrecognised event type (from a newer app version, or a damaged record) still renders a visible timeline line naming it, instead of a blank line — `RegisterDetail.eventDetail.test.tsx` |

The audit-export allowlist guard (every function the audit module exports
must be named on an explicit allowlist, so a new write path fails this test
until someone consciously adds it — the safeguard hand-off's own replace
primitive had to be added to) is also an RG-8 invariant, but it already
carries its own ids — **`TC-NF-2-01` / `TC-VD-4-01`**, in `register.test.ts`
("the audit trail exposes no update or delete path"). Referenced here, not
renamed or re-numbered, per this round's brief.

## RG-9 — Control-evidence attestation

`requirements/requirements.md`, RG-9: "A reviewer shall be able to record,
against the current verdict, that a required control is in place, with
their name and an evidence note. The attestation shall be shown as a human
claim — "attested — not verified" — never as machine-verified, and shall be
counted separately from machine-verified evidence."

| ID | Asserts |
|---|---|
| TC-RG-9-01 | Attesting a control records a `control_evidence_attested` audit event carrying the control id, the attester's name, the evidence note, and the verdict id — `RegisterDetail.controlEvidence.test.tsx` |
| TC-RG-9-02 | The per-control chip in "What you need to do" reads exactly "attested — not verified", lower-case like its neighbours — `VerdictDisplay.cr005.test.tsx` |
| TC-RG-9-03 | The evidence panel shows "ATTESTED — NOT VERIFIED" with the attester and evidence note, distinct from a "VERIFIED" control alongside it — `VerdictDisplay.cr005.test.tsx` |
| TC-RG-9-04 | The sign-off checklist counts machine-verified, attested, and outstanding controls separately, and calls the verified+attested total "addressed" — never "in place", which stays reserved for machine-verified — `VerdictDisplay.cr005.test.tsx` |
| TC-RG-9-05 | With no policy loaded, the sign-off checklist says evidence is unknown instead of a confident outstanding/addressed count — `VerdictDisplay.cr005.test.tsx` |
| TC-RG-9-06 | With no policy loaded, a recorded attestation still names itself on the checklist line, because it comes from the audit trail, not the policy — `VerdictDisplay.cr005.test.tsx` |
| TC-RG-9-07 | Attesting a second, different control while the first control's write is still in flight records both attestations, not just one — the in-flight guard is per control id — `RegisterDetail.controlEvidence.test.tsx` |
| TC-RG-9-08 | When the write fails, the attest form stays open with the error shown inline (typed values preserved) instead of silently closing as if it had saved — `VerdictDisplay.cr005.test.tsx` |
| TC-RG-9-09 | "Independent validation (2LoD)" — a control and a downstream review naming the same obligation in different words — renders once, as the control, with an "also covers" note naming the matched review — `VerdictDisplay.cr005.test.tsx` |
| TC-RG-9-10 | A control name with only one significant word (e.g. "Validation") never absorbs a review by that one shared word alone — the review stays listed on its own — `VerdictDisplay.cr005.test.tsx` |

### Untested behaviours

None. Every behaviour on this round's brief had an existing test that
already proved it — this round only added the id.

### Verification

`python3 scripts/trace-check.py` — clean, every id in this file traced to a
named test, no dangling `[Trace:]` paths (none used in this round — see
`test-cases-015.md`'s precedent). Each of the seven touched test files was
re-run individually with `npm test -- <path>` (never bare `vitest` — this
project's Node 26/jsdom `localStorage` gotcha) and produced the same pass
count as before this round's edits, since no test body, assertion, or
behaviour changed — only `it()` title strings gained a `TC-RG-8-NN:` /
`TC-RG-9-NN:` prefix. The full suite was not run for this round (explicitly
out of scope for the task that produced this file).

| Date | Change |
|---|---|
| 2026-09-28 | Written to close the RG-8/RG-9 traceability gap. |

---

*Developed using the Grounded Vibe Methodology*
