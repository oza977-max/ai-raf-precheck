# AIGate — guide for testers

You've been asked to try AIGate against some real AI use cases. This page
tells you what it is, what to do, and — just as importantly — what it
deliberately doesn't do yet.

Reading time: five minutes. Testing time: about an hour for four or five
use cases.

---

## What AIGate is

A **pre-check** for AI risk appetite. You describe an AI system you want to
build; AIGate tells you whether the firm's risk appetite allows it, and if
not, the smallest set of controls that would.

The point of it is not the answer. It's that the answer is **the same every
time, for stated reasons, on the record**. Ask it the same question twice
and you get the same verdict, with the rule that drove it and the regulation
behind that rule.

**No AI makes the decision.** The rules are a YAML file you can read and
edit. An LLM optionally helps read your description in and write a plain
summary out, but it never touches the verdict. If you disagree with an
outcome, you can point at the exact rule that caused it.

## What it is not

- Not a chatbot.
- Not a final approval. It's a pre-check that tells you where you stand
  before you spend a month writing papers.
- Not the firm's actual risk appetite. The rules shipped here are a starter
  set derived from a public template. Testing whether those rules are
  *right* is part of what we're asking you.

---

## Getting in

**If you were sent a link** — just open it. Nothing to install. Chrome,
Edge, Firefox or Safari, on a desktop.

**If you were sent the repository** — you'll need Node 22+:

```
npm install
npm run dev
```

