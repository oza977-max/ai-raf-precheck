# Changelog

All notable user-visible changes to AIGate. Written from the point of view of
someone using the tool, not someone building it — internal refactors, test
scaffolding and build mechanics are left out.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions refer to the **application**; the starter risk-appetite policy carries
its own version (currently `1.3`), shown in the app header and recorded on
every verdict.

---

## [0.3.0] — 2026-08-15

### Added — the product explains itself

- **An About screen, in the app.** The live link used to drop first-time
  visitors straight into "New pre-check" with no context — the README and
  its diagrams live on GitHub, where most visitors of the hosted app never
  go. About answers the first three questions (what is this, who wrote the
  rules, is an AI judging me), states what the tool deliberately is not, and
  points at the fastest explainer the product has: AIGate's own
  self-assessment in the register — the tool judged the tool.

- **A first-visit pointer** on the intake screen — one dismissible card, a
  two-minute-overview link, dismissed for good once you say so.

- **A regulator brief** ([docs/regulator-brief.md](docs/regulator-brief.md))
  — one page for a supervisory reader, answering the five questions they
  ask: is an AI making the decision (no, and how that is asserted by test),
  who is accountable for each determination (a named human per layer, with
  the gaps marked provisional rather than hidden), can a decision be
  evidenced later, how the encoding of regulation stays honest, and what
  happens when the tool doesn't know. No marketing adjectives; every claim
  already true in the repo.

- **A glossary** ([docs/glossary.md](docs/glossary.md)) — all 25 terms the
  product uses, in plain words, from risk appetite to HITL.

---

## [0.2.3] — 2026-08-15

### Added

- **"Anything the reviewer should know?"** — one optional free-text note at
  the attestation step. It is recorded permanently with your attestation and
  shown to the 2LoD reviewer above the verdict at sign-off, framed with the
  sentence that makes it safe: *the rules did not read it — the verdict is
  computed only from the structured answers.*

  This is the deliberate answer to "should every dropdown have a write-in?"
  — no. The closed dropdowns are the axes the rules are written in; a
  write-in on the data-sensitivity question would let a hurried submitter
  type "deal-related context" instead of facing the MNPI option, and walk
  past a hard line. Free text belongs where a human reads it. For saying the
  whole thing in your own words, the plain-language description path already
  exists and is read into the same structured graph you confirm.

### Not changed, on purpose

- No dropdown gained a free-text escape. Data class, zones, autonomy,
  exposure, weight and reversibility are complete classifications, not lists
  with gaps — being forced to choose IS the control. Platform, vendor and
  decision type, the three genuinely open sets, already have their escape
  hatches with the gap stated on the verdict.

---

## [0.2.2] — 2026-08-15

### Changed

- **The Provisional banner stopped presuming who reviews.** It said "legal
  review required" for every cause. Your packs disagree: DORA is signed by
  Technology Risk, SS1/23 by Model Risk — and a decision type your policy
  doesn't list is a question for whoever owns the risk appetite, not a
  lawyer. The heading is now "review required before this is final", and
  where the verdict knows who is actually pending — from its own reasoning
  chain — it names them: *"Waiting on: Legal/Compliance, Technology Risk"*.

- **The verdict now shows its living status** ("in good standing", as of a
  date) — the field the engine has recorded on every verdict since V1 and
  the screen never displayed.

### Internal

- Every one of the 158 acceptance criteria now names, in its own text, the
  test file that proves it — and each criterion's id appears in that test's
  title. This is what moved the release verdict to **Ship-ready** for the
  first time (verification 006), with one caveat on the record: there is no
  CI, so all evidence is manual, reproducible by `npm test`.
- Two criteria asserted behaviour that was never built (an automatic version
  bump on save; confidence scores that V2-E deliberately removed). Rewritten
  to what the product actually does, with dated notes, rather than tagged
  dishonestly.

---

## [0.2.1] — 2026-08-15

### Changed — the verdict now tells you what to do, in your own language

Reported after using it: *"a business user won't understand most of it… the
engine might be working but the verdict should be something a business user
understands — how it's derived and what they need to do."* Every point was
right. Nothing was removed — the full basis a reviewer signs against is still
there, underneath.

- **A "What you need to do" panel, at the top.** Every required control, every
  downstream review, and the sign-off, as one numbered list in plain language.
  This information was all on the screen before, spread across three panels
  and written in identifiers; nobody should have to assemble their own to-do
  list from a verdict.

