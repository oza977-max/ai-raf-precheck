# AIGate Requirements — Round 4

## Round 4 — The Rule-Improvement Queue

**Status: BUILT.** Unlike rounds 1–3, this round was specified and built in the
same working session (2026-08-15), so this document records the requirements
the build was held to rather than requirements awaiting a build. Every fit
criterion below names the test that proves it (`test-cases-004.md`), keeping
the traceability discipline at 100%.

## Relationship to Previous Rounds

Rounds 1–3 built the decision path: intake → deterministic verdict → 2LoD
sign-off → append-only audit trail. Round 4 adds the first **feedback path**:
a channel for a reviewer to dispute a *rule* rather than a verdict, and a
place for those disputes to accumulate. It changes nothing about how decisions
are made — that is its central requirement, not a side constraint.

### Provenance

| Domain | Source | Priority |
|---|---|---|
| R4-RC | FN-009 (`specs/forward-notes.md`) — the advisory dissent panel, grounded in Haize Labs j1-micro and "Verdict: A Library for Scaling Judge-Time Compute" (arXiv:2502.18018), and in the manual oracle rounds (`reviews/calibration.md`, `backtest/oracle-protocol.md`) | Critical |

The wider design this round is the first half of: reviewers — human today,
optionally small advisory judge models later — evaluate cases against the
rulebook, and *disagreement files a dissent instead of changing anything*.
The LLM half is deliberately deferred (no working API key; a judge would ship
"built, never run live"), recorded in FN-009 with the first step for whoever
gets a key.

## 1. Purpose

A firm's rules are wrong in places, and the people best placed to notice are
the reviewers applying them to real cases. Before this round that knowledge
had no carrier: a reviewer who believed a rule was too broad could only
approve or reject the case in front of them and say so in a hallway. Round 4
gives the objection a permanent, attributable, *non-binding* record and a
queue where objections accumulate per rule — the raw material for the human
rule-authoring process (`grounding/PACK-AUTHORING.md`). Nothing in the round
gives anyone a new way to change a decision.

## 2. Target User

**Priya — Head of AI Governance (2LoD).** She reads verdicts all day and is
the first to know when a rule misfires. **The rulebook authors** (risk
framework owners) are the consumers of the queue: they need to see which rule,
challenged how often, by whom, on which cases.

## 3. Functional Requirements

### R4-RC — Rule Challenges

**R4-RC-1 (Must):** From the sign-off page, a 2LoD reviewer shall be able to
file a challenge against a rule, recording: the rule's id, the reasoning, the
filer's (self-asserted) name, and the id of the verdict the reviewer was
shown — threaded from the render, never re-derived at write time (the same
discipline as the attestation's `verdict_id`, verdict-audit.md §13.4).

> Fit criterion: filing writes one `rule_dissent_filed` audit event carrying
> all four fields, with `verdict_id` equal to the id of the verdict the page
> rendered. **Test: TC-R4-RC-1-01.**

**R4-RC-2 (Must):** A challenge shall be advisory by construction. Filing
writes exactly one audit event and changes nothing else: no lifecycle stage
transition, no sign-off, no verdict mutation, and no engine input anywhere.

The moment a dissent can move a decision it is an override channel, not a
dissent. This is the round's load-bearing requirement.

> Fit criterion: after filing, the trail contains exactly one new event; no
> `lifecycle_stage_changed` and no `twoloD_reviewed` was written; the page
> states the verdict is unchanged. **Test: TC-R4-RC-2-01.**

**R4-RC-3 (Must):** The rule picker shall offer the rules *this verdict
relied on*, read from the verdict's own persisted explanation (tier/track
rationale, tripped invariants, regulatory chain, binding constraint) — never
recomputed against today's policy. A rule outside that list may be named by
typing its reference, and a typed reference shall be recorded without a
resolved label, because no match against the rulebook was made.

> Fit criteria: the picker's options come from the rendered verdict's
> explanation (**TC-R4-RC-3-01**); a free-typed reference is stored trimmed,
> with no `rule_label` (**TC-R4-RC-3-02**).

