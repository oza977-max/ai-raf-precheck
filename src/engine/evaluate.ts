import {
  applyJurisdictionOverrides,
  caveatForFiredRule,
  chainEntryFor,
  evaluatePackHardLines,
  resolveActivePacks,
} from './jurisdiction';
import { evaluateHardLines } from './hard-lines';
import { fitsEnvelope, inheritableControls } from './envelope';
import { assignTrack } from './track';
import type { TrackAssignment } from './track';
import { assignTier } from './tier';
import type { TierAssignment } from './tier';
import { evaluateInvariants } from './invariants';
import type { TrippedInvariant } from './invariants';
import { buildStandingConditions } from './conditions';
import { solvControls } from './greedy-solver';
import type {
  DataFlowGraph,
  InheritanceChain,
  RegistryEntry,
  EngineError,
  EvaluationResult,
  JurisdictionPack,
  PolicyFile,
  Result,
  RuleRationale,
  TrippedInvariantDetail,
  VerdictExplanation,
} from './types';

// Rule 1 (cross-cutting.md §7): engine is a pure island — no React, no idb, no SDK.
// evaluation-engine.md §3.1 pipeline, 9 steps. Pure function: no Date.now(),
// no Math.random(), no I/O anywhere in the call graph (NF-1, §7 determinism).
export function evaluate(
  graph: DataFlowGraph,
  policy: PolicyFile,
  packs: JurisdictionPack[] = [],
): Result<EvaluationResult, EngineError> {
  const hardLines = sortedById(policy.hard_lines);
  const tracks = sortedById(policy.tracks);
  const tiers = sortedById(policy.tiers);
  const invariants = sortedById(policy.invariants);
  const controls = sortedById(policy.controls);

  // Step 1 (V2-A, real for the first time): resolve loaded packs against
  // the graph's jurisdictions. Additive third param — callers without
  // packs are byte-identical to pre-V2-A behavior.
  const activePacks = resolveActivePacks(graph.jurisdictions, policy.jurisdictions, packs);
  const packVersions = Object.fromEntries(activePacks.map((p) => [p.pack_id, p.version]));

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
        // Review finding, pass 1: the audit trail must record which pack
        // versions were in force even when a BASE hard line rejects —
        // otherwise indistinguishable from "no packs loaded".
        pack_versions: packVersions,
        explanation: {
          // Tier/track rationale honestly null — assignment was skipped,
          // the reported Critical/I are ceiling values, not assignments.
          tier_rationale: null,
          track_rationale: null,
          hard_lines_checked: hardLines.length,
          invariants_checked: 0,
          tripped_invariants: [],
          binding_reason: hardLineResult.reason,
          binding_regulatory_basis: hardLineResult.regulatoryBasis,
        },
      }),
    };
  }

  // Step 2b (V2-A): pack-level hard lines — graph-only conditions,
  // same immediate-rejection semantics as base hard lines.
  const packHardLine = evaluatePackHardLines(graph, activePacks);
  if (packHardLine) {
    const { rule } = packHardLine;
    const reason = rule.effect.type === 'hard_line' ? rule.effect.reason : '';
    const caveat = caveatForFiredRule(rule, packHardLine.pack);
    return {
      ok: true,
      value: emptyResult({
        status: 'rejected',
        tier: 'Critical',
        track: 'I',
        binding_constraint: rule.id,
        binding_path: packHardLine.graphPath,
        policy_version: policy.version,
        pack_versions: packVersions,
        confidence_caveats: caveat ? [caveat] : [],
        explanation: {
          tier_rationale: null,
          track_rationale: null,
          hard_lines_checked: hardLines.length,
          invariants_checked: 0,
          tripped_invariants: [],
          binding_reason: reason,
          binding_regulatory_basis: `${rule.source.document} ${rule.source.section}`,
          regulatory_chain: [chainEntryFor(rule, `Hard-line rejection: ${reason}`, packHardLine.pack)],
        },
      }),
    };
  }

  // Step 3: track assignment (first-match short-circuit).
  const trackResult = assignTrack(graph, tracks);
  if (!trackResult.ok) return trackResult;

  // Step 4: tier assignment (impact-dominant, all rules evaluated).
  const tierAssignment = assignTier(graph, tiers);

  // Step 5 (V2-A, real): tier floors raise (never lower), obligations
  // supplement; every fired rule lands in the regulatory chain + caveats.
  const overrides = applyJurisdictionOverrides(graph, tierAssignment.tier, trackResult.value.track, activePacks);

  // Step 6: invariant evaluation (no short-circuit — solver needs the full set).
  const tripped = evaluateInvariants(graph, invariants);

  // Step 6b (PV-A): resolve any declared platform/vendor against the
  // registries and work out what its approval already covers. Sorted by id
  // before iteration (NF-1 determinism).
  const inheritance = resolveInheritance(graph, policy);
  const inherited = inheritance?.inherited_controls ?? [];

  // Step 7: control solving. `inherited` was the parameter solvControls has
  // accepted since P3-C01 and never been given — PV-A closes that seam.
  const solverResult = solvControls(
    tripped.map((t) => t.invariantId),
    controls,
    inherited,
    policy.safety_margin,
  );

  // V1.1-C01: rationale + tripped detail — data the earlier steps already
  // computed, now carried into the verdict instead of dropped (pure
  // function of the same sorted inputs; NF-1 determinism unchanged).
  const rationales = {
    tier_rationale: tierRationale(tierAssignment),
    track_rationale: trackRationale(trackResult.value),
  };
  const checkCounts = { hard_lines_checked: hardLines.length, invariants_checked: invariants.length };
  const trippedDetails = tripped.map(toTrippedDetail);
  // The binding constraint is "the rule that determined the outcome"
  // (§3.9) — so it must be the most severe tripped invariant, not simply
  // the first by id. With a realistic multi-invariant policy the
  // sorted-first choice names an essentially arbitrary rule on the
  // headline field. Ties break by id, preserving determinism.
  const binding = mostSevere(tripped);

  // Step 8: status determination.
  if (!solverResult.ok) {
    const bindingTripped = tripped.find((t) => t.invariantId === solverResult.unsatisfiableInvariant);
    return {
      ok: true,
      value: emptyResult({
        status: 'rejected',
        tier: overrides.finalTier,
        track: overrides.finalTrack,
        binding_constraint: solverResult.unsatisfiableInvariant,
        binding_path: bindingTripped?.graphPath ?? '',
        policy_version: policy.version,
        pack_versions: packVersions,
        applied_overrides: overrides.appliedOverrides,
        confidence_caveats: overrides.caveats,
        // PV-6: the inheritance chain is part of the record of what was
        // assessed, so it survives a rejection. Dropping it here would lose
        // the answer to "was residency assessed?" for precisely the cases
        // that failed — found by driving an over-envelope case through the
        // engine, not by a unit test.
        ...(inheritance ? { inheritance } : {}),
        explanation: {
          ...rationales,
          ...checkCounts,
          tripped_invariants: trippedDetails,
          binding_reason: null,
          binding_regulatory_basis: bindingTripped?.regulatoryBasis ?? null,
          regulatory_chain: overrides.chain,
        },
      }),
    };
  }

  const status = tripped.length > 0 || overrides.addedControls.length > 0 ? 'approved_with_controls' : 'approved';

  // CS-1 margin + VD-6/CS-4 boundary proximity. Both now come from the
  // solver rather than being recomputed here.
  //
  // HR-14: the previous local computation was `some tripped invariant is
  // covered by exactly one control`. With a control library that has one
  // control per invariant — which the shipped policy does — that is true
  // whenever anything trips and false otherwise, i.e. it restated
  // `tripped.length > 0` and carried no information. It is now derived from
  // the margin the solver actually achieved against the policy's target.
  const marginAchieved = solverResult.marginAchieved;
  const boundaryProximity = tripped.length > 0 && marginAchieved < policy.safety_margin;

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
      binding_constraint: binding?.invariantId ?? '',
      binding_path: binding?.graphPath ?? '',
      // Pack-required controls supplement the solver's minimal set
      // (BC-V2A-01: obligations only ever add).
      controls: [...new Set([...solverResult.controls, ...overrides.addedControls])].sort(),
      downstream_reviews: [
        ...new Set([...overrides.addedReviews, ...unapprovedComponentReviews(inheritance)]),
      ].sort(),
      ...(inheritance ? { inheritance } : {}),
      // VD-7 (V1.2-B): the hypothesis this approval is conditional on —
      // statically populated from kri_thresholds + graph pins. Rejection
      // paths keep hypotheses empty (nothing was approved to condition).
      conditions: { hypotheses: buildStandingConditions(graph, policy, overrides.finalTier) },
      policy_version: policy.version,
      pack_versions: packVersions,
      applied_overrides: overrides.appliedOverrides,
      confidence_caveats: overrides.caveats,
      boundary_proximity: boundaryProximity,
      // CS-1: the achieved margin is reported, not just whether it was met.
      // With no alternative controls in the library this is 0 — which is the
      // honest answer, and the reason CS-1 is not yet satisfiable by content.
      margin_achieved: marginAchieved,
      margin_target: policy.safety_margin,
      single_covered_invariants: solverResult.singleCovered,
      explanation: {
        ...rationales,
        ...checkCounts,
        tripped_invariants: trippedDetails,
        binding_reason: null,
        binding_regulatory_basis: binding?.regulatoryBasis ?? null,
        regulatory_chain: overrides.chain,
      },
    }),
  };
}

