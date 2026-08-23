# AIGate — Test Cases, Round 13

*Written 2026-08-18 alongside the build (v0.15.0) from
`requirements/requirements-013.md`. Traceability 100% at birth.*

Test files: amended `KnowledgeLensPanel.test.tsx` (two renegotiated
assertions + TC-R13-UI-1/-3) and `RegisterDetail.knowledgeLens.test.tsx`
(expand-before-assert renegotiation).

| ID | Asserts |
|---|---|
| TC-R13-UI-1 | Gaps render before covered entries, in the distinct `--gap` treatment; covered entries do not appear in the open list |
| TC-R13-UI-3 | A gap whose risk domain already has a `rule_dissent_filed` event renders the persistent "Filed — on the rule-improvement queue" state, button gone |
| Renegotiated (R11-KL-4 amendments) | Covered-entry content is now one click away behind the "N known risk domains already addressed — show" toggle — the same criterion-amendment pattern R9-SC-2 applied to R5-GR-1, recorded in each test's comment |

R13-DATA condition tightenings are covered by the existing
knowledge-lens matcher tests (conditions are data, the matcher is
unchanged); the KL-SOCECON-01 sentinel fix is verified by the live
walkthrough (the entry no longer misfires on in-house vendors) and by
the register's real matches. R13-UI-4 (legacy note) and R13-UI-5 (top
notice) were live-verified on real register data: a pre-R11 case shows
"decided before that check existed" with no panel; the gap-bearing case
shows "1 known risk class has no covering rule" above the fold, 1
distinct gap item with a real Filed state, and "8 known risk domains
already addressed — show" collapsing correctly. Suite at close: 659
tests, green ×3.

| Date | Change |
|---|---|
| 2026-08-18 | Written with the R13 build. |

---

*Developed using the Grounded Vibe Methodology*
