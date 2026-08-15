import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterDetail from '../RegisterDetail';
import { addNode } from '../../store/register';
import { append, getAll } from '../../store/audit';
import type { RegisterNode } from '../../store/types';
import type { Verdict } from '../../types/verdict';
import type { PolicyFile } from '../../engine/types';

// P8-C07 — register-lifecycle.md §15. The sign-off page is where a 2LoD
// reviewer approves a High-tier use case, and it did not show the verdict.
// Charter 004 measured the whole page at 779 characters: the reviewer was
// asked to attest to a decision whose basis the page did not present.
//
// §11.1 constraint (HR3-08): every query here is SCOPED — to a container or a
// role — never a bare single-match on verdict text. This page now renders
// "Approved with controls", which a loose /approved|rejected/i query elsewhere
// in the suite would collide with.

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    status: 'approved_with_controls',
    tier: 'High',
    track: 'II',
    binding_constraint: 'INV-DATA-01',
    binding_path: 'client notes → drafting model → drafted email',
    controls: ['CTRL-ENC-01', 'CTRL-LOG-01'],
    downstream_reviews: [],
    conditions: { hypotheses: ['Volume stays under 500 cases a month.'] },
    policy_version: '1.3',
    pack_versions: {},
    applied_overrides: [],
    confidence_caveats: [],
    provisional_reasons: ['no_regulatory_basis'],
    boundary_proximity: false,
    margin_achieved: 0,
    margin_target: 0.1,
    single_covered_invariants: ['INV-DATA-01'],
    explanation: {
      tier_rationale: null,
      track_rationale: null,
      hard_lines_checked: 4,
      invariants_checked: 6,
      tripped_invariants: [
        {
          id: 'INV-DATA-01',
          description: 'Client PII may not cross into an unapproved zone.',
          severity: 'High',
          regulatory_basis: 'SS1/23 §3.4',
          required_controls: ['CTRL-ENC-01'],
          graph_path: 'client notes → drafting model',
        },
      ],
      binding_reason: null,
      binding_regulatory_basis: null,
      regulatory_chain: [],
    },
    id: 'v-test-1',
    use_case_id: 'uc-test',
    living_status: 'approved',
    living_status_updated_at: '2026-01-01T00:00:00.000Z',
    attested_by: '1LoD',
    attested_at: '2026-01-01T00:00:00.000Z',
    graph_version: 1,
    corrections: [],
    ...overrides,
  };
}

function makeNode(id: string, overrides: Partial<RegisterNode> = {}): RegisterNode {
  return {
    node_id: id,
    node_type: 'use_case',
    label: 'Client email drafter',
    created_at: '2026-01-01T00:00:00.000Z',
    metadata: {
      node_type: 'use_case',
      submitted_by: '1LoD',
      lifecycle_stage: 'pre_checked',
      current_verdict_id: null,
      tier: 'High',
      track: 'II',
    },
    ...overrides,
  } as RegisterNode;
}

// hard_lines/invariants are present-but-empty deliberately: findRuleDescription
// (src/engine/find-rule-description.ts:10-12) calls .find on both, and the real
// PolicyFile is Zod-validated at load so they always exist. A fixture omitting
// them tests a state the loader prevents.
const POLICY = {
  version: '1.3',
  hard_lines: [],
  invariants: [],
  controls: [
    {
      id: 'CTRL-ENC-01',
      name: 'Encryption at rest',
      resolves: ['INV-DATA-01'],
      // Shape verified: ControlVerificationEvidence (src/engine/types.ts:474)
      // is an object with a status field, not a string.
      verification_evidence: { status: 'verified', detail: 'Key rotation log, quarterly.' },
    },
    { id: 'CTRL-LOG-01', name: 'Immutable logging', resolves: [] },
  ],
} as unknown as PolicyFile;

