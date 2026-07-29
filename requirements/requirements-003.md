# AIGate — Requirements

## Round 3 — Reachable Reasoning

*Elicited 2026-07-29. Round 3 of 3.*

---

## Relationship to Previous Rounds

Round 1 (`requirements.md`) specified the pre-check engine and the V1 client.
Round 2 (`requirements-002.md`) specified the V1.5 server tier.

Round 3 is smaller than either and has a single theme. Both requirements come
from exploratory charter 004 (`test/explore-004.md`), the first time anyone
walked AIGate as a person seeing it for the first time. Neither is a defect
against Rounds 1 or 2 — in both cases the behaviour was never specified, so the
build cannot be said to have got it wrong. That is why they are promoted here
rather than parked as bugs.

The theme is that the product's reasoning exists and is correct but does not
reliably reach the person who needs it. In one case the user can suppress the
regulatory basis without knowing they have done so; in the other the reasoning
is produced and then not shown to the reviewer asked to sign it off.

**Round 3 IDs are prefixed `R3-`** and are independent of Rounds 1 and 2.

Rounds 1 and 2 remain immutable. Nothing here supersedes them.

### Provenance

| Requirement | Source | Severity as filed |
|---|---|---|
| R3-JU | Charter 004 D-002 | Critical |
| R3-RD | Charter 004 D-005 | Critical |

Charter 004 supersedes charter 003, which recorded D-002 with the wrong cause
(it claimed the jurisdiction field did not exist; it does). The corrected
finding is the one carried here.

---

## Expert Panel

| Expert | Work | Role in This Document |
|---|---|---|
| Suzanne & James Robertson | *Mastering the Requirements Process* (3rd ed.) | Fit criteria — every requirement below states how it is verified |
| Karl Wiegers | *Software Requirements* (3rd ed.) | Ambiguity indicators; requirement classification |
| Donald Gause & Gerald Weinberg | *Exploring Requirements* | Surfacing the assumption that a produced verdict is a delivered verdict |
| EU AI Act | *Regulation (EU) 2024/1689* | Tier 2b — why an absent jurisdiction is not a neutral default |
| PRA | *SS1/23* (2023) | Tier 2b — the reviewer's evidential basis for sign-off |
| Federal Reserve/OCC/FDIC | *SR 26-2* (2026) | Tier 2b — model risk governance sign-off expectations |
| Nancy Leveson | *Engineering a Safer World* | Constraints enforced by control structure — a silent default is an unenforced constraint |

---

## 1. Purpose & Vision

**Job statement.** When I am deciding whether an AI use case is inside our risk
appetite, I want the reasoning behind the verdict to be in front of me at the
moment I act on it, so I can sign my name to a decision I can actually defend.

Round 3 exists because AIGate's value is auditability, and auditability is not
a property of a computation — it is a property of what a person can see when
they are asked to commit. A verdict that is computed correctly and then not
shown is, from the auditor's point of view, indistinguishable from a verdict
that was never computed.

Both requirements below are presentation and validation requirements. Neither
changes the engine. Neither changes a policy rule.

---

## 2. Target User

Both requirements serve users already described in Round 2.

**Priya — Head of AI Governance (2LoD).** R3-RD is hers. She is the person
asked to approve or request correction on a High-tier use case, and today the
page she does that from does not show her the verdict she is approving.

**James — AI Developer (1LoD).** R3-JU is his. He completes the intake form
without knowing which fields carry regulatory weight, and can produce a verdict
with no regulatory basis without ever being told that is what happened.

---

## 3. Functional Requirements

### R3-JU — Jurisdiction Completeness

The guided intake form offers six jurisdiction checkboxes (UK, US, EU, CA, SG,
JP). None is ticked by default. Nothing requires an answer: the completeness
predicate tests the jurisdictions array for presence only, and an empty array
is truthy. So the form's Continue button enables with nothing ticked, the user
attests to a graph reading "JURISDICTIONS — None specified", and the engine
returns a full verdict with no jurisdiction packs activated, no regulatory
reasoning chain, and no citations.

