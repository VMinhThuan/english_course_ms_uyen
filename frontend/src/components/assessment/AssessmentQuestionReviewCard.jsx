import { formatAssessmentAnswer, hasAssessmentAnswer } from '../../utils/assessmentAnswerLabel.js';

export default function AssessmentQuestionReviewCard({ question, questionNumber, showCorrectAnswer = true, variant = 'summary' }) {
  const isCorrect = question.isCorrect === true;
  const hasAnswer = hasAssessmentAnswer(question.studentAnswer);
  const status = isCorrect ? 'correct' : hasAnswer ? 'incorrect' : 'unanswered';
  const correctAnswers = question.correctAnswers ?? question.correctAnswer;
  const hasCorrectAnswer = showCorrectAnswer && hasAssessmentAnswer(correctAnswers);
  const hasScore = question.score !== undefined && question.score !== null && question.score !== '';
  const questionText = question.questionText || question.prompt || question.text || 'Nội dung câu hỏi không khả dụng.';

  if (variant === 'options') {
    const selectedAnswers = (Array.isArray(question.studentAnswer) ? question.studentAnswer : [question.studentAnswer])
      .filter((answer) => answer !== undefined && answer !== null && answer !== '')
      .map(String);
    const correctValues = (Array.isArray(correctAnswers) ? correctAnswers : [correctAnswers])
      .filter((answer) => answer !== undefined && answer !== null && answer !== '')
      .map(String);
    const options = Array.isArray(question.options) ? question.options : [];
    const getOptionId = (option) => (option && typeof option === 'object'
      ? option.id ?? option._id ?? option.value ?? option.key
      : option);
    const getOptionText = (option) => (option && typeof option === 'object'
      ? option.text ?? option.label ?? option.value ?? option.name ?? ''
      : option);

    return (
      <article className={`assessment-review-card assessment-review-card--options assessment-review-card--${status}`}>
        <div className="assessment-review-card__header">
          <div className="assessment-review-card__heading">
            <span className="assessment-review-card__number">Câu {questionNumber}</span>
            <span className="assessment-review-card__question">{questionText}</span>
          </div>
          <span className="assessment-review-card__status">
            {isCorrect ? '✓ Đúng' : '✕ Sai'}
          </span>
        </div>

        {options.length > 0 ? (
          <div className="assessment-review-card__options-list">
            {options.map((option, index) => {
              const optionId = getOptionId(option);
              const optionText = getOptionText(option);
              const comparableValues = [optionId, optionText].filter((value) => value !== undefined && value !== null).map(String);
              const isSelected = comparableValues.some((value) => selectedAnswers.includes(value));
              const isRight = showCorrectAnswer && comparableValues.some((value) => correctValues.includes(value));
              const optionStatus = isRight ? 'correct' : isSelected ? 'selected' : 'neutral';
              const optionLabel = optionText || `Lựa chọn ${String.fromCharCode(65 + index)}`;

              return (
                <div
                  key={optionId ?? index}
                  className={`assessment-review-card__option assessment-review-card__option--${optionStatus}`}
                >
                  <span className="assessment-review-card__option-marker" aria-hidden="true">
                    {isSelected ? (isRight ? '✓' : '✕') : isRight ? '★' : '○'}
                  </span>
                  <span className="assessment-review-card__option-text">{optionLabel}</span>
                  {isSelected && isRight && <span className="assessment-review-card__option-note">Đã chọn · Đáp án đúng</span>}
                  {isSelected && !isRight && <span className="assessment-review-card__option-note">Đã chọn</span>}
                  {!isSelected && isRight && <span className="assessment-review-card__option-note">Đáp án đúng</span>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="assessment-review-card__details">
            <p className="assessment-review-card__student-answer">
              <strong>Câu trả lời của bạn:</strong> {formatAssessmentAnswer(question, question.studentAnswer)}
            </p>
            {hasCorrectAnswer && (
              <p className="assessment-review-card__correct-answer">
                <strong>Đáp án đúng:</strong> {formatAssessmentAnswer(question, correctAnswers)}
              </p>
            )}
          </div>
        )}

        {showCorrectAnswer && question.explanation && (
          <div className="assessment-review-card__explanation">
            <strong>💡 Giải thích:</strong> {question.explanation}
          </div>
        )}
      </article>
    );
  }

  return (
    <article className={`assessment-review-card assessment-review-card--${status}`}>
      <div className="assessment-review-card__header">
        <div className="assessment-review-card__heading">
          <span className="assessment-review-card__number">Câu {questionNumber}:</span>
          <span className="assessment-review-card__question">{questionText}</span>
        </div>
        <div className="assessment-review-card__meta">
          <span className="assessment-review-card__status">
            {isCorrect ? '✓ Đúng' : hasAnswer ? '✕ Sai' : 'Bỏ trống'}
          </span>
          {hasScore && (
            <span className="assessment-review-card__score">
              {isCorrect ? `+${Number(question.score) || 0} điểm` : '+0 điểm'}
            </span>
          )}
        </div>
      </div>

      <div className="assessment-review-card__details">
        <p className="assessment-review-card__student-answer">
          <strong>Câu trả lời của bạn:</strong> {formatAssessmentAnswer(question, question.studentAnswer)}
        </p>
        {hasCorrectAnswer && (
          <p className="assessment-review-card__correct-answer">
            <strong>Đáp án đúng:</strong> {formatAssessmentAnswer(question, correctAnswers)}
          </p>
        )}
      </div>

      {question.explanation && (
        <div className="assessment-review-card__explanation">
          <strong>Giải thích:</strong> {question.explanation}
        </div>
      )}
    </article>
  );
}