async function seed(useCaseId: string, verdict: Verdict | null) {
  await addNode(makeNode(useCaseId));
  await append({
    event_id: crypto.randomUUID(),
    use_case_id: useCaseId,
    event_type: 'use_case_created',
    occurred_at: '2026-01-01T00:00:00.000Z',
    actor: '1LoD',
    payload: { type: 'use_case_created', description: 'Drafts client emails.', intake_method: 'structured_form' },
  });
  if (verdict) {
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: useCaseId,
      event_type: 'verdict_produced',
      occurred_at: '2026-01-02T00:00:00.000Z',
      actor: '1LoD',
      payload: { type: 'verdict_produced', verdict },
    });
  }
}

// `null` means "explicitly no policy". A plain default of POLICY would silently
// substitute it when a caller passes `undefined`, so the no-policy test would
// have exercised the WITH-policy path while claiming otherwise — the same
// shape as a fixture whose empty field is the only reason a claim looks true.
function renderDetail(useCaseId: string, policyArg: PolicyFile | null | undefined = POLICY) {
  const policy = policyArg ?? undefined;
  return render(
    <StrictMode>
      <RegisterDetail useCaseId={useCaseId} role="2LoD" policy={policy} onBack={vi.fn()} />
    </StrictMode>,
  );
}

/** The verdict region, scoped. Never a bare text query (§11.1). */
async function verdictRegion() {
  return await screen.findByRole('region', { name: /verdict/i });
}

