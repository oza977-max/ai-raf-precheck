---
schema_version: 1
---

# Exploratory Session — explore-009

## Charter

```yaml
schema_version: 1
session_id: explore-009
mission: Confirmation round for the completion-tracking build (design-vision.md L-6, originally flagged by Stephen in explore-007 as "what have I gained over a checklist in our NPPA template?"). Same persona (Stephen, skeptical bank MD) opens a live case with outstanding controls on the published site, tries to assign an owner and target date to a control, reassigns it, and checks whether the age/overdue signal reads honestly — no reminders, no notifications implied. Owner classifies severity for anything found per Hard Gate 4 (ADR-205).
timebox_minutes: 30
tour: feature
runner: oza977-max
```

**Target:**

- https://oza977-max.github.io/ai-raf-precheck/
- src/components/VerdictDisplay.tsx
- src/components/RegisterDetail.tsx
- src/store/types.ts

## Session Log

- Loaded demo data on the published site (fresh IndexedDB origin, separate from the local dev store used during the build's own live check) — 22 use cases, including [IB] Compliance — Surveillance alert triage (2 OUTSTANDING controls, no prior ownership assignments on this origin).
- Opened the case as Stephen (skeptical bank MD persona), expanded the first outstanding control (Independent validation, CTRL-INDEP-VAL-01).
- Typed a name with no target date set — confirmed the Assign button stays disabled (native form, no partial event can be written).
- Set an overdue target date (2026-01-01) and submitted — control now reads 'Owner: Stephen Marsh (name not verified) · target 2026-01-01 · overdue 242 days', and the audit trail gained one control_ownership_assigned event with plain-language detail text.
- Clicked Reassign — the form pre-filled with the current owner's name rather than opening blank.
- Changed the owner to Priya Nair and the target date to 2026-12-31, submitted — the UI now shows only the latest assignment ('Owner: Priya Nair ... 122 days to go'), while the audit trail timeline shows BOTH the original Stephen Marsh assignment and the Priya Nair reassignment as separate entries — confirms append-only: nothing was overwritten.
- Chain-integrity check climbed from 72 to 74 events across the two assign/reassign writes and stayed 'unbroken'.
- Searched the full rendered page text for 'remind', 'notif', 'ticket', 'escalat' — zero matches. No language on the page implies automated chasing.
- Checked the second outstanding control (Outcome sampling, CTRL-SAMPLE-01) — confirmed it was untouched by the first control's assignment; still shows its own independent, empty assign form.

## Defects

_None recorded._

## Observations

_None recorded._

## Overall Assessment

Confirmed live and working exactly as built and as scoped in design-vision.md L-6. The assign form refuses to submit with a name but no date (button disabled, not a silent no-op — there is no way to write a partial event through the UI). The overdue flag is computed honestly from today's date against the target date, with no rounding or softening ('overdue 242 days', not 'overdue'). Reassignment writes a new control_ownership_assigned event rather than mutating the old one; the audit trail keeps both, and verifyChain() still reports the whole trail unbroken afterward — the append-only, hash-chained discipline the session's earlier explore-007/008 rounds established for the rest of the trail holds for this new event type too. A full-page text search turned up none of 'remind', 'notif', 'ticket', or 'escalat' — the feature does not imply automation it cannot deliver, which was Stephen's original objection ('what have I gained over a checklist in our NPPA template?'). The answer: a persistent, auditable, per-control owner and deadline the checklist never had — still no chasing mechanism, and the product does not pretend otherwise. Verdict: L-6's buildable tier is CLOSED, confirmed on the live published product, not just by reading the diff.
