# Changelog

All notable user-visible changes to AIGate. Written from the point of view of
someone using the tool, not someone building it — internal refactors, test
scaffolding and build mechanics are left out.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions refer to the **application**; the starter risk-appetite policy carries
its own version (currently `1.3`), shown in the app header and recorded on
every verdict.

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

### Known, unchanged

- The app is not responsive below roughly 700px. The layout overflows on a
  phone. Pre-existing, out of scope for this patch, and not introduced here.

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
