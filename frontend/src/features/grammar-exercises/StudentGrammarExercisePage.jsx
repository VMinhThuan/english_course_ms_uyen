import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { grammarExerciseApi } from '../../api/grammarExerciseApi.js';
import { GRAMMAR_EXERCISES } from './grammarExerciseConfig.js';
import './grammarExercise.css';

const emptyAnswer = () => ({ tense: '', sentenceForm: '', answer: '' });

const hasAnswer = (exerciseType, answer = emptyAnswer()) => (
  exerciseType === 'tense-classification'
    ? Boolean(answer.tense || answer.sentenceForm)
    : Boolean(answer.answer.trim())
);

export default function StudentGrammarExercisePage({ exerciseType }) {
  const config = GRAMMAR_EXERCISES[exerciseType];
  const [exercise, setExercise] = useState(null);
  const [answers, setAnswers] = useState({});
  const [checkedResults, setCheckedResults] = useState({});
  const [revealedAnswers, setRevealedAnswers] = useState({});
  const [hiddenAnswers, setHiddenAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState('');
  const [submitMessage, setSubmitMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await grammarExerciseApi.getStudentExercise(exerciseType);
      setExercise(response.data);
      setAnswers({});
      setCheckedResults({});
      setRevealedAnswers({});
      setHiddenAnswers({});
      setCurrentIndex(0);
      setSubmitMessage('');
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Không thể tải bài tập. Hãy thử tải lại trang.');
    } finally {
      setLoading(false);
    }
  }, [exerciseType]);

  useEffect(() => { load(); }, [load]);

  const questions = exercise?.items || [];
  const currentQuestion = questions[currentIndex];
  const currentAnswer = currentQuestion
    ? { ...emptyAnswer(), ...answers[currentQuestion.number] }
    : emptyAnswer();
  const currentResult = currentQuestion ? checkedResults[currentQuestion.number] : null;
  const currentAnswerDetails = currentQuestion
    ? currentResult || revealedAnswers[currentQuestion.number]
    : null;
  const isCurrentAnswerVisible = Boolean(currentAnswerDetails && !hiddenAnswers[currentQuestion.number]);
  const answeredCount = useMemo(() => Object.values(answers)
    .filter((answer) => hasAnswer(exerciseType, answer)).length, [answers, exerciseType]);
  const answeredText = `${answeredCount}/${questions.length} câu đã làm`;

  const updateAnswer = (field, value) => {
    if (!currentQuestion) return;
    const number = currentQuestion.number;
    if (currentResult) {
      setRevealedAnswers((current) => ({ ...current, [number]: currentResult }));
    }
    setAnswers((current) => ({
      ...current,
      [number]: { ...emptyAnswer(), ...current[number], [field]: value },
    }));
    setCheckedResults((current) => {
      if (!current[number]) return current;
      const next = { ...current };
      delete next[number];
      return next;
    });
    setSubmitMessage('');
    setError('');
  };

  const moveToQuestion = (nextIndex) => {
    if (nextIndex < 0 || nextIndex >= questions.length || nextIndex === currentIndex || checking || revealing) return;
    setCurrentIndex(nextIndex);
    setError('');
  };

  const toggleAnswer = async () => {
    if (!currentQuestion || checking || revealing) return;
    const number = currentQuestion.number;
    if (currentAnswerDetails) {
      setHiddenAnswers((current) => ({ ...current, [number]: isCurrentAnswerVisible }));
      return;
    }

    setRevealing(true);
    setError('');
    try {
      const response = await grammarExerciseApi.checkStudentExercise(exerciseType, [{
        number,
        ...currentAnswer,
      }]);
      const details = response.data.items?.[0];
      if (!details) throw new Error('Không nhận được đáp án cho câu này.');
      setRevealedAnswers((current) => ({ ...current, [number]: details }));
      setHiddenAnswers((current) => ({ ...current, [number]: false }));
    } catch (revealError) {
      setError(revealError.response?.data?.message || revealError.message || 'Không thể tải đáp án. Hãy thử lại.');
    } finally {
      setRevealing(false);
    }
  };

  const submitAnswers = async () => {
    if (checking || revealing) return;
    const attemptedQuestions = questions.filter((question) => (
      hasAnswer(exerciseType, answers[question.number])
    ));
    if (!attemptedQuestions.length) {
      setError('Hãy trả lời ít nhất một câu trước khi nộp bài.');
      return;
    }

    setChecking(true);
    setError('');
    setSubmitMessage('');
    try {
      const payload = attemptedQuestions.map(({ number }) => ({
        number,
        ...emptyAnswer(),
        ...answers[number],
      }));
      const response = await grammarExerciseApi.checkStudentExercise(exerciseType, payload);
      const results = Object.fromEntries((response.data.items || []).map((item) => [item.number, item]));
      setCheckedResults(results);
      setHiddenAnswers((current) => ({
        ...current,
        ...Object.fromEntries(Object.keys(results).map((number) => [number, false])),
      }));
      setSubmitMessage(`Đã nộp ${Object.keys(results).length} câu đã làm. Đáp án của các câu này đang hiển thị.`);
    } catch (submitError) {
      setError(submitError.response?.data?.message || 'Không thể nộp bài. Hãy thử lại.');
    } finally {
      setChecking(false);
    }
  };

  if (!config) return null;

  return (
    <main className="grammar-exercise-page">
      <PageHeader
        eyebrow="BÀI TẬP NGỮ PHÁP"
        title={exercise?.title || config.title}
        description={exercise?.instructions || config.instructions}
      />

      {loading ? <div className="grammar-exercise-state" role="status">Đang tải câu hỏi…</div>
        : error && !exercise ? <div className="grammar-exercise-state is-error" role="alert">{error}</div>
          : !questions.length ? <div className="grammar-exercise-state">Hiện chưa có câu hỏi nào được mở.</div>
            : (
              <>
                <section className="grammar-exercise-progress" aria-label="Tiến độ bài làm">
                  <div>
                    <span>Câu {currentIndex + 1} / {questions.length}</span>
                    <strong>{answeredText}</strong>
                  </div>
                  <progress max={questions.length} value={currentIndex + 1} aria-label={`Câu ${currentIndex + 1} trên ${questions.length}`} />
                </section>

                <nav className="grammar-exercise-question-nav" aria-label="Danh sách câu hỏi">
                  <div className="grammar-exercise-question-nav__heading">
                    <strong>Danh sách câu</strong>
                    <span>{answeredText}</span>
                  </div>
                  <div className="grammar-exercise-question-nav__grid">
                    {questions.map((question, index) => {
                      const isAnswered = hasAnswer(exerciseType, answers[question.number]);
                      const status = checkedResults[question.number]?.status;
                      const classes = [
                        isAnswered ? 'is-answered' : '',
                        status ? `is-${status}` : '',
                        index === currentIndex ? 'is-current' : '',
                      ].filter(Boolean).join(' ');
                      return (
                        <button
                          type="button"
                          key={question.number}
                          className={classes}
                          aria-current={index === currentIndex ? 'step' : undefined}
                          aria-label={`Câu ${question.number}${isAnswered ? ', đã làm' : ', chưa làm'}${status ? `, ${status === 'correct' ? 'đúng' : status === 'partial' ? 'đúng một phần' : 'chưa đúng'}` : ''}${index === currentIndex ? ', đang chọn' : ''}`}
                          disabled={checking || revealing}
                          onClick={() => moveToQuestion(index)}
                        >
                          {question.number}
                        </button>
                      );
                    })}
                  </div>
                  <p>
                    <span className="grammar-exercise-question-nav__legend is-done" />Đã làm
                    <span className="grammar-exercise-question-nav__legend" />Chưa làm
                    <span className="grammar-exercise-question-nav__legend is-checked" />Đã chấm
                  </p>
                </nav>

                {error && <p className="grammar-exercise-error" role="alert">{error}</p>}
                {submitMessage && <p className="grammar-exercise-feedback" role="status" aria-live="polite">{submitMessage}</p>}

                <section className="grammar-exercise-list" aria-label={exercise.title}>
                  <article
                    className={`grammar-exercise-question${currentResult ? ` is-${currentResult.status}` : ''}`}
                    key={currentQuestion.number}
                  >
                    <header className="grammar-exercise-question__heading">
                      <span>Câu {currentQuestion.number}</span>
                      {currentResult && <strong className={`grammar-exercise-result-tag is-${currentResult.status}`}>
                        {currentResult.status === 'correct' ? 'Đúng' : currentResult.status === 'partial' ? 'Đúng một phần' : 'Chưa đúng'}
                      </strong>}
                    </header>
                    <p className="grammar-exercise-prompt">{currentQuestion.prompt}</p>

                    {exerciseType === 'tense-classification' ? (
                      <div className="grammar-exercise-fields">
                        <label>
                          <span>Thì / động từ khiếm khuyết</span>
                          <select value={currentAnswer.tense} onChange={(event) => updateAnswer('tense', event.target.value)}>
                            <option value="">Chọn đáp án</option>
                            {(exercise.options?.tenses || []).map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                          {currentResult && <small className={currentResult.tenseCorrect ? 'is-correct' : 'is-incorrect'}>
                            {currentResult.tenseCorrect ? 'Đúng' : `Đáp án: ${currentResult.correctTense}`}
                          </small>}
                        </label>
                        <label>
                          <span>Dạng câu</span>
                          <select value={currentAnswer.sentenceForm} onChange={(event) => updateAnswer('sentenceForm', event.target.value)}>
                            <option value="">Chọn đáp án</option>
                            {(exercise.options?.sentenceForms || []).map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                          {currentResult && <small className={currentResult.sentenceFormCorrect ? 'is-correct' : 'is-incorrect'}>
                            {currentResult.sentenceFormCorrect ? 'Đúng' : `Đáp án: ${currentResult.correctSentenceForm}`}
                          </small>}
                        </label>
                      </div>
                    ) : (
                      <div className="grammar-exercise-fields grammar-exercise-fields--single">
                        <label>
                          <span>Câu bị động</span>
                          <textarea rows="3" maxLength="2000" value={currentAnswer.answer} onChange={(event) => updateAnswer('answer', event.target.value)} placeholder="Nhập câu bị động" />
                        </label>
                      </div>
                    )}

                    <div className="grammar-exercise-answer-actions">
                      <button type="button" className="grammar-exercise-reveal" onClick={toggleAnswer} disabled={checking || revealing}>
                        {revealing ? 'Đang tải đáp án…' : isCurrentAnswerVisible ? 'Ẩn đáp án' : 'Hiển thị đáp án'}
                      </button>
                    </div>
                    {isCurrentAnswerVisible && currentAnswerDetails && (
                      <div className="grammar-exercise-answer">
                        <strong>{currentResult ? 'Kết quả câu này' : 'Đáp án đúng'}</strong>
                        <span>{currentAnswerDetails.answer}</span>
                        {exerciseType === 'tense-classification'
                          ? <small>Thì: {currentAnswerDetails.correctTense} · Dạng câu: {currentAnswerDetails.correctSentenceForm}</small>
                          : <small>Dịch nghĩa: {currentAnswerDetails.translation}</small>}
                      </div>
                    )}
                  </article>
                </section>

                <nav className="grammar-exercise-submit" aria-label="Chuyển câu và nộp bài">
                  <button
                    type="button"
                    className="ds-button ds-button--secondary"
                    onClick={() => moveToQuestion(currentIndex - 1)}
                    disabled={currentIndex === 0 || checking || revealing}
                  >
                    Câu trước
                  </button>
                  <span>{answeredText}</span>
                  <button
                    type="button"
                    className="ds-button ds-button--secondary"
                    onClick={() => moveToQuestion(currentIndex + 1)}
                    disabled={currentIndex === questions.length - 1 || checking || revealing}
                  >
                    Câu tiếp
                  </button>
                  <button type="button" className="ds-button ds-button--primary" onClick={submitAnswers} disabled={checking || revealing || answeredCount === 0}>
                    {checking ? 'Đang nộp bài…' : `Nộp bài · ${answeredCount} câu đã làm`}
                  </button>
                </nav>
              </>
            )}
    </main>
  );
}
