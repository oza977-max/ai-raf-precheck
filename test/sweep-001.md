# Sweep 001 — 15 use cases across business domains (2026-08-16)

**What ran:** 15 street-generic AI use case descriptions — Risk (2), Global
Markets (3), Finance (3), Operations (2), IT (2), HR (1), Compliance (1),
Client-facing (1) — through the REAL extraction pipeline (qwen3:4b via
Ollama, the app's exact prompt, schema, and quote verification, v0.7.1),
then every resulting graph through the REAL engine with the starter policy
and packs. No mocks anywhere. Harness: a scratchpad script plus a temporary
(uncommitted, since deleted) vitest file.

## Headline results

- **15/15 extracted without error** (16–23s each on an 8GB M2) and
  **15/15 produced engine verdicts without error.**
- **Tiering is directionally sane across domains**: trading cases landed
  Critical; PII + automation cases (email routing, KYC extraction, CV
  screening) landed High; internal read-only assistants landed Low. No
  case produced an absurd tier.
- **Quote verification: 110 verified / 55 guessed (67%) across 165
  decision-bearing fields.** Precise descriptions verified 9–11 fields;
  vague ones verified 2–4 and would cost the submitter 7–9 targeted
  questions — the intended incentive.
- Every verdict was Provisional (`no_regulatory_basis` / unadopted rules) —
  correct for the shipped unadopted state.

## The case that matters most: gm-3 (autonomous FX agent)

The description said an agent "executes small FX trades on its own …
with no human approving each trade". The model **softened it**: model_type
`traditional-ml` (not `agentic`), autonomy **L1** (human approves each
action!), `non-binding`. The engine, fed that graph, said Critical
approved-with-controls — where the correctly-read graph should hit the
autonomous-trading hard lines.

**Why this is a system pass, not a failure:** every one of those softened
fields FAILED quote verification (8 of 11 guessed) — so in the app they
cannot be one-click confirmed and become mandatory questions, where the
plain-English options ("It acts on its own with no human checkpoint (level
4)") make the honest answer easy. The plausibility warning for
autonomous-wording-vs-low-autonomy also fires. The safety chain
(quote check → no plain confirm → forced question → answer writes back)
is what stands between a soft misread and a wrong verdict. A frontier
model would misread less; the chain is what makes the small model usable.

## Systematic findings → fixes applied in this commit

1. **Vendor-hosted work read as Zone C.** gm-1/ops-2/hr-1 described
   external vendors under contract; zones came back C (the earlier Zone C
   guidance overcorrected the original Zone A bias). Prompt now states:
   vendor/cloud-hosted — even approved, under contract — is Zone B.
   Post-fix rerun: gm-1 and hr-1 moved to Zone B (ops-2 still C — its
   guessed zone goes to questions).
2. **"Jurisdictions" read as business areas.** Every case emitted junk
   ("internal", "finance", "public", "HR Vendor System") — all caught by
   the R5 filter, but noisy. Prompt now defines jurisdictions as countries/
   regions only, empty list when unstated. Post-fix rerun: junk gone.
3. **Empty-string jurisdictions** (post-fix models emit `[""]`) are now
   dropped silently — nothing was claimed, so nothing is reported.

## Recorded, not fixed (candidate R7 material)

- **Hallucinated VALID jurisdiction:** one rerun emitted `US` unprompted —
  a recognised code, so it would activate the US pack. It is visible at
  the confirmation step ("JURISDICTIONS: US") but nothing forces the
  submitter to confirm it on the LLM path (the form path asks explicitly,
  R3-JU). Candidate requirement: jurisdiction confirmation on the LLM path.
- **Enum-forcing artifacts persist on odd outputs**: the public-website
  chatbot's answers were forced to action_type `trade` (wrong-but-valid);
  a regulatory-return drafter came back `agentic`/`approve` (over-read,
  conservative direction). Both surfaced as guessed/questionable in the
  flow; neither crashed anything.
- Severity softening on autonomy (gm-3 above) is the known small-model
  weakness; mitigated by the chain, properly solved by a stronger model
  (Bedrock path, design-vision).

Raw artifacts (scratchpad, not committed): sweep-results.json,
sweep-verdicts.json, sweep-results-2.json.