describe('RegisterDetail — the sign-off page shows the verdict (P8-C07)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ACCEPTANCE TEST (TDD-1, outside-in — written first).
  it('TC-R3-RD-1-01: the six decision-bearing elements are present on the sign-off page', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);

    const verdict = within(await verdictRegion());

    // 1 — status and tier
    expect(verdict.getByRole('heading', { name: /with controls/i })).toBeInTheDocument();
    // 'High' appears as the tier stat AND as the invariant's severity chip —
    // scoped to the tier stat so the assertion means the tier specifically.
    expect(verdict.getByText('High', { selector: '.verdict__stat-value' })).toBeInTheDocument();
    // 2 — binding constraint id
    expect(verdict.getAllByText('INV-DATA-01').length).toBeGreaterThan(0);
    // 3 — triggered invariant with its citation
    expect(verdict.getByText(/SS1\/23 §3.4/)).toBeInTheDocument();
    // 4 — control ids in the minimal set
    // Scoped to the control-set panel: the ids also appear in the invariant's
    // "Requires:" line, and an assertion satisfied by that line would pass on
    // a page that never rendered the minimal control set at all.
    const controlSet = within(verdict.getByRole('heading', { name: /minimal control set/i }).parentElement!);
    expect(controlSet.getByText('CTRL-ENC-01')).toBeInTheDocument();
    expect(controlSet.getByText('CTRL-LOG-01')).toBeInTheDocument();
    // 5 — governance margin, and the id flagged as having no headroom
    // The figure itself, not just the panel heading — "Governance margin"
    // as a title would satisfy a loose /margin/i query on a page that never
    // rendered the number.
    // Copy changed 2026-08-15 — the margin now reads in words rather than as
    // "MARGIN 0% achieved against a 10% target", which said nothing to a
    // business reader. Still one of the six decision-bearing elements.
    expect(verdict.getByText(/0% of the triggered rules have more than one control/i)).toBeInTheDocument();
    expect(verdict.getByText(/resting on a single control/i)).toBeInTheDocument();
    // 6 — standing conditions
    expect(verdict.getByText(/500 cases a month/i)).toBeInTheDocument();
  });

  it('TC-R3-RD-1-03: each control carries its evidence status, so nobody signs believing evidence exists', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);

    const verdict = within(await verdictRegion());
    // CTRL-ENC-01 has verification_evidence in the policy; CTRL-LOG-01 does
    // not. An UNVERIFIED control rendered without its status would let a
    // reviewer sign off believing evidence exists (§15.1).
    // Exact-match the chips: /VERIFIED/ alone also matches "UNVERIFIED",
    // which would let a page showing two UNVERIFIED controls pass an
    // assertion claiming one is verified.
    expect(verdict.getByText('VERIFIED', { selector: '.verdict__vchip--verified' })).toBeInTheDocument();
    expect(verdict.getByText('UNVERIFIED', { selector: '.verdict__vchip--unverified' })).toBeInTheDocument();
  });

  it('TC-R3-RD-7-01: evidence status comes from current policy while the verdict stays historical', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    // Policy edited since evaluation: the evidence for CTRL-ENC-01 has lapsed.
    const lapsed = {
      version: '1.4',
      hard_lines: [],
      invariants: [],
      controls: [
        { id: 'CTRL-ENC-01', name: 'Encryption at rest', resolves: ['INV-DATA-01'] },
        { id: 'CTRL-LOG-01', name: 'Immutable logging', resolves: [] },
      ],
    } as unknown as PolicyFile;
    renderDetail(id, lapsed);

    const verdict = within(await verdictRegion());
    // The verdict itself is unchanged — it is the record of what was decided.
    expect(verdict.getAllByText('INV-DATA-01').length).toBeGreaterThan(0);
    // But evidence status reflects TODAY: nothing is VERIFIED any more.
    expect(verdict.queryByText(/[^N]VERIFIED/)).toBeNull();

    // §15.1a: "The two are labelled distinctly on the page so a reader can
    // tell which is historical record and which is current state." Review
    // found the split was correctly SOURCED but invisible — it lived only in
    // code comments, which a reviewer never sees. A reviewer who cannot tell
    // which half is frozen history could sign off believing an old VERIFIED
    // still holds.
    expect(verdict.getByText(/read from today.s policy, not from the evaluation/i)).toBeInTheDocument();
    expect(verdict.getByText(/the record of what was decided on/i)).toBeInTheDocument();
  });

  it('TC-R3-RD-6-01: a Provisional verdict states its cause here too', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);

    const verdict = within(await verdictRegion());
    // A Provisional badge with no cause is the defect TC-R3-JU-6-01 rejects,
    // and it is worse on the page where someone signs their name.
    // Two surfaces by design (P8-C05): the terse labelled cause in the banner
    // and the prose consequence in the body. Both belong on this page — a
    // reviewer needs the cause on the record and the explanation in front of
    // them.
    expect(verdict.getAllByText(/no jurisdiction pack applied/i).length).toBe(2);
    expect(verdict.getByText(/still applied in full/i)).toBeInTheDocument();
  });

  it('TC-R3-RD-8-01: the reclassification affordance and the reasoning trace do not appear here', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);
    await verdictRegion();

    // Correction is a submitter action (verdict-audit.md §6.1), not a
    // reviewer one. P8-C06 made this buildable by reuse.
    expect(screen.queryByRole('button', { name: /correct this classification/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^reasoning trace$/i)).not.toBeInTheDocument();
  });

  it('TC-R3-RD-4-01: sign-off actions remain available alongside the verdict', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id);
    await verdictRegion();

    // The verdict is readable without leaving the page, and reading it does
    // not cost the reviewer the actions they came for.
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request correction/i })).toBeInTheDocument();
  });
});

describe('RegisterDetail — the two states where no verdict can be shown (R3-RD-2)', () => {
  it('TC-R3-RD-2-01: no verdict recorded is stated plainly', async () => {
    const id = crypto.randomUUID();
    await seed(id, null);
    renderDetail(id);

    // The seeded AIGate self-assessment is the real case on every install.
    expect(await screen.findByText(/no verdict is recorded/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /verdict/i })).not.toBeInTheDocument();
  });

  // Split from the test above: the ids were conflated in one name
  // ("TC-R3-RD-2-01/-02"), which does not resolve as a trace id, so -02
  // read as uncovered. One id, one test (spec-parity R7).
  it('TC-R3-RD-2-02: sign-off stays available when no verdict is recorded', async () => {
    const id = crypto.randomUUID();
    await seed(id, null);
    renderDetail(id);

    // The seeded AIGate self-assessment is the real case on every install.
    // Blocking sign-off would strand it; the honest position is to let the
    // reviewer act while telling them plainly what the record contains.
    expect(await screen.findByText(/no verdict is recorded/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request correction/i })).toBeInTheDocument();
  });

  // REALISTIC-FIXTURE VARIANT (TDD-3). The engine has not produced this shape
  // since V1.1-C01, and it is the one where an empty invariant list would make
  // a false claim: "nothing was triggered" is stronger than "we did not record
  // what was".
  it('TC-R3-RD-2-03: a verdict predating explanation capture says so, rather than showing an empty list', async () => {
    const id = crypto.randomUUID();
    const legacy = makeVerdict({ use_case_id: id }) as unknown as Record<string, unknown>;
    delete legacy.explanation;
    await seed(id, legacy as unknown as Verdict);
    renderDetail(id);

    expect(await screen.findByText(/predates explanation capture/i)).toBeInTheDocument();
    const verdict = within(await verdictRegion());
    // The elements it DOES have are still shown.
    expect(verdict.getByRole('heading', { name: /with controls/i })).toBeInTheDocument();
    // Now rendered in both "What you need to do" and the control set.
    expect(verdict.getAllByText(/CTRL-ENC-01/).length).toBeGreaterThan(0);
  });
});