- **Controls are named wherever they appear.** `CTRL-FINGERPRINT-01` is now
  **Output fingerprinting + version pinning**, with the identifier kept small
  beside it. The names were always in the policy — the screen just showed them
  in one panel and the raw code everywhere else. The identifier stays visible
  because it is what makes an item quotable in a committee paper and findable
  in the policy file.

- **"Governance margin" is now "How fragile is this approval?"** It used to
  read `→ NO HEADROOM INV-CITE-01, INV-CONDUCT-01, INV-SEC-01,
  INV-SYNTHMARK-01` — four codes you had to scroll up and look up one at a
  time. It now lists what each rule actually says, and explains the percentage
  in words instead of leaving you to guess what it was a percentage of.

- **"Standing conditions" is now "What would make this verdict expire"**, and
  it answers the two questions it used to leave open: *who checks these* —
  nobody automatically, they are read at the next re-review — and *what
  happens if one is breached* — the approval stops holding and the use case
  comes back through the gate.

- **The duplication is explained rather than hidden.** Data zone and autonomy
  appear both as expiry conditions and in what you told us. That is deliberate
  — one is the bound the verdict *depends on*, the other is what you
  *declared* — and the screen now says so instead of looking like a bug.

---

## [0.2.0] — 2026-08-14

### Added

- **You can now describe a decision type your policy doesn't list.** The
  "What kind of decision does it feed?" dropdown had eight fixed values, and a
  bank's real decision types have a long tail — collections prioritisation,
  AML alert triage, suitability assessment. There is now a **Something else —
  let me describe it** option with a free-text box.

  **What it deliberately does not do is pretend the engine understood you.**
  That field is a matching key, not a description: it drives two hard lines
  (autonomous credit/lending, autonomous trading), the Critical and High tier
  triggers, and EU AI Act Annex III. Free text matches none of them. So the
  text is recorded, no decision-type rule is applied, and the verdict says so
  in as many words — naming what you typed:

  > Cause: the decision type entered is not one your policy has a rule for, so
  > no decision-type rule could be applied. The tier and track above rest on
  > the other answers alone. Entered: "collections prioritisation".

  The verdict is marked Provisional on that basis. Accepting free text and
  quietly returning a lower tier would have been the worst outcome available —
  a silent under-classification, which is the one thing this product exists
  not to do.

  Leaving the question blank is still different from describing something:
  blank says no decision type applies; free text says one applies and your
  framework has no rule for it. Only the second is a hole worth showing you.

### Changed

- Over time, the decision types people type here are a list of the gaps in
  your own risk appetite framework. They are recorded on each verdict rather
  than discarded.

---

## [0.1.2] — 2026-08-09

Closes the four items that were still open at v0.1.1 — the two carried from
build verification 004, and the two limits recorded in the v0.1.1 notes.

### Fixed

- **The app works on a narrow screen.** It had no responsive rules at all, so
  below about 700px the fixed sidebar and the main column together overflowed
  the viewport and the whole page scrolled sideways. The layout now stacks
  into one column, and the two things that genuinely cannot reflow — the
  register table and the data-flow graph — scroll inside their own boxes
  instead of dragging the page with them.

  This is not a mobile redesign. A nine-column register and a data-flow graph
  are desktop artefacts; the change makes them survive a narrow viewport, not
  pretend to be designed for one.

- **Fonts are served from the app itself.** The hosted page fetched IBM Plex
  from Google. Some corporate networks block that outright, so a demo inside
  a bank could silently fall back to a system serif — and every visitor's
  browser made a third-party request. There is now nothing external to block,
  and nothing external to leak to. Adds about 70 KB.

- **The specs no longer contradict the engine.** Four spec files documented a
  `track_floor` rule effect that does not exist, and one contradicted itself
  about it within a single page. Two acceptance criteria still asserted the
  behaviour it would have produced, so they failed verification against an
  engine that was working correctly.

  The engine's actual rule — unchanged since V2-A — is that a jurisdiction
  pack never moves the track. "Most demanding standard governs" is expressed
  by *adding* obligations: controls and reviews from every applicable pack are
  combined, and a tier floor only ever raises the tier. That is the stricter
  reading, which is the point — nominating one pack as "governing" would mean
  discarding the obligations the others imposed.

### Changed

- **Jurisdiction rules are now applied in a fixed order regardless of how the
  packs were loaded.** No verdict was ever affected — the loader already
  sorted them — but the guarantee lived in the caller rather than in the
  functions themselves. It now holds by construction.

