import {
  ACTION_TYPE_LABELS,
  BINDINGNESS_LABELS,
  DATA_CLASS_LABELS,
  DECISION_TYPE_LABELS,
  EXPOSURE_LABELS,
  MULTI_INSTANCE_LABELS,
  SCALE_LABELS,
  SYSTEM_ACCESS_LABELS,
} from './field-copy';
import { graphSummaryRows, destinationDescription, dataClassesBySeverity } from './graph-summary';
import { SUMMARY_LABELS } from './plain-copy';
import type { Assumption } from './plain-copy';
import { Fold } from './Fold';
import type { DataFlowGraph, PolicyFile, SystemAccessScope } from '../engine/types';

// R16-C (UC-9, UC-12; build/prompts/R16.md v2.1 §3). Rule 4
// (cross-cutting.md §7): presentation-only — every value is read off the
// graph via graph-summary.ts's pure helpers or passed in as a prop; nothing
// here decides a verdict or writes anything.
//
// Principle 1 (§0) applies here exactly as it does to the questions: no
// data class, zone letter, model-type name, autonomy level or bindingness
// code reaches this screen. Each *_LABELS map imported above carries its
// plain phrase before the parenthesised code (e.g. "Writes a first draft
// for a person to check and edit (draft)"); `plainPhrase()` below strips
// the code, the same extraction field-copy.ts's own (private) shortPhrase()
// does for plainWithCode() — kept local rather than exported from
// field-copy.ts so this chunk's screen never depends on a change to a
// different chunk's file.
function plainPhrase(fullLabel: string | undefined): string {
  // Defensive only: every *_LABELS map used below is declared with the
  // exact type union the graph field itself carries, so this is never
  // actually undefined at runtime — just how TS's noUncheckedIndexedAccess
  // sees a Record<SomeUnion, string> lookup.
  if (!fullLabel) return '';
  const withoutCode = fullLabel.replace(/\s*\([^()]*\)\s*$/, '');
  const dashIndex = withoutCode.indexOf('—');
  return (dashIndex === -1 ? withoutCode : withoutCode.slice(0, dashIndex)).trim();
}

function supplierDisplayName(vendor: string | undefined, policy?: PolicyFile): string | undefined {
  if (!vendor || vendor === 'internal') return undefined;
  const registry = [...(policy?.platforms ?? []), ...(policy?.vendors ?? [])];
  const match = registry.find((r) => r.id === vendor);
  // A registry match uses its plain_name (never the raw `name`, which may
  // carry the bare [FIRM] placeholder). An unmatched vendor string is
  // already the plain, human-written text plain-intake.ts constructed for
  // every unregistered case (e.g. "An unlisted supplier (not on your
  // firm's list)") — safe to show as-is.
  return match ? (match.plain_name ?? vendor) : vendor;
}

interface UnderstoodSummaryProps {
  graph: DataFlowGraph;
  policy?: PolicyFile;
  /** Form path (UC-9): every "Not sure" answer, listed back. */
  assumptions?: Assumption[];
  /** Description path (UC-12): node ids the extractor could not verify. */
  uncertainNodeIds?: string[];
  /** Navigates only — back to the question (form path) or into the
   *  existing correction flow (description path, UC-7). No write of its
   *  own; the one write stays the Confirm button and its in-flight guard. */
  onChangeAnswer: () => void;
}

