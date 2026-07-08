# AIGate — Pack Authoring Playbook

**Location in repo:** `grounding/PACK-AUTHORING.md`
**Status:** Operating procedure — this is the P2-C03 chunk. Human-led; Claude scaffolds structure only.
**Why this document exists:** The rule corpus — verbatim-cited, confidence-scored, human-signed
regulatory rules — is the product's core asset. It is never generated; it is authored. A wrong rule
here is enforced deterministically on every verdict thereafter.

---

## Roles

| Role | Person | Responsibility |
|---|---|---|
| Rule owner | The 2LoD lead (you) | Source acquisition, provision extraction, condition encoding, confidence scoring, sign-off on High/Medium rules |
| Adversarial reviewer | Second 2LoD team member | Independent read of each provision; two test cases per rule (one should-fire, one should-not-fire); attempts to break each condition |
| Contested-rule owner | Compliance/Legal (named per rule) | Sign-off on Low-confidence rules only — tabled as bounded, specific questions |

Pre-adoption label: until the firm formally adopts the RAF, every sign-off is recorded as
**"proposed interpretation — pending firm adoption"** and verdicts carry the NF-10 unattested label.

---

## The 8-step workflow (per pack)

**1. Acquire the primary source.**
Download the official document (regulator's own site only). Record in `grounding/sources/`:
filename, URL, retrieval date, SHA-256 hash. Every verbatim claim traces to this exact file.

**2. Extract operative provisions.**
Read end to end. Mark only sentences that change a classification, tier, or control — not
background or intent language. Expect 15–25 operative provisions for a document like SS1/23.

**3. Encode each provision as a rule** — three parts kept side by side:
- `source.text`: the exact sentence, copy-pasted, with section/paragraph reference, source_url,
  retrieved_date. **Never typed from memory, never paraphrased, never generated.**
- `condition`: the interpretation, expressed over canonical graph attributes (policy-schema §3.0
  vocabulary only).
- `effect`: track/tier floor → supplement_obligations, required_control, hard_line, or
  required_review.
The text is fact; the condition is professional interpretation of that fact. The pairing is what
lets an auditor challenge the interpretation while seeing exactly what it derived from.

**4. Score confidence honestly.**
- **High** — text unambiguous; rule owner and adversarial reviewer read it identically.
- **Medium** — judgment involved; verdict will carry an explicit caveat naming the ambiguity.
- **Low** — genuinely contested; rule routes to Compliance/Legal for sign-off; verdicts provisional
  until they determine.
**Default conservative on ambiguity:** where two readings exist, encode the more demanding one and
mark Medium. A conservative misread costs friction; a liberal one costs regulatory exposure.
Expected distribution roughly 70/25/5 — if everything is coming out High, the scoring is dishonest.

**5. Adversarial review.**
For every rule, the reviewer authors two test cases: a use case where the rule must fire, and a
near-miss where it must not. Reviewer actively tries to construct a graph that defeats the
condition (vocabulary mismatch, multi-node path, boundary value). Both tests committed to
`test-cases/` and traced to the rule ID.

**6. Sign.**
`reviewer_name` (real name), `reviewer_role`, `sign_off_date`, against the source hash.
Validation rejects `[FIRM]` placeholders — an unsigned rule produces provisional verdicts (NF-7).

**7. Back-test.**
After wave-1 packs are signed: run 15–20 historically decided use cases (reconstructed, synthetic
data) through the engine. Three outcomes, all valuable:
- Verdicts match committee decisions → thesis proven; this is the demo evidence.
- A rule is wrong → fix now, cheaply, before it's load-bearing.
- Rules are right but past decisions were inconsistent with the stated appetite → a genuine 2LoD
  finding, reportable independent of the tool.
**Kill criterion:** if verdicts need constant override, the appetite-as-code thesis fails in
practice — stop building, write the finding up.

**8. Maintain.**
- Subscribe once (free): PRA/BoE publications alerts, Fed/OCC/FDIC press releases, European
  Commission AI Act updates, FSA Japan newsletter, MAS circulars.
- Monthly 1-hour calendar block: walk the cited-source list (auto-generated from the packs' own
  `source` blocks — the corpus tells you what to watch) and check for amendments since
  retrieved_date. Most months: nothing.
- On change: diff old vs new text; re-review and re-sign ONLY rules citing changed sections (RA-10);
  everything else carries forward with existing sign-off.
- Quarterly attestation: "corpus checked against current sources as of [date]" (NF-9 cadence; also
  a reporting line for the 2LoD function).
- Pre-loaded dates: OSFI E-23 effective Jan 2027 · EU AI Act Annex III obligations Dec 2027 ·
  Art. 50(2) transparency Dec 2026 · SR 26-2 RFI outcome pending.

---

## Wave plan

| Wave | Packs | Trigger | Effort estimate |
|---|---|---|---|
| 1 | Home-regulator pack · most demanding applicable ceiling (e.g. SS1/23) · one further pack the pilot use cases touch | Now — internal pilot | 4–6 weeks part-time; first pack slowest (method-building), then faster |
| 2 | MAS FEAT · EU AI Act · DORA | First pilot use case touching SG/EU entities | Per need |
| 3 | OSFI E-23 | Canadian exposure, before Jan 2027 effective date | Per need |

---

## Dual-deliverable note

The signed pack files are valuable to the firm even independent of the tool: "every AI-relevant
regulatory obligation, mapped to verbatim source, interpreted, signed, version-controlled" is a
regulatory obligations register — the artifact a PRA/FSA review asks for and most firms hold as
scattered memos. One effort, two deliverables: the engine's configuration, and a 2LoD artifact the
function should own anyway. Use this framing if the time investment is questioned.