### Internal

- Four acceptance criteria specified generative property tests that had never
  been written. They exist now, covering: adding a jurisdiction never lowers a
  tier or moves a track; reordering the policy file never changes a verdict; a
  use case that crosses a hard line stays rejected no matter what controls are
  available; and every control the solver returns does real work, with none
  redundant. 399 tests in total.

---

## [0.1.1] — 2026-08-08

Two things a real user hit within minutes of the first release. Both were
reported from using the product, not found by a review.

### Fixed

- **You can go back.** Intake was forward-only: once you left the description
  step, the only way to correct a typo was *Clear all data and start over*,
  which destroys the whole session. There is now a **← Back** control on the
  duplicate check, the graph review and the questions, and the step
  immediately behind you in the tracker is a real button.

  Confirm stays one-way on purpose — it is an attestation, and stepping back
  across it would let you un-sign something you have signed.

  What you have typed is kept. Going back from the questions to the graph does
  clear your answers, because changing the graph regenerates the questions —
  keeping answers to superseded questions would be worse than asking again.

- **The step tracker stops lying.** Completed steps were marked with a ✓ that
  looked clickable and did nothing. That was the sharper half of the report:
  the one control you would reach for to go back was inert.

- **Text no longer spills out of the verdict box.** A long citation — such as
  *"EU AI Act Annex III §5(b) and §4(a); ECOA/Reg B; FCA Consumer Duty PRIN
  2A"* — could not wrap, and pushed the whole "Why this verdict" panel past
  the edge of its card.

### Changed

- **"Why this verdict" now says what the rules are.** It listed identifiers
  like `INV-AUTONOMY-01` and `TIER-CRITICAL` with nothing to tell you what
  kind of rule they were or where they came from. It now opens by
  distinguishing the three: **hard lines**, checked first and absolute — no
  control set can fix one; **invariants**, your firm's own appetite rules,
  each naming the controls that satisfy it; and **jurisdiction-pack rules**,
  which come from regulation rather than from your firm and are set out
  separately in the reasoning chain. The list of triggered invariants is
  labelled as such rather than left as bare IDs.

---

## [0.1.0] — 2026-08-08 — V1 scope, verified Demo-ready

Pre-1.0 by intent. "V1" throughout this repository names the *feature scope*,
not the release maturity: a build with no authentication, browser-held storage
and a Demo-ready verification verdict is not a 1.0.

The first complete build. Everything below works end to end and was walked
live before release; the full evidence is in
[`test/test-004.html`](test/test-004.html).

### The gate

- **Submit a use case in plain language or through a guided form.** With no
  API key the guided form asks business questions — "what kind of information
  does it use?", "how much can it do without a person?" — and states on screen
  that no AI reads your answers or makes the decision. With a key, a
  plain-English description is read into the same data-flow graph. Either way
  the graph is shown back to you for correction before anything is evaluated.
- **A duplicate check runs before intake.** The register is searched for a use
  case with overlapping characteristics. You can adopt the existing
  classification or record that yours is genuinely new; either choice is
  written to the audit trail.
- **Targeted questions, not a questionnaire.** The number and content of
  follow-up questions are driven by the risk signals detected in your
  description — a Low-tier case is asked few, a Critical one more. Answers
  that contradict each other are flagged before you can proceed.
- **You attest to the graph.** Confirmation is timestamped and permanently
  recorded, and the screen says so.

### The verdict

- **Approved, approved with controls, or rejected** — with the tier, the
  track, and the single binding constraint named.
- **Every step carries its regulatory citation.** The tier names the rule that
  set it; each tripped invariant names the regulation behind it.
- **The minimal control set is solved, not suggested.** The engine returns the
  smallest set of controls that brings the use case inside appetite, and each
  control names the invariants it patches.
- **A governance margin** shows how much headroom that control set leaves, and
  names the invariants resting on a single control — the ones where removing
  one control puts you outside appetite.
- **A regulatory reasoning chain** quotes the verbatim source text of every
  jurisdiction rule that fired, states what was derived from it, and whether
  that derivation restates the text or infers from it.
- **Standing conditions** record the operating bounds the approval assumes.
  The verdict holds while the system stays inside them; drift outside voids it.
- **Platform and vendor inheritance** shows what an existing approval already
  covered and, dimension by dimension, exactly where your use case falls
  outside that envelope.