// PV-1/2/3/5/6. Pure: registries sorted by id, no I/O.
//
// Code review 001, C-3 and C-4. Two defects lived here:
//   C-3: `resolved` was `entries.length > 0` — true if EITHER component
//        matched, so an approved platform masked an unapproved vendor and
//        no unapproved-component review fired. PV-5 exists to prevent that.
//   C-4: the guards mixed a pre-lookup id (`platformId`) with a post-lookup
//        object (`vendor`), so a declared-but-unrecognised vendor returned
//        undefined and the caller never learned a vendor had been declared.
// Each declared component is now resolved and reported independently.
function resolveInheritance(graph: DataFlowGraph, policy: PolicyFile): InheritanceChain | undefined {
  const platformId = graph.processing_nodes.find((n) => n.platform)?.platform;
  const vendorId = graph.processing_nodes.find((n) => n.vendor)?.vendor;

  const platforms = sortedById(policy.platforms ?? []);
  const vendors = sortedById(policy.vendors ?? []);

  const platform = platformId ? platforms.find((p) => p.id === platformId) : undefined;
  const vendor = vendorId ? vendors.find((v) => v.id === vendorId) : undefined;

  // A bare `vendor: 'internal'` string on a policy with no vendor registry is
  // not a claim of approval — no chain is fabricated. But once a registry
  // EXISTS, a declared id that is absent from it is a real PV-5 finding and
  // must be reported rather than silently dropped.
  // `vendor` is NOT user input: build-graph-from-form.ts hardcodes
  // 'internal' and the intake form never asks for a vendor. So 'internal' is
  // a sentinel meaning "no third-party vendor", not a registry claim —
  // treating it as one would flag every use case submitted through the app
  // as using an unapproved vendor. Any OTHER value (e.g. the self-assessment
  // graph's 'Anthropic') is a real claim and is checked.
  const VENDOR_SENTINEL = 'internal';
  const platformIsClaim = platformId !== undefined;
  const vendorIsClaim = vendorId !== undefined && vendorId !== VENDOR_SENTINEL && vendors.length > 0;
  if (!platformIsClaim && !vendorIsClaim) return undefined;

  const entries: RegistryEntry[] = [platform, vendor].filter((e): e is RegistryEntry => e !== undefined);

  const dimensions = entries.flatMap((e) => fitsEnvelope(graph, e.approved_envelope));
  const inheritedControls = [
    ...new Set(
      entries.flatMap((e) =>
        inheritableControls(e.satisfies_controls, fitsEnvelope(graph, e.approved_envelope), e.coupled_clusters),
      ),
    ),
  ].sort();

  // Per-component resolution. `resolved` now means "every component that was
  // claimed resolved", so it can no longer be true while something declared
  // sits unrecognised.
  const unresolved: string[] = [];
  if (platformIsClaim && !platform) unresolved.push(platformId!);
  if (vendorIsClaim && !vendor) unresolved.push(vendorId!);

  return {
    ...(platformIsClaim ? { declared_platform: platformId } : {}),
    ...(vendorIsClaim ? { declared_vendor: vendorId } : {}),
    resolved: unresolved.length === 0,
    unresolved_components: unresolved.sort(),
    inherited_controls: inheritedControls,
    dimensions,
  };
}

