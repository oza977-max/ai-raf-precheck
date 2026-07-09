import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateReasoningTrace, buildTraceData } from './reasoning-trace';
import type { Verdict } from '../types/verdict';
import type { Control } from '../engine/types';

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
    boundary_proximity: false,
    id: 'verdict-1',
    use_case_id: 'uc-1',
    living_status: 'approved',
    living_status_updated_at: '2026-01-01T00:00:00.000Z',
    attested_by: '1LoD',
    attested_at: '2026-01-01T00:00:00.000Z',
    graph_version: 1,
    corrections: [],
    ...overrides,
  };
}

const CONTROL_LIBRARY: Control[] = [
  {
    id: 'CTRL-ENC-01',
    name: 'Encryption in transit',
    description: 'All data in transit to external endpoints must use TLS 1.3 or higher',
    resolves: ['INV-DATA-01'],
    burden: 1,
    verification: 'x',
    platform_satisfies: [],
  },
];

const mockCreate = vi.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'Track II per SS1/23 §3.4. Client PII flows to Zone B, requiring encryption.' }],
});

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

describe('buildTraceData', () => {
  it('maps control IDs to full Control records from the library', () => {
    const trace = buildTraceData(makeVerdict(), CONTROL_LIBRARY, 'Client PII must not flow externally without encryption.');
    expect(trace.controls_required).toEqual([
      { id: 'CTRL-ENC-01', name: 'Encryption in transit', description: 'All data in transit to external endpoints must use TLS 1.3 or higher' },
    ]);
  });

  it('builds a one-element tripped_invariants array from binding_constraint/binding_path', () => {
    const trace = buildTraceData(makeVerdict(), CONTROL_LIBRARY, 'desc');
    expect(trace.tripped_invariants).toEqual([
      { invariantId: 'INV-DATA-01', graphPath: 'client notes → drafting model → drafted email' },
    ]);
  });

  it('returns an empty tripped_invariants array when there is no binding constraint (clean approval)', () => {
    const trace = buildTraceData(makeVerdict({ binding_constraint: '', controls: [] }), CONTROL_LIBRARY, '');
    expect(trace.tripped_invariants).toEqual([]);
  });
});

describe('generateReasoningTrace', () => {
  beforeEach(() => {
    mockCreate.mockClear();
  });

  it('TC-VD-8-01: returns prose containing a regulatory citation when the policy description includes one', async () => {
    const trace = buildTraceData(makeVerdict(), CONTROL_LIBRARY, 'SS1/23 §3.4 requires independent validation.');
    const result = await generateReasoningTrace(trace, 'test-key');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatch(/SS1\/23 §3\.4/);
    }
    // Verify the exact §7 prompt structure was sent.
    const callArgs = mockCreate.mock.calls[0]![0];
    expect(callArgs.messages[0].content).toContain('You are a regulatory documentation assistant');
    expect(callArgs.messages[0].content).toContain('Write the reasoning trace.');
  });

  it('returns no-api-key error cleanly when no key is configured, without throwing', async () => {
    const trace = buildTraceData(makeVerdict(), CONTROL_LIBRARY, 'desc');
    const result = await generateReasoningTrace(trace, '');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('no-api-key');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('BC-P5C02-01: a network failure returns a clean Result, never throws, never blocks verdict storage', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network down'));
    const trace = buildTraceData(makeVerdict(), CONTROL_LIBRARY, 'desc');

    const result = await generateReasoningTrace(trace, 'test-key');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('network-error');
  });
});