Nothing at any point tells the user that the regulatory basis is missing or
why. The domain reason this matters: an absent jurisdiction is not a neutral
default. Every authored pack — SR 26-2, SS1/23, EU AI Act, DORA — activates on
jurisdiction, so an empty jurisdiction set silently disables the entire
regulatory-citation feature, which is the product's central claim.

**R3-JU-1 (Must):** The guided intake form shall require an explicit
jurisdiction answer before allowing the use case to proceed. An explicit answer
is either one or more jurisdictions selected, or an explicit
"none / not sure" recorded as a deliberate choice. An untouched jurisdiction
field is not an answer.

The form shall carry an explicit answered-state for the jurisdiction question,
separate from the set of jurisdictions selected. The mechanism is left to the
technical specification; the distinction between "not answered" and
"answered: none" is the requirement, and an empty selection alone cannot
express it.

> Fit criterion: with no jurisdiction control touched, the form's Continue
> action is unavailable. With "none / not sure" chosen, it is available. With
> one or more jurisdictions ticked, it is available. The three states are
> distinguishable from the form's persisted state, not inferred from the
> selection being empty.

**R3-JU-2 (Must):** Where the user has answered "none / not sure", the
resulting verdict shall be marked **Provisional**, and shall record the reason
for that status as *no regulatory basis applied* — a reason distinct from the
unsigned-pack-rules reason of NF-7.

The reason shall be carried on the verdict itself as a named, enumerable value
— not inferred from rendered prose. The technical specification names the
field; this requirement fixes only that a stable machine-readable surface
exists and that `no_regulatory_basis` is distinct from the unsigned-rules
condition.

> Fit criterion: a use case submitted with "none / not sure" produces a verdict
> whose status is Provisional, and the register row shows Provisional. The
> verdict carries a machine-readable reason whose value identifies the
> no-regulatory-basis condition specifically. A use case submitted with at
> least one jurisdiction is not made Provisional by this requirement.

**R3-JU-3 (Must):** A verdict produced with no active jurisdiction packs shall
state plainly, on the verdict itself, that no regulatory basis was applied and
that citations are absent for that reason.

This is distinct from R3-JU-6 and both apply. R3-JU-3 is prose addressed to
the submitter explaining the consequence; R3-JU-6 is a labelled reason on the
record addressed to a later reader. One satisfies the user; the other satisfies
the audit. An implementation that provides only one has met only one.

> Fit criterion: the verdict view for a "none / not sure" submission contains an
> explicit statement to that effect. It does not merely omit the regulatory
> reasoning chain. Absence is never communicated by absence. The statement
> required here is asserted separately from the labelled reason required by
> R3-JU-6.

**R3-JU-4 (Should):** The jurisdiction question shall state, at the point of
asking, that the answer determines which regulatory rules are applied.

> Fit criterion: the field's help text names the consequence. A user who reads
> only the field and its help can tell that leaving it empty has an effect.

**R3-JU-5 (Should):** Every field the form requires shall carry a visible
required-marker and the accessible attribute `aria-required="true"`, before the
user attempts to proceed.

> Fit criterion: for each field whose absence would disable the Continue
> action, the rendered form carries both a visible required-marker and
> `aria-required="true"`. Enumerated by query: the set of fields blocking
> progress and the set carrying the marker are identical, with no member of
> either outside the other. *(Also closes charter 004 D-003, filed Important —
> a disabled Continue with nothing naming the outstanding field.)*

**R3-JU-6 (Must):** Where a verdict is Provisional, it shall state which
condition made it Provisional. Where more than one applies, all shall be
stated.

> Fit criterion: a Provisional verdict names its cause in the rendered output.
> A verdict provisional because no jurisdiction was supplied is distinguishable,
> by a reader and by a test, from one provisional because it relies on unsigned
> pack rules. A verdict that is both states both.
>
> Rationale: the two conditions are different claims. Unsigned pack rules mean
> rules *were* applied but are proposed interpretations pending firm adoption —
> a basis exists and is not yet adopted. No jurisdiction means no regulatory
> rules were applied at all — there is no basis. Presenting the second as the
> first would claim more than the product can prove, which this product
> treats as a functional defect rather than a matter of tone.

