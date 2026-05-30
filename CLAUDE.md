# RAF Pre-Check — Project Instructions

A "pre-check" tool for AI Risk Appetite at banks. Use cases are represented as
data-flow graphs; the firm's appetite is a set of invariants over those graphs;
the engine returns in/out of appetite, what's violated, and the minimal control
set to bring it inside. Source-of-truth rulebook: `grounding/raf-extraction.md`
(derived from `grounding/ai-raf-template.html`). Built via the GVM pipeline.

GitHub: https://github.com/oza977-max/ai-raf-precheck (private). Auto-commit
and push at every meaningful milestone — the user is non-technical on git, do
not ask them to run git commands.

---

## Model routing policy — don't burn tokens

**Default model for this project: Sonnet.** Only escalate to Opus for genuinely
thinking-heavy phases. Drop to Haiku for trivial lookups when available.

### Use Sonnet (default) for
- Executing GVM build phases that are mechanical: `/gvm-build`, `/gvm-test`,
  `/gvm-walking-skeleton`, `/gvm-deploy`, `/gvm-status`, `/gvm-doc-write`
  (templated)
- Writing code, editing files, running shell/git/gh commands
- Routine review and follow-up questions
- Anything where the path is clear and the work is execution

### Escalate to Opus ONLY for
- `/gvm-requirements` — multi-turn elicitation, ambiguity resolution
- `/gvm-tech-spec` — architecture and design decisions
- `/gvm-design-review`, `/gvm-code-review` — deep critique panels
- Novel architectural calls, contested design trade-offs, security-sensitive
  reasoning

**Before escalating to Opus, tell the user *why* and ask them to confirm.**
After the Opus phase ends, drop back to Sonnet. Do not stay on Opus by default.

### Drop to Haiku for
- Quick status checks, file/path lookups, single-file reads where summary is
  not needed

---

## Context discipline — the other big token lever

The conversation itself is the biggest token sink (every turn re-sends the
whole history). To stay lean:

1. **Use subagents for self-contained heavy work** (large file reads, parallel
   reviews, broad searches). GVM's review panels already do this. A subagent's
   context is thrown away after; only its summary returns. This is the single
   biggest saver.
2. **Don't re-read files unnecessarily.** Trust the file-state tracking.
3. **Don't dump huge tool outputs into the main thread** — pipe through `head`,
   `tail`, `grep`, or write to a file and reference it.
4. **Checkpoint and pause** when the 5-hour window passes 80%. Commit, push,
   resume after reset. Saved memory carries the project forward.

---

## House rules

- The user is non-technical on git/GitHub — handle all mechanics for them.
- Plain language over jargon. They explicitly do NOT want "another chatbot" or
  "another Big-4 deliverable" — the product's value is determinism +
  auditability + minimal-fix solving, not vibes.
- When in doubt, check `~/.claude/projects/-Users-kshitijoza-RAF/memory/` for
  the long-form project memory.
