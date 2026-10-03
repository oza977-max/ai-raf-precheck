import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VerdictDisplay from '../VerdictDisplay';
import type { Verdict } from '../../types/verdict';
import type { PolicyFile } from '../../engine/types';

// Code review 005 (owner-approved fix pass, pre-v1.0.0). Findings covered
// here: F8 (evidence panel ignores attestations), F11 ("in place" vs
// "addressed"), F12 (no-policy checklist overclaims, attestations vanish),
// F19 (concurrent attest / form-closes-on-drop), F25 (chip wording), and the
// usability-testing duplicate "Independent validation" presentation.
// code-review-005 relabelling: control-evidence attestation is RG-9 (was
// RG-7, which collided with the existing periodic-sampling requirement).

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    status: 'approved_with_controls',
    tier: 'High',
    track: 'II',
    binding_constraint: 'INV-DATA-01',
    binding_path: 'client notes → drafting model → drafted email',
    controls: ['CTRL-ENC-01'],
    downstream_reviews: [],
    conditions: { hypotheses: [] },
    policy_version: '1.0',
    pack_versions: {},
    applied_overrides: [],
    confidence_caveats: [],
    provisional_reasons: [],
    boundary_proximity: false,
    margin_achieved: 0,
    margin_target: 0.1,
    single_covered_invariants: [],
    explanation: {
      tier_rationale: null,
      track_rationale: null,
      hard_lines_checked: 0,
      invariants_checked: 0,
      tripped_invariants: [],
      binding_reason: null,
      binding_regulatory_basis: null,
    },
    id: 'verdict-1',
    use_case_id: 'uc-1',
    living_status: 'approved',
    living_status_updated_at: '2026-01-01T00:00:00.000Z',
    attested_by: '1LoD',
    attested_at: '2026-01-01T00:00:00.000Z',
    graph_version: 1,
    corrections: [],
    ...overrides,
  } as Verdict;
}

function makePolicy(controls: Array<Record<string, unknown>>): PolicyFile {
  return { controls, hard_lines: [], invariants: [] } as unknown as PolicyFile;
}

const NO_RESERVED_WORDS = /\b(approved|rejected)\b/i;

describe('VerdictDisplay — code review 005, F8: the evidence panel gets a third (attested) state', () => {
  const policy = makePolicy([
    { id: 'CTRL-ENC-01', name: 'Encryption at rest', resolves: [], verification_evidence: { status: 'verified' } },
    { id: 'CTRL-HITL-02', name: 'Human review before action execution', resolves: [] },
  ]);

  it('TC-RG-9-03: shows ATTESTED — NOT VERIFIED, with the attester and evidence note, for a control that is attested but not machine-verified', () => {
    render(
      <VerdictDisplay
        verdict={makeVerdict({ controls: ['CTRL-ENC-01', 'CTRL-HITL-02'] })}
        auditEvents={[]}
        policy={policy}
        controlAttestations={{ 'CTRL-HITL-02': { attested_by_name: 'Sam Oduya', evidence_note: 'sign-off ticket 123' } }}
      />,
    );
    const panel = within(document.querySelector('.verdict__controlset')!);
    expect(panel.getByText('ATTESTED — NOT VERIFIED')).toBeInTheDocument();
    // The verified control is unaffected — still its own, separate chip.
    expect(panel.getByText('VERIFIED')).toBeInTheDocument();
    expect(panel.queryByText('UNVERIFIED')).not.toBeInTheDocument();
    expect(panel.getByText(/sam oduya/i)).toBeInTheDocument();
    expect(panel.getByText(/name not verified/i)).toBeInTheDocument();
    expect(panel.getByText(/sign-off ticket 123/i)).toBeInTheDocument();
    expect(document.querySelector('.verdict__controlset')?.textContent).not.toMatch(NO_RESERVED_WORDS);
  });

  it('folds (collapses behind a summary) once every control is verified or attested — none merely outstanding', () => {
    render(
      <VerdictDisplay
        verdict={makeVerdict({ controls: ['CTRL-ENC-01', 'CTRL-HITL-02'] })}
        auditEvents={[]}
        policy={policy}
        controlAttestations={{ 'CTRL-HITL-02': { attested_by_name: 'Sam Oduya', evidence_note: 'ticket 123' } }}
      />,
    );
    const panel = document.querySelector('.verdict__controlset');
    expect(panel?.closest('details')).not.toBeNull();
    // Honest summary: not all of these are machine-verified, so the gist
    // must not claim "all VERIFIED".
    expect(panel?.closest('details')?.querySelector('.ui__fold-gist')?.textContent).toMatch(/addressed/i);
    expect(panel?.closest('details')?.querySelector('.ui__fold-gist')?.textContent).not.toMatch(/all VERIFIED/);
  });

  it('does NOT fold while a control is truly outstanding (neither verified nor attested) — the honesty floor', () => {
    render(
      <VerdictDisplay
        verdict={makeVerdict({ controls: ['CTRL-ENC-01', 'CTRL-HITL-02'] })}
        auditEvents={[]}
        policy={policy}
        // No attestation for CTRL-HITL-02 this time — it is plain UNVERIFIED.
      />,
    );
    const panel = document.querySelector('.verdict__controlset');
    // R16-D1: this panel now always sits inside the new reviewer-section
    // <details> (verdict__reviewer-section) — the honesty floor this test
    // guards is specifically that the CS-1 evidence Fold itself (Fold.tsx's
    // own <details class="ui__fold">) does not ALSO wrap it while a control
    // is truly outstanding, so scope the check to that class rather than
    // "no details ancestor at all".
    expect(panel?.closest('details.ui__fold')).toBeNull();
    expect(screen.getByText('UNVERIFIED')).toBeInTheDocument();
  });
});

