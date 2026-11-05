import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { grammarExerciseApi } from '../../api/grammarExerciseApi.js';
import { GRAMMAR_EXERCISES } from './grammarExerciseConfig.js';
import './grammarExercise.css';

const emptyAnswer = () => ({ tense: '', sentenceForm: '', answer: '' });

export default function StudentGrammarExercisePage({ exerciseType }) {
  const config = GRAMMAR_EXERCISES[exerciseType];
  const [exercise, setExercise] = useState(null);
  const [answers, setAnswers] = useState({});
  const [checkedResults, setCheckedResults] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await grammarExerciseApi.getStudentExercise(exerciseType);
      setExercise(response.data);
      setAnswers({});
      setCheckedResults({});
      setCurrentIndex(0);
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
  const answeredCount = useMemo(() => Object.values(answers).filter((answer) => (
    exerciseType === 'tense-classification'
      ? Boolean(answer.tense || answer.sentenceForm)
      : Boolean(answer.answer.trim())
  )).length, [answers, exerciseType]);
  const checkedCount = Object.keys(checkedResults).length;

  const updateAnswer = (field, value) => {
    if (!currentQuestion) return;
    const number = currentQuestion.number;
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
    setError('');
  };

  const moveToQuestion = (nextIndex) => {
    if (nextIndex < 0 || nextIndex >= questions.length || nextIndex === currentIndex) return;
    setCurrentIndex(nextIndex);
    setError('');
  };

  const checkCurrentAnswer = async () => {
    if (checking || !currentQuestion) return;
    const hasAnswer = exerciseType === 'tense-classification'
      ? Boolean(currentAnswer.tense || currentAnswer.sentenceForm)
      : Boolean(currentAnswer.answer.trim());
    if (!hasAnswer) {
      setError('Hãy nhập hoặc chọn đáp án cho câu này trước khi kiểm tra.');
      return;
    }

    setChecking(true);
    setError('');
    try {
      const response = await grammarExerciseApi.checkStudentExercise(exerciseType, [{
        number: currentQuestion.number,
        ...currentAnswer,
      }]);
      const checked = response.data.items?.[0];
      if (!checked) throw new Error('Không nhận được kết quả kiểm tra.');
      setCheckedResults((current) => ({ ...current, [currentQuestion.number]: checked }));
    } catch (checkError) {
      setError(checkError.response?.data?.message || checkError.message || 'Không thể kiểm tra câu trả lời. Hãy thử lại.');
    } finally {
      setChecking(false);
    }
  };

  if (!config) return null;

  const answeredText = `${answeredCount}/${questions.length} câu đã trả lời`;
  const progressText = currentQuestion
    ? `Câu ${currentIndex + 1}/${questions.length} · ${answeredText} · ${checkedCount} câu đã kiểm tra`
    : answeredText;

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
                    <span>{progressText}</span>
                    {currentResult && <strong>
                      {currentResult.status === 'correct' ? 'Câu này trả lời đúng'
                        : currentResult.status === 'partial' ? 'Câu này đúng một phần'
                          : currentResult.status === 'unanswered' ? 'Câu này chưa trả lời'
                            : 'Câu này chưa đúng'}
                    </strong>}
                  </div>
                  <progress max={questions.length} value={currentIndex + 1} aria-label={`Câu ${currentIndex + 1} trên ${questions.length}`} />
                </section>

                {error && <p className="grammar-exercise-error" role="alert">{error}</p>}

                <section className="grammar-exercise-list" aria-label={exercise.title}>
                  <article
                    className={`grammar-exercise-question${currentResult ? ` is-${currentResult.status}` : ''}`}
                    key={currentQuestion.number}
                  >
                    <header className="grammar-exercise-question__heading">
                      <span>Câu {currentQuestion.number}</span>
                      {currentResult && <strong className={`grammar-exercise-result-tag is-${currentResult.status}`}>
                        {currentResult.status === 'correct' ? 'Đúng' : currentResult.status === 'partial' ? 'Đúng một phần' : currentResult.status === 'unanswered' ? 'Chưa trả lời' : 'Chưa đúng'}
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
                        {currentResult && <div className="grammar-exercise-answer">
                          <strong>Đáp án đầy đủ</strong>
                          <span>{currentResult.answer}</span>
                          <small>Thì: {currentResult.correctTense} · Dạng câu: {currentResult.correctSentenceForm}</small>
                        </div>}
                      </div>
                    ) : (
                      <div className="grammar-exercise-fields grammar-exercise-fields--single">
                        <label>
                          <span>Câu bị động</span>
                          <textarea rows="3" maxLength="2000" value={currentAnswer.answer} onChange={(event) => updateAnswer('answer', event.target.value)} placeholder="Nhập câu bị động" />
                        </label>
                        {currentResult && <div className="grammar-exercise-answer">
                          <strong>{currentResult.status === 'correct' ? 'Đáp án của bạn đúng' : 'Đáp án câu bị động'}</strong>
                          <span>{currentResult.answer}</span>
                          <small>Dịch nghĩa: {currentResult.translation}</small>
                        </div>}
                      </div>
                    )}
                  </article>
                </section>

                <nav className="grammar-exercise-submit" aria-label="Chuyển câu và kiểm tra đáp án">
                  <button
                    type="button"
                    className="ds-button ds-button--secondary"
                    onClick={() => moveToQuestion(currentIndex - 1)}
                    disabled={currentIndex === 0 || checking}
                  >
                    Câu trước
                  </button>
                  <span>{progressText}</span>
                  <button type="button" className="ds-button ds-button--primary" onClick={checkCurrentAnswer} disabled={checking}>
                    {checking ? 'Đang kiểm tra…' : currentResult ? 'Kiểm tra lại câu này' : 'Kiểm tra câu này'}
                  </button>
                  <button
                    type="button"
                    className="ds-button ds-button--secondary"
                    onClick={() => moveToQuestion(currentIndex + 1)}
                    disabled={currentIndex === questions.length - 1 || checking}
                  >
                    Câu tiếp
                  </button>
                </nav>
              </>
            )}
    </main>
  );
}
