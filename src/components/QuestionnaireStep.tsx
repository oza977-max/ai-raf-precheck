import { useState } from 'react';
import type { IntakeQuestion } from '../engine/types';

// UC-4 (intake-flow.md §6). Rule 4 (cross-cutting.md §7): presentation-only.
interface QuestionnaireStepProps {
  questions: IntakeQuestion[];
  answeredCount: number;
  // V1.2-B (design-gap C2): budget indicator — optional, rendered when
  // the caller can compute it from the loaded policy.
  budget?: number;
  provisionalTier?: string;
  // R6-CX-1: context travels with the answer. Optional second argument so
  // pre-R6 callers/tests remain valid.
  onAnswer: (questionId: string, value: unknown, context?: string) => void;
}

export default function QuestionnaireStep({ questions, answeredCount, budget, provisionalTier, onAnswer }: QuestionnaireStepProps) {
  const [textValue, setTextValue] = useState('');
  // R6-CX-1: optional, human-read only. Cleared per question.
  const [context, setContext] = useState('');
  const current = questions[answeredCount];

  if (!current) {
    return <p>All questions answered.</p>;
  }

  // Empty context is passed as undefined, never an empty string — the
  // attestation's spread-if-present idiom depends on it (same rule as the
  // reviewer note, ConfirmationStep.tsx).
  const answer = (value: unknown) => {
    onAnswer(current.id, value, context.trim() || undefined);
    setTextValue('');
    setContext('');
  };

  return (
    <section aria-label="Targeted questions" className="questionnaire">
      <div className="questionnaire__tag">UC-4 · TARGETED QUESTIONS</div>
      <p className="questionnaire__progress">
        {answeredCount} / {questions.length}
        {budget !== undefined && ` · budget ≤${budget}`}
        {provisionalTier && ` (provisional ${provisionalTier})`}
      </p>
      <p className="questionnaire__text">{current.text}</p>
      {current.triggered_by.length > 0 && (
        <p className="questionnaire__triggered-by">
          {/* R6: a guessed-field question says WHY it exists in words, not a
              rule id — the trigger is the model's missing basis, and the
              submitter deserves to know that. */}
          {current.triggered_by.includes('R6-PV-2:guessed')
            ? 'asked because your description does not state this, and the model would otherwise be guessing'
            : `triggered by ${current.triggered_by.join(', ')}`}
        </p>
      )}

      {/* R6-CX-1: before the answer controls, so it is filled (if at all)
          before a one-click answer submits. */}
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
          <button type="button" onClick={() => answer(true)}>
            Yes
          </button>
          <button type="button" onClick={() => answer(false)}>
            No
          </button>
        </div>
      )}

      {current.answer_type === 'select' && (
        <div className="questionnaire__options">
          {(current.options ?? []).map((option) => (
            <button key={option} type="button" onClick={() => answer(option)}>
              {option}
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
            disabled={!textValue.trim()}
          >
            Submit answer
          </button>
        </div>
      )}
    </section>
  );
}
