import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { assessmentApi } from '../api/assessmentApi.js';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import UiButton from '../components/ui/UiButton.jsx';
import AssessmentQuestionReviewCard from '../components/assessment/AssessmentQuestionReviewCard.jsx';
import { speakText, stopSpeaking } from '../utils/tts.js';
import { startSpeechRecognition, stopSpeechRecognition, isSpeechRecognitionSupported } from '../utils/speechRecognition.js';
import './TestPage.css';
import '../styles/assessment-screens.css';

export default function TestPage() {
  const { testId } = useParams();
  const navigate = useNavigate();

  const [attemptId, setAttemptId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [deadlineAt, setDeadlineAt] = useState(null);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [saveState, setSaveState] = useState('');

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const desktopNavigatorRef = useRef(null);
  const mobileNavigatorRef = useRef(null);

  // STT / TTS states
  const [isRecording, setIsRecording] = useState(false);
  const [recognitionRef, setRecognitionRef] = useState(null);
  const hasStartedAttempt = useRef(false);
  const autosaveVersion = useRef(0);

  // Start or resume assessment attempt
  const initAttempt = useCallback(async () => {
    if (hasStartedAttempt.current) return;
    hasStartedAttempt.current = true;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await assessmentApi.startAttempt(testId);
      if (res.data) {
        setAttemptId(res.data.attemptId);
        setQuestions(res.data.questions || []);
        setDeadlineAt(res.data.deadlineAt);
        if (res.data.answers) {
          setAnswers(res.data.answers);
        }
      }
    } catch (err) {
      hasStartedAttempt.current = false;
      console.error('Failed to start/resume attempt:', err);
      setErrorMsg(err.response?.data?.message || 'Không thể mở bài kiểm tra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => {
    initAttempt();
  }, [initAttempt]);

  // Persist answers with a short debounce. The backend merges the answer map,
  // so a refresh resumes the same server-owned attempt and deadline.
  useEffect(() => {
    if (!attemptId || loading || result) return undefined;
    const version = ++autosaveVersion.current;
    setSaveState('saving');
    const timer = setTimeout(async () => {
      try {
        await assessmentApi.autosaveAttemptAnswers(attemptId, answers);
        // An older response must never mark a newer text edit as saved.
        if (version === autosaveVersion.current) setSaveState('saved');
      } catch (error) {
        if (version === autosaveVersion.current) setSaveState('error');
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [answers, attemptId, loading, result]);

  // Server-based Timer Countdown Display
  useEffect(() => {
    if (!deadlineAt || result) return;

    const interval = setInterval(() => {
      const remainingMs = new Date(deadlineAt).getTime() - Date.now();
      const seconds = Math.max(0, Math.floor(remainingMs / 1000));
      setTimeLeftSeconds(seconds);

      if (seconds <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [deadlineAt, result]);

  // Lock background scroll when mobile sheet or modal is open
  useEffect(() => {
    if (showMobileSheet || showConfirmModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showMobileSheet, showConfirmModal]);

  // Keep the navigator in sync when the learner scrolls through the question list.
  useEffect(() => {
    if (!questions.length || result || typeof IntersectionObserver === 'undefined') return undefined;

    const questionCards = document.querySelectorAll('.test-screen--active .question-card[data-question-index]');
    if (!questionCards.length) return undefined;

    const observer = new IntersectionObserver((entries) => {
      const visibleQuestions = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => Math.abs(a.boundingClientRect.top - window.innerHeight * 0.3)
          - Math.abs(b.boundingClientRect.top - window.innerHeight * 0.3));

      const visibleIndex = visibleQuestions[0]?.target?.dataset?.questionIndex;
      if (visibleIndex !== undefined) setCurrentQuestionIndex(Number(visibleIndex));
    }, { rootMargin: '-18% 0px -60% 0px', threshold: 0 });

    questionCards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [questions.length, result]);

  // Scroll only the question-number panel so the active number stays visible.
  useEffect(() => {
    [desktopNavigatorRef.current, showMobileSheet ? mobileNavigatorRef.current : null]
      .filter(Boolean)
      .forEach((grid) => {
        const tile = grid.querySelector(`[data-question-index="${currentQuestionIndex}"]`);
        if (!tile) return;

        const gridRect = grid.getBoundingClientRect();
        const tileRect = tile.getBoundingClientRect();
        if (tileRect.top < gridRect.top) {
          grid.scrollTop -= gridRect.top - tileRect.top + 8;
        } else if (tileRect.bottom > gridRect.bottom) {
          grid.scrollTop += tileRect.bottom - gridRect.bottom + 8;
        }
      });
  }, [currentQuestionIndex, showMobileSheet]);

  // TTS
  const handlePlayText = (text) => {
    stopSpeaking();
    speakText(text, { lang: 'en-US', rate: 0.9 });
  };

  // STT
  const handleStartRecording = (qId) => {
    if (!isSpeechRecognitionSupported()) {
      alert('Trình duyệt không hỗ trợ nhận diện giọng nói (Speech Recognition).');
      return;
    }

    const recognition = startSpeechRecognition({
      lang: 'en-US',
      continuous: false,
      interimResults: false,
    });

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setAnswers((prev) => ({
        ...prev,
        [qId]: transcript,
      }));
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
    setIsRecording(true);
    setRecognitionRef(recognition);
  };

  const handleStopRecording = () => {
    if (recognitionRef) {
      stopSpeechRecognition();
      setIsRecording(false);
      setRecognitionRef(null);
    }
  };

  // Select option for single choice or toggle for multiple choice
  const handleOptionSelect = (qId, optionId, isMultiple = false) => {
    if (isMultiple) {
      const currentArr = Array.isArray(answers[qId]) ? answers[qId] : [];
      let updated;
      if (currentArr.includes(optionId)) {
        updated = currentArr.filter((id) => id !== optionId);
      } else {
        updated = [...currentArr, optionId];
      }
      setAnswers((prev) => ({ ...prev, [qId]: updated }));
    } else {
      setAnswers((prev) => ({ ...prev, [qId]: optionId }));
    }
  };

  const handleSubmit = async () => {
    if (!attemptId) return;
    setShowConfirmModal(false);
    setSubmitting(true);
    try {
      const response = await assessmentApi.submitAttempt(attemptId, answers);
      if (response.status === 'success') {
        const resultRes = await assessmentApi.getAttemptResult(attemptId);
        setResult(resultRes.data.result);
      }
    } catch (error) {
      console.error('Error submitting assessment:', error);
      alert(error.response?.data?.message || 'Nộp bài thất bại.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (totalSec) => {
    if (totalSec === null || totalSec === undefined) return '--:--';
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="test-screen test-screen--state test-screen--loading">
        <p>Đang chuẩn bị bài kiểm tra từ máy chủ...</p>
      </div>
    );
  }

  if (errorMsg || questions.length === 0) {
    return (
      <div className="test-screen test-screen--state test-screen--error">
        <h3>{errorMsg || 'Không tìm thấy bài kiểm tra'}</h3>
        <button
          onClick={() => navigate(-1)}
          className="ds-button ds-button--primary test-screen__retry-button"
        >
          Quay Lại
        </button>
      </div>
    );
  }

  // Result View
  if (result) {
    return (
      <div className="test-screen test-screen--result">
      <div className="test-taking-container">
        <div className="test-screen__result-card ds-panel">
          <h2 style={{ fontSize: '1.75rem', color: 'var(--brand-text)', marginBottom: '0.5rem', textAlign: 'center' }}>Kết Quả Bài Kiểm Tra</h2>
          <p style={{ textAlign: 'center', color: 'var(--brand-muted)', marginBottom: '1.5rem' }}>{result.assessmentTitle}</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '2rem' }}>
            <div style={{ background: 'var(--brand-success-bg)', borderRadius: '12px', padding: '1rem', textAlign: 'center', border: '1px solid var(--brand-success-border)' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--brand-success)' }}>{result.percentage}%</div>
              <p style={{ color: 'var(--brand-success)', fontSize: '0.85rem', margin: 0, fontWeight: 600 }}>Điểm: {result.score} / {result.maxScore}</p>
              <StatusBadge status={result.passed ? 'passed' : 'failed'} label={`Điểm đạt: ${result.passScore ?? 0}% · ${result.passed ? 'ĐẠT' : 'CHƯA ĐẠT'}`} />
            </div>
            <div style={{ background: 'var(--brand-success-bg)', borderRadius: '12px', padding: '1rem', textAlign: 'center', border: '1px solid var(--brand-success-border)' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--brand-success)' }}>{result.correctCount}</div>
              <p style={{ color: 'var(--brand-success)', fontSize: '0.85rem', margin: 0 }}>Câu Đúng</p>
            </div>
            <div style={{ background: 'var(--brand-danger-bg)', borderRadius: '12px', padding: '1rem', textAlign: 'center', border: '1px solid var(--brand-danger-border)' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--brand-danger)' }}>{result.incorrectCount}</div>
              <p style={{ color: 'var(--brand-danger)', fontSize: '0.85rem', margin: 0 }}>Câu Sai</p>
            </div>
            <div style={{ background: 'var(--brand-bg-sub)', borderRadius: '12px', padding: '1rem', textAlign: 'center', border: '1px solid var(--brand-border)' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--brand-muted)' }}>{result.unansweredCount}</div>
              <p style={{ color: 'var(--brand-muted)', fontSize: '0.85rem', margin: 0 }}>Bỏ Trống</p>
            </div>
          </div>

          <h3 style={{ fontSize: '1.2rem', color: 'var(--brand-text)', marginBottom: '1rem' }}>Chi Tiết Từng Câu Hỏi:</h3>
          <div className="assessment-review-list">
            {result.questions?.map((question, idx) => (
              <AssessmentQuestionReviewCard
                key={question.questionId || idx}
                question={question}
                questionNumber={idx + 1}
                showCorrectAnswer={result.showCorrectAnswers}
                variant="options"
              />
            ))}
          </div>

          <UiButton onClick={() => navigate('/student/dashboard')} className="btn-submit-exam" style={{ marginTop: '2rem' }}>
            Quay Về Trang Học Viên
          </UiButton>
        </div>
      </div>
      </div>
    );
  }

  const totalQuestions = questions.length;
  const answeredCount = Object.keys(answers).filter((k) => {
    const val = answers[k];
    return val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0);
  }).length;

  return (
    <div className="test-screen test-screen--active">
    <div className="test-taking-container">
      {/* Sticky Header with Server-based Timer & Progress */}
      <div className="test-sticky-header">
        <div className="test-title-box">
          <h2>Bài Kiểm Tra</h2>
          <p>Đã làm {answeredCount}/{totalQuestions} câu {saveState === 'saving' ? '· Đang lưu...' : saveState === 'saved' ? '· Đã lưu' : saveState === 'error' ? '· Chưa thể lưu' : ''}</p>
        </div>
        <div className="test-timer-badge" style={{ background: timeLeftSeconds < 180 ? 'var(--brand-danger-bg)' : 'var(--brand-yellow-soft)', color: timeLeftSeconds < 180 ? 'var(--brand-danger)' : 'var(--brand-coffee)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>{formatTime(timeLeftSeconds)}</span>
        </div>
      </div>

      {/* Main Split Area */}
      <div className="test-main-split">
        {/* Left Column - Questions List */}
        <div className="test-questions-column">
          {questions.map((question, index) => {
            const qId = question.questionId;
            const currentAnswer = answers[qId];

            return (
              <div key={qId || index} id={`question-${index}`} data-question-index={index} className="question-card">
                <span className="question-number-tag">Câu {index + 1} / {totalQuestions}</span>
                <div className="question-text">{question.questionText}</div>

                {/* Choice Questions */}
                {(question.type === 'single_choice' || question.type === 'multiple_choice') && question.options && (
                  <div className="options-list">
                    {question.options.map((option) => {
                      const isMultiple = question.type === 'multiple_choice';
                      const isSelected = isMultiple
                        ? Array.isArray(currentAnswer) && currentAnswer.includes(option.id)
                        : currentAnswer === option.id;

                      return (
                        <div
                          key={option.id}
                          className={`option-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleOptionSelect(qId, option.id, isMultiple)}
                        >
                          <div className="option-radio-circle" />
                          <span className="option-text-label">{option.text}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Fill Blank or Typed Answer Questions */}
                {(question.type === 'fill_blank' || question.type === 'typed_answer') && (
                  <div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '0.75rem' }}>
                      <button
                        type="button"
                        onClick={() => handlePlayText(question.questionText)}
                        style={{ padding: '6px 12px', background: 'var(--brand-yellow)', color: 'var(--brand-text)', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                      >
                        🔊 Phát Âm (TTS)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartRecording(qId)}
                        disabled={isRecording}
                        style={{ padding: '6px 12px', background: isRecording ? 'var(--brand-bg-sub)' : 'var(--brand-success)', color: 'var(--brand-surface)', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                      >
                        {isRecording ? '⏹ Đang Ghi Âm...' : '🎤 Nói Để Nhập (STT)'}
                      </button>
                      {isRecording && (
                        <button
                          type="button"
                          onClick={handleStopRecording}
                          style={{ padding: '6px 12px', background: 'var(--brand-danger)', color: 'var(--brand-surface)', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                        >
                          Dừng Ghi Âm
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={currentAnswer || ''}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [qId]: e.target.value }))}
                      placeholder="Nhập câu trả lời của bạn..."
                      style={{ width: '100%', height: '48px', padding: '0 16px', borderRadius: '10px', border: '1px solid var(--brand-border)', fontSize: '1rem' }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Column - Desktop Sticky Question Navigator */}
        <div className="test-navigator-column">
          <div className="nav-grid-title">Danh Sách Câu Hỏi</div>
          <div className="nav-grid-matrix" ref={desktopNavigatorRef}>
            {questions.map((q, idx) => {
              const val = answers[q.questionId];
              const isAnswered = val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0);
              const isCurrent = currentQuestionIndex === idx;
              return (
                <button
                  key={q.questionId || idx}
                  data-question-index={idx}
                  className={`nav-tile ${isAnswered ? 'answered' : 'unanswered'} ${isCurrent ? 'current' : ''}`}
                  onClick={() => {
                    setCurrentQuestionIndex(idx);
                    const el = document.getElementById(`question-${idx}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="btn-submit-exam"
            onClick={() => setShowConfirmModal(true)}
            disabled={submitting}
          >
            {submitting ? 'Đang Nộp Bài...' : 'Nộp Bài Kiểm Tra'}
          </button>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar (<1024px) */}
      <div className="mobile-test-bottom-bar">
        <button
          className="btn-mobile-nav"
          disabled={currentQuestionIndex === 0}
          onClick={() => {
            const nextIdx = Math.max(0, currentQuestionIndex - 1);
            setCurrentQuestionIndex(nextIdx);
            document.getElementById(`question-${nextIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        >
          ← Câu Trước
        </button>

        <button
          className="btn-mobile-sheet-trigger"
          onClick={() => setShowMobileSheet(true)}
        >
          Danh Sách Câu ({answeredCount}/{totalQuestions})
        </button>

        <button
          className="btn-mobile-nav"
          disabled={currentQuestionIndex === totalQuestions - 1}
          onClick={() => {
            const nextIdx = Math.min(totalQuestions - 1, currentQuestionIndex + 1);
            setCurrentQuestionIndex(nextIdx);
            document.getElementById(`question-${nextIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        >
          Câu Tiếp →
        </button>
      </div>

      {/* Mobile Bottom Sheet Drawer */}
      {showMobileSheet && (
        <div className="bottom-sheet-overlay" onClick={() => setShowMobileSheet(false)}>
          <div className="bottom-sheet-content" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.15rem', color: 'var(--brand-text)', margin: 0 }}>Danh Sách Câu Hỏi</h3>
              <button
                onClick={() => setShowMobileSheet(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--brand-muted)', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <div className="nav-grid-matrix" ref={mobileNavigatorRef} style={{ gridTemplateColumns: 'repeat(5, 1fr)', maxHeight: '50vh', overflowY: 'auto' }}>
              {questions.map((q, idx) => {
                const val = answers[q.questionId];
                const isAnswered = val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0);
                const isCurrent = currentQuestionIndex === idx;
                return (
                  <button
                    key={q.questionId || idx}
                    data-question-index={idx}
                    className={`nav-tile ${isAnswered ? 'answered' : 'unanswered'} ${isCurrent ? 'current' : ''}`}
                    onClick={() => {
                      setCurrentQuestionIndex(idx);
                      setShowMobileSheet(false);
                      document.getElementById(`question-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="btn-submit-exam"
              style={{ marginTop: '1rem' }}
              onClick={() => {
                setShowMobileSheet(false);
                setShowConfirmModal(true);
              }}
            >
              Nộp Bài Kiểm Tra
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Submit Modal */}
      {showConfirmModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.25rem', color: 'var(--brand-text)', margin: 0 }}>Xác Nhận Nộp Bài</h3>
              <button onClick={() => setShowConfirmModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--brand-muted)', cursor: 'pointer' }}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--brand-muted)', fontSize: '1rem', lineHeight: '1.6' }}>
                Bạn đã trả lời <strong>{answeredCount} / {totalQuestions}</strong> câu hỏi.
                {answeredCount < totalQuestions && (
                  <span style={{ color: 'var(--brand-danger)', display: 'block', marginTop: '0.5rem' }}>
                    ⚠️ Vẫn còn {totalQuestions - answeredCount} câu chưa trả lời!
                  </span>
                )}
                <br />
                Bạn có chắc chắn muốn nộp bài kiểm tra ngay bây giờ?
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                style={{ padding: '10px 18px', background: 'var(--brand-bg-sub)', color: 'var(--brand-muted)', border: '1px solid var(--brand-border)', borderRadius: '10px', fontWeight: 600 }}
              >
                Làm Tiếp
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="btn-submit-exam"
                style={{ width: 'auto', padding: '10px 24px' }}
              >
                Xác Nhận Nộp Bài
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
