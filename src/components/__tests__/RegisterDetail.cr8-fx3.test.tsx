import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import RegisterView from '../RegisterView';
import VerdictDisplay from '../VerdictDisplay';
import AboutPanel from '../AboutPanel';
import { addNode } from '../../store/register';
import { append } from '../../store/audit';
import type { RegisterNode } from '../../store/types';
import type { Verdict } from '../../types/verdict';

// FX8-3 / code review 008, CR8-04 (P5): no surface claims the audit check detects more than the
// linkage and hashes of the events PRESENT. Deleting the NEWEST events leaves a chain that still
// verifies (TC-CR8-04b in the store tests pins that limit), so none of these surfaces may say a
// deleted event "is detectable" or that the trail is "unbroken" / "verified" as a whole.

function Harness(props: Omit<ComponentProps<typeof RegisterView>, 'selectedId' | 'onSelectRow' | 'onCloseDetail'>) {
  const [sel, setSel] = useState<string | null>(null);
  return <RegisterView {...props} selectedId={sel} onSelectRow={setSel} onCloseDetail={() => setSel(null)} />;
}

function makeVerdict(useCaseId: string): Verdict {
  return {
    status: 'approved_with_controls', tier: 'High', track: 'II', binding_constraint: 'INV-DATA-01', binding_path: 'a → b',
    controls: [], downstream_reviews: [], conditions: { hypotheses: [] }, policy_version: '1.0', pack_versions: {},
    applied_overrides: [], confidence_caveats: [], provisional_reasons: [], boundary_proximity: false,
    margin_achieved: 0, margin_target: 0.1, single_covered_invariants: [],
    explanation: { tier_rationale: null, track_rationale: null, hard_lines_checked: 0, invariants_checked: 0, tripped_invariants: [], binding_reason: null, binding_regulatory_basis: null },
    id: crypto.randomUUID(), use_case_id: useCaseId, living_status: 'approved', living_status_updated_at: new Date().toISOString(),
    attested_by: '1LoD', attested_at: new Date().toISOString(), graph_version: 1, corrections: [],
  } as Verdict;
}

async function seedCase(label: string): Promise<string> {
  const id = crypto.randomUUID();
  const node: RegisterNode = {
    node_id: id, node_type: 'use_case', label, created_at: new Date().toISOString(),
    metadata: { node_type: 'use_case', submitted_by: '1LoD', lifecycle_stage: 'pre_checked', current_verdict_id: null, tier: 'High', track: 'II' },
  };
  await addNode(node);
  await append({
    event_id: crypto.randomUUID(), use_case_id: id, event_type: 'graph_confirmed', occurred_at: new Date().toISOString(), actor: '1LoD',
    payload: { type: 'graph_confirmed', graph_id: 'g1', graph_version: 1, corrections_count: 0 },
  });
  await append({
    event_id: crypto.randomUUID(), use_case_id: id, event_type: 'verdict_produced', occurred_at: new Date().toISOString(), actor: 'system',
    payload: { type: 'verdict_produced', verdict: makeVerdict(id) },
  });
  return id;
}

// Claims the check cannot back (BC-005).
const OVERCLAIM = /deleted event[^.]*\bdetectable\b|altered or deleted|unbroken|Chain integrity verified|proving the chain is intact|proves? the chain/i;

describe('RegisterDetail — CR8-04 (P5): the integrity wording', () => {
  it('TC-CR8-04c: the banner says only that no break was found in the events present, and the caveat names what is not detectable', async () => {
    const user = userEvent.setup();
    await seedCase('Integrity wording case');
    render(<Harness role="2LoD" currentPolicyVersion="1.0" />);
    await user.click(await screen.findByText('Integrity wording case'));
    await screen.findByText(/No break found|Chain integrity/);
    const banner = document.querySelector('.register-detail__chain-ok')!;
    expect(banner.textContent).toBe('No break found in the 2 events present.');
    const caveat = document.querySelector('.register-detail__caveat')!.textContent!.replace(/\s+/g, ' ');
    expect(caveat).toContain('an edited event, or a deleted event with later events after it, breaks the chain');
    expect(caveat).toMatch(/removing the newest events can't be detected from inside this browser/i);
    // The two phrases other tests pin still hold.
    expect(caveat).toMatch(/hash-chained to the one before it/i);
    expect(caveat).toMatch(/cannot rule out someone with full local access/i);
  });
});

describe('Integrity wording sweep — CR8-04 (P5)', () => {
  it('TC-CR8-04d: the register detail, the result reviewer section and the About page carry no over-claim', async () => {
    const user = userEvent.setup();
    await seedCase('Sweep case');
    const reg = render(<Harness role="2LoD" currentPolicyVersion="1.0" />);
    await user.click(await screen.findByText('Sweep case'));
    await screen.findByText(/No break found|Chain integrity/);
    const registerText = reg.container.textContent ?? '';
    reg.unmount();

    const verdict = render(<VerdictDisplay verdict={makeVerdict('uc')} auditEvents={[]} onCorrect={vi.fn()} />);
    const verdictText = verdict.container.textContent ?? '';
    verdict.unmount();

    const about = render(<AboutPanel onNavigate={() => {}} />);
    const aboutText = about.container.textContent ?? '';

    for (const [name, text] of [['register detail', registerText], ['verdict reviewer section', verdictText], ['about page', aboutText]] as const) {
      expect(text, name).not.toMatch(OVERCLAIM);
      expect(text, name).toMatch(/newest events/i);
    }
  });
});
