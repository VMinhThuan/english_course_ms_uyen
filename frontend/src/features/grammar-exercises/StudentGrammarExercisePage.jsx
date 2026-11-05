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
  const [result, setResult] = useState(null);
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
      setResult(null);
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Không thể tải bài tập. Hãy thử tải lại trang.');
    } finally {
      setLoading(false);
    }
  }, [exerciseType]);

  useEffect(() => { load(); }, [load]);

  const resultByNumber = useMemo(() => new Map((result?.items || []).map((item) => [item.number, item])), [result]);
  const answeredCount = useMemo(() => Object.values(answers).filter((answer) => (
    exerciseType === 'tense-classification'
      ? Boolean(answer.tense || answer.sentenceForm)
      : Boolean(answer.answer.trim())
  )).length, [answers, exerciseType]);

  const updateAnswer = (number, field, value) => {
    setAnswers((current) => ({
      ...current,
      [number]: { ...emptyAnswer(), ...current[number], [field]: value },
    }));
    setResult(null);
    setError('');
  };

  const checkAnswers = async () => {
    if (checking || !exercise?.items?.length) return;
    if (answeredCount === 0) {
      setError('Hãy trả lời ít nhất một câu trước khi kiểm tra.');
      return;
    }
    setChecking(true);
    setError('');
    try {
      const payload = exercise.items.map(({ number }) => ({ number, ...emptyAnswer(), ...answers[number] }));
      const response = await grammarExerciseApi.checkStudentExercise(exerciseType, payload);
      setResult(response.data);
    } catch (checkError) {
      setError(checkError.response?.data?.message || 'Không thể kiểm tra bài làm. Hãy thử lại.');
    } finally {
      setChecking(false);
    }
  };

  if (!config) return null;

  const summaryText = result
    ? exerciseType === 'tense-classification'
      ? `Đúng ${result.correctFieldCount}/${result.totalFieldCount} ô. ${result.correctCount} câu đúng cả hai mục.`
      : `Đúng ${result.correctCount}/${result.total} câu. ${result.incorrectCount} câu chưa đúng, ${result.unansweredCount} câu chưa trả lời.`
    : `${answeredCount}/${exercise?.items?.length || 0} câu đã làm`;

  return (
    <main className="grammar-exercise-page">
      <PageHeader
        eyebrow="BÀI TẬP NGỮ PHÁP"
        title={exercise?.title || config.title}
        description={exercise?.instructions || config.instructions}
      />

      {loading ? <div className="grammar-exercise-state" role="status">Đang tải câu hỏi…</div>
        : error && !exercise ? <div className="grammar-exercise-state is-error" role="alert">{error}</div>
          : !exercise?.items?.length ? <div className="grammar-exercise-state">Hiện chưa có câu hỏi nào được mở.</div>
            : (
              <>
                <section className="grammar-exercise-progress" aria-label="Tiến độ bài làm">
                  <div>
                    <span>{exercise.items.length} câu hỏi</span>
                    <strong>{summaryText}</strong>
                  </div>
                  <progress max={exercise.items.length} value={Math.min(answeredCount, exercise.items.length)} aria-label={`${answeredCount} trên ${exercise.items.length} câu đã làm`} />
                </section>

                {error && <p className="grammar-exercise-error" role="alert">{error}</p>}
                {result && <p className="grammar-exercise-feedback" role="status" aria-live="polite">Đã kiểm tra bài làm. Đáp án đầy đủ hiển thị dưới từng câu.</p>}

                <section className="grammar-exercise-list" aria-label={exercise.title}>
                  {exercise.items.map((question) => {
                    const answer = answers[question.number] || emptyAnswer();
                    const checked = resultByNumber.get(question.number);
                    return (
                      <article
                        className={`grammar-exercise-question${checked ? ` is-${checked.status}` : ''}`}
                        key={question.number}
                      >
                        <header className="grammar-exercise-question__heading">
                          <span>Câu {question.number}</span>
                          {checked && <strong className={`grammar-exercise-result-tag is-${checked.status}`}>
                            {checked.status === 'correct' ? 'Đúng' : checked.status === 'partial' ? 'Đúng một phần' : checked.status === 'unanswered' ? 'Chưa trả lời' : 'Chưa đúng'}
                          </strong>}
                        </header>
                        <p className="grammar-exercise-prompt">{question.prompt}</p>

                        {exerciseType === 'tense-classification' ? (
                          <div className="grammar-exercise-fields">
                            <label>
                              <span>Thì / động từ khiếm khuyết</span>
                              <select value={answer.tense} onChange={(event) => updateAnswer(question.number, 'tense', event.target.value)}>
                                <option value="">Chọn đáp án</option>
                                {(exercise.options?.tenses || []).map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                              {checked && <small className={checked.tenseCorrect ? 'is-correct' : 'is-incorrect'}>
                                {checked.tenseCorrect ? 'Đúng' : `Đáp án: ${checked.correctTense}`}
                              </small>}
                            </label>
                            <label>
                              <span>Dạng câu</span>
                              <select value={answer.sentenceForm} onChange={(event) => updateAnswer(question.number, 'sentenceForm', event.target.value)}>
                                <option value="">Chọn đáp án</option>
                                {(exercise.options?.sentenceForms || []).map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                              {checked && <small className={checked.sentenceFormCorrect ? 'is-correct' : 'is-incorrect'}>
                                {checked.sentenceFormCorrect ? 'Đúng' : `Đáp án: ${checked.correctSentenceForm}`}
                              </small>}
                            </label>
                            {checked && <div className="grammar-exercise-answer">
                              <strong>Đáp án đầy đủ</strong>
                              <span>{checked.answer}</span>
                              <small>Thì: {checked.correctTense} · Dạng câu: {checked.correctSentenceForm}</small>
                            </div>}
                          </div>
                        ) : (
                          <div className="grammar-exercise-fields grammar-exercise-fields--single">
                            <label>
                              <span>Câu bị động</span>
                              <textarea rows="2" maxLength="2000" value={answer.answer} onChange={(event) => updateAnswer(question.number, 'answer', event.target.value)} placeholder="Nhập câu bị động" />
                            </label>
                            {checked && <div className="grammar-exercise-answer">
                              <strong>{checked.status === 'correct' ? 'Đáp án của bạn đúng' : 'Đáp án câu bị động'}</strong>
                              <span>{checked.answer}</span>
                              <small>Dịch nghĩa: {checked.translation}</small>
                            </div>}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </section>

                <div className="grammar-exercise-submit">
                  <span>{summaryText}</span>
                  <button type="button" className="ds-button ds-button--primary" onClick={checkAnswers} disabled={checking}>
                    {checking ? 'Đang kiểm tra…' : result ? 'Kiểm tra lại' : 'Kiểm tra đáp án'}
                  </button>
                </div>
              </>
            )}
    </main>
  );
}