describe('VerdictDisplay — code review 005, F11/F25: "addressed" vs "in place", and chip wording', () => {
  it('TC-RG-9-04: F11: the sign-off checklist calls the verified+attested aggregate "addressed", reserving "in place" for machine-verified', () => {
    const controls = ['C1', 'C2', 'C3', 'C4'];
    const policy = makePolicy(controls.map((id) => ({ id, name: id, resolves: [] })));
    render(
      <VerdictDisplay
        verdict={makeVerdict({ controls })}
        auditEvents={[]}
        policy={policy}
        showSignOffChecklist
        controlAttestations={{ C1: { attested_by_name: 'Robin', evidence_note: 'note' } }}
      />,
    );
    const checklist = document.querySelector('.verdict__signoff-checklist')!;
    expect(checklist.textContent).toMatch(
      /4 controls named · 3 outstanding · 1 addressed · evidence: 0 marked verified in your firm.s policy file, 1 attested by a reviewer \(not verified\), 3 outstanding/,
    );
    expect(checklist.textContent).not.toMatch(/\bin place\b/);
    expect(checklist.textContent).not.toMatch(NO_RESERVED_WORDS);
  });

  it('TC-RG-9-02: F25: the per-control chip in "What you need to do" reads "attested — not verified", lower-case like its neighbours', () => {
    const policy = makePolicy([{ id: 'CTRL-X', name: 'Some control', resolves: [] }]);
    render(
      <VerdictDisplay
        verdict={makeVerdict({ controls: ['CTRL-X'] })}
        auditEvents={[]}
        policy={policy}
        controlAttestations={{ 'CTRL-X': { attested_by_name: 'Robin', evidence_note: 'note' } }}
      />,
    );
    const chip = document.querySelector('.verdict__todo-chip--attested');
    expect(chip?.textContent).toBe('attested — not verified');
  });
});

describe('VerdictDisplay — code review 005, F12: no policy loaded', () => {
  it('TC-RG-9-05: the sign-off checklist shows "evidence unknown" instead of confident outstanding/addressed counts', () => {
    render(
      <VerdictDisplay verdict={makeVerdict({ controls: ['CTRL-X'] })} auditEvents={[]} showSignOffChecklist />,
    );
    const checklist = document.querySelector('.verdict__signoff-checklist')!;
    expect(checklist.textContent).toMatch(/evidence unknown/i);
    expect(checklist.textContent).toMatch(/policy isn.t loaded/i);
    expect(checklist.textContent).not.toMatch(/\boutstanding\b/);
    expect(checklist.textContent).not.toMatch(/\baddressed\b/);
    expect(checklist.textContent).not.toMatch(NO_RESERVED_WORDS);
  });

  it('TC-RG-9-06: still names a recorded attestation on the no-policy checklist line, because it does not come from the policy', () => {
    render(
      <VerdictDisplay
        verdict={makeVerdict({ controls: ['CTRL-X'] })}
        auditEvents={[]}
        showSignOffChecklist
        controlAttestations={{ 'CTRL-X': { attested_by_name: 'Robin', evidence_note: 'out-of-band check' } }}
      />,
    );
    const checklist = document.querySelector('.verdict__signoff-checklist')!;
    expect(checklist.textContent).toMatch(/evidence unknown/i);
    expect(checklist.textContent).toMatch(/1 already attested by a reviewer \(not verified\)/i);
  });

  it('a recorded attestation is always shown for its control in "What you need to do", even with no policy loaded', async () => {
    const user = userEvent.setup();
    render(
      <VerdictDisplay
        verdict={makeVerdict({ controls: ['CTRL-X'] })}
        auditEvents={[]}
        controlAttestations={{ 'CTRL-X': { attested_by_name: 'Robin', evidence_note: 'out-of-band check' } }}
        // Gates whether ControlEvidenceAttest (the attested display line)
        // renders at all — not exercised here, just needed to be truthy.
        onAttestControlEvidence={vi.fn()}
      />,
    );
    // No policy -> no control name resolves, so the disclosure is keyed by
    // the bare id.
    await user.click(screen.getAllByText('CTRL-X')[0]!);
    const todo = document.querySelector('.verdict__todo');
    expect(todo?.textContent).toMatch(/robin/i);
    expect(todo?.textContent).toMatch(/out-of-band check/i);
    // The chip must say attested, not swallow it into "evidence unknown".
    const chip = document.querySelector('.verdict__todo-chip--attested');
    expect(chip?.textContent).toBe('attested — not verified');
    expect(document.querySelector('.verdict__todo')?.textContent).not.toMatch(NO_RESERVED_WORDS);
  });
});

