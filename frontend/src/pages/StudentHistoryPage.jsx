import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { assessmentApi } from '../api/assessmentApi.js';
import learningApi from '../api/learningApi.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import './StudentHistoryPage.css';

const EXERCISE_PAGE_SIZE = 20;

const exerciseTypeLabels = {
  'part1-dictation': 'Chép chính tả Part 1',
  'vocabulary-dictation': 'Chép chính tả từ vựng',
  'hard-words-dictation': 'Hard Words Dictation',
  'part2-challenge': 'Part 2 Challenge',
  'grammar-tense-classification': 'Phân loại thì và dạng câu',
  'grammar-active-to-passive': 'Chuyển câu chủ động thành bị động',
};

const exerciseStatusLabels = {
  correct: 'Đúng',
  incorrect: 'Sai',
  partial: 'Đúng một phần',
  unanswered: 'Bỏ trống',
};

const formatExerciseAnswer = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map(formatExerciseAnswer).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, answer]) => `${key}: ${formatExerciseAnswer(answer)}`)
      .join(' · ');
  }
  return String(value);
};

const formatSubmittedAt = (value) => (
  value ? new Date(value).toLocaleString('vi-VN') : '—'
);

export default function StudentHistoryPage() {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exerciseSubmissions, setExerciseSubmissions] = useState([]);
  const [exerciseLoading, setExerciseLoading] = useState(true);
  const [exerciseError, setExerciseError] = useState(null);
  const [exercisePage, setExercisePage] = useState(1);
  const [exercisePagination, setExercisePagination] = useState({ page: 1, limit: EXERCISE_PAGE_SIZE, total: 0, pages: 1 });

  useEffect(() => {
    let active = true;
    const fetchHistory = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await assessmentApi.getStudentHistory();
        if (active && res.status === 'success') setAttempts(res.data.history || []);
      } catch (err) {
        if (active) setError(err.response?.data?.message || 'Không thể tải lịch sử đề thi và bài đánh giá.');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchHistory();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const fetchExerciseSubmissions = async () => {
      try {
        setExerciseLoading(true);
        setExerciseError(null);
        const res = await learningApi.getMyExerciseSubmissions({ page: exercisePage, limit: EXERCISE_PAGE_SIZE });
        if (!active) return;
        setExerciseSubmissions(res.data?.submissions || []);
        setExercisePagination(res.data?.pagination || { page: exercisePage, limit: EXERCISE_PAGE_SIZE, total: 0, pages: 1 });
      } catch (err) {
        if (active) {
          setExerciseError(err.response?.data?.message || 'Không thể tải lịch sử bài tập đã nộp.');
          setExerciseSubmissions([]);
        }
      } finally {
        if (active) setExerciseLoading(false);
      }
    };

    fetchExerciseSubmissions();
    return () => { active = false; };
  }, [exercisePage]);

  return <div className="student-history-page">
    <PageHeader eyebrow="Lịch sử học tập" title="Lịch sử làm bài" description="Xem lại các bài tập và đề thi bạn đã thực hiện cùng chi tiết kết quả." />
    <section className="history-section" aria-labelledby="exercise-history-title">
      <div className="history-section-heading">
        <div>
          <p className="history-section-eyebrow">Bài tập đã nộp</p>
          <h2 id="exercise-history-title">Lịch sử bài tập</h2>
        </div>
        {!exerciseLoading && !exerciseError && <span className="history-total">{exercisePagination.total} lượt nộp</span>}
      </div>
      {exerciseLoading ? <div className="ds-loading-state">Đang tải lịch sử bài tập...</div>
        : exerciseError ? <div className="ds-error-state">{exerciseError}</div>
          : exerciseSubmissions.length === 0 ? (
            <div className="history-empty ds-empty-state">
              Bạn chưa nộp dạng bài tập nào trong các mục được theo dõi.
              <Link to="/student/part-1" className="ds-text-link">Bắt đầu luyện tập →</Link>
            </div>
          ) : (
            <>
              <div className="exercise-history-list">
                {exerciseSubmissions.map((submission) => (
                  <article className="exercise-history-card" key={submission._id}>
                    <header className="exercise-history-card__header">
                      <div>
                        <span className="exercise-history-type">{exerciseTypeLabels[submission.exerciseType] || submission.exerciseType}</span>
                        <h3>{submission.sourceTitle || exerciseTypeLabels[submission.exerciseType] || 'Bài tập'}</h3>
                      </div>
                      <time>{formatSubmittedAt(submission.submittedAt)}</time>
                    </header>
                    <div className="exercise-history-stats">
                      <span><strong>{submission.correctCount || 0}</strong> đúng</span>
                      <span><strong>{submission.incorrectCount || 0}</strong> sai</span>
                      {(submission.partialCount || 0) > 0 && <span><strong>{submission.partialCount}</strong> một phần</span>}
                      {(submission.unansweredCount || 0) > 0 && <span><strong>{submission.unansweredCount}</strong> bỏ trống</span>}
                      <span><strong>{submission.total || submission.questions?.length || 0}</strong> câu</span>
                      {submission.correctFieldCount !== null && submission.correctFieldCount !== undefined && (
                        <span><strong>{submission.correctFieldCount}/{submission.totalFieldCount}</strong> trường đúng</span>
                      )}
                    </div>
                    <details className="exercise-history-details">
                      <summary>Xem câu trả lời của lượt này</summary>
                      <ol>
                        {(submission.questions || []).map((question, index) => {
                          const submittedAnswer = question.submittedAnswer
                            ?? question.selectedAnswer
                            ?? question.userAnswer
                            ?? (question.submittedTense !== undefined || question.submittedSentenceForm !== undefined
                              ? { tense: question.submittedTense, sentenceForm: question.submittedSentenceForm }
                              : undefined);
                          const correctAnswer = question.correctAnswer
                            ?? question.answer
                            ?? (question.correctTense !== undefined || question.correctSentenceForm !== undefined
                              ? { tense: question.correctTense, sentenceForm: question.correctSentenceForm }
                              : undefined);
                          const status = question.status || (question.isCorrect ? 'correct' : undefined);

                          return (
                            <li key={`${question.number ?? index}-${index}`}>
                              <div className="exercise-history-question-heading">
                                <strong>{question.prompt || question.questionText || `Câu ${question.number ?? index + 1}`}</strong>
                                <span className={`exercise-history-status is-${status || 'unknown'}`}>
                                  {exerciseStatusLabels[status] || status || 'Đã nộp'}
                                </span>
                              </div>
                              <p><b>Bạn trả lời:</b> {formatExerciseAnswer(submittedAnswer)}</p>
                              <p><b>Đáp án:</b> {formatExerciseAnswer(correctAnswer)}</p>
                              {question.correctTranslation && <p><b>Dịch nghĩa:</b> {formatExerciseAnswer(question.correctTranslation)}</p>}
                            </li>
                          );
                        })}
                      </ol>
                    </details>
                  </article>
                ))}
              </div>
              {exercisePagination.pages > 1 && (
                <nav className="history-pagination" aria-label="Phân trang lịch sử bài tập">
                  <button type="button" disabled={exercisePage <= 1} onClick={() => setExercisePage((page) => Math.max(1, page - 1))}>Trước</button>
                  <span>Trang {exercisePage} / {exercisePagination.pages}</span>
                  <button type="button" disabled={exercisePage >= exercisePagination.pages} onClick={() => setExercisePage((page) => Math.min(exercisePagination.pages, page + 1))}>Sau</button>
                </nav>
              )}
            </>
          )}
    </section>

    <section className="history-section" aria-labelledby="assessment-history-title">
      <div className="history-section-heading">
        <div>
          <p className="history-section-eyebrow">Assessment và TOEIC</p>
          <h2 id="assessment-history-title">Lịch sử đề thi và bài đánh giá</h2>
        </div>
      </div>
      {loading ? <div className="ds-loading-state">Đang tải lịch sử đề thi...</div>
        : error ? <div className="ds-error-state">{error}</div>
          : attempts.length === 0 ? (
            <div className="history-empty ds-empty-state">
              Bạn chưa có lượt làm đề thi hoặc bài đánh giá nào.
              <Link to="/student/assessments" className="ds-text-link">Xem bài đánh giá →</Link>
            </div>
          ) : (
            <div className="ds-table-shell">
              <div className="ds-table-scroll">
                <table className="ds-data-table history-table">
                  <thead><tr><th>Tên bài đánh giá</th><th>Phân loại</th><th>Ngày nộp bài</th><th>Điểm số</th><th>Tỷ lệ</th><th>Kết quả</th><th>Thời gian</th><th className="ds-table-action-header">Thao tác</th></tr></thead>
                  <tbody>{attempts.map((att) => {
                    const isToeic = att.assessment?.examFormat === 'toeic' || !!att.toeicBreakdown?.estimatedToeicScore;
                    const isPass = att.passed === true;
                    const resultUrl = isToeic ? `/student/toeic/results/${att._id}` : `/student/results/${att._id}`;
                    const typeLabel = isToeic ? 'TOEIC' : att.assessment?.type === 'exam' ? 'Bài kiểm tra' : 'Bài tập';
                    return (
                      <tr key={att._id}>
                        <td><strong>{att.assessment?.title || (isToeic ? 'Đề thi TOEIC' : 'Bài đánh giá')}</strong></td>
                        <td><StatusBadge label={typeLabel} variant={isToeic ? 'neutral' : att.assessment?.type === 'exam' ? 'danger' : 'success'} /></td>
                        <td>{formatSubmittedAt(att.submittedAt)}</td>
                        <td>{isToeic && att.toeicBreakdown?.estimatedToeicScore !== undefined
                          ? <div><strong className="history-score">{att.toeicBreakdown.estimatedToeicScore}</strong> / 990<div className="history-subscore">L: {att.toeicBreakdown.listeningScore ?? 0} | R: {att.toeicBreakdown.readingScore ?? 0}</div></div>
                          : <div><strong>{att.score}</strong> / {att.totalScore || att.maxScore}</div>}</td>
                        <td><strong className={isToeic ? 'history-score' : isPass ? 'history-score history-score--pass' : 'history-score history-score--fail'}>{att.scorePercentage ?? att.percentage}%</strong></td>
                        <td><StatusBadge label={isToeic ? 'Hoàn thành' : isPass ? 'Đạt' : 'Chưa đạt'} variant={isToeic || isPass ? 'success' : 'danger'} /></td>
                        <td>{att.duration ? `${Math.round(att.duration / 60)} phút` : '---'}</td>
                        <td className="ds-table-action"><Link to={resultUrl} className="ds-button ds-button--secondary ds-button--small">Xem chi tiết</Link></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </div>
          )}
    </section>
  </div>;
}
