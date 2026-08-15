# Glossary

The product speaks the language of bank risk management. Every term it uses,
in plain words. Terms link to where you meet them.

| Term | Plain meaning |
|---|---|
| **Risk appetite** | A written statement of what risk a firm will and will not accept, agreed at board level. AIGate's whole job is turning this from prose into enforceable rules. |
| **RAF** | Risk Appetite Framework — the document above, plus the governance around it. |
| **1LoD / 2LoD** | "First and second line of defence." 1LoD is the business building or using the AI — they own the risk. 2LoD is the independent risk function that checks them. In AIGate, 1LoD submits use cases; 2LoD signs them off. |
| **Use case** | One proposed or existing application of AI — "a model that scores credit card applications". The unit everything else attaches to. |
| **Data-flow graph** | The structured description of a use case: what data goes in, what model processes it, what comes out, who sees it. This — not your prose — is what the rules are evaluated against. |
| **Hard line** | A rule that no set of controls can fix. Cross one and the verdict is outside appetite, full stop — e.g. price-sensitive information processed outside the firm's own systems. Checked before anything else. |
| **Invariant** | One of the firm's appetite rules that a use case must satisfy. Unlike a hard line, an invariant names the controls that satisfy it — which is how a use case can come back inside appetite. |
| **Control** | A named measure that satisfies one or more invariants — drift monitoring, bias testing, a human escalation route. The engine returns the *smallest* set that works, not a checklist of everything. |
| **Tier** | How much could go wrong: Critical / High / Medium / Low. Set by the most demanding rule that matches — a credit decision about a person is Critical no matter how simple the model. Decides who must sign off. |
| **Track** | Which oversight regime applies — Track I is traditional model risk management, Track III catches generative and agentic AI that newer regulation carves out of the classic model definition. |
| **Jurisdiction pack** | A file of rules derived from one regulator's text — SS1/23 (UK), SR 26-2 (US), EU AI Act, DORA. Each rule quotes the verbatim passage it comes from. Packs only activate for jurisdictions the use case actually touches. |
| **Starter policy** | The complete, working ruleset the app ships with — derived from a regulator-grounded template. The app is never rule-less; it is *authority-less* until your firm adopts the rules as its own. Adoption changes no verdict, only removes the provisional stamp. |
| **Citations on rules** | Both kinds of rule cite regulation, in opposite directions. On a *firm* rule the citation is **motivation** — why the firm holds this position; the firm can change the rule freely. On a *pack* rule the citation is **obligation** — the rule exists because the regulation says so, quoted verbatim, and binds whenever that jurisdiction applies. |
| **Basis** | What a pack rule claims about its own quote: **verbatim** (restates it), **derived** (infers from it), or **judgement** (a legal position). Replaced a numeric confidence score, which nobody could verify. |
| **Sign-off** | A named person, role and date standing behind a judgement. Only three kinds exist: per-regulation pack sign-off (once, by Legal/Model Risk/Tech Risk), the translation attestation (once), and per-use-case 2LoD sign-off. The first two are a one-time afternoon; only the third recurs. AIGate never interprets regulation on its own authority. |
| **Provisional** | The verdict's way of saying "correct, but not yet fully authorised" — a rule was applied that the firm hasn't adopted, or a decision type wasn't in the policy's vocabulary. The banner names who needs to act. |
| **Attestation** | The submitter's on-the-record confirmation that the described facts are accurate — timestamped, permanent, and the point after which there is no going back in the flow. |
| **Audit trail** | The append-only record of everything that happened — submissions, verdicts, corrections, sign-offs. Nothing in the application can edit or delete an entry. |
| **Register** | The firm's inventory of AI use cases, held as a graph so a shared platform or vendor appears once, connected to everything that uses it. |
| **Standing conditions** | The operating bounds a verdict assumes — drift limits, incident counts, the attested autonomy level. The verdict holds only while the system stays inside them. |
| **Governance margin** | How much slack the control set has. A rule satisfied by exactly one control has no headroom — if that control fails, the use case is outside appetite immediately. |
| **Autonomy level (L0–L4)** | How much the system does without a person: from "only provides information" (L0) to "acts with no human checkpoint" (L4). |
| **Data zone (A/B/C)** | Where data or processing sits: the open internet (A), an outside supplier under contract (B), inside the firm (C). |
| **MNPI** | Material non-public information — price-sensitive knowledge like live deals or unpublished results. Processing it outside Zone C is a hard line. |
| **Client PII** | Personal details of clients — names, accounts, anything identifying a person. |
| **HITL** | Human in the loop — whether a person checks the output before anything happens. |
| **Determinism** | Same answers in, same verdict out, every time. The property that makes a verdict auditable, and the reason no AI model sits in the decision path. |
