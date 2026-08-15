# Forward Notes

Append-only. Cross-chunk decisions recognised as owed but deferred. Consumed and
marked, never deleted.

---

## FN-008 — An unreproduced full-suite flake, recorded rather than explained away

**Raised by:** v0.2.0 work (2026-08-14). **Status:** OPEN — not reproduced,
not diagnosed, deliberately not dismissed.

During the verification ritual for the decision-type change, the full suite
reported `1 failed | 406 passed (407)` on two of three consecutive runs and
passed cleanly on the third. **The failing test was never named** — the loop
that observed it grepped only the summary line, so the name scrolled past
before anything captured it. That is the mistake worth not repeating: when
hunting an intermittent failure, capture the whole output on the first
occurrence, because there may not be a second.

**Not reproduced in 17 consecutive full-suite runs afterwards**, plus 8 runs of
`properties.test.ts` in isolation (the first suspect, since fast-check
randomises its seed per run and an intermittent property failure would mean a
real counterexample — it did not).

**The most likely explanation is CPU contention, and it is explicitly a
hypothesis rather than a finding.** The failures occurred while a mutation-test
loop and browser automation were running against the same machine as the suite.
`test/explore-005.md` O-003 records the same shape being misdiagnosed once
already: `TC-R3-JU-5-01` failed 3 of 6 runs under concurrent-agent load, was
first written up as an inherently slow test, and turned out to need no change
at all — the real cause was two vitest copies competing for CPU.

**What to do if it recurs:** capture the full output immediately
(`npm test 2>&1 | tee /tmp/flake.log`), get the test name, and only then form
a theory. Do not assume it is environmental because this note says it probably
was — that is precisely the reasoning O-003 warns against.

---

## FN-007 — Four spec files documented an effect type that does not exist

**Raised by:** build verification 004 (2026-08-08). **Status:** CLOSED in
v0.1.2 (2026-08-09).

`track_floor` was removed from the engine when the supplement model was chosen
(V2-A), but it survived in `specs/policy-schema.md`, `policy-schema.html`,
`evaluation-engine.html` — and `evaluation-engine.md` contradicted *itself*,
collecting `track_floor` at line 168 and declaring it removed at line 182. Two
acceptance criteria (TC-PE-6-01, TC-RA-2-01) still asserted the behaviour it
would have produced, so they failed verification against a correct engine.

`spec-parity-check.py` reads only `.md`, so it could not see the twin drift,
and it does not read the engine, so it could not see the contradiction either.
**That gap is still open**: the checker compares `.md` files to each other, not
to the code. A spec that confidently describes a symbol which no longer exists
remains undetectable by any automated check in this repo.

---

## FN-006 — Intake is forward-only, and the stepper implies otherwise

**Raised by:** user report during post-release use (2026-08-08).
**Status:** CLOSED in v0.1.1 (2026-08-08). `STEP_BACK` added to the reducer,
bounded at the confirmation attestation; an explicit `← Back` control on
duplicate_check / graph_review / questionnaire; the step immediately behind the
current one made a real button in the tracker. Answers preserved where the
target step's shape can hold them — the design question below was settled that
way, and the reasoning is recorded in the reducer case rather than here.

**One trap worth carrying forward.** The first version of the fix reset
`duplicateCheckDone` and not `dupCheckInFlight`. The latter is a StrictMode
double-invoke guard, set once and never reset for the life of the mount, so
re-entering the duplicate check would have sat on "Checking the existing
inventory…" forever with no way forward — D-001 reintroduced by its own fix,
which is exactly what the handover means by "a fix pass is not a safe pass".
Caught before commit by walking the flow in the browser, not by a test.

**The report:** "after describing, if I go to the next step it doesn't go back
— there is no back option."

**Confirmed.** On every intake step past `description_entry` the only controls
are the forward button and the sidebar's *Clear all data and start over*.
`IntakeAction` in `src/components/intake-state.ts:66-95` carries forward
transitions plus `RESTART`, and no back action of any kind. So the only escape
from a typo in the description is to destroy the entire session.

**The part that makes it worse is a false affordance.** The stepper renders
completed steps with a ✓, which reads as clickable progress navigation. Those
items are plain `<li>` elements — no handler, `cursor: auto`. The one control a
user would instinctively reach for looks interactive and is not.

**Two backward paths do exist**, which is likely why five exploratory charters
missed this: per-node **Edit** on the graph-review step, and *Correct this
classification?* on the verdict, which re-enters at `graph_review`. Neither
returns to the description.

**This was never specified.** No requirement, spec or test case mentions back
navigation — so no test failed and no review caught it. It is a gap in the
specification, not an unimplemented requirement, and that is the more useful
way to record it: the same blind spot would recur in any new flow.

Charter 005 was in adjacent territory and did not catch it either. It fixed
`RESTART` because *Start over instead* dispatched an action the reducer
discarded from that step. That added a **reset**. Nobody noticed there was no
**back**.

**What a fix should and should not do.** `confirmation` is an attestation and a
deliberate commitment point — it should stay one-way. `duplicate_check`,
`graph_review` and `questionnaire` have no such justification. A fix therefore
needs a `STEP_BACK` action bounded so it cannot cross the attestation, a back
control on those three steps, and the stepper's completed items made genuinely
clickable so the affordance stops lying.

**The open design question, unanswered:** whether stepping back preserves
downstream answers (kinder, matches the existing draft persistence) or clears
them (simpler, avoids stale-answer bugs). Decide this before writing the
reducer, not after — it determines whether `STEP_BACK` carries a payload.

---

## FN-005 — A condition cannot say WHICH node it means

**Raised by:** round 4, CS-3 (2026-08-04). **Binds:** any rule that needs to
distinguish where data sits from where the model runs.
**Status:** open.

`matchesCondition` flattens every input, processing and output node into one
lookup and matches if ANY node carries the field and satisfies the operator
(`src/engine/condition.ts:6-19`). That is fine for fields unique to one node
type — `data_class` is input-only, `vendor` and `model_type` are
processing-only — and wrong for `data_zone`, which exists on both.

The concrete consequence: CS-3's own example of a "cloud security approval"
triggered by processing outside the firm's estate **cannot be written
correctly**. A rule reading `data_zone: { in: ["Zone B"] }` fires on a use case
whose DATA sits in Zone B while the model runs safely in Zone C — the wrong
question, silently answered, in front of someone who now has a review to
discharge for no reason.

The rule was **not written**, and the reason is recorded in
`policy/appetite.yaml` beside where it would have gone. The fix is a way to
scope a condition to a node type — `processing.data_zone` or an explicit
`node_type` key — which is a change to the condition language (ADR-002's
minimal operator set) and touches every consumer of it. Worth doing when a
second rule needs it; not worth doing on the strength of one.

**Note for whoever does it:** the same ambiguity is latent in the existing
invariants and hard lines. None of them is currently wrong, because the
zone-crossing rules genuinely mean "any node", but a future author could
reasonably read `data_zone` as "the processing zone" and be silently mistaken.

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
**Status:** CONSUMED by P8-C08 (2026-08-04) — the "After Phase 8" section is in
`HANDOVER.md`, with a pointer per item rather than a restatement, so there is
one place to look and no second copy to drift.

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
