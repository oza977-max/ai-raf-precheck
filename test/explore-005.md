---
schema_version: 1
---

# Exploratory Session — explore-005

## Charter

```yaml
schema_version: 1
session_id: explore-005
mission: "Micro-charter opened out of band. During the P8-C02 live smoke a reload on the Duplicates step left the flow hanging on its loading placeholder with no way forward, and the resumed-session banner's escape hatch did not clear it either. The finding is unrelated to P8-C02's changes and has no round-3 requirement, so it is recorded here rather than folded into a build chunk. Scope is deliberately narrow: establish, against the code and not against memory, what a restored draft does to state that was never persisted, and what 'Start over instead' actually dispatches. Every claim below cites the file:line it was verified at, per BC-001."
timebox_minutes: 20
tour: feature
runner: unassigned
```

**Target:**

- http://localhost:5173
- src/components/IntakeFlow.tsx
- src/components/intake-state.ts
- src/components/intake-draft.ts

## Session Log

- Entered from the P8-C02 live smoke, not from a planned tour. Started a new pre-check, typed a description, clicked 'Read & extract ->' to reach step 2 (Duplicates), then reloaded the page. The restored flow rendered 'Checking the existing inventory for similar use cases...' and stayed there.
- Traced the placeholder to its condition. `duplicateCheckDone` is component state initialised false at IntakeFlow.tsx:62 and set true at exactly one site, IntakeFlow.tsx:123 -- the last statement of `handleSubmitDescription`. The render branch at IntakeFlow.tsx:468 shows the placeholder whenever it is false.
- Traced the restore. The reducer is lazily initialised from the persisted draft at IntakeFlow.tsx:44, so a reload re-enters `step: 'duplicate_check'` directly. Nothing on that path calls `handleSubmitDescription`, so the flag stays false. `duplicateMatch` (IntakeFlow.tsx:61) is stranded the same way. Neither is in `IntakeState` (intake-state.ts:8-53), so neither is persisted -- the draft restores the step but not the work the step depends on.
- Confirmed there is no other way out of the step: the 'This is a new use case ->' button exists only inside the resolved arm of that same ternary (IntakeFlow.tsx:496), so it is not rendered while the placeholder is.
- Traced 'Start over instead'. `handleStartOver` (IntakeFlow.tsx:50-54) dispatches `DESCRIPTION_CHANGED`, and the reducer's first guard, intake-state.ts:87, returns the state object unchanged unless the step is already `description_entry`. No action in the union (intake-state.ts:55-82) resets the machine from an arbitrary step. The banner hides because `setShowResumed(false)` at IntakeFlow.tsx:52 is real; the screen does not change because the dispatch is a no-op.
- Checked what the failed reset does leave behind. `clearDraft()` at IntakeFlow.tsx:51 does run, and the persistence effect at IntakeFlow.tsx:205-210 does not re-run because the state identity is unchanged, so the draft stays cleared. A second reload therefore lands on a clean description entry. That is an accidental escape, not a designed one, and nothing on screen suggests it.
- Checked the same handler against the guided form's separate draft. `clearFormDraft` exists at intake-draft.ts:84 and `handleStartOver` never calls it, so a start-over from the form step leaves the previous answers in sessionStorage under `aigate:intake-form-draft`.
- Noted in passing that `submittedDescription` (IntakeFlow.tsx:67) is set only in `handleSubmitDescription` and is read by `detectContradictions` at IntakeFlow.tsx:412. A draft restored at the questionnaire step therefore runs contradiction detection against an empty description. Recorded as O-001, not re-tested here.

## Defects

### D-001: a reload on the Duplicates step hangs the flow on its loading placeholder, with no control rendered to leave it

**Severity:** Critical
**Tour:** feature
**Given:** a user part-way through a new pre-check who has reached step 2 (Duplicates) and reloads the page, or navigates away and back
**When:** the draft is restored and the flow re-enters `step: 'duplicate_check'`
**Then:** the screen reads 'Checking the existing inventory for similar use cases...' indefinitely. The duplicate check is not re-run and cannot be: `duplicateCheckDone` is component state (IntakeFlow.tsx:62) written at exactly one site, the tail of `handleSubmitDescription` (IntakeFlow.tsx:123), which a restored session never calls. The 'This is a new use case ->' button that would advance the flow is rendered only in the resolved arm of the same ternary (IntakeFlow.tsx:496), so no control to leave the step exists on screen. The draft restore was built to persist `IntakeState` (intake-state.ts:8-53), and the result of the duplicate check is not part of it -- the step is restored without the work it depends on.
**Reproduction:** 1. Start a new pre-check and type any description. 2. Click 'Read & extract ->' to reach step 2 (Duplicates). 3. Reload the page. 4. The restored flow shows the loading placeholder and never resolves; no button is offered.
**Stub-path:** 

### D-002: 'Start over instead' does not start the flow over from any step past the first

