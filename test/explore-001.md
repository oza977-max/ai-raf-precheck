---
schema_version: 1
---

# Exploratory Session — explore-001

## Charter

```yaml
schema_version: 1
session_id: explore-001
mission: "Probe AIGate's built behaviour for defects structured tests could not anticipate: interrupted and resumed flows (browser back, refresh mid-intake, second tab, double-click), the correction path, role switching mid-flow and whether 1LoD/2LoD visibility actually holds, policy edits while use cases exist, empty and boundary states, and whether the NF-2/NF-7 honesty claims are genuinely present where they should be. Known-weak areas from the brief are explicitly out of scope."
timebox_minutes: 60
tour: interruption
runner: unassigned
```

**Target:**

- http://localhost:5173
- src/components/IntakeFlow.tsx
- src/components/RegisterView.tsx
- src/components/PolicyEditor.tsx
- src/components/SettingsPanel.tsx

## Session Log

- Cleared all local data and reloaded to reach a genuine first-run state.
- Probe 1 — empty register as 1LoD, then as 2LoD. Role visibility holds correctly.
- Probe 2 — completed intake to the Graph step; noted URL never changes and history.length stays 1.
- Probe 3 — refreshed at the Graph step. Total loss of in-flight work (D-2).
- Probe 4 — navigated to Register mid-intake and back. Same total loss (D-3).
- Probe 5 — drove a full intake and double-clicked 'Confirm and evaluate'. Duplicate graph_confirmed written to the append-only trail, no verdict, no register node, user stranded (D-1).
- Probe 6 — read IndexedDB directly to confirm event counts, distinct event_ids and the absent register node.

## Defects

### D-001: Two graph_confirmed events are written to the append-only audit trail with disti

**Severity:** Critical
**Tour:** interruption
**Given:** A user has completed intake and is on the Confirm step, with a valid graph ready to evaluate.
**When:** They double-click 'Confirm and evaluate' — one ordinary impatient double-click, not a contrived race.
**Then:** Two graph_confirmed events are written to the append-only audit trail with distinct event_ids 1ms apart. No verdict_produced event is written. No register node is created. The user is left back on the Graph step with no error shown. The trail therefore permanently records two graph confirmations for a use case that has no verdict and does not exist in the register, and those events cannot be removed by design.
**Reproduction:** 1. Clear all data (sidebar > Demo data > Clear all data). 2. New pre-check; enter any description; Read & extract; 'This is a new use case'. 3. Fill the guided form (any valid values) and Continue. 4. Answer the questions until 'Confirm and evaluate' appears. 5. Double-click 'Confirm and evaluate'. 6. Inspect IndexedDB 'aigate-audit' > audit_events: two graph_confirmed rows for one use_case_id, no verdict_produced. Register is empty.
**Stub-path:** 

### D-002: Everything is discarded — description, all form answers, the extracted graph and

**Severity:** Important
**Tour:** interruption
**Given:** A user is part-way through intake, having entered a description and all 11 guided-form answers, and is on the Graph review step.
**When:** They refresh the browser, or press the browser Back button.
**Then:** Everything is discarded — description, all form answers, the extracted graph and any node corrections — and the flow returns to step 1. No warning is shown before the loss and no draft is recoverable. The URL never changes across steps (history.length stays at 1 for the whole flow), so Back cannot return to a previous step and behaves the same as a refresh.
**Reproduction:** 1. New pre-check; enter a description; Read & extract; 'This is a new use case'. 2. Fill the guided form and Continue to reach the Graph step. 3. Press F5 (or browser Back). 4. Observe the flow is back at step 1 'Describe' with every field empty. Confirmed via sessionStorage marker that the page did reload rather than re-render.
**Stub-path:** 

### D-003: The entire in-flight submission is discarded with no warning, exactly as in D-2,

**Severity:** Minor
**Tour:** interruption
**Given:** A user is part-way through intake and wants to check something in the register — which the duplicate-check step actively invites them to think about.
**When:** They click 'Register' in the sidebar, then click 'New pre-check' to return.
**Then:** The entire in-flight submission is discarded with no warning, exactly as in D-2, but triggered by ordinary in-app navigation the product itself encourages rather than by a browser action.
**Reproduction:** 1. Begin an intake and type a use-case name into the guided form. 2. Click 'Register' in the sidebar. 3. Click 'New pre-check'. 4. Observe the form is gone and the flow has reset to step 1.
**Stub-path:** 


## Observations

### O-001: The register reads 'No use cases submitted yet', because the self-assessment was

**Tour:** interruption
**Given:** A first-time user opens the app as the default 1LoD role, after the app has self-assessed on first launch.
**When:** They open the Register.
**Then:** The register reads 'No use cases submitted yet', because the self-assessment was submitted by 'system' rather than by the current user. Switching to 2LoD reveals it. This is correct 1LoD/2LoD visibility working as specified — recorded as an observation because a first-time user may reasonably conclude the app did nothing on launch.
**Stub-path:** 


## Overall Assessment

The interruption tour found what the structured suite structurally could not: three defects, all on the primary user path, none of which any of the 253 automated tests could have caught because they all concern what happens BETWEEN steps rather than within them.

D-1 is the serious one. Code review 001 finding C-5 identified this exact defect class — check-then-act on an append-only trail — and it was fixed in the seed function. The user-facing intake path has the same hole, and it is the path every tester will actually use. A single double-click permanently writes two graph confirmations for a use case that has no verdict and does not appear in the register. Because the trail is append-only by design, those orphaned events cannot be cleaned up. For a product whose central claim is a defensible evidence trail, an ordinary double-click corrupting that trail is the most damaging thing found in this session.

D-2 and D-3 are the same underlying cause — no intake state survives a navigation or reload, and no warning precedes the loss. They matter most for the planned back-test: risk practitioners entering real use cases will lose work to an accidental refresh or to clicking Register mid-flow, and will most likely abandon rather than re-enter eleven fields.

What held up well: 1LoD/2LoD visibility is genuinely enforced rather than cosmetic, and no honesty claim was found overstating what the system can prove.

Recommendation: fix D-1 before the back-test regardless of any other sequencing. Testers double-clicking during a back-test would seed precisely the corruption the audit trail exists to prevent.
