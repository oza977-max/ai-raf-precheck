import { describe, it, expect } from 'vitest';
import {
  addNode,
  addEdge,
  getUseCases,
  getUseCase,
  getBlastRadius,
  updateLifecycleStage,
  updateUseCaseVerdictSummary,
  exportAll,
} from './register';
import { getAll } from './audit';
import type { RegisterNode, RegisterEdge } from './types';

function makeUseCaseNode(overrides: Partial<RegisterNode> = {}): RegisterNode {
  return {
    node_id: overrides.node_id ?? crypto.randomUUID(),
    node_type: 'use_case',
    label: 'A tool that drafts client emails',
    created_at: new Date().toISOString(),
    metadata: {
      node_type: 'use_case',
      submitted_by: 'user-1',
      lifecycle_stage: 'idea',
      current_verdict_id: null,
      tier: null,
      track: null,
    },
    ...overrides,
  };
}

describe('register store', () => {
  it('addNode() writes a use_case node, getUseCases("all") reads it back as a computed summary', async () => {
    const nodeId = crypto.randomUUID();
    const node = makeUseCaseNode({ node_id: nodeId, label: 'All-role probe' });

    await addNode(node);
    const summaries = await getUseCases('all');
    const found = summaries.find((s) => s.use_case_id === nodeId);

    expect(found).toBeDefined();
    expect(found?.label).toBe('All-role probe');
    expect(found?.submitted_by).toBe('user-1');
    expect(found?.lifecycle_stage).toBe('idea');
  });

  it('getUseCases(actorId) filters via the by_submitted_by index, only returning that actor\'s nodes', async () => {
    const actorA = `actor-a-${crypto.randomUUID()}`;
    const actorB = `actor-b-${crypto.randomUUID()}`;

    const nodeA = makeUseCaseNode({
      node_id: crypto.randomUUID(),
      label: 'Belongs to A',
      metadata: {
        node_type: 'use_case',
        submitted_by: actorA,
        lifecycle_stage: 'idea',
        current_verdict_id: null,
        tier: null,
        track: null,
      },
    });
    const nodeB = makeUseCaseNode({
      node_id: crypto.randomUUID(),
      label: 'Belongs to B',
      metadata: {
        node_type: 'use_case',
        submitted_by: actorB,
        lifecycle_stage: 'idea',
        current_verdict_id: null,
        tier: null,
        track: null,
      },
    });

    await addNode(nodeA);
    await addNode(nodeB);

    const resultsForA = await getUseCases(actorA);

    expect(resultsForA).toHaveLength(1);
    expect(resultsForA[0]?.label).toBe('Belongs to A');
  });

  it('getUseCase(useCaseId) returns a single computed summary', async () => {
    const nodeId = crypto.randomUUID();
    const node = makeUseCaseNode({ node_id: nodeId, label: 'Single lookup probe' });

    await addNode(node);
    const summary = await getUseCase(nodeId);

    expect(summary?.label).toBe('Single lookup probe');
  });

  it('getBlastRadius(componentNodeId) finds nodes referencing a component via edges, O(edges)', async () => {
    const componentId = crypto.randomUUID();
    const useCase1 = makeUseCaseNode({ node_id: crypto.randomUUID(), label: 'Consumer 1' });
    const useCase2 = makeUseCaseNode({ node_id: crypto.randomUUID(), label: 'Consumer 2' });
    const unrelated = makeUseCaseNode({ node_id: crypto.randomUUID(), label: 'Unrelated' });

    // Sequential awaited writes — TDD-3 realistic-fixture check: no race/partial-write
    // between back-to-back addNode calls affects a subsequent read.
    await addNode(useCase1);
    await addNode(useCase2);
    await addNode(unrelated);

    const edge1: RegisterEdge = {
      edge_id: crypto.randomUUID(),
      from_node_id: useCase1.node_id,
      to_node_id: componentId,
      edge_type: 'uses_model',
      created_at: new Date().toISOString(),
    };
    const edge2: RegisterEdge = {
      edge_id: crypto.randomUUID(),
      from_node_id: useCase2.node_id,
      to_node_id: componentId,
      edge_type: 'uses_model',
      created_at: new Date().toISOString(),
    };

    await addEdge(edge1);
    await addEdge(edge2);

    const blastRadius = await getBlastRadius(componentId);
    const ids = blastRadius.map((n) => n.node_id);

    expect(ids).toHaveLength(2);
    expect(ids).toContain(useCase1.node_id);
    expect(ids).toContain(useCase2.node_id);
    expect(ids).not.toContain(unrelated.node_id);
  });

  it('updateLifecycleStage() updates the node and appends a lifecycle_stage_changed audit event in the same call', async () => {
    const nodeId = crypto.randomUUID();
    const node = makeUseCaseNode({ node_id: nodeId, label: 'Lifecycle probe' });

    await addNode(node);
    await updateLifecycleStage(nodeId, 'exploring', 'user-1');

    const summary = await getUseCase(nodeId);
    expect(summary?.lifecycle_stage).toBe('exploring');

    const auditEvents = await getAll(nodeId);
    const lifecycleEvent = auditEvents.find((e) => e.event_type === 'lifecycle_stage_changed');

    expect(lifecycleEvent).toBeDefined();
    expect(lifecycleEvent?.actor).toBe('user-1');
    expect(lifecycleEvent?.payload).toEqual({
      type: 'lifecycle_stage_changed',
      from_stage: 'idea',
      to_stage: 'exploring',
    });
  });

  it('updateUseCaseVerdictSummary() updates tier/track/currentVerdictId without throwing (P5-C01 review-caught bug: addNode() on the same node_id twice throws ConstraintError since it uses db.add())', async () => {
    const nodeId = crypto.randomUUID();
    const node = makeUseCaseNode({ node_id: nodeId, label: 'Correction probe' });
    await addNode(node);

    const newVerdictId = crypto.randomUUID();
    await updateUseCaseVerdictSummary(nodeId, { tier: 'High', track: 'II', currentVerdictId: newVerdictId });

    const summary = await getUseCase(nodeId);
    expect(summary?.tier).toBe('High');
    expect(summary?.track).toBe('II');

    const { nodes } = await exportAll();
    const updatedNode = nodes.find((n) => n.node_id === nodeId);
    expect(updatedNode?.metadata.node_type === 'use_case' && updatedNode.metadata.current_verdict_id).toBe(
      newVerdictId,
    );
  });

  it('exportAll() returns all nodes and edges (2LoD export)', async () => {
    const node = makeUseCaseNode({ node_id: crypto.randomUUID(), label: 'Export probe' });
    await addNode(node);

    const { nodes, edges } = await exportAll();

    expect(nodes.some((n) => n.node_id === node.node_id)).toBe(true);
    expect(Array.isArray(edges)).toBe(true);
  });
});
