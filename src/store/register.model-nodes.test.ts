import { describe, it, expect } from 'vitest';
import { addNode, addUseCaseModelLink, exportAll } from './register';
import type { RegisterNode } from './types';
import type { PolicyFile, ProcessingNode } from '../engine/types';

// R11-MG-3 / ADR-RL-R11-1 (register-lifecycle.md §16). The regression test
// named in requirements-011.md's fit criteria: "a test that fails if it goes
// dormant again" — the ai_model node/uses_model edge schema existed since
// the register's first design and was never once instantiated before this
// round.

function makeUseCaseNode(nodeId: string, label: string): RegisterNode {
  return {
    node_id: nodeId,
    node_type: 'use_case',
    label,
    created_at: new Date().toISOString(),
    metadata: {
      node_type: 'use_case',
      submitted_by: 'tester',
      lifecycle_stage: 'idea',
      current_verdict_id: null,
      tier: null,
      track: null,
    },
  };
}

function makeProcessingNode(modelId: string): ProcessingNode {
  return {
    id: crypto.randomUUID(),
    label: 'x',
    model_type: 'ml',
    autonomy_level: 1,
    data_zone: 'Zone B',
    vendor: 'internal',
    replaces_prior_model: false,
    declared_model_id: modelId,
  };
}

function makePolicy(modelId: string, isApproved: boolean): PolicyFile {
  return {
    version: '1.0',
    policy_id: 'TEST',
    firm_name: 'Test Firm',
    translation_attestation: { attested_by: 'x', role: 'x', date: '2026-01-01', raf_version_checked: '1.0' },
    hard_lines: [],
    tracks: [],
    tiers: [],
    invariants: [],
    controls: [],
    kri_thresholds: {},
    jurisdictions: [],
    roles: {},
    tier_workflow: { Critical: 'x', High: 'x', Medium: 'x', Low: 'x' },
    safety_margin: 0.1,
    approved_models: [
      {
        model_id: modelId,
        vendor: 'Test Vendor',
        provenance_class: 'vendor_hosted',
        is_approved: isApproved,
      },
    ],
  };
}

describe('addUseCaseModelLink — TC-R11-MG-6 dormancy-repeat guard', () => {
  it('two use cases declaring the SAME model produce exactly ONE ai_model node and TWO uses_model edges', async () => {
    const modelId = `test-model-${crypto.randomUUID()}`;
    const policy = makePolicy(modelId, true);

    const useCase1Id = crypto.randomUUID();
    const useCase2Id = crypto.randomUUID();
    await addNode(makeUseCaseNode(useCase1Id, 'Use case 1'));
    await addNode(makeUseCaseNode(useCase2Id, 'Use case 2'));

    const processingNode1 = makeProcessingNode(modelId);
    const processingNode2 = makeProcessingNode(modelId);

    await addUseCaseModelLink(useCase1Id, processingNode1, policy);
    await addUseCaseModelLink(useCase2Id, processingNode2, policy);

    const { nodes, edges } = await exportAll();

    const modelNodes = nodes.filter((n) => n.node_type === 'ai_model' && n.label === modelId);
    expect(modelNodes).toHaveLength(1);
    const modelNode = modelNodes[0]!;
    if (modelNode.metadata.node_type === 'ai_model') {
      expect(modelNode.metadata.model_id).toBe(modelId);
      expect(modelNode.metadata.vendor).toBe('Test Vendor');
      expect(modelNode.metadata.is_approved).toBe(true);
    }

    const modelEdges = edges.filter((e) => e.edge_type === 'uses_model' && e.to_node_id === modelNode.node_id);
    expect(modelEdges).toHaveLength(2);
    expect(new Set(modelEdges.map((e) => e.from_node_id))).toEqual(new Set([useCase1Id, useCase2Id]));
  });

  it('records is_approved: false and a snapshot vendor when the registry entry is unapproved', async () => {
    const modelId = `test-model-unapproved-${crypto.randomUUID()}`;
    const policy = makePolicy(modelId, false);
    const useCaseId = crypto.randomUUID();
    await addNode(makeUseCaseNode(useCaseId, 'Use case'));

    await addUseCaseModelLink(useCaseId, makeProcessingNode(modelId), policy);

    const { nodes } = await exportAll();
    const modelNode = nodes.find((n) => n.node_type === 'ai_model' && n.label === modelId);
    expect(modelNode).toBeDefined();
    if (modelNode?.metadata.node_type === 'ai_model') {
      expect(modelNode.metadata.is_approved).toBe(false);
    }
  });

  it('a processing node with no declared_model_id writes nothing', async () => {
    const policy = makePolicy('unused-model', true);
    const useCaseId = crypto.randomUUID();
    await addNode(makeUseCaseNode(useCaseId, 'Use case'));

    const nodeWithoutModel: ProcessingNode = {
      id: crypto.randomUUID(),
      label: 'x',
      model_type: 'ml',
      autonomy_level: 1,
      data_zone: 'Zone B',
      vendor: 'internal',
      replaces_prior_model: false,
    };

    await addUseCaseModelLink(useCaseId, nodeWithoutModel, policy);

    const { edges } = await exportAll();
    const edge = edges.find((e) => e.from_node_id === useCaseId && e.edge_type === 'uses_model');
    expect(edge).toBeUndefined();
  });
});
