# Operating Regime — standing rules from the owner (2026-08-25)

Three rules the owner set after design-deliberation-001. They apply to
every session working on this repo, from now on.

## 1. Context handover regime

- `HANDOVER.md` at the repo root is the living handover document. It is
  updated at EVERY milestone (round shipped, review completed, decision
  taken), not at session end — so a fresh session can pick up mid-round.
- When the working session's context is approaching compaction, the
  assistant SAYS SO to the owner explicitly ("context is getting full —
  handover is current as of X; safe to continue or restart") rather than
  degrading silently. Compaction itself is survivable (the summary
  carries forward), but the owner is told, and HANDOVER.md is refreshed
  first.
- Everything decision-grade lives on disk, never only in conversation:
  requirements/, reviews/, scoring-reports/, site-survey/, test-cases/,
  and the memory files. Chat is never the system of record.

## 2. Model router — right model for the task, never bigger

| Task class | Model | Why |
|---|---|---|
| Judgment, synthesis, chairing, requirements-writing, review reconciliation | Main-loop model (Fable/Opus-class) | Highest-stakes reasoning only |
| Implementation (components, engine code, tests), review panels, position papers | Sonnet | Strong enough, ~1/5 the cost |
| Mechanical transforms: HTML twins, format conversion, logging, file scans | Haiku | Cheapest tier that is reliable |
| Deterministic rendering, extraction, markdown→HTML, JSON slicing | **Local Python script — zero model tokens** | If a script can do it, no model is called (precedent: design-deliberation-001's report was rendered by script after an agent hit the session cap) |
| App runtime intake (plain-language extraction in AIGate itself) | qwen3:4b via Ollama | Runtime only; NEVER build work (judge-001 measured 1/11 concordance) |

Rules: an agent is only dispatched at the lowest tier that can do the
job; `model:` is always set explicitly on dispatch; when a session cap
is hit, fall back to scripts or defer — never retry the same tier into
the same cap.

## 3. Audit trail — everything checked in

- Every artifact produced — reports, reviews, scoring, surveys,
  deliberations, requirements, test-cases, handovers — is committed AND
  pushed in the same working turn it is finalized, with a commit message
  stating what it is and what decision it feeds.
- Verdict-bearing documents record their provenance (who/what produced
  them, which round, which approval) inside the document, so `git log`
  plus the document itself reconstructs the full chain: finding →
  requirement → build → verification → release.
- Nothing decision-relevant lives only in the scratchpad or only in
  chat. If it mattered, it's in the repo.

*(Confidentiality rule unchanged and senior to all of the above: no
employer name, no internal figures, street-generic teams only —
design-vision.md stays gitignored.)*

---

*Developed using the Grounded Vibe Methodology*

**Addendum (2026-08-25):** the main-loop model follows the session's work
type — Fable/Opus-class for synthesis and judgment sessions (deliberation
chairs, requirements from conflicting inputs, review reconciliation),
Sonnet for build sessions executing an approved spec. The intelligence of
a build round lives in its documents, not its driver.
