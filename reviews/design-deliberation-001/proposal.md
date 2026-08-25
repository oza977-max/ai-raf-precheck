# AIGate — reconciled design proposal (chair's report)

**Date:** 23 August 2026 · **Build reviewed:** v0.16.0 · **Panels:** Clarity & plain language · Interaction design · Information layout & accessibility · AI governance · Regulation & supervisory defensibility · Banking practice (James 1LoD / Priya 2LoD)

---

## 1. The headline

Your instinct was right: a first-line business person meeting this product today would be confused, and a reviewer would find the verdict page a wall. But every panel, working separately from six different professional angles, reached the same diagnosis: **the confusion comes from presentation, not from substance.** The questions the product asks are the right questions; the verdict says the right things; the honesty markers ("provisional", "unverified", "guessed", "self-asserted name") are the product's spine. The problem is that:

1. Four screens never received the Round-9 treatment (the recomposition that fixed the graph-review screen in August): the **verdict/sign-off page**, the **guided intake form**, the **register list**, and the **appetite-framework screen**.
2. The engine's internal vocabulary leaks through in three specific ways: raw workflow codes (`pre_checked`) in the register; internal requirement-tracking codes (`LC-2`, `NF-2`, `PE-4`, `VD-4`, `UC-4`) inside sentences a bank reviewer reads; and a technical code in brackets after every one of ~90 options on the intake form.
3. One screen nobody on the panels caught (found by the chair in the source): the **Confirm & attest** step, where the submitter clicks "Confirm and evaluate" — the attestation moment — still shows `traditional-ml · L3 · Zone B · execute`.

**Recommendation: targeted redesign** — one coordinated round, five build chunks, method governed by the R9 precedent (aggregate, prioritise, layer; never delete an honesty disclosure). Nothing touches `src/engine`, the audit model, or the three-lever architecture.

Three things the panels argued about that the code already settles (see §6 for how this changes the resolutions):
- The Approve / Request correction / Challenge buttons are **already** rendered only in the 2LoD role (`RegisterDetail.tsx`, `showActionBar = role === '2LoD' && stage === 'pre_checked'`), and the "Rule challenges" menu item is already hidden for 1LoD. The role-gating dispute was about a decision already shipped. What is missing is honesty about what the role switcher *is* — a view preference in a build with no sign-in — not the gating itself.
- The verdict page already has a native, accessible fold component (`<details>`) with an honesty-floor override ("never fold while any control is UNVERIFIED"). The recomposition reuses it; the accessibility cost the Layout panel worried about is close to zero.
- The plain-language "Describe" box is already step 1 for everyone; only the model-based *reading* of it is gated on a local model being configured. No change needed there.

---

## 2. The principles used to settle every conflict

These are the product's own constitution, restated so you can see why each call went the way it did:

| # | Principle | What it means in practice |
|---|---|---|
| **P1 — Honesty is the floor** | No honesty marker or regulatory citation is removed, softened, or moved off the screen where the decision it qualifies is made. The UI never implies a capability it lacks (sign-in, access control, verified evidence). | "Provisional" stays glued to "Approved with controls"; the self-asserted-name caveat stays next to the Approve button; a role switcher that hides controls must say it is a view, not a lock. |
| **P2 — Comprehension is the goal** | The first thing a non-technical reader sees on any element is a plain sentence; the technical term sits beside it or one click away — never the only label, never hidden. | "Personal details of clients" first, `Client PII` small and grey beside it. |
| **P3 — R9 governs method** | Aggregate, prioritise, layer — never delete. One carve-out, stated openly: internal requirement-tracking codes (`LC-2`, `NF-2`…) are engineering exhaust, not disclosures, and are removed outright; the sentence they sat in survives untouched. | The 12-rule list compresses to 12 one-liners; it does not become "1 of 12, click for the rest". |
| **P4 — Both-sides designs beat winners** | Plain word + code; summary then detail; per-role *defaults*, never per-role *locks*. | Form section headers read "What it uses (input data)". |
| **P5 — Accessibility is part of comprehension** | No meaning delivered by hover alone; every new fold/toggle carries programmatic open/closed state. | Tier/Track meanings become an always-visible legend, not a tooltip. |
| **P6 — Reserved words and determinism** | Every new rendered string passes the `/approved|rejected/i` gate; nothing changes in the engine; every change is presentation-only (Rule 4). | Stage label for `approved` becomes "Cleared", not "Approved". |

---

## 3. Per screen — keep / change / redesign (ordered by impact on the two users)

