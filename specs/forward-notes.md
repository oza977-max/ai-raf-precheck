# Forward Notes

Append-only. Cross-chunk decisions recognised as owed but deferred. Consumed and
marked, never deleted.

---

## FN-001 — P8-C03's scope is largely discharged by P8-C01

**Raised by:** P8-C01 (2026-07-29). **Binds:** P8-C03.
**Status:** open.

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