describe('RegisterDetail — rendering must not write (R3-NF-2)', () => {
  it('TC-R3-NF-2-01: opening the page twice leaves the audit trail unchanged', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    const before = (await getAll(id)).length;

    // Two opens, and StrictMode double-invokes each mount effect — a single
    // open would not catch a write on render. The trail is append-only
    // evidence, so a duplicate cannot be cleaned up afterwards by design.
    const first = renderDetail(id);
    await verdictRegion();
    first.unmount();

    const second = renderDetail(id);
    await verdictRegion();
    second.unmount();

    expect((await getAll(id)).length).toBe(before);
  });
});

// P8-C07, review pass 2. App.tsx passes `policy={policyResult.valid ? ... :
// undefined}` (verified: src/App.tsx:169), so a reviewer CAN reach this page
// with no policy loaded — an invalid policy file is all it takes.
describe('RegisterDetail — evidence status when no policy is loaded (§15.1a)', () => {
  it('says the evidence could not be checked, rather than showing nothing', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    renderDetail(id, null);

    const verdict = within(await verdictRegion());
    // Absence of a policy is not evidence of absent evidence, and silence
    // here would leave a reviewer unable to tell "not checked" from "nothing
    // to show" — the same defect §13.1 names for the reasoning chain.
    expect(verdict.getAllByText('EVIDENCE UNKNOWN').length).toBe(2);
    expect(verdict.getByText(/not the same as having no evidence/i)).toBeInTheDocument();
    expect(verdict.queryByText('UNVERIFIED')).not.toBeInTheDocument();
  });
});

