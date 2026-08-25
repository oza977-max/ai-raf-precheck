# AIGate and the Post-Deployment Gap — Positioning & Next-Act Strategy

**Status: PROPOSED — synthesised 2026-08-25 from three expert position
papers (strategy/Rumelt lens, governance/Power lens, product-flow/
Reinertsen lens), grounded in the "After Deployment" research briefing
(4th ed., two GVM review rounds). Awaiting owner approval before any
requirements round is drafted.**

## The owner's thesis, tested

> "Everyone is heavy on pre-governance and light on post-governance —
> that's the gap the data exposes. AIGate automates pre-governance to
> keep it light and grounded; ongoing monitoring is the next act."

All three experts found the thesis **directionally right and
under-sharpened in the same place**. The industry gap is real (84% of
catalogued AI risks are post-deployment; banks self-report kill-switches
and failure reporting as their weakest area). But "pre vs post" framed
as two halves invites the wrong build: a parallel monitoring workstream,
i.e. dashboards.

## Diagnosis (the sharpened crux)

**Pre-governance artifacts are not a separate deliverable from
monitoring — they are its only possible input.** A bank cannot monitor
"AI risk"; it can only monitor a specific named thing: this model, this
data flow, this control, this expiry condition, against this invariant.
AIGate's register, graphs, minimal control sets and audit trail are
exactly that substrate. A firm without them has nothing to monitor
*against* — which is why generic AI-observability tools cannot close
this gap and why AIGate can.

So AIGate does not pivot to a post-governance product. **Its
pre-governance artifacts gain a second consumer.** The precedent to
avoid repeating: regulatory citations were once computed and discarded
at verdict assembly. The register must not be the next artifact whose
downstream consumer never gets built.

The research's two-quadrant split disciplines the scope: post-deployment
risk is **misuse** (280 risks — humans weaponising deployed systems;
an adversarial-testing problem) and **malfunction** (225 — systems
failing without malice; a detection problem). These need opposite
controls and must never be one backlog item called "monitoring."

## Guiding policy

**Build the bridge from the register to the monitoring signal, one
quadrant at a time, starting where a deterministic engine has genuine
authority — and every signal must force register state, never merely
paint a screen.**

The Power-lens test for every candidate feature: *does a detected
condition change register state, or does it change a screen?* A chart
with no forcing function is a ritual of verification — the exact
audit-society failure the product exists to resist. AIGate's honesty
discipline (UNVERIFIED, provisional, "pending adoption") extends to
monitoring claims: version-change detection is claimable; behavioural
drift detection is not, and must be explicitly marked out of scope
until output-sampling infrastructure exists.

## Coherent actions — proposed next-round scope (R16 candidate)

All three papers converged, independently, on the same first build:

1. **Drift-triggered re-evaluation (build first — the smallest real
   slice).** One new audit event type, `model_version_changed`
   (manually asserted at first — no vendor polling; the manual nature
   is disclosed in the UI the same way pack signatures show "pending
   adoption"). Firing it does three things atomically: flips the
   register entry to a re-evaluation-required state that a 2LoD
   signature alone can clear, writes the append-only audit event, and
   enqueues the entry in the **existing** re-evaluation queue. A new
   verdict object is produced on re-run, never a mutation. Demoable in
   one sentence: "watch what happens when I tell it the vendor shipped
   a new model." This is the malfunction quadrant, and it directly
   answers the vendor-concentration evidence (top-3 model providers
   18%→44% in two years — more blast radius per silent change).

2. **Incident muscle, thin (build second).** An `incident_reported`
   event type filed against a register entry — changing register state,
   appearing on the audit trail, and feeding the existing
   rule-improvement queue as its third source (alongside reviewer
   challenges and lens coverage gaps). Kill-switch *state* is a field
   the bank attests, never a mechanism AIGate pretends to operate. No
   case-management UI, no memo generator.

3. **Adversarial-testing scheduling stub (build third, minimal).** A
   next-review-due date + overdue flag per register entry (the misuse
   quadrant, as a compliance-state problem). Scheduling is claimable;
   execution is not — AIGate never runs red-teams.

**Explicitly not built, with reasons on the record:**
- Live model-metrics dashboards (observability vendors' territory; no
  forcing function; the decoration risk in person).
- Kill-switch *mechanics* (AIGate has no runtime authority; shipping
  the UI without the authority is theatre and an NF-7 violation).
- A serious-incident memo generator (the "Big-4 deliverable generator"
  the product explicitly is not).
- Drift-scoring/fingerprinting math (the value is the register linkage;
  the signal can be integrated later, not invented here).
- MIT sub-domain lens deepening 7→24 (quality polish on a shipped
  advisory feature; zero pitch delta; revisit on prospect demand).

## The 2LoD economics rule (design constraint for all of the above)

Monitoring generates orders of magnitude more signal than sign-off;
reviewers are the scarcest resource. Allocation follows controllability:
unambiguous, time-critical signals (a version change on an approved use
case) **auto-act on register state** with the human moved to post-hoc
review; judgment-requiring signals (is this drift material?) **auto-file
with an escalation clock**. Anything that fits neither is the ritual
category — don't build it.

## The named risk (Reinertsen)

The whole monitoring layer is only as good as **voluntary input** — a
human asserting "the model changed," someone choosing to log an
incident — and the evidence says reporting is exactly where banks are
weakest. For a pitch-grade build this is acceptable *only if stated*:
the manual-trigger nature is disclosed in the UI, not discovered in the
demo Q&A. Sensing machinery (webhooks, CI/CD gates) is future scope,
named as such.

## The pitch line this yields

"AIGate automates pre-governance so it stops being the bottleneck —
and because everything it approves lives on a register with named
controls and expiry logic, it is the only place ongoing monitoring can
actually attach. The 84% of risk that arrives after deployment lands on
a system that already knows what was approved, under which rules, and
what would make that approval stale."

## Provenance

- Research: "After Deployment" briefing (4th ed.), doc-review rounds 1–2
  (doc-review/after-deployment-review-2026-08-25.html; calibration.md).
- Expert papers: three parallel position papers (Rumelt-lens strategy,
  Power-lens governance, Reinertsen-lens product flow), 2026-08-25,
  synthesised by the session driver; convergence on action 1 was
  independent across all three.
- Owner thesis: stated 2026-08-25; this document sharpens, does not
  replace, that thesis.

---

*Developed using the Grounded Vibe Methodology*