// R16-D1 (build/prompts/R16.md v2.1 §4.1/§1.3): describesSameObligation's
// significant-word text heuristic is deleted. A control now names, in the
// policy file, exactly which review ids (base ids, §1.3) its own action
// covers (`covers_reviews`), matched against the per-instance
// `downstream_review_sources` the verdict carries — a referential check
// (grounding/PACK-AUTHORING.md's reviewer checklist), not a guess from two
// authors' wording. TC-RG-9-10 and TC-RG-8-37 guarded specific bugs in that
// deleted word-matching algorithm (a one-significant-word control, a subset-
// vs-equal-set mismatch) — moved to test-cases-016.md's Superseded section;
// the mechanism they protected against no longer exists to regress.
describe('VerdictDisplay — code review 005 (usability testing): a control and a review naming the same obligation render once', () => {
  it('TC-RG-9-09: shows "Independent validation (2LoD)" once, as the control, noting it also covers the pack review', () => {
    const policy = makePolicy([
      {
        id: 'CTRL-INDEP-VAL-01',
        name: 'Independent validation (2LoD)',
        resolves: [],
        description: 'Validation team review',
        covers_reviews: ['SS1-UK-REV-01'],
      },
    ]);
    render(
      <VerdictDisplay
        verdict={makeVerdict({
          controls: ['CTRL-INDEP-VAL-01'],
          downstream_reviews: ['Independent model validation (2LoD)', 'Vendor risk assessment'],
          downstream_review_sources: [
            { review: 'Independent model validation (2LoD)', rule_id: 'SS1-UK-REV-01' },
            { review: 'Vendor risk assessment', rule_id: 'DR-VENDOR-01' },
          ],
        })}
        auditEvents={[]}
        policy={policy}
      />,
    );
    const todo = document.querySelector<HTMLElement>('.verdict__todo')!;
    // Named once, under the control, with a note it also covers the review.
    const note = within(todo).getByText(/also covers/i).closest('p');
    expect(note?.textContent).toMatch(/independent model validation \(2lod\)/i);
    expect(note?.textContent).toMatch(/the same check under another name/i);
    // The genuinely separate review is still listed on its own.
    const reviewsList = todo.querySelector('.verdict__todo-list--reviews');
    expect(reviewsList?.textContent).toMatch(/vendor risk assessment/i);
    // But the matched review does not also appear a second time in that list.
    expect(reviewsList?.textContent).not.toMatch(/independent model validation/i);
    // And the lead sentence's review count reflects only the genuinely
    // separate review (1), not the raw engine count (2).
    const lead = todo.querySelector('.verdict__todo-lead');
    expect(lead?.textContent).toMatch(/1 separate review/);
  });

  it("lists both reviews separately when no control's covers_reviews names them", () => {
    const policy = makePolicy([{ id: 'CTRL-ENC-01', name: 'Encryption in transit', resolves: [] }]);
    render(
      <VerdictDisplay
        verdict={makeVerdict({
          controls: ['CTRL-ENC-01'],
          downstream_reviews: ['Information security review', 'Vendor risk assessment'],
          downstream_review_sources: [
            { review: 'Information security review', rule_id: 'DR-INFOSEC-01' },
            { review: 'Vendor risk assessment', rule_id: 'DR-VENDOR-01' },
          ],
        })}
        auditEvents={[]}
        policy={policy}
      />,
    );
    const todo = document.querySelector<HTMLElement>('.verdict__todo')!;
    expect(within(todo).queryByText(/also covers/i)).not.toBeInTheDocument();
    const reviewsList = todo.querySelector('.verdict__todo-list--reviews');
    expect(reviewsList?.textContent).toMatch(/information security review/i);
    expect(reviewsList?.textContent).toMatch(/vendor risk assessment/i);
  });
});

