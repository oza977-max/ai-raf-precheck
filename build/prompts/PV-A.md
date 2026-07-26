# Chunk PV-A — Platform & Vendor Envelope Inheritance (core)

**Requirements:** PV-1, PV-2, PV-3, PV-5, PV-6, PV-8 (Round 1,
`requirements/requirements.md` §PV). PV-4 (question-budget reduction) and
PV-7 (re-evaluation on approval change) are **deferred to PV-B** — they touch
intake and lifecycle respectively and would make this chunk two changes at
once.

**Why this chunk exists:** PV is 8 Must requirements that were specified in
Round 1 and never built. `platform_satisfies` exists as a field on controls
and on the policy schema; nothing in the engine reads it. This is the
"computed but never consumed" failure class CLAUDE.md warns about, at
requirement scale.

**Why it is worth building before the server tier:** inheritance makes
verdicts *better* (fewer redundant controls, a defensible answer to "was
residency assessed?"), where the server tier makes them *shared*. A shared
wrong answer is worse than a private one.

---

## The seam already exists

`evaluate.ts` line ~133 already calls:

```ts
solvControls(tripped.map(t => t.invariantId), controls, [], policy.safety_margin)
//                                            ^^ inheritedControls — always []
```

`greedy-solver.ts` accepts `inheritedControls: string[]` and has since P3-C01.
This chunk feeds it. That is the core change; everything else is the
envelope logic that decides *what* to feed it.

## Known trap, recorded in the source

`evaluate.ts` carries this comment on `boundaryProximity`:

> NOTE: this only checks `solverResult.controls` (newly selected), not
> `inheritedControls` — harmless today because evaluate() always calls
> solvControls() with `[]` for inherited (platform inheritance isn't wired
> yet). Whichever future chunk wires real platform inheritance must extend
> this check to `selected ∪ inherited`, per the original spec intent (§4.2),
> or this will silently under-report boundary proximity.

**This chunk is that chunk.** Fix it, and add a test that fails without the
fix.

---

## Deliverables

**TDD-1: the acceptance test is the first deliverable.** A use case on a
covering platform must produce a verdict with fewer required controls than
the same use case with no platform declared, and the verdict must name what
was inherited and why.

1. **Envelope types** (`src/engine/types.ts`)
   - `PlatformEntry` / `VendorEntry`: `id`, `name`, `approved_envelope`,
     `satisfies_controls: string[]`, `coupled_clusters?: string[][]`.
   - `Envelope`: ordinal dimensions (`max_data_class`, `max_exposure`,
     `max_autonomy_level`) and set dimensions (`jurisdictions`,
     `data_zones`). Ordinal comparison uses the canonical vocabulary order,
     which must be declared explicitly — do NOT rely on array index order in
     `canonical-vocabulary.ts` being meaningful.

2. **Policy schema** (`src/store/policy.ts`): optional `platforms` and
   `vendors` arrays. Optional so every existing policy still loads — a
   breaking schema change here would invalidate the 227-test suite and the
   published demo.

3. **Graph** (`src/engine/types.ts`, `build-graph-from-form.ts`):
   `ProcessingNode.platform?: string`. `vendor` already exists.

4. **Envelope evaluation** (`src/engine/envelope.ts`, NEW — pure)
   - `fitsEnvelope(graph, envelope) → { dimension, fits }[]` — per dimension,
     never a single boolean. PV-3 is explicit that inheritance is
     per-dimension.
   - Coupled clusters: if any dimension in a cluster is exceeded, every
     control in that cluster falls away, not only the exceeded dimension's.
   - Unknown platform/vendor id → inherit nothing, and surface it (PV-5).

5. **Wire into `evaluate.ts`**
   - Resolve declared platform/vendor against the registries.
   - Compute inherited controls; pass them to `solvControls`.
   - Add a downstream review when a declared component is not on the registry
     (PV-5), naming the component explicitly.
   - Fix `boundaryProximity` to consider `selected ∪ inherited`.

6. **Inheritance chain in the verdict** (PV-6) — `EvaluationResult` gains an
   `inheritance` block: what was declared, which envelope version, which
   controls were inherited, which dimensions fell outside and were therefore
   evaluated directly. Rendered in `VerdictDisplay`.

7. **Starter registry entries** (PV-8) in `policy/appetite.yaml`: at least one
   platform that covers a sample use case, and one case that exceeds its
   envelope so the mechanics are visible without a firm building its own
   registry first.

---

## Constraints

- **Engine purity (cross-cutting §7 rule 1).** `envelope.ts` is engine code:
  stdlib and engine types only.
- **Determinism (NF-1).** Registries sorted by id before iteration.
  TC-PE-1-01 must pass untouched.
- **No existing verdict may change unless a platform is declared.** A graph
  with no `platform` and a policy with no registries must produce a
  byte-identical verdict to today. This is the safety rail — assert it.
- **`backtest-predictions.test.ts` pins 15 documented verdicts.** If any
  changes, that is a signal to investigate, not to update the expectation.
- **Verdict screen wording** must avoid "approved"/"rejected" (single-match
  `/approved|rejected/i` acceptance query). Use "cleared"/"inherited".
- **Honesty (NF-2).** Inheritance is an assertion that a platform approval
  covers something. The chain must be shown wherever inheritance reduced the
  control set — never silently.

## Review criteria (experts loaded)

- **Parnas** — information hiding: envelope logic behind one module; callers
  see `inheritedControls: string[]`, not envelope internals.
- **Fowler** — the per-dimension result is a value object, not a boolean with
  side channels.
- **Beck** — Red/Green per deliverable; acceptance test Red→Green recorded.
- **Fagan** — the boundaryProximity trap above is a known defect with a
  recorded cause; it must have a test that fails without the fix.

## Done means

227 existing tests pass unmodified · new tests for envelope fit, coupled
clusters, unknown component, inheritance chain, and boundary proximity ·
`npx tsc --noEmit` · `npm run build` · `spec-parity-check.py` · full suite ×3
· live browser walkthrough of an inheriting verdict · handover written.
