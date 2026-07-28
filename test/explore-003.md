---
schema_version: 1
---

# Exploratory Session — explore-003

## Charter

```yaml
schema_version: 1
session_id: explore-003
mission: First-time-user tour. Nobody has ever walked AIGate as a person seeing it for the first time, with no API key and no prior context. Drive the primary journey end to end — landing page, free-text describe box, duplicate check, guided intake form, graph review, confirm, verdict — then load the six demo use cases and read the register and a register detail page the way a 2LoD reviewer would. The question the session answers is not "does it work" (275 tests already say it does) but "can someone who has not built it understand what it is asking, and can they reach the reasoning the product exists to produce". Record every point where the product's own explanation is missing, discarded, or contradicts what it then shows.
timebox_minutes: 60
tour: feature
runner: unassigned
```

**Target:**

- http://localhost:5173
- src/components/IntakeFlow.tsx
- src/components/StructuredForm.tsx
- src/components/Register.tsx
- src/components/RegisterDetail.tsx

## Session Log

- Opened http://localhost:5173 with no API key configured. Landing screen: New pre-check, six-step rail (Describe / Duplicates / Graph / Questions / Confirm / Verdict).
- Typed a plain-language description of a mortgage servicing assistant into the Describe box and clicked 'Read & extract ->'.
- Duplicate check reported 'No similar use case found -- checked 7 register entries' before any demo data had been loaded. Logged as D-008.
- Clicked 'This is a new use case ->'. Guided intake form rendered completely blank -- the typed description was gone. Logged as D-001.
- Read the guided form. Fourteen selects plus two text fields. Field help text is unusually good -- plain language, worked examples, and honest framing ('Be honest about what happens in practice rather than what the process says'). No jurisdiction or region field anywhere. Logged as D-002.
- Filled name, description and nine selects. Continue stayed disabled with no indication of what was missing. Logged as D-003.
- Filled the remaining three selects; Continue enabled. Graph review screen showed 'vendor: internal' though no vendor was chosen. Logged as D-007.
- Proceeded through Questions (auto-satisfied, no questions asked) to Confirm. JURISDICTIONS row read 'None specified'.
- Confirmed and evaluated. Verdict: Approved with controls, High tier, Track II, binding constraint INV-AUTONOMY-01, 13 of 18 invariants triggered, 10 controls, governance margin 38% against a 10% target, eight invariants flagged NO HEADROOM, standing conditions listed. This screen is the product working as designed.
- Clicked 'Load sample use cases', then opened the Register. Five of six samples flagged Stale at policy v1.1 against current v1.3. Logged as D-005.
- Register row for the just-completed pre-check read 'Mortgage servicing assistant -- input'. Logged as D-004.
- Opened '[SAMPLE] Client-facing wealth chatbot' (High tier, Provisional, awaiting 2LoD action). Detail page showed status, notes box, Approve / Request correction and the append-only audit trail -- and no verdict reasoning at all. Logged as D-006.
- Checked the browser console across the whole walk: no errors.

## Defects

### D-001: the guided intake form that follows is completely blank -- neither the name fiel

**Severity:** Critical
**Tour:** feature
**Given:** a first-time user with no Anthropic API key configured, on the New pre-check screen
**When:** they write a plain-language paragraph into the 'Describe your AI use case' box and click 'Read & extract ->'
**Then:** the guided intake form that follows is completely blank -- neither the name field nor the description field carries any of what was typed. The invitation to describe the use case in plain language is decorative without a key, and nothing on the screen says so before the user does the work.
**Reproduction:** 1. Open http://localhost:5173 with no API key saved in Settings. 2. Type any paragraph into 'Describe your AI use case'. 3. Click 'Read & extract ->', then 'This is a new use case ->'. 4. Inspect the guided form: name and description inputs are empty strings.
**Stub-path:** 

### D-002: both screens report 'JURISDICTIONS -- None specified'. The form has no jurisdict

**Severity:** Critical
**Tour:** feature
**Given:** a keyless user completing the guided intake form, which is the only intake path available to them
**When:** they fill every field the form offers and reach the Confirm and Verdict screens
**Then:** both screens report 'JURISDICTIONS -- None specified'. The form has no jurisdiction or region field at all, so graph.jurisdictions is always empty, so resolveActivePacks can never activate a pack. The four authored jurisdiction packs built in V2-A, and the RA-9 regulatory reasoning chain that depends on them, are unreachable through the guided form. The form should ask for region either way -- a user writing free text cannot be expected to know that naming a jurisdiction is what unlocks the citations.
**Reproduction:** 1. Complete the guided form end to end with no API key. 2. On the Confirm screen, read the JURISDICTIONS row: 'None specified'. 3. Evaluate; the verdict's RECORD & PROVENANCE block repeats 'None specified' and no REGULATORY REASONING CHAIN panel renders. 4. Inspect the form's select elements: fourteen selects, none of them jurisdiction.
**Stub-path:** 

### D-003: the 'Continue' button remains disabled with no indication of which fields are st