### 3.1 Verdict / sign-off page (register → case detail) — **REDESIGN (recomposition; content unchanged)**

**Who it hurts today:** both users end here. James has to scroll past a full effective-challenge dossier to learn what to do; Priya reads a dense paragraph of rule IDs and citation brackets, and the single thing she most needs first — "this is provisional, here is why" — is the fourth element in reading order.

**What changes (wireframe of the target state, 2LoD view):**

```
← register
Retail banking assistant chatbot            4e6081ff · submitted by 2LoD · 23/08/2026
Tier: High   Track: II        Approved with controls · Provisional
Not final — 9 controls still to put in place and a second-line sign-off still needed.
High tier = a lot could go wrong if this misbehaves; waits for second-line sign-off.
Track II = overseen as a model with extra scrutiny.

[PROVISIONAL — review required before this is final]            ← moved up to here
 Cause: no country rulebook was applied, so only your firm's own rules were used.

BEFORE YOU SIGN OFF — five things to check        (each line jumps to its section)
 ☐ Decided by one rule: "autonomy ceiling" INV-AUTONOMY-01 [RAF §7]           → Why
 ☐ 9 controls named · 8 outstanding · 1 in place · evidence: 1 verified, 8 unverified → Controls
 ☐ No country rulebook applied — firm rules only. If UK/EU/US applies, say so and re-run → Jurisdiction
 ☐ Rulebook translation: unattested — nobody has yet confirmed the policy wording
   was correctly turned into these rules                                        → Appetite framework
 ☐ Advisory only: 1 known risk class has no covering rule (informs; does not decide) → Risk knowledge
 Then sign off at the bottom. Your name is self-asserted — this build has no sign-in.

[section nav, sticks to top while scrolling, collapses at high zoom]
 Verdict · What the submitter must do · Why · Controls & evidence · Risk knowledge · Sign-off

VERDICT  Approved with controls · Provisional  — Inside appetite once 9 controls are in place…

WHAT YOU NEED TO DO  (summary-then-detail; default collapsed per item, "Expand all")
 1. Bounded authority envelope + sampled post-hoc review  CTRL-AUTONOMY-BOUND-01  [OUTSTANDING] ▸
 2. Conduct testing + transcript audit                    CTRL-CONDUCT-01         [OUTSTANDING] ▸
 … 4. Encryption in transit (TLS 1.3+)                    CTRL-ENC-01             [IN PLACE]    ▸
 Separate reviews other teams own: Information security review · Vendor risk assessment
 Then: second-line sign-off.
 "Outstanding means the policy file carries no attestation…" (kept verbatim)

WHY THIS VERDICT  — three kinds of rule (legend: hard line · firm rule · country rule)
 Tier High — exposure · Track II — AI on model-risk management [SS1/23 §3.4; OSFI E-23 §2.1]
 Not yet satisfied — 1 critical · 8 high · 3 medium   (one line per rule, ALL 12 visible)
 CRITICAL  Autonomy ceiling                      INV-AUTONOMY-01  [RAF §7]               ▸ details
 HIGH      Autonomy in front of a client         INV-AUTONOMY-02  [OSFI E-23 §4.3; FCA PRIN 2A] ▸
 HIGH      Conduct testing                       INV-CONDUCT-01   [RAF §4]               ▸
 … (each ▸ opens: description · "closed by" controls · full citation text)
 Measured against 5 hard lines and 18 firm rules (invariants) — 12 apply and are not yet satisfied.

▸ How fragile is this approval?   (fold, closed — as today)
▸ Platform & vendor inheritance   (fold, closed — as today)
NO COUNTRY RULEBOOK WAS APPLIED   (visible — as today)
THE CONTROL SET, WITH EVIDENCE STATUS  (stays unfolded while any control is UNVERIFIED — as today)
▸ What would make this verdict expire (fold, closed — as today)
Risk-knowledge awareness  (visibly different container — dashed; "Informs — the rules decide" kept)
▸ Similar decided cases (collapsed to a count — as today)

SIGN-OFF  (2LoD role only — as today)
 Your name ______  Recorded on the attestation so the trail says who accepted this verdict.
                  It is self-asserted — this build has no sign-in, so the name is not verified.  ← protected, verbatim
 Notes ______    [Approve] [Request correction] [Challenge a rule…]
 Download effective-challenge memo — "It restates the record; it does not strengthen it."  ← protected, verbatim
AUDIT TRAIL · append-only · client-side, proof-of-concept grade  (unfolded — as today)
```

