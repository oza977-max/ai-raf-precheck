---
name: gvm-graph
description: GVM lifecycle sub-skill — run a WIDE GVM phase as a fan-out/verify/merge agent graph. Fires ONLY when explicitly invoked (/gvm-graph) or when executing a GVM phase that is wide by nature: site-survey, review panels/deliberations, requirements or test-case health sweeps, backtest/oracle rounds, init reference-library gap scans. NEVER fires on generic "review/research" requests, on build chunks, or on the verification ritual.
---

# GVM Graph — the fan-out engine for wide GVM phases

This is not a new GVM phase. It is the execution engine for phases the
methodology already defines as parallel: several independent units of work
whose results a chair reconciles. It runs them as a graph (fan out → reduce
→ verify → synthesize) instead of a sequential chain.

## Where this fits in the GVM lifecycle — and where it must not run

RUN AS A GRAPH (units are independent; fake-edge test passes):

| Phase | Fan-out unit | Anchor for verification |
|---|---|---|
| init reference-library check | one agent per domain/reference file | the file exists and names its authorities |
| site-survey | one agent per module/directory | code as it is on disk |
| requirements / test-case health sweep | one agent per requirement or TC cross-check | the paired artifact it must trace to |
| review panels & deliberations | one panel per lens (e.g. Cooper / Krug / Fogg / Few), fresh context each | each panel cites file:line or spec section |
| backtest / oracle rounds | one agent per use case | engine-computed verdicts (pinned by tests) |

NEVER AS A GRAPH:

- **Build chunks.** The walking-skeleton discipline is sequential by design;
  each chunk consumes the previous handover. Real edges everywhere — no graph.
- **The verification ritual.** Fixed gates in fixed order (tests ×3,
  typecheck, build, parity script, live walkthrough). Do not parallelize.
- **Chairing, reconciliation, requirements synthesis.** Judgment work,
  main-loop model, single context.

Before running: apply the fake-edge test. If any unit consumes another
unit's output, it is not a fan-out unit — sequence those two.

## Model routing (per the Operating Regime — always set `model:` explicitly)

- Workers and review panels: **Sonnet-class**.
- Mechanical transforms (format conversion, file scans): **Haiku-class**.
- Reduce step: **a local script, zero model tokens** — schema validation,
  dedupe, counting, merging JSON. If a script can do it, no model is called.
- Chair / synthesis: **main-loop model**, once, at the end.

## The run

1. **Contract per node.** One bounded job; JSON output shape
   `{finding, evidence, source, confidence}`. Evidence fits the domain:
   file:line for code, spec section for docs, engine verdict for backtest,
   URL+date for external claims.
2. **Cap and preview.** Default cap 20 units. Tell the owner the approximate
   total agent count (workers + batched verifiers + 1 chair) before running.
3. **Fan out** in parallel. Only file-writing nodes need isolated worktrees;
   read-only panels do not. Retry a failed node once, then count it missing.
4. **Reduce with a script.** Then, only if semantic merging is needed, one
   batched model pass — batch by token budget, never raw pile into one context.
5. **Verify with fresh context.** Checkers never see worker transcripts —
   pass only the finding and its cited evidence. Batch ~5 findings per
   checker. Outcomes: confirmed / disproven (drop) / unverifiable (keep,
   flagged). Prefer anchors that cannot argue back: tests that ran, the
   engine's own verdicts, files as they exist on disk.
6. **Fan-in guard.** Schema-invalid, errored, or timed-out nodes count as
   missing. Report "N of M returned nothing" and the unverifiable count in
   the artifact — never present a partial sweep as complete.
7. **Synthesize.** One chair writes a single artifact, findings ranked:
   independently confirmed > plausible-unverified > single-source.

## Audit trail (per the Operating Regime)

The output is a repo artifact, not a chat answer. Save it to the phase's
folder (site-survey/, reviews/, scoring-reports/, test-cases/ …) with a
provenance header: which round, which phase, node/verifier counts, missing
and unverifiable counts, models used. Run the confidentiality check before
any commit. The owner is the human gate: nothing ships, publishes, or
changes policy/specs from a graph run without their explicit yes.

## Honesty check

A run where the verifiers dropped nothing and independently confirmed
nothing is suspect — say so in the artifact rather than presenting green
lights. Never weaken a verification rule to make a run pass.
