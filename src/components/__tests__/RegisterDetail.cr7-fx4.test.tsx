import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RegisterDetail, { eventDetail } from '../RegisterDetail';
import { addNode } from '../../store/register';
import { append } from '../../store/audit';
import type { AuditEvent, RegisterNode } from '../../store/types';

// FX7-4 / code review 007: CR7-10 (audit-line half) and CR7-30 (render half).

const base = {
  event_id: 'e-1',
  use_case_id: 'uc-1',
  occurred_at: '2026-09-28T10:00:00.000Z',
  actor: '1LoD',
  hash: 'h',
  prev_hash: null,
};

function dismissed(): AuditEvent {
  return {
    ...base,
    event_type: 'duplicate_dismissed',
    payload: { type: 'duplicate_dismissed', candidate_use_case_id: 'abcdef12-0000', candidate_label: 'Another team secret project' },
  } as unknown as AuditEvent;
}
function adopted(): AuditEvent {
  return {
    ...base,
    event_type: 'classification_adopted',
    payload: {
      type: 'classification_adopted',
      adopted_from_use_case_id: 'abcdef12-0000',
      adopted_from_label: 'Another team secret project',
      tier: 'High',
      track: 'II',
    },
  } as unknown as AuditEvent;
}

describe('RegisterDetail eventDetail — CR7-10c: another case\'s name is for 2LoD only', () => {
  it('TC-CR7-10c: a 1LoD view omits the matched label from both lines; the 2LoD view keeps it', () => {
    for (const ev of [dismissed(), adopted()]) {
      expect(eventDetail(ev, '1LoD')).not.toContain('Another team secret project');
      expect(eventDetail(ev, '2LoD')).toContain('Another team secret project');
    }
    // the 1LoD lines still say what happened
    expect(eventDetail(dismissed(), '1LoD')).toMatch(/Similar use case reviewed and dismissed/);
    expect(eventDetail(adopted(), '1LoD')).toMatch(/Classification adopted/);
    expect(eventDetail(adopted(), '1LoD')).toMatch(/tier High, track II/);
  });

  it('TC-CR7-10c-1: the rendered trail for a 1LoD viewer never carries the matched label (real component, real store)', async () => {
    const id = crypto.randomUUID();
    await addNode({
      node_id: id,
      node_type: 'use_case',
      label: 'My own case',
      created_at: '2026-01-01T00:00:00.000Z',
      metadata: { node_type: 'use_case', submitted_by: '1LoD', lifecycle_stage: 'pre_checked', current_verdict_id: null, tier: 'High', track: 'II' },
    } as RegisterNode);
    await append({
      event_id: crypto.randomUUID(),
      use_case_id: id,
      event_type: 'classification_adopted',
      occurred_at: '2026-01-02T00:00:00.000Z',
      actor: '1LoD',
      payload: { type: 'classification_adopted', adopted_from_use_case_id: 'abcdef12-0000', adopted_from_label: 'Another team secret project', tier: 'High', track: 'II' },
    } as unknown as Parameters<typeof append>[0]);
    const { container } = render(<RegisterDetail useCaseId={id} role="1LoD" onBack={vi.fn()} />);
    await screen.findByText(/Classification adopted/);
    expect(container.textContent).not.toContain('Another team secret project');
  });
});

describe('RegisterDetail eventDetail — CR7-30b: a missing value is "not stated", never "undefined"', () => {
  function corrected(original: unknown, correctedValue: unknown, omitOriginal = false): AuditEvent {
    return {
      ...base,
      event_type: 'graph_corrected',
      payload: {
        type: 'graph_corrected',
        graph_id: 'g1',
        correction: { field: 'declared_model_id', ...(omitOriginal ? {} : { original_value: original }), corrected_value: correctedValue },
      },
    } as unknown as AuditEvent;
  }

  it('TC-CR7-30b: a null original value reads "not stated"', () => {
    expect(eventDetail(corrected(null, 'qwen3:4b'))).toContain('declared_model_id corrected: not stated → qwen3:4b');
  });

  it('TC-CR7-30b-1: an absent original value (legacy / JSON-dropped undefined) reads "not stated", not "undefined"', () => {
    const line = eventDetail(corrected(undefined, 'qwen3:4b', true));
    expect(line).toContain('not stated → qwen3:4b');
    expect(line).not.toMatch(/undefined/);
  });

  it('TC-CR7-30b-2: real values, including 0 and false, still show as themselves', () => {
    expect(eventDetail(corrected(0, false))).toContain('corrected: 0 → false');
    expect(eventDetail(corrected('a', 'b'))).toContain('corrected: a → b');
  });
});
