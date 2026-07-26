import type { DataClass, DataFlowGraph, Envelope, EnvelopeDimensionFit, Exposure } from './types';

// PV-3. Rule 1 (cross-cutting.md §7): pure island — engine types and stdlib
// only. No I/O, no clock, no randomness.
//
// Inheritance is per-dimension and never all-or-nothing: a platform cleared
// for Internal data does not stop being cleared for its network zones just
// because a use case brought Client PII. Callers get one result per dimension
// and decide what that means; this module makes no policy judgement.

// Ordinal orders are declared HERE, explicitly, rather than derived from the
// order of the canonical vocabulary arrays. Those arrays are a value set, not
// a ranking — reordering one for readability would silently redefine every
// envelope ceiling. Severity ordering elsewhere in the engine learned the
// same lesson.
const DATA_CLASS_RANK: Record<DataClass, number> = {
  Public: 0,
  Internal: 1,
  Confidential: 2,
  'Client PII': 3,
  MNPI: 4,
};

const EXPOSURE_RANK: Record<Exposure, number> = {
  'internal-only': 0,
  'internal-shared': 1,
  'client-facing': 2,
  'market-facing': 3,
};

function maxBy<T>(values: T[], rank: Record<string, number>): T | undefined {
  if (values.length === 0) return undefined;
  return [...values].sort((a, b) => (rank[String(b)] ?? 0) - (rank[String(a)] ?? 0))[0];
}

// Returns one entry per dimension the envelope actually constrains. A
// dimension the envelope is silent about is not reported — silence is not a
// ceiling of zero, and reporting it as a pass would overstate what the
// approval covered.
export function fitsEnvelope(graph: DataFlowGraph, envelope: Envelope): EnvelopeDimensionFit[] {
  const out: EnvelopeDimensionFit[] = [];

  if (envelope.max_data_class !== undefined) {
    const worst = maxBy(graph.input_nodes.map((n) => n.data_class), DATA_CLASS_RANK);
    const ceiling = DATA_CLASS_RANK[envelope.max_data_class];
    // No input nodes means nothing to exceed the ceiling with.
    const actual = worst === undefined ? -1 : DATA_CLASS_RANK[worst];
    out.push({
      dimension: 'data_class',
      fits: actual <= ceiling,
      ceiling: envelope.max_data_class,
      ...(worst !== undefined ? { observed: worst } : {}),
    });
  }

  if (envelope.max_exposure !== undefined) {
    const worst = maxBy(graph.output_nodes.map((n) => n.exposure), EXPOSURE_RANK);
    const ceiling = EXPOSURE_RANK[envelope.max_exposure];
    const actual = worst === undefined ? -1 : EXPOSURE_RANK[worst];
    out.push({
      dimension: 'exposure',
      fits: actual <= ceiling,
      ceiling: envelope.max_exposure,
      ...(worst !== undefined ? { observed: worst } : {}),
    });
  }

  if (envelope.max_autonomy_level !== undefined) {
    const levels = graph.processing_nodes.map((n) => n.autonomy_level);
    const worst = levels.length > 0 ? Math.max(...levels) : -1;
    out.push({
      dimension: 'autonomy_level',
      fits: worst <= envelope.max_autonomy_level,
      ceiling: String(envelope.max_autonomy_level),
      ...(worst >= 0 ? { observed: String(worst) } : {}),
    });
  }

  // Set dimensions: the use case must be a SUBSET of what was approved.
  if (envelope.data_zones !== undefined) {
    const approved = new Set(envelope.data_zones);
    const used = [
      ...graph.input_nodes.map((n) => n.data_zone),
      ...graph.processing_nodes.map((n) => n.data_zone),
    ];
    const outside = [...new Set(used.filter((z) => !approved.has(z)))].sort();
    out.push({
      dimension: 'data_zones',
      fits: outside.length === 0,
      ceiling: [...envelope.data_zones].sort().join(', '),
      ...(outside.length > 0 ? { observed: outside.join(', ') } : {}),
    });
  }

  if (envelope.jurisdictions !== undefined) {
    const approved = new Set(envelope.jurisdictions);
    const outside = [...new Set(graph.jurisdictions.filter((j) => !approved.has(j)))].sort();
    out.push({
      dimension: 'jurisdictions',
      fits: outside.length === 0,
      ceiling: [...envelope.jurisdictions].sort().join(', '),
      ...(outside.length > 0 ? { observed: outside.join(', ') } : {}),
    });
  }

  return out;
}

// PV-3's coupled-cluster rule: if ANY dimension in a cluster is exceeded,
// every control in that cluster falls away — not merely the control tied to
// the exceeded dimension. The conservative reading, because a platform
// approval is granted as a package: partially exceeding its basis does not
// leave the remainder independently justified.
export function inheritableControls(
  satisfiesControls: string[],
  fits: EnvelopeDimensionFit[],
  coupledClusters: string[][] = [],
): string[] {
  const anyExceeded = fits.some((d) => !d.fits);
  if (anyExceeded && coupledClusters.length === 0) {
    // Without declared clusters the whole approval is treated as one cluster.
    // Inheriting a subset would require knowing which control depends on
    // which dimension, which the registry does not state.
    return [];
  }

  if (!anyExceeded) return [...satisfiesControls].sort();

  // Code review 001, I-2: a control named in NO cluster is an implicit
  // singleton cluster and falls away too. Without this, declaring one cluster
  // was strictly more permissive than declaring none — which inverted the
  // conservative reading stated above.
  const survivors = new Set<string>();
  for (const cluster of coupledClusters) {
    const clusterExceeded = fits.some((d) => !d.fits && cluster.includes(d.dimension));
    if (!clusterExceeded) for (const c of cluster) survivors.add(c);
  }
  return [...satisfiesControls].filter((c) => survivors.has(c)).sort();
}