**Severity:** Important
**Tour:** feature
**Given:** a user looking at the 'Picked up where you left off' banner on any restored step other than description entry
**When:** they click 'Start over instead' -- the only escape offered from D-001
**Then:** the banner disappears and the screen does not change. `handleStartOver` (IntakeFlow.tsx:50-54) dispatches `DESCRIPTION_CHANGED`, which the reducer discards outright for any step but `description_entry` (intake-state.ts:87); the action union carries no reset action at all (intake-state.ts:55-82). The banner hides only because `setShowResumed(false)` (IntakeFlow.tsx:52) is a real state write. The draft is genuinely cleared (IntakeFlow.tsx:51) and is not rewritten, because the persistence effect (IntakeFlow.tsx:205-210) does not re-run on an unchanged state identity -- so a further reload does escape. Nothing tells the user that. Separately, the handler never calls `clearFormDraft` (intake-draft.ts:84), so the guided form's answers survive a start-over under `aigate:intake-form-draft`.
**Reproduction:** 1. Reach any step past description entry and reload, so the resumed banner appears. 2. Click 'Start over instead'. 3. The banner goes; the step does not. 4. Reload again: only now does the flow return to a blank description entry.
**Stub-path:** 


## Observations

### O-001: `submittedDescription` is not persisted either, so a restored questionnaire detects contradictions against an empty string

**Tour:** feature
**Given:** a draft restored at the questionnaire step
**When:** the user submits an answer and `detectContradictions` runs at IntakeFlow.tsx:412
**Then:** its first argument, `submittedDescription` (IntakeFlow.tsx:67), is still the initial empty string, because it too is written only inside `handleSubmitDescription` (IntakeFlow.tsx:99). This is the same class as D-001 -- state the restored step depends on that the draft envelope does not carry -- but it degrades quietly rather than hanging, and it was traced in the code rather than reproduced in the browser this session. Recorded so it is not rediscovered as new.
**Stub-path:** 
### O-002: the register load races the self-assessment seeding, so the duplicate check can report a count it has not finished counting

**Tour:** feature
**Given:** any first render of the app, restored draft or not
**When:** `refreshRegister` (IntakeFlow.tsx) reads `getUseCases('all')` while App's seeding effect (App.tsx:56) is still in flight
**Then:** the duplicate-check screen can report 'checked 0 register entries' although the AIGate self-assessment is about to appear. The seeding is deliberately fire-and-forget and best-effort (App.tsx:50-60, LC-6), and IntakeFlow has no way to know it is pending -- there is no completion signal to await. This is pre-existing and independent of D-001: it is reachable on the normal click path too. Found while fixing D-001, when a test written on the assumption that the register is seeded by first render failed against reality. Not fixed here -- the fix is a seeding-completion signal, which is a wider change than this charter's scope, and stating a count the product has not established is an NF-2 honesty issue worth its own requirement.
**Stub-path:** 
### O-003: TC-R3-JU-5-01 is a load-dependent flake, so the `npm test` x3 ritual is currently unreliable

**Tour:** feature
**Given:** the test suite as it stands at `34efcdb`, P8-C02's own required-field-marker test
**When:** the FULL suite is run repeatedly (`npm test`, not a single file)
**Then:** `TC-R3-JU-5-01: the fields that block progress and the fields marked required are the same set` fails intermittently on a 5000ms timeout. Measured, not inferred: at HEAD with this charter's changes stashed it failed **3 of 6** full-suite runs; the same file run alone passed **6 of 6**; with this charter's fix applied it failed 1 of 6. It is therefore pre-existing, unrelated to D-001/D-002, and load-dependent rather than ordering-dependent -- the test is slow enough that suite-level parallelism pushes it past its timeout. Not fixed here: it belongs to P8-C02 and needs that chunk's author to decide between raising the timeout and making the test cheaper. Recorded because a flake at this rate defeats the standing 'run the full suite 3x before calling anything done' rule -- it will keep producing failures that get attributed to whatever change happens to be in the tree.
**Stub-path:** 


## Overall Assessment

One Critical, one Important, one observation, all of a single shape: the draft restore persists `IntakeState` and nothing else, so any step whose screen depends on component state written by the handler that normally enters it comes back broken. The duplicate-check step is the visible case because its loading placeholder is the default arm of a ternary whose only exit button lives in the other arm -- restoring the step without the flag renders a screen with no way forward at all. The banner's 'Start over instead' is not a mitigation: it dispatches an action the reducer discards from that step, so it hides itself and changes nothing. The reset works only by accident, on a second reload, because the draft was already cleared before the no-op dispatch. The fix is not more persistence -- the duplicate check is a derived result and should be derived on entry to the step, however the step was entered -- plus a real reset action so the escape hatch is one the reducer can honour. O-001 says the same envelope gap has at least one other consumer, and it should be closed with the same reasoning rather than by widening the draft schema field by field.
