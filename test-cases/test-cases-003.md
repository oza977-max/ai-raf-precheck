# AIGate — Test Cases, Round 3

*Generated 2026-07-29 from `requirements/requirements-003.md` (commit 88ffd40).*

Round 3 covers 13 requirements: R3-JU (7), R3-RD (4), R3-NF (2).
Rounds 1 and 2 test cases live in `test-cases/test-cases.md` and are immutable.

---

## Expert Panel

| Expert | Work | Role in This Document |
|---|---|---|
| Dan North | *Introducing BDD* (2006) | Given/When/Then format; behaviour-focused names |
| Lee Copeland | *A Practitioner's Guide to Software Test Design* (2004) | Technique selection per requirement pattern |
| Boris Beizer | *Software Testing Techniques* (2nd ed., 1990) | Boundary and state-transition thoroughness |
| Cem Kaner | *Lessons Learned in Software Testing* (2001) | Realistic data; the states a real user actually reaches |
| David MacIver | Hypothesis documentation | Property-based framing for the two non-functional requirements |
| Nancy Leveson | *Engineering a Safer World* (2012) | A silent default is an unenforced constraint — drives the negative assertions |

---

## Test Suite Overview

| | Count |
|---|---|
| Total test cases | 38 |
| Must | 31 |
| Should | 7 |
| `[EXAMPLE]`-tagged (EBT-1, one per Must requirement) | 10 |
| `[PROPERTY]`-tagged | 2 |
| `[SECURITY]`-tagged | 1 |

**Techniques applied.** State-transition testing for the jurisdiction
answered-state (three states, not two) and the correction/re-evaluation flow.
Decision-table testing for the two independent causes of Provisional.
Use-case testing for the reviewer's sign-off journey. Set-comparison assertions
for R3-RD-1 and R3-JU-5, both of which are stated as set equality rather than
rendered text. Property framing for the two non-functional requirements.

**Trace status.** This project has no `impact-map.md`, so every test carries
`[Trace: not-yet-traced]` — 38 of 38. Running `/gvm-impact-map` would close
this; it is recorded, not silently omitted.

---

## R3-JU — Jurisdiction Completeness

### TC-R3-JU-1-01: Untouched jurisdiction question blocks progress [EXAMPLE]

```
Input: guided intake form, all other required fields completed, jurisdiction question never interacted with
Given a user completing the guided intake form
And every other required field has been answered
When the user has not interacted with the jurisdiction question at all
Then the output MUST contain: a disabled Continue action
And the output MUST NOT contain: an enabled Continue action
[Requirement: R3-JU-1] [Priority: MUST]
[Trace: not-yet-traced]
```

### TC-R3-JU-1-02: Explicit "none / not sure" unblocks progress

```
Given a user completing the guided intake form
And every other required field has been answered
When the user explicitly selects "none / not sure" for jurisdiction
Then the Continue action is available
[Requirement: R3-JU-1] [Priority: MUST]
[Trace: not-yet-traced]
```

### TC-R3-JU-1-03: One or more jurisdictions selected unblocks progress

```
Given a user completing the guided intake form
And every other required field has been answered
When the user ticks UK and EU
Then the Continue action is available
[Requirement: R3-JU-1] [Priority: MUST]
[Trace: not-yet-traced]
```

### TC-R3-JU-1-04: The three answered-states are distinguishable from persisted state

```
Given three intake drafts — one never interacted with, one answered "none / not sure",
  one with UK ticked
When each draft's persisted state is read
Then the three are distinguishable from one another
And "not answered" is not inferred from the selected set being empty
[Requirement: R3-JU-1] [Priority: MUST]
```
> Beizer state-transition. This is the test that would have failed before the
> requirement was amended: with `jurisdictions: string[]` alone, drafts one and
> two are byte-identical. The distinction is the requirement.
```
[Trace: not-yet-traced]
```

### TC-R3-JU-1-05: Deselecting the last jurisdiction returns to answered, not unanswered

```
Given a user who has ticked UK
When the user unticks UK, leaving nothing selected
Then the jurisdiction question remains in an answered state
And the Continue action remains available
[Requirement: R3-JU-1] [Priority: SHOULD]
```
> Boundary case. Deselecting to empty must not be indistinguishable from never
> having answered — otherwise the user is silently returned to the blocked state
> with no explanation.
```
[Trace: not-yet-traced]
```

