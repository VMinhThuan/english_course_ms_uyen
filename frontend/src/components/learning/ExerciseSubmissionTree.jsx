import './ExerciseSubmissionTree.css';

const exerciseTypes = [
  { id: 'part1-dictation', label: 'Chép chính tả Part 1' },
  { id: 'vocabulary-dictation', label: 'Chép chính tả từ vựng' },
  { id: 'hard-words-dictation', label: 'Hard Words Dictation' },
  { id: 'part2-challenge', label: 'Part 2 Challenge' },
  { id: 'grammar-tense-classification', label: 'Phân loại thì và dạng câu' },
  { id: 'grammar-active-to-passive', label: 'Chuyển câu chủ động thành bị động' },
];

const statusLabels = {
  correct: 'Đúng',
  incorrect: 'Sai',
  partial: 'Đúng một phần',
  unanswered: 'Bỏ trống',
};

const answerLabels = {
  tense: 'Thì',
  sentenceForm: 'Dạng câu',
  answer: 'Câu trả lời',
};

const getDateKey = (value) => {
  if (!value) return 'unknown';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
};

const formatDateKey = (key) => {
  if (key === 'unknown') return 'Không rõ ngày';
  const [year, month, day] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('vi-VN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
};

const formatTime = (value) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
};

const formatAnswer = (value) => {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(formatAnswer).join(', ');
  return Object.entries(value)
    .filter(([, answer]) => answer !== undefined && answer !== null && answer !== '')
    .map(([key, answer]) => `${answerLabels[key] || key}: ${formatAnswer(answer)}`)
    .join(' · ') || '—';
};

const getSubmittedAnswer = (question) => (
  question.submittedAnswer
  ?? question.selectedAnswer
  ?? question.userAnswer
  ?? (question.submittedTense !== undefined || question.submittedSentenceForm !== undefined
    ? { tense: question.submittedTense, sentenceForm: question.submittedSentenceForm }
    : undefined)
);

const getCorrectAnswer = (question) => (
  question.correctAnswer
  ?? question.answer
  ?? (question.correctTense !== undefined || question.correctSentenceForm !== undefined
    ? { tense: question.correctTense, sentenceForm: question.correctSentenceForm }
    : undefined)
);

const getStatus = (question) => (
  question.status || (question.isCorrect === true ? 'correct' : question.isCorrect === false ? 'incorrect' : '')
);

const formatDateTime = (value) => (
  value ? new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value)) : '—'
);

const groupByDay = (submissions) => {
  const days = new Map();
  submissions.forEach((submission) => {
    const key = getDateKey(submission.submittedAt);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(submission);
  });

  return [...days.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([dateKey, items]) => ({
      dateKey,
      items: items.sort((left, right) => new Date(left.submittedAt || 0) - new Date(right.submittedAt || 0)),
    }));
};

const ExerciseAttempt = ({ submission, number }) => {
  const questions = submission.questions || [];
  const total = submission.total || questions.length;

  return (
    <details className="exercise-tree__attempt">
      <summary className="exercise-tree__attempt-summary">
        <span className="exercise-tree__attempt-number">Lần {number}</span>
        <time>{formatTime(submission.submittedAt)}</time>
        <span className="exercise-tree__attempt-score">{submission.correctCount || 0}/{total} câu đúng</span>
      </summary>
      <div className="exercise-tree__attempt-content">
        {submission.sourceTitle && <h4>{submission.sourceTitle}</h4>}
        <div className="exercise-tree__stats">
          <span>{submission.correctCount || 0} đúng</span>
          <span>{submission.incorrectCount || 0} sai</span>
          {(submission.partialCount || 0) > 0 && <span>{submission.partialCount} một phần</span>}
          {(submission.unansweredCount || 0) > 0 && <span>{submission.unansweredCount} bỏ trống</span>}
          <span>{total} câu</span>
          {submission.correctFieldCount !== null && submission.correctFieldCount !== undefined && (
            <span>{submission.correctFieldCount}/{submission.totalFieldCount} trường đúng</span>
          )}
          {submission.metadata?.mode && <span>{submission.metadata.mode === 'exam' ? 'Thi thử' : 'Luyện tập'}</span>}
        </div>

        {questions.length > 0 ? (
          <ol className="exercise-tree__questions">
            {questions.map((question, index) => {
              const status = getStatus(question);
              return (
                <li key={`${question.number ?? index}-${index}`}>
                  <div className="exercise-tree__question-heading">
                    <strong>{question.prompt || question.questionText || `Câu ${question.number ?? index + 1}`}</strong>
                    <span className={`exercise-tree__status is-${status || 'unknown'}`}>
                      {statusLabels[status] || (status ? status : 'Đã nộp')}
                    </span>
                  </div>
                  <p><b>Bạn trả lời:</b> {formatAnswer(getSubmittedAnswer(question))}</p>
                  <p><b>Đáp án:</b> {formatAnswer(getCorrectAnswer(question))}</p>
                  {question.choices?.length > 0 && (
                    <p><b>Lựa chọn:</b> {question.choices.map((choice) => `${choice.letter}. ${choice.text}`).join(' · ')}</p>
                  )}
                  {question.script && <p><b>Script:</b> {question.script}</p>}
                  {(question.correctTranslation || question.translation) && (
                    <p><b>Dịch nghĩa:</b> {question.correctTranslation || question.translation}</p>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="exercise-tree__no-questions">Lượt này chưa có chi tiết câu trả lời.</p>
        )}
      </div>
    </details>
  );
};

export default function ExerciseSubmissionTree({ submissions = [], loading = false, error = '' }) {
  if (loading) return <div className="ds-loading-state">Đang tải lịch sử bài tập...</div>;
  if (error) return <div className="ds-error-state">{error}</div>;

  return (
    <div className="exercise-tree" aria-label="Lịch sử nộp bài tập theo dạng bài và ngày">
      {exerciseTypes.map((type) => {
        const typeSubmissions = submissions.filter((submission) => submission.exerciseType === type.id);
        const days = groupByDay(typeSubmissions);

        return (
          <details className="exercise-tree__type" key={type.id} open={typeSubmissions.length === 0}>
            <summary className="exercise-tree__type-summary">
              <span>{type.label}</span>
              <span className="exercise-tree__type-count">
                {typeSubmissions.length > 0 ? `${typeSubmissions.length} lượt` : 'Chưa có lượt'}
              </span>
            </summary>
            <div className="exercise-tree__type-content">
              {typeSubmissions.length === 0 ? (
                <p className="exercise-tree__empty">Chưa có lần làm bài nào được ghi nhận</p>
              ) : days.map(({ dateKey, items }) => (
                <details className="exercise-tree__day" key={dateKey}>
                  <summary className="exercise-tree__day-summary">
                    <span>{formatDateKey(dateKey)}</span>
                    <span>{items.length} lượt làm</span>
                  </summary>
                  <div className="exercise-tree__attempts">
                    {items.map((submission, index) => (
                      <ExerciseAttempt key={submission._id} submission={submission} number={index + 1} />
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
