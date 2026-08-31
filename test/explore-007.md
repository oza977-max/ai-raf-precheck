---
schema_version: 1
---

# Exploratory Session — explore-007

## Charter

```yaml
schema_version: 1
session_id: explore-007
mission: "Persona-based cold-adoption test: a founder (Marcus) demos AIGate to a skeptical bank Managing Director (Stephen, Ops/Compliance, no AI background, real NPPA/Model Risk governance process) using only the live About page and one real verdict screen from the published site. An independent consultant (Diana) observes the full exchange and produces a path-forward memo. Tests whether the product's own claims match what a first-time institutional buyer actually experiences, and whether the tool can self-explain without an engineer in the room. Three GVM-dispatched agents ran the roleplay in two rounds (initial questions, then follow-up after honest founder answers); the owner classifies severity per Hard Gate 4 (ADR-205)."
timebox_minutes: 60
tour: feature
runner: oza977-max
```

**Target:**

- https://oza977-max.github.io/ai-raf-precheck/
- src/components/AboutPanel.tsx
- src/components/VerdictDisplay.tsx
- src/store/audit.ts

## Session Log

- Fable-dispatched roleplay: Stephen (skeptical bank MD) demo'd live About page + a real verdict screen.
- Round 1: Stephen asked 8 questions grounded only in what the live site actually shows.
- Marcus (founder persona) answered honestly, admitting 4 unbuilt items framed as "pilot work."
- Round 2: Stephen reacted — trust built by honesty, but named the gap between "pilot" and "build project."
- Diana (consultant persona) synthesized: messaging fixes, real product gaps ranked by blocking-ness, a scoped "Governance Mapping & Paper Trial" recommendation.

## Defects

### D-001: It is client-side, held in browser local storage, with no cryptographic integrit

**Severity:** Critical
**Tour:** feature
**Given:** A bank is asked to trust AIGate's verdict/audit trail as evidence for a live regulated decision
**When:** They inspect what protects the audit trail from tampering
**Then:** It is client-side, held in browser local storage, with no cryptographic integrity chain and no external immutable store — anyone with machine access could alter past events undetected
**Reproduction:** src/store/audit.ts — append() writes AuditEvent records with no hash/signature; AboutPanel.tsx's own copy admits "proof-of-concept grade, not tamper-evident"
**Stub-path:** none — not a stub path

### D-002: Track is AIGate's own invented oversight-regime category with no way for a firm 

**Severity:** Important
**Tour:** feature
**Given:** A bank with its own governance structure (e.g. NPPA + Model Risk split) views a verdict
**When:** They see "Track II" or "Tier: High" and try to map it to who at their firm should own the sign-off
**Then:** Track is AIGate's own invented oversight-regime category with no way for a firm to name its own committee/process against it — the mapping has to happen entirely off-tool, in the buyer's head
**Reproduction:** src/components/field-copy.ts — TRACK_MEANINGS is fixed prose ("AI on model risk management" etc.), not configurable per firm; policy/appetite.yaml has no field for a firm to name its own governance mapping
**Stub-path:** none — not a stub path

### D-003: The open gap does not appear anywhere on the verdict/sign-off screen itself — on

**Severity:** Important
**Tour:** feature
**Given:** A risk-knowledge coverage gap is filed against a use case ("File as coverage gap")
**When:** The use case proceeds to verdict and sign-off
**Then:** The open gap does not appear anywhere on the verdict/sign-off screen itself — only in a separate sidebar queue nobody is prompted to check, with no age/staleness indicator
**Reproduction:** src/components/RegisterDetail.tsx / KnowledgeLensPanel.tsx — filed gaps write to the rule-improvement queue only; VerdictDisplay.tsx has no awareness of open gaps for its own use case
**Stub-path:** none — not a stub path

### D-004: The 10% target renders as if it were a deliberate, firm-specific decision — it i

**Severity:** Minor
**Tour:** feature
**Given:** A firm has not set its own margin-of-safety target
**When:** They view the "margin of safety 75% (your firm wants at least 10%)" line on a verdict
**Then:** The 10% target renders as if it were a deliberate, firm-specific decision — it is actually an unlabeled demo default in the starter policy file
**Reproduction:** src/components/VerdictDisplay.tsx — margin_target rendered with no "illustrative default" qualifier when it matches the starter config value
**Stub-path:** none — not a stub path


## Observations

_None recorded._

## Overall Assessment

The roleplay found real gaps between the product's claims and what a first-time institutional buyer actually experiences — not UI polish, but substance: an audit trail that cannot yet serve as regulatory evidence, a governance taxonomy with no path for a bank to make it theirs, and a coverage-gap mechanism that files evidence nobody is prompted to read. The founder persona's honesty under questioning was itself validated as the right instinct — it built trust rather than losing the deal. Owner decision: fix all four, including the audit-trail item, rather than defer it as future-phase infrastructure — see explore-008 for the confirmation round after the fix.
