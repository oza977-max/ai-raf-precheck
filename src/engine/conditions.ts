import type { DataFlowGraph, KriThresholds, PolicyFile, Tier } from './types';

// V1.2-B (design-gap-audit A8): VD-7 standing conditions — "the verdict
// is a hypothesis; V1 populates the conditions slots statically"
// (design-vision decision #2, unimplemented until now). Pure engine
// module (Rule 1): deterministic bounds derived from the policy's
// kri_thresholds plus two graph pins. BC-V12B-02: only bounds actually
// present in the policy produce a line — absent/unrecognized shapes emit
// nothing, never an invented default. BC-V12B-03: no string here may
// contain the words "approved"/"rejected".

type Band = Record<string, unknown> | number | undefined;

function boundToText(v: Band): string | null {
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'object' || v === null) return null;
  const b = v as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof b.gte === 'number' && typeof b.lte === 'number') {
    parts.push(`${b.gte}–${b.lte}`);
  } else {
    if (typeof b.gte === 'number') parts.push(`≥${b.gte}`);
    if (typeof b.lte === 'number') parts.push(`≤${b.lte}`);
  }
  if (typeof b.gt === 'number') parts.push(`>${b.gt}`);
  if (typeof b.lt === 'number') parts.push(`<${b.lt}`);
  return parts.length > 0 ? parts.join(' ') : null;
}

function bandLine(label: string, bands: unknown, unit: string): string | null {
  if (typeof bands !== 'object' || bands === null) return null;
  const b = bands as Record<string, Band>;
  const green = boundToText(b.green);
  const amber = boundToText(b.amber);
  const red = boundToText(b.red);
  if (!green || !amber || !red) return null;
  return `${label}: green ${green}${unit} · amber ${amber}${unit} · red ${red}${unit}`;
}

function dimension(kri: KriThresholds, group: string, key: string): unknown {
  const g = kri[group];
  if (typeof g !== 'object' || g === null) return undefined;
  return (g as Record<string, unknown>)[key];
}

export function buildStandingConditions(graph: DataFlowGraph, policy: PolicyFile, tier: Tier): string[] {
  const out: string[] = [];
  const kri = policy.kri_thresholds ?? {};

  const drift = bandLine('Model drift since validation', dimension(kri, 'performance', 'drift_pct'), '%');
  if (drift) out.push(drift);

  // override_rate_pct carries low_risk/high_risk bands — High/Critical
  // tiers are held to the tighter high_risk band (policy-schema.md §3.7).
  const overrideRates = dimension(kri, 'performance', 'override_rate_pct');
  if (typeof overrideRates === 'object' && overrideRates !== null) {
    const riskKey = tier === 'High' || tier === 'Critical' ? 'high_risk' : 'low_risk';
    const line = bandLine(
      `Human override rate (HITL, ${riskKey.replace('_', ' ')} band)`,
      (overrideRates as Record<string, unknown>)[riskKey],
      '%',
    );
    if (line) out.push(line);
  }

  const pii = bandLine('PII incident count', dimension(kri, 'data_privacy', 'pii_incident_count'), '');
  if (pii) out.push(pii);

  const staleness = bandLine(
    'Model version staleness',
    dimension(kri, 'technology', 'model_version_staleness_days'),
    ' days',
  );
  if (staleness) out.push(staleness);

  const bias = bandLine('Bias disparity', dimension(kri, 'conduct', 'bias_disparity_pct'), '%');
  if (bias) out.push(bias);

  const vendorShare = bandLine(
    'Single-vendor concentration',
    dimension(kri, 'third_party_concentration', 'single_vendor_share_pct'),
    '%',
  );
  if (vendorShare) out.push(vendorShare);

  // Graph pins — the concrete attributes this verdict evaluated, held
  // constant as part of the hypothesis.
  const zones = [...new Set(graph.processing_nodes.map((n) => n.data_zone))].sort();
  if (zones.length > 0) out.push(`Data zone pinned: ${zones.join(', ')}`);

  if (graph.processing_nodes.length > 0) {
    const maxAutonomy = Math.max(...graph.processing_nodes.map((n) => n.autonomy_level));
    out.push(`Max autonomy level: ≤ L${maxAutonomy} (as attested)`);
  }

  return out;
}
