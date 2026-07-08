# AIGate — Repo Updates to Apply (June 2026)

**How to use this file:** Drop it into the repo root, open Claude Code, and say:
*"Read repo-updates-for-claude-code.md and apply the changes in order, committing after each section."*
Sections are ordered by priority. Each change names the file, the location, and the exact edit.
Source: full repository review (`aigate-full-repo-review.md`) + strategy decisions, June 2026.

---

## Section 1 — Strategic decisions (update design-vision.md)

### 1.1 Resolve the V1 / artifact-binding contradiction (review Top-5 #3)
In `design-vision.md`, section "Sequencing", replace the line
"**The irreducible bet (must have in V1 to be credible):** Artifact binding for at least one artifact type..."
with:

> **Decision (June 2026): V1 is explicitly an engine-validation proof-of-concept, deployed internally first.**
> V1's job is to prove the appetite-as-code thesis against real historical use cases inside the firm —
> not to be a deployable external product. Artifact binding (OB-1/2/5, one artifact type, Terraform first)
> is the gate for V1.5, which is the first externally credible version. The README headline claim
> ("reads what the system actually does") describes V1.5+, and the README must say so.

Then update `README.md`: add one sentence to "Project status":
"V1 is an internal engine-validation proof-of-concept; artifact binding and the system-of-record audit store arrive in V1.5."

### 1.2 Add the moat statement
Append a new section to `design-vision.md` before "The Product AIGate Must Not Become":

> ## What the Moat Actually Is
> The engine is not the moat — it is reproducible in weeks. The defensible assets, in order:
> 1. **The verified rule corpus** — jurisdictional regulatory text translated into machine-checkable
>    conditions, each rule citing verbatim source, confidence-scored, human-signed, and *maintained*
>    as regulations change. Content with accountability attached, depreciating constantly — which is
>    what makes it defensible.
> 2. **The translation capability** — encoding a real bank's prose RAF into invariants whose verdicts
>    match what the bank's committees would actually decide.
> 3. **The liability position** — shipping verdicts, not workflow. Incumbents (Credo AI, ValidMind,
>    Monitaur) sell process tools precisely to avoid owning interpretation; the sign-off architecture
>    (RA-7/NF-7/RA-11) is what makes owning it survivable.
> 4. **Practitioner credibility** — built and run in production by a sitting 2LoD head; passed its own
>    pre-check, honestly tiered.
> 5. **Per-bank inventory lock-in** (post-adoption only).
> Implication for build priority: pack authoring is not configuration work before the real work.
> It IS the real work. (See grounding/PACK-AUTHORING.md.)

### 1.3 Add the internal-first deployment strategy
Append to `design-vision.md`:

