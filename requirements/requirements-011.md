# AIGate Requirements — Round 11

## Round 11 — The Third Lever: Appetite Decides, Law Decides, Knowledge Challenges

**Status: APPROVED by the user (2026-08-17) — full scope. Ordering:
R10 ships first, then this round runs its full pipeline (spec → test
cases → build → verify).**

## Provenance

User direction (2026-08-17): elevate external risk knowledge to a named
lever alongside the firm's appetite and jurisdiction packs — grounded in
the MIT AI Risk Repository (1,700+ risks from 65 frameworks, CC BY 4.0,
updated quarterly as a living database) — AND govern the models themselves
("which LLM? is it approved? open source? benchmarked?"). The architectural
decision already agreed: the third lever is a **knowledge** lever, not an
authority lever — it may challenge, flag and fuel rule-authoring; it is
structurally incapable of deciding a verdict. The chain of honesty (RAF
prose → extraction → YAML) must be preserved: new rules get prose homes
FIRST.

## 1. Purpose

Two levers answer "who says no?" (the firm; the law). Nothing answers
"what does the world know can go wrong with this shape?" — so awareness
gaps are invisible until an incident. Round 11 adds that third question as
a first-class, clearly-subordinate lever, and closes the loop: knowledge
flags a gap → the gap lands in the rule-improvement queue → a human
authors a rule → it becomes authority. Alongside it, the models themselves
become governed objects: named, approved, provenance-classed, with
benchmark evidence — activating the register's dormant `ai_model` node
design.

## 2. Personas

**James (1LoD)** sees, at intake, which model he is declaring and whether
it is approved. **Priya (2LoD)** sees, at review and sign-off, the known
risk classes for the case's shape and whether the appetite covers them.
**The rule authors** receive coverage gaps as work items. **A first-time
README reader** can name the three levers and their different powers after
one screen.

## 3. Functional Requirements

### R11-RAF — The prose comes first

**R11-RAF-1 (Must):** The base RAF template (`grounding/ai-raf-template.html`)
and the extraction rulebook (`grounding/raf-extraction.md`) shall gain:
(a) a **model approval position** — the firm maintains an approved-model
list; models carry a provenance class (vendor-hosted / open-weights
self-hosted / fine-tuned in-house); approval requires named benchmark
evidence appropriate to the use (including finance-domain evaluation where
the use case is financial); and (b) a **risk-knowledge clause** — the firm
maintains awareness against a recognized external risk taxonomy; coverage
gaps are reviewed by a named owner on taxonomy updates. Every YAML rule
added by this round shall cite one of these prose homes.

> Fit criterion: each new rule's `regulatory_basis`/comment traces to the
> amended prose; the extraction doc maps prose → rule explicitly.

### R11-MG — Model governance at intake

**R11-MG-1 (Must):** The policy shall carry an **approved-model registry**:
entries with model name/version, provenance class, license note, approval
status, and benchmark evidence (named suite + date) as the approval
control's evidence. The starter ships honest examples including the demo's
own local model, marked exactly as approved/unapproved as the starter's
authority state allows (unadopted ⇒ provisional, as everywhere).

**R11-MG-2 (Must):** Intake (form AND LLM path) shall ask **which model**
(pick from the registry, or "not listed — name it"), storing it on the
processing node. An unlisted or unapproved model shall trip an invariant
whose resolution is a named control/required review — the vendor-approval
pattern, one level deeper. Provenance class is derived from the registry
entry (or asked when unlisted); rules may condition on it, so open-weights
is an ATTRIBUTE the firm's rules judge, never a hardcoded penalty.

**R11-MG-3 (Must):** AIGate's own self-assessment shall declare its own
runtime model through this mechanism (dogfood: the gate gates its gatekeeper).

> Fit criteria: registry loads/validates; both intake paths capture the
> model; an unapproved model produces the invariant + control in the
> verdict; the self-assessment names the demo model; register `ai_model`
> nodes are created and linked (`uses_model` edge) — the dormant schema
> consumed, with a test that fails if it goes dormant again.

### R11-KL — The knowledge lens

**R11-KL-1 (Must):** A curated **risk-knowledge file** (deliberately NOT a
"pack" — its own name and schema, so the authority line stays structural):
entries derived from the MIT AI Risk Repository domain taxonomy, each with
a graph-attribute condition, the risk domain/subdomain, a one-line
plain-English description, and the CC BY 4.0 attribution. Effects allowed:
**advisory flag** and **coverage-gap note** — the schema shall have no
field capable of expressing a tier, control, hard line or verdict effect.

