import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPolicy } from '../store/policy';
import { getUseCase, exportAll } from '../store/register';
import { getAll } from '../store/audit';
import { routeToWorkflow } from '../engine/workflow-router';
import { seedAigateSelfAssessment, AIGATE_USE_CASE_ID } from './aigate-self-assessment';
import type { PolicyFile } from '../engine/types';

let policy: PolicyFile;

beforeAll(() => {
  const yaml = readFileSync(resolve(__dirname, '../../policy/appetite.yaml'), 'utf-8');
  const result = loadPolicy(yaml);
  if (!result.valid) throw new Error(`fixture policy invalid: ${JSON.stringify(result.errors)}`);
  policy = result.policy;
});

describe('seedAigateSelfAssessment (TC-LC-4-02)', () => {
  it('AIGate appears in the register with a real, non-null verdict', async () => {
    await seedAigateSelfAssessment(policy);

    const summary = await getUseCase(AIGATE_USE_CASE_ID);
    expect(summary).toBeDefined();
    expect(summary?.submitted_by).toBe('system');
    expect(summary?.current_verdict_status).not.toBeNull();
  });

  it("the produced verdict's policy_version matches the loaded policy's version", async () => {
    await seedAigateSelfAssessment(policy);

    const summary = await getUseCase(AIGATE_USE_CASE_ID);
    expect(summary?.policy_version_at_evaluation).toBe(policy.version);

    const events = await getAll(AIGATE_USE_CASE_ID);
    const verdictEvent = events.find((e) => e.event_type === 'verdict_produced');
    expect(verdictEvent).toBeDefined();
    if (verdictEvent?.payload.type === 'verdict_produced') {
      expect(verdictEvent.payload.verdict.policy_version).toBe(policy.version);
    }
  });

  it('BC-P7C01-01: routes through the exact same routeToWorkflow() as any other use case — no auto-approve special-casing', async () => {
    await seedAigateSelfAssessment(policy);

    const summary = await getUseCase(AIGATE_USE_CASE_ID);
    expect(summary?.tier).toBeDefined();
    const expectedWorkflow = routeToWorkflow(summary!.tier as Parameters<typeof routeToWorkflow>[0], policy);
    expect(summary?.lifecycle_stage).toBe(expectedWorkflow.lifecycle_stage);
  });

  it('BC-P7C01-02: is idempotent — a second call does not throw and does not create a duplicate register entry', async () => {
    await seedAigateSelfAssessment(policy);
    const { nodes: nodesAfterFirst } = await exportAll();
    const aigateNodesAfterFirst = nodesAfterFirst.filter((n) => n.node_id === AIGATE_USE_CASE_ID);
    expect(aigateNodesAfterFirst).toHaveLength(1);

    await expect(seedAigateSelfAssessment(policy)).resolves.toBeUndefined();

    const { nodes: nodesAfterSecond } = await exportAll();
    const aigateNodesAfterSecond = nodesAfterSecond.filter((n) => n.node_id === AIGATE_USE_CASE_ID);
    expect(aigateNodesAfterSecond).toHaveLength(1);
  });

  it('review finding, pass 1: two concurrent calls (simulating React StrictMode double-invoking a mount effect) do not race — only one seed sequence runs, no duplicate audit events or ConstraintError', async () => {
    await Promise.all([seedAigateSelfAssessment(policy), seedAigateSelfAssessment(policy)]);

    const { nodes } = await exportAll();
    const aigateNodes = nodes.filter((n) => n.node_id === AIGATE_USE_CASE_ID);
    expect(aigateNodes).toHaveLength(1);

    const events = await getAll(AIGATE_USE_CASE_ID);
    const verdictEvents = events.filter((e) => e.event_type === 'verdict_produced');
    expect(verdictEvents).toHaveLength(1);
  });

  it('inserts the Anthropic vendor node and a provided_by_vendor edge', async () => {
    await seedAigateSelfAssessment(policy);

    const { nodes, edges } = await exportAll();
    const vendorNode = nodes.find((n) => n.node_type === 'vendor' && n.label === 'Anthropic');
    expect(vendorNode).toBeDefined();

    const edge = edges.find(
      (e) => e.from_node_id === AIGATE_USE_CASE_ID && e.edge_type === 'provided_by_vendor' && e.to_node_id === vendorNode?.node_id,
    );
    expect(edge).toBeDefined();
  });
});