**Specific moves and who asked for them:**
- Provisional banner moves to directly after the title/chip row (Layout F4). The risk-gap sentence gets its advisory qualifier at first mention (Governance AIG-4).
- Status row: plain lead sentence added; the literal pair "Approved with controls · Provisional" stays together beside it (Clarity F2 + Regulation's additive condition); the raw `pre_checked` token leaves this row — the lead sentence says it in words.
- "Before you sign off" checklist header, derived purely from existing state, each line a jump link (Regulation F1, Layout F3/F8, Governance's revised position). It is a *compression* of the reasoning — rule names and citations at summary weight — not a bypass. It renders under the same condition the action bar already renders (2LoD role, stage awaiting sign-off). In the 1LoD role the page leads with "What you need to do", exactly as today.
- Sticky **section navigation**, not a sticky Approve button (IxD ID-4's goal, Regulation/Governance/Banking's objection, Layout's zoom caveat). The Approve control stays after the reasoning.
- The 12-rule block becomes **one line per rule, all visible by default, grouped Critical/High/Medium**, plain name first, rule ID as quiet code, citation as a chip; the description and "closed by" list open per rule (Regulation's counter to Layout F3; Clarity F4; Governance AIG-1's three-kind legend).
- Controls list becomes summary-then-detail: one line each with status chip; the three-line "What it is / Why / What in place" opens per item, "Expand all" available. Status chips (OUTSTANDING / IN PLACE / UNVERIFIED) stay on every line (Governance's clarification of Layout F8: items move to "addressed", they never vanish).
- "18 invariants" → "18 firm rules (invariants)" in the stat line (IxD ID-8, Clarity F7).
- Internal codes `(LC-2)`, `(NF-2)`, `(VD-4 / NF-2)` deleted from sentences; the sentences stay (Clarity F5, IxD ID-1, Governance, Regulation). Rule/control IDs and regulatory citations are **not** internal codes — they stay (see build gate G2).
- "Rulebook translation: unattested" appears as a checklist line here, because this is where it bears on the decision (Regulation, Clarity, Banking objections to removing it from the header).
- Protected strings, verbatim, exempt from any copy-shortening: the self-asserted-name caveat; the memo caption; the "Outstanding means…" sentence; the audit-trail proof-of-concept sentence; "Informs — the rules decide" (Regulation F2/F3, Governance, Banking).

### 3.2 Guided intake form (step 3 on the no-model path) — **CHANGE (restructure presentation; same 16 fields, same values)**

**Who it hurts today:** James, in his first ten minutes: 16 flat questions, a bracketed code after every option (~90 of them), and a full risk-methodology paragraph permanently open under several fields.

**Target state:**

```
Guided intake — answer the questions below. No AI reads your answers; the same answers always give the same outcome.
5 sections · 16 questions (13 required) · about ten minutes

1  ABOUT IT
   What do you want to call it? *        In a sentence or two, what does it do? *

2  WHAT IT USES  (input data)
   What kind of information does it use? *   — Pick the most sensitive kind it touches.   Why we ask ▸
     ○ Public — already published or freely available                    Public
     ○ Everyday business information — nothing sensitive                 Internal
     ○ Personal details of clients — names, accounts, anything identifying them   Client PII
     ○ Price-sensitive information — live deals, unpublished results     MNPI
   Where does that information sit today? *  — Before the AI touches it; if several places, the least protected.  Why we ask ▸

3  WHAT THE AI IS AND HOW IT RUNS  (processing)
   What kind of AI is it? *   How much can it do without a person? *
   Where does the AI itself run? * — Not where the data is stored — where it is sent to be processed.  Why we ask ▸
   Which approved platform does it run on? (optional — blank means: not on an approved platform)
   Whose model or service is it? (optional — blank means: assessed as built in-house)
   Which model does it run on? *

4  WHAT COMES OUT AND WHO IT REACHES  (output)
   What does it actually produce or do? *   Who sees what it produces? *   How much weight does its output carry? *
   If it gets something wrong, can it be undone? *
   What kind of decision does it feed? (optional — leave blank only if it feeds no decision at all)
   Does a person check it before anything happens? (optional)
   How widely is it used? *   ☐ It replaces something we already use

5  WHERE IT APPLIES  (jurisdictions)
   Which countries or regions does it touch? *  ☐ UK ☐ US ☐ EU ☐ CA ☐ SG ☐ JP ☐ None / not sure

One continuous scroll — no Next/Back paging.                                   [Continue]
```

**Specific moves and who asked for them:**
- Five plain-language section headers with the engine term beside each (Layout F6's grouping, IxD's vocabulary objection, Banking's "single scroll, not a wizard" condition). `fieldset`/`legend` for screen readers.
- The bracketed technical term leaves the clickable label and becomes a small, muted, **always-visible** suffix — not a tooltip (Clarity F3, IxD ID-3, Banking F3, Layout's no-hover rule). The code is still there for the model-validation reader; it is no longer what James reads first.
- Help text: one-line prompt always visible; the paragraph behind an accessible "Why we ask" disclosure (Banking F5, mirroring R9-SC-2). Where one extra sentence is load-bearing for a correct answer (e.g. "not where the data is stored — where it is sent to be processed") it stays visible.
- **No field goes behind an "advanced" toggle.** Platform, vendor and model stay visible and first-class (Governance AIG-3 non-negotiable); decision type and human-check stay in the main flow with their "leave blank only if…" guidance (Regulation F5, IxD's Round-2 concession). The "(optional — blank means: …)" phrase makes the meaning of silence explicit on the form itself.
- The `/approved|rejected/i` gate applies to every rewritten label (build gate G1).

### 3.3 Register list — **CHANGE (smallest, unanimous — build first)**

**Who it hurts today:** Priya, daily. Raw codes in the Stage column and filter chips; eleven ungrouped chips; no default "what is mine to act on"; Tier/Track chips with no meaning; the provisional roll-up styled as body text.

**Target state (2LoD view):**

```
Register
[PROVISIONAL] AIGate self-assessment pending 2LoD approval — all verdicts provisional until cleared.
              4 of 18 verdicts would be final once outstanding sign-offs land.                [Export JSON]

Showing: awaiting your sign-off (N)        [Show all 18]

Filter   Tier: ○Critical ○High ○Medium ○Low   Track: ○I ○II   Stage: ○Awaiting 2LoD sign-off ○Cleared
         Verdict: ○Approved ○Approved with controls ○Rejected
Legend   Tier = how much could go wrong — Critical, High and Medium wait for second-line sign-off; Low is self-service.
         Track = which oversight regime applies — I classic model risk · II extra scrutiny · III AI governance.
         Stage = where the case is in its life. Verdict = what the rules decided; "Provisional" means the
         rulebook behind it is not yet signed off by your firm.

Name                               Submitted by  Tier   Track  Verdict                          Stage                 Evaluated   Policy  Flags
Retail banking assistant chatbot   2LoD          High   II     Approved with controls·Provisional  Awaiting 2LoD sign-off  23/08/2026  1.3
▣ AIGate (self-assessment)         system        Medium II     Approved with controls·Provisional  Awaiting 2LoD sign-off  23/08/2026  1.3     (distinct row style + tag)
[IB] HR — Internal mobility chatbot 1LoD         Low    II     Approved·Provisional              Cleared               23/08/2026  1.3     sampling review due
```

**Specific moves and who asked for them:**
- `STAGE_LABELS` map in `field-copy.ts`: `pre_checked` → "Awaiting 2LoD sign-off", `approved` → "Cleared", `in_production` → "In production", `monitored`/`retired`/`idea`/`exploring` → plain words; used by the column and the chips; raw value kept as a data attribute for anyone reconciling with the audit trail (all six panels). **"Cleared", not "Approved"** — the reserved-word gate (Clarity's blocking objection to Layout's example) and because a Low-tier case reaches this stage self-service ("self-service final" in the store), so "Signed off" could overclaim. *Builder check:* confirm the two labels against the Low-tier lifecycle before they land.
- Chips grouped by taxonomy with labels (Layout F2), Stage and Verdict both kept — they answer different questions and Priya's queue needs the Stage dimension (Clarity and Governance versus IxD's aside).
- 2LoD default view = awaiting sign-off, with "Show all" one click away (Banking F4, Layout, Governance). The 1LoD register already scopes to own submissions — keep, reword the note (see §3.8).
- Always-visible legend for Tier/Track/Stage/Verdict instead of tooltips (Clarity F6's content, Layout's mechanism).
- Provisional roll-up becomes its own banner (Regulation F4). Stale/Sampling columns become a single "Flags" column with badges only when true, each badge with a stable accessible name so a screen reader hears "not flagged" rather than nothing (Governance AIG-6 + Layout). Self-assessment row gets a distinct row treatment (Governance AIG-8).

### 3.4 Appetite framework (policy screen) — **CHANGE (split the view; nothing removed)**

**Who it hurts today:** anyone who opens "§ Appetite framework" to understand the rules meets a raw YAML editor with Save as the page's main object.

**Target state:**

```
Appetite framework                                           policy v1.3 · 6 jurisdiction packs declared
The bank's rules, machine-readable and versioned. Every verdict traces back to a rule in here.
[Firm appetite — decides] [Regulation — decides, where the law applies] [Risk knowledge — informs, never decides]
[ACTION REQUIRED] Starter config in use — firm markers and the translation-fidelity attestation are unfilled;
                  verdicts are provisional until your CRO adopts this framework.        (kept; "(NF-10)" removed)
HARD LINES — five things no control set can fix; checked first      (plain list; HL ids quiet)
JURISDICTION PACKS — as today
RISK KNOWLEDGE (advisory) — as today
▸ Edit the rulebook as YAML — for the people who author the rules. Changing it changes every future verdict.
    (closed by default; opens the textarea, Validate, Save, and one honest line:
     "This build has no sign-in — anyone can open this. A real deployment restricts it to the rule authors.")
```

- Default view is the human-readable one for every role; the editor sits behind an explicit disclosure (Governance AIG-7, Regulation F6, Banking F6, IxD).
- **Not role-gated** — a second-line case reviewer is not automatically a rule author (Regulation's point), and a self-asserted role is not a lock (P1). Separation by information architecture and an honest sentence, not by a fake permission.

### 3.5 Confirm & attest (step 5) — **CHANGE — chair's addition, not raised by any panel**

`graph-summary.ts` renders `Model · traditional-ml`, `Autonomy · L3`, `Data zone · Zone B`, `Output · execute` on the screen whose button says "By confirming, you attest the data-flow graph above is accurate." That is the one place the plain word matters most. Route each value through the existing `field-copy.ts` labels: short plain phrase first, code small beside it ("A model trained on historical data · traditional ML"; "Acts on its own within limits set in advance · level 3"; "With an outside supplier · Zone B"; "Carries out the action itself · execute"). Also remove the `UC-6 · CONFIRM & ATTEST` tag (internal ID). The attestation sentence and the "read by the reviewer, not by the rules" note stay verbatim.

### 3.6 Graph review (step 3 on the model path) — **KEEP the R9 design; four small changes**

R9 already fixed this screen; the panels agree it is the template. Four refinements only:
- Field labels reuse the question's words: "data class" → "kind of information"; "decision bindingness" → "how much weight its output carries"; "output reversibility" → "can it be undone?"; "autonomy level" → "how much it does without a person" (IxD ID-5). The engine field name can sit as a quiet code.
- "model confident — no verified basis" is reworded toward action — "not found in your text — worth a second look" — and given the same badge shape as "guessed" so the two read as one family, but **keeps its own label and its own meaning**. The three provenance states (quoted / guessed / confident-no-basis) and the no-plain-confirm rule for guessed cards are untouched (Governance AIG-2, Layout, Banking, against IxD ID-6's merge). The card's existing Edit button is the action; no new logic.
- An unanswered decision type or human-check renders "not stated" with a quiet badge of the same family, so a reviewer sees that a materially relevant field was silent (Regulation F5; Governance and IxD concur).
- `aria-expanded`/`aria-controls` on the "Why these values matter" and Edit/Done buttons (Layout F5).
- Long provenance quotes may truncate with expand; **the values themselves never collapse** — they are what the human is attesting to (overrules Banking F7; see §5).

### 3.7 Targeted questions (step 4) — **KEEP**; remove the `UC-4 · TARGETED QUESTIONS` tag; where a question is "triggered by" a rule, show the rule's plain name with the ID quiet.

### 3.8 Global header and role switcher — **CHANGE (every screen)**

```
AIGate PRE-CHECK ENGINE · policy v1.3 · [⚠ rulebook translation: unattested ▸] · Viewing as: [1LoD — James · Dev ▾]
                                                                                 a view preference — this build has no sign-in
```
- "translation fidelity: unattested" is **compressed, not removed**: a small warning chip with an accessible disclosure (button with `aria-expanded`, not the `title=` tooltip it uses today) carrying the full sentence, plus the verdict-page checklist line in §3.1 (Clarity, Regulation and Banking against IxD ID-7 / Layout F7; P1 — a pack-level provisional marker travels with every decision it qualifies).
- The role switcher is relabelled "Viewing as" with an eight-word honesty note, and the 1LoD register note ("…require the 2LoD role") is reworded to match ("You're viewing as 1LoD — a view preference, not a permission; this build has no sign-in"). This is what makes the gating the product already does honest (P1), and it is the whole of the "role" work this round: **no new controls are hidden or shown by role beyond what ships today.**
- "1LoD"/"2LoD" get a first-mention gloss in the switcher options ("first line — submitter", "second line — reviewer").

### 3.9 Rule-improvement queue — **CHANGE (small)**
Lead with the rule's plain name, ID second (Clarity F8); "FIRED ON N DECIDED CASES" → "has applied to N decided cases"; a small source tag distinguishing "filed by a reviewer" from "filed automatically from a risk-knowledge coverage gap" (Regulation F7). The "advisory by construction" paragraph stays verbatim.

### 3.10 Intake describe (step 1), About, Settings, Demo data — **KEEP**
Already plain. One check: when no model is configured, the step-1 copy should say in one line what happens next ("your description is kept for the reviewer; you'll answer the guided questions next").

---

## 4. Conflicts between panels and how each was settled

| # | Between | Issue | Resolution | Principle |
|---|---|---|---|---|
| 1 | Banking F1 vs Clarity, IxD, Governance | Hide the sign-off buttons by role? | The buttons are **already** hidden for 1LoD in the shipped code. Keep that; add no new role-based hiding this round; label the switcher "Viewing as — a view preference, no sign-in" so the existing gating stops implying access control. Every *new* role difference is a default state, not a lock. | P1, P4 |
| 2 | Banking F6 / Governance AIG-7 / Regulation / IxD | Gate the YAML editor behind 2LoD? | Move the editor behind a closed-by-default disclosure; default view is the readable rulebook for everyone; not role-gated (2LoD ≠ rule author; a self-asserted role is not a lock). | P1, P3 |
| 3 | IxD ID-4 vs Regulation, Governance, Banking, Layout | Sticky Approve bar under the verdict summary | No. A "Before you sign off" checklist header (compressed reasoning with citations) plus a sticky section nav; the Approve control stays after the reasoning. Fogg's goal (reachable trigger) met by a jump link, not proximity. | P1 (attestation follows evidence), P5 (zoom/focus) |
| 4 | Layout F3 vs Regulation | Fold the 12-rule list to 1-of-12 | One line per rule, all 12 visible, prose behind a per-rule click; three-kind legend kept. Density win achieved without dropping 11 citations below a fold. | P1, P3 |
| 5 | IxD ID-7 + Layout F7 vs Clarity, Regulation, Banking | Remove "translation fidelity: unattested" from the header | Compress to a chip with accessible disclosure; add the line to the verdict checklist. Never remove from the decision path. | P1, P3 |
| 6 | IxD ID-6 vs Governance (blocking), Layout, Banking | Fold "model confident — no verified basis" into "guessed" | Keep three distinct states and gating; reword for action; same badge family, distinct label. | P1 |
| 7 | IxD ID-3 vs Governance AIG-3, Regulation F5 | Put platform/vendor/decision type behind an "advanced" toggle | No field hidden. Grouping + help-collapse + "(optional — blank means…)" give the density win; decision type / human-check get a "not stated" flag downstream. | P1, P2 |
| 8 | Layout vs Clarity F6, IxD ID-1, Banking F3 | Tooltips as the way to show meanings/codes | No hover-only meaning anywhere (including the header's existing `title=`). Short meanings always visible as secondary text or a legend; long content behind an accessible disclosure. | P5 |
| 9 | IxD ID-1 (list incl. INV/CTRL/HL) vs Governance, Regulation, Clarity | Which bracketed codes to strip | Three classes: internal spec/requirement codes (`LC-2`, `NF-2`, `PE-4`, `VD-4`, `NF-10`, `UC-*`) deleted; rule/control IDs (`INV-*`, `CTRL-*`, `HL-*`, `DR-*`) kept as quiet code beside the plain name; regulatory citations kept as chips. Named as three classes in the ticket so one regex cannot eat citations. | P1, P3 carve-out, P4 |
| 10 | IxD ID-2 aside vs Clarity, Governance | Drop the Stage column? | Keep both Stage and Verdict; relabel Stage in plain words. They answer different questions and Priya's default view needs Stage. | P3 |
| 11 | IxD vs Layout F6 | Form section header vocabulary | Plain header with the engine term beside: "What it uses (input data)". Single scroll, no wizard. | P4 |
| 12 | Clarity F2 vs Regulation | Replace the status chip stack with a sentence | Additive: plain lead sentence + the literal "Approved with controls · Provisional" pair kept together; only the raw `pre_checked` token leaves the row. | P1 |
| 13 | Banking F7 vs Governance, R9-SC-2 | Collapse confident fields on graph review into "N confirmed automatically" | No — the values are what the human attests to and "confirmed automatically" overclaims. Truncate long quotes instead. | P1 |
| 14 | Layout F8 vs Governance | Checklist items "disappear when done" | They move to an "addressed" group with their UNVERIFIED/IN PLACE status attached; nothing vanishes. | P1, P3 |
| 15 | Governance AIG-6 + Layout | Stale/Sampling columns → badges | Single "Flags" column, badge only when true, stable accessible name for the empty state. | P3, P5 |
| 16 | Layout F1 example vs Clarity (blocking) | Stage label "Approved" | "Cleared". Reserved-word gate on every new label. | P6 |
| 17 | IxD / Banking vs the code | "Make the describe path the default" | Already is; no change. | — |

---

## 5. Dissents recorded (nobody silently outvoted)

- **Interaction design — ID-4 (sticky Approve bar).** Overruled: an attestation control positioned before the evidence it attests to is the ritual-checking failure the product exists to prevent. Their goal is met by the checklist header and section nav.
- **Interaction design — ID-6 (merge no-basis into guessed).** Overruled: the two are different epistemic states with different gating; the reword is adopted.
- **Interaction design — ID-3 (advanced toggle).** Overruled: model/vendor/platform are first-class governance fields; decision type and human-check must not become easier to skip.
- **Interaction design — ID-1's inclusion of `INV-*`, `CTRL-*`, `HL-*` among codes to remove.** Overruled: rule and control IDs are the audit citation a 2LoD reviewer needs; they stay, demoted beside the plain name. Spec IDs go, as they asked.
- **Interaction design ID-7 and Information layout F7 (remove the fidelity marker from the header).** Overruled to "compress": it is a pack-level provisional marker and must stay on the decision path.
- **Information layout — F3 (1 of 12 rules visible).** Overruled on the number: all 12 one-liners stay visible; their density goal is adopted.
- **Information layout — F1's worked example "Approved".** Overruled by the reserved-word gate; "Cleared".
- **Banking practice — F1 (render sign-off buttons only for 2LoD).** Moot in substance — already shipped — and overruled in framing: no sticky bar keyed to role; the switcher is labelled a view, and no further role-based hiding is added in a build with no sign-in.
- **Banking practice — F6 (gate YAML behind 2LoD).** Overruled: information-architecture split plus an honest sentence; a case reviewer is not a rule author.
- **Banking practice — F7 (collapse confident fields).** Overruled: the human attests to visible values.
- **Regulation — counter-proposal to put platform/vendor behind progressive disclosure.** Overruled (minor): no field is hidden; Governance's non-negotiable wins.
- **Clarity — F6 tooltip mechanism and F2 full replacement of chips.** Overruled on mechanism only (legend, not tooltip; additive, not substitutive); their content is adopted.
- **Information layout — F6 exact "Input / Processing / Output" headers.** Modified: plain headers with the term beside.

---

## 6. Options for the owner

**Option A — Patch the copy (1–2 chunks, ~2 days of pipeline work).** `STAGE_LABELS`; strip internal spec codes; technical terms on form options become muted suffixes; "firm rules (invariants)"; no-basis badge reword; Confirm & attest labels; role-switcher honesty label. *Cost:* small; one or two releases; modest test churn. *Risk:* the verdict page stays a wall and the form stays flat — your "too confusing" complaint survives on the two screens that matter most. This is the floor, not the fix.

**Option B — Targeted redesign, one coordinated round (recommended; 5 chunks, roughly 6–9 working days at this project's R9/R14 pace).** Everything in A plus: verdict/sign-off recomposition (§3.1), intake form grouping and help-collapse (§3.2), register default view, grouped chips, legend and banner (§3.3), policy-screen split (§3.4), graph-review refinements and accessibility (§3.6), queue copy (§3.9), header chip (§3.8). Shipped as a requirements round (R-next) with test cases, like R9, so the "never delete" rule is test-enforced. *Cost:* five chunks, each with its own build, three test runs, spec `.md` + `.html` parity, and a live walkthrough; expect to update scoped test queries in several files. *Risk:* moderate and known — reserved-word collisions (gated), an implementer conflating citations with spec IDs (gated by the three-class rule), spec drift (gated by parity check). No engine, audit or honesty change, so the determinism and honesty tests are the safety net.

**Option C — Full redesign (new information architecture / visual language from a fresh mockup; 3–6 weeks plus full re-verification).** *Cost:* high — every disclosure re-derived, `field-copy.ts`/R9/R14 infrastructure discarded, ~540 tests revisited. *Risk:* highest — the hedged-sounding caveats that make the product defensible ("self-asserted", "restates the record; does not strengthen it", "proof-of-concept grade") are the first casualties of a "make it feel finished" pass; and no panel found a fault in the flow that would justify it. Not recommended.

**Recommendation: B.** If you want to see value fastest, build chunk 1 (register) first — it is unanimous, tiny, and a warm-up for the pattern — then the verdict page, then the form.

---

## 7. Build order and the gates every chunk must pass

**Order (by impact, with the cheapest unanimous item first as a warm-up):**
1. Register list (§3.3) + `STAGE_LABELS` + role-switcher label (§3.8).
2. Verdict / sign-off recomposition (§3.1).
3. Guided intake form (§3.2) + Confirm & attest (§3.5) + questionnaire tag (§3.7).
4. Appetite framework split (§3.4) + header chip (§3.8).
5. Graph review refinements (§3.6) + rule-improvement queue (§3.9).

**Gates (stated once, applied to every chunk):**
- **G1 Reserved words** — every new rendered string checked against `/approved|rejected/i` (verdict status strings excepted).
- **G2 Three classes of code** — spec/requirement IDs deleted; rule/control IDs kept as quiet code beside a plain name; regulatory citations kept as chips. Named in the ticket.
- **G3 Accessibility** — no hover-only meaning; every new fold/toggle has programmatic open/closed state (reuse the native `<details>` Fold; add `aria-expanded` to button toggles); sticky nav collapses at high zoom.
- **G4 Boundaries** — nothing in `src/engine`; presentation-only (Rule 4); determinism test untouched; no new writes from rendering.
- **G5 Protected strings, verbatim** — self-asserted-name caveat; memo caption; "Outstanding means…"; audit-trail proof-of-concept sentence; "Informs — the rules decide"; provisional banner text; "The model proposed everything below…" gate note.
- **G6 Role** — no new conditional rendering by role beyond today's; the switcher says it is a view.
- **G7 House ritual** — `npm test` ×3, `tsc`, build, spec-parity (edit both `.md` and `.html`), live walkthrough of the affected screen, commit and push per milestone.

---

## 8. What the two users see afterwards

**James (1LoD, ten minutes):** step 1 describe → five grouped sections with plain options and a small grey code beside each → a review card whose labels use the words he just read → a Confirm screen that says "A model trained on historical data" not "traditional-ml" → a verdict page that opens on "What you need to do" as a nine-line checklist he can expand item by item; no Approve button (as today), and everything his reviewer will see still one click away.

**Priya (2LoD, queue of twelve):** the register opens on "awaiting your sign-off (N)" with grouped filters and a legend → each case opens on the provisional banner, then "Before you sign off — five things to check" with jump links → twelve one-line rules with citations, controls with status on every line, the evidence table still unfolded while anything is unverified → the sign-off form exactly where it is today, with the self-asserted-name caveat exactly as strong as it is today.

---

## 9. Non-negotiables preserved, panel by panel

- **Clarity:** no disclosure removed; canonical vocabulary retrievable on every screen (quiet code / muted suffix); every label has a plain companion via `field-copy.ts`; reserved words gated; R9 shape reused; engine untouched.
- **Interaction design:** deterministic non-chatbot framing and visible "why" kept; each persona's question leads its screen (James: what to do; Priya: before you sign off); internal spec IDs out of prose; reserved words; presentation-only.
- **Information layout & accessibility:** honesty markers by text/icon never colour alone; progressive disclosure never deletes; default-open tracks importance; every disclosure has programmatic state; no raw enum on any screen.
- **AI governance:** proposed/guessed/confident-no-basis per field intact with no-plain-confirm on guessed cards and no "confirm all"; model/vendor/platform first-class; three levers visually distinct with the advisory qualifier at first mention; hard lines / firm rules / country rules kept as three labelled kinds; attestation record intact; no overclaiming.
- **Regulation & supervisory:** every citation stays attached to its rule line; Provisional/UNVERIFIED/OUTSTANDING inseparable from what they qualify; audit trail unfolded, complete, labelled proof-of-concept; named sign-off distinct, with the self-asserted caveat beside Approve; three-lever separation; rule → control → citation → evidence chain traceable end to end.
- **Banking practice:** verdicts traceable to rule and citation even when compressed; honesty markers at full strength; three levers visible; sign-off controls never reachable or visually prominent for the 1LoD view (as today) and the role switcher honest about being a view; plain-language work confined to rendering.
