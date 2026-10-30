import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toeicApi } from '../api/toeicApi.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import { studentExplanationText, studentTopicLabel } from '../utils/studentContentLanguage.js';
import './StudentToeicPart5BankPage.css';

const STORAGE_KEY = 'toeic_part5_student_practice_v1';

export default function StudentToeicPart5BankPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const [questions, setQuestions] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & Filter state
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, UNANSWERED, ANSWERED, CORRECT, INCORRECT
  const [studyMode, setStudyMode] = useState('PRACTICE'); // PRACTICE or REVIEW

  // Practice state: { [questionId]: { selectedAnswer: string, isChecked: boolean, isCorrect: boolean, showExp: boolean } }
  const [practiceState, setPracticeState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Save practice state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(practiceState));
    } catch {}
  }, [practiceState]);

  // Fetch Part 5 bank questions
  const fetchQuestions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await toeicApi.getStudentPart5Bank({
        page,
        limit: 20,
        search: searchText.trim() || undefined,
      });
      if (res.status === 'success' && res.data) {
        setQuestions(res.data.questions || []);
        if (res.data.pagination) setPagination(res.data.pagination);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải Ngân hàng Part 5. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  }, [page, searchText]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Overall statistics
  const stats = useMemo(() => {
    const answeredIds = Object.keys(practiceState).filter((id) => practiceState[id]?.isChecked);
    const correctCount = answeredIds.filter((id) => practiceState[id]?.isCorrect).length;
    const incorrectCount = answeredIds.length - correctCount;
    const accuracy = answeredIds.length > 0 ? Math.round((correctCount / answeredIds.length) * 100) : 0;
    return {
      total: pagination.total,
      answeredCount: answeredIds.length,
      correctCount,
      incorrectCount,
      accuracy,
    };
  }, [practiceState, pagination.total]);

  // Filtered questions on current view
  const displayedQuestions = useMemo(() => {
    return questions.filter((q) => {
      const qState = practiceState[q._id];
      if (filterStatus === 'UNANSWERED') return !qState?.isChecked;
      if (filterStatus === 'ANSWERED') return !!qState?.isChecked;
      if (filterStatus === 'CORRECT') return qState?.isChecked && qState?.isCorrect;
      if (filterStatus === 'INCORRECT') return qState?.isChecked && !qState?.isCorrect;
      return true;
    });
  }, [questions, filterStatus, practiceState]);

  // User interactions
  const handleSelectOption = (questionId, optionId) => {
    setPracticeState((prev) => {
      const current = prev[questionId] || {};
      if (current.isChecked && studyMode === 'PRACTICE') return prev; // Locked once checked unless retried
      return {
        ...prev,
        [questionId]: {
          ...current,
          selectedAnswer: optionId,
        },
      };
    });
  };

  const handleCheckAnswer = (question) => {
    const qState = practiceState[question._id];
    if (!qState?.selectedAnswer) return;
    const correct = Array.isArray(question.correctAnswers) && question.correctAnswers.includes(qState.selectedAnswer);
    setPracticeState((prev) => ({
      ...prev,
      [question._id]: {
        ...prev[question._id],
        isChecked: true,
        isCorrect: correct,
        showExp: true, // Automatically reveal explanation
      },
    }));
  };

  const handleToggleExplanation = (questionId) => {
    setPracticeState((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        showExp: !prev[questionId]?.showExp,
      },
    }));
  };

  const handleRetryQuestion = (questionId) => {
    setPracticeState((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  const handleResetAllPractice = () => {
    if (window.confirm('Bạn có chắc muốn làm lại từ đầu? Toàn bộ kết quả luyện tập Part 5 sẽ được xóa để bạn làm lại.')) {
      setPracticeState({});
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
  };

  const handlePageChange = (newPage) => {
    setSearchParams({ page: String(newPage) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="toeic-p5-container" data-testid="student-part5-bank-page">
      <PageHeader
        eyebrow="Bài tập · TOEIC Part 5"
        title="Ngân hàng Part 5"
        description="Bộ câu hỏi trắc nghiệm ngữ pháp và từ vựng chuẩn đề thi TOEIC, có đáp án và lời giải chi tiết từng câu."
      />

      {/* Progress & Quick Stats Card */}
      <section className="toeic-p5-stats-card" aria-label="Thống kê luyện tập">
        <div className="toeic-p5-stat-item">
          <span className="toeic-p5-stat-label">Tổng câu trong ngân hàng</span>
          <span className="toeic-p5-stat-value">{stats.total}</span>
        </div>
        <div className="toeic-p5-stat-item">
          <span className="toeic-p5-stat-label">Đã hoàn thành</span>
          <span className="toeic-p5-stat-value">
            {stats.answeredCount} <small style={{ fontSize: '0.9rem', color: 'var(--brand-muted)' }}>/ {stats.total}</small>
          </span>
        </div>
        <div className="toeic-p5-stat-item">
          <span className="toeic-p5-stat-label">Số câu đúng</span>
          <span className="toeic-p5-stat-value toeic-p5-stat-value--success">
            {stats.correctCount} <small style={{ fontSize: '0.9rem' }}>({stats.accuracy}%)</small>
          </span>
        </div>
        <div className="toeic-p5-stat-item">
          <span className="toeic-p5-stat-label">Số câu sai</span>
          <span className="toeic-p5-stat-value toeic-p5-stat-value--error">{stats.incorrectCount}</span>
        </div>
        {stats.answeredCount > 0 && (
          <div className="toeic-p5-stat-action">
            <button type="button" className="toeic-p5-reset-btn" onClick={handleResetAllPractice}>
              ↻ Làm lại từ đầu
            </button>
          </div>
        )}
      </section>

      {/* Toolbar & Filter Controls */}
      <section className="toeic-p5-toolbar" aria-label="Bộ lọc và tìm kiếm">
        <div className="toeic-p5-search-row">
          <div className="toeic-p5-search-input-wrap">
            <span className="toeic-p5-search-icon" aria-hidden="true">🔍</span>
            <input
              type="search"
              className="toeic-p5-search-input"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                if (page !== 1) setSearchParams({ page: '1' });
              }}
              placeholder="Tìm theo nội dung câu hỏi hoặc từ vựng..."
              aria-label="Tìm câu hỏi"
            />
          </div>

          <div className="toeic-p5-mode-switch" role="group" aria-label="Chế độ làm bài">
            <button
              type="button"
              className={`toeic-p5-mode-btn ${studyMode === 'PRACTICE' ? 'active' : ''}`}
              onClick={() => setStudyMode('PRACTICE')}
            >
              🎯 Luyện tập
            </button>
            <button
              type="button"
              className={`toeic-p5-mode-btn ${studyMode === 'REVIEW' ? 'active' : ''}`}
              onClick={() => setStudyMode('REVIEW')}
            >
              📖 Xem đáp án &amp; giải thích
            </button>
          </div>
        </div>

        <div className="toeic-p5-filter-tabs" role="tablist" aria-label="Lọc theo trạng thái">
          <button
            type="button"
            className={`toeic-p5-filter-chip ${filterStatus === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterStatus('ALL')}
          >
            Tất cả trang này ({questions.length})
          </button>
          <button
            type="button"
            className={`toeic-p5-filter-chip ${filterStatus === 'UNANSWERED' ? 'active' : ''}`}
            onClick={() => setFilterStatus('UNANSWERED')}
          >
            Chưa làm ({questions.filter((q) => !practiceState[q._id]?.isChecked).length})
          </button>
          <button
            type="button"
            className={`toeic-p5-filter-chip ${filterStatus === 'ANSWERED' ? 'active' : ''}`}
            onClick={() => setFilterStatus('ANSWERED')}
          >
            Đã làm ({questions.filter((q) => practiceState[q._id]?.isChecked).length})
          </button>
          <button
            type="button"
            className={`toeic-p5-filter-chip ${filterStatus === 'CORRECT' ? 'active' : ''}`}
            onClick={() => setFilterStatus('CORRECT')}
          >
            Đúng ({questions.filter((q) => practiceState[q._id]?.isChecked && practiceState[q._id]?.isCorrect).length})
          </button>
          <button
            type="button"
            className={`toeic-p5-filter-chip ${filterStatus === 'INCORRECT' ? 'active' : ''}`}
            onClick={() => setFilterStatus('INCORRECT')}
          >
            Sai ({questions.filter((q) => practiceState[q._id]?.isChecked && !practiceState[q._id]?.isCorrect).length})
          </button>
        </div>
      </section>

      {/* Main Content Area */}
      {loading ? (
        <div className="ds-loading-state" style={{ padding: '3rem', textAlign: 'center' }}>
          Đang tải Ngân hàng câu hỏi Part 5...
        </div>
      ) : error ? (
        <div className="toeic-error ds-error-state" role="alert">
          <strong>{error}</strong>
          <button type="button" className="ds-button ds-button--danger" onClick={fetchQuestions}>
            Thử lại
          </button>
        </div>
      ) : displayedQuestions.length === 0 ? (
        <div className="ds-empty-state" style={{ textAlign: 'center', padding: '3rem' }}>
          <p>Không có câu hỏi nào khớp với bộ lọc hiện tại.</p>
          {(searchText || filterStatus !== 'ALL') && (
            <button
              type="button"
              className="ds-button ds-button--secondary"
              onClick={() => {
                setSearchText('');
                setFilterStatus('ALL');
              }}
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      ) : (
        <div className="toeic-p5-question-list">
          {displayedQuestions.map((q, idx) => {
            const questionNumber = Number.isInteger(q.part5BankOrder)
              ? q.part5BankOrder
              : (page - 1) * pagination.limit + (idx + 1);
            const qState = practiceState[q._id] || {};
            const isChecked = studyMode === 'REVIEW' || !!qState.isChecked;
            const correctAnswers = Array.isArray(q.correctAnswers) ? q.correctAnswers : [];
            const showExp = studyMode === 'REVIEW' || !!qState.showExp;
            const explanation = studentExplanationText(q.explanation);

            return (
              <article key={q._id} className="toeic-p5-card" data-testid={`p5-question-card-${q._id}`}>
                <div className="toeic-p5-card-header">
                  <div className="toeic-p5-card-tags">
                    <span className="toeic-p5-number-badge">Câu #{questionNumber}</span>
                    <span className="toeic-p5-topic-badge">{studentTopicLabel(q.topic)}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--brand-muted)' }}>1 điểm</span>
                  </div>

                  <div>
                    {isChecked ? (
                      qState.isCorrect ? (
                        <span className="toeic-p5-status-pill toeic-p5-status-pill--correct">
                          ✓ Chính xác
                        </span>
                      ) : (
                        <span className="toeic-p5-status-pill toeic-p5-status-pill--incorrect">
                          ✗ Chưa đúng
                        </span>
                      )
                    ) : (
                      <span className="toeic-p5-status-pill toeic-p5-status-pill--unanswered">
                        Chưa kiểm tra
                      </span>
                    )}
                  </div>
                </div>

                {/* Question Stem */}
                <div className="toeic-p5-stem">
                  {String(q.questionText || '').replace(/^\s*\d+\s*[.)]\s*/, '')}
                </div>

                {/* Options (A, B, C, D) */}
                <div className="toeic-p5-options-grid">
                  {(q.options || []).map((opt, optionIndex) => {
                    const isSelected = qState.selectedAnswer === opt.id;
                    const isThisCorrect = correctAnswers.includes(opt.id);
                    const optionLetter = ['A', 'B', 'C', 'D'][optionIndex] || opt.id;

                    let evalClass = '';
                    if (isChecked) {
                      if (isThisCorrect) evalClass = 'correct-eval';
                      else if (isSelected && !isThisCorrect) evalClass = 'wrong-eval';
                    } else if (isSelected) {
                      evalClass = 'selected';
                    }

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={`toeic-p5-option-btn ${evalClass}`}
                        onClick={() => handleSelectOption(q._id, opt.id)}
                        disabled={isChecked && studyMode === 'PRACTICE'}
                      >
                        <span className="toeic-p5-option-letter">{optionLetter}</span>
                        <span>{opt.text}</span>
                        {isChecked && isThisCorrect && (
                          <span style={{ marginLeft: 'auto', fontSize: '0.8rem', fontWeight: 700, color: '#15803d' }}>
                            ✓ Đáp án đúng
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Actions & Feedback */}
                <div className="toeic-p5-card-actions">
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {studyMode === 'PRACTICE' && !isChecked && (
                      <button
                        type="button"
                        className="toeic-p5-btn-check"
                        disabled={!qState.selectedAnswer}
                        onClick={() => handleCheckAnswer(q)}
                      >
                        Kiểm tra đáp án
                      </button>
                    )}

                    {(isChecked || studyMode === 'REVIEW') && explanation && (
                      <button
                        type="button"
                        className="toeic-p5-btn-toggle-exp"
                        onClick={() => handleToggleExplanation(q._id)}
                      >
                        {showExp ? 'Ẩn lời giải' : '💡 Xem lời giải chi tiết'}
                      </button>
                    )}
                  </div>

                  {isChecked && studyMode === 'PRACTICE' && (
                    <button
                      type="button"
                      className="toeic-p5-btn-retry"
                      onClick={() => handleRetryQuestion(q._id)}
                    >
                      ↺ Làm lại câu này
                    </button>
                  )}
                </div>

                {/* Detailed Explanation Box */}
                {showExp && explanation && (
                  <div className="toeic-p5-explanation-box">
                    <div className="toeic-p5-exp-title">
                      <span>💡 Lời giải thích chi tiết:</span>
                    </div>
                    <div className="toeic-p5-exp-content">
                      {explanation}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {pagination.pages > 1 && (
        <nav className="toeic-p5-pagination" aria-label="Phân trang câu hỏi">
          <button
            type="button"
            className="toeic-p5-page-btn"
            disabled={page <= 1}
            onClick={() => handlePageChange(page - 1)}
          >
            ← Trang trước
          </button>

          {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((pNum) => (
            <button
              key={pNum}
              type="button"
              className={`toeic-p5-page-btn ${pNum === page ? 'active' : ''}`}
              onClick={() => handlePageChange(pNum)}
            >
              {pNum}
            </button>
          ))}

          <button
            type="button"
            className="toeic-p5-page-btn"
            disabled={page >= pagination.pages}
            onClick={() => handlePageChange(page + 1)}
          >
            Trang sau →
          </button>
        </nav>
      )}
    </div>
  );
}