// P8-C08 — verdict-audit.md §13.4 (design review C-1). The twoloD_reviewed
// payload carried no reference to the verdict being signed off, so R3-RD-3's
// fit criterion was unimplementable and TC-R3-RD-3-02 could only be written
// vacuously. This is the closing chunk of Phase 8.
describe('RegisterDetail — the sign-off names the verdict it attests to (P8-C08)', () => {
  it('TC-R3-RD-3-01: after a correction, the page shows the latest verdict, not the superseded one', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ id: 'v-original', use_case_id: id, binding_constraint: 'INV-OLD-01' }));
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: id,
      event_type: 'verdict_corrected',
      occurred_at: '2026-01-03T00:00:00.000Z',
      actor: '1LoD',
      payload: {
        type: 'verdict_corrected',
        original_verdict_id: 'v-original',
        new_verdict: makeVerdict({ id: 'v-corrected', use_case_id: id, binding_constraint: 'INV-NEW-01' }),
      },
    });

    renderDetail(id);
    const verdict = within(await verdictRegion());

    expect(verdict.getAllByText('INV-NEW-01').length).toBeGreaterThan(0);
    // The superseded constraint must not be presented as current. It remains
    // in the timeline below, which is the record of what happened — that is a
    // different claim from "this is the verdict you are signing".
    expect(verdict.queryByText('INV-OLD-01')).toBeNull();
  });

  // ACCEPTANCE TEST (TDD-1, outside-in — written first).
  it('TC-R3-RD-3-02: the sign-off event names the verdict the page rendered', async () => {
    const user = userEvent.setup();
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ id: 'v-rendered', use_case_id: id }));

    renderDetail(id);
    await verdictRegion();
    await user.type(screen.getByLabelText(/your name/i), 'Priya Nair');
    await user.click(screen.getByRole('button', { name: /^approve$/i }));

    const events = await getAll(id);
    const signOff = events.find((e) => e.payload.type === 'twoloD_reviewed');
    expect(signOff).toBeDefined();
    // Not merely present — the id of the verdict actually rendered. An empty
    // string, or an id re-derived at write time, would both satisfy a weaker
    // assertion while leaving the race open.
    expect(signOff && 'verdict_id' in signOff.payload && signOff.payload.verdict_id).toBe('v-rendered');
  });

  // REALISTIC-FIXTURE VARIANT (TDD-3, concurrency). The correction lands
  // BETWEEN the page load and the click — the shape a happy-path test never
  // produces. Without this, an attestation is recorded against whatever is
  // current, and it could never afterwards be established which verdict was
  // actually attested.
  it('TC-R3-RD-3-03: a verdict changing under the reviewer refuses the write and says why', async () => {
    const user = userEvent.setup();
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ id: 'v-seen', use_case_id: id }));

    renderDetail(id);
    await verdictRegion();

    // A correction lands after the reviewer loaded the page.
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: id,
      event_type: 'verdict_corrected',
      occurred_at: '2026-06-01T00:00:00.000Z',
      actor: '1LoD',
      payload: {
        type: 'verdict_corrected',
        original_verdict_id: 'v-seen',
        new_verdict: makeVerdict({ id: 'v-unseen', use_case_id: id }),
      },
    });

    await user.type(screen.getByLabelText(/your name/i), 'Priya Nair');
    await user.click(screen.getByRole('button', { name: /^approve$/i }));

    // The reviewer is told what happened, in terms of what to do next.
    expect(await screen.findByText(/verdict changed while you were reading/i)).toBeInTheDocument();

    // And nothing was attested against the verdict they never saw.
    const events = await getAll(id);
    expect(events.filter((e) => e.payload.type === 'twoloD_reviewed')).toHaveLength(0);
  });
});

// P8-C08 closes the two remaining R3-RD coverage gaps, found by cross-reading
// every id in test-cases-003.md against the ids present in src/. Phase 8 does
// not close with a requirement that only looks covered.
describe('RegisterDetail — remaining R3-RD-1 coverage', () => {
  it('TC-R3-RD-1-02: invariant and control ids match the intake verdict as SETS', async () => {
    const id = crypto.randomUUID();
    const verdict = makeVerdict({ use_case_id: id });
    await seed(id, verdict);
    renderDetail(id);

    const region = await verdictRegion();
    const rendered = region.textContent ?? '';

    // Set comparison, not rendered text: ordering and surrounding prose may
    // differ between the intake and sign-off views without failing. What may
    // NOT differ is which ids the reviewer is shown.
    const expectedInvariants = new Set(verdict.explanation.tripped_invariants.map((t) => t.id));
    const expectedControls = new Set(verdict.controls);

    for (const invariantId of expectedInvariants) {
      expect(rendered, `invariant ${invariantId} missing from the sign-off page`).toContain(invariantId);
    }
    for (const controlId of expectedControls) {
      expect(rendered, `control ${controlId} missing from the sign-off page`).toContain(controlId);
    }
    // And nothing was dropped: the counts match the verdict, so a page
    // rendering only the first of each would fail.
    expect(expectedInvariants.size).toBe(1);
    expect(expectedControls.size).toBe(2);
  });

  it('TC-R3-RD-5-01: policy-authored content is rendered as text, never interpreted as markup [SECURITY]', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id, controls: ['CTRL-XSS-01'] }));

    // Pack and policy content is human-authored and partly external in origin
    // — eu-ai-act.yaml says in its own header that its text has not been
    // verified by a lawyer. It is untrusted input to this view (§13.2a).
    const hostile = {
      version: '1.3',
      hard_lines: [],
      invariants: [],
      controls: [
        {
          id: 'CTRL-XSS-01',
          name: '<img src=x onerror="alert(1)">',
          resolves: [],
          verification_evidence: { status: 'verified', detail: '<script>alert(2)</script>' },
        },
      ],
    } as unknown as PolicyFile;

    const { container } = renderDetail(id, hostile);
    const region = await verdictRegion();

    // The characters appear as literal text, in EVERY place the control name
    // is rendered. Since 2026-08-15 that is two places — the "What you need to
    // do" list and the control set — and both must escape it. `getAllByText`
    // rather than `getByText` because a single match is now ambiguous; note
    // that markup interpretation would yield ZERO matches, not several, so
    // this assertion still fails closed.
    const escaped = within(region).getAllByText(/<img src=x onerror=/);
    expect(escaped.length).toBeGreaterThanOrEqual(2);
    // …and nothing was interpreted as markup.
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });
});

