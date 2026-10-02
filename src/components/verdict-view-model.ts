// R16 chunk D1 (build/prompts/R16.md v2.1, §4.1). THE one computation behind
// the verdict's first screen. Pure — no React, no store calls (cross-
// cutting.md §7, principle 0.7) — so it can be unit-tested on its own and
// shared by every reader that needs a safeguard's status or plain-language
// text: the new first screen, and the existing WhatToDo, SignOffChecklist
// and evidence-panel (principle 0.5, "one computation per fact").
//
// Everything this module renders is checked against §0.1's no-bare-code
// rule: a control/review id that cannot be resolved against the loaded
// policy NEVER reaches its output as the id itself — see the "Safeguard {n}"
// and pack-review fallbacks below.
import type { Control, DataFlowGraph, DownstreamReviewRule, Exposure, PolicyFile, TrippedInvariantDetail, DataZone } from '../engine/types';
import type { Verdict } from '../types/verdict';
import type { LifecycleStage } from '../store/types';
import { isVerdictProvisional, type ProvisionalReason } from '../engine/provisional';
import { maxBy } from '../engine/envelope';

export type SafeguardStatus = 'verified' | 'attested' | 'outstanding' | 'unknown';

export interface CoveredReview {
  plainName: string;
  /** The formal review text (`DownstreamReviewSource.review`) — kept
   *  alongside the plain name so the reviewer-section readers (WhatToDo),
   *  which show formal language unchanged, and the first screen, which
   *  shows only plain language, can each use the form they need from this
   *  one computation. */
  formalName: string;
  baseId: string;
}

export interface SafeguardView {
  id: string;
  status: SafeguardStatus;
  /** What must be in place — §4.4 fallback chain applied; never a bare code. */
  plainAction: string;
  /** Who usually arranges it, fully resolved (tokens, register override, partner). Empty string when nothing could be resolved at all (no policy, control unknown). */
  ownerText: string;
  yours: boolean;
  /** Why it applies to this case, from its tripped invariants, de-duplicated. */
  plainReasons: string[];
  /** Reviews on this verdict this safeguard's own action also satisfies. */
  coveredReviews: CoveredReview[];
  /** W-6 (R16-W §5, D-76): ONE grammatical sentence covering every review in
   *  `coveredReviews` — "(Doing this also completes {list} — one piece of
   *  work.)" — undefined when there is nothing covered. Computed here, not
   *  per-review at render time, so a safeguard covering two reviews prints
   *  one note, not two. */
  alsoCompletesNote?: string;
  attestedByName?: string;
  evidenceNote?: string;
  /** W-7 (R16-W §5, D-77): set only when the policy's verification_evidence
   *  is `status: 'verified'` but scoped (`applies_to`) away from this
   *  graph's platform/vendor, or the graph is unavailable to check against
   *  — the reason the evidence panel shows instead of the detail line.
   *  Undefined when evidence applies normally (unscoped) or there is no
   *  verified evidence to begin with. */
  evidenceScopeNote?: string;
}

export interface OwedReviewView {
  plainName: string;
  ownerText: string;
  baseId: string;
}

export interface VerdictView {
  isRejected: boolean;
  needsSignOff: boolean;
  headline: string;
  /** At most two distinct plain reasons, binding constraint first. */
  whyReasons: string[];
  /** True when more than two distinct reasons exist — render the "(Each safeguard below gives its own reason.)" note. */
  whyHasMore: boolean;
  nextSteps: string[];
  /** Every safeguard (verdict.controls order) — for readers that need the full set (WhatToDo, SignOffChecklist, the evidence panel). */
  safeguards: SafeguardView[];
  /** Outstanding (neither verified nor attested), yours-first — §4.2 item 4. */
  outstandingSafeguards: SafeguardView[];
  inPlaceSafeguards: SafeguardView[];
  attestedSafeguards: SafeguardView[];
  /** Count of outstanding safeguards — "neither machine-verified nor attested" (§4.2 item 1). */
  outstandingCount: number;
  /** Reviews not covered by any safeguard on this verdict, de-duplicated by plain name (D-04). */
  owedReviews: OwedReviewView[];
  /** Formal review strings (verdict.downstream_reviews entries) that are
   *  fully covered by a safeguard on this verdict — the one computation
   *  behind WhatToDo's "separate reviews" filter, replacing
   *  describesSameObligation's text heuristic with the real covers_reviews
   *  mechanism while keeping WhatToDo's own display vocabulary (formal
   *  names) unchanged. Always empty for a legacy verdict with no
   *  downstream_review_sources (§4.4 — nothing folded away). */
  coveredReviewFormalNames: string[];
  whoSignsOff: string;
  /** Shown when isVerdictProvisional(verdict), plus the independent RA-11 medium-caveat line. Empty when neither applies. */
  couldStillChange: string[];
}

