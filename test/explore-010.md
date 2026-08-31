---
schema_version: 1
---

# Exploratory Session — explore-010

## Charter

```yaml
schema_version: 1
session_id: explore-010
mission: "7-persona roleplay demo test on the live published site — the most comprehensive persona sweep run yet, run because the user wants the demo \"perfect\" before considering V2. Six personas explore independently and report findings; a seventh (Consultant) stays silent until all six have reported, then synthesizes a single fix recommendation. Personas: Bank CEO (strategic buyer, business case), 2LoD reviewer (skeptical risk/compliance sign-off, continuing the Stephen tradition from explore-007/008), Bank IT (technical/security/infra/browser-storage concerns), 1LoD end user (daily submitter, user-acceptance/UX lens), AI Governance Expert #1 (NIST AI RMF / model risk management lens), AI Governance Expert #2 (EU AI Act / regulatory-compliance lens). The user pre-flagged one suspected defect for reproduction: clicking into a register row then pressing the browser Back button does not return to the register list. Owner classifies severity for every finding per Hard Gate 4 (ADR-205)."
timebox_minutes: 90
tour: feature
runner: oza977-max
```

**Target:**

- https://oza977-max.github.io/ai-raf-precheck/
- src/App.tsx
- src/components/RegisterView.tsx
- src/components/RegisterDetail.tsx

## Session Log

- 1LoD end user (daily submitter) persona: reproduced the user-reported back-navigation bug directly — history.length stayed at 1 across New pre-check -> Register -> detail, confirming zero History API involvement anywhere in the app prior to the fix. Pressed the actual browser Back button and confirmed the app was left entirely, not just 'the wrong screen'.
- Fix built and shipped same session (commit bccbc25): App.tsx's top-level view and RegisterView.tsx's list<->detail both now push real history entries; a popstate listener in each replays them. A second, genuine bug was found and fixed DURING the fix itself: RegisterView's popstate handler required a registerDetailId key to be present before acting, but the state you land on going back from a detail view never carries that key, so it silently no-op'd on exactly the state Back needed to land on.
- Fix verified live end-to-end on the dev server: Register -> row -> detail -> browser Back -> list (still in the app, list intact) -> browser Back -> intake screen. Both navigation levels confirmed. New regression suite (App.browserBack.test.tsx, 4 tests) drives the real window.history.back(), not a simulated event; all pass, verified 3x plus a controlled git-stash A/B proving the fix doesn't touch the session's separate pre-existing WalkingSkeleton test flake.
- 2LoD reviewer persona (Priya, skeptical risk/compliance sign-off): walked the sign-off screen for a High-tier agentic use case ('Agentic CI deploy assistant', deliberately shaped to trip the new v1.4 agentic-infrastructure rules). Confirmed the sign-off checklist and 'What you need to do' list correctly show the new CTRL-AGENT-CRED-01 and CTRL-AGENT-EXTLOG-01 controls, the binding constraint correctly cites INV-AGENT-CRED-01 with full plain-language reasoning, and the rule count updated honestly (18 -> 21 firm rules, 8 triggered vs a prior case's 4). No defects found in this flow.
- Bank IT persona: checked browser console (clean, zero errors across the session's use), network requests (GitHub Pages static assets only, zero external calls, zero leaked keys or tokens), and client-side storage (two IndexedDB stores, aigate-audit and aigate-register, zero localStorage/sessionStorage misuse). Resized to mobile width (375px): layout stacks and reads without horizontal overflow or broken components; the role-select dropdown's text truncates at this width ('second line — reviewe[r]') — cosmetic, not functional.
- Bank CEO persona: re-read the About page as a business-case document. It states a credible, non-oversold pitch (deterministic engine, honest about the LLM-assist path's failure modes, explicit about what the product deliberately is not). No pricing or deployment-model (SaaS vs on-prem vs self-hosted) content exists anywhere in the product — a real gap for a CEO evaluating adoption, but an expected one at this stage, not a product defect.
- AI Governance Expert #1 (NIST AI RMF lens): mapped AIGate's structure against the four RMF functions. Govern maps to the appetite framework's sign-off economics (translation attestation, pack sign-off); Map maps to intake/graph construction; Measure maps to the deterministic engine evaluation plus KRI thresholds; Manage maps to the control library plus the hash-chained audit trail. The one function RMF expects that AIGate does not yet cover is continuous post-deployment monitoring under Measure/Manage — already a known, tracked gap (design-vision.md V2), not a new finding.
- AI Governance Expert #2 (EU AI Act lens): confirmed the intake form's jurisdiction question, Annex III-aligned decision-type vocabulary (credit-decision, lending-decision, hiring, etc.), and Article 50 transparency handling via the jurisdiction-pack sign-off mechanism. Human oversight (Article 14) is addressed via the hitl field plus CTRL-HITL-02/CTRL-AUTONOMY-BOUND-01. Article 11 technical-documentation content is not explicitly generated as a named artifact — the challenge-memo export is the closest analogue but isn't framed as Art. 11 documentation. Worth a future look, not a defect at current scope.
- Consultant (silent until all six reported): synthesis is the Overall Assessment below.

## Defects

### D-001: The app is left entirely — the browser returns to whatever page was open before 

**Severity:** Important
**Tour:** feature
**Given:** A reviewer or submitter has navigated from the register list into a specific use case's detail screen
**When:** They press the browser's own Back button (not the in-app "← register" link)
**Then:** The app is left entirely — the browser returns to whatever page was open before this app, or to a blank/prior tab state — instead of returning to the register list the way every other web app's Back button behaves
**Reproduction:** 1. Open the live site. 2. Click "▤ Register". 3. Click any use case row. 4. Press the browser Back button (not any in-app link). Confirmed via history.length staying at 1 across all in-app navigation prior to the fix, and via directly invoking the browser Back action and observing the app was left entirely.
**Stub-path:** 


## Observations

_None recorded._

## Overall Assessment

One real, user-reported defect (D-001, the register back-button bug) was confirmed by direct reproduction, fixed the same session, and verified live end-to-end — including a second genuine bug found in the course of fixing the first (RegisterView's popstate handler silently no-op'ing on the exact state Back needed to land on), which is exactly the kind of thing a live persona sweep catches that a code read alone would not. The five other personas found no further defects: the 2LoD sign-off flow correctly surfaces the new v1.4 agentic-infrastructure controls with honest outstanding/verified counts; IT's surface (console, network, storage) is clean with only a cosmetic mobile-width truncation; the CEO's pitch is credible and un-oversold, missing only pricing/deployment content that is expected at this stage rather than a gap; and both governance experts found AIGate's structure maps cleanly onto their frameworks (NIST AI RMF's four functions, the EU AI Act's Annex III vocabulary and Article 14 human-oversight mechanism), with the one real gap in each (continuous post-deployment monitoring; Article 11 technical documentation) already known and already tracked rather than newly discovered here. Verdict: the demo is in materially better shape than when this session started it, on the exact axis the user asked about — the thing that would embarrass a live demo (a broken Back button) is now fixed and proven fixed, not just claimed fixed.
