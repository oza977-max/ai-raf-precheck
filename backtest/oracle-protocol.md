# Oracle protocol — grounding the back-test on rules, not on recollection

## Why this replaced committee-outcome grounding

The original plan was to compare AIGate's verdicts against what risk
committees actually decided. That plan had a defect the practitioner named
before it cost anything:

> the current human decisions [may not be] entirely true... it may be, it may
> not be.

Committee decisions are a **record of what happened**, not a statement of what
should have happened. They are shaped by who was in the room, how much time
there was, what precedent existed, and how the case was framed. Grounding on
them measures *concordance with past practice*, and inherits every
inconsistency in it.

So the ground truth moved. It is now: **what does the written rulebook
require?**

## What the two designs actually test

|  | Grounds on | Answers | Needs confidential data |
|---|---|---|---|
| Committee-outcome | past decisions | Is the encoded appetite the firm's real appetite? | Yes |
| **Oracle (this one)** | the rules as written | Is the engine a faithful executor of the appetite? | **No** |

Be clear about the limitation: **the oracle cannot tell you the rulebook is
right.** It tests the engine against the rulebook, not the rulebook against
the world. That is a narrower claim than the committee comparison would have
made.

It is also the claim that has to hold first. A rule-encoding bug corrupts the
committee comparison too — you would be measuring the engine's disagreement
with a committee while a mis-encoded rule silently drove the verdict. Fix the
executor, then argue about the rules.

And it has one decisive practical advantage: it runs entirely on public
material, so it can be published, re-run by anyone, and checked.

## The method

For every case in `backtest/cases.json`:

1. **The engine** scores it headlessly (`src/engine/backtest-corpus.test.ts`),
   emitting `backtest/engine-verdicts.json`.
2. **An oracle panel** — independent adjudicators, run on Claude Fable 5 and
   Claude Opus 4.8 — reads the case, `policy/appetite.yaml` and the relevant
   `policy/packs/*.yaml`, and derives what the rules require. Each produces a
   verdict, a binding rule, a control set, and a confidence.
3. The two are compared. **Disagreements are the entire output.** Agreement
   is not evidence of much; disagreement localises a defect.

### Blinding

The oracle must not see the engine's answer, or it ratifies rather than
adjudicates. Adjudicators are explicitly forbidden from reading:

- `backtest/engine-verdicts.json`
- any `src/engine/*.test.ts`
- `backtest/use-cases.md`, `backtest/corpus.md` (which carry my predictions)
- the engine implementation — they reason from the **policy**, not the code

Two models rather than one, because a single adjudicator's systematic
misreading is indistinguishable from an engine defect. Where Fable and Opus
agree with each other and disagree with the engine, the engine is the
outlier. Where they disagree with each other, the **rule is ambiguous** — and
that is a finding about the rulebook, which is the second thing this protocol
is for.

### The second output: rulebook findings

Adjudicators are asked to flag defects in the RULES, not just score cases:

- a case that falls through every track or tier
- a rule whose plain reading contradicts the regulation it cites
- a case where the right real-world answer differs from what the rules produce
- an unsatisfiable condition, or a control that cannot resolve the invariant
  it claims to

This is where the design earns its keep. Committee grounding could never
surface a rule that is simply missing.

## Interpreting a disagreement

| Pattern | Reading |
|---|---|
| Both oracles agree, engine differs | **Engine defect.** The rule says one thing, the code does another. |
| Oracles disagree with each other | **Rule is ambiguous.** Rewrite the rule; neither answer is safe. |
| All three agree, but the answer is obviously wrong | **Rulebook defect.** Faithfully executed, wrong policy. |
| Engine cannot produce a verdict at all | **Coverage hole.** No rule covers the case. |

## Result of the first run

The corpus found a coverage hole before any adjudicator returned. Case
**D-01** (a statistical market-impact model with advisory output) matches
**no track rule at all** — the engine returns `no-track-match` rather than a
verdict.

Enumerating the space mechanically: **9 of 28** `model_type` ×
`decision_bindingness` combinations match no track, at autonomy < 3 and where
the model is not a replacement:

```
statistical    + non-binding      ml            + non-binding
statistical    + advisory         deep-learning + non-binding
traditional-ml + non-binding      agentic       + advisory
traditional-ml + advisory         agentic       + material
                                  agentic       + binding
```

The last three are the serious ones. **An agentic system making binding
decisions matches no track** unless autonomy ≥ 3 or it replaces a prior model
— TRACK-II's `model_type` list omits `agentic`, and TRACK-III only covers
`non-binding`. The highest-risk shape in the taxonomy falls through the
routing.

This is a rulebook defect, not an engine defect: the engine correctly reports
that it cannot route the case. It is exactly the class of finding that
grounding on committee recollection would never have produced.

## Standing limitations

- The oracle is an LLM reading YAML. It is a **second careful reader**, not an
  authority. Two of them, blind, disagreeing with the engine is evidence; one
  of them agreeing with it is not.
- Agreement on a case says the engine executed the rule as written. It says
  nothing about whether the rule should exist.
- The jurisdiction packs remain unadopted (`[FIRM]` / `[DATE]` placeholders),
  so pack-driven verdicts stay provisional per NF-7 regardless of how the
  oracle scores them.
