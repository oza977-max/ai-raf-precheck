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

**Default model for this project: Sonnet 5 (`claude-sonnet-5`).** Only escalate
to Opus 4.8 for genuinely thinking-heavy phases. Drop to Haiku 4.5 for trivial
lookups when available. Never reach for Fable 5 on this project — it's priced
above Opus and nothing in a GVM build pipeline needs its reasoning ceiling.

Current pricing (as of this policy's last check): Sonnet 5 $2/$10 per MTok
in/out (introductory, through 2026-08-31, then $3/$15) — currently *cheaper
than Sonnet 4.6* ($3/$15) at equal or better quality, so there is no reason to
pin to 4.6. Opus 4.8 is $5/$25. Haiku 4.5 is $1/$5. Re-check
`shared/models.md` in the `claude-api` skill if pricing seems stale — model
pricing shifts and this file is not auto-updated.

### Use Sonnet 5 (default) for
- Executing GVM build phases that are mechanical: `/gvm-build`, `/gvm-test`,
  `/gvm-walking-skeleton`, `/gvm-deploy`, `/gvm-status`, `/gvm-doc-write`
  (templated)
- Writing code, editing files, running shell/git/gh commands
- Independent code-review subagent passes (the review-convergence loop)
- Routine review and follow-up questions
- Anything where the path is clear and the work is execution

### Escalate to Opus 4.8 ONLY for
- `/gvm-requirements` — multi-turn elicitation, ambiguity resolution
- `/gvm-tech-spec` — architecture and design decisions
- `/gvm-design-review`, `/gvm-code-review` — deep critique panels
- Novel architectural calls, contested design trade-offs, security-sensitive
  reasoning

**Before escalating to Opus, tell the user *why* and ask them to confirm.**
After the Opus phase ends, drop back to Sonnet 5. Do not stay on Opus by
default.

### Drop to Haiku 4.5 for
- Quick status checks, file/path lookups, single-file reads where summary is
  not needed
- HTML generation from already-structured data (build summaries, review
  reports) — mechanical format conversion, no judgment required

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
