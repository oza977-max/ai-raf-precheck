import { applyJurisdictionOverrides, resolveActivePacks } from './jurisdiction';
import { evaluateHardLines } from './hard-lines';
import { assignTrack } from './track';
import { assignTier } from './tier';
import { evaluateInvariants } from './invariants';
import { solvControls } from './greedy-solver';
import type { DataFlowGraph, EngineError, EvaluationResult, PolicyFile, Result } from './types';

// Rule 1 (cross-cutting.md §7): engine is a pure island — no React, no idb, no SDK.
// evaluation-engine.md §3.1 pipeline, 9 steps. Pure function: no Date.now(),
// no Math.random(), no I/O anywhere in the call graph (NF-1, §7 determinism).
export function evaluate(graph: DataFlowGraph, policy: PolicyFile): Result<EvaluationResult, EngineError> {
  const hardLines = sortedById(policy.hard_lines);
  const tracks = sortedById(policy.tracks);
  const tiers = sortedById(policy.tiers);
  const invariants = sortedById(policy.invariants);
  const controls = sortedById(policy.controls);

  // Step 1: jurisdiction pack resolution (pass-through until pack-loading lands).
  resolveActivePacks(graph.jurisdictions, policy.jurisdictions);

  // Step 2: hard lines — first trip is immediate rejection, no further steps.
  const hardLineResult = evaluateHardLines(graph, hardLines);
  if (hardLineResult.tripped) {
    // Spec (§3.3) doesn't assign tier/track on a hard-line rejection — no
    // control set can bring the use case into appetite regardless of tier,
    // so tier/track assignment is skipped entirely (§3.1 step order). Report
    // the ceiling values (Critical/I) since a hard-line trip is definitionally
    // the most severe outcome; downstream consumers should key off `status`
    // and `binding_constraint`, not tier/track, for hard-line rejections.
    return {
      ok: true,
      value: emptyResult({
        status: 'rejected',
        tier: 'Critical',
        track: 'I',
        binding_constraint: hardLineResult.hardLineId,
        binding_path: hardLineResult.graphPath,
        policy_version: policy.version,
      }),
    };
  }

  // Step 3: track assignment (first-match short-circuit).
  const trackResult = assignTrack(graph, tracks);
  if (!trackResult.ok) return trackResult;

  // Step 4: tier assignment (impact-dominant, all rules evaluated).
  const tierAssignment = assignTier(graph, tiers);

  // Step 5: jurisdiction overrides (pass-through stub).
  const overrides = applyJurisdictionOverrides(trackResult.value.track, tierAssignment.tier);

  // Step 6: invariant evaluation (no short-circuit — solver needs the full set).
  const tripped = evaluateInvariants(graph, invariants);

  // Step 7: control solving.
  const solverResult = solvControls(
    tripped.map((t) => t.invariantId),
    controls,
    [],
    policy.safety_margin,
  );

  // Step 8: status determination.
  if (!solverResult.ok) {
    return {
      ok: true,
      value: emptyResult({
        status: 'rejected',
        tier: overrides.finalTier,
        track: overrides.finalTrack,
        binding_constraint: solverResult.unsatisfiableInvariant,
        binding_path: tripped.find((t) => t.invariantId === solverResult.unsatisfiableInvariant)?.graphPath ?? '',
        policy_version: policy.version,
        applied_overrides: overrides.appliedOverrides,
      }),
    };
  }

  const status = tripped.length > 0 ? 'approved_with_controls' : 'approved';

  // boundary_proximity (VD-6/CS-4, §4.2 MVP flag — judgment call, see
  // build/prompts/P3-C02.md deliverable 2): true when at least one tripped
  // invariant is covered by exactly one control in the selected set (zero
  // redundant coverage — the minimum possible margin above the appetite
  // boundary). Computed here, not inside the solver, to keep SolverResult's
  // locked P3-C01 contract unchanged.
  // NOTE: this only checks `solverResult.controls` (newly selected), not
  // `inheritedControls` — harmless today because evaluate() always calls
  // solvControls() with `[]` for inherited (platform inheritance isn't
  // wired yet). Whichever future chunk wires real platform inheritance
  // must extend this check to `selected ∪ inherited`, per the original
  // spec intent (§4.2), or this will silently under-report boundary
  // proximity for invariants covered by an inherited control.
  const boundaryProximity =
    tripped.length > 0 &&
    tripped.some(
      (t) => controls.filter((c) => solverResult.controls.includes(c.id) && c.resolves.includes(t.invariantId)).length === 1,
    );

  // Step 9: verdict assembly (pure — no identity/time fields).
  // binding_constraint names "the rule/invariant that determined the
  // outcome" (§3.9) — on a clean approved verdict, nothing tripped, so
  // there is no constraint to name. Leaving it empty avoids misleadingly
  // implying the matched track rule "bound" the outcome in the audit trail.
  return {
    ok: true,
    value: emptyResult({
      status,
      tier: overrides.finalTier,
      track: overrides.finalTrack,
      binding_constraint: tripped[0]?.invariantId ?? '',
      binding_path: tripped[0]?.graphPath ?? '',
      controls: solverResult.controls,
      policy_version: policy.version,
      applied_overrides: overrides.appliedOverrides,
      boundary_proximity: boundaryProximity,
    }),
  };
}

function sortedById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

function emptyResult(overrides: Partial<EvaluationResult>): EvaluationResult {
  return {
    status: 'approved',
    tier: 'Low',
    track: 'III',
    binding_constraint: '',
    binding_path: '',
    controls: [],
    downstream_reviews: [],
    conditions: { hypotheses: [] },
    policy_version: '',
    pack_versions: {},
    applied_overrides: [],
    confidence_caveats: [],
    boundary_proximity: false,
    ...overrides,
  };
}