export type ControlOwnership = Record<string, { owner_name: string; target_date: string }>;
export type ControlAttestations = Record<string, { attested_by_name: string; evidence_note: string }>;

// ---------------------------------------------------------------------------
// §4.4 fallback pointer lines — reused across controls, invariants and firm
// reviews. Two distinct wordings, exactly as specified: "what this means for
// you" for a field that's merely absent, "what this involves" for a control
// id the policy doesn't even recognise.
const POINTER_MEANS_FOR_YOU = 'Ask your AI risk team what this means for you.';
const POINTER_INVOLVES = 'Ask your AI risk team what this involves.';

// §1.2 placeholder resolution. `{audience}` from the widest exposure across
// the graph's output nodes; `{destination}` from the least-controlled
// processing zone (A is least controlled, "stricter always means the
// earlier letter"). These rank tables mirror engine/envelope.ts's own
// (unexported) exposure ranking and the engine's A>B>C zone-strictness
// convention — duplicated here only as static ordering tables, not as a
// second computation of any verdict fact; `maxBy` itself is imported, not
// reimplemented (§1.5).
const AUDIENCE_LABELS: Record<Exposure, string> = {
  'client-facing': 'clients',
  'market-facing': 'the public or the market',
  'internal-shared': 'other teams',
  'internal-only': 'your team',
};
const EXPOSURE_WIDENESS: Record<Exposure, number> = {
  'internal-only': 0,
  'internal-shared': 1,
  'client-facing': 2,
  'market-facing': 3,
};
const DESTINATION_LABELS: Record<DataZone, string> = {
  'Zone A': 'an outside website or service',
  'Zone B': "the supplier's systems, which are outside your firm's own",
  'Zone C': "your firm's own systems",
};
const ZONE_LEAST_CONTROLLED: Record<DataZone, number> = { 'Zone A': 2, 'Zone B': 1, 'Zone C': 0 };

// Mirrors evaluate.ts's own (unexported) `VENDOR_SENTINEL` — 'internal' means
// "no third-party vendor", never a registry claim. Duplicated as a literal
// because src/engine/* cannot be edited by this chunk; it is a sentinel
// value, not logic.
const VENDOR_SENTINEL_INTERNAL = 'internal';

// When the graph is not available (a case reopened from the register, where
// the graph is deliberately not persisted), the placeholders must not fall back
// to the most reassuring value — "your team", "your firm's own systems" — which
// would state something false in the reason for a rule that only fires on wider
// exposure or an outside zone. These neutral phrasings are true for every rule
// that uses the placeholder: {audience} appears only in rules conditioned on
// client- or market-facing exposure, {destination} only in rules conditioned on
// Zone A or Zone B.
const AUDIENCE_UNKNOWN = 'clients or the public';
const DESTINATION_UNKNOWN = "a system outside your firm's own";

function resolveAudience(graph: DataFlowGraph | undefined): string {
  const exposures = graph?.output_nodes.map((n) => n.exposure) ?? [];
  const widest = maxBy(exposures, EXPOSURE_WIDENESS);
  return widest ? AUDIENCE_LABELS[widest] : AUDIENCE_UNKNOWN;
}

function resolveDestination(graph: DataFlowGraph | undefined): string {
  // Every node's zone, not just the processing nodes': the data rules match a
  // zone on ANY node (condition.ts any-node semantics), so the reason must name
  // the least-controlled zone anywhere in the flow, or it can contradict the
  // rule it explains.
  const zones = graph ? [...graph.input_nodes, ...graph.processing_nodes].map((n) => n.data_zone) : [];
  const least = maxBy(zones, ZONE_LEAST_CONTROLLED);
  return least ? DESTINATION_LABELS[least] : DESTINATION_UNKNOWN;
}