### TC-R3-JU-2-01: "None / not sure" produces a Provisional verdict carrying its reason [EXAMPLE]

```
Input: use case submitted with jurisdiction answered "none / not sure", data class Client PII, model type llm, autonomy L2, output execute, exposure client-facing, bindingness material, reversibility irreversible
Given a use case whose jurisdiction answer is "none / not sure"
When the engine evaluates it
Then the output MUST contain: a verdict status of Provisional
And the output MUST contain: a machine-readable reason identifying the no-regulatory-basis condition
And the output MUST NOT contain: an empty or absent provisional-reason value
[Requirement: R3-JU-2] [Priority: MUST]
[Trace: not-yet-traced]
```

### TC-R3-JU-2-02: A jurisdiction answer does not make a verdict Provisional by itself

```
Given a use case with UK ticked
And no unsigned pack rule fires for it
When the engine evaluates it
Then the verdict is not Provisional
[Requirement: R3-JU-2] [Priority: MUST]
[Trace: not-yet-traced]
```

### TC-R3-JU-2-03: The register row shows Provisional for a no-jurisdiction submission

```
Given a use case submitted with jurisdiction answered "none / not sure"
When the register is opened
Then that use case's row shows Provisional
[Requirement: R3-JU-2] [Priority: MUST]
[Trace: not-yet-traced]
```

### TC-R3-JU-3-01: Verdict states in words that no regulatory basis was applied [EXAMPLE]

```
Input: use case submitted with jurisdiction answered "none / not sure"
Given a verdict produced with no active jurisdiction packs
When the verdict is rendered
Then the output MUST contain: an explicit statement that no regulatory basis was applied
And the output MUST NOT contain: a silently omitted regulatory reasoning chain with no accompanying explanation
[Requirement: R3-JU-3] [Priority: MUST]
```
> Leveson. Absence communicated by absence is the defect; the assertion is on
> presence of the explanation, not on absence of the panel.
```
[Trace: not-yet-traced]
```

### TC-R3-JU-3-02: The statement is asserted separately from the labelled reason

```
Given a verdict produced with no active jurisdiction packs
When the verdict is rendered
Then the prose statement required by R3-JU-3 is present
And the labelled reason required by R3-JU-6 is present
And neither satisfies the assertion for the other
[Requirement: R3-JU-3] [Priority: MUST]
```
> Closes health-report issue HR3-03. An implementation providing only one of the
> two must fail exactly one of these assertions, not both and not neither.
```
[Trace: not-yet-traced]
```

### TC-R3-JU-3-03: A verdict with active packs carries no no-basis statement

```
Given a use case with EU ticked, activating the EU AI Act pack
When the verdict is rendered
Then no statement claiming that no regulatory basis was applied is present
[Requirement: R3-JU-3] [Priority: SHOULD]
[Trace: not-yet-traced]
```

### TC-R3-JU-4-01: The jurisdiction question states what the answer controls

```
Given the guided intake form
When the jurisdiction question is read, including its help text
Then the text states that the answer determines which regulatory rules are applied
[Requirement: R3-JU-4] [Priority: SHOULD]
[Trace: not-yet-traced]
```

### TC-R3-JU-5-01: Every progress-blocking field carries both required signals

```
Given the guided intake form
When the set of fields whose absence disables the Continue action is enumerated
And the set of fields carrying a visible required-marker and aria-required="true" is enumerated
Then the two sets are identical
And neither set has a member outside the other
[Requirement: R3-JU-5] [Priority: SHOULD]
```
> Set equality in both directions. A one-directional assertion would pass an
> implementation that marks every field, including optional ones — which is as
> unhelpful to the user as marking none.
```
[Trace: not-yet-traced]
```

### TC-R3-JU-5-02: Optional fields carry no required-marker

```
Given the guided intake form
When the optional platform and vendor fields are inspected
Then neither carries a required-marker
And neither carries aria-required="true"
[Requirement: R3-JU-5] [Priority: SHOULD]
[Trace: not-yet-traced]
```

### TC-R3-JU-6-01: A Provisional verdict names its cause [EXAMPLE]

```
Input: use case submitted with jurisdiction answered "none / not sure", producing a Provisional verdict
Given a verdict marked Provisional because no jurisdiction was supplied
When the verdict is rendered
Then the output MUST contain: a stated reason identifying the no-regulatory-basis condition
And the output MUST NOT contain: an unexplained Provisional label with no cause given
[Requirement: R3-JU-6] [Priority: MUST]
[Trace: not-yet-traced]
```

