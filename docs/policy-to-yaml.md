# Turning your risk appetite into YAML

*The practical guide. You have an appetite document in prose (or scattered
policies); this walks you from that to a working `appetite.yaml`, one
decision at a time. No programming background assumed — YAML is just an
indented list a person can read.*

Companion pages: [approach.md](approach.md) explains *why* the method works;
this page is *how*. [glossary.md](glossary.md) has every term. Two deeper
references for when you get there: `grounding/raf-extraction.md` is the
worked record of how the STARTER rules were extracted from a public template
(a full example of this guide applied, rule by rule), and
`grounding/PACK-AUTHORING.md` is the separate playbook for jurisdiction
packs — packs are authored against regulation, not appetite, and have their
own discipline.

---

## First, know which part is yours

AIGate is three different kinds of thing, and confusion between them is the
most common first-reader mistake:

| Layer | What it is | Who owns it | Changes how often |
|---|---|---|---|
| **The tool** (engine, screens, register, audit trail) | Fixed machinery: walks a use-case graph, applies whatever rules are loaded, records everything. Contains **no opinions about risk**. | The product | Only with software releases |
| **Your appetite** (`policy/appetite.yaml`) | The firm's own risk positions: what is forbidden, what needs controls, how severity is tiered. **This does ~90% of the work.** | **Your firm** | When your appetite changes |
| **Jurisdiction packs** (`policy/packs/*.yaml`) | Regulator-derived overrides — each rule quotes the verbatim regulation it comes from and carries a named sign-off. They only ever *modify* what your appetite decided. | Your Legal/Model Risk/Tech Risk functions (per pack) | When regulation changes |

The tool with no policy is a calculator with no formula. The starter policy
that ships in the box is a complete, working formula — but it becomes *your*
formula only when someone at your firm reviews and adopts it. This guide is
for the moment you go from the starter to your own.

---

## The anatomy of a policy file

`appetite.yaml` has a small number of sections, each answering one plain
question:

| Section | The question it answers |
|---|---|
| `hard_lines` | What do we refuse outright — no control can fix it? |
| `invariants` | What must always hold — and which controls satisfy it when it doesn't? |
| `controls` | What named measures exist, and what evidence proves each one? |
| `tiers` | How do we grade how much could go wrong (Critical/High/Medium/Low)? |
| `tracks` | Which oversight regime handles each kind of model? |
| `jurisdictions` | Where do we operate — which packs may activate? |
| `downstream_reviews` | Which other teams must a use case be routed to, and when? |
| `translation_attestation` | Who confirmed this file matches the board-approved prose? |

Everything else in the file is machinery detail with commented defaults you
can leave alone on a first pass.

---

## The conversion, step by step

### Step 1 — Gather the prose (an afternoon)

Collect whatever exists: the AI risk appetite statement if you have one,
the model risk policy, the AI ethics statement, vendor rules, any committee
decisions about AI use cases. Scattered is fine — the method below doesn't
need a tidy source.

### Step 2 — Extract the absolute prohibitions → `hard_lines`

Read for sentences shaped like *"we will never…"*, *"under no
circumstances…"*, *"X is prohibited"*. Each becomes a hard line **only if no
control could reasonably cure it**. The starter policy keeps just five —
that restraint is deliberate, and the file itself records a case where a
sixth was demoted because a control *could* fix it.

The translation pattern, prose → YAML:

> *Prose:* "Fully autonomous AI must never take irreversible actions that
> reach clients or markets."

```yaml
- id: "HL-001"
  description: "Level 4 autonomy on irreversible client-facing or market-facing actions"
  condition:
    autonomy_level: { gte: 4 }
    output_reversibility: "irreversible"
    exposure: { in: ["client-facing", "market-facing"] }
  reason: "Fully autonomous irreversible action reaching a client or the market leaves no point of human control before harm is done."
  regulatory_basis: "SS1/23 §3.8; SR 26-2 §IV"
```

Notice what happened: the prose adjectives became **conditions over the
use-case graph's fields** (autonomy level, reversibility, exposure). That is
the entire trick of the whole file. The fields you can condition on are the
same plain-English questions the intake form asks — data class, data zone,
model type, autonomy, action type, exposure, bindingness, reversibility,
scale, decision type, human-in-the-loop.

### Step 3 — Extract the "musts" → `invariants` + `controls`

Sentences shaped like *"X must always…"*, *"…requires Y"*, *"no Z without…"*
become invariants. The difference from a hard line: an invariant **names the
controls that satisfy it**, which is how a use case comes back inside
appetite instead of being refused.

> *Prose:* "Client personal data must not leave systems we control."

becomes an invariant conditioned on `data_class: Client PII` +
`data_zone: Zone A/B`, resolved by (say) an encryption control and a
data-residency control. Each control you name goes in the `controls` section
with the **evidence** that proves it exists — and if you have no evidence
yet, say nothing: the tool renders it UNVERIFIED, which is honest.

### Step 4 — Grade severity → `tiers`

Ask of your worst committee memories: *what made the scary ones scary?* The
starter's answer: decisions about people (credit, hiring) and at-scale
client/market exposure force the top tiers; internal read-only tooling sits
at the bottom. Tiers decide who signs off, so calibrate them against who you
*actually* want in the room for each kind of case.

### Step 5 — Route oversight → `tracks`

Usually the shortest step: your model risk function already knows which
regime covers classic models versus generative/agentic AI. The starter
encodes a current, defensible split with the regulatory citations attached —
most firms will edit the citations' *conclusions* rarely and the routing
almost never.

### Step 6 — Declare where you operate → `jurisdictions`

List the codes; leave pack activation to the packs. A declared jurisdiction
with no pack is an honest state — the tool says "not assessed" rather than
pretending.

### Step 7 — Backtest before you bless (the important one)

Do **not** hand the draft straight to a committee. First, replay your last
ten to twenty *actually decided* use cases through it (the in-app policy
editor validates the file on save and re-queues existing cases for
re-evaluation automatically). Every disagreement between the tool and the
committee's real decision is one of: a mistranslated rule (fix the YAML), a
missing rule (add it), or a decision the committee got wrong (now *that* is
an interesting memo). This step is what turns the file from a transcription
into a calibrated instrument — [approach.md §5](approach.md) argues why it
beats top-down encoding.

### Step 8 — Adopt

Replace the `[FIRM]` placeholders, have the appetite owner sign the
translation attestation, have each pack's owner sign their pack. The
verdicts don't change — only the "provisional" stamp lifts. Rules and
authority are deliberately separate; adoption adds the second.

---

## What you do NOT have to do

- **Encode whole regulations.** Packs encode only the provisions that would
  *change a verdict* — a 200-page regulation typically yields two or three
  rules ([approach.md §2](approach.md) shows why).
- **Write YAML from a blank page.** Every section of the starter file is a
  worked, commented example of itself. Copy the nearest rule, change the
  condition, keep the shape.
- **Get it right first try.** The policy editor validates on save and
  refuses malformed files; existing cases re-evaluate against edits so you
  see the blast radius of every change; and reviewers who think a rule is
  wrong have a formal channel (the rule-improvement queue) to say so on the
  record.

The realistic budget, from [approach.md §4](approach.md): 2–3 days of
drafting for someone who knows both the documents and the use cases, half a
day of review per owning function, about an hour a month of maintenance.
