# Forward Notes

Append-only. Cross-chunk decisions recognised as owed but deferred. Consumed and
marked, never deleted.

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
