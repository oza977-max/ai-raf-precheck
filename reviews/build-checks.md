# Build Checks

Standing checks promoted from recurring review findings. A check is loaded into
the build prompt and names the defect class, the diagnosing framework, and the
acceptance criterion.

Classification per Appendix C.2: **permanent** checks are literature-grounded
and never retire; **retirable** checks are project-specific and are surfaced for
retirement after three silent rounds.

---

## BC-001 — A spec claim about existing code must cite where it was verified

**Class:** permanent.
**Promoted:** 2026-07-29, after design review round 1.
**Diagnosing framework:** Fagan (author preparation — a claim not checked is not
a claim); the project's own calibration mandate "verify documentation claims
against behaviour, not against other documents".

**The defect class.** A specification asserts something about a symbol that
already exists — a prop is optional, a payload can carry a field, a value lives
on this type, a framework behaves this way — and the assertion is never checked
against the code. The spec then reads as authoritative and is wrong, and the
error is only found when someone tries to build from it, or later.

**Evidence of recurrence.**

| Round | Instance |
|---|---|
| explore 003 (2026-07-28) | D-002 claimed the guided form had no jurisdiction field. It had six checkboxes. |
| tech-spec round 3 (2026-07-29) | Phase 8 sequenced a chunk first because existing tests "would break". They could not — the assertions fire on a different screen. |
| design round 1 (2026-07-29) | C-1 assumed the sign-off payload could reference a verdict; C-2 assumed evidence status lived on the Verdict; I-1 assumed an affordance could be suppressed by omission; I-5 assumed StrictMode semantics backwards. |

**Acceptance criterion.** Any spec statement asserting a property of an existing
symbol carries an inline citation of the form `(verified: path:line)` or is
rewritten as an explicit assumption to be checked during the build. A spec
section describing a component's contract without any such citation fails this
check. Reviewers may challenge a citation by reading the cited line.

**Last triggered:** round 1 (design), 2026-07-29 — the round that promoted it.