**Severity:** Important
**Tour:** feature
**Given:** the guided intake form partially completed
**When:** nine of the fourteen fields are set and the user looks for the way forward
**Then:** the 'Continue' button remains disabled with no indication of which fields are still required. No field is marked required, no validation message names the gap, and the button gives no reason. A user can dead-end here with no way to discover what the form still wants.
**Reproduction:** 1. Open the guided form. 2. Fill name, description, data classification, storage zone, model type, autonomy, processing zone, action type, audience, materiality and reversibility -- but leave purpose, replaces-human and scale unset. 3. Observe: button.disabled === true, with no accompanying message.
**Stub-path:** 

### D-004: the row is titled 'Mortgage servicing assistant -- input' -- the name of the inp

**Severity:** Important
**Tour:** feature
**Given:** a completed pre-check submitted under the use case name 'Mortgage servicing assistant'
**When:** the user opens the Register to find the record of their decision
**Then:** the row is titled 'Mortgage servicing assistant -- input' -- the name of the input NODE in the data-flow graph, not the use case name the user supplied. The register is the audit record of decisions; the name on that record is wrong.
**Reproduction:** 1. Complete any pre-check, giving a distinct name at the 'What do you want to call it?' field. 2. Open the Register. 3. The Use Case Name column shows the supplied name with ' -- input' appended.
**Stub-path:** 

### D-005: five of the six samples are immediately flagged 'Stale' -- they are fixtures rec

**Severity:** Critical
**Tour:** feature
**Given:** a first-time user evaluating whether the product is current and maintained
**When:** they click 'Load sample use cases' and open the Register
**Then:** five of the six samples are immediately flagged 'Stale' -- they are fixtures recorded against policy v1.1 while the shipped policy is v1.3. The staleness detection is behaving correctly; the demo fixtures have not been regenerated. The first impression of the product is a register that is mostly out of date.
**Reproduction:** 1. Open the app fresh. 2. Click 'Load sample use cases' in the sidebar. 3. Open the Register: the Policy Version column reads 1.1 for all six samples and the Stale column is flagged on five of them (plus the AIGate self-assessment row at v1.0).
**Stub-path:** 

### D-006: the detail page shows the tier, the track, the status, the Approve and Request-c

**Severity:** Critical
**Tour:** feature
**Given:** a 2LoD reviewer opening a High-tier use case that is awaiting their sign-off
**When:** they open it from the Register in order to decide whether to approve it
**Then:** the detail page shows the tier, the track, the status, the Approve and Request-correction buttons and the append-only audit trail -- but none of the verdict reasoning. No invariants, no minimal control set, no regulatory citations, no governance margin. The reviewer is asked to attest to a decision whose basis is not shown anywhere on the page. The reasoning exists only on the intake flow that produced it, which cannot be returned to.
**Reproduction:** 1. Load the sample use cases. 2. Open the Register and click '[SAMPLE] Client-facing wealth chatbot' (High tier, awaiting 2LoD action). 3. Read the full page: status banner, notes box, Approve / Request correction, audit trail. No invariant list, no control set, no citation panel.
**Stub-path:** 

### D-007: the node displays 'vendor: internal' -- a value the user never chose. The next s

**Severity:** Important
**Tour:** feature
**Given:** the guided form's optional vendor field left blank by the user
**When:** the Review extracted graph screen renders the processing node
**Then:** the node displays 'vendor: internal' -- a value the user never chose. The next screen asks the user to attest that this graph is accurate to the best of their knowledge, so a silently defaulted field is being folded into an attestation.
**Reproduction:** 1. Complete the guided form without selecting anything in 'Whose model or service is it? (optional)'. 2. Click Continue. 3. The PROCESSING node on the graph review screen shows 'vendor: internal'.
**Stub-path:** 

### D-008: the step reports 'No similar use case found -- checked 7 register entries', nami

**Severity:** Important
**Tour:** feature
**Given:** a browser session in which the demo use cases have not been loaded
**When:** the user submits a description and the duplicate-check step runs
**Then:** the step reports 'No similar use case found -- checked 7 register entries', naming a count of entries that had not been loaded at that point in the walk. Either the count is stale/hardcoded or entries are seeded earlier than the sidebar implies. The duplicate check is a gate, so a count that does not match the register undermines what it claims to have checked.
**Reproduction:** 1. Open the app without clicking 'Load sample use cases'. 2. Enter any description and click 'Read & extract ->'. 3. Read the duplicate-check line: it cites 7 register entries. 4. Compare against the Register contents at that moment.
**Stub-path:** 


## Observations

_None recorded._

## Overall Assessment

The product's engine is not the problem. The verdict screen produces exactly what it promises -- tier, track, binding constraint, thirteen triggered invariants with citations, a minimal control set, governance margin, standing conditions -- and 275 tests, a clean type-check and a clean spec-parity run all pass. What this session found is that the reasoning is hard to reach and easy to lose. Two of the four Critical findings are the same defect in different places: the product asks a user to describe their use case and throws the answer away (D-001), and it produces a verdict a reviewer is then asked to sign off on without showing it to them (D-006). A third, D-002, means the regulatory-citation chain built in V2-A cannot be reached at all through the only intake a keyless user has -- the form never asks where the system operates. The fourth, D-005, is that the demo data a newcomer is invited to load is itself two policy versions out of date. None of these are engine defects and none were visible to the test suite, because nothing in the suite walks the product as a person seeing it for the first time. That walk had never been done until now.
