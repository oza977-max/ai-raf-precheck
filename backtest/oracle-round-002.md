# Oracle round 002 — results

Run 2026-07-27 against policy `1.1`. Two blind adjudicators (Claude Fable 5,
Claude Opus 4.8) re-scored all 31 corpus cases. The brief changed in two ways
from round 001:

1. They were asked to hunt **regressions** — what v1.1 broke — not only gaps.
2. The tie-break and minimality rules were **stated in the brief**. Round 001's
   disagreements were mostly about undefined semantics; leaving them unstated
   again would have re-measured the same ambiguity instead of testing the fix.

## Headline

| Measure | Round 001 | **Round 002** |
|---|---|---|
| Verdict status, three-way agreement | 30 / 31 | **30 / 31** |
| Binding constraint, unanimous | 24 / 31 | **31 / 31** |
| Engine is the outlier | 3 | **0** |
| Oracles disagree with each other | 2 | **0** |
| All three differ | 2 | **0** |

**Every binding-constraint disagreement is gone.** The remaining status
disagreement is H-01, and it is the same one as round 001: whether an inherited
control leaves a use case at a clean `approved` or at
`approved_with_controls` with the control pre-satisfied. The policy still does
not say.

**So the engine is no longer the subject.** It executes the rulebook faithfully
and both adjudicators agree with it on every rule it names. Everything below is
about the rulebook.

## The result that matters: v1.1's fixes displaced defects rather than removing them

Both models, independently, found that several round-001 fixes had reintroduced
the same defect one rule further down. That is a finding about *how* the fixing
was done, not about any individual rule, and it is the whole reason to run a
second blind round.

| v1.1 did this | …and it created this |
|---|---|
| Promoted TRACK-II-REPLACE / TRACK-II-AUTONOMY so they were reachable | **Agentic systems at autonomy ≥ 3 stopped reaching TRACK-III-AGENTIC** — the highest-risk agents routed to MRM, the exact population SR 26-2 footnote 3 carves out |
| Widened HL-002 to match its own stated reason | **INV-ZONE-01 became unreachable** — byte-identical condition, and hard lines short-circuit. A rule the engine can never evaluate, still documented as load-bearing |
| Added CTRL-AUTONOMY-BOUND-01 so autonomy was mitigable, not only abolishable | **INV-AUTONOMY-02 inherited the incoherence** — a text-only chatbot told to impose "hard value and volume limits" |
| Fixed the alphabetical binding tie-break in the engine | **The rule still was not in the policy** — a comment about code standing in for a rule of the appetite |
| Applied "obligations follow the affected person" to conduct and fairness | **Left INV-ESCALATE-01 and INV-DISCLOSE-01 gated on model family** — RF-3, the project's own recorded lesson, violated in the session that recorded it |

## Fixed in v1.2

- **TRACK-III-AGENTIC promoted to first.** Verified: agentic at autonomy 1, 3, 4
  and as a replacement all now route to Track III, while `ml` at autonomy 3 →
  TRACK-II-AUTONOMY and `ml` replacing a prior model → TRACK-II-REPLACE remain
  reachable. Both properties hold simultaneously.
- **INV-ZONE-01 retired**, id not reused. MNPI outside the controlled zone is
  solely HL-002's business.
- **INV-DISCLOSE-01 narrowed back to client-facing.** Art. 50(1) attaches to
  systems intended to interact directly with natural persons; a Pillar 3 filing
  has no interaction and no interface to disclose on. Art. 50(2) marking is the
  right rule for published artefacts and INV-SYNTHMARK-01 already carries it.
- **INV-ESCALATE-01's model-type gate removed.** A client turned down by a
  deep-learning system needs the human route as much as one talking to an LLM.
- **INV-AUTONOMY-01/02 now require an acting `action_type`**
  (`execute`/`trade`/`approve`), so they stop demanding authority envelopes of
  recommend-only supervised pipelines. The file's most severe invariant was
  matching half the corpus, which dilutes what a Critical binding constraint
  communicates.
- **`binding_constraint_order` declared in the policy** and consumed by the
  engine, with a documented fallback. An adjudicator put it exactly right: a
  comment about code is not a policy rule, and an auditability claim cannot
  rest on one.

### Why `action_type` and not `hitl`

`hitl` looks like the natural field for "is a human supervising this", and it
is not usable. It is optional on the graph, and `matchesCondition()` treats an
**absent** field as no-match — so a condition on `hitl` would let a use case
escape the most severe invariant in the file by leaving the question blank.
Fail-open on that rule is not a trade worth making. `action_type` is always
present.

This is worth stating as its own finding: **missing-field semantics are
undefined and load-bearing.** `INV-VENDOR-01`'s `not_in` makes an absent vendor
equivalent to an unapproved one; `HL-003`'s `hitl: false` makes an absent value
equivalent to safety. The two conventions are opposite, and nothing declares
either.

## Open, and deliberately not fixed in this round

Recorded rather than quietly carried. Each needs a decision, not a patch.

- **`hitl` is collected and consumed by exactly one rule** (HL-003). Human
  oversight neither relieves any invariant nor is tested for adequacy — there is
  no equivalent of EU AI Act Art. 14 (oversight competence, authority to
  override, automation-bias awareness). Fixing this properly means making the
  field mandatory at intake first.
- **INV-SEC-01 keys on exposure, not on input provenance** — the same
  description-vs-condition mismatch round 001 found in INV-CONDUCT-01. It
  matches RCSA drafting over the firm's own records and misses AML triage
  reading genuinely hostile input. A correct fix needs an input-provenance field
  on the graph, which is a schema and intake change.
- **Verdict flattening.** Both models: the widened invariants mean nearly every
  generative case trips the same 3–4, so a supervised internal tool and a risky
  unsupervised one get similar control sets. G-05 draws nine controls. Each
  widening was defensible alone; the aggregate may discriminate less than the
  risk does.
- **Tier and invariant severity are decoupled.** G-04 carries a Critical-severity
  invariant inside a Medium tier whose workflow is *2LoD-notify* — a Critical
  finding nobody must sign off.
- **Envelope ordinals are still undeclared in the policy.** `max_data_class` and
  `max_exposure` are ordinal comparisons and the file states no ordering, so
  H-02's verdict rests on an unwritten ranking. Both models called this the
  least defensible thing in the pack, because inheritance is what *removes*
  controls from a verdict.
- **Empty `jurisdictions` silently de-scopes every pack.** Still the cheapest way
  to make all pack obligations vanish.
- **Four of six KRI families remain orphaned**; `safety_margin` appears in no
  rule in the file.
- **Three of seven packs remain unauthored placeholders.** G-04 and G-05 are
  worse than provisional — their jurisdictional limb is known-fictional.
- **No remediation path for MNPI.** HL-002 rejects and nothing offers the
  adjacent compliant design (redeploy in Zone C). A bright line with no
  compliant neighbour is what drives shadow IT.
- **H-01 inheritance semantics** — the one persistent status disagreement.

## Standing limitations

Unchanged from round 001, and worth repeating because the numbers above look
better than they are. This tests the ENGINE against the RULEBOOK. It cannot
establish that the rulebook is right. Two careful blind readers agreeing with
the engine on all 31 binding constraints means the executor is faithful — not
that the appetite is correct.
