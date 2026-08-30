import type React from 'react';

/** R14 (verdict recomposition, 2026-08-18 — the R9 idiom): analytical panels
 *  fold behind one click. The closed state carries a plain summary with the
 *  section's key number/state, so a scanner gets the gist without opening;
 *  the open state is the full panel, unchanged. Aggregation and priority,
 *  never deletion (ADR-IF-R9-1).
 *
 *  design-review round 4 (2026-08-31, Panels C+D — independently converged):
 *  this was a module-private function inside VerdictDisplay.tsx. Every other
 *  screen that needed the same "collapse by default, decision first"
 *  behavior reinvented it — a hand-rolled useState toggle in PolicyEditor, a
 *  bare native <details> in IntakeFlow, an ad hoc show-all toggle in
 *  RegisterView — each with different accessibility semantics. Extracted
 *  here so it's the one house convention, not a pattern rediscovered per
 *  screen. CSS classes renamed from verdict__fold* to ui__fold* (screen-
 *  agnostic); VerdictDisplay.tsx keeps its own child-content classes
 *  (verdict__chain, verdict__controlset, etc.) unaffected by the rename. */
export function Fold({
  title,
  summary,
  defaultOpen = false,
  when = true,
  headingInSummary = true,
  className = '',
  id,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  // When false the panel renders unfolded, exactly as before — used where
  // the honesty floor forbids folding (e.g. any control still UNVERIFIED).
  when?: boolean;
  // Some content keeps its own inner <h3> (tests and exports scope by it),
  // so its summary carries the title as a span instead.
  headingInSummary?: boolean;
  className?: string;
  // Jump targets (section-nav / checklist links) only set where a caller
  // actually points here.
  id?: string;
  children: React.ReactNode;
}) {
  if (!when) return <>{children}</>;
  return (
    <details id={id} className={`ui__fold ${className}`.trim()} open={defaultOpen || undefined}>
      <summary className="ui__fold-summary">
        {headingInSummary ? <h3>{title}</h3> : <span className="ui__fold-title">{title}</span>}
        <span className="ui__fold-gist">{summary}</span>
      </summary>
      <div className="ui__fold-body">{children}</div>
    </details>
  );
}