### TC-R3-JU-6-02: Unsigned pack rules give a different stated cause

```
Given a use case with UK ticked
And the SS1/23 pack carries a [FIRM] placeholder in its reviewer field, so its rules are unsigned
And one of its rules fires
When the verdict is rendered
Then the stated cause identifies the unsigned-pack-rules condition
And it does not identify the no-regulatory-basis condition
[Requirement: R3-JU-6] [Priority: MUST]
```
> Copeland decision table, condition pair one of four. This is the assertion
> that stops the two causes collapsing into one indistinguishable badge.
```
[Trace: not-yet-traced]
```

### TC-R3-JU-6-03: Both causes present are both stated

```
Given a use case answered "none / not sure" for jurisdiction
And a firing unsigned rule from a pack that is active for another reason
When the verdict is rendered
Then both causes are stated
[Requirement: R3-JU-6] [Priority: MUST]
```
> Decision table, condition pair four of four. If this combination is
> unreachable in the current policy, the test is marked unreachable with a
> recorded rationale rather than deleted — the requirement says "where more
> than one applies, all shall be stated".

**UNREACHABLE — recorded 2026-07-29 by P8-C04, confirmed by P8-C05.** Not a
property of this policy but of the triggers themselves.
`no_regulatory_basis` is raised when no jurisdiction pack activated;
`unsigned_pack_rules` is raised when a fired pack *rule* is unsigned. A rule
cannot fire from a pack that never activated, so the two are mutually exclusive
by construction and no verdict can carry both.

This contradicts `evaluation-engine.md` ADR-EE-R3-1, which states the two
conditions "can co-occur and both are then listed". The ADR is wrong on its own
terms; the code follows the triggers. `src/engine/provisional.test.ts` asserts
the exclusivity, and the fixed emission order is asserted directly on
`PROVISIONAL_REASONS` so the ordering contract still binds if a future trigger
makes the pair reachable. The collection stays ordered and plural for that
reason.
```
[Trace: not-yet-traced]
```

### TC-R3-JU-6-04: A non-Provisional verdict states no cause

```
Given a use case with UK ticked and no unsigned rule firing
When the verdict is rendered
Then no provisional cause is stated
[Requirement: R3-JU-6] [Priority: SHOULD]
```
> Decision table, condition pair one of four — neither condition present.
```
[Trace: not-yet-traced]
```

### TC-R3-JU-7-01: A pre-round-3 draft loads as unanswered [EXAMPLE]

```
Input: a persisted intake draft in the pre-round-3 shape, carrying a jurisdictions array but no answered-state
Given a saved intake draft created before this round
When the draft is loaded into the guided form
Then the output MUST contain: an unanswered jurisdiction question and a disabled Continue action
And the output MUST NOT contain: an enabled Continue action derived from the draft's existing jurisdiction data
[Requirement: R3-JU-7] [Priority: MUST]
[Trace: not-yet-traced]
```

### TC-R3-JU-7-02: A pre-round-3 draft with jurisdictions still requires a fresh answer

```
Given a saved draft created before this round with UK already in its jurisdictions array
When the draft is loaded
Then the jurisdiction question is unanswered
And the user must answer it before proceeding
[Requirement: R3-JU-7] [Priority: MUST]
```
> Kaner realistic data. The dangerous case is not the empty legacy draft — it is
> the populated one, which looks answered and is not.
```
[Trace: not-yet-traced]
```

---

## R3-RD — Register Detail Verdict Visibility

### TC-R3-RD-1-01: Sign-off page shows all six decision-bearing elements [EXAMPLE]

```
Input: register entry [SAMPLE] Client-facing wealth chatbot, High tier, Track II, with a persisted verdict
Given a use case with a persisted verdict
When a 2LoD reviewer opens it from the register
Then the output MUST contain: the verdict status and tier, the binding constraint id, every triggered invariant id with its citation, every control id in the minimal set with its evidence status, the governance margin figure with any no-headroom ids, and the standing conditions
And the output MUST NOT contain: a sign-off action presented without any of those six elements
[Requirement: R3-RD-1] [Priority: MUST]
[Trace: not-yet-traced]
```

### TC-R3-RD-1-02: Invariant and control ids match the intake verdict as sets

