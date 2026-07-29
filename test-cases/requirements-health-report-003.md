# Requirements Health Report — Round 3

*Generated 2026-07-29 against `requirements/requirements-003.md` (commit 6ec6cc4).*

12 requirements assessed: R3-JU (6), R3-RD (4), R3-NF (2).
**7 issues found** — 2 untestable, 1 inconsistency, 2 weak, 2 missing coverage.
Plus 1 constraint conflict that is not a requirements defect but will break
existing tests if unhandled.

Grounded in Wiegers (ambiguity indicators), the Robertsons (fit criteria),
Copeland (technique selection), Kaner (realistic data), and Beizer
(thoroughness).

---

## HR3-01 — R3-RD-1: "decision-bearing content" is undefined · **Untestable**

> Fit criterion: "Compared against the verdict rendered by the intake flow for
> the same use case, the decision-bearing content matches."

A tester cannot write this assertion. "Decision-bearing" is not defined
anywhere in the document, and the two views legitimately differ — the intake
verdict carries a "Correct this classification?" affordance and a reasoning
trace that make no sense on a sign-off page.

**To make it testable**, enumerate what must be present. Proposed closed list:

1. the verdict status and tier
2. the binding constraint id
3. every triggered invariant id, with its citation text
4. every control id in the minimal control set, with each control's evidence
   status (VERIFIED / UNVERIFIED)
5. the governance margin figure and the ids flagged NO HEADROOM
6. the standing conditions

Anything outside that list may differ between the two views without failing.

**Suggested rewrite of the fit criterion:** "The page contains each of the six
elements enumerated in R3-RD-1. For a use case whose intake verdict listed N
invariants and M controls, the sign-off page lists the same N ids and the same
M ids."

---

## HR3-02 — R3-JU-5: "or equivalent" defeats the assertion · **Untestable**

> "the form carries a visible required-marker **or equivalent**"

"Or equivalent" is an open set; a test cannot enumerate it. Wiegers lists this
class of escape hatch as a primary ambiguity indicator.

**To make it testable**, name the mechanism. Either: every field whose absence
blocks progress carries `aria-required="true"` *and* a visible marker; or the
form renders a named list of outstanding fields. Pick one — both are testable,
"or equivalent" is not.

---

## HR3-03 — R3-JU-3 and R3-JU-6 overlap on the same output · **Inconsistency**

For the no-jurisdiction case both requirements demand a statement on the
verdict:

- **JU-3** — "state plainly that no regulatory basis was applied and that
  citations are absent for that reason"
- **JU-6** — "state which condition made it Provisional"

For that case these are the same sentence. It is unclear whether the
implementation must produce one statement or two, and a test written against
one may pass while the other is unimplemented.

**Resolution needed:** either (a) JU-6 subsumes JU-3 for the no-jurisdiction
case, and JU-3 is folded in; or (b) they are distinct — JU-3 explains the
consequence to the user, JU-6 labels the status for the record — and each gets
its own assertion target. **Recommend (b)**, stated explicitly, because the two
serve different readers: JU-3 is prose for the submitter, JU-6 is a labelled
reason on the record for the auditor.

---

## HR3-04 — R3-JU-2: "record the reason" names no location · **Weak**

The requirement says the verdict "shall record the reason", and the fit
criterion says it is "machine-readable", but nothing says where it lives. A
test cannot assert on an unnamed field.

**To strengthen:** name the carrier — e.g. the verdict gains a
`provisional_reasons` collection, each entry naming a condition. This is close
to an implementation detail, but a fit criterion needs *some* stable surface to
assert against, and the alternative is asserting on rendered prose, which is
brittle and duplicates JU-6.

---

## HR3-05 — R3-JU-1: no representation distinguishes "not answered" from "answered: none" · **Weak**

The requirement is sound but currently unimplementable as stated:
`graph.jurisdictions` is a `string[]`, and an empty array cannot distinguish
"the user chose none" from "the user never touched the field". The fit
criterion acknowledges this ("an empty array alone does not satisfy it")
without saying what does.

This is a genuine gap in the requirement, not merely an implementation concern
— the distinction *is* the requirement.

**To strengthen:** state that the intake form must carry an explicit
answered-state for the jurisdiction question, separate from the selected set.
Leave the mechanism to the tech spec.

---

## HR3-06 — Provisional verdicts and the 2LoD sign-off flow · **Missing coverage**

R3-JU-2 makes a class of verdict Provisional. Nothing in round 3 says what a
2LoD reviewer may do with one.

Open: can a Provisional verdict be approved? Does approving it clear the
Provisional status, or does the status persist on the record? Does the register
show it differently from a Provisional caused by unsigned pack rules — R3-JU-6
requires the *verdict* to distinguish them, but says nothing about the register
row.

This matters because LC-2 (round 1) governs High-tier sign-off, and a
Provisional verdict awaiting sign-off is a state round 1 never contemplated.

---

## HR3-07 — Existing saved form drafts · **Missing coverage**

The intake form persists a draft (`loadFormDraft`). Round 3 introduces a new
required answered-state for the jurisdiction question. Nothing says what
happens to a draft saved before this change: is the user re-prompted, is the
draft treated as unanswered, or does it silently satisfy the new check?

Silently satisfying it would reintroduce the exact defect R3-JU-1 closes, for
every user with an existing draft.

---

## HR3-08 — Constraint conflict: rendering the verdict introduces "Approved" onto the register page · **Not a requirements defect — flagged for the tech spec**

Round 3's own Constraints section notes that the verdict screen is asserted by
a single-match `/approved|rejected/i` query, and warns new strings away from
those words.

R3-RD-1 goes further than a new string: it renders the **whole verdict**,
including its status — which for most use cases is literally "Approved with
controls". Any existing test that queries the register detail page with a
single-match pattern may now match more than once, or match text it did not
before.

This is not a defect in the requirement. It is a known breakage the tech spec
and build must plan for: tighten the queries before RD-1 lands, not after the
suite goes red.

---

## Assessment

R3-RD-1 and R3-JU-5 should be fixed before test generation — both are
untestable as written, and generating tests against them would produce
assertions that encode a guess.

HR3-03, HR3-04 and HR3-05 are resolvable with a sentence each and are worth
fixing now rather than discovering in the build.

HR3-06 and HR3-07 are genuine scope questions. Either can legitimately be
answered "out of scope for round 3" — but that should be a recorded decision,
not an omission.

HR3-08 needs no requirements change; it needs to reach the tech spec.