- **A rejected verdict gives the forward path**, not a list of things you did
  wrong.

### The register and sign-off

- **A graph-based AI register** — shared components appear once, not once per
  use case. Filter by tier, track, status and stage; export the whole thing as
  JSON.
- **Lifecycle governance by tier.** Low self-serves; Medium, High and Critical
  wait for 2LoD sign-off.
- **A reviewer sees the same verdict the submitter saw**, on the sign-off page,
  and the sign-off names the verdict it attests to.
- **An append-only audit trail.** Nothing can be edited or deleted through the
  application. Double-clicking an approve button appends one event, not two.
- **AIGate submits itself through its own gate** on first launch, so there is
  always a worked example in the register.

### Honesty, as a feature

These are deliberate, and the product states them on screen rather than in a
footnote:

- **Unadopted pack rules make a verdict provisional**, and the banner names
  which rules and why.
- **A control with no evidence renders UNVERIFIED**, never a blank or a
  reassuring default.
- **The translation-fidelity label is computed** from the policy's attestation
  block. An unattested policy says "unattested" in the header; it is not
  hardcoded either way.
- **A sign-off records the typed name and labels it "name not verified"** —
  because there is no authentication behind it.
- **The audit trail says it is client-side and proof-of-concept grade.**
- **Three jurisdiction packs were deleted rather than shipped.** The Canada,
  Singapore and Japan starter packs emitted real control requirements from
  regulatory text nobody had retrieved. They were removed in policy v1.3; those
  three remain declared jurisdictions with no pack. A rule citing a source
  nobody read is worse than no rule.
- **A confidence score was removed** and replaced with each rule's *basis* —
  whether it restates its quoted text, infers from it, or rests on judgement.
  A reviewer can check a basis by reading the rule against its own citation.
  Nobody can check a number that was invented.

### Configuration

- **The firm's appetite is a YAML file you can read and edit** in the app, with
  validation on save and automatic re-evaluation queued for affected use cases.
- **Jurisdiction packs update independently** of the main policy file.
- **A policy file missing a required field cannot be used**, and a pack rule
  without a source citation is rejected on load.
- **Every verdict records the policy version and the version of every pack that
  was active**, so a verdict issued last month is not silently rewritten by a
  policy change today.

### Known limits at V1

Stated here as well as in the product. None is a defect; each is a boundary.

*As of 0.1.2 the last row has been closed — the property tests now exist. The
others still hold.*

| Limit | What it means |
|---|---|
| No authentication | The 2LoD role is a dropdown. A sign-off records a typed name and says it is unverified. |
| No segregation of duties | Nothing stops a submitter approving their own use case. The record discloses it; it does not prevent it. |
| Client-side storage | The audit trail is append-only by construction but held in your browser — not tamper-evident. |
| Pack rules unadopted | Every shipped deck carries `[FIRM]` sign-off placeholders, so verdicts relying on them are provisional until your CRO adopts them. |
| Four decks only | SS1/23, SR 26-2, EU AI Act, DORA. Canada, Singapore and Japan are declared with no pack. |
| No post-deployment monitoring | Standing conditions are recorded and checked at re-review, not watched live. That is V2. |
| No shadow-AI discovery | AIGate cannot see use cases that never come through intake. That is V2. |
| Condition language cannot scope to a node type | A rule that should apply only to where processing happens cannot yet be written correctly. |
| No property-based tests | Four acceptance criteria specify generative tests that were never written. The behaviour they describe is covered by example tests. |

---

## Policy versions

The starter risk-appetite policy is versioned separately from the application,
because a firm adopting AIGate will fork it.

### [1.3] — starter policy

- **Removed the Canada, Singapore and Japan packs.** They emitted real controls
  from illustrative rule text whose sources were never retrieved. The three
  remain declared jurisdictions with no assessed pack.

### [1.2] — starter policy

- Retired an invariant that had become unreachable — its condition had drifted
  to be byte-identical to a hard line that already caught the same case.
- Narrowed the AI-disclosure invariant back to client-facing systems: the
  transparency article it derives from requires a person interacting, not
  merely a channel.
- Removed a model-type gate from the escalation invariant, so a route to a
  human follows the affected person rather than the technology.
- The autonomy invariants now require an *acting* output, so they stop
  demanding an authority envelope of systems that only provide information.

### [1.1] — starter policy

- First revision after two independent adjudicators scored the worked-case
  corpus against v1.0.