export default function UnderstoodSummary({
  graph,
  policy,
  assumptions = [],
  uncertainNodeIds = [],
  onChangeAnswer,
}: UnderstoodSummaryProps) {
  const processing = graph.processing_nodes[0];
  const output = graph.output_nodes[0];
  const dataClasses = dataClassesBySeverity(graph);
  const supplierName = supplierDisplayName(processing?.vendor, policy);
  const countryNames = graph.jurisdictions.map(
    (code) => policy?.jurisdictions.find((j) => j.code === code)?.name ?? code,
  );

  const uncertainLabels = uncertainNodeIds
    .map(
      (id) =>
        [...graph.input_nodes, ...graph.processing_nodes, ...graph.output_nodes].find((n) => n.id === id)?.label,
    )
    .filter((label): label is string => Boolean(label));

  return (
    <section aria-label="Here's what we understood" className="understood-summary">
      <h2>Here&rsquo;s what we understood</h2>

      {processing && (
        <section className="understood-summary__section">
          <h3>{SUMMARY_LABELS.destination}</h3>
          <p>
            {destinationDescription(processing.data_zone)}
            {supplierName ? ` — via ${supplierName}` : ''}
          </p>
        </section>
      )}

      {dataClasses.length > 0 && (
        <section className="understood-summary__section">
          <h3>{SUMMARY_LABELS.dataClasses}</h3>
          <ul>
            {dataClasses.map((c) => (
              <li key={c}>{plainPhrase(DATA_CLASS_LABELS[c])}</li>
            ))}
          </ul>
        </section>
      )}

      {output && (
        <section className="understood-summary__section">
          <h3>{SUMMARY_LABELS.behaviour}</h3>
          <ul>
            <li>{plainPhrase(ACTION_TYPE_LABELS[output.action_type])}</li>
            <li>{plainPhrase(BINDINGNESS_LABELS[output.decision_bindingness])}</li>
            <li>{plainPhrase(EXPOSURE_LABELS[output.exposure])}</li>
          </ul>
        </section>
      )}

      {output && (
        <section className="understood-summary__section">
          <h3>{SUMMARY_LABELS.decisions}</h3>
          <p>
            {output.decision_type
              ? plainPhrase(DECISION_TYPE_LABELS[output.decision_type])
              : output.decision_type_other
                ? output.decision_type_other
                : 'Nothing in particular'}
          </p>
        </section>
      )}

      {output && processing && (
        <section className="understood-summary__section">
          <h3>{SUMMARY_LABELS.scaleAndCountries}</h3>
          <ul>
            <li>{plainPhrase(SCALE_LABELS[output.scale])}</li>
            <li>{countryNames.length > 0 ? countryNames.join(', ') : 'No countries specified'}</li>
            <li>
              {processing.replaces_prior_model
                ? 'It replaces something you already use.'
                : 'It doesn’t replace anything you already use.'}
            </li>
          </ul>
        </section>
      )}

      {processing?.system_access_scope !== undefined && (
        <section className="understood-summary__section">
          <h3>{SUMMARY_LABELS.agentReach}</h3>
          <ul>
            {(Array.isArray(processing.system_access_scope)
              ? processing.system_access_scope
              : [processing.system_access_scope]
            ).map((v: SystemAccessScope) => (
              <li key={v}>{plainPhrase(SYSTEM_ACCESS_LABELS[v])}</li>
            ))}
          </ul>
        </section>
      )}

      {processing?.multi_instance_coordination !== undefined && (
        <section className="understood-summary__section">
          <h3>{SUMMARY_LABELS.agentCoordination}</h3>
          <p>{plainPhrase(MULTI_INSTANCE_LABELS[processing.multi_instance_coordination])}</p>
        </section>
      )}

      {assumptions.length > 0 && (
        <section className="understood-summary__section understood-summary__assumptions">
          <h3>{SUMMARY_LABELS.assumptionsFormPath}</h3>
          <ul>
            {assumptions.map((a) => (
              <li key={a.questionId}>
                <strong>{a.question}</strong> &mdash; we assumed {a.assumption.replace(/\.+$/, '')}.
              </li>
            ))}
          </ul>
        </section>
      )}

      {assumptions.length === 0 && uncertainLabels.length > 0 && (
        <section className="understood-summary__section understood-summary__assumptions">
          <h3>{SUMMARY_LABELS.assumptionsDescriptionPath}</h3>
          <ul>
            {uncertainLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </section>
      )}

      <button type="button" className="understood-summary__change" onClick={onChangeAnswer}>
        {SUMMARY_LABELS.changeAnswer}
      </button>

      <Fold title={SUMMARY_LABELS.detailsDisclosure} summary="The field-by-field record the rules evaluate">
        <div className="confirmation__grid">
          {graphSummaryRows(graph).map((row, i) => (
            <div key={`${row.label}-${i}`} className="confirmation__grid-cell">
              <span className="confirmation__grid-label">{row.label}</span>
              <span className="confirmation__grid-value">{row.value}</span>
            </div>
          ))}
        </div>
      </Fold>
    </section>
  );
}