**R11-KL-2 (Must):** The review screen and the 2LoD sign-off page shall
render matching knowledge entries as an advisory panel in the established
advisory idiom (distinct styling, "informs — the rules decide" posture
line, never blocking, never gating).

**R11-KL-3 (Must):** Where a matched knowledge entry's risk class is
covered by NO firm or pack rule (a static curated mapping, honest about
being curated), the panel says so, and a one-tap action files it into the
**rule-improvement queue** as a coverage gap (a `rule_dissent_filed`-family
event naming the risk class instead of a rule) — knowledge becoming
rule-authoring fuel through the existing governed channel.

**R11-KL-4 (Should):** A **coverage map** document (generated, committed):
MIT risk domains vs the rules that touch them, gaps stated plainly.

> Fit criteria: schema rejects any verdict-shaped effect; panel renders
> matched entries with attribution and posture line; uncovered classes
> render the gap wording and the filing action writes exactly one queue
> event; engine output byte-identical with the lens present or absent.

### R11-UI — Three levers, visibly distinct

**R11-UI-1 (Must):** The UI shall present the three levers as distinct,
named things wherever rule sources appear: the policy/framework screen
gains a three-section structure (Firm appetite · Jurisdiction packs ·
Risk knowledge) with one-line "power" statements (decides / decides where
law applies / informs, never decides); the verdict's reasoning already
attributes firm vs pack rules — knowledge items render visually apart
from both, never interleaved with deciding rules.

**R11-UI-2 (Must):** The About screen explains the three levers in the
same plain language as the README.

### R11-DOC — The story

**R11-DOC-1 (Must):** README: the "Where the rules come from" section
becomes "The three levers" — diagram updated to show the knowledge lever
as visually subordinate/advisory (dashed, like the existing advisory
edges), with the one-sentence pitch: **appetite decides, law decides,
knowledge challenges**. MIT repository named with attribution and licence.

**R11-DOC-2 (Must):** approach.md gains the third-lever section including
the honest boundary: knowledge entries are curated by a person, the
curation is versioned, and the lens is only as current as its last sync
(sync tripwire recorded in the monitoring loop).

## 4. Non-Functional (carried invariants)

- **R11-NF-1 (Must):** `evaluate()`'s decision output is byte-identical
  with and without the knowledge lens loaded (advisory data may ride
  BESIDE the verdict, never inside its deciding fields). Determinism test
  extended to assert it.
- **R11-NF-2 (Must):** No reserved words rendered; all knowledge text
  renders as text; append-only trail discipline for the gap-filing event.
- **R11-NF-3 (Must):** CC BY 4.0 attribution present wherever MIT-derived
  content renders or is stored.

## 5. Out of Scope (recorded)

- Auto-syncing the MIT database (curation is human, versioned; the
  quarterly-update TRIPWIRE goes in the monitoring notes now).
- Running benchmarks (evidence intake only).
- Incident-to-risk-class mapping and re-benchmark triggers (V2 monitoring).
- Any knowledge-lens influence on tier/track/controls/status — permanently.

## 6. Requirements Index

| ID | Summary | Priority |
|---|---|---|
| R11-RAF-1 | Model-approval + risk-knowledge positions added to RAF prose + extraction first | Must |
| R11-MG-1 | Approved-model registry in policy with provenance class + benchmark evidence | Must |
| R11-MG-2 | Intake asks WHICH model; unapproved/unlisted trips invariant; provenance is an attribute rules judge | Must |
| R11-MG-3 | Self-assessment declares its own runtime model | Must |
| R11-KL-1 | Curated knowledge file, own schema, structurally incapable of deciding | Must |
| R11-KL-2 | Advisory panel at review + sign-off, established idiom | Must |
| R11-KL-3 | Coverage gaps file into the rule-improvement queue | Must |
| R11-KL-4 | Generated coverage map document | Should |
| R11-UI-1/2 | Three levers visibly distinct in-app; About explains | Must |
| R11-DOC-1/2 | README three-lever story + approach.md honest boundary | Must |
| R11-NF-1..3 | Byte-identical decisions; reserved words; CC BY attribution | Must |

## Changelog

| Date | Change |
|---|---|
| 2026-08-17 | Round 11 drafted — the third lever, full-pipeline round. Awaiting approval. |
