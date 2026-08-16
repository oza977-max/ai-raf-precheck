import { useState } from 'react';
import type { IntakeQuestion, QuestionAnswer } from '../engine/types';
import {
  ACTION_TYPE_LABELS,
  AUTONOMY_LABELS,
  BINDINGNESS_LABELS,
  DATA_CLASS_LABELS,
  DATA_ZONE_LABELS,
  DECISION_TYPE_LABELS,
  EXPOSURE_LABELS,
  MODEL_TYPE_LABELS,
  REVERSIBILITY_LABELS,
  SCALE_LABELS,
} from './field-copy';

// UC-4 (intake-flow.md §6). Rule 4 (cross-cutting.md §7): presentation-only.
//
// v0.7.1 (user bug report, live-reproduced): this screen was the last one
// still speaking raw enums — bare "Zone A" / "traditional-ml" buttons, an
// instant question-swap with no acknowledgment, and a progress line whose
// "budget ≤5" contradicted a 10-question queue. Same fix as everywhere
// else: the shared plain-English copy, one source (field-copy.ts).

const OPTION_LABELS: Record<string, Record<string, string>> = {
  data_class: DATA_CLASS_LABELS,
  data_zone: DATA_ZONE_LABELS,
  model_type: MODEL_TYPE_LABELS,
  exposure: EXPOSURE_LABELS,
  decision_bindingness: BINDINGNESS_LABELS,
  action_type: ACTION_TYPE_LABELS,
  decision_type: DECISION_TYPE_LABELS,
  output_reversibility: REVERSIBILITY_LABELS,
  scale: SCALE_LABELS,
  autonomy_level: Object.fromEntries(Object.entries(AUTONOMY_LABELS).map(([k, v]) => [k, v])),
};

export function optionLabel(field: string, option: string): string {
  return OPTION_LABELS[field]?.[option] ?? option;
}

interface QuestionnaireStepProps {
  questions: IntakeQuestion[];
  answeredCount: number;
  budget?: number;
  provisionalTier?: string;
  // R6-CX-1: context travels with the answer.
  onAnswer: (questionId: string, value: unknown, context?: string) => void;
  // v0.7.1: the most recent recorded answer, for the confirmation line.
  lastAnswer?: QuestionAnswer;
  onUndo?: () => void;
}

export default function QuestionnaireStep({
  questions,
  answeredCount,
  budget,
  provisionalTier,
  onAnswer,
  lastAnswer,
  onUndo,
}: QuestionnaireStepProps) {
  const [textValue, setTextValue] = useState('');
  const [context, setContext] = useState('');
  // v0.7.1 double-click guard, UI layer: the reducer refuses a duplicate
  // questionId too, but the button should stop offering itself the moment
  // it is used (same two-layer posture as the sign-off actions).
  const [answeredId, setAnsweredId] = useState<string | null>(null);
  const current = questions[answeredCount];

  const guessedCount = questions.filter((q) => q.triggered_by.includes('R6-PV-2:guessed')).length;
  const riskCount = questions.length - guessedCount;

  const lastQuestion = lastAnswer ? questions.find((q) => q.id === lastAnswer.questionId) : undefined;

  if (!current) {
    return <p>All questions answered.</p>;
  }

  const locked = answeredId === current.id;

  const answer = (value: unknown) => {
    if (locked) return;
    setAnsweredId(current.id);
    onAnswer(current.id, value, context.trim() || undefined);
    setTextValue('');
    setContext('');
  };

  return (
    <section aria-label="Targeted questions" className="questionnaire">
      <div className="questionnaire__tag">UC-4 · TARGETED QUESTIONS</div>
      {/* v0.7.1: the count explains itself. The old line rendered
          "0 / 10 · budget ≤5" — a promise of five next to a queue of ten,
          because guessed-field questions are mandatory and outside the risk
          budget. Say that, instead of contradicting ourselves. */}
      <p className="questionnaire__progress">
        Question {answeredCount + 1} of {questions.length}
        {provisionalTier && ` · provisional tier ${provisionalTier}`}
      </p>
      {guessedCount > 0 && (
        <p className="questionnaire__count-note">
          {riskCount > 0
            ? `${riskCount} about risk signals${budget !== undefined ? ` (budget ≤${budget})` : ''}, ${guessedCount} because your description did not state them.`
            : `All ${guessedCount} are asked because your description did not state them — the model would otherwise be guessing.`}
        </p>
      )}

      {/* v0.7.1: acknowledge the previous answer instead of silently
          swapping questions — with one step of undo. */}
      {lastAnswer && lastQuestion && (
        <p className="questionnaire__recorded" role="status">
          Recorded: {lastQuestion.text}{' '}
          <strong>{optionLabel(lastQuestion.field, String(lastAnswer.value))}</strong>
          {onUndo && (
            <>
              {' '}
              <button type="button" className="questionnaire__undo" onClick={() => { setAnsweredId(null); onUndo(); }}>
                Undo
              </button>
            </>
          )}
        </p>
      )}

      <p className="questionnaire__text">{current.text}</p>
      {current.triggered_by.length > 0 && (
        <p className="questionnaire__triggered-by">
          {current.triggered_by.includes('R6-PV-2:guessed')
            ? 'asked because your description does not state this, and the model would otherwise be guessing'
            : `triggered by ${current.triggered_by.join(', ')}`}
        </p>
      )}

      <label htmlFor={`context-${current.id}`} className="questionnaire__context-label">
        Anything the reviewer should know about this answer? (optional)
      </label>
      <input
        id={`context-${current.id}`}
        type="text"
        className="questionnaire__context"
        value={context}
        onChange={(e) => setContext(e.target.value)}
      />
      <p className="field-help">
        Read by the person who signs off — the rules never read it.
      </p>

      {current.answer_type === 'boolean' && (
        <div className="questionnaire__options">
          <button type="button" disabled={locked} onClick={() => answer(true)}>
            Yes
          </button>
          <button type="button" disabled={locked} onClick={() => answer(false)}>
            No
          </button>
        </div>
      )}

      {current.answer_type === 'select' && (
        <div className="questionnaire__options questionnaire__options--labelled">
          {(current.options ?? []).map((option) => (
            <button key={option} type="button" disabled={locked} onClick={() => answer(option)}>
              {optionLabel(current.field, option)}
            </button>
          ))}
        </div>
      )}

      {current.answer_type === 'text' && (
        <div>
          <label htmlFor={`answer-${current.id}`}>Your answer</label>
          <textarea
            id={`answer-${current.id}`}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
          />
          <button
            type="button"
            onClick={() => answer(textValue)}
            disabled={locked || !textValue.trim()}
          >
            Submit answer
          </button>
        </div>
      )}
    </section>
  );
}
