# AIGate — Test Cases, Round 10

*Written 2026-08-17 alongside the build (v0.12.0) from
`requirements/requirements-010.md`. Traceability 100% at birth.*

Test files: `src/components/challenge-memo.test.ts` (the memo builder,
pure) and `src/components/__tests__/VerdictDisplay.r10.test.tsx` (labels,
axis chips, export affordance).

| ID | Asserts |
|---|---|
| TC-R10-CM-1-01..-10 (11 tests incl. -03b) | Memo builder: every section present in order; verdict in appetite vocabulary only; `expect(memo).not.toMatch(/approved\|rejected/i)` over the whole output; 2LoD actions safe-worded ("signed off" / "sent back"); provisional causes in plain language; `[FIRM]` placeholders preserved verbatim; source text blockquoted; empty chain/events degrade to explicit "none recorded" lines, never silent absence |
| TC-R10-IR-1-01 | Tripped invariants framed as the inherent position (risk before controls); minimal control set framed as the residual position |
| TC-R10-CE-1-01 | Legacy single-status evidence renders exactly as before — no axis chips (backward compatibility) |
| TC-R10-CE-1-02 | Evidence with design + operating axes renders both chips, "not_assessed" worded as "not assessed" |
| TC-R10-CM-2-01 | The download control and its "restates the record; does not strengthen it" posture line render with any verdict |

R10-NF-1 (no decision change) is held by the untouched engine plus the
existing determinism suite (TC-PE-1-01, whole-result serialization over 10
runs); the memo path writes nothing (pure builder + client-side Blob
download only), and the suite-wide reserved-words guard covers all new
rendered strings.

| Date | Change |
|---|---|
| 2026-08-17 | Written with the R10 build. |