```
Given a use case whose intake verdict listed 13 triggered invariants and 10 controls
When the same use case is opened from the register
Then the page lists the same 13 invariant ids
And the same 10 control ids
And the comparison is made on id sets, not on rendered text
[Requirement: R3-RD-1] [Priority: MUST]
```
> The set framing is deliberate: ordering and surrounding prose may differ
> between the two views without failing, and content outside the six-element
> list is not asserted at all.
```
[Trace: not-yet-traced]
```

### TC-R3-RD-1-03: Each control shows its evidence status

```
Given a verdict whose minimal control set contains CTRL-ENC-01 (VERIFIED) and CTRL-REDTEAM-01 (UNVERIFIED)
When the use case is opened from the register
Then CTRL-ENC-01 is shown as VERIFIED
And CTRL-REDTEAM-01 is shown as UNVERIFIED
[Requirement: R3-RD-1] [Priority: MUST]
```
> An unverified control rendered without its status would let a reviewer sign
> off believing evidence exists. Honesty is a functional requirement here.
```
[Trace: not-yet-traced]
```

### TC-R3-RD-2-01: Entry with no recorded verdict says so and still permits sign-off [EXAMPLE]

```
Input: a register entry with no verdict_produced audit event
Given a register entry for which no verdict was ever recorded
When a reviewer opens it
Then the output MUST contain: an explicit statement that no verdict is recorded, and available sign-off actions
And the output MUST NOT contain: an empty verdict panel presented as though it were the verdict
[Requirement: R3-RD-2] [Priority: MUST]
[Trace: not-yet-traced]
```

### TC-R3-RD-2-02: The AIGate self-assessment entry renders without error

```
Given the seeded AIGate self-assessment register entry
When it is opened from the register
Then the page renders without error
And it either shows a verdict or states that none is recorded
[Requirement: R3-RD-2] [Priority: MUST]
```
> Kaner. This is the real legacy row on every install, not a hypothetical one.
```
[Trace: not-yet-traced]
```

### TC-R3-RD-3-01: After correction and re-evaluation the latest verdict is shown [EXAMPLE]

```
Input: a use case evaluated once, corrected, then re-evaluated to a different binding constraint
Given a use case that has been corrected and re-evaluated
When a reviewer opens it from the register
Then the output MUST contain: the binding constraint id from the latest verdict
And the output MUST NOT contain: the binding constraint id from the superseded verdict presented as current
[Requirement: R3-RD-3] [Priority: MUST]
[Trace: not-yet-traced]
```

### TC-R3-RD-3-02: The sign-off audit event names the verdict displayed [EXAMPLE]

```
Input: a use case with a persisted verdict; reviewer clicks Approve
Given a reviewer viewing a use case's latest verdict
When the reviewer approves it
Then the output MUST contain: a twoloD_reviewed event whose verdict_id equals the id of the verdict the page rendered
And the output MUST NOT contain: a twoloD_reviewed event with no verdict reference
[Requirement: R3-RD-3] [Priority: MUST]
```
> Added by design review round 1 (C-1). The payload previously had no field
> capable of carrying this, so the original wording could only have been
> satisfied vacuously.
```
[Trace: not-yet-traced]
```

### TC-R3-RD-3-03: A verdict changing under the reviewer refuses the write

```
Given a reviewer viewing a verdict
And a correction is recorded after the page loaded but before Approve is clicked
When the reviewer approves
Then the write is refused and the reviewer is told the verdict changed
And no attestation is recorded against the verdict they did not see
[Requirement: R3-RD-3] [Priority: MUST]
[Trace: not-yet-traced]
```

### TC-R3-RD-6-01: A Provisional verdict states its cause on the sign-off page

```
Given a use case whose verdict is Provisional for the no-regulatory-basis condition
When a reviewer opens it from the register
Then the stated cause is present on that page
And a Provisional badge with no cause is not shown
[Requirement: R3-JU-6, R3-RD-1] [Priority: MUST]
```
> Added by design review round 1 (I-2). R3-JU-6 is not scoped to one screen;
> the sign-off page became a rendering surface and was not traced.
```
[Trace: not-yet-traced]
```

### TC-R3-RD-7-01: Control evidence status reflects current policy, verdict does not

