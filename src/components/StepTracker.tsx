import type { IntakeState } from './intake-state';

// Visual step tracker (Claude Design export "AIGate Demo.dc.html").
// Maps our real states onto the design's step labels. All 6 steps are now
// real content as of P4-C04 — Describe, Duplicates, Graph, Questions,
// Resolve (contradiction_review — only shown when active, not a normal
// step in the happy path), Confirm, Verdict.
const STEPS: Array<{ key: string; label: string; matches: (s: IntakeState['step']) => boolean }> = [
  { key: 'describe', label: 'Describe', matches: (s) => s === 'description_entry' },
  { key: 'duplicates', label: 'Duplicates', matches: (s) => s === 'duplicate_check' },
  { key: 'graph', label: 'Graph', matches: (s) => s === 'graph_extraction' || s === 'graph_review' },
  {
    key: 'questions',
    label: 'Questions',
    matches: (s) => s === 'questionnaire' || s === 'contradiction_review',
  },
  { key: 'confirm', label: 'Confirm', matches: (s) => s === 'confirmation' },
  { key: 'verdict', label: 'Verdict', matches: (s) => s === 'evaluation_pending' || s === 'verdict' },
];

const ORDER = [
  'description_entry',
  'duplicate_check',
  'graph_extraction',
  'graph_review',
  'questionnaire',
  'contradiction_review',
  'confirmation',
  'evaluation_pending',
  'verdict',
];

export default function StepTracker({ current }: { current: IntakeState['step'] }) {
  const currentIndex = ORDER.indexOf(current);

  return (
    <ol className="step-tracker">
      {STEPS.map((step, i) => {
        const stepMaxIndex = Math.max(...ORDER.map((s, idx) => (step.matches(s as IntakeState['step']) ? idx : -1)));
        const isDone = currentIndex > stepMaxIndex;
        const isActive = step.matches(current);
        return (
          <li
            key={step.key}
            className={`step-tracker__step${isDone ? ' step-tracker__step--done' : ''}${isActive ? ' step-tracker__step--active' : ''}`}
          >
            <span className="step-tracker__marker">{isDone ? '✓' : i + 1}</span>
            <span>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
