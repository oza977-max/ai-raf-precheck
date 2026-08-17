# AIGate — Test Cases, Round 8

*Written 2026-08-17 alongside the build (v0.9.0) from
`requirements/requirements-008.md`. Traceability 100% at birth.*

Test files: `src/engine/precedent.test.ts`, `src/components/__tests__/SimilarCases.test.tsx`.

| ID | Asserts |
|---|---|
| TC-R8-SC-1-01 | Outcome rendered in appetite vocabulary with tier/track/controls/policy version |
| TC-R8-SC-2-01 | Advisory posture line renders; empty matches render nothing |
| TC-R8-SC-3-01 | Deterministic ranking; ties break by id |
| TC-R8-SC-3-02 | Higher overlap ranks first; the subject is never its own precedent |
| TC-R8-SC-3-03 | Caps at three |
| TC-R8-NF-1-01 | No rendered string matches /approved|rejected/i for any status |

R8-SC-4 (sign-off page) shares the SimilarCases component and derivation
with the intake panel; its rendering is covered by the component tests plus
the existing RegisterDetail scoped-query discipline. R8-NF-1's no-write
property is held by the existing rendering-must-not-write pattern
(TC-R3-NF-2-01) — the panel adds reads only.
