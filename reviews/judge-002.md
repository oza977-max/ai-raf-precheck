---
schema_version: 0
---

# Judge Experiment 002 — reason-first rerun (FN-011)

**Date:** 2026-08-31. **Model:** `qwen3:4b` (Q4_K_M, via Ollama, local, no
data leaves the machine). **Raised by:** FN-011 (`specs/forward-notes.md`)
— judge-001 scored 1/11 with the reasoning right in 10/11, diagnosed as a
field-order artifact under forced structured decoding (`prediction` decoded
before `reason`). This is the named rerun with `reason` decoded first.

## Protocol

Same eleven graph fixtures as judge-001, from `src/engine/try-these.test.ts`
/ `docs/try-these.md` (case 5 as two sub-cases, 5a/5b). Re-verified against
the CURRENT policy (v1.4, up from v1.3 at judge-001's time) by running
`npm test -- src/engine/try-these.test.ts` before this experiment — clean,
so the eleven engine-verified statuses are unchanged by the three invariants
added since judge-001 (none of the eleven cases touch the new
`system_access_scope`/`multi_instance_coordination` fields).

Condensed rulebook summary rewritten from scratch against the current
policy (`scripts/judge-002-rulebook-summary.txt`, ~110 lines — shorter than
judge-001's ~150 despite v1.4 having 3 more invariants, because this
version lists each invariant's trigger in one line rather than the fuller
prose judge-001 used; a real difference in prompt content, noted honestly
as a variable this rerun did not hold constant). Same delivery mechanism as
judge-001: `POST /api/chat`, `/no_think`, `think:false`, `temperature:0`,
sequential calls.

**The one deliberate change:** JSON schema field order. judge-001:
`{prediction, reason}`. judge-002: `{reason, prediction}`.

**An undeliberate second variable, found and reported honestly:**
`num_predict` had to be raised from judge-001's 512 to 1536 after the first
pass at 512 produced two `Unterminated string` JSON parse failures — the
reasoning is far longer when it decodes first, and the original budget
that was enough for a short post-hoc `reason` was not enough for a genuine
pre-hoc walkthrough. Both budgets are reported below; the finding at 1536
is the one to trust more, but neither isolates field-order as the sole
variable — a limitation of this rerun, not swept under the rug.

Script: `scripts/judge-002.mjs`. Raw results: `scripts/judge-002-results.json`
(not committed — regenerable by rerunning the script against a running
Ollama instance with `qwen3:4b` pulled).

## Results

| Case | Engine status | Judge (512 tokens) | Judge (1536 tokens) | Agree (1536)? |
|---|---|---|---|---|
| 1 | inside | inside | inside | **yes** |
| 2 | outside | outside | outside | **yes** |
| 3 | outside | inside_with_controls | inside_with_controls | no |
| 4 | outside | outside | outside | **yes** |
| 5a | outside | outside | outside | **yes** |
| 5b | outside | outside | outside | **yes** |
| 6 | inside_with_controls | inside | inside | no |
| 7 | inside_with_controls | ERROR (unterminated JSON) | ERROR (unterminated JSON) | no |
| 8 | inside_with_controls | ERROR (unterminated JSON) | ERROR (unterminated JSON) | no |
| 9 | inside_with_controls | inside | inside | no |
| 10 | inside_with_controls | inside | inside | no |

**Concordance: 5/11 (45%) at both token budgets** — unchanged by the 3x
budget increase, which only changed *how long* cases 7 and 8 took to
exhaust their budget (19s → 54s), not whether they exhausted it.

Up from judge-001's 1/11 (9%). The field-order hypothesis is confirmed
directionally — moving `reason` first more than quadrupled concordance —
but it is not a full fix, and the failure mode changed shape rather than
disappearing.

## Disagreement analysis

**Cases 2, 4, 5a, 5b (all correct, both budgets):** these are all hard-line
REJECT cases where the FIRST hard line checked in order either matches
immediately or fails on one clause. The model's `reason` field for these is
a full, correctly-ordered walkthrough of each hard line with its own
sub-conditions checked explicitly, arriving at the right answer with
visible work. Read in isolation, these four reasoning traces are
indistinguishable from a careful human's.

**Cases 3, 6, 9, 10 (wrong, both budgets) and 1 (right, but same shape):**
an unexplained and unanticipated pattern, distinct from judge-001's finding.
These are the five cases where NO hard line matches — the model must
therefore reason through all five hard lines as failures, then tier, then
track, then scan up to 21 invariants for matches, a substantially longer
chain than the "hard line fires early" cases above. In every one of these
five, the `reason` field is a single introductory sentence
("Let's go through the four steps for this use case: ...") with no
step-by-step content at all, yet the response is syntactically valid JSON
with a `prediction` value. This did not change between 512 and 1536 tokens
— case 1 (correct) and case 6 (incorrect) show the identical truncated-reason
shape, so the short reasoning is not itself proof of a wrong answer, but it
is consistently proof of NO visible reasoning, correct or not.

**This experiment did not determine why.** Two candidate explanations, both
unverified: (a) the model itself chooses to stop elaborating once it has
enough to name a prediction on the "no hard line matched" path specifically,
independent of budget; (b) Ollama's schema-constrained decoder, given
`required: [reason, prediction]`, may reserve budget to guarantee a valid
`prediction` field exists and truncates `reason` early on generation paths
it predicts will run long — which would make the visible reasoning length a
decoder artifact, not a model behaviour, on exactly the cases where it would
matter most for trust. Distinguishing these needs an experiment this one
was not designed for (e.g. an unconstrained free-text call on the same
cases, compared token-for-token). Recorded here as the honest next
question, not resolved.

**Cases 7 and 8 (unrecoverable at both budgets):** these are the two
platform-inheritance cases — reasoning about whether a platform is or is
not on the approved list, and what that does or does not carry over,
appears to be the single most token-expensive reasoning path in this
rulebook for this model. Both ran to the full budget without closing the
JSON object. No prediction was recoverable at either 512 or 1536 tokens.

## What this does and does not show

**What it shows:** FN-011's field-order hypothesis was directionally
correct and substantial — 1/11 to 5/11 is not noise — but "swap the field
order" alone is not sufficient to make this schema reliable. A second,
previously undocumented failure mode appeared exactly on the cases the
field-order fix was supposed to help most (the ones needing genuine
multi-step reasoning, not a quick hard-line hit), and it is not resolved by
more tokens.

**What it does not show:** the same four caveats judge-001 named still
apply unchanged (not a rulebook-correctness measure; not comparable to the
human oracle rounds; one model, one prompt, one schema, still upstream of
FN-009's actual panel design). Additionally: this rerun changed the
rulebook-summary prose alongside the schema (noted above, not held
constant), so even the 1/11→5/11 delta cannot be attributed to field order
with full isolation — a stricter follow-up would hold the summary
byte-identical and only change field order.

## Bottom line for whoever picks up FN-009 next

Reason-first is a real, worthwhile improvement (do it) but not sufficient
on its own. Before building any panel UI on `qwen3:4b`: (1) investigate
whether the reason-truncation-on-no-hard-line-match pattern is a decoder
artifact or a model behaviour — this determines whether more budget, a
different schema shape (e.g. two calls: free reasoning, then a separate
constrained-choice call, exactly as judge-001 already suggested), or a
different model is the right next lever; (2) rerun holding the rulebook
summary byte-identical to isolate field order cleanly; (3) cases 7/8's
platform-inheritance reasoning being the most expensive path in this
rulebook, for this model, at any budget tested, is itself worth a note if
platform inheritance ever becomes judge-relevant UI. FN-011 is closed by
this rerun in the sense that the named experiment ran; it is not closed in
the sense of "the panel can now be built" — a new, more specific question
replaces the old one.
