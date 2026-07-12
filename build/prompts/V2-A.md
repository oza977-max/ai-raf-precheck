# Build Prompt: V2-A — Jurisdiction Packs + RA-9 Regulatory Chain + RA-11 Confidence

## Origin

The final design-gap tier: the demo's centerpiece (REGULATORY REASONING
CHAIN with verbatim source text, per-rule confidence, sign-offs) requires
jurisdiction pack loading — V1's standing deviation since P3-C01
(`resolveActivePacks`/`applyJurisdictionOverrides` are documented
pass-through stubs). User commissioned the full build.

## Scope decisions

1. **Pack schema per `policy-schema.md §4`**, with two decided
   corrections: (a) `track_floor` is NOT implemented — repo-updates §4.2
   replaced it with the supplement model (obligations added, track never
   changed); the stale `track_floor` row in the spec's effects table is
   corrected as spec-sync. Effects: `tier_floor` (most-demanding wins,
   never lowers), `required_control`, `required_review`, `hard_line`.
   (b) Rule conditions use the same graph-condition language as the main
   policy (canonical fields incl. `decision_type`/`hitl`); `hard_line`
   effects are graph-only (evaluated before tier/track exist).
2. **Reject-on-load per spec**: a rule missing id/source.document/
   source.section/source.text/confidence/reviewer_name/reviewer_role/
   sign_off_date rejects the WHOLE pack, error naming pack + field.
3. **NF-7 unsigned rules**: `reviewer_name` containing `[FIRM]` (or any
   `[...]` placeholder) = UNSIGNED. A fired unsigned rule emits a
   LOW-confidence caveat ("proposed interpretation — pending firm
   adoption") → the existing provisional banner fires. A fired SIGNED
   Medium/Low-confidence rule emits a caveat at its own level. This is
   RA-11 becoming real — the P5-C01 banner UI has waited for this data.
4. **Engine**: `evaluate(graph, policy, packs = [])` — additive third
   param; all existing call sites/tests unchanged. Active packs = loaded
   packs whose `jurisdiction` code ∈ `graph.jurisdictions`, sorted by
   pack_id, rules by id (determinism). Pack hard_lines evaluated right
   after base hard lines. `tier_floor` applied in step 5 (real
   `applyJurisdictionOverrides`), `required_control` ids unioned into
   the final control set, `required_review` unioned into
   downstream_reviews. `pack_versions` + `applied_overrides` populated
   for the first time. `explanation` gains `regulatory_chain:
   RegulatoryChainEntry[]` (rule_id, document, section, source_text,
   confidence, derived-effect sentence, sign_off) for every fired rule.
5. **Pack content**: 7 files matching the declared jurisdictions. EU AI
   Act carries the two demonstrable rules (Annex III §5(b)
   creditworthiness → tier_floor Critical; Annex III §4(a) employment
   screening → tier_floor Critical — the visible "forced" demo since
   hiring has no base Critical trigger). SS1/23 supplements the
   independent-validation downstream review for material/binding
   quantitative models. SR 26-2 / DORA / OSFI E-23 / MAS FEAT / FSA
   Japan carry 1 minimal rule each. ALL sign-offs are
   `[FIRM] — pending adoption` (unsigned → every pack-firing verdict is
   honestly provisional, exactly the Phase A labeling). Source texts:
   the two EU Annex III quotes are believed accurate; ALL rules carry
   the spec's `[ILLUSTRATIVE — NOT VERBATIM — replace during pack
   authoring]` marker except where noted, because verbatim copy-paste
   from retrieved documents is the human authoring step
   (BC-V2A-02: never present unverified text as verified regulation).
6. **Loading**: `src/store/packs.ts` (`loadPacks` — pure, Zod) +
   `src/store/pack-source.ts` (Vite `import.meta.glob` raw eager over
   `policy/packs/*.yaml`). IntakeFlow parses once and passes to
   `evaluate`.
7. **Form completeness**: StructuredForm gains optional `decision_type`
   and `hitl` selects — closes the documented UC-4/UC-8 back-test
   caveats (HL-003/004 and decision-type tiers reachable via form) and
   makes pack rules form-testable.
8. **UI**: verdict gains the REGULATORY REASONING CHAIN (RA-9) panel
   (per fired rule: id, doc·section, confidence chip, quoted source
   text, → DERIVED line, SIGN-OFF line); appetite view pack chips
   upgrade to "loaded (N rules) — pending adoption" / "invalid: …" from
   the real loader; legacy verdicts without `regulatory_chain` render no
   panel (defensive read).

## Known Patterns to Avoid

- BC-V2A-01: pack effects never LOWER anything — tier_floor takes the
  max; obligations only add (most-demanding-standard, grounding §C).
- BC-V2A-02: no fabricated verbatim text presented as verified — the
  ILLUSTRATIVE marker convention is mandatory where text is not
  copy-pasted from a retrieved source.
- BC-V2A-03: unsigned rules MUST surface as provisional (NF-7) — a
  pack-forced verdict with a pending sign-off can never present as
  authoritative.
- BC-V2A-04: determinism — packs/rules sorted by id, no Date/random;
  TC-PE-1-01 must pass unmodified (empty-packs default) and a new
  determinism test covers the with-packs path.
- BC-V2A-05: all existing tests pass without modification except where a
  new field legitimately extends an assertion.

## TDD

Engine first: pack loader (valid pack; reject-on-missing-field naming
pack+field); tier_floor forces Critical on an EU hiring case (base
Medium → Critical) and never lowers; required_review/required_control
union; unsigned → low caveat + provisional; chain entries content;
with-packs determinism (10-run). Back-test: extend
`backtest-predictions.test.ts` with the new jurisdictional cases and
re-verify all previous 9 unchanged. UI: chain panel renders quote +
confidence + sign-off; form emits decision_type/hitl.
