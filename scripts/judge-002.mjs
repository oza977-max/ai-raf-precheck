#!/usr/bin/env node
// FN-011 — judge-002: reason-before-prediction rerun.
// Standalone script against the local model and a condensed rulebook
// summary. Does NOT touch the app, the store, or the audit trail — same
// scope boundary as judge-001 (reviews/judge-001.md).
//
// Primary change from judge-001's schema: field order is reason THEN
// prediction (judge-001 was prediction then reason). Model, /no_think,
// think:false, temperature:0, the 11 cases and the case field values are
// held constant. TWO things were NOT held constant, both documented in
// reviews/judge-002.md's protocol section: (1) num_predict was raised
// from judge-001's 512 to 1536 after the 512 run produced unterminated-
// JSON failures on the two longest-reasoning cases — reason-first
// generates far more tokens before the prediction field, so the original
// budget could not close the JSON object; (2) the condensed rulebook
// summary was rewritten against policy v1.4 rather than reusing
// judge-001's text. The rerun is therefore NOT a clean single-variable
// isolation — the writeup says so plainly; this header must not claim
// otherwise (code-review-004 F9).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rulebook = readFileSync(resolve(__dirname, 'judge-002-rulebook-summary.txt'), 'utf-8');

// Same 11 cases as src/engine/try-these.test.ts / docs/try-these.md,
// expressed as the field list a judge reads (judge-001's "pre-structured
// graph fields" format). engineStatus is the current v1.4 engine-verified
// answer (npm test — src/engine/try-these.test.ts — passes clean), used
// only for scoring, never sent to the model.
const cases = [
  {
    id: '1',
    fields: 'data_class: Internal, data_zone: Zone C, model_type: statistical, autonomy_level: 0, action_type: read, exposure: internal-only, decision_bindingness: non-binding, output_reversibility: reversible, scale: limited',
    engineStatus: 'inside',
  },
  {
    id: '2',
    fields: 'data_class: MNPI, data_zone: Zone B, model_type: llm, autonomy_level: 1, action_type: draft, exposure: internal-only, decision_bindingness: advisory, output_reversibility: reversible, scale: limited',
    engineStatus: 'outside',
  },
  {
    id: '3',
    fields: 'data_class: Client PII, data_zone: Zone C, model_type: traditional-ml, autonomy_level: 4, action_type: approve, exposure: client-facing, decision_bindingness: binding, output_reversibility: reversible, scale: at_scale, decision_type: credit-decision, hitl: false',
    engineStatus: 'outside',
  },
  {
    id: '4',
    fields: 'data_class: Internal, data_zone: Zone C, model_type: agentic, autonomy_level: 4, action_type: execute, exposure: internal-shared, decision_bindingness: binding, output_reversibility: reversible, scale: at_scale',
    engineStatus: 'outside',
  },
  {
    id: '5a',
    fields: 'data_class: Confidential, data_zone: Zone C, model_type: ml, autonomy_level: 4, action_type: trade, exposure: market-facing, decision_bindingness: binding, output_reversibility: irreversible, scale: at_scale, decision_type: trading',
    engineStatus: 'outside',
  },
  {
    id: '5b',
    fields: 'data_class: Confidential, data_zone: Zone C, model_type: ml, autonomy_level: 4, action_type: trade, exposure: market-facing, decision_bindingness: binding, output_reversibility: reversible, scale: at_scale, decision_type: trading',
    engineStatus: 'outside',
  },
  {
    id: '6',
    fields: 'data_class: Confidential, data_zone: Zone C, model_type: ml, autonomy_level: 2, action_type: recommend, exposure: internal-shared, decision_bindingness: advisory, output_reversibility: reversible, scale: limited, platform: PLAT-INTERNAL-ML (an approved platform already covering encryption, drift monitoring and fingerprinting)',
    engineStatus: 'inside_with_controls',
  },
  {
    id: '7',
    fields: 'data_class: Client PII, data_zone: Zone B, model_type: llm, autonomy_level: 1, action_type: draft, exposure: client-facing, decision_bindingness: advisory, output_reversibility: reversible, scale: at_scale, platform: PLAT-CLOUD-LLM (NOT on the approved-platform list, so nothing is inherited)',
    engineStatus: 'inside_with_controls',
  },
  {
    id: '8',
    fields: 'data_class: Client PII, data_zone: Zone C, model_type: traditional-ml, autonomy_level: 2, action_type: recommend, exposure: internal-shared, decision_bindingness: material, output_reversibility: reversible, scale: at_scale, decision_type: hiring, jurisdiction: EU',
    engineStatus: 'inside_with_controls',
  },
  {
    id: '9',
    fields: 'data_class: Client PII, data_zone: Zone C, model_type: traditional-ml, autonomy_level: 2, action_type: recommend, exposure: client-facing, decision_bindingness: material, output_reversibility: reversible, scale: at_scale, decision_type: not on the approved list — free text "collections prioritisation"',
    engineStatus: 'inside_with_controls',
  },
  {
    id: '10',
    fields: 'data_class: Client PII, data_zone: Zone C, model_type: traditional-ml, autonomy_level: 3, action_type: approve, exposure: client-facing, decision_bindingness: binding, output_reversibility: reversible, scale: at_scale, decision_type: credit-decision, hitl: false, platform: PLAT-INTERNAL-ML, jurisdictions: UK and EU',
    engineStatus: 'inside_with_controls',
  },
];

const REASON_FIRST_SCHEMA = {
  type: 'object',
  properties: {
    reason: { type: 'string' },
    prediction: { type: 'string', enum: ['inside', 'inside_with_controls', 'outside'] },
  },
  required: ['reason', 'prediction'],
};

const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'qwen3:4b';

function stripThinking(content) {
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function callJudge(caseFields) {
  const prompt = `/no_think\n${rulebook}\n\nUSE CASE FIELDS:\n${caseFields}\n\nRespond with JSON: reason (your step-by-step reasoning through the four steps above), then prediction (inside, inside_with_controls, or outside).`;
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      format: REASON_FIRST_SCHEMA,
      stream: false,
      think: false,
      options: { temperature: 0, num_predict: 1536 },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  const content = stripThinking(body.message?.content ?? '');
  if (!content) throw new Error('empty response');
  return JSON.parse(content);
}

const results = [];
for (const c of cases) {
  const start = Date.now();
  try {
    const parsed = await callJudge(c.fields);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const agree = parsed.prediction === c.engineStatus;
    results.push({ id: c.id, engineStatus: c.engineStatus, judgePrediction: parsed.prediction, judgeReason: parsed.reason, agree, elapsed, error: null });
    console.log(`case ${c.id}: engine=${c.engineStatus} judge=${parsed.prediction} agree=${agree} (${elapsed}s)`);
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    results.push({ id: c.id, engineStatus: c.engineStatus, judgePrediction: null, judgeReason: null, agree: false, elapsed, error: String(err) });
    console.log(`case ${c.id}: engine=${c.engineStatus} judge=ERROR (${err}) (${elapsed}s)`);
  }
}

const concordant = results.filter((r) => r.agree).length;
console.log(`\nConcordance: ${concordant}/${results.length}`);

writeFileSync(resolve(__dirname, 'judge-002-results.json'), JSON.stringify(results, null, 2));
