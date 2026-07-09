import { useState } from 'react';
import type { IntakeQuestion } from '../engine/types';

// UC-4 (intake-flow.md §6). Rule 4 (cross-cutting.md §7): presentation-only.
interface QuestionnaireStepProps {
  questions: IntakeQuestion[];
  answeredCount: number;
  onAnswer: (questionId: string, value: unknown) => void;
}

export default function QuestionnaireStep({ questions, answeredCount, onAnswer }: QuestionnaireStepProps) {
  const [textValue, setTextValue] = useState('');
  const current = questions[answeredCount];

  if (!current) {
    return <p>All questions answered.</p>;
  }

  return (
    <section aria-label="Targeted questions">
      <p className="questionnaire__progress">
        Question {answeredCount + 1} of {questions.length}
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
