---
schema_version: 1
---

# Exploratory Session — explore-006

## Charter

```yaml
schema_version: 1
session_id: explore-006
mission: A non-technical, governance-naive reader encounters the verdict screen cold — no prior context on 2LoD, invariants, tiers, tracks, or model risk vocabulary. Walk the verdict/sign-off flow (VerdictDisplay.tsx and the register detail page it renders inside) as that persona would, and log every point where the screen assumes knowledge the persona doesn't have, or presents so much at once that the persona would lose the thread. Claude performs the mechanical walkthrough (browser + code reading) and proposes candidate findings; the owner classifies severity, confirms GWT, and confirms reproduction for each one via AskUserQuestion prompts during the session, per Hard Gate 4 (ADR-205) — Claude does not self-assign severity.
timebox_minutes: 30
tour: feature
runner: oza977-max
```

**Target:**

- http://localhost:5173
- src/components/VerdictDisplay.tsx
- src/components/RegisterDetail.tsx

## Session Log

- 00:00 — Session opened. STUBS.md absent from project root; registry empty, every Critical defect this session is non-stub (arms VV-4(d) on next /gvm-test run).
- 00:02 — Switched role to 2LoD, opened Register, selected a Critical-tier case ('[IB] HR — CV screening for analyst hiring') as the highest-stakes screen a naive reader could land on.
- 00:05 — Read the verdict page top-to-bottom exactly as encountered, no prior scroll-ahead, simulating a reader with zero governance/banking vocabulary.
- 00:08 — Filed D-001: raw internal footnote code 'NF-7' leaking into user-facing Sign-off gaps text.
- 00:14 — Filed D-002: bare rule ID 'INV-FAIRNESS-01' appears before any plain-language gloss reaches the reader.
- 00:20 — Filed D-003: 'Why this verdict' section's default-unfolded state (a deliberate R9 decision for 2LoD reviewers) produces the exact information-density complaint that opened this session, for the non-technical persona.
- 00:25 — Practitioner classified all three findings Critical. Session closed early relative to the 30-minute timebox — signal was clear and consistent, no value in padding further.

## Defects

### D-001: they see the raw internal footnote code 'NF-7' rendered directly in the text, wi

**Severity:** Critical
**Tour:** feature
**Given:** A reader viewing a Provisional verdict's Sign-off gaps section, with no prior context on internal spec-ID conventions
**When:** they read the jurisdiction-pack line
**Then:** they see the raw internal footnote code 'NF-7' rendered directly in the text, with zero explanation — reads as a leaked debug/internal reference, not a polished product
**Reproduction:** http://localhost:5173 -> switch role to 2LoD -> Register -> open any Critical-tier use case with an unadopted jurisdiction pack rule (e.g. '[IB] HR — CV screening for analyst hiring') -> read the 'Sign-off gaps' box near the top: 'DORA Article 28(4)(c) — proposed interpretation, pending firm adoption (pack not adopted; NF-7)'
**Stub-path:** 

### D-002: they see a bare rule ID with no plain-language gloss at that point in the page —

**Severity:** Critical
**Tour:** feature
**Given:** A governance-naive reader reaching the 'Before you sign off — check these first' checklist
**When:** they read the first line, 'Decided by INV-FAIRNESS-01 — ...'
**Then:** they see a bare rule ID with no plain-language gloss at that point in the page — they must scroll far down to 'Why this verdict' to learn INV-FAIRNESS-01 means 'AI informing a decision about a person must be tested for disparate outcomes...' — the checklist is meant to be the fast first read but forces jargon before the plain-language version reaches them
**Reproduction:** http://localhost:5173 -> switch role to 2LoD -> Register -> open '[IB] HR — CV screening for analyst hiring' -> read the 'Before you sign off — check these first' box, first line
**Stub-path:** 

### D-003: they hit 6 unfolded invariants at once, each carrying a raw rule ID, a full lega

**Severity:** Critical
**Tour:** feature
**Given:** A governance-naive first-time reader on a Critical-tier verdict page
**When:** they scroll past the checklist into 'Why this verdict', which stays fully unfolded by deliberate R9 design decision (for the expert 2LoD audience)
**Then:** they hit 6 unfolded invariants at once, each carrying a raw rule ID, a full legal citation, and a 'Closed by' control-ID mapping, with no way to collapse the section — this is the exact 'too much going on, confusing' complaint that opened this session
**Reproduction:** http://localhost:5173 -> switch role to 2LoD -> Register -> open '[IB] HR — CV screening for analyst hiring' -> scroll to 'WHY THIS VERDICT' -> observe all 6 invariants (4 High, 2 Medium) rendered simultaneously, unfolded, with IDs/citations/closures all visible
**Stub-path:** 


## Observations

_None recorded._

## Overall Assessment

All three defects were classified Critical by the practitioner. The session confirms the original worry directly: the verdict screen genuinely fails a non-technical, governance-naive reader in three distinct ways — an internal spec-ID literally leaking into rendered text (D-001, a straightforward defect against the project's own three-classes-of-code rule), a structural ordering problem where jargon reaches the reader before its plain-language gloss does (D-002), and a deliberate prior design decision (R9's 'Why this verdict stays open' choice, made for the expert 2LoD audience) that actively works against a first-time reader (D-003). The practitioner's assessment: this needs a design pass grounded specifically in audience hospitality for a non-technical reader — not another general-purpose redesign round, since five prior rounds (R9, R12, R13, R14, R15-C2) have already iterated on this screen without resolving the complaint. D-003 in particular surfaces a real tension: the screen currently serves one audience (expert 2LoD reviewers) well at the direct expense of another (first-time/non-technical readers) — the next design pass needs to either serve both explicitly (e.g. a collapsed-by-default state with an obvious expand) or make a deliberate, disclosed choice about which audience the screen optimizes for.