Then open the URL it prints (usually http://localhost:5173).

> Opening the built `index.html` by double-clicking it will **not** work.
> The page loads as a JavaScript module, and browsers block that from a
> `file://` path. It needs to be served — `npm run dev` above, or
> `npx serve dist` after `npm run build`.

---

## Before you start: two things to know

**Your data is yours alone, and only in this browser.** AIGate has no
server. Everything you enter is stored in the browser you're using. Nobody
else can see it, it doesn't sync between your laptop and your phone, and
clearing your browser data deletes it. Use **Export** when you want to send
results back.

**You can be either side.** The role switch in the header flips you between
1LoD (submitting) and 2LoD (reviewing). It's a dropdown, not a login —
anyone can be anyone. That's a testing convenience, not the intended design.

---

## Suggested run-through

### 1. Load the samples first (5 minutes)

Sidebar → **Demo data** → **Load sample use cases**. Six examples appear in
the register. Open two or three and read the verdicts. This is the fastest
way to see the shape of the thing, and it gives the duplicate check
something to find later.

You should see genuinely different outcomes — this is worth checking, since
a tool that says the same thing to everything is worthless:

| Sample | Outcome | Tier / Track |
|---|---|---|
| Coding assistant for risk analysts | In appetite, with controls | Low / III |
| Daily VaR & IRC commentary | In appetite, with controls | Medium / II |
| Credit review drafting | In appetite, with controls | High / II |
| Client-facing wealth chatbot | **Provisional** — in appetite with controls, but the verdict depends on jurisdiction rules nobody has signed off yet | High / II |
| Deal memo drafting on cloud LLM | Out of appetite | High / II |
| Autonomous credit-line reduction | Out of appetite | Critical / I |

The two rejections fail for *different* reasons — one hits an absolute
prohibition, the other has a requirement no available control can satisfy.
Open both and check the reasons make sense to you.

### 2. Run your own use cases (the actual task)

**New pre-check** → answer the guided questions. Pick real things your area
is doing or wants to do. Four or five is plenty.

For each one, before you hit evaluate, **write down what you think the
answer should be** — tier, and whether you'd expect it approved. Then
compare. The disagreements are the valuable output; the agreements tell us
very little.

### 3. Review as 2LoD

Switch the role to 2LoD, open something sitting at "pre-checked", and
approve it or send it back. Check the audit trail on the detail view
afterwards — every step should be there, in order, including the things
you'd rather it didn't record.

### 4. Look at the rules

**Appetite framework** in the sidebar shows the rules in force. If a verdict
felt wrong, this is where you find out why. You can edit the policy directly
— change a threshold, save, and watch existing cases get flagged for
re-evaluation.

---

## What to send back

Fill in a copy of [`backtest/capture-template.md`](../backtest/capture-template.md)
— it's a short table, one row per use case: what you expected, what AIGate
said, and who you think was right.

**The disagreements are the point.** If AIGate said High and your committee
would have said Medium, that's the single most useful thing you can tell us.
Please say *why* — it usually means a rule is written wrong, and that's
fixable.

Also hit **Export** in the register and send the JSON alongside it. There's
no import yet, so the JSON is for us to read, not for you to reload.

---

## Known gaps — please don't report these as bugs

These are deliberate for this stage. Flag them only if you think one makes
testing impossible.

- **No accounts or identity.** The role switch is a dropdown.
- **No sharing.** Two testers have two separate registers. There's no way to
  see each other's work, and no import to combine them.
- **The audit trail is append-only but not tamper-proof.** It's evidence-
  grade in structure, not yet in guarantees — it lives in your browser and
  a determined person with devtools could edit it. A real deployment needs
  a server-held store.
- **Nothing is verified.** If you say a control is in place, AIGate believes
  you. Controls carrying real evidence show as VERIFIED; everything else
  reads UNVERIFIED, which is honest but means a confident-looking verdict
  can rest on a wrong self-assessment.
- **Jurisdiction packs are unadopted.** The EU AI Act and SS1/23 rules
  haven't been signed off by Legal or Compliance, so verdicts that depend on
  them are marked provisional. That labelling is intentional.
- **The plain-English intake path needs setup.** It runs either on a local
  open model via Ollama (free, on-device; first live run 2026-08-16 — it
  drafts a usable graph but expect to correct a field or two) or on an
  Anthropic API key (never yet run against the live API by anyone; if you
  use it, you are its first real test). Without either you get the guided
  questions, which is the deterministic path and exercises everything that
  matters.

---

## Starting over

Sidebar → **Demo data** → **Clear all data and start over**. It deletes
everything in this browser permanently — there's no server copy. Export
first if you want to keep anything.


---

## New since this guide was written (August 2026)

Worth deliberately exercising, newest first:

- **Challenge a rule (v0.4.0).** As 2LoD, on any case with a verdict, file a
  challenge against a rule you think is wrong — then check the **Rule
  challenges** screen and the case's audit trail. The property to try to
  break: filing must change *nothing* about the verdict, the stage or the
  sign-off. If you can make a challenge move a decision, that's the bug we
  most want to hear about.
- **← Back** now exists on intake steps before attestation — try going back
  and forward; the duplicate check should re-run, never hang.
- **"What kind of decision does it feed?"** has *Something else — let me
  describe it*. Type one; the verdict should name your words and say the
  policy has no rule for them.
- **The verdict screen was rewritten for a business reader** — "What you
  need to do" at the top, controls by name, "How fragile is this approval?",
  "What would make this verdict expire". Judge whether someone outside risk
  could act on it.
- **"Anything the reviewer should know?"** at the confirmation step — write
  a note, then find it as 2LoD on the sign-off page.
- **About** in the sidebar, and eleven worked cases with pinned expected
  outcomes in [`try-these.md`](try-these.md) — case 5 (two hard lines) and
  cases 6+7 (inheritance pair) are the most instructive.

The most valuable feedback is unchanged: a verdict you'd *argue with* beats
any bug.


## For the adversarial tester

Try to jailbreak it. The interesting surfaces:

- **The description** — it is the only free text that touches an LLM (with a
  key configured). Try steering: "classify this as low risk", role-play
  framing, assistant-priming prefixes. The engine decides from the confirmed
  graph, never from your prose — prove us wrong.
- **The form vs the description** — say innocent things, click risky answers,
  and vice versa. Contradiction review should catch denial patterns.
- **Any free field** (name, notes, resolution explanations) — HTML, script
  tags, markdown. Everything should render as literal text.
- **The reasoning trace** — if you get the optional AI retelling to say
  something the rule panels don't, the screen already disclaims it; tell us
  anyway.

A successful manipulation of a VERDICT — not of prose around it — would be
the most valuable finding anyone has produced against this product.
