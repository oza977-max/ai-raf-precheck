# AIGate — Test Cases, Round 11

*Written 2026-08-17 alongside the build (v0.13.0) from
`requirements/requirements-011.md`. Traceability 100% at birth.*

Test files: `src/engine/evaluate.test.ts` (TC-R11-MG-1..5, model governance;
TC-R11-MG-1a-1..5, model families), `src/store/register.model-nodes.test.ts`
(TC-R11-MG-6, the anti-dormancy guard), `src/engine/knowledge-lens.test.ts`
(TC-R11-KL-*, including TC-R11-KL-NF-1 determinism), plus
`src/components/__tests__/KnowledgeLensPanel.test.tsx` and
`RegisterDetail.knowledgeLens.test.tsx`.

## R11-MG — Model governance

| ID | Asserts |
|---|---|
| TC-R11-MG-1..5 | An unlisted or `is_approved: false` declared model trips a named review (mirrors the existing vendor-approval pattern exactly); an approved model does not; determinism holds with `approved_models` present |
| TC-R11-MG-6 | Two use cases declaring the same `model_id` produce exactly ONE `ai_model` register node and TWO `uses_model` edges — the dormancy-repeat guard |
| TC-R11-MG-1a-1..5 | An exact `model_id` match wins even when an overlapping family entry also matches; a family-only entry (`is_family`, `version_pattern` prefix) approves a differently-versioned declared id with no exact entry; no match (neither exact nor family) still reports as unlisted; Track II's `CTRL-FINGERPRINT-01` pinning requirement is unaffected by family approval, since it triggers on graph attributes independent of `approved_models`; 10-run determinism holds with family entries present |

## R11-KL — The knowledge lens

| ID | Asserts |
|---|---|
| TC-R11-KL-* | `parseKnowledgeLens` (zod `.strict()`) rejects an entry with an unrecognised key — the structural "cannot decide" guarantee; `matchKnowledgeLens` returns matches sorted by entry id; `covered` is computed correctly from `covering_rule_ids` ∩ fired rule ids; the advisory panel renders the posture line "informs — the rules decide" and distinct (dashed) styling, never interleaved with invariants or jurisdiction packs |
| TC-R11-KL-NF-1 | The critical determinism proof: `evaluate()` is called before and after computing a real, non-empty `matchKnowledgeLens` result from the actual `grounding/risk-knowledge.yaml` — both serialized verdicts are byte-identical, and no lens-shaped key (`risk_domain`, `knowledge_lens`, etc.) appears anywhere in the output. `evaluate()`'s signature has no lens parameter, so there is no argument slot for lens data to reach it through — this is the "true by construction" property ADR-EE-R11-1 claims, exercised, not asserted by inspection |
| — | Coverage-gap filing (`handleFileKnowledgeGap` in RegisterDetail.tsx) writes exactly one `rule_dissent_filed` event, reusing R4's identical write path — no new event type, no new write surface |

## R11-UI / R11-DOC — Three levers, visibly distinct

Held by the existing render-test patterns extended in this round:
`PolicyEditor.test.tsx` covers the three-lever summary bar and the
risk-knowledge panel (fixed one label collision — "Jurisdiction packs"
appeared as both a lever label and a panel heading; the lever label was
renamed to "Regulation" to match the README's own subgraph naming and stay
find-by-text-safe); `About.test.tsx` is unaffected since the rewritten "The
three levers" section introduced no new heading text under test. The
README diagram was render-verified before commit (rendered via a Mermaid
artifact preview, since no dedicated render-check page existed for this
diagram at the time).

## Non-functional

R11-NF-1 (byte-identical with/without the knowledge lens) is TC-R11-KL-NF-1
above — the strongest form of this guarantee in the codebase, since the
lens literally has no path to `evaluate()`'s call signature. R11-NF-2
(reserved words, append-only) is held by the suite-wide guard plus R4's
unmodified write path. R11-NF-3 (CC BY 4.0 attribution) is asserted by
grep-able presence in `grounding/risk-knowledge.yaml`'s header comment,
every `KnowledgeLensEntry.source_attribution` field, the About screen, and
the README.

| Date | Change |
|---|---|
| 2026-08-17 | Written with the R11 build. |
