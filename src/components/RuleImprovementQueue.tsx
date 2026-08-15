import { useEffect, useState } from 'react';
import { getAllForExport } from '../store/audit';
import { getUseCases } from '../store/register';
import type { AuditEvent } from '../store/types';

// Rule-improvement queue (FN-009). The receiving end of rule_dissent_filed:
// challenges to RULES, grouped by rule, for the humans who author the
// rulebook (grounding/PACK-AUTHORING.md). Advisory by construction — nothing
// here reads back into the engine, and a dissent never changes a verdict.
//
// Derived read view over the audit trail (the register.ts UseCaseSummary
// pattern): computed by scanning events, never persisted as a second store —
// so the queue can never disagree with the trail it is derived from.
// Rule 4 (cross-cutting.md §7): presentation-only.

interface DissentEntry {
  event_id: string;
  occurred_at: string;
  use_case_id: string;
  use_case_label: string;
  verdict_id: string;
  dissent: string;
  filed_by_name: string;
}

interface RuleGroup {
  rule_id: string;
  rule_label?: string;
  entries: DissentEntry[];
}

// Exported for tests: the derivation is pure, so it is testable without
// rendering. Groups sorted by rule id, entries newest-first — deterministic
// for identical inputs, matching the product's wider ordering discipline.
export function deriveQueue(events: AuditEvent[], labels: Map<string, string>): RuleGroup[] {
  const groups = new Map<string, RuleGroup>();
  for (const ev of events) {
    if (ev.payload.type !== 'rule_dissent_filed') continue;
    const p = ev.payload;
    let group = groups.get(p.rule_id);
    if (!group) {
      group = { rule_id: p.rule_id, entries: [] };
      groups.set(p.rule_id, group);
    }
    // Last non-empty label wins; a label is cosmetic, the id is the identity.
    if (p.rule_label) group.rule_label = p.rule_label;
    group.entries.push({
      event_id: ev.event_id,
      occurred_at: ev.occurred_at,
      use_case_id: ev.use_case_id,
      use_case_label: labels.get(ev.use_case_id) ?? `${ev.use_case_id.slice(0, 8)}…`,
      verdict_id: p.verdict_id,
      dissent: p.dissent,
      filed_by_name: p.filed_by_name,
    });
  }
  const result = [...groups.values()].sort((a, b) => a.rule_id.localeCompare(b.rule_id));
  for (const g of result) g.entries.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return result;
}

export default function RuleImprovementQueue() {
  const [queue, setQueue] = useState<RuleGroup[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [events, cases] = await Promise.all([getAllForExport(), getUseCases('all')]);
      if (cancelled) return;
      setQueue(deriveQueue(events, new Map(cases.map((c) => [c.use_case_id, c.label]))));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="card rule-queue">
      <h2>Rule-improvement queue</h2>
      <p className="rule-queue__intro">
        Challenges filed against <strong>rules</strong> — not against use cases. When a 2LoD reviewer
        thinks a rule is wrong, too broad, or missing a distinction, the challenge lands here for the
        people who author the rulebook. It is advisory by construction: a dissent never changes a
        verdict, and nothing in this queue feeds back into the engine. Rule changes happen the same
        way they always do — a human edits the appetite framework or a pack, and signs it off.
      </p>
      <p className="rule-queue__caveat">
        Derived from the append-only audit trail, so filing a challenge is permanent. Today the
        challengers are people; the queue is also where an advisory machine reviewer would file, if
        one is ever added — through the same event, marked as such, with no more authority than a
        human dissent has here: none over the verdict.
      </p>

      {queue === null ? (
        <p>Loading…</p>
      ) : queue.length === 0 ? (
        <p className="rule-queue__empty" role="status">
          No rule challenges have been filed. A 2LoD reviewer can file one from any use case&rsquo;s
          sign-off page — &ldquo;Challenge a rule&rdquo;, under the verdict.
        </p>
      ) : (
        <ul className="rule-queue__groups">
          {queue.map((group) => (
            <li key={group.rule_id} className="rule-queue__group">
              <h3>
                <code>{group.rule_id}</code>
                {group.rule_label && <span className="rule-queue__rule-label"> — {group.rule_label}</span>}
              </h3>
              <p className="rule-queue__count">
                {group.entries.length} challenge{group.entries.length === 1 ? '' : 's'}
              </p>
              <ul className="rule-queue__entries">
                {group.entries.map((entry) => (
                  <li key={entry.event_id} className="rule-queue__entry">
                    <p className="rule-queue__dissent">&ldquo;{entry.dissent}&rdquo;</p>
                    <p className="rule-queue__meta">
                      {entry.filed_by_name} (name not verified) · on {entry.use_case_label} ·{' '}
                      {new Date(entry.occurred_at).toLocaleDateString()} · verdict{' '}
                      <code>{entry.verdict_id.slice(0, 8)}</code>
                    </p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