```
Given a use case evaluated when CTRL-ENC-01 was VERIFIED
And the policy has since been edited so CTRL-ENC-01 has no evidence
When a reviewer opens the use case from the register
Then the verdict's invariants and binding constraint are unchanged from evaluation time
And CTRL-ENC-01 shows as UNVERIFIED, reflecting current policy
[Requirement: R3-RD-1] [Priority: MUST]
```
> Added by design review round 1 (C-2). The historical/current split is the
> reconciliation; this test pins it so the two halves cannot silently swap.
```
[Trace: not-yet-traced]
```

### TC-R3-RD-8-01: The reclassification affordance does not appear on the sign-off page

```
Given a use case with a persisted verdict opened from the register
When the page renders the verdict
Then no "Correct this classification?" control is present
And no reasoning-trace disclosure is present
[Requirement: R3-RD-1] [Priority: MUST]
```
> Added by design review round 1 (I-1). onCorrect was required and its button
> ungated, so the exclusion was unbuildable by reuse alone.
```
[Trace: not-yet-traced]
```

### TC-R3-RD-2-03: A verdict without explanation states so rather than showing an empty list

```
Given a register entry whose persisted verdict predates explanation capture
When a reviewer opens it
Then the page states the verdict predates explanation capture
And it does not render an empty invariant list
[Requirement: R3-RD-2] [Priority: MUST]
```
> Added by design review round 1 (I-10). An empty list reads as "nothing was
> triggered" — a stronger and false claim.
```
[Trace: not-yet-traced]
```

### TC-R3-RD-4-01: The verdict is readable without leaving the sign-off page

```
Given a use case with a persisted verdict open in the register detail
When the reviewer reads each of the six decision-bearing elements
Then no navigation away from the page is required
[Requirement: R3-RD-4] [Priority: SHOULD]
[Trace: not-yet-traced]
```

### TC-R3-RD-5-01: Verdict content is rendered as text, not interpreted as markup [SECURITY]

```
Given a policy whose control evidence string contains markup characters
When the verdict is rendered on the register detail page
Then the characters appear as literal text
And no markup is interpreted
[Requirement: R3-RD-1] [Priority: MUST]
```
> OWASP. R3-RD-1 renders policy-authored strings — evidence text, citations —
> onto a new surface. Pack content is human-authored and partly external in
> origin, so it is untrusted input to this view.
```
[Trace: not-yet-traced]
```

---

## R3-NF — Non-Functional

### TC-R3-NF-1-01: Engine output is unchanged by round 3 [PROPERTY]

```
Given any data-flow graph and policy
When evaluate() is called ten times with identical inputs
Then every serialized result is byte-identical
And the existing determinism test passes without modification
[Requirement: R3-NF-1] [Priority: MUST]
```
> Property: determinism. For all inputs i, evaluate(i) == evaluate(i).
> The property-detection heuristic returned no match for this requirement; the
> [PROPERTY] tag is applied on reviewer judgement and the mismatch is recorded
> in the Test Summary rather than resolved silently.
```
[Trace: not-yet-traced]
```

### TC-R3-NF-1-02: The engine island holds

```
Given the round 3 implementation is complete
When src/engine/* is inspected for imports
Then it imports only engine types and stdlib
And no React, storage, Date.now() or Math.random() appears in its call graph
[Requirement: R3-NF-1] [Priority: MUST]
[Trace: not-yet-traced]
```

### TC-R3-NF-2-01: Rendering the verdict writes no audit events [PROPERTY]

```
Given a register entry with N audit events
When the register detail page is opened and the verdict rendered
And the page is opened again
Then the entry still has exactly N audit events
[Requirement: R3-NF-2] [Priority: MUST]
```
> Property: idempotence of a read. Opening a page any number of times leaves the
> trail unchanged.
>
> Corrected after design review round 1 (I-5): the original rationale had this
> backwards. StrictMode double-invokes the mount effect within a *single* open,
> so one open is already the more sensitive check for a double-firing effect.
> The second open tests a different property — that a fresh mount after
> navigating away and back does not re-write — which is the shape of the earlier
> seeding race. Both are asserted because they are two properties, not one
> property tested harder.
```
[Trace: not-yet-traced]
```

### TC-R3-NF-2-02: Sign-off writes exactly one event under double submission

```
Given a reviewer viewing a use case awaiting sign-off
When the Approve action is triggered twice in rapid succession
Then exactly one approval event is appended
[Requirement: R3-NF-2] [Priority: MUST]
```
> The audit trail is append-only evidence, so a duplicate cannot be cleaned up
> afterwards. Rendering the verdict adds content to this page but must not add a
> second write path.
```
[Trace: not-yet-traced]
```

