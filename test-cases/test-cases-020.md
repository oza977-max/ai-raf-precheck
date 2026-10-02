# Counterpoise — Test Cases, Round 20

*Written 2026-10-02. R16 chunk D1 (`build/prompts/R16.md` v2.1, §4): the
verdict's first screen (VD-9, VD-10) — the view-model behind it
(`src/components/verdict-view-model.ts`), the `FirstScreen` component, the
reviewer section everything else moved into, and the refactor of
`WhatToDo`/`SignOffChecklist`/the evidence panel onto that one computation.
Chunk D2 (the "No" screen's own composition, §4.3) is a separate, later
chunk — the rejected-verdict cases here (TC-R16-D1-12a, -21, -23) assert
only what D1 itself produces: a minimal view, not D2's fuller copy.*

Test files: `src/components/verdict-view-model.test.ts`,
`src/components/__tests__/VerdictDisplay.r16d1.test.tsx`.

## §1 — The view-model (`buildVerdictView`)

### Headline (§4.2 item 1)

| ID | Asserts |
|---|---|
| TC-R16-D1-01a | A rejected verdict always headlines "No — not as described." and sets `isRejected` |
| TC-R16-D1-01b | Sign-off needed, N=0 outstanding — drops the "…and N safeguards…" clause entirely |
| TC-R16-D1-01c | Sign-off needed, N=1 — singular "1 safeguard is in place" |
| TC-R16-D1-01d | Sign-off needed, N=2 — plural, "all N safeguards are in place" |
| TC-R16-D1-01e | Self-service, N=0 — "Yes — you can start." |
| TC-R16-D1-01f | Self-service, N=1 — singular |
| TC-R16-D1-01g | Self-service, N=2 — plural |
| TC-R16-D1-01h | A VERIFIED or ATTESTED safeguard does not count toward N |
| TC-R16-D1-01i | No `stage` passed at all behaves as self-service (`needsSignOff` false) |

### Why (§4.2 item 2)

| ID | Asserts |
|---|---|
| TC-R16-D1-02a | Empty when nothing is tripped |
| TC-R16-D1-02b | Resolves `plain_reason` with `{audience}`/`{destination}` placeholders filled; the binding constraint's reason sorts first |
| TC-R16-D1-02c | Caps display at two distinct reasons and sets `whyHasMore` |
| TC-R16-D1-02d | Distinct reasons are de-duplicated by their resolved text |
| TC-R16-D1-02e | Falls back to the formal (captured) description + the pointer line when `plain_reason` is absent (§4.4) |
| TC-R16-D1-02f | Falls back the same way with no policy loaded at all |

### Safeguard status — one computation, four readers (§4.1)

| ID | Asserts |
|---|---|
| TC-R16-D1-03a | `verified` beats `attested` — machine evidence wins |
| TC-R16-D1-03b | `attested` when not machine-verified but a reviewer attested it; `attestedByName`/`evidenceNote` populated |
| TC-R16-D1-03c | `outstanding` when policy is loaded, the control exists, and it is neither verified nor attested |
| TC-R16-D1-03d | `unknown` when no policy is loaded and no attestation exists |
| TC-R16-D1-03e | `attested` (not `unknown`) with no policy loaded, when an attestation exists |
| TC-R16-D1-03f | `outstandingSafeguards`/`inPlaceSafeguards`/`attestedSafeguards` partition `safeguards` correctly; `outstandingCount` matches |

### Plain action fallback chain — never a bare code (§4.4, NF-11)

| ID | Asserts |
|---|---|
| TC-R16-D1-04a | Uses `plain_action` verbatim when present |
| TC-R16-D1-04b | Falls back to formal name + description + the "means for you" pointer when `plain_action` is absent |
| TC-R16-D1-04c | A control id absent from the loaded policy renders `"Safeguard {n}"` + the "involves" pointer — never the bare code |
| TC-R16-D1-04d | With no policy loaded at all, every safeguard renders `"Safeguard {n}"` by position — never the bare code |
| TC-R16-D1-04e | Numbering is by overall position in `verdict.controls`, not by position among only the unresolved ones |

### Owner tokens (§1.2 of R16.md)

| ID | Asserts |
|---|---|
| TC-R16-D1-05a | `@submitter` → "you or your manager (as the person responsible for this use)", `yours: true` |
| TC-R16-D1-05b | `@model_owner` with a non-`'internal'` vendor on the processing node → "…working with the supplier", `yours: true` |
| TC-R16-D1-05c | `@model_owner` with vendor `'internal'` → "the team that built the model", `yours: false` |
| TC-R16-D1-05d | `@model_owner` with no graph at all — treated as `'internal'` (no vendor known), `yours: false` |
| TC-R16-D1-05e | Free-text `plain_owner` renders verbatim, `yours: false` |
| TC-R16-D1-05f | `plain_owner_with` appends `", with {x}"` after a free-text or `@submitter` owner |
| TC-R16-D1-05g | `plain_owner_with` appends `" and {x}"` after the `@model_owner` "working with the supplier" branch specifically |
| TC-R16-D1-05h | A register-assigned owner overrides the default: `"{name} (assigned on your firm's register), due {date}"` — no "not verified" wording, `yours: false` |
| TC-R16-D1-05i | No owner text at all when the control cannot be resolved (no policy) — the "Who" line is omittable |

### Outstanding safeguards are yours-first ordered (§4.2 item 4)

| ID | Asserts |
|---|---|
| TC-R16-D1-06a | Yours-owned outstanding safeguards sort before not-yours ones, each group keeping its relative (deterministic) order |
| TC-R16-D1-06b | Already-in-place or attested safeguards are excluded from `outstandingSafeguards` regardless of ownership |

### Covered vs. owed reviews (`covers_reviews`, per-instance sources, §1.3/§4.4)

| ID | Asserts |
|---|---|
| TC-R16-D1-07a | A review whose base id is in a safeguard's `covers_reviews` attaches to that safeguard, not to `owedReviews` |
| TC-R16-D1-07b | An uncovered review's plain name/owner resolve from the firm's `downstream_reviews` rule |
| TC-R16-D1-07c | Two firm review instances sharing one plain name de-duplicate to one `owedReviews` entry (D-04) |
| TC-R16-D1-07d | The `PV-UNREGISTERED` sentinel resolves to its fixed product copy, independent of the component name suffix |
| TC-R16-D1-07e | The `MODEL-REGISTRY` sentinel resolves to its fixed product copy |
| TC-R16-D1-07f | A pack-rule-sourced review with no local plain-name data falls back to the generic pack-review line (§4.4) — `buildVerdictView` has no `packs` parameter |
| TC-R16-D1-07g | A firm review without `plain_name` falls back to its formal name + the pointer line (§4.4) |
| TC-R16-D1-07h | An older verdict with no `downstream_review_sources` at all lists every review separately — nothing folded away; `coveredReviewFormalNames` stays empty |
| TC-R16-D1-07i | `coveredReviewFormalNames` (WhatToDo's own filter, formal vocabulary) names a fully-covered formal review once |
| TC-R16-D1-07j | A formal name shared by a covered AND an uncovered instance is NOT reported fully covered |

### Next steps (§4.2 item 3, D-38's "Then" rule)

| ID | Asserts |
|---|---|
| TC-R16-D1-08a | Self-service, nothing outstanding, nothing owed — only the "Then"-less finish line |
| TC-R16-D1-08b | Self-service with outstanding safeguards keeps "Then" because a preceding step rendered |
| TC-R16-D1-08c | Sign-off with no outstanding safeguards — "Start once it's signed off." |
| TC-R16-D1-08d | Sign-off AND outstanding safeguards — the "both" finish line, plus the trailing "not sure who these teams are?" note |
| TC-R16-D1-08e | All outstanding safeguards are "yours" — singular wording for exactly one |
| TC-R16-D1-08f | All outstanding safeguards are "yours" — plural wording for more than one |
| TC-R16-D1-08g | A mix of yours/not-yours outstanding safeguards names the "yours" count |
| TC-R16-D1-08h | None of the outstanding safeguards is "yours" |
| TC-R16-D1-08i | Owed reviews produce the "also send this result to {teams}" step, naming the owning teams |
| TC-R16-D1-08j | `no_regulatory_basis` adds the "tell us which countries" step |
| TC-R16-D1-08k | A safeguard partnering with "your AI risk team" adds the sign-off clarification sentence exactly once |
| TC-R16-D1-08l | No safeguard, no owed review, no sign-off, no provisional reason — next steps is just the one finish line |

### Who signs off (§4.2 item 6)

| ID | Asserts |
|---|---|
| TC-R16-D1-09a | Names "your AI risk team" when sign-off is needed |
| TC-R16-D1-09b | Names "nobody" for self-service |

### Could still change (§4.2 item 7, D-19, RA-11)

| ID | Asserts |
|---|---|
| TC-R16-D1-10a | Empty when the verdict is not provisional and carries no medium caveat |
| TC-R16-D1-10b | `unsigned_pack_rules` line |
| TC-R16-D1-10c | `unclassified_decision_type` line names the typed, quoted text |
| TC-R16-D1-10d | Provisional via the legacy low-caveat path with no named `provisional_reasons` shows the generic fallback line (D-19) |
| TC-R16-D1-10e | A medium-confidence caveat surfaces its own line even when the verdict is NOT otherwise provisional (RA-11) |
| TC-R16-D1-10f | A named provisional reason and a medium caveat together produce both lines |

### Placeholders resolve from the graph (§1.2)

| ID | Asserts |
|---|---|
| TC-R16-D1-11a | `{audience}` picks the widest exposure across several output nodes (market-facing > client-facing > internal-shared > internal-only) |
| TC-R16-D1-11b | `{destination}` picks the least-controlled zone across several processing nodes (A over B over C) |
| TC-R16-D1-11c | With no graph at all, placeholders resolve to a safe, non-crashing default — never left as a literal `{audience}`/`{destination}` token |
| TC-R16-D1-11d | `{destination}` names the least-controlled zone on any node, and with no graph both placeholders fall back to neutral wording ("clients or the public", "a system outside your firm's own") — never the most reassuring value; `@model_owner` with no graph reads "the team responsible for the model" — `verdict-view-model.test.ts` |

### Rejected verdicts stay minimal (VD-10 — the "No" screen is chunk D2)

| ID | Asserts |
|---|---|
| TC-R16-D1-12a | A rejected verdict has no safeguards, no next steps, and no could-still-change lines from this view-model |

## §2 — The `VerdictDisplay` component wiring

### First screen: headline leads, no bare code or reserved word (VD-9, NF-11, BC-V12B-03)

| ID | Asserts |
|---|---|
| TC-R16-D1-13 | The headline, not the formal status chip, leads the screen; the formal chip is not inside `.verdict__first-screen`; the whole-page single-match `/approved|rejected/i` guard still holds (the one allowed match is inside the reviewer section) |
| TC-R16-D1-14 | An unresolved control id never reaches the first screen as a bare code — renders "Safeguard 1" |

### The reviewer section's open/closed default (§4.2 item 9)

| ID | Asserts |
|---|---|
| TC-R16-D1-15 | With `reasoningDefaultOpen` omitted (the submitter path, e.g. `IntakeFlow`), the reviewer section starts closed |
| TC-R16-D1-16 | With `reasoningDefaultOpen={true}` (`RegisterDetail`'s 2LoD path), the reviewer section starts open |
| TC-R16-D1-17 | With `reasoningDefaultOpen={false}` explicitly (`RegisterDetail`'s 1LoD-viewing path), the reviewer section starts closed |

### "Go to this safeguard" (D-26, D-63)

| ID | Asserts |
|---|---|
| TC-R16-D1-18 | Clicking it opens the reviewer section AND expands that control's own disclosure inside `WhatToDo` — the per-control disclosure stays React-controlled |
| TC-R16-D1-19 | The link only appears for a safeguard marked "yours" |

### The correction affordance is wired on every verdict (§4.2 item 8)

| ID | Asserts |
|---|---|
| TC-R16-D1-20 | The first screen's own "Think we got something wrong?" button calls `onCorrect`; the pre-existing reviewer-section button is unaffected and still present |
| TC-R16-D1-21 | On a rejected verdict, the first screen still offers the correction affordance |
| TC-R16-D1-22 | With no `onCorrect` (a reviewer page), neither correction affordance renders |

### A rejected verdict's first screen (VD-10 — chunk D2 owns the "No" screen's own composition)

| ID | Asserts |
|---|---|
| TC-R16-D1-23 | Headline only, plus the correct-answers affordance — no safeguards/next-steps section rendered in D2's place |

## Untested behaviours

None by omission. The live-browser walkthrough (below) additionally
confirmed, on real seeded register cases, that the first screen reads as
§4.2 describes with no bare codes — not independently re-asserted as a
unit test, since it depends on real policy/pack data rather than a
constructed fixture.

## Verification

Touched files run individually three times consecutively via
`npm test -- src/components/verdict-view-model.test.ts` and
`npm test -- src/components/__tests__/VerdictDisplay.r16d1.test.tsx` (never
bare `vitest` — the Node 26/jsdom `localStorage` gotcha), then the existing
`VerdictDisplay*`/`RegisterDetail*` suites together
(`npm test -- src/components/__tests__/VerdictDisplay src/components/__tests__/RegisterDetail`)
to confirm the refactor of `WhatToDo`/`SignOffChecklist`/the evidence panel
onto the view-model changed no existing assertion. `npx tsc --noEmit`,
`npm run build`, `python3 scripts/spec-parity-check.py` and
`python3 scripts/trace-check.py` all clean for this chunk's own files (see
the chunk's handover for the unrelated, concurrently-in-progress form-chunk
failures this run also surfaced).

| Date | Change |
|---|---|
| 2026-10-02 | Written for R16 chunk D1 (the verdict's first screen). |

---

*Developed using the Grounded Vibe Methodology*