function fillPlaceholders(text: string, graph: DataFlowGraph | undefined): string {
  return text.replaceAll('{audience}', resolveAudience(graph)).replaceAll('{destination}', resolveDestination(graph));
}

// ---------------------------------------------------------------------------
// Plain reason for one tripped invariant — §4.4: "invariant without
// plain_reason → its description + the pointer line." The fallback base text
// is the invariant's description AS CAPTURED ON THE VERDICT (`t.description`)
// rather than re-read from today's policy, because the verdict is the record
// of what was actually decided; only the plain_reason lookup itself needs
// today's policy (plain-language text is presentation, re-editable later).
function invariantPlainReason(t: TrippedInvariantDetail, policy: PolicyFile | undefined, graph: DataFlowGraph | undefined): string {
  const plain = policy?.invariants.find((i) => i.id === t.id)?.plain_reason;
  if (plain) return fillPlaceholders(plain, graph);
  return `${t.description} ${POINTER_MEANS_FOR_YOU}`;
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Safeguard (control) display resolution.

/** §4.4: control without plain_action → formal name + description + pointer;
 *  control id not in the loaded policy, or no policy loaded → "Safeguard
 *  {n}" + the "involves" pointer — NEVER the bare code. `n` is the control's
 *  1-based position in `verdict.controls` (deterministic, already sorted by
 *  id per NF-1) — not a position among only the unresolved ones, so it stays
 *  stable as a cross-reference however many other controls resolve. */
function safeguardPlainAction(control: Control | undefined, position: number): string {
  if (!control) return `Safeguard ${position + 1}. ${POINTER_INVOLVES}`;
  if (control.plain_action) return control.plain_action;
  return `${control.name} — ${control.description} ${POINTER_MEANS_FOR_YOU}`;
}

/** §1.2 token rendering + register-assignment override. */
function resolveOwner(
  control: Control | undefined,
  graph: DataFlowGraph | undefined,
  assignment: { owner_name: string; target_date: string } | undefined,
): { ownerText: string; yours: boolean } {
  if (assignment) {
    // D-30: no "not verified" here — that phrase is reserved for attestations.
    return { ownerText: `${assignment.owner_name} (assigned on your firm's register), due ${assignment.target_date}`, yours: false };
  }
  if (!control?.plain_owner) {
    return { ownerText: '', yours: false };
  }

  let base: string;
  let yours: boolean;
  if (control.plain_owner === '@submitter') {
    base = 'you or your manager (as the person responsible for this use)';
    yours = true;
  } else if (control.plain_owner === '@model_owner') {
    const vendor = graph?.processing_nodes.find((n) => n.vendor)?.vendor;
    if (!graph) {
      // Graph not available (a case reopened from the register): whether the
      // model was bought or built is unknown, so say neither.
      base = 'the team responsible for the model';
      yours = false;
    } else if (vendor && vendor !== VENDOR_SENTINEL_INTERNAL) {
      base = 'you or your manager (as the person responsible for this use), working with the supplier';
      yours = true;
    } else {
      base = 'the team that built the model';
      yours = false;
    }
  } else {
    base = control.plain_owner;
    yours = false;
  }

  if (control.plain_owner_with) {
    base += base.endsWith('working with the supplier') ? ` and ${control.plain_owner_with}` : `, with ${control.plain_owner_with}`;
  }
  return { ownerText: base, yours };
}

// W-7 (R16-W §5, D-77). Firm-level evidence (e.g. "platform allow-list
// pins TLS 1.3") does not prove anything about a tool the evidence's own
// `applies_to` scope does not cover — claiming it would state more than
// the firm's records prove (NF-7). Absent `applies_to` = applies
// everywhere (the pre-W-7 behaviour, unchanged).
type EvidenceApplies = 'applies' | 'does-not-apply' | 'cannot-check';

function evidenceApplies(
  appliesTo: { platforms?: string[]; vendors?: string[] } | undefined,
  graph: DataFlowGraph | undefined,
): EvidenceApplies {
  if (!appliesTo) return 'applies';
  if (!graph) return 'cannot-check';
  const node = graph.processing_nodes[0];
  const platformMatches = node?.platform !== undefined && (appliesTo.platforms ?? []).includes(node.platform);
  const vendorMatches = node?.vendor !== undefined && (appliesTo.vendors ?? []).includes(node.vendor);
  return platformMatches || vendorMatches ? 'applies' : 'does-not-apply';
}

/** §5 "Reviewer evidence panel" text — only ever shown when the policy's
 *  evidence WOULD have been verified but for the scope mismatch (callers
 *  gate on that; see buildVerdictView's safeguard loop). */
function evidenceScopeNote(
  appliesTo: { platforms?: string[]; vendors?: string[] },
  applies: EvidenceApplies,
  policy: PolicyFile | undefined,
): string {
  const names = [
    ...(appliesTo.platforms ?? []).map((id) => policy?.platforms?.find((p) => p.id === id)?.plain_name ?? id),
    ...(appliesTo.vendors ?? []).map((id) => policy?.vendors?.find((v) => v.id === id)?.plain_name ?? id),
  ];
  const joined = joinWithAnd(names);
  return applies === 'cannot-check'
    ? `Your firm's records show this for ${joined} — we couldn't check whether that includes this tool.`
    : `Your firm's records show this for ${joined} — not for this tool.`;
}

function safeguardStatus(
  controlId: string,
  policy: PolicyFile | undefined,
  attestations: ControlAttestations | undefined,
  graph: DataFlowGraph | undefined,
): SafeguardStatus {
  const attested = attestations?.[controlId] !== undefined;
  if (!policy) return attested ? 'attested' : 'unknown';
  const control = policy.controls.find((c) => c.id === controlId);
  if (control?.verification_evidence?.status === 'verified') {
    if (evidenceApplies(control.verification_evidence.applies_to, graph) === 'applies') return 'verified';
  }
  return attested ? 'attested' : 'outstanding';
}

// ---------------------------------------------------------------------------
// Review instances — §1.3/§1.4/§4.4. One per DownstreamReviewSource; the
// BASE id (before the first ":") is what a control's covers_reviews entry
// and the sentinel checks below match against.
interface ReviewInstance {
  baseId: string;
  formalName: string;
  plainName: string;
  ownerText: string;
}

// W-6 (R16-W §5, D-76): both renamed to noun phrases — these plainNames
// feed BOTH "Checks other teams run" (a list item, already fine as a noun
// phrase) AND the new single "(Doing this also completes {list} — one
// piece of work.)" sentence (§4.2 item 4), where the OLD clause-shaped
// name ("the supplier is assessed") read as "(This also covers the
// supplier is assessed — one piece of work.)" — grammatically broken.
const PV_UNREGISTERED_PLAIN = { name: "adding the supplier to your firm's list", owner: 'your vendor-risk team' };
const MODEL_REGISTRY_PLAIN = { name: "adding the model to your firm's list of known models", owner: 'your AI risk team' };
// §4.4: "pack review → 'a regulatory review required for this kind of use —
// ask your AI risk team which'" (D-15). buildVerdictView has no packs
// parameter (§4.1's signature is fixed), so a pack rule's own plain_name
// (policy-authored, confirmed present in the shipped packs) cannot be
// resolved here — every base id that is neither a firm downstream_reviews
// id nor one of the two sentinels is, by §1.3's four-source enumeration, a
// pack rule id, and always takes this fallback.
const PACK_REVIEW_FALLBACK_NAME = 'a regulatory review required for this kind of use — ask your AI risk team which';
const PACK_REVIEW_FALLBACK_OWNER = 'your AI risk team';

function baseReviewId(ruleId: string): string {
  const idx = ruleId.indexOf(':');
  return idx === -1 ? ruleId : ruleId.slice(0, idx);
}

function resolveReviewPlain(baseId: string, policy: PolicyFile | undefined): { name: string; owner: string } {
  if (baseId === 'PV-UNREGISTERED') return PV_UNREGISTERED_PLAIN;
  if (baseId === 'MODEL-REGISTRY') return MODEL_REGISTRY_PLAIN;
  const firmRule: DownstreamReviewRule | undefined = policy?.downstream_reviews?.find((r) => r.id === baseId);
  if (firmRule) {
    return {
      name: firmRule.plain_name ?? `${firmRule.review} ${POINTER_MEANS_FOR_YOU}`,
      owner: firmRule.plain_owner ?? PACK_REVIEW_FALLBACK_OWNER,
    };
  }
  return { name: PACK_REVIEW_FALLBACK_NAME, owner: PACK_REVIEW_FALLBACK_OWNER };
}

/** §4.4: "verdict without review sources (older data) → every review listed
 *  separately; nothing folded away." A legacy instance's baseId is '' —
 *  deliberately never matched by any real covers_reviews entry, so it can
 *  never be folded into a safeguard. */
function buildReviewInstances(verdict: Verdict, policy: PolicyFile | undefined): ReviewInstance[] {
  const sources = verdict.downstream_review_sources;
  if (sources !== undefined) {
    return sources.map((s) => {
      const baseId = baseReviewId(s.rule_id);
      const { name, owner } = resolveReviewPlain(baseId, policy);
      return { baseId, formalName: s.review, plainName: name, ownerText: owner };
    });
  }
  return (verdict.downstream_reviews ?? []).map((r) => ({ baseId: '', formalName: r, plainName: r, ownerText: PACK_REVIEW_FALLBACK_OWNER }));
}

// ---------------------------------------------------------------------------
// §4.2 copy templates.

function headlineText(status: Verdict['status'], needsSignOff: boolean, n: number): string {
  if (status === 'rejected') return 'No — not as described.';
  if (needsSignOff) {
    if (n === 0) return 'Not yet. You can start once your AI risk team has signed it off.';
    if (n === 1) return 'Not yet. You can start once your AI risk team has signed it off and 1 safeguard is in place.';
    return `Not yet. You can start once your AI risk team has signed it off and all ${n} safeguards are in place.`;
  }
  if (n === 0) return 'Yes — you can start.';
  if (n === 1) return 'Nearly. You can start once 1 safeguard is in place — no sign-off needed.';
  return `Nearly. You can start once ${n} safeguards are in place — no sign-off needed.`;
}

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function mentionsAiRiskTeam(text: string): boolean {
  return /\bAI risk team\b/i.test(text);
}

function buildNextSteps(args: {
  needsSignOff: boolean;
  outstandingSafeguards: SafeguardView[];
  owedReviews: OwedReviewView[];
  provisionalReasons: readonly ProvisionalReason[];
}): string[] {
  const { needsSignOff, outstandingSafeguards, owedReviews, provisionalReasons } = args;
  const steps: string[] = [];

  if (needsSignOff) {
    steps.push(
      'Send this result to your AI risk team — the independent team that checks how the firm uses AI. They review the use in principle and sign it off; the safeguards can be finished after.',
    );
    if (outstandingSafeguards.some((s) => mentionsAiRiskTeam(s.ownerText))) {
      steps.push('(Your AI risk team can help you set this up; signing off the use overall is a separate step.)');
    }
  }

  if (outstandingSafeguards.length > 0) {
    const total = outstandingSafeguards.length;
    const yoursCount = outstandingSafeguards.filter((s) => s.yours).length;
    if (yoursCount === total) {
      steps.push(
        total === 1
          ? "Put the safeguard below in place — it's yours to arrange (you or your manager)."
          : "Put the safeguards below in place — they're yours to arrange (you or your manager).",
      );
    } else if (yoursCount === 0) {
      steps.push('Ask the team named against each safeguard below to put it in place, and agree a date. None of them is yours to do yourself.');
    } else {
      steps.push(
        `Ask the team named against each safeguard below to put it in place, and agree a date. ${yoursCount} of them ${
          yoursCount === 1 ? 'is' : 'are'
        } yours to arrange — marked "yours" and listed first. "You or your manager" means your side of the business: agree between you who takes each one.`,
      );
    }
  }

  if (owedReviews.length > 0) {
    const teams = joinWithAnd(dedupeStrings(owedReviews.map((r) => r.ownerText)));
    steps.push(`Also send this result to ${teams} — they run their own checks, listed below. Ask each team whether you must wait for theirs before you start.`);
  }

  if (provisionalReasons.includes('no_regulatory_basis')) {
    steps.push('Tell us which countries it involves, then check again — the answer may change.');
  }

  // "finish" — D-38: "Then" appears only after a preceding step.
  const hasOutstanding = outstandingSafeguards.length > 0;
  let finish: string;
  if (needsSignOff && hasOutstanding) {
    finish = "Start only when both are done: it's signed off, and every safeguard below is in place.";
  } else if (needsSignOff) {
    finish = "Start once it's signed off.";
  } else if (steps.length === 0) {
    finish = "You can start. It's saved on your firm's register of AI uses, which your AI risk team can see.";
  } else {
    finish = "Then you can start. It's saved on your firm's register of AI uses, which your AI risk team can see.";
  }
  steps.push(finish);

  if (needsSignOff && hasOutstanding) {
    steps.push('Not sure who these teams are? Ask your AI risk team when you send them this result.');
  }

  return steps;
}

function buildCouldStillChange(verdict: Verdict): string[] {
  const lines: string[] = [];
  const reasons = verdict.provisional_reasons;
  if (isVerdictProvisional(verdict)) {
    if (reasons?.includes('unsigned_pack_rules')) {
      lines.push(
        "Some country-specific rules it used haven't been formally adopted by your firm yet — your AI risk team can tell you which. If they're adopted as written, this result stays the same.",
      );
    }
    if (reasons?.includes('unclassified_decision_type')) {
      const typed = verdict.unclassified_decision_types ?? [];
      const quoted = typed.map((t) => `"${t}"`).join(', ');
      lines.push(
        `You described a decision we don't have a rule for (${quoted}), so nothing specific to it was checked — your AI risk team will look at it.`,
      );
    }
    if (!reasons || reasons.length === 0) {
      lines.push('This result may still change — your AI risk team can tell you why.');
    }
  }
  // RA-11: independent of provisional status — a medium caveat never makes a
  // verdict provisional (only 'low' does), but it must still surface.
  if (verdict.confidence_caveats.some((c) => c.confidence === 'medium')) {
    lines.push('Some rules it used are worded with less certainty than usual — check this result with your compliance team before relying on it.');
  }
  return lines;
}

// ---------------------------------------------------------------------------

/** §4.1: the one view-model behind the verdict's first screen and the four
 *  readers that need a safeguard's status (WhatToDo, SignOffChecklist, the
 *  evidence panel, and the first screen itself). Pure: same inputs, same
 *  output, every time (NF-1's discipline extended to presentation). */
export function buildVerdictView(
  verdict: Verdict,
  policy: PolicyFile | undefined,
  graph: DataFlowGraph | undefined,
  ownership: ControlOwnership | undefined,
  attestations: ControlAttestations | undefined,
  stage: LifecycleStage | undefined,
): VerdictView {
  const isRejected = verdict.status === 'rejected';
  const needsSignOff = stage === 'pre_checked';

  // Rejected verdicts carry no safeguards, next steps or could-still-change
  // lines from THIS view-model — the "No" screen's own composition (VD-10,
  // §4.3) is chunk D2's slice. The headline still covers the rejected case
  // (§4.2 item 1 lists it explicitly) so the first screen never renders
  // blank while D2 is unbuilt.
  if (isRejected) {
    return {
      isRejected: true,
      needsSignOff,
      headline: headlineText('rejected', needsSignOff, 0),
      whyReasons: [],
      whyHasMore: false,
      nextSteps: [],
      safeguards: [],
      outstandingSafeguards: [],
      inPlaceSafeguards: [],
      attestedSafeguards: [],
      outstandingCount: 0,
      owedReviews: [],
      coveredReviewFormalNames: [],
      whoSignsOff: '',
      couldStillChange: [],
    };
  }

  const tripped = verdict.explanation?.tripped_invariants ?? [];
  const reviewInstances = buildReviewInstances(verdict, policy);

  // Which base ids does ANY safeguard on this verdict cover? Used to split
  // review instances into covered (folded into a safeguard) vs. owed.
  const coveredBaseIds = new Set<string>();
  for (const cid of verdict.controls) {
    const control = policy?.controls.find((c) => c.id === cid);
    for (const base of control?.covers_reviews ?? []) coveredBaseIds.add(base);
  }

  const safeguards: SafeguardView[] = verdict.controls.map((cid, position) => {
    const control = policy?.controls.find((c) => c.id === cid);
    const status = safeguardStatus(cid, policy, attestations, graph);
    const { ownerText, yours } = resolveOwner(control, graph, ownership?.[cid]);
    const plainReasons = dedupeStrings(
      tripped.filter((t) => t.required_controls.includes(cid)).map((t) => invariantPlainReason(t, policy, graph)),
    );
    const coveredReviews: CoveredReview[] = (control?.covers_reviews ?? []).length
      ? reviewInstances
          .filter((inst) => (control?.covers_reviews ?? []).includes(inst.baseId))
          .map((inst) => ({ plainName: inst.plainName, formalName: inst.formalName, baseId: inst.baseId }))
      : [];
    // W-6 (D-76): one sentence, every covered review listed once, "a" /
    // "a and b" / "a, b and c" — never one note per review.
    const alsoCompletesNote =
      coveredReviews.length > 0
        ? `(Doing this also completes ${joinWithAnd(coveredReviews.map((r) => r.plainName))} — one piece of work.)`
        : undefined;
    const attestation = attestations?.[cid];
    // W-7 (D-77): a scope note is only meaningful for evidence that WOULD
    // have been verified but for the scope mismatch.
    const evidence = control?.verification_evidence;
    const appliesTo = evidence?.status === 'verified' ? evidence.applies_to : undefined;
    const applies = appliesTo ? evidenceApplies(appliesTo, graph) : 'applies';
    return {
      id: cid,
      status,
      plainAction: safeguardPlainAction(control, position),
      ownerText,
      yours,
      plainReasons,
      coveredReviews,
      ...(alsoCompletesNote ? { alsoCompletesNote } : {}),
      ...(attestation ? { attestedByName: attestation.attested_by_name, evidenceNote: attestation.evidence_note } : {}),
      ...(appliesTo && applies !== 'applies' ? { evidenceScopeNote: evidenceScopeNote(appliesTo, applies, policy) } : {}),
    };
  });

  const outstandingAll = safeguards.filter((s) => s.status === 'outstanding' || s.status === 'unknown');
  // Array.prototype.sort is stable (ES2019+) — ties keep verdict.controls'
  // own deterministic order.
  const outstandingSafeguards = [...outstandingAll].sort((a, b) => Number(b.yours) - Number(a.yours));
  const inPlaceSafeguards = safeguards.filter((s) => s.status === 'verified');
  const attestedSafeguards = safeguards.filter((s) => s.status === 'attested');
  const outstandingCount = outstandingAll.length;

  const owedInstances = reviewInstances.filter((inst) => !coveredBaseIds.has(inst.baseId));
  const owedReviews: OwedReviewView[] = [];
  const seenNames = new Set<string>();
  for (const inst of owedInstances) {
    if (seenNames.has(inst.plainName)) continue;
    seenNames.add(inst.plainName);
    owedReviews.push({ plainName: inst.plainName, ownerText: inst.ownerText, baseId: inst.baseId });
  }

  // WhatToDo's own "separate reviews" filter (formal vocabulary, unchanged —
  // §4.2/item 3): a formal review string is fully covered only when EVERY
  // instance sharing that text is covered — two firm rules can share one
  // formal name (DR-INFOSEC-01/02) and only one of them might be covered.
  const coveredReviewFormalNames = dedupeStrings(
    [...new Set(reviewInstances.map((inst) => inst.formalName))].filter((name) =>
      reviewInstances.filter((inst) => inst.formalName === name).every((inst) => coveredBaseIds.has(inst.baseId)),
    ),
  );

  // Why (§4.2 item 2): binding constraint's reason first, then the rest in
  // their existing (deterministic) order; distinct text only; cap at two.
  const byBindingFirst = [...tripped].sort((a, b) => {
    if (a.id === verdict.binding_constraint) return -1;
    if (b.id === verdict.binding_constraint) return 1;
    return 0;
  });
  const whyAll = dedupeStrings(byBindingFirst.map((t) => invariantPlainReason(t, policy, graph)));

  const headline = headlineText(verdict.status, needsSignOff, outstandingCount);
  const nextSteps = buildNextSteps({
    needsSignOff,
    outstandingSafeguards,
    owedReviews,
    provisionalReasons: verdict.provisional_reasons ?? [],
  });
  const whoSignsOff = needsSignOff
    ? "your AI risk team. Until they do, this result isn't final."
    : "nobody — it's low-stakes enough for you to go ahead once the safeguard is in place.";

  return {
    isRejected: false,
    needsSignOff,
    headline,
    whyReasons: whyAll.slice(0, 2),
    whyHasMore: whyAll.length > 2,
    nextSteps,
    safeguards,
    outstandingSafeguards,
    inPlaceSafeguards,
    attestedSafeguards,
    outstandingCount,
    owedReviews,
    coveredReviewFormalNames,
    whoSignsOff,
    couldStillChange: buildCouldStillChange(verdict),
  };
}