// §15.3: "The existing synchronous in-flight guard on the sign-off actions is
// unchanged and still required (TC-R3-NF-2-02)." It was required and untested.
// P8-C08 adds the write path's staleness check in front of that guard, which
// is exactly the kind of change that could quietly break it.
describe('RegisterDetail — sign-off writes exactly one event under double submission (R3-NF-2)', () => {
  it('TC-R3-NF-2-02: a double-click appends one approval, not two', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ id: 'v-double', use_case_id: id }));

    renderDetail(id);
    await verdictRegion();
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Priya Nair' } });
    const approve = screen.getByRole('button', { name: /^approve$/i });

    // This asserts the REQUIREMENT — exactly one event appended — not any one
    // mechanism. Two layers hold it: the synchronous useRef guard
    // (RegisterDetail.tsx:76) and the button's `disabled={busy}`.
    //
    // Mutation-tested, and the result corrected an earlier claim in this
    // comment. Removing the ref guard alone leaves this green, because in
    // jsdom each fireEvent flushes React's re-render before the next, so the
    // disabled state catches the second click. Removing BOTH layers fails it.
    // The ref still earns its place: in a real browser two clicks can land
    // inside one tick, where a state update is too late — which is the case
    // the ref exists for and jsdom cannot reproduce faithfully.
    fireEvent.click(approve);
    fireEvent.click(approve);
    await waitFor(async () => {
      expect((await getAll(id)).filter((e) => e.payload.type === 'twoloD_reviewed').length).toBeGreaterThan(0);
    });

    const signOffs = (await getAll(id)).filter((e) => e.payload.type === 'twoloD_reviewed');
    expect(signOffs).toHaveLength(1);
  });
});

// Code review round 3, Panel B. `verdict_id: latestVerdict?.id ?? ''` wrote an
// attestation that satisfies the type and points at no verdict. P8-C08 added
// the field so an attestation could always be tied to what was signed; the
// fallback quietly reintroduced the hole it closed.
describe('RegisterDetail — sign-off refuses when there is no verdict to attest to', () => {
  it('writes no twoloD_reviewed event for a use case with no verdict recorded', async () => {
    const user = userEvent.setup();
    const id = crypto.randomUUID();
    await seed(id, null);
    renderDetail(id);

    await screen.findByText(/no verdict is recorded/i);
    await user.click(screen.getByRole('button', { name: /^approve$/i }));

    // Nothing is attested, and the reviewer is told why rather than left to
    // wonder whether the click registered.
    expect(await screen.findByText(/no verdict to attest to/i)).toBeInTheDocument();
    const signOffs = (await getAll(id)).filter((e) => e.payload.type === 'twoloD_reviewed');
    expect(signOffs).toHaveLength(0);
  });
});

