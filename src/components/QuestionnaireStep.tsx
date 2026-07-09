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
  onAnswer: (questionId: string, value: unknown) => void;
}

export default function QuestionnaireStep({ questions, answeredCount, budget, provisionalTier, onAnswer }: QuestionnaireStepProps) {
  const [textValue, setTextValue] = useState('');
  const current = questions[answeredCount];

  if (!current) {
    return <p>All questions answered.</p>;
  }

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
        <p className="questionnaire__triggered-by">triggered by {current.triggered_by.join(', ')}</p>
      )}

      {current.answer_type === 'boolean' && (
        <div className="questionnaire__options">
          <button type="button" onClick={() => onAnswer(current.id, true)}>
            Yes
          </button>
          <button type="button" onClick={() => onAnswer(current.id, false)}>
            No
          </button>
        </div>
      )}

      {current.answer_type === 'select' && (
        <div className="questionnaire__options">
          {(current.options ?? []).map((option) => (
            <button key={option} type="button" onClick={() => onAnswer(current.id, option)}>
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
            onClick={() => {
              onAnswer(current.id, textValue);
              setTextValue('');
            }}
            disabled={!textValue.trim()}
          >
            Submit answer
          </button>
        </div>
      )}
    </section>
  );
}
