// R10-CM-1 (requirements-010.md, ADR-VA-R10-1). Effective-challenge memo
// export. PURE presentation: assembled only from the objects the caller
// already has on screen (verdict + audit events) — no store reads, no
// writes (R10-NF-1), no I/O. Rule 4 (cross-cutting.md §7).
//
// Reserved-words rule: the raw enum words "approved"/"rejected" must never
// appear in the generated markdown. Verdict status is mapped to appetite
// vocabulary; 2LoD actions are described in safe wording ("signed off" /
// "sent back" / "sent back for correction") rather than echoed verbatim.
import type { Verdict } from '../types/verdict';
import type { AuditEvent } from '../store/types';
import { TIER_MEANINGS, TRACK_MEANINGS } from './field-copy';

export interface ChallengeMemoInput {
  label: string;
  useCaseId: string;
  description?: string;
  verdict: Verdict;
  events: AuditEvent[];
}

const STATUS_TO_APPETITE: Record<Verdict['status'], string> = {
  approved: 'inside appetite',
  approved_with_controls: 'inside appetite with controls',
  rejected: 'outside appetite',
};

const PROVISIONAL_CAUSE_COPY: Record<string, string> = {
  no_regulatory_basis: "no jurisdiction pack applied — the firm's own appetite only",
  unsigned_pack_rules: 'relies on pack rules no one at the firm has signed',
  unclassified_decision_type: 'a decision type the policy has no rule for',
};

const TWOLOD_ACTION_COPY: Record<string, string> = {
  approved: 'signed off',
  rejected: 'sent back',
  correction_requested: 'sent back for correction',
};

function heading(level: number, text: string): string {
  return `${'#'.repeat(level)} ${text}`;
}

export function buildChallengeMemo(input: ChallengeMemoInput): string {
  const { label, useCaseId, description, verdict, events } = input;
  const lines: string[] = [];

  lines.push(heading(1, `Effective challenge memo — ${label}`));
  lines.push('');

  // Header block.
  lines.push(`Use case: ${useCaseId}`);
  if (description) lines.push(`Description: ${description}`);
  lines.push('Generated from the record; verify against the live register.');
  lines.push(`Policy version: ${verdict.policy_version}`);
  const packVersions = Object.entries(verdict.pack_versions);
  lines.push(
    packVersions.length > 0
      ? `Pack versions: ${packVersions.map(([pack, version]) => `${pack} ${version}`).join(', ')}`
      : 'Pack versions: none recorded',
  );
  lines.push('');

  // THE VERDICT.
  lines.push(heading(2, 'The verdict'));
  lines.push(`Position: ${STATUS_TO_APPETITE[verdict.status]}.`);
  lines.push(`Tier: ${verdict.tier} — ${TIER_MEANINGS[verdict.tier] ?? 'meaning not recorded'}`);
  lines.push(`Track: ${verdict.track} — ${TRACK_MEANINGS[verdict.track] ?? 'meaning not recorded'}`);
  lines.push('');

  // INHERENT POSITION.
  lines.push(heading(2, 'Inherent position'));
  if (verdict.explanation.tripped_invariants.length > 0) {
    for (const inv of verdict.explanation.tripped_invariants) {
      lines.push(`- **${inv.id}** (${inv.severity}) — ${inv.description}`);
      lines.push(`  Regulatory basis: ${inv.regulatory_basis ?? 'none recorded'}`);
    }
  } else {
    lines.push('none recorded');
  }
  lines.push('');
  lines.push(`Binding constraint: ${verdict.binding_constraint}`);
  lines.push(`Reason: ${verdict.explanation.binding_reason ?? 'none recorded'}`);
  lines.push('');

  // RESIDUAL POSITION.
  lines.push(heading(2, 'Residual position'));
  if (verdict.controls.length > 0) {
    lines.push('Minimal control set:');
    for (const controlId of verdict.controls) {
      lines.push(`- ${controlId} — evidence status as shown on the verdict at generation time`);
    }
  } else {
    lines.push('Minimal control set: none recorded');
  }
  lines.push('');
  if (verdict.explanation.tripped_invariants.length > 0) {
    lines.push('Required controls per invariant:');
    for (const inv of verdict.explanation.tripped_invariants) {
      const required = inv.required_controls.length > 0 ? inv.required_controls.join(', ') : 'none recorded';
      lines.push(`- ${inv.id}: ${required}`);
    }
  } else {
    lines.push('Required controls per invariant: none recorded');
  }
  lines.push('');

  // THE REGULATORY CHAIN.
  lines.push(heading(2, 'The regulatory chain'));
  const chain = verdict.explanation.regulatory_chain ?? [];
  if (chain.length > 0) {
    for (const entry of chain) {
      lines.push(`- **${entry.rule_id}** — ${entry.document} §${entry.section}`);
      lines.push(`  > ${entry.source_text}`);
      lines.push(`  Basis: ${entry.basis}. Sign-off: ${entry.sign_off}.`);
    }
  } else {
    lines.push('none recorded');
  }
  lines.push('');

  // PROVISIONAL CAUSES.
  lines.push(heading(2, 'Provisional causes'));
  if (verdict.provisional_reasons.length > 0) {
    for (const reason of verdict.provisional_reasons) {
      lines.push(`- ${PROVISIONAL_CAUSE_COPY[reason] ?? reason} (pending)`);
    }
  } else {
    lines.push('none recorded');
  }
  lines.push('');

  // SIGN-OFFS ON THE RECORD.
  lines.push(heading(2, 'Sign-offs on the record'));
  const signOffLines: string[] = [];
  for (const event of events) {
    if (event.payload.type === 'graph_confirmed') {
      const p = event.payload;
      let line = `- Attested by 1LoD (${event.actor}, ${event.occurred_at})`;
      if (p.submitter_note) line += ` — note: "${p.submitter_note}"`;
      signOffLines.push(line);
      if (p.answer_contexts && p.answer_contexts.length > 0) {
        signOffLines.push(`  Answer context: ${p.answer_contexts.join('; ')}`);
      }
    } else if (event.payload.type === 'twoloD_reviewed') {
      const p = event.payload;
      const actionWord = TWOLOD_ACTION_COPY[p.action] ?? p.action;
      const who = p.attested_by_name ? `${p.attested_by_name} (name not verified)` : 'no name recorded';
      let line = `- 2LoD review ${actionWord} by ${who} (${event.occurred_at})`;
      if (p.notes) line += ` — notes: "${p.notes}"`;
      signOffLines.push(line);
    } else if (event.payload.type === 'rule_dissent_filed') {
      const p = event.payload;
      signOffLines.push(
        `- Open challenge: rule ${p.rule_id} disputed by ${p.filed_by_name} (name not verified) — "${p.dissent}" (advisory; pending resolution)`,
      );
    }
  }
  lines.push(signOffLines.length > 0 ? signOffLines.join('\n') : 'none recorded');
  lines.push('');

  // STANDING CONDITIONS.
  lines.push(heading(2, 'Standing conditions'));
  if (verdict.conditions.hypotheses.length > 0) {
    for (const hypothesis of verdict.conditions.hypotheses) {
      lines.push(`- ${hypothesis}`);
    }
  } else {
    lines.push('none recorded');
  }
  lines.push('');

  // Closing honesty block.
  lines.push('---');
  lines.push(
    'This memo restates the record; it does not strengthen it. Anything marked provisional, pending or unverified above is exactly that.',
  );

  return lines.join('\n');
}
