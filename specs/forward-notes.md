# Forward Notes

Append-only. Cross-chunk decisions recognised as owed but deferred. Consumed and
marked, never deleted.

---

## FN-004 — Two affordances share one switch, and one day they may not

**Raised by:** P8-C06 (2026-08-04). **Binds:** whoever first needs one without
the other.
**Status:** open.

`VerdictDisplay` gates both the correction affordance and the reasoning-trace
disclosure on `showSubmitterAffordances`, which is derived from `onCorrect`
being supplied. That is correct today: `register-lifecycle.md` §15.1b excludes
both from the reviewer's page, so the two exclusions are co-extensive.

They are not the same concern, though. Correction is a submitter action; the
trace is an optional plain-English retelling. Review of P8-C06 flagged the risk:
a maintainer reading a trace disclosure gated on a correction handler could
reasonably conclude the trace is a correction concern, and a future caller
wanting one without the other would find the shape silently prevents it.

**Deliberately not split now.** A second prop with no consumer is the
"computed but never consumed" pattern this project treats as a bug in waiting.
The concept is named instead, so the intent is legible at the call site.
**Split it the moment a real caller needs them apart** — likely candidates: a
read-only submitter view, or a reviewer page that wants the trace for context
without offering correction.

---

## FN-003 — Requirement wording that invites an overclaim

**Raised by:** P8-C05 (2026-08-04). **Binds:** P8-C07, and any future round
touching R3-JU-3 or the verdict's absence-of-basis messaging.
**Status:** open.

R3-JU-3 says a verdict with no active packs must state "that no regulatory
basis was applied". Read literally that is false: the firm's own policy carries
31 `regulatory_basis` citations and they render on the verdict regardless of
packs. Two drafts in P8-C05 wrote the literal claim and were caught in review
passes 3 and 4 — the second only because a test fixture was changed from
`binding_regulatory_basis: null` to a real citation, which is the field whose
emptiness had been hiding the falsehood.

A scope clarification is recorded in `requirements/requirements-003.md` under
R3-JU-3 itself, because that is where a future reader will look. **P8-C07
renders the same verdict on the sign-off page and must not reintroduce the
literal wording there.** The pattern to watch for generally: a fixture whose
empty field is the only reason a claim looks true.

---

## FN-002 — "What comes after Phase 8" is written nowhere

**Raised by:** P8-C03 (2026-07-29). **Binds:** the Phase 8 closing handover.
**Status:** open.

`HANDOVER.md` documents the next *step*, not the next *phase*, so when Phase 8
ends there is no single place answering "what now". The four known items are
real but scattered: charter 004's unrouted defects (D-001 description
discarded, D-004 register shows the input-node name, D-006 vendor silently
defaulted) and the charter 005 re-walk are in `specs/implementation-guide.md`
§11.5; the RF-2 spec-twin drift is a standing constraint in `HANDOVER.md`, not
a work item; the duplicate-check hang found during P8-C02's smoke is only in
that chunk's handover and a spawned task.

Deferred deliberately, at the user's direction, to the Phase 8 closing handover
rather than done mid-phase. **What it must contain:** an "After Phase 8"
section listing each item with a pointer to where it is actually specified —
not a restatement, a pointer, so there is one place to look and no second copy
to drift.

---

## FN-001 — P8-C03's scope is largely discharged by P8-C01

**Raised by:** P8-C01 (2026-07-29). **Binds:** P8-C03.
**Status:** CONSUMED by P8-C03 (2026-07-29). The note held: no migration code
was written. P8-C03 added the `TC-R3-JU-7-01` and `-02` trace IDs, wrote the
missing empty-legacy-draft case, and mutation-tested both — reverting the
envelope to infer the answer from the array's length fails all of them, so they
are capable of catching the defect they name. The confirmation step also found
that `TC-R3-JU-1-04` had no test at all despite P8-C01 claiming the range
`-01…-05`; that gap is closed in the same chunk.

P8-C01 persists the intake draft as an envelope `{ values, jurisdictionAnswer }`.
A draft written before round 3 is a bare values object with no envelope, so it
carries no answered-state and loads as 'unanswered' — R3-JU-7's rule falling out
of the shape rather than being special-cased. Two tests in
`StructuredForm.test.tsx` cover the empty and the populated legacy draft.

Independent review pass 2 reached the same conclusion unprompted.

**What P8-C03 should therefore do:** add the `TC-R3-JU-7-01/02` trace IDs to the
covering tests, confirm no further edge case is open, and close. It should NOT
re-implement the migration. If C03 finds a genuine gap, record it here rather
than rebuilding what exists.
