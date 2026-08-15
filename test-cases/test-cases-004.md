# AIGate — Test Cases, Round 4

*Written 2026-08-15 alongside the build itself (v0.4.0) from
`requirements/requirements-004.md`.*

Round 4 covers 8 requirements: R4-RC (6), R4-NF (2). Unlike rounds 1–3, the
tests were written with the feature in the same session, so every case below
already exists in the suite and carries its id in the test title —
traceability was 100% at the moment of writing.

Test files: `src/components/__tests__/RegisterDetail.dissent.test.tsx` (the
filing flow) and `src/components/__tests__/RuleImprovementQueue.test.tsx`
(the queue). 17 executable tests cover the 15 cases (TC-R4-RC-4-01 runs as
three variants).

---

## Test Suite Overview

| | Count |
|---|---|
| Total test cases | 15 |
| Must | 12 |
| Should | 3 |
| `[SECURITY]`-tagged | 1 |

**Techniques applied.** Use-case testing for the filing journey. Negative-space
testing for R4-RC-4 (each omission refused independently) and R4-RC-6 (each
gate absent independently) — Leveson's rule that a silent default is an
unenforced constraint drives both. Set-derivation assertion for R4-RC-3-01
(picker options equal the verdict's own rule set). Event-count assertions for
the advisory-by-construction property, which is a claim about what did NOT
happen and must be asserted as such.

---

## R4-RC — Rule Challenges

### TC-R4-RC-1-01: A complete challenge is recorded with all four fields [EXAMPLE]

```
Input: 2LoD on a sign-off page whose rendered verdict has id v-seen; rule INV-DATA-01 picked; reasoning and name typed
Given a 2LoD reviewer reading a use case with a recorded verdict
When they file a challenge naming a rule, their reasoning and their name
Then the trail MUST contain one rule_dissent_filed event
And its payload MUST carry rule_id, dissent, filed_by_name
And its verdict_id MUST equal the id of the verdict the page rendered — threaded, not re-derived
[Requirement: R4-RC-1] [Priority: MUST]
[Trace: src/components/__tests__/RegisterDetail.dissent.test.tsx]
```

### TC-R4-RC-2-01: Filing is advisory by construction — one event, nothing else moves

```
Input: a complete challenge filed on a pre_checked use case
Given the audit trail held N events before filing
When the challenge is filed
Then the trail MUST hold exactly N+1 events
And MUST NOT contain a new lifecycle_stage_changed or twoloD_reviewed event
And the page MUST state that the verdict is unchanged
[Requirement: R4-RC-2] [Priority: MUST]
[Trace: src/components/__tests__/RegisterDetail.dissent.test.tsx]
```

### TC-R4-RC-3-01: The picker offers the rules this verdict relied on

```
Input: a verdict whose explanation names a tier rule and a tripped invariant
Given the challenge form is open
Then the rule picker MUST offer the explanation's rule ids
And MUST offer an explicit "not listed" option
[Requirement: R4-RC-3] [Priority: MUST]
[Trace: src/components/__tests__/RegisterDetail.dissent.test.tsx]
```

### TC-R4-RC-3-02: A free-typed rule reference stays a reference

```
Input: "A rule not listed here" chosen; "  INV-MISSING-9  " typed
When the challenge is filed
Then the payload's rule_id MUST be the trimmed typed value
And MUST NOT carry a rule_label — no match against the rulebook was made
[Requirement: R4-RC-3] [Priority: MUST]
[Trace: src/components/__tests__/RegisterDetail.dissent.test.tsx]
```

### TC-R4-RC-4-01: An incomplete challenge is refused, not recorded (three variants)

```
Input: a challenge missing (a) the rule, (b) the reasoning, (c) the name — one per variant
When the reviewer attempts to file
Then each variant MUST show its own plain-English refusal
And the trail MUST contain zero rule_dissent_filed events
[Requirement: R4-RC-4] [Priority: MUST]
[Trace: src/components/__tests__/RegisterDetail.dissent.test.tsx]
```

### TC-R4-RC-5-01: The empty queue says so, and where a challenge is filed from

```
Given no challenges exist
Then the queue MUST state that none have been filed
And MUST name the sign-off page as where one is filed from
[Requirement: R4-RC-5] [Priority: MUST]
[Trace: src/components/__tests__/RuleImprovementQueue.test.tsx]
```

### TC-R4-RC-5-02: Challenges group by rule, newest first, with attribution

```
Input: three challenges — two against INV-DATA-01 (different cases, different dates), one against TIER-PII-01
Then the queue MUST show two groups sorted by rule id
And within a group entries MUST be newest-first
And each entry MUST name the challenger (marked name-not-verified) and the use case by label
[Requirement: R4-RC-5] [Priority: MUST]
[Trace: src/components/__tests__/RuleImprovementQueue.test.tsx]
```

### TC-R4-RC-5-03: The queue states its advisory posture on the page

```
Then the queue MUST state that a dissent never changes a verdict
And that nothing in the queue feeds back into the engine
[Requirement: R4-RC-5] [Priority: MUST]
[Trace: src/components/__tests__/RuleImprovementQueue.test.tsx]
```

### TC-R4-RC-5-04: No static queue copy matches /approved|rejected/i

```
Input: a seeded challenge with ordinary text
Then the rendered screen's own copy MUST NOT match /approved|rejected/i
(the verdict screen's single-match guard; challenge TEXT is user-authored and out of scope)
[Requirement: R4-RC-5 constraint] [Priority: MUST]
[Trace: src/components/__tests__/RuleImprovementQueue.test.tsx]
```

### TC-R4-RC-5-05: Hostile challenge text renders as text, never markup [SECURITY]

```
Input: a challenge whose text contains <img src=x onerror="alert(1)">
Then the characters MUST appear as literal text
And the document MUST contain no img element
[Requirement: R4-RC-5 constraint] [Priority: MUST]
[Trace: src/components/__tests__/RuleImprovementQueue.test.tsx]
```

### TC-R4-RC-6-01: Offered to 2LoD after the case advanced past sign-off [SHOULD]

```
Input: a use case at lifecycle stage approved, with a verdict
Then the 2LoD view MUST still offer "Challenge a rule"
[Requirement: R4-RC-6] [Priority: SHOULD]
[Trace: src/components/__tests__/RegisterDetail.dissent.test.tsx]
```

### TC-R4-RC-6-02: Not offered to 1LoD [SHOULD]

```
Given the same page rendered for the 1LoD role
Then the challenge affordance MUST NOT be present
[Requirement: R4-RC-6] [Priority: SHOULD]
[Trace: src/components/__tests__/RegisterDetail.dissent.test.tsx]
```

### TC-R4-RC-6-03: Not offered where no verdict exists [SHOULD]

```
Given a use case with no verdict_produced event
Then the challenge affordance MUST NOT be present — no rule was applied, so there is nothing to challenge
[Requirement: R4-RC-6] [Priority: SHOULD]
[Trace: src/components/__tests__/RegisterDetail.dissent.test.tsx]
```

## R4-NF — Non-Functional

### TC-R4-NF-2-01: Rendering the queue writes nothing

```
Given a queue with one challenge
When the screen is opened twice (StrictMode double-mount included)
Then the audit trail MUST be unchanged
[Requirement: R4-NF-2] [Priority: MUST]
[Trace: src/components/__tests__/RuleImprovementQueue.test.tsx]
```

### TC-R4-NF-2-02: A double-click files one challenge, not two

```
Input: two clicks on "File the challenge" within one tick
Then the trail MUST contain exactly one rule_dissent_filed event
[Requirement: R4-NF-2] [Priority: MUST]
[Trace: src/components/__tests__/RegisterDetail.dissent.test.tsx]
```

*R4-NF-1 (determinism unchanged) is proven by the pre-existing TC-PE-1-01,
which asserts byte-identical `evaluate()` output over 10 runs and covers any
new field automatically — no round-4 test is needed or written for it.*
