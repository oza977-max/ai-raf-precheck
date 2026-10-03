import { routeToWorkflow } from '../engine/workflow-router';
import { getUseCase, findLatestVerdictEvent } from '../store/register';
import { getAll } from '../store/audit';
import type { PolicyFile } from '../engine/types';
import type { LifecycleStage } from '../store/types';
import type { Verdict } from '../types/verdict';

// CR8-10 (code review 008). Every seed writes its audit events first and its
// register node LAST. A reload between the two used to leave events with no
// node, and the next seed run, seeing no node, wrote a second full set of
// events — the audit trail is append-only, so that cannot be cleaned up.
//
// Chosen rule (one place, three seeds), evaluated INSIDE the per-case lock:
//   - the node exists                      -> skip (seeded)
//   - no audit events for the case         -> seed fully
//   - a verdict_produced exists, no node   -> write ONLY the missing register
//                                             rows from that event's verdict;
//                                             append no events
//   - events but no verdict_produced       -> skip and console.error: an
//                                             orphan that cannot be completed
//                                             safely
// Known limit: recovery appends nothing, so a reload that landed before an
// ib-portfolio case's scripted 2LoD events were written leaves the case at the
// router's stage with no review on its trail.
// Writing the node first is NOT an option: its current_verdict_id would point
// at a verdict that does not exist yet.
export type SeedPlan =
  | { kind: 'skip' }
  | { kind: 'fresh' }
  | { kind: 'recover'; verdict: Verdict; createdAt: string; stage: LifecycleStage };

export async function planSeed(caseId: string, policy: PolicyFile): Promise<SeedPlan> {
  if (await getUseCase(caseId)) return { kind: 'skip' };
  const events = await getAll(caseId);
  if (events.length === 0) return { kind: 'fresh' };
  const latest = findLatestVerdictEvent(events);
  if (!latest) {
    console.error(`Seed skipped for "${caseId}": it has audit events but no verdict_produced event, so it cannot be completed safely.`);
    return { kind: 'skip' };
  }
  // The LAST verdict_produced or verdict_corrected, consistent with taking the
  // last stage change below.
  const verdict = latest.type === 'verdict_produced' ? latest.verdict : latest.new_verdict;
  // The stage the case's own trail implies: the last lifecycle_stage_changed
  // event wins (ib-portfolio's scripted 2LoD approval writes one, so an
  // approved case recovers as approved); with none, the router's stage for the
  // verdict's tier — exactly what the seed would have written.
  let stage: LifecycleStage = routeToWorkflow(verdict.tier, policy).lifecycle_stage;
  for (const e of events) {
    if (e.payload.type === 'lifecycle_stage_changed') stage = e.payload.to_stage;
  }
  return { kind: 'recover', verdict, createdAt: events[0]!.occurred_at, stage };
}