**R3-JU-7 (Must):** A saved intake draft created before this round shall be
treated as having no jurisdiction answer, and the user shall be required to
answer before proceeding.

> Fit criterion: a draft persisted without an explicit answered-state loads with
> the jurisdiction question unanswered and Continue unavailable. It does not
> silently satisfy R3-JU-1. Verified by loading a draft in the pre-round-3
> shape.
>
> Rationale: a pre-existing draft that passes the new check would reintroduce,
> for every user holding one, exactly the defect R3-JU-1 closes — and would do
> so invisibly, because the user never sees the question they failed to answer.

### R3-RD — Register Detail Verdict Visibility

The register detail page is where a 2LoD reviewer approves a High-tier use case
or requests correction on it. It currently shows the tier, the track, the
status, a notes box, the Approve and Request-correction actions, and the
append-only audit trail. It does not show the verdict. There is no invariant
list, no minimal control set, no regulatory citation, and no governance margin.
The reviewer is asked to attest to a decision whose basis the page does not
present.

The full verdict object is already persisted in the audit trail's
`verdict_produced` payload, so nothing needs to be recomputed and no engine
change is required. This is a presentation gap.

**R3-RD-1 (Must):** The register detail page shall display the full verdict for
the use case, as the intake flow displays it: the binding constraint, every
triggered invariant with its regulatory citation, the minimal control set with
each control's evidence status, the governance margin, and the standing
conditions.

The decision-bearing content is this closed list of six elements. Anything
outside it may legitimately differ between the two views — the intake verdict
carries affordances, such as the reclassification prompt and the reasoning
trace, that have no place on a sign-off page.

1. the verdict status and the tier
2. the binding constraint id
3. every triggered invariant id, each with its regulatory citation text
4. every control id in the minimal control set, each with its evidence status
   (VERIFIED or UNVERIFIED)
5. the governance margin figure, and the ids flagged as having no headroom
6. the standing conditions

> Fit criterion: the page contains each of the six elements above. For a use
> case whose intake verdict listed N triggered invariants and M controls in the
> minimal set, the sign-off page lists the same N invariant ids and the same M
> control ids — compared as sets, not as rendered text. Elements outside the
> list are not asserted.

**R3-RD-2 (Must):** Where no verdict is recorded for a register entry, the page
shall say so explicitly and shall still permit sign-off.

> Fit criterion: an entry with no `verdict_produced` event renders a plain
> statement that no verdict is recorded, not an empty panel or a hidden
> section. The Approve and Request-correction actions remain available.

**R3-RD-3 (Must):** The verdict shown to the reviewer shall be the verdict
their sign-off attaches to.

> Fit criterion: where a use case has been corrected and re-evaluated, the page
> shows the latest verdict, and the audit event written on sign-off refers to
> that same verdict. A reviewer cannot approve one verdict while reading
> another.

**R3-RD-4 (Should):** The verdict shall be readable without leaving the page on
which sign-off happens.

> Fit criterion: no navigation away from the register detail page is required
> to read any decision-bearing element of the verdict.

---

## 4. Non-Functional Requirements

**R3-NF-1 (Must):** Neither requirement shall alter engine output. `evaluate()`
remains byte-identical for identical inputs (NF-1), and the determinism test
continues to pass unchanged.

> Fit criterion: the existing determinism test passes without modification.
> R3-JU-1 and R3-JU-5 act on the intake form; R3-JU-2 and R3-JU-3 act on verdict
> status and presentation; R3-RD acts on presentation only.

**R3-NF-2 (Must):** The register detail page shall not write to the audit trail
as a side effect of rendering the verdict.

> Fit criterion: opening the detail page produces no new audit events. The
> trail is append-only evidence and a duplicate event is a data-integrity
> defect, not a UX nit.

---

## 5. Assumptions

- The persisted `verdict_produced` payload carries the complete verdict object
  for every entry created since V1. Entries predating it — including the
  AIGate self-assessment — are the case R3-RD-2 covers.
- "None / not sure" is a legitimate answer for a genuine pre-check, not only an
  escape hatch. A user who does not yet know where a system will operate should
  be able to get a provisional read.

