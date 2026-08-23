// R12-ST / R12-MG / R12-AB (requirements-012.md; ADR-EE-R12-1,
// ADR-PS-R12-1, ADR-VA-R12-1). Pure pre/post transforms and a pure
// deterministic sampling check — all three take the "now" as an explicit
// parameter. Rule 1 (cross-cutting.md §7): pure island. No Date.now(), no
// Math.random(), no I/O anywhere in this file's call graph.
import type { ApprovedModel, JurisdictionPack, PolicyFile, StaleSource } from './types';

// ADR-EE-R12-1: "staleness and re-attestation are pure pre/post transforms;
// evaluate()'s signature does not change." The orchestrator calls this
// BEFORE evaluate() so an expired family entry is simply unapproved by the
// time evaluate() sees the policy — no new decision branch inside
// evaluate() itself.
//
// Comparison is lexical ISO-date (`<`), which is correct for YYYY-MM-DD
// strings without needing a Date object. "On the reattest_by date itself"
// is still valid — only STRICTLY PAST that date is expired — matching the
// pack/control sign-off idiom elsewhere in this codebase (a date is a
// deadline, not a boundary that lapses at its own start).
export function applyReattestExpiry(policy: PolicyFile, todayIso: string): PolicyFile {
  if (!policy.approved_models || policy.approved_models.length === 0) {
    return policy;
  }

  let changed = false;
  const nextModels: ApprovedModel[] = policy.approved_models.map((m) => {
    if (!m.is_family || !m.reattest_by) return m;
    if (m.reattest_by >= todayIso) return m;
    changed = true;
    return { ...m, is_approved: false };
  });

  if (!changed) return policy;
  return { ...policy, approved_models: nextModels };
}

// ADR-EE-R12-1: computed alongside evaluate(), attached to the Verdict
// WRAPPER (never inside EvaluationResult) — that placement is what keeps
// TC-PE-1-01's byte-identical guarantee true by construction, not by
// discipline. Sorted by pack_id (NF-1).
export function computeStaleSources(packs: JurisdictionPack[], todayIso: string): StaleSource[] {
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  const stale: StaleSource[] = [];

  for (const pack of packs) {
    if (!pack.retrieved_date || pack.max_staleness_days === undefined) continue;
    const retrieved = Date.parse(`${pack.retrieved_date}T00:00:00Z`);
    if (Number.isNaN(today) || Number.isNaN(retrieved)) continue;

    const daysElapsed = Math.floor((today - retrieved) / (24 * 60 * 60 * 1000));
    const daysOverdue = daysElapsed - pack.max_staleness_days;
    if (daysOverdue > 0) {
      stale.push({
        pack_id: pack.pack_id,
        retrieved_date: pack.retrieved_date,
        max_staleness_days: pack.max_staleness_days,
        days_overdue: daysOverdue,
      });
    }
  }

  return stale.sort((a, b) => a.pack_id.localeCompare(b.pack_id));
}

// ADR-VA-R12-1: deterministic 1-in-K sampling queue for the 2LoD spot-
// review of self-served Low-tier verdicts. No randomness, no stored queue
// state — the register view derives "sampling review due" by re-applying
// this function at render time to a verdict id it already has.
//
// FNV-1a (32-bit) over the verdict id — a simple, well-known, non-crypto
// stable string hash. No crypto, no Math.random(), same id always yields
// the same hash in the same process AND across processes (it is a pure
// function of the bytes, not of any runtime seed).
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply, done with shifts to stay in safe-integer
    // range without BigInt.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

// samplingRate semantics: 1-in-K, K = samplingRate.
//   - K <= 0 or not finite (incl. undefined callers coercing to 0/NaN):
//     NEVER sampled. A firm that has not configured a rate gets no
//     surprise reviews — silence is the safe default, not "review
//     everything".
//   - K === 1: ALWAYS sampled (every verdict is 1-in-1).
//   - K > 1: hash(verdictId) mod round(K) === 0 selects roughly 1/K of ids.
export function isSampledForReview(verdictId: string, samplingRate: number): boolean {
  if (!Number.isFinite(samplingRate) || samplingRate <= 0) return false;
  const k = Math.max(1, Math.round(samplingRate));
  if (k === 1) return true;
  return fnv1a(verdictId) % k === 0;
}
