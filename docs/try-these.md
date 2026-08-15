# Eleven things to try

Cases chosen to make the engine do something different each time — a clean
approval, four different hard-line rejections, platform inheritance both
working and failing, a jurisdictional override, and the two ways a verdict can
be provisional.

**Every outcome below was produced by running the real engine**, not written
from memory. They are pinned by `src/engine/try-these.test.ts`, so a policy
change that alters any of them fails the suite rather than quietly making this
page wrong.

**How to run one.** New pre-check → paste the description → **Read & extract**
→ the guided form opens → set the fields listed → **Continue** → **Proceed** →
**Confirm and evaluate**.

**Why the form matters more than the description.** With no API key the
description is used for the duplicate check and shown back to you, but it does
**not** drive the verdict — your form answers do. So paste the text, then set
the fields. (With an API key the description is read into the graph instead —
but know that this path has never been exercised live; every test mocks the
API. These eleven cases assume the verified form path.)

Fields not listed can be left at whatever you like; they don't change the
outcome for that case.

---

## 1. Clean approval — nothing triggers

> A dashboard that summarises last month's internal ticket volumes for the
> operations team. It reads from our own reporting database and produces a
> written summary. Nobody acts on it automatically.

**Fields:** information = *Everyday business information*, sits = *Inside the
firm only*, AI type = *A calculation or scorecard*, autonomy = *level 0*,
runs = *Inside the firm only*, does = *read*, who sees = *internal-only*,
weight = *non-binding*, reversible, limited scale, jurisdiction = UK

**Expect:** **Approved**, Tier Low, Track I. No controls, no reviews, no
provisional banner.

*This is the baseline. If everything looks alarming, come back here.*

---

## 2. Hard line — price-sensitive data outside the controlled zone

> A drafting assistant that helps the deals team write summaries of live
> transactions. It runs on a cloud service outside our own systems.

**Fields:** information = *Price-sensitive information (MNPI)*, sits = *With
an outside supplier (Zone B)*, AI type = *LLM*, autonomy = *level 1*,
runs = *Zone B*, does = *draft*, internal-only, advisory, reversible, limited,
UK

**Expect:** **Rejected**, binding constraint **HL-002**. No controls offered.

*The point: hard lines are checked first and no control set can fix one. The
verdict tells you that explicitly rather than proposing mitigations.*

---

## 3. Hard line — autonomous lending with nobody in the loop

> A model that approves or declines personal loan applications automatically.
> Once it decides, the decision goes straight to the customer with no human
> review.

**Fields:** information = *Client PII*, Zone C, traditional ML, autonomy =
*level 4*, Zone C, does = *approve*, client-facing, binding, reversible,
at scale, decision type = *credit decision*, person checks = *no*, UK

**Expect:** **Rejected**, binding constraint **HL-003**.

---

## 4. Hard line — an agent that binds the firm

> An agentic assistant that can decide its own steps, call internal systems and
> commit the firm to supplier orders without a checkpoint.

**Fields:** Internal, Zone C, AI type = *agentic*, autonomy = *level 4*,
Zone C, does = *execute*, internal-shared, **binding**, reversible, at scale, UK

**Expect:** **Rejected**, binding constraint **HL-006**.

---

## 5. Hard line — and a lesson about which one gets named

> An execution algorithm that buys and sells positions in the market on its own
> once it is switched on.

**Fields:** Confidential, Zone C, ML, autonomy = *level 4*, Zone C, does =
*trade*, **market-facing**, binding, **irreversible**, at scale, decision type
= *trading*, UK

**Expect:** **Rejected** — but the binding constraint is **HL-001**, not
HL-004.

*Worth understanding: this use case crosses two hard lines. HL-001 (level 4 +
irreversible + market-facing) and HL-004 (autonomous trading) both apply, and
the engine names the first in rule order. Change reversibility to* reversible
*and re-run: HL-001 stops applying and HL-004 is named instead. Same rejection,
different reason — and the reason is what a committee argues about.*

---

## 6. Platform inheritance working

> A model that ranks internal support tickets by likely resolution time so the
> team can plan capacity. It runs on our approved internal ML platform.

**Fields:** **Confidential**, Zone C, ML, autonomy = *level 2*, Zone C,
does = *recommend*, **internal-shared**, advisory, reversible, limited,
**platform = PLAT-INTERNAL-ML**, UK

