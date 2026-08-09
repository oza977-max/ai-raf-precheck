# v0.1.2 — 9 August 2026

Developer-facing notes; the user-facing version is `RELEASE-NOTES.html`, and
the full history is `CHANGELOG.md`.

**0.1.2 closes every item that was open at 0.1.0.** The four Known Issues
below that carried a fix are struck through with what closed them; the rest
are unchanged boundaries.

**Version reasoning.** Pre-1.0 by intent. The repository calls this build
"V1" throughout, but that names the *feature scope*, not the release
maturity. A build with no authentication, browser-held storage and a
Demo-ready verification verdict is not a 1.0. Tagging it as one would be the
same overclaim the product refuses everywhere else.

---

## What's New

The capability set below shipped at 0.1.0 and is unchanged; 0.1.2's own
changes are under Improvements and Fixes. Grouped by requirement domain; 56
requirements are in V1 scope and 56 are now implemented end to end (PE-6 and
RA-2 moved from PARTIAL to IMPLEMENTED when their criteria were corrected to
the model the engine actually implements).

**Intake (UC)**
- `UC-1` Free-text description accepted, and shown back to the submitter on
  the graph screen rather than discarded.
- `UC-2` Duplicate detection before intake, with both outcomes built —
  adopt the existing classification, or record the case as genuinely new.
  Both write to the audit trail; the dismissal is double-click guarded.
- `UC-3` LLM extraction of a data-flow graph, when an API key is present.
- `UC-3a` Structured-form fallback when it is not. Field values are
  constrained to the policy's own vocabulary, and the form asks business
  questions rather than engine field names.
- `UC-4` Risk-proportionate question generation — count and content driven
  by detected risk signals, not a fixed list.
- `UC-5` Contradiction detection across answers.
- `UC-6` Graph confirmation as a timestamped attestation.
- `UC-7` Correction recording with before/after values.

**Engine (PE, CS)**
- `PE-1` Deterministic evaluation. `NF-1` asserts byte-identical results
  over ten runs by comparing the whole serialised verdict, so any new field
  is covered automatically.
- `PE-2`/`PE-3` Track and tier assignment. Tier takes the MAXIMUM matching
  tier rather than the first match (`tier.ts:30`) — an earlier draft of these
  notes said "short-circuits at the first matching rule", which is wrong. The
  sort before iteration exists to make the TIE-BREAK deterministic when two
  rules yield the same tier.
- `PE-4` Hard lines evaluated before control solving — no controls are
  proposed for a hard-line violation.
- `PE-5`/`PE-6` Jurisdictional overrides and tier floors.
- `CS-1` Minimal control set by greedy set-cover, with a governance margin
  and the invariants resting on a single control named.
- `CS-3` Downstream reviews triggered by use-case characteristics, including
  the firm's own required reviews.

**Regulatory grounding (RA)**
- `RA-1` Jurisdiction packs activate by declared jurisdiction.
- `RA-7` A pack rule without a source citation is rejected on load.
- `RA-9` Full reasoning chain on the verdict: verbatim source text, what was
  derived, and whether the derivation states or infers.
- Four authored packs: SS1/23, SR 26-2, EU AI Act, DORA.

**Verdict and register (VD, RG, LC, PV)**
- `VD-4` Append-only audit trail with no edit or delete path.
- `VD-5` Policy and pack versions recorded on every verdict.
- `VD-7` Standing conditions recorded as the verdict's expiry conditions.
- `RG-1` Graph-based register — shared components appear once.
- `LC-1` Lifecycle stages with tier-based routing; Low self-serves.
- `LC-6` AIGate submits itself through its own gate on first launch.
- `PV-1`–`PV-8` Platform and vendor envelope inheritance, withdrawn per
  dimension when the envelope is exceeded.

**Configuration (CF)**
- Policy editable as YAML in-app, validated before save, with re-evaluation
  queued for affected use cases and the version incremented.

## Improvements

**0.1.2**

- Responsive layout. The app had no media queries at all; below ~700px the
  fixed sidebar and main column overflowed the viewport. Now stacks to one
  column, with the register table and the data-flow graph scrolling inside
  their own boxes rather than dragging the page sideways.
- Fonts self-hosted. The page fetched IBM Plex from `fonts.googleapis.com`;
  it now makes **zero external requests**. IBM Plex Sans latin is a variable
  font (`wght` 100–700, verified with fontTools), so one 40 KB file covers
  every weight — Google's own CSS points all four sans weights at it, which is
  why naively downloading "each weight" yields four identical copies. Mono is
  static and genuinely needs three. ~70 KB total.