---

## Traceability Matrix

| Requirement | Priority | Test Cases | Covered |
|---|---|---|---|
| R3-JU-1 | Must | TC-R3-JU-1-01, -02, -03, -04, -05 | Yes |
| R3-JU-2 | Must | TC-R3-JU-2-01, -02, -03 | Yes |
| R3-JU-3 | Must | TC-R3-JU-3-01, -02, -03 | Yes |
| R3-JU-4 | Should | TC-R3-JU-4-01 | Yes |
| R3-JU-5 | Should | TC-R3-JU-5-01, -02 | Yes |
| R3-JU-6 | Must | TC-R3-JU-6-01, -02, -03, -04 | Yes |
| R3-JU-7 | Must | TC-R3-JU-7-01, -02 | Yes |
| R3-RD-1 | Must | TC-R3-RD-1-01, -02, -03, TC-R3-RD-5-01 | Yes |
| R3-RD-2 | Must | TC-R3-RD-2-01, -02 | Yes |
| R3-RD-3 | Must | TC-R3-RD-3-01, -02 | Yes |
| R3-RD-4 | Should | TC-R3-RD-4-01 | Yes |
| R3-NF-1 | Must | TC-R3-NF-1-01, -02 | Yes |
| R3-NF-2 | Must | TC-R3-NF-2-01, -02 | Yes |

**Coverage: 13 of 13 requirements (100%). No orphan tests — every test names a
round 3 requirement.**

---

## Test Summary

| Priority | Requirements | Test cases |
|---|---|---|
| Must | 10 | 31 |
| Should | 3 | 7 |
| **Total** | **13** | **38** |

### EBT-1 example-based coverage

Every Must requirement carries at least one `[EXAMPLE]` test in the three-element
shape (`Input:`, `MUST contain:`, `MUST NOT contain:`): R3-JU-1, R3-JU-2,
R3-JU-3, R3-JU-6, R3-JU-7, R3-RD-1, R3-RD-2, R3-RD-3 plus the two
non-functional requirements covered by property tests.

### Recorded gaps and judgement calls

- **Trace integrity.** All 38 tests carry `[Trace: not-yet-traced]`. This
  project has no `impact-map.md`, so the trace chain cannot resolve. Running
  `/gvm-impact-map` would close it. Recorded, not omitted.
- **Property detection disagreement.** The `_property_detection` heuristic
  returned an empty match for all 13 requirements, including R3-NF-1
  (determinism) and R3-NF-2 (no side effect on read). Both are properties in
  MacIver's sense — one is a same-input-same-output law, the other an
  idempotence law. The `[PROPERTY]` tag was applied on judgement against the
  heuristic's result. Either the heuristic under-matches non-functional
  requirements phrased as constraints, or the tag is being over-applied here;
  worth a look before the next round rather than assuming the tool is right.
- **TC-R3-JU-6-03** may be unreachable under the current policy, since it needs
  a use case that both answers "none / not sure" and has a firing unsigned rule.
  If unreachable it is marked so with a rationale, not deleted — the requirement
  covers the case regardless of whether today's policy can produce it.
- **HR3-08 carried forward.** R3-RD-1 puts the verdict status — commonly
  "Approved with controls" — onto the register detail page for the first time.
  Existing single-match `/approved|rejected/i` queries must be tightened before
  this lands. That is a tech-spec and build concern, recorded here so it is not
  discovered by a red suite.

---

## Changelog

| Date | Change |
|---|---|
| 2026-07-29 | Round 3 test cases generated from requirements-003.md. |
| 2026-07-29 | Design review round 1 applied. TC-R3-RD-3-02 rewritten to assert `verdict_id` on the sign-off event (C-1 — the payload previously had no field to carry it, so the original could only pass vacuously). Added TC-R3-RD-3-03 (verdict changed under the reviewer), TC-R3-RD-6-01 (Provisional cause on the sign-off page, I-2), TC-R3-RD-7-01 (historical verdict vs current evidence status, C-2), TC-R3-RD-8-01 (reclassification affordance absent, I-1), TC-R3-RD-2-03 (verdict without explanation, I-10). TC-R3-NF-2-01's StrictMode rationale corrected (I-5). 33 cases became 38. |
