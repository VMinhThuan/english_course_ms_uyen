import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { assessmentApi } from '../api/assessmentApi.js';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import UiButton from '../components/ui/UiButton.jsx';
import AssessmentQuestionReviewCard from '../components/assessment/AssessmentQuestionReviewCard.jsx';
import useAssessmentAttemptTabLock from '../hooks/useAssessmentAttemptTabLock.js';
import { speakText, stopSpeaking } from '../utils/tts.js';
import { startSpeechRecognition, stopSpeechRecognition, isSpeechRecognitionSupported } from '../utils/speechRecognition.js';
import { acquireDocumentScrollLock } from '../utils/documentScrollLock.js';
import './TestPage.css';
import '../styles/assessment-screens.css';

function formatAttemptDuration(value) {
  const durationSeconds = Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${minutes} phút ${seconds} giây`;
}

const AUTO_SUBMIT_RETRY_BASE_MS = 1000;
const AUTO_SUBMIT_RETRY_MAX_MS = 15000;

export default function TestPage() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const skipResumePromptRef = useRef(location.state?.skipResumePrompt === true);

  const [attemptId, setAttemptId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [deadlineAt, setDeadlineAt] = useState(null);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [saveState, setSaveState] = useState('');
  const [revisionConflict, setRevisionConflict] = useState(false);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const [questionNavigationFilter, setQuestionNavigationFilter] = useState('unanswered');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showLeaveAttemptNotice, setShowLeaveAttemptNotice] = useState(false);
  const desktopNavigatorRef = useRef(null);
  const mobileNavigatorRef = useRef(null);
  const mobileSheetTriggerRef = useRef(null);

  // STT / TTS states
  const [isRecording, setIsRecording] = useState(false);
  const [recognitionRef, setRecognitionRef] = useState(null);
  const hasStartedAttempt = useRef(false);
  const autosaveVersion = useRef(0);
  const revisionRef = useRef(1);
  const serverClockOffsetRef = useRef(0);
  const saveQueueRef = useRef(Promise.resolve());
  const autoSubmitStartedRef = useRef(false);
  const submissionInFlightRef = useRef(false);
  const autoSubmitRetryCountRef = useRef(0);
  const autoSubmitRetryTimerRef = useRef(null);
  const submitHandlerRef = useRef(null);
  const answersDirtyRef = useRef(false);
  const { isDuplicateTab, takeOverAttempt } = useAssessmentAttemptTabLock(attemptId, Boolean(attemptId && !result));

  useEffect(() => () => {
    if (autoSubmitRetryTimerRef.current) window.clearTimeout(autoSubmitRetryTimerRef.current);
  }, []);

  // Start or resume assessment attempt
  const initAttempt = useCallback(async () => {
    if (hasStartedAttempt.current) return;
    hasStartedAttempt.current = true;
    setLoading(true);
    setErrorMsg('');
    setErrorCode('');
    setRevisionConflict(false);
    try {
      const res = await assessmentApi.startAttempt(testId);
      if (res.data) {
        setShowResumeModal(res.message === 'Resumed existing active attempt' && !skipResumePromptRef.current);
        skipResumePromptRef.current = false;
        setAttemptId(res.data.attemptId);
        setQuestions(res.data.questions || []);
        setDeadlineAt(res.data.deadlineAt);
        revisionRef.current = res.data.revision || 1;
        if (res.data.serverTime) serverClockOffsetRef.current = new Date(res.data.serverTime).getTime() - Date.now();
        if (res.data.answers) {
          setAnswers(res.data.answers);
        }
        answersDirtyRef.current = false;
      }
    } catch (err) {
      hasStartedAttempt.current = false;
      console.error('Failed to start/resume attempt:', err);
      setErrorMsg(err.response?.data?.message || 'Không thể mở bài kiểm tra. Vui lòng thử lại.');
      setErrorCode(err.response?.data?.code || '');
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => {
    initAttempt();
  }, [initAttempt]);

  useEffect(() => {
    if (!skipResumePromptRef.current) return;
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, navigate]);

  // Persist answers with a short debounce. The backend merges the answer map,
  // so a refresh resumes the same server-owned attempt and deadline.
  useEffect(() => {
    if (!attemptId || loading || result || revisionConflict || submitting || isDuplicateTab || autoSubmitStartedRef.current || !answersDirtyRef.current) return undefined;
    const version = ++autosaveVersion.current;
    setSaveState('saving');
    const timer = setTimeout(async () => {
      try {
        const savePromise = saveQueueRef.current.catch(() => undefined).then(() =>
          assessmentApi.autosaveAttemptAnswers(attemptId, { answers, revision: revisionRef.current })
        );
        saveQueueRef.current = savePromise;
        const response = await savePromise;
        revisionRef.current = response.data.revision;
        if (version === autosaveVersion.current) {
          answersDirtyRef.current = false;
          setSaveState('saved');
        }
      } catch (error) {
        if (error.response?.status === 409 || error.response?.status === 428) {
          setRevisionConflict(true);
          setSaveState('conflict');
        } else if (version === autosaveVersion.current) setSaveState('error');
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [answers, attemptId, isDuplicateTab, loading, result, revisionConflict, submitting]);

  // Server-based Timer Countdown Display
  useEffect(() => {
    if (!deadlineAt || result || isDuplicateTab) return;

    const interval = setInterval(() => {
      const remainingMs = new Date(deadlineAt).getTime() - (Date.now() + serverClockOffsetRef.current);
      const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
      setTimeLeftSeconds(seconds);

      if (seconds <= 0) {
        clearInterval(interval);
        if (!autoSubmitStartedRef.current) submitHandlerRef.current?.(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [deadlineAt, isDuplicateTab, result]);

  // Lock background scroll while a modal or the mobile question sheet is open.
  useEffect(() => {
    if (!(showMobileSheet || showConfirmModal || showResumeModal || showLeaveAttemptNotice || isDuplicateTab)) return undefined;
    return acquireDocumentScrollLock();
  }, [showMobileSheet, showConfirmModal, showResumeModal, showLeaveAttemptNotice, isDuplicateTab]);

  // Keep focus in the mobile question sheet and return it to the trigger on close.
  useEffect(() => {
    if (!showMobileSheet) return undefined;

    const closeButton = document.querySelector('.bottom-sheet-close');
    closeButton?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowMobileSheet(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      mobileSheetTriggerRef.current?.focus();
    };
  }, [showMobileSheet]);

  // Warn before a browser-level navigation closes or reloads an active attempt.
  useEffect(() => {
    if (!attemptId || result) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [attemptId, result]);

  // Keep the student on the active test when browser back/forward is used.
  useEffect(() => {
    if (!attemptId || result) return undefined;

    const attemptUrl = window.location.pathname + window.location.search + window.location.hash;
    window.history.pushState({ ...(window.history.state || {}), activeAttemptGuard: true }, '', attemptUrl);

    const handlePopState = (event) => {
      event.stopImmediatePropagation();
      window.history.pushState({ ...(window.history.state || {}), activeAttemptGuard: true }, '', attemptUrl);
      setShowLeaveAttemptNotice(true);
    };

    window.addEventListener('popstate', handlePopState, true);
    return () => window.removeEventListener('popstate', handlePopState, true);
  }, [attemptId, result]);

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
      if (timeLeftSeconds === 0 || revisionConflict || submitting || isDuplicateTab) return;
      const transcript = event.results[0][0].transcript;
      answersDirtyRef.current = true;
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
    if (timeLeftSeconds === 0 || revisionConflict || submitting || isDuplicateTab) return;
    if (isMultiple) {
      const currentArr = Array.isArray(answers[qId]) ? answers[qId] : [];
      let updated;
      if (currentArr.includes(optionId)) {
        updated = currentArr.filter((id) => id !== optionId);
      } else {
        updated = [...currentArr, optionId];
      }
      answersDirtyRef.current = true;
      setAnswers((prev) => ({ ...prev, [qId]: updated }));
    } else {
      answersDirtyRef.current = true;
      setAnswers((prev) => ({ ...prev, [qId]: optionId }));
    }
  };

  const scheduleAutomaticSubmitRetry = () => {
    if (autoSubmitRetryTimerRef.current || result) return;
    const exponent = Math.min(autoSubmitRetryCountRef.current, 4);
    const retryDelay = Math.min(AUTO_SUBMIT_RETRY_MAX_MS, AUTO_SUBMIT_RETRY_BASE_MS * (2 ** exponent));
    autoSubmitRetryCountRef.current += 1;
    setSaveState('auto-submit-retrying');
    autoSubmitRetryTimerRef.current = window.setTimeout(() => {
      autoSubmitRetryTimerRef.current = null;
      submitHandlerRef.current?.(true);
    }, retryDelay);
  };

  const handleSubmit = async (automatic = false) => {
    if (!attemptId || isDuplicateTab || result || submissionInFlightRef.current) return;
    if (automatic) autoSubmitStartedRef.current = true;
    if (autoSubmitRetryTimerRef.current) {
      window.clearTimeout(autoSubmitRetryTimerRef.current);
      autoSubmitRetryTimerRef.current = null;
    }
    submissionInFlightRef.current = true;
    setShowConfirmModal(false);
    setSubmitting(true);
    try {
      // Finish any queued autosave first so the submit uses the newest server revision.
      await saveQueueRef.current.catch(() => undefined);
      const response = await assessmentApi.submitAttempt(attemptId, answers, revisionRef.current);
      if (response.status !== 'success') throw new Error('Attempt submission did not succeed.');

      const resultRes = await assessmentApi.getAttemptResult(attemptId);
      setResult(resultRes.data.result);
      setSaveState('');
      autoSubmitRetryCountRef.current = 0;
    } catch (error) {
      const autoSubmitStillNeeded = automatic || autoSubmitStartedRef.current;
      const serverRevision = Number(error.response?.data?.serverRevision);
      if (Number.isInteger(serverRevision) && serverRevision > 0) revisionRef.current = serverRevision;

      if (autoSubmitStillNeeded) {
        try {
          // The submit may have reached the server even if its response was lost.
          const resultRes = await assessmentApi.getAttemptResult(attemptId);
          if (resultRes.data?.result) {
            setResult(resultRes.data.result);
            setSaveState('');
            autoSubmitRetryCountRef.current = 0;
            return;
          }
        } catch {}

        const status = error.response?.status;
        const errorCode = error.response?.data?.code;
        const retryableConflict = status === 409 && ['ATTEMPT_FINALIZING', 'STALE_REVISION'].includes(errorCode);
        const shouldRetry = !error.response
          || status === 408
          || status === 429
          || status >= 500
          || retryableConflict;

        if (shouldRetry) {
          console.warn('Automatic assessment submission failed; retrying after connectivity recovers.', error);
          scheduleAutomaticSubmitRetry();
          return;
        }
      }

      if (error.response?.status === 409 || error.response?.status === 428) {
        setRevisionConflict(true);
        setSaveState('conflict');
      } else if (autoSubmitStillNeeded) {
        console.error('Automatic assessment submission could not be completed:', error);
        setSaveState('error');
      } else {
        console.error('Error submitting assessment:', error);
        alert(error.response?.data?.message || 'Nộp bài thất bại.');
      }
    } finally {
      submissionInFlightRef.current = false;
      setSubmitting(false);
    }
  };
  submitHandlerRef.current = handleSubmit;

  const reloadAttemptState = async () => {
    try {
      setLoading(true);
      const response = await assessmentApi.startAttempt(testId);
      if (response.data) {
        setAttemptId(response.data.attemptId);
        setQuestions(response.data.questions || []);
        setDeadlineAt(response.data.deadlineAt);
        setAnswers(response.data.answers || {});
        answersDirtyRef.current = false;
        revisionRef.current = response.data.revision || 1;
        if (response.data.serverTime) serverClockOffsetRef.current = new Date(response.data.serverTime).getTime() - Date.now();
        setRevisionConflict(false);
        setSaveState('saved');
      if (autoSubmitRetryTimerRef.current) window.clearTimeout(autoSubmitRetryTimerRef.current);
      autoSubmitRetryTimerRef.current = null;
      submissionInFlightRef.current = false;
      autoSubmitRetryCountRef.current = 0;
        autoSubmitStartedRef.current = false;
      }
    } catch (error) {
      setErrorMsg(error.response?.data?.message || 'Không thể tải lại bài làm.');
    } finally {
      setLoading(false);
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
        {errorCode === 'ATTEMPT_LIMIT_REACHED' ? (
          <>
            <h3>Đã hết lượt làm bài</h3>
            <p>Bạn đã sử dụng hết số lượt làm bài kiểm tra này.</p>
            <button onClick={() => navigate('/student/assessments')} className="ds-button ds-button--primary test-screen__retry-button">Quay về danh sách bài kiểm tra</button>
          </>
        ) : (
          <>
            <h3>{errorMsg || 'Không tìm thấy bài kiểm tra'}</h3>
            <button onClick={() => navigate(-1)} className="ds-button ds-button--primary test-screen__retry-button">Quay Lại</button>
          </>
        )}
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
            <div style={{ background: 'var(--brand-bg-sub)', borderRadius: '12px', padding: '1rem', textAlign: 'center', border: '1px solid var(--brand-border)' }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--brand-muted)' }}>{formatAttemptDuration(result.duration)}</div>
              <p style={{ color: 'var(--brand-muted)', fontSize: '0.85rem', margin: 0 }}>Thời gian làm bài</p>
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
  const unansweredQuestionNumbers = questions.reduce((numbers, question, index) => {
    const answer = answers[question.questionId];
    const answered = answer !== undefined && answer !== null && answer !== '' && !(Array.isArray(answer) && answer.length === 0);
    if (!answered) numbers.push(index + 1);
    return numbers;
  }, []);
  const answeredCount = totalQuestions - unansweredQuestionNumbers.length;
  const completionPercentage = totalQuestions ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  return (
    <div className="test-screen test-screen--active">
    <div className="test-taking-container">
      {/* Sticky Header with Server-based Timer & Progress */}
      <div className="test-sticky-header">
        <div className="test-title-box">
          <h2>Bài Kiểm Tra</h2>
          <p>Đã làm {answeredCount}/{totalQuestions} câu ({completionPercentage}%) {saveState === 'auto-submit-retrying' ? '· Mất kết nối, đang thử nộp lại...' : saveState === 'saving' ? '· Đang lưu...' : saveState === 'saved' ? '· Đã lưu' : saveState === 'conflict' ? '· Có cập nhật từ phiên khác' : saveState === 'error' ? '· Chưa thể lưu hoặc nộp bài' : ''}</p>
          <div
            className="test-progress"
            role="progressbar"
            aria-label="Tiến độ làm bài"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completionPercentage}
          >
            <div className="test-progress__fill" style={{ width: `${completionPercentage}%` }} />
          </div>
        </div>
        <div className="test-timer-badge" style={{ background: timeLeftSeconds < 180 ? 'var(--brand-danger-bg)' : 'var(--brand-yellow-soft)', color: timeLeftSeconds < 180 ? 'var(--brand-danger)' : 'var(--brand-coffee)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>{formatTime(timeLeftSeconds)}</span>
        </div>
      </div>

      {revisionConflict && (
        <div className="attempt-conflict-banner" role="alert">
          <div><strong>Bài làm đã thay đổi ở một tab khác.</strong><span> Hệ thống đã chặn việc ghi đè để giữ đáp án mới nhất.</span></div>
          <button type="button" onClick={reloadAttemptState} disabled={loading}>Tải bản mới nhất</button>
        </div>
      )}

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
                  <fieldset className="options-list" aria-label={`Câu ${index + 1}, ${question.type === 'multiple_choice' ? 'chọn nhiều đáp án' : 'chọn một đáp án'}`} disabled={timeLeftSeconds === 0 || revisionConflict || isDuplicateTab}>
                    <legend className="visually-hidden">{question.type === 'multiple_choice' ? 'Chọn tất cả đáp án đúng' : 'Chọn một đáp án'}</legend>
                    {question.options.map((option) => {
                      const isMultiple = question.type === 'multiple_choice';
                      const isSelected = isMultiple
                        ? Array.isArray(currentAnswer) && currentAnswer.includes(option.id)
                        : currentAnswer === option.id;

                      return (
                        <label
                          key={option.id}
                          className={`option-card ${isSelected ? 'selected' : ''}`}
                        >
                          <input
                            type={isMultiple ? 'checkbox' : 'radio'}
                            name={`question-${qId}`}
                            checked={isSelected}
                            onChange={() => handleOptionSelect(qId, option.id, isMultiple)}
                            disabled={timeLeftSeconds === 0 || revisionConflict || isDuplicateTab}
                          />
                          <span className={`option-radio-circle${isMultiple ? ' option-check-square' : ''}`} aria-hidden="true" />
                          <span className="option-text-label">{option.text}</span>
                        </label>
                      );
                    })}
                  </fieldset>
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
                        disabled={isRecording || isDuplicateTab}
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
                      onChange={(e) => { if (timeLeftSeconds !== 0 && !revisionConflict && !isDuplicateTab) { answersDirtyRef.current = true; setAnswers((prev) => ({ ...prev, [qId]: e.target.value })); } }}
                      disabled={timeLeftSeconds === 0 || revisionConflict || isDuplicateTab}
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
            disabled={submitting || revisionConflict || isDuplicateTab}
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
          ref={mobileSheetTriggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={showMobileSheet}
          onClick={() => {
            setQuestionNavigationFilter('unanswered');
            setShowMobileSheet(true);
          }}
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
          <div className="bottom-sheet-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Danh sách câu hỏi">
            <div className="bottom-sheet-handle" />
            <div className="question-sheet-header">
              <div>
                <h3>Danh Sách Câu Hỏi</h3>
                <p className="question-sheet-legend">Câu chưa làm được đánh dấu nền sáng; câu đã làm có nền xanh.</p>
              </div>
              <button
                type="button"
                className="bottom-sheet-close"
                aria-label="Đóng danh sách câu hỏi"
                onClick={() => setShowMobileSheet(false)}
              >
                ×
              </button>
            </div>

            <div className="question-sheet-filters" role="group" aria-label="Lọc danh sách câu hỏi">
              <button
                type="button"
                className={questionNavigationFilter === 'unanswered' ? 'active' : ''}
                aria-pressed={questionNavigationFilter === 'unanswered'}
                onClick={() => setQuestionNavigationFilter('unanswered')}
              >
                Chưa làm ({unansweredQuestionNumbers.length})
              </button>
              <button
                type="button"
                className={questionNavigationFilter === 'all' ? 'active' : ''}
                aria-pressed={questionNavigationFilter === 'all'}
                onClick={() => setQuestionNavigationFilter('all')}
              >
                Tất cả ({totalQuestions})
              </button>
            </div>

            <div className="nav-grid-matrix" ref={mobileNavigatorRef} style={{ gridTemplateColumns: 'repeat(5, 1fr)', maxHeight: '50vh', overflowY: 'auto' }}>
              {questions.map((q, idx) => {
                const val = answers[q.questionId];
                const isAnswered = val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0);
                if (questionNavigationFilter === 'unanswered' && isAnswered) return null;
                const isCurrent = currentQuestionIndex === idx;
                return (
                  <button
                    key={q.questionId || idx}
                    data-question-index={idx}
                    className={`nav-tile ${isAnswered ? 'answered' : 'unanswered'} ${isCurrent ? 'current' : ''}`}
                    onClick={() => {
                      setCurrentQuestionIndex(idx);
                      setShowMobileSheet(false);
                      window.requestAnimationFrame(() => document.getElementById('question-' + idx)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
                    }}
                  >
                    {idx + 1}
                  </button>
                );
              })}
              {questionNavigationFilter === 'unanswered' && unansweredQuestionNumbers.length === 0 && (
                <p className="question-sheet-empty">Bạn đã trả lời tất cả câu hỏi.</p>
              )}
            </div>

            <button
              type="button"
              className="btn-submit-exam question-sheet-submit"
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
                    ⚠️ Câu chưa trả lời: {unansweredQuestionNumbers.join(', ')}
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
                onClick={() => handleSubmit(false)}
                disabled={submitting || revisionConflict}
                className="btn-submit-exam"
                style={{ width: 'auto', padding: '10px 24px' }}
              >
                Xác Nhận Nộp Bài
              </button>
            </div>
          </div>
        </div>
      )}

      {showResumeModal && !isDuplicateTab && (
        <div className="attempt-guard-overlay">
          <section className="attempt-guard-dialog" role="alertdialog" aria-modal="true" aria-labelledby="resume-attempt-title">
            <span className="attempt-guard-icon" aria-hidden="true">↻</span>
            <h2 id="resume-attempt-title">Bạn đang có bài kiểm tra chưa hoàn thành</h2>
            <p>Tiến độ và thời gian làm bài đã được lưu. Tiếp tục bài kiểm tra đang làm dở của bạn.</p>
            <button type="button" className="attempt-guard-primary" autoFocus onClick={() => setShowResumeModal(false)}>
              Tiếp tục làm bài
            </button>
          </section>
        </div>
      )}

      {showLeaveAttemptNotice && !isDuplicateTab && (
        <div className="attempt-guard-overlay">
          <section className="attempt-guard-dialog" role="alertdialog" aria-modal="true" aria-labelledby="leave-attempt-title">
            <span className="attempt-guard-icon" aria-hidden="true">!</span>
            <h2 id="leave-attempt-title">Bài kiểm tra vẫn đang diễn ra</h2>
            <p>Hãy ở lại trang này để tiếp tục làm bài. Nếu đóng trang, câu trả lời đã lưu sẽ được khôi phục khi bạn mở lại bài kiểm tra.</p>
            <button type="button" className="attempt-guard-primary" autoFocus onClick={() => setShowLeaveAttemptNotice(false)}>
              Ở lại bài kiểm tra
            </button>
          </section>
        </div>
      )}

      {isDuplicateTab && (
        <div className="attempt-guard-overlay attempt-guard-overlay--duplicate">
          <section className="attempt-guard-dialog" role="alertdialog" aria-modal="true" aria-labelledby="duplicate-attempt-title">
            <span className="attempt-guard-icon" aria-hidden="true">↗</span>
            <h2 id="duplicate-attempt-title">Bài kiểm tra đang mở ở tab khác</h2>
            <p>Để tránh hai phiên cùng ghi câu trả lời, thao tác ở tab này đang tạm khóa. Bạn có thể chuyển bài kiểm tra sang tab hiện tại.</p>
            <button
              type="button"
              className="attempt-guard-primary"
              autoFocus
              onClick={() => {
                if (takeOverAttempt()) setShowResumeModal(true);
              }}
            >
              Tiếp tục trên tab này
            </button>
            <button type="button" className="attempt-guard-secondary" onClick={() => navigate('/student/assessments')}>
              Quay về danh sách
            </button>
          </section>
        </div>
      )}
    </div>
    </div>
  );
}