## 6. Constraints

- The verdict screen is asserted in UI tests by a single-match
  `/approved|rejected/i` query. Any new rendered string introduced by R3-JU-3 or
  R3-RD-1 must avoid those two words, or the query must be tightened first.
- `src/engine/*` is a pure island. No requirement here may add I/O, React, or
  non-determinism to its call graph.

## 7. Out of Scope

- Changing which jurisdictions exist, or authoring further packs.
- Any change to how the engine activates packs once a jurisdiction is supplied.
- What a 2LoD reviewer may do with a Provisional verdict — whether it can be
  approved, whether approval clears the status, and whether the register
  distinguishes the two causes at row level (health report HR3-06). Deliberately
  deferred, not omitted: deferred until both kinds of Provisional can be
  observed together.
- The remaining charter 004 findings — D-001 (intake description discarded),
  D-004 (register shows the input-node name), D-006 (vendor silently defaulted).
  These are defects against existing behaviour and belong in a build fix, not
  in a requirements round. D-003 is closed by R3-JU-5.

## 8. Open Questions

- Should a use case whose jurisdiction answer is "none / not sure" be
  re-promptable later without a full re-submission? Not decided; not blocking.
- *(Resolved 2026-07-29, before approval.)* Whether the Provisional status
  introduced by R3-JU-2 must be distinguishable from the Provisional caused by
  unsigned pack rules: **yes**. Now specified by R3-JU-6. The two conditions
  are different claims and conflating them would overstate what the product
  checked.

---

## 9. Requirements Index

| ID | Domain | Summary | Priority |
|---|---|---|---|
| R3-JU-1 | Jurisdiction | Explicit jurisdiction answer required before proceeding | Must |
| R3-JU-2 | Jurisdiction | "None / not sure" produces a Provisional verdict | Must |
| R3-JU-3 | Jurisdiction | Verdict states plainly when no regulatory basis was applied | Must |
| R3-JU-4 | Jurisdiction | Field states that the answer selects the regulatory rules | Should |
| R3-JU-5 | Jurisdiction | Required fields are identifiable before attempting to proceed | Should |
| R3-JU-6 | Jurisdiction | A Provisional verdict states which condition caused it | Must |
| R3-JU-7 | Jurisdiction | Pre-round-3 drafts require a fresh jurisdiction answer | Must |
| R3-RD-1 | Register detail | Full verdict shown on the sign-off page | Must |
| R3-RD-2 | Register detail | Missing verdict stated explicitly; sign-off still permitted | Must |
| R3-RD-3 | Register detail | Verdict shown is the verdict the sign-off attaches to | Must |
| R3-RD-4 | Register detail | Verdict readable without leaving the sign-off page | Should |
| R3-NF-1 | Non-functional | No change to engine output or determinism | Must |
| R3-NF-2 | Non-functional | Rendering the verdict writes no audit events | Must |

## 10. Priority Model

| Priority | Meaning |
|---|---|
| **Must** | Round 3 is not complete without it |
| **Should** | Important; omit only with a recorded deferral |
| **Could** | Desirable if effort allows |
| **Won't** | Explicitly not this round |

---

## Changelog

| Date | Change |
|---|---|
| 2026-07-29 | Round 3 created. R3-JU and R3-RD promoted from exploratory charter 004 (D-002, D-005), with D-003 closed by R3-JU-5. |
| 2026-07-29 | Health report round 3 applied: R3-RD-1 fit criterion made a closed six-item list (HR3-01); R3-JU-5 given a named mechanism (HR3-02); R3-JU-3/JU-6 overlap resolved as distinct (HR3-03); R3-JU-2 reason given a stable carrier (HR3-04); R3-JU-1 given an explicit answered-state (HR3-05); R3-JU-7 added for draft migration (HR3-07); HR3-06 recorded as a deliberate deferral. |
| 2026-07-29 | R3-JU-2 revised and R3-JU-6 added before approval: a Provisional verdict must name its cause, so "no regulatory basis applied" is never presented as "pending firm adoption". Closes the deferred open question. |