// PV-5: name every unapproved component, not merely report that something
// was unapproved.
function unapprovedComponentReviews(inheritance: InheritanceChain | undefined): string[] {
  if (!inheritance || inheritance.unresolved_components.length === 0) return [];
  return inheritance.unresolved_components.map(
    (name) => `Full vendor/platform risk assessment required — ${name} is not on the approved registry`,
  );
}

function tierRationale(assignment: TierAssignment): RuleRationale {
  return {
    rule_id: assignment.triggeringRuleId,
    ...(assignment.triggeringField ? { matched_field: assignment.triggeringField } : {}),
    ...(assignment.triggeringRegulatoryBasis ? { regulatory_basis: assignment.triggeringRegulatoryBasis } : {}),
  };
}

function trackRationale(assignment: TrackAssignment): RuleRationale {
  return {
    rule_id: assignment.ruleId,
    rule_name: assignment.ruleName,
    ...(assignment.regulatoryBasis ? { regulatory_basis: assignment.regulatoryBasis } : {}),
  };
}

const SEVERITY_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

// Highest severity wins; ties break by id so the choice stays deterministic
// regardless of policy ordering (NF-1).
function mostSevere(tripped: TrippedInvariant[]): TrippedInvariant | undefined {
  return [...tripped].sort((a, b) => {
    const rank = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
    return rank !== 0 ? rank : a.invariantId.localeCompare(b.invariantId);
  })[0];
}

function toTrippedDetail(t: TrippedInvariant): TrippedInvariantDetail {
  return {
    id: t.invariantId,
    description: t.description,
    severity: t.severity,
    required_controls: t.requiredControls,
    graph_path: t.graphPath,
    ...(t.regulatoryBasis ? { regulatory_basis: t.regulatoryBasis } : {}),
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
    margin_achieved: 1,
    margin_target: 0,
    single_covered_invariants: [],
    explanation: emptyExplanation(),
    ...overrides,
  };
}

function emptyExplanation(): VerdictExplanation {
  return {
    tier_rationale: null,
    track_rationale: null,
    hard_lines_checked: 0,
    invariants_checked: 0,
    tripped_invariants: [],
    binding_reason: null,
    binding_regulatory_basis: null,
  };
}
