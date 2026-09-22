import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { assessmentApi } from '../api/assessmentApi.js';
import { speakText, stopSpeaking } from '../utils/tts.js';
import { startSpeechRecognition, stopSpeechRecognition, isSpeechRecognitionSupported } from '../utils/speechRecognition.js';
import './TestPage.css';

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

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // STT / TTS states
  const [isRecording, setIsRecording] = useState(false);
  const [recognitionRef, setRecognitionRef] = useState(null);

  // Start or resume assessment attempt
  const initAttempt = useCallback(async () => {
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
      console.error('Failed to start/resume attempt:', err);
      setErrorMsg(err.response?.data?.message || 'Không thể mở bài kiểm tra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => {
    initAttempt();
  }, [initAttempt]);

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
      <div style={{ textAlign: 'center', padding: '4rem', color: '#64748B' }}>
        <p>Đang chuẩn bị bài kiểm tra từ máy chủ...</p>
      </div>
    );
  }

  if (errorMsg || questions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <h3 style={{ color: '#DC2626' }}>{errorMsg || 'Không tìm thấy bài kiểm tra'}</h3>
        <button
          onClick={() => navigate(-1)}
          style={{ marginTop: '1rem', padding: '10px 20px', background: '#0284C7', color: '#FFF', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          Quay Lại
        </button>
      </div>
    );
  }

  // Result View
  if (result) {
    return (
      <div className="test-taking-container" style={{ maxWidth: '850px' }}>
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '2rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)' }}>
          <h2 style={{ fontSize: '1.75rem', color: '#1E293B', marginBottom: '0.5rem', textAlign: 'center' }}>Kết Quả Bài Kiểm Tra</h2>
          <p style={{ textAlign: 'center', color: '#64748B', marginBottom: '1.5rem' }}>{result.assessmentTitle}</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '2rem' }}>
            <div style={{ background: '#DCFCE7', borderRadius: '12px', padding: '1rem', textAlign: 'center', border: '1px solid #86EFAC' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#15803D' }}>{result.percentage}%</div>
              <p style={{ color: '#166534', fontSize: '0.85rem', margin: 0, fontWeight: 600 }}>Điểm: {result.score} / {result.maxScore}</p>
            </div>
            <div style={{ background: '#F0FDF4', borderRadius: '12px', padding: '1rem', textAlign: 'center', border: '1px solid #BBF7D0' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16A34A' }}>{result.correctCount}</div>
              <p style={{ color: '#15803D', fontSize: '0.85rem', margin: 0 }}>Câu Đúng</p>
            </div>
            <div style={{ background: '#FEF2F2', borderRadius: '12px', padding: '1rem', textAlign: 'center', border: '1px solid #FCA5A5' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#DC2626' }}>{result.incorrectCount}</div>
              <p style={{ color: '#991B1B', fontSize: '0.85rem', margin: 0 }}>Câu Sai</p>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '1rem', textAlign: 'center', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#64748B' }}>{result.unansweredCount}</div>
              <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0 }}>Bỏ Trống</p>
            </div>
          </div>

          <h3 style={{ fontSize: '1.2rem', color: '#1E293B', marginBottom: '1rem' }}>Chi Tiết Từng Câu Hỏi:</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {result.questions?.map((q, idx) => (
              <div
                key={q.questionId || idx}
                style={{
                  padding: '1.25rem',
                  borderRadius: '12px',
                  border: `1px solid ${q.isCorrect ? '#86EFAC' : '#FCA5A5'}`,
                  background: q.isCorrect ? '#F0FDF4' : '#FEF2F2',
                }}
              >
                <div style={{ fontWeight: 600, color: '#1E293B', marginBottom: '0.5rem' }}>
                  Câu {idx + 1}: {q.questionText}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '0.25rem' }}>
                  <strong>Trả lời của bạn:</strong> {Array.isArray(q.studentAnswer) ? q.studentAnswer.join(', ') : (q.studentAnswer || '(Bỏ trống)')}
                </div>
                {result.showCorrectAnswers && q.correctAnswers && (
                  <div style={{ fontSize: '0.9rem', color: '#166534', marginBottom: '0.25rem' }}>
                    <strong>Đáp án đúng:</strong> {q.correctAnswers.join(', ')}
                  </div>
                )}
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: q.isCorrect ? '#16A34A' : '#DC2626' }}>
                  {q.isCorrect ? '✓ Đúng' : '✕ Sai'} (+{q.isCorrect ? q.score : 0} điểm)
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate('/student/dashboard')}
            className="btn-submit-exam"
            style={{ marginTop: '2rem' }}
          >
            Quay Về Trang Học Viên
          </button>
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
    <div className="test-taking-container">
      {/* Sticky Header with Server-based Timer & Progress */}
      <div className="test-sticky-header">
        <div className="test-title-box">
          <h2>Bài Kiểm Tra</h2>
          <p>Đã làm {answeredCount}/{totalQuestions} câu</p>
        </div>
        <div className="test-timer-badge" style={{ background: timeLeftSeconds < 180 ? '#FEE2E2' : '#EFF6FF', color: timeLeftSeconds < 180 ? '#DC2626' : '#1D4ED8' }}>
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
              <div key={qId || index} id={`question-${index}`} className="question-card">
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
                        style={{ padding: '6px 12px', background: '#0284C7', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                      >
                        🔊 Phát Âm (TTS)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartRecording(qId)}
                        disabled={isRecording}
                        style={{ padding: '6px 12px', background: isRecording ? '#94A3B8' : '#22C55E', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                      >
                        {isRecording ? '⏹ Đang Ghi Âm...' : '🎤 Nói Để Nhập (STT)'}
                      </button>
                      {isRecording && (
                        <button
                          type="button"
                          onClick={handleStopRecording}
                          style={{ padding: '6px 12px', background: '#EF4444', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
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
                      style={{ width: '100%', height: '48px', padding: '0 16px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '1rem' }}
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
          <div className="nav-grid-matrix">
            {questions.map((q, idx) => {
              const val = answers[q.questionId];
              const isAnswered = val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0);
              const isCurrent = currentQuestionIndex === idx;
              return (
                <button
                  key={q.questionId || idx}
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
              <h3 style={{ fontSize: '1.15rem', color: '#1E293B', margin: 0 }}>Danh Sách Câu Hỏi</h3>
              <button
                onClick={() => setShowMobileSheet(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#64748B', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <div className="nav-grid-matrix" style={{ gridTemplateColumns: 'repeat(5, 1fr)', maxHeight: '50vh', overflowY: 'auto' }}>
              {questions.map((q, idx) => {
                const val = answers[q.questionId];
                const isAnswered = val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0);
                const isCurrent = currentQuestionIndex === idx;
                return (
                  <button
                    key={q.questionId || idx}
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
              <h3 style={{ fontSize: '1.25rem', color: '#1E293B', margin: 0 }}>Xác Nhận Nộp Bài</h3>
              <button onClick={() => setShowConfirmModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#64748B', cursor: 'pointer' }}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#475569', fontSize: '1rem', lineHeight: '1.6' }}>
                Bạn đã trả lời <strong>{answeredCount} / {totalQuestions}</strong> câu hỏi.
                {answeredCount < totalQuestions && (
                  <span style={{ color: '#DC2626', display: 'block', marginTop: '0.5rem' }}>
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
                style={{ padding: '10px 18px', background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', borderRadius: '10px', fontWeight: 600 }}
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
  );
}
