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
});