// code-review-005 round 2, N5. The no-policy branch of "The control set,
// with evidence status" showed EVIDENCE UNKNOWN for every control, even one
// with a recorded attestation — contradicting the WhatToDo panel and the
// sign-off checklist elsewhere on the SAME screen, which both already call
// that control "attested". No policy means no VERIFIED tier is possible
// (there is nothing to check machine evidence against), but an attestation
// comes from the audit trail, not the policy, so it is exactly as knowable
// here as it is in the with-policy branch.
describe('VerdictDisplay — code review 005 round 2, N5: no policy loaded, but a control is attested', () => {
  it('TC-RG-8-36: shows ATTESTED — NOT VERIFIED with the attester (name not verified) and the evidence note, not EVIDENCE UNKNOWN', () => {
    render(
      <VerdictDisplay
        verdict={makeVerdict({ controls: ['CTRL-X', 'CTRL-Y'] })}
        auditEvents={[]}
        // No `policy` prop at all — the BC-V13-03 no-policy branch.
        controlAttestations={{ 'CTRL-X': { attested_by_name: 'Priya Nair', evidence_note: 'sign-off ticket 456' } }}
      />,
    );
    const panel = within(document.querySelector('.verdict__controlset')!);
    expect(panel.getByText('ATTESTED — NOT VERIFIED')).toBeInTheDocument();
    expect(panel.getByText(/priya nair/i)).toBeInTheDocument();
    expect(panel.getByText(/name not verified/i)).toBeInTheDocument();
    expect(panel.getByText(/sign-off ticket 456/i)).toBeInTheDocument();
    // The OTHER control, genuinely un-attested, still reads unknown — this
    // fix must not fabricate an attestation that was never recorded.
    expect(panel.getByText('EVIDENCE UNKNOWN')).toBeInTheDocument();
    expect(document.querySelector('.verdict__controlset')?.textContent).not.toMatch(NO_RESERVED_WORDS);
  });
});

describe('VerdictDisplay — code review 005, F19: the attest form waits for confirmation', () => {
  function AttestHarness({ verdict, policy }: { verdict: Verdict; policy: PolicyFile }) {
    const [errors, setErrors] = useState<Map<string, string>>(new Map());
    const onAttest = vi.fn(async (controlId: string) => {
      setErrors(new Map([[controlId, 'Recording the attestation failed: boom.']]));
      return false;
    });
    return (
      <VerdictDisplay
        verdict={verdict}
        auditEvents={[]}
        policy={policy}
        onAttestControlEvidence={onAttest}
        controlEvidenceErrors={errors}
      />
    );
  }

  it('TC-RG-9-08: keeps the form open and shows the error inline when the write fails, instead of closing as if it saved', async () => {
    const user = userEvent.setup();
    const policy = makePolicy([{ id: 'CTRL-X', name: 'Some control', resolves: [] }]);
    render(<AttestHarness verdict={makeVerdict({ controls: ['CTRL-X'] })} policy={policy} />);

    // "Some control" also appears in the CS-1 evidence panel further down
    // the page — the first match is this control's own to-do disclosure.
    await user.click(screen.getAllByText('Some control')[0]!);
    await user.type(screen.getByLabelText(/attested by/i), 'Priya Nair');
    await user.type(screen.getByLabelText(/^evidence$/i), 'a note');
    await user.click(screen.getByRole('button', { name: /^attest in place$/i }));

    // The failure must be visible, and the form must still be there to
    // retry — not a silent revert to "outstanding" with the typed text gone.
    expect(await screen.findByText(/recording the attestation failed: boom/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/attested by/i)).toHaveValue('Priya Nair');
    expect(screen.getByRole('button', { name: /^attest in place$/i })).toBeInTheDocument();
    // It must not have flipped to the read-only "Attested in place" display.
    expect(screen.queryByText(/^Attested in place:/)).not.toBeInTheDocument();
  });
});
