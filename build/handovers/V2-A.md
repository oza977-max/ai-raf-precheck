# Handover: V2-A — Jurisdiction Packs + RA-9 Chain + RA-11 Confidence

## Status: Complete (commit 89bc31c post-history-rewrite)
## Branch: main

## What shipped

The design's centerpiece tier, real end-to-end:
- `src/store/packs.ts` + `pack-source.ts`: Zod pack loader per
  policy-schema.md §4 — whole-pack rejection naming pack+field; rule
  conditions get the same operator + canonical-vocabulary validation as
  the main policy (review fix). Vite-bundled `policy/packs/*.yaml`.
- 7 starter packs (EU AI Act, SS1/23, SR 26-2, DORA, OSFI E-23,
  MAS FEAT, FSA Japan). ALL sign-offs are [FIRM]/[DATE] placeholders →
  unsigned (NF-7) → pack-touched verdicts render PROVISIONAL until CRO
  adoption. Quotes carry [ILLUSTRATIVE] markers except the two EU
  Annex III texts (believed accurate; verify at adoption).
- `src/engine/jurisdiction.ts` rewritten from the P3-C01 stubs:
  resolveActivePacks, pack hard-lines (step 2b), tier_floor (raise-only,
  BC-V2A-01), required_control/required_review supplements,
  caveats + chain entries. Track never changed (repo-updates §4.2).
- `evaluate(graph, policy, packs = [])` — additive; no-packs behavior
  byte-identical (proven: 9 original back-test predictions unchanged).
  pack_versions + applied_overrides populated for the first time.
- VerdictDisplay: RA-9 REGULATORY REASONING CHAIN panel (quote,
  doc·section, confidence chip, derived, sign-off). RA-11: the
  provisional/medium caveat banners (dormant since P5-C01) now fire.
- StructuredForm: decision_type + hitl selects (closes UC-4/UC-8
  form-path caveats; HL-003/004 now reachable).
- PolicyEditor: pack chips from the real loader (all packs per
  jurisdiction, load-error attribution by declared filename).
- Back-test: +6 jurisdictional cases (UC-9..13, UC-8b), 15/15
  predictions machine-verified against real policy + real pack files.

## Review

**Pass log [(1, 5), (2, 0)]** — five Important findings fixed:
un-dated sign-offs treated as signed (NF-7 bypass); unvalidated pack
conditions (silent never-firing rules); pack_versions dropped on base
hard-line rejections; EU's second pack invisible in the appetite view;
load-error chip matching broken for 5/7 files. Documented Minor
residual: condition field-NAME typos tolerated (deliberate forward-
compat; noted in code; pack authors must check names at authoring).

## Confidentiality scrub + history rewrite (same push)

User flagged internal figures in the repo. Actions taken:
- Verified "Nomura" appears NOWHERE (tree, full history, memory).
- Replaced all question-count figures (the 250/300 family) with
  street-generic wording ("hundreds of questions",
  "multi-hundred-question") in README + requirements (.md and .html),
  and generalized "the first-user bank['s] current process" to "typical
  street practice".
- **git filter-repo --replace-text over the FULL history + force push**:
  the figures are purged from every historical commit. Verified via
  `git grep` across `git rev-list --all` (zero hits).
- ⚠️ **ALL COMMIT SHAs CHANGED.** Every SHA cited in earlier handovers
  and memory files is stale (content references only — the work itself
  is intact and verifiable by commit message).

## Standing rule for this repo (user instruction, permanent)

No internal company figures, no employer name, no internal team names —
generic street references only ("hundreds of questions", "Risk
Committee", "2LoD"). Check new content against this before committing.

## Tests

215 passing × 3 clean runs (re-verified post-rewrite), tsc clean, build
clean, spec-parity exit 0. Live-verified: EU CV-screening case through
the form → Provisional · Critical (forced from Medium) with the full
RA-9 chain quoting Annex III §4(a).

## What remains (unchanged from the earlier estimate)

- Human pack authoring with Legal/Compliance (verbatim quotes, real
  sign-offs) — the moat work; the tool now enforces its honesty.
- V1.5 platform: server-backed append-only audit store, artifact
  binding, real auth.
- User's Phase C back-test with real historical cases.

---

*Developed using the Grounded Vibe Methodology*
