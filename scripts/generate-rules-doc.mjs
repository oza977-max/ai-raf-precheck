#!/usr/bin/env node
// Generates docs/rules.md from the policy files.
//
// Written as a generator rather than a hand-maintained document for the
// reason CLAUDE.md already records about the parallel .md/.html specs: two
// copies of the same facts drift silently, and a rulebook that disagrees
// with the engine is worse than no rulebook. Run `npm run docs:rules` after
// any policy or pack edit; CI-less repos rely on the habit.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { load } from 'js-yaml';

const policy = load(readFileSync('policy/appetite.yaml', 'utf8'));
const packs = readdirSync('policy/packs')
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => load(readFileSync(`policy/packs/${f}`, 'utf8')))
  .sort((a, b) => a.pack_id.localeCompare(b.pack_id));

// Conditions are the part a reader most needs in plain English — the raw
// YAML shape ({ in: [...] }, { gte: n }) means nothing to a risk reader.
const FIELD = {
  data_class: 'information type',
  data_zone: 'where it sits',
  model_type: 'AI type',
  autonomy_level: 'autonomy',
  exposure: 'who sees it',
  decision_bindingness: 'weight',
  action_type: 'what it does',
  decision_type: 'decision fed',
  output_reversibility: 'reversible?',
  scale: 'scale',
  hitl: 'human check',
  replaces_prior_model: 'replaces a model',
};

function cond(c) {
  if (c === null || c === undefined) return '—';
  return Object.entries(c)
    .map(([k, v]) => {
      const name = FIELD[k] ?? k;
      if (v && typeof v === 'object') {
        if ('in' in v) return `${name} is ${v.in.join(' / ')}`;
        if ('not_in' in v) return `${name} is NOT ${v.not_in.join(' / ')}`;
        if ('gte' in v) return `${name} ≥ ${v.gte}`;
        if ('lte' in v) return `${name} ≤ ${v.lte}`;
      }
      return `${name} = ${v}`;
    })
    .join(' **and** ');
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const out = [];
const p = (s = '') => out.push(s);

p('# Every rule in AIGate');
p();
p('> **Generated from `policy/appetite.yaml` and `policy/packs/*.yaml` by');
p('> `npm run docs:rules`. Do not edit by hand — regenerate after any policy');
p('> change.** Conditions are rendered in plain English; the YAML is the');
p('> authority.');
p();
p(`Policy version **${policy.version}** · ${policy.hard_lines.length} hard lines · ${policy.tracks.length} tracks · ${policy.tiers.length} tiers · ${policy.invariants.length} invariants · ${policy.controls.length} controls · ${packs.reduce((n, k) => n + k.rules.length, 0)} pack rules`);
// Code review 002: this line previously read "across ${packs.length} jurisdictions",
// which counted PACK FILES, not jurisdictions — EU alone contributes two. It
// undercounted the declared set and hid the fact that CA/SG/JP are deliberate
// bare declarations, which is the whole point of policy v1.3.
const withPacks = new Set(packs.map((k) => k.jurisdiction));
const declared = policy.jurisdictions.length;
p(`${declared} jurisdictions declared · ${withPacks.size} with an assessed pack (${[...withPacks].sort().join(', ')}) · ${declared - withPacks.size} declared with no pack`);
p();
p('---');
p();

p('## 1. Hard lines — checked first, nothing can fix them');
p();
p('If one of these matches, evaluation stops immediately and the answer is no.');
p('No control set changes it. Tier and track are never even assigned.');
p();
p('| # | When | Why | Basis |');
p('|---|---|---|---|');
for (const h of policy.hard_lines) {
  p(`| \`${h.id}\` | ${esc(cond(h.condition))} | ${esc(h.reason)} | ${esc(h.regulatory_basis)} |`);
}
p();

p('## 2. Tracks — which governance route it takes');
p();
p('First match wins, evaluated in id order.');
p();
p('| # | Track | When | Basis |');
p('|---|---|---|---|');
for (const t of policy.tracks) {
  const c = (t.conditions ?? []).map((x) => cond({ [x.field]: x.value })).join(' **and** ');
  p(`| \`${t.id}\` | ${esc(t.name)} | ${esc(c)} | ${esc(t.regulatory_basis)} |`);
}
p();

p('## 3. Tiers — how serious it is');
p();
p('Impact-dominant: every trigger is evaluated and the highest tier reached wins.');
p();
p('| # | Tier | Any of these triggers |');
p('|---|---|---|');
for (const t of policy.tiers) {
  const c = (t.triggers ?? []).map((x) => cond({ [x.field]: x.value })).join(' **or** ');
  p(`| \`${t.id}\` | **${esc(t.name)}** | ${esc(c) || '(default)'} |`);
}
p();

p('## 4. Invariants — the things that must hold');
p();
p('Every one is checked. Each that trips is a gap the solver must close.');
p();
for (const i of policy.invariants) {
  p(`### \`${i.id}\` — ${i.severity}`);
  p();
  p(`${i.description}`);
  p();
  p(`- **Trips when:** ${cond(i.condition)}`);
  p(`- **Closed by:** ${i.required_controls.length ? i.required_controls.map((c) => `\`${c}\``).join(', ') : '_no control resolves this — tripping it is a rejection_'}`);
  if (i.regulatory_basis) p(`- **Basis:** ${i.regulatory_basis}`);
  p();
}

p('## 5. Controls — what closes a gap');
p();
p('The solver picks the **smallest set** that covers every tripped invariant,');
p('preferring lower burden. Controls without evidence render UNVERIFIED.');
p();
p('| # | Control | Burden | Closes | Evidence |');
p('|---|---|---|---|---|');
for (const c of policy.controls) {
  const ev = c.verification_evidence ? `**${c.verification_evidence.status.toUpperCase()}**` : 'UNVERIFIED';
  const res = c.resolves.length ? c.resolves.map((r) => `\`${r}\``).join(', ') : '_pack-required only_';
  p(`| \`${c.id}\` | ${esc(c.name)} | ${c.burden} | ${res} | ${ev} |`);
}
p();
p('<details><summary>What each control actually requires</summary>');
p();
for (const c of policy.controls) {
  p(`- **\`${c.id}\`** — ${c.description}`);
  if (c.verification) p(`  - _Verified by:_ ${c.verification}`);
}
p();
p('</details>');
p();