> ## Deployment Strategy: Internal First
> Phase A — propose the RAF and the tool **together** to the firm: the RAF is the decision being
> asked for; the live tool demo is the business case for why the RAF matters ("this is what your
> appetite does when it is executable"). Demo on synthetic/reconstructed historical use cases only.
> Show the NF-10 "translation fidelity unattested / provisional" label in the demo — verdicts become
> authoritative the day the committee adopts the framework. Run the AIGate self-assessment live,
> honestly tiered.
> Phase B — sandbox pilot scoped to low-tier Track III intake under the 2LoD mandate.
> Phase C — back-test: run 15–20 historically decided use cases; verdicts vs actual committee
> outcomes is the pass/fail test of the appetite-as-code thesis. Kill criterion: if verdicts need
> constant human override, stop building and write the paper instead.
> Pack sign-offs before firm adoption are labelled **"proposed interpretation — pending firm
> adoption"**; Low-confidence rules are tabled as explicit open questions for Compliance/Legal in
> the committee paper.

---

## Section 2 — Create the pack-authoring playbook (review Top-5 #1)

Create `grounding/PACK-AUTHORING.md` with the content in the companion file
`PACK-AUTHORING.md` (provided alongside this instruction file — copy it in verbatim).

Then in `specs/implementation-guide.md` §1 dependency matrix, add a new row after P2-C02:

| P2-C03 | Starter policy + jurisdiction pack authoring (HUMAN-LED — see grounding/PACK-AUTHORING.md) | P2-C01 | P3-C01, P7-C01 | — |

Add to the chunk's definition: "This chunk is executed by the human rule owner, not generated.
Claude may scaffold YAML structure only. Exit gates: (a) every `source.text` copy-pasted from the
retrieved primary document and verified by exact string match; (b) generated/scaffolded rules diffed
line-by-line against grounding/raf-extraction.md §B–§H by the rule owner, diff committed;
(c) every rule has two adversarial test cases (one should-fire, one should-not-fire) authored by the
second reviewer; (d) sign-off fields contain real names — `[FIRM]` placeholders fail validation."

**Wave 1 scope decision:** encode three packs only — the home-regulator pack, the most demanding
applicable ceiling (e.g. `ss1-23.yaml`), and one further pack the pilot use cases touch. The
remaining packs are authored when a pilot use case first touches them. Update `requirements.md` PE-8 and
CF-2 fit criteria accordingly ("starter file covers the wave-1 jurisdiction packs; remaining packs
are authored on first need using grounding/PACK-AUTHORING.md").

---

## Section 3 — Critical grounding-drift fixes (policy-schema.md)

### 3.1 Missing track rules (review Task 1, Critical)
In §3.3, add before TRACK-III:
- `TRACK-II-REPLACE`: condition `replaces_prior_model: true` → Track II, short_circuit, regulatory_basis "RAF §5 rule 3"
- `TRACK-II-AUTONOMY`: condition `autonomy_level: { gte: 3 }` → Track II, short_circuit, regulatory_basis "RAF §5 rule 4"
Add `replaces_prior_model: boolean` to `ProcessingNode` in `specs/intake-flow.md §4.2` and to the
UC-3a form field table (§5.2). Note in raf-extraction.md that the override-rate-at-registration
clause of rule 4 is deferred to V2 monitoring.

### 3.2 Missing hard lines (review Task 1, Critical)
In §3.2, add:
- `HL-004` "Fully autonomous trading decisions": `autonomy_level: { gte: 4 }, decision_type: { in: ["trading"] }`
- `HL-005` "Irreversible action above autonomy L1": `output_reversibility: "irreversible", autonomy_level: { gte: 2 }` — basis: HTML §7 "Irreversible actions require Level 1 or below regardless of tier"

### 3.3 MNPI zone drift (review Task 1, Significant)
Change `INV-ZONE-01` condition to `data_zone: { not_in: ["Zone C internal"] }` (grounding says MNPI is Zone C only).

### 3.4 Scale attribute + Critical tier triggers (review Task 1, Critical)
Add `scale: 'limited' | 'at_scale'` to `OutputNode` (`intake-flow.md §4.2`) and the UC-3a form.
Add TIER-CRITICAL trigger: `exposure in ["client-facing","market-facing"] AND scale = "at_scale"`.
Add the missing "capital" and "client financial outcome" triggers from raf-extraction.md §D.
Add a test: the grounding §E client-facing chatbot example must tier Critical.

### 3.5 Canonical vocabulary (review Top-5 #2)
Add new §3.0 "Canonical attribute vocabulary" to `policy-schema.md` defining closed enums for:
`data_class` (Public | Internal | Confidential | Client PII | MNPI),
`data_zone` (Zone A | Zone B | Zone C),
`model_type` (statistical | traditional-ml | ml | deep-learning | llm | generative-ai | agentic),
`exposure` (internal-only | internal-shared | client-facing | market-facing),
`decision_bindingness` (non-binding | advisory | material | binding),
`action_type`, `decision_type` (define from grounding §A/§E).
Rules: CF-5 validation rejects any condition value outside the vocabulary; the LLM extractor's JSON
schema uses these as `enum` constraints; the structured form selects come from the same source.
Reconcile every existing example in all specs to these values.

### 3.6 Placeholder sign-offs must fail (review Task 2, Critical)
In §6 pack validation rules add: "`reviewer_name` containing `[FIRM]` or matching a placeholder
pattern → rule treated as UNSIGNED → verdicts relying on it flagged provisional per NF-7."
Add `source_url` and `retrieved_date` as required fields in the pack rule `source` block (RA-7
extension). Mark the example "verbatim" quotes in §4 as `[ILLUSTRATIVE — NOT VERBATIM — replace
during P2-C03]`.

---

## Section 4 — Engine-spec consistency fixes (evaluation-engine.md)

### 4.1 Tier semantics contradiction (review Top-5 / Task 3, Critical)
Standardise on **highest-tier-wins, order-independent**. Delete the "first matching trigger
determines the tier" sentence from `policy-schema.md §3.4`. Add a property test note: permuting the
`tiers` array never changes any verdict.

### 4.2 Track floor over categorical tracks (review Task 3, Critical)
Replace the `track_floor` effect with `supplement_obligations` (pack adds required controls /
validation obligations to the assigned track) in `policy-schema.md §4` effects table and
`evaluation-engine.md §3.6`. Delete the unedited "Wait — track ordering..." paragraph in §3.6 and
replace with the decided rule. Update PE-6 / RA-2 fit criteria in `requirements.md` to the
supplement model ("a Track III use case under SS1/23 retains Track III classification but inherits
the SS1/23 MRM obligation set; obligations are never reduced below the jurisdictional minimum") —
this matches grounding §C. Update TC-PE-6-01 / TC-RA-2-01 accordingly.

### 4.3 Determinism vs UUID/timestamps (review Top-5 #5)
Split the type: `evaluate()` returns a pure `EvaluationResult` (status, tier, track, constraints,
controls, conditions — byte-identical across runs); the caller wraps it in a `Verdict` envelope
adding `id`, timestamps, attestation. Point TC-PE-1-01 / TC-NF-1-01 at `EvaluationResult`.

### 4.4 Missing jurisdictions field (review Task 3, Significant)
Add `jurisdictions: string[]` to `DataFlowGraph` in `intake-flow.md §4.2`. LLM path: extracted with
`uncertain: true` default plus a mandatory confirmation question.

### 4.5 Multi-node condition semantics (review Task 6, Significant)
Specify in `evaluation-engine.md §3`: a condition over a node attribute matches if ANY node on ANY
input→output path satisfies it; the matching path is recorded as `binding_path`. Add tests
TC-PE-1-03 (multi-node graph) and TC-PE-2-06 (`no-track-match` error surfaced).

### 4.6 CS-1 safety margin (review Top-5 #5)
Rewrite CS-1 in `requirements.md`: solver returns the minimal burden-weighted set; verdict carries
`boundary_proximity: true` when any satisfied invariant has zero redundant coverage. Margin-based
set selection → V1.5 with the defined metric. Rewrite TC-CS-1-02 against the flag.

### 4.7 UC-4 question budget (review Top-5 #5)
Specify in `intake-flow.md §6`: generator runs `assignTier()` on the provisional graph (uncertain
fields treated worst-case) to set the question budget; provisional tier recorded in audit trail as
`question_budget_basis`.

---

## Section 5 — LC-6 self-assessment honesty (review Top-5 #4)

In `register-lifecycle.md §9`: rewrite the seed graph with canonical vocabulary and honest values —
`decision_bindingness: material` (the verdict drives governance decisions), data class bounded by
intake content not assumed "internal". Remove auto-approve step 5: the engine assigns tier and the
result routes through `workflow-router.ts` like any other use case; if High/Critical it sits at
`pre_checked` until the 2LoD role approves. Add TC-LC-6-02 (forced-Reject test policy → prominent
2LoD warning) and rename TC-LC-4-02 → TC-LC-6-01.

---

## Section 6 — Remaining significant fixes

6.1 **UC-2 vs RG-2 leak:** UC-2 fit criterion — duplicate check runs against full register but 1LoD
sees only a redacted match ("a similar use case exists — tier High; contact 2LoD to adopt its
classification"); full detail 2LoD only. Update `intake-flow.md §3` + add a test.

6.2 **Re-evaluation trigger:** in `register-lifecycle.md §8` — add `re_evaluation_queued` to the
`AuditEventType` union in `verdict-audit.md §4.3`; on policy save append that event WITHOUT changing
lifecycle stage; stage moves to `pre_checked` only on human-triggered re-run or changed verdict.

6.3 **KRI bands:** restructure `policy-schema.md §3.7` thresholds as `{green, amber, red}` bands;
mirror in `VerdictConditions` (`verdict-audit.md §4.1`).

6.4 **Jurisdiction/DORA modeling:** DORA must not be a separately selectable jurisdiction —
selecting "EU" activates both `eu-ai-act.yaml` and `dora.yaml`. Change `policy-schema.md §3.8` to
allow multiple pack_files per jurisdiction code; update RA-1 fit criterion.

6.5 **Requirements doc hygiene:** re-tag LC-5 Should/V2+; move the stray "Re-evaluation produces a
new verdict record..." fit criterion from LC-6 to LC-4; relocate orphaned RG-1/RG-7 criteria;
deduplicate NF-3's fit criterion; reorder NF section NF-1 first. Update OQ-1..OQ-5 entries to point
at their cross-cutting.md resolutions (no longer "deferred").

6.6 **Tests:** add the four genuine property tests (fast-check over the canonical vocabulary):
jurisdiction monotonicity; impact dominance; hard-line supremacy; solver soundness. Add security
tests: TC-UC-3-04 (extraction-steering description), TC-VD-8-02 (LLM trace rendered as text never
HTML), TC-CF-5-04 (malicious YAML rejected), TC-NF-11-01 (API key absent from exports). Add
TC-VD-6-01 (living_status fields populated). Correct the Test Summary coverage counts. Fix
TC-UC-3-03 title ("is structurally consistent", not "is not deterministic").

6.7 **Monitoring loop (new, from strategy discussion):** add to `grounding/PACK-AUTHORING.md`-
referencing section in design-vision: regulator alert subscriptions (PRA/BoE, Fed/OCC/FDIC,
EU Commission AI Act, FSA Japan, MAS), one monthly 1-hour source check generated from the corpus's
own cited sources, quarterly "corpus current as of [date]" attestation (NF-9 cadence). Pre-loaded
dates: OSFI E-23 Jan 2027, Annex III Dec 2027, SR 26-2 RFI pending.

---

## Commit plan
One commit per section, messages: `review: <section title>`. After Section 6, regenerate the HTML
mirrors of any edited .md files if the repo convention requires it.