// Round 4 close-out. Code review 003's blind panel: the 2LoD sign-off had no
// identity behind it. The role is a dropdown, and the audit trail recorded
// `actor: role` — the string "2LoD", not a person. After the fact the
// append-only trail could not say who signed.
//
// This does not add authentication; the product has no backend to authenticate
// against, and pretending otherwise would be the exact overclaim this product
// refuses. It records WHO CLAIMED to be signing, and says on the page that the
// name is self-asserted. That is the difference between "someone using the
// 2LoD dropdown approved this" and "Priya Nair, acting as 2LoD, approved this
// — name not verified".
describe('RegisterDetail — the sign-off records who signed (round 4 close-out)', () => {
  it('refuses to attest without a name, rather than recording an anonymous approval', async () => {
    const user = userEvent.setup();
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ id: 'v-named', use_case_id: id }));
    renderDetail(id);
    await verdictRegion();

    await user.click(screen.getByRole('button', { name: /^approve$/i }));

    expect(await screen.findByText(/enter your name/i)).toBeInTheDocument();
    expect((await getAll(id)).filter((e) => e.payload.type === 'twoloD_reviewed')).toHaveLength(0);
  });

  it('records the name on the attestation, and says on the page that it is not verified', async () => {
    const user = userEvent.setup();
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ id: 'v-named', use_case_id: id }));
    renderDetail(id);
    await verdictRegion();

    // The page must not imply the name is authenticated — it is typed by
    // whoever is at the keyboard.
    expect(screen.getByText(/not verified|self-asserted/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/your name/i), 'Priya Nair');
    await user.click(screen.getByRole('button', { name: /^approve$/i }));

    const signOff = (await getAll(id)).find((e) => e.payload.type === 'twoloD_reviewed');
    expect(signOff).toBeDefined();
    expect(signOff && 'attested_by_name' in signOff.payload && signOff.payload.attested_by_name).toBe('Priya Nair');
    // The role is still recorded — this adds identity, it does not replace the
    // role dimension the register's visibility rules depend on.
    expect(signOff?.actor).toBe('2LoD');
  });
});

// The reviewer note (2026-08-15). The submitter's optional context, recorded
// with the attestation, must reach the person it exists for — the reviewer at
// sign-off. A note captured and never surfaced would be the
// computed-but-never-consumed defect with a human inside it.
describe('RegisterDetail — the submitter note reaches the reviewer', () => {
  it('renders the note from the graph_confirmed attestation', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: id,
      event_type: 'graph_confirmed',
      occurred_at: '2026-01-01T12:00:00.000Z',
      actor: '1LoD',
      payload: {
        type: 'graph_confirmed', graph_id: 'g1', graph_version: 1, corrections_count: 0,
        submitter_note: 'The personal data is pseudonymised before the model sees it.',
      },
    });
    renderDetail(id);
    await verdictRegion();
    expect(await screen.findByText(/pseudonymised before the model sees it/)).toBeInTheDocument();
    // Framed for the reviewer, with its non-engine status stated — the note
    // must not read as something the verdict already accounted for.
    expect(screen.getByText(/note from the submitter/i)).toBeInTheDocument();
    expect(screen.getByText(/not.*(read|seen) by the rules|rules did not read/i)).toBeInTheDocument();
  });

  it('renders no note block at all when the attestation carries none', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: id,
      event_type: 'graph_confirmed',
      occurred_at: '2026-01-01T12:00:00.000Z',
      actor: '1LoD',
      payload: { type: 'graph_confirmed', graph_id: 'g1', graph_version: 1, corrections_count: 0 },
    });
    renderDetail(id);
    await verdictRegion();
    expect(screen.queryByText(/note from the submitter/i)).toBeNull();
  });

  it('renders a hostile note as text, never as markup [SECURITY]', async () => {
    const id = crypto.randomUUID();
    await seed(id, makeVerdict({ use_case_id: id }));
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: id,
      event_type: 'graph_confirmed',
      occurred_at: '2026-01-01T12:00:00.000Z',
      actor: '1LoD',
      payload: {
        type: 'graph_confirmed', graph_id: 'g1', graph_version: 1, corrections_count: 0,
        submitter_note: 'Fine because <img src=x onerror="alert(1)"> handles it.',
      },
    });
    const { container } = renderDetail(id);
    await verdictRegion();
    await screen.findByText(/note from the submitter/i);
    expect(container.querySelector('img')).toBeNull();
  });
});