**R4-RC-4 (Must):** An incomplete challenge shall be refused, not recorded.
No rule named, no reasoning, or no filer name each produce a plain-English
refusal and zero audit events — the refuse-rather-than-record posture of the
sign-off actions, applied to a record that can never be cleaned up.

> Fit criterion: each of the three omissions is refused with its own message
> and writes nothing. **Test: TC-R4-RC-4-01 (three variants).**

**R4-RC-5 (Must):** A rule-improvement queue screen shall list every filed
challenge, grouped by rule id (sorted; entries newest-first), naming for each
entry the challenger, the use case, the date, and the challenged verdict. It
shall be a derived read view computed by scanning the audit trail — never a
second persisted store — and shall state its own posture on the page: a
dissent never changes a verdict, and nothing in the queue feeds back into the
engine.

> Fit criteria: empty state points at where a challenge is filed from
> (**TC-R4-RC-5-01**); grouping, ordering and attribution (**TC-R4-RC-5-02**);
> the posture statements are rendered (**TC-R4-RC-5-03**).

**R4-RC-6 (Should):** The challenge affordance shall be available to the 2LoD
role whenever a verdict exists — including on cases that have advanced past
sign-off, because a rule can be wrong on a decided case. It shall not be
offered to 1LoD, and not where no verdict exists (no rule was applied, so
there is nothing to challenge).

> Fit criteria: available at `approved` stage (**TC-R4-RC-6-01**); absent for
> 1LoD (**TC-R4-RC-6-02**); absent with no verdict (**TC-R4-RC-6-03**).

## 4. Non-Functional Requirements

**R4-NF-1 (Must):** No change to engine output. `evaluate()` remains
byte-identical for identical inputs (NF-1); the round touches store types and
presentation only.

> Fit criterion: the existing determinism test (TC-PE-1-01) passes unchanged.

**R4-NF-2 (Must):** The queue renders without writing, and a double-click
files one challenge, not two — the append-only trail admits no cleanup.

> Fit criteria: opening the queue twice leaves the trail unchanged
> (**TC-R4-NF-2-01**); double-click writes one event (**TC-R4-NF-2-02**).

## 5. Constraints (carried forward)

- No rendered string may match `/approved|rejected/i` (the verdict screen's
  single-match guard). Asserted for the queue by **TC-R4-RC-5-04**.
- Challenge text is user-authored and untrusted: rendered as text, never
  markup. Asserted by **TC-R4-RC-5-05**.
- `src/engine/*` stays a pure island; the event type lives in
  `src/store/types.ts`, writes go through `audit.append()`, the queue derives
  in the component layer (cross-cutting.md §7).

## 6. Out of Scope (deliberate, recorded)

- **LLM judges filing dissents.** Designed, not built — FN-009 records why
  (no working API key; a second "built, never run live" path) and what the
  first step is when a key exists.
- **Resolving or closing a challenge.** The queue accumulates; a
  "challenge addressed" record is future work, deferred until the rule
  authors' actual workflow is observed. Filing is permanent either way.
- **Editing rules from the queue.** Rule changes remain exclusively the
  existing human path: edit the framework or pack, sign off.

## 7. Requirements Index

| ID | Domain | Summary | Priority |
|---|---|---|---|
| R4-RC-1 | Rule challenges | Challenge filed from sign-off page with rule, reasoning, name, rendered verdict id | Must |
| R4-RC-2 | Rule challenges | Advisory by construction — one event, nothing else moves | Must |
| R4-RC-3 | Rule challenges | Picker offers the verdict's own rules; typed references stay unresolved | Must |
| R4-RC-4 | Rule challenges | Incomplete challenges refused, not recorded | Must |
| R4-RC-5 | Rule challenges | Queue groups challenges by rule; derived view; states advisory posture | Must |
| R4-RC-6 | Rule challenges | Offered to 2LoD whenever a verdict exists; never to 1LoD; never without a verdict | Should |
| R4-NF-1 | Non-functional | No change to engine output or determinism | Must |
| R4-NF-2 | Non-functional | Rendering writes nothing; double-click files once | Must |

## Changelog

| Date | Change |
|---|---|
| 2026-08-15 | Round 4 created and built in the same session (v0.4.0). Requirements recorded with the test ids that prove them; LLM half deferred to FN-009. |