**Expect:** **Approved with controls**, Tier Medium, Track II. Three controls
**inherited** from the platform — `CTRL-DRIFT-01`, `CTRL-ENC-01`,
`CTRL-FINGERPRINT-01` — so the use case itself is asked for none.

*This is the case that shows the product's economics: the platform approval
did the work, and the inheritance panel shows the envelope that justified it.*

---

## 7. Platform inheritance withdrawn

> A chatbot on our approved cloud LLM service that answers customer questions
> about their accounts, using their personal details.

**Fields:** **Client PII**, Zone B, LLM, autonomy = *level 1*, Zone B,
does = *draft*, **client-facing**, advisory, reversible, at scale,
**platform = PLAT-CLOUD-LLM**, UK

**Expect:** **Approved with controls**, Tier High, Track II, **8 controls** and
1 downstream review. **Nothing inherited.**

*Compare directly against case 6. Same idea — an approved platform — opposite
result. The cloud LLM platform is cleared for internal drafting on Internal
data only; client-facing output and Client PII both fall outside its envelope,
so the inheritance panel names each breached dimension with the cleared value
beside your value. Eight controls is the cost of leaving the envelope.*

---

## 8. Jurisdiction changes the answer

> A model that screens job applications and shortlists candidates for
> interview. It is used for roles across our European entities.

**Fields:** Client PII, Zone C, traditional ML, autonomy = *level 2*, Zone C,
does = *recommend*, internal-shared, material, reversible, at scale,
decision type = *hiring*, **jurisdiction = EU**

**Expect:** **Approved with controls**, Tier **Critical**, Track I,
**Provisional**.

*Hiring alone tiers High under the firm's own rules. The EU AI Act pack floors
it to Critical under Annex III §4(a) — so the firm has its own position AND the
jurisdiction can raise it. Re-run with jurisdiction = UK only and watch the
tier drop. The reasoning chain shows the verbatim Annex III text that did it.*

---

## 9. Both ways a verdict can be provisional at once

> A model that ranks overdue retail accounts so collections agents work the
> highest-recovery cases first.

**Fields:** Client PII, Zone C, traditional ML, autonomy = *level 2*, Zone C,
does = *recommend*, **client-facing**, material, reversible, at scale,
decision type = **Something else — let me describe it** → type
`collections prioritisation`, UK

**Expect:** **Approved with controls**, Tier High, Track I, and a banner
carrying **two** causes — an unadopted pack rule, and:

> the decision type entered is not one your policy has a rule for … Entered:
> "collections prioritisation".

*The engine did not quietly guess. Collections prioritisation matches no
decision-type rule, so none was applied, and the verdict says the tier rests on
your other answers. Over time these entries are a list of the gaps in your own
framework.*

---

## 10. The full picture

> A model scores retail credit card applications for UK and German customers
> using income, employment history and bureau data, and automatically declines
> applications below a cutoff.

**Fields:** Client PII, Zone C, traditional ML, autonomy = *level 3*, Zone C,
does = *approve*, client-facing, binding, reversible, at scale, decision type =
*credit decision*, person checks = *no*, platform = PLAT-INTERNAL-ML,
**jurisdictions = UK and EU**

**Expect:** **Approved with controls**, Tier Critical, Track I, binding
constraint **INV-AUTONOMY-01**, 6 controls, 2 downstream reviews, Provisional.

*The demo case. It exercises everything at once: a jurisdictional override, an
envelope breach, a governance margin with three invariants resting on a single
control, a full reasoning chain, and an information-security review triggered
downstream. Scroll the whole verdict.*

---

## 11. Things worth breaking

Not scripted — poke at these.

- **Go back.** Get to the graph step, hit **← Back** twice, change an answer,
  come forward again. The duplicate check should re-run, not hang.
- **Contradict yourself.** Say "no personal data" in the description, then pick
  *Client PII* in the form.
- **Sign off on your own submission.** Approve as 2LoD a case you just
  submitted, then read what the record says about it.
- **Try to edit the audit trail.** There is no way to. That is the feature.
- **Empty the name field** on a sign-off and press Approve.
- **Read the Appetite framework** page, change a materiality threshold in the
  YAML, save, and re-run case 1.
- **Narrow your browser window** to phone width on the register.

---

## What to tell me

Most useful, in order: something that is **wrong** (a verdict you'd argue
with), something that is **unclear** (you can't tell why it decided that), and
something that is **missing**. The first two are worth more than bugs — the
engine being confidently wrong about a real case is the only thing that
invalidates the whole idea.