- Jurisdiction packs are sorted by `pack_id` inside
  `applyJurisdictionOverrides` and `evaluatePackHardLines`. No verdict was
  ever affected — `resolveActivePacks` already sorted — but the guarantee
  lived in the caller, and in the hard-line function the order decides which
  hard line is named as the reason for a rejection. NF-1 now holds by
  construction for every caller.

**0.1.1**

- A `← Back` control on the intake steps before the confirmation attestation,
  and the step tracker's completed markers made genuinely clickable.
- "Why this verdict" now distinguishes hard lines, appetite invariants and
  jurisdiction-pack rules instead of listing bare identifiers.

## Fixes

Findings closed during the final rounds, all confirmed by command:

- `CS-3` The verdict now names an information-security review when the use
  case requires one. Previously no such binding existed.
- `NF-10` The translation-fidelity label is computed from the policy's
  attestation block instead of being hardcoded. It had been a static banner
  that happened to be true.
- `UC-1` The submitted description was captured, used, and never shown back.
- `UC-2` Only one of the two documented duplicate outcomes existed.
- Nine guarantees that were correct by inspection but unasserted now carry
  tests.
- Six code-review findings (round 3), including an audit write added without
  the double-click guard that sat fourteen lines away.
- A restored intake draft could hang on the duplicate-check step with no way
  forward (`explore-005` D-001), and the escape hatch dispatched an action
  the reducer discarded (D-002).

## Known Issues

Carried into the release deliberately. Each is stated in the product itself,
not only here.

- **No authentication.** The 2LoD role is a dropdown; a sign-off records a
  typed name and labels it unverified. Held open by explicit decision, not
  oversight — noted as such in code review 003.
- **No segregation of duties.** Nothing prevents a submitter approving their
  own use case; the record discloses it as self-service final.
- **Client-side storage.** The audit trail is append-only by construction but
  not tamper-evident.
- **Pack rules unadopted.** Every deck carries `[FIRM]` sign-off
  placeholders, so verdicts relying on them are provisional.
- ~~**`PE-6`/`RA-2` track floors are not implemented.**~~ **Closed in 0.1.2**,
  by correcting the paperwork rather than building the capability. PE-6's
  wording was already amended in round 4; the two acceptance criteria and four
  spec files were not. Both criteria now assert the supplement model and carry
  trace IDs.
- ~~**`specs/evaluation-engine.md` and its `.html` twin disagree**~~ **Closed
  in 0.1.2.** `evaluation-engine.md` had also been contradicting itself within
  a single page. All four spec files now describe the four effect types that
  actually exist.
- ~~**Four MUST property tests were specified and never written**~~ **Closed
  in 0.1.2.** `fast-check` added; all four exist, each with an anti-vacuity
  guard — the first two attempts passed while exercising nothing, and the
  guards make that failure mode impossible to repeat silently.
- **Acceptance-criterion traceability is 88/158.** The remaining 70 are
  covered but do not carry a trace ID. Still the single reason the release
  verdict is Demo-ready rather than Ship-ready.
- **Condition language cannot scope to a node type** (`FN-005`), so a rule
  that should apply only to processing cannot be written correctly.
- Open forward notes: `FN-003`, `FN-004`, `FN-005` in
  `specs/forward-notes.md`. None blocks release.

## Quality Summary

| Review | Verdict | Report |
|---|---|---|
| Code review (round 3) | **Merge with caveats** — 6 findings, all fixed | `code-review/code-review-003.html` |
| Design review (round 2) | **Build with caveats** — 2 Critical, both fixed in the specs before the verdict issued | `design-review/design-review-002.html` |
| Build verification (004) | **Demo-ready** | `test/test-004.html` |
| Doc review | **Not run** | — |

**Doc review was deliberately skipped**, and this is a gap in the release
record rather than a clean pass. The handover's stopping rule directed that
no further review round be opened inside this build; the documentation was
also written in the same session that would have reviewed it, which is not a
useful independent check. Recorded here so the absence is visible rather
than inferred.

**Test status at 0.1.2.** 399 automated tests across 41 files, three
consecutive green runs. `npx tsc --noEmit` clean, `npm run build` clean,
`python3 scripts/spec-parity-check.py` clean (R1–R8).

The verification-004 walk recorded 152 PASS / 2 FAIL / 4 STUB across 158
cases. Both FAILs and all four STUBs are closed in 0.1.2 — but that is a
claim about the fixes, not a re-run of the walk. **A fresh `/gvm-test` is
owed before the next release verdict**, and until it runs the standing
verdict remains 004's Demo-ready.

**Release verdict inputs (004).** No VV-4 trigger fired. Every VV-3 criterion
passed. `VV-2(a)` failed on traceability and the four unwritten property
tests. The property tests are now written; traceability is 88/158, so
`VV-2(a)` would still fail and the verdict would still be Demo-ready.
