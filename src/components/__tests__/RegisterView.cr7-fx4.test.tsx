import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterView from '../RegisterView';
import { addNode } from '../../store/register';
import type { RegisterNode } from '../../store/types';

function caseNode(label: string): RegisterNode {
  return {
    node_id: crypto.randomUUID(),
    node_type: 'use_case',
    label,
    created_at: new Date().toISOString(),
    metadata: {
      node_type: 'use_case',
      submitted_by: '1LoD',
      lifecycle_stage: 'pre_checked',
      current_verdict_id: null,
      tier: 'High',
      track: 'II',
    },
  };
}

describe('RegisterView — CR7-07 keyboard access', () => {
  it('TC-CR7-07: the case name is a button; Tab reaches it and Enter opens the case', async () => {
    const user = userEvent.setup();
    const node = caseNode('Keyboard-only case');
    await addNode(node);
    const onSelectRow = vi.fn();
    render(
      <RegisterView role="1LoD" currentPolicyVersion="1.0" selectedId={null} onSelectRow={onSelectRow} onCloseDetail={() => {}} />,
    );
    const btn = await screen.findByRole('button', { name: /Keyboard-only case/ });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveAttribute('type', 'button');
    for (let i = 0; i < 12 && document.activeElement !== btn; i++) await user.tab();
    expect(btn).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelectRow).toHaveBeenCalledTimes(1);
    expect(onSelectRow).toHaveBeenCalledWith(node.node_id);
  });

  it('TC-CR7-07-1: two cases with the same name get different accessible names (tier and stage)', async () => {
    const a = caseNode('Repeated name');
    const b = caseNode('Repeated name');
    (b.metadata as { tier: string; lifecycle_stage: string }).tier = 'Low';
    (b.metadata as { tier: string; lifecycle_stage: string }).lifecycle_stage = 'approved';
    await addNode(a);
    await addNode(b);
    render(<RegisterView role="2LoD" currentPolicyVersion="1.0" selectedId={null} onSelectRow={vi.fn()} onCloseDetail={() => {}} />);
    await screen.findAllByRole('button', { name: /Repeated name/ });
    const user = userEvent.setup();
    const all = screen.queryByRole('button', { name: /show all/i });
    if (all) await user.click(all);
    const names = (await screen.findAllByRole('button', { name: /Repeated name/ })).map((el) => el.getAttribute('aria-label'));
    expect(names).toContain('Repeated name — High tier, Awaiting 2LoD sign-off');
    expect(names).toContain('Repeated name — Low tier, Cleared');
    expect(new Set(names).size).toBe(names.length);
  });
});
