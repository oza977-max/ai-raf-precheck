import type { DataZone } from './types';

// R16-F §5 (DR7-06, design-review-007.html). src/engine/plain-intake.ts used
// to import `findQuestion`/`makeAssumption` and the `QuestionId`/
// `PlainAnswers` types straight from src/components/plain-copy.ts — the
// engine reaching into the UI layer, which specs/cross-cutting.md §7
// forbids ("Never: engine → ui") and CLAUDE.md's `src/engine/*` pure-island
// rule restates. This file holds exactly the ids and keys the mapping
// needs — no words. `plain-copy.ts` (the component layer, which owns every
// question/option/assumption WORD) imports these back and re-exports them,
// so every existing component import of `QuestionId`/`PlainAnswers` from
// `./plain-copy` keeps working unchanged.

export type QuestionId =
  | '1' | '2' | '3' | '3supplier' | '3supplierName' | '3model' | '3a' | '3aWhich' | '3platformZone'
  | '4' | '4a' | '5' | '6' | '6a' | '6b' | '7' | '8' | '8other' | '9' | '10'
  | '11' | '12' | '13' | '14';

export type PlainAnswers = Partial<Record<QuestionId, string | string[]>>;

// A REFERENCE to which question/option drove an assumption — never the
// worded sentence, which is screen vocabulary (plain-copy.ts's
// `ASSUMPTION_TEXT`/`makeAssumption`). plain-intake.ts's `plainAnswersToFormValues`
// returns these; the component layer's `describeAssumptions()`
// (plain-copy.ts) is the one place a reference becomes the existing
// `Assumption { questionId, question, assumption }` shape.
//
// The `3platformZone` "Not sure" case cannot be resolved by a static
// questionId:optionKey -> text lookup alone: WHICH of two sentences applies
// depends on a per-platform computed zone (the earliest zone the chosen
// platform allows), decided at the call site in plain-intake.ts. It carries
// that computed zone alongside the same questionId/optionKey shape so
// `describeAssumptions()` can still pick the right wording without the
// engine ever holding the wording itself.
//
// R16-D2 §1 (D-95). Both variants carry `fields`: the GRAPH field names
// (`data_zone`, `vendor`, `model_type`, … — the names condition.ts's
// `collectFieldValues` reads, never a StructuredFormValues name) that THIS
// "Not sure" branch sets. Computed once, at the call site that already
// knows which fields a branch touches (plain-intake.ts), rather than kept
// in a hand-maintained table beside the mapping that a later edit could
// silently leave stale — the guard test in plain-intake.test.ts proves the
// two can never drift by re-deriving the same set from the graph itself.
export type AssumptionRef =
  | { questionId: QuestionId; optionKey: string; fields: string[] }
  | { questionId: '3platformZone'; optionKey: 'not-sure'; earliestZone: DataZone; fields: string[] };