p('## 6. Jurisdiction packs — local law, on top of the above');
p();
p('These never classify anything by themselves. They only raise a tier, add a');
p('control, add a review, or prohibit outright. See');
p('[`approach.md`](approach.md) for why a large regulation yields few rules.');
p();
for (const k of packs) {
  const verified = k.rules.filter((r) => !/ILLUSTRATIVE|NOT VERBATIM|NOT YET IDENTIFIED/i.test(r.source.text)).length;
  const state = verified === k.rules.length ? 'text retrieved, awaiting human review' : `**${k.rules.length - verified} of ${k.rules.length} rules have placeholder text — not reviewable**`;
  p(`### ${k.pack_id} · ${k.jurisdiction} — ${k.document}`);
  p();
  p(`_v${k.version} · in force ${k.effective_date} · sign-off: ${k.reviewer_name} (${k.sign_off_date}) · ${state}_`);
  p();
  for (const r of k.rules) {
    const eff =
      r.effect.type === 'tier_floor' ? `raise tier to **${r.effect.minimum_tier}**`
      : r.effect.type === 'required_control' ? `require \`${r.effect.control_id}\``
      : r.effect.type === 'required_review' ? `require review: _${r.effect.review}_`
      : `**prohibit** — ${r.effect.reason}`;
    const real = !/ILLUSTRATIVE|NOT VERBATIM|NOT YET IDENTIFIED/i.test(r.source.text);
    p(`**\`${r.id}\`** — ${r.title}`);
    p();
    p(`- **When:** ${cond(r.condition)} → ${eff}`);
    p(`- **Source:** ${r.source.document} ${r.source.section}${r.source.source_url ? ` ([link](${r.source.source_url}))` : ''}`);
    p(`- **Basis:** \`${r.basis}\`${real ? '' : ' — ⚠️ **quote is a placeholder; this rule cannot be reviewed or relied on**'}`);
    if (real) p(`  > ${r.source.text}`);
    p();
  }
}

p('---');
p();
p('_Nothing here is legal, regulatory or compliance advice. The starter');
p('appetite and packs are unadopted templates — a verdict produced before your');
p('firm adopts them is provisional, not final._');

writeFileSync('docs/rules.md', out.join('\n') + '\n');
console.log(`docs/rules.md written — ${policy.invariants.length} invariants, ${policy.controls.length} controls, ${packs.reduce((n, k) => n + k.rules.length, 0)} pack rules`);
