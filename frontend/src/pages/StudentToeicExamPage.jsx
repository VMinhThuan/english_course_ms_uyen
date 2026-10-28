import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toeicApi } from '../api/toeicApi.js';
import ToeicImageWithBrandOverlay from '../components/ToeicImageWithBrandOverlay.jsx';
import { resolveMediaUrl } from '../utils/mediaUrl.js';
import '../styles/assessment-screens.css';

const attemptNavigationKey = (attemptId) => `toeic-attempt-navigation:${attemptId}`;

const readAttemptNavigation = (attemptId) => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(attemptNavigationKey(attemptId)) || 'null');
    return Number.isInteger(saved?.partNumber) && saved.partNumber >= 1 && saved.partNumber <= 7 ? saved : null;
  } catch {
    return null;
  }
};

export default function StudentToeicExamPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Answering & Autosave state
  const [userAnswers, setUserAnswers] = useState({}); // questionId -> [selectedOptionId]
  const [flaggedIds, setFlaggedIds] = useState([]);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saving' | 'saved' | 'error' | 'offline'

  // Timer state
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  // Navigation & UI state
  const [activePartNumber, setActivePartNumber] = useState(() => readAttemptNavigation(attemptId)?.partNumber || 1);
  const [activeQuestionId, setActiveQuestionId] = useState(() => readAttemptNavigation(attemptId)?.questionId || null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [expandedPassageImage, setExpandedPassageImage] = useState(null);
  const [navFilter, setNavFilter] = useState('ALL'); // 'ALL' | 'UNANSWERED' | 'ANSWERED' | 'FLAGGED'
  const [audioSequenceStarted, setAudioSequenceStarted] = useState(false);

  const autosaveTimerRef = useRef(null);
  const autosaveVersionRef = useRef(0);
  const revisionRef = useRef(1);
  const serverClockOffsetRef = useRef(0);
  const autosaveQueueRef = useRef(Promise.resolve());
  const autoSubmitStartedRef = useRef(false);
  const autoSubmitHandlerRef = useRef(null);
  const activeQuestionIdRef = useRef(activeQuestionId);

  useEffect(() => {
    const savedNavigation = readAttemptNavigation(attemptId);
    setActivePartNumber(savedNavigation?.partNumber || 1);
    setActiveQuestionId(savedNavigation?.questionId || null);
    loadAttempt();
  }, [attemptId]);

  useEffect(() => {
    activeQuestionIdRef.current = activeQuestionId;
  }, [activeQuestionId]);

  // Answers live on the server; this only restores the learner's place after
  // a refresh or a short connection interruption.
  useEffect(() => {
    if (String(attempt?._id || '') !== String(attemptId)) return;
    try {
      window.localStorage.setItem(attemptNavigationKey(attemptId), JSON.stringify({
        partNumber: activePartNumber,
        questionId: activeQuestionId,
      }));
    } catch {
      // Storage can be unavailable in private browsing. The exam still works.
    }
  }, [attemptId, activePartNumber, activeQuestionId]);

  // Load Attempt Data
  const loadAttempt = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await toeicApi.getToeicAttempt(attemptId);
      if (res.status === 'success') {
        const att = res.data.attempt;
        if (['submitted', 'completed'].includes(att.status)) {
          navigate(`/student/toeic/results/${attemptId}`, { replace: true });
          return;
        }
        setAttempt(att);
        setAssessment(res.data.assessment || att.assessment);
        setRevisionState(att.revision || 1);
        setRevisionConflict(false);
        setIsExpired(false);
        if (res.data.serverTime) serverClockOffsetRef.current = new Date(res.data.serverTime).getTime() - Date.now();
        setFlaggedIds(att.flaggedQuestionIds || []);

        // Restore user answers map
        const ansMap = {};
        if (att.answersMap && typeof att.answersMap === 'object') {
          Object.assign(ansMap, att.answersMap);
        } else if (att.answers && Array.isArray(att.answers)) {
          att.answers.forEach((ans) => {
            if (ans.questionId) {
              const qId = typeof ans.questionId === 'object' ? (ans.questionId.questionId || ans.questionId._id) : ans.questionId;
              ansMap[qId] = ans.selectedOptionIds || [];
            }
          });
        }
        setUserAnswers(ansMap);

        // Server-authoritative timer setup
        const deadline = new Date(att.deadlineAt).getTime();
        const now = Date.now() + serverClockOffsetRef.current;
        const diff = Math.max(0, Math.ceil((deadline - now) / 1000));
        setRemainingSeconds(diff);
        if (diff <= 0) {
          setIsExpired(true);
          window.setTimeout(() => autoSubmitHandlerRef.current?.(), 0);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải thông tin bài thi');
    } finally {
      setLoading(false);
    }
  };

  const setRevisionState = (rev) => {
    revisionRef.current = rev;
  };

  // Timer Countdown Effect
  useEffect(() => {
    if (!attempt || isExpired) return;

    const timer = setInterval(() => {
      const deadline = new Date(attempt.deadlineAt).getTime();
      const now = Date.now() + serverClockOffsetRef.current;
      const diff = Math.max(0, Math.ceil((deadline - now) / 1000));

      setRemainingSeconds(diff);

      if (diff <= 0) {
        setIsExpired(true);
        clearInterval(timer);
        autoSubmitHandlerRef.current?.();
      }
    }, 500);

    return () => clearInterval(timer);
  }, [attempt, isExpired]);

  // Debounced Autosave Effect
  const triggerAutosave = (newAnswers, newFlags) => {
    const version = ++autosaveVersionRef.current;
    setSaveStatus('saving');
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(async () => {
      try {
        const payloadAnswers = Object.entries(newAnswers).map(([qId, options]) => ({
          questionId: qId,
          selectedOptionIds: options,
        }));

        const pendingSave = autosaveQueueRef.current.catch(() => undefined).then(() =>
          toeicApi.autosaveToeicAnswers(attemptId, {
            answers: payloadAnswers,
            flaggedQuestionIds: newFlags,
            revision: revisionRef.current,
          })
        );
        autosaveQueueRef.current = pendingSave;
        const res = await pendingSave;
        revisionRef.current = res.data.revision;
        if (version === autosaveVersionRef.current) setSaveStatus('saved');
      } catch (err) {
        if (err.response?.status === 409 || err.response?.status === 428) {
          setRevisionConflict(true);
          if (version === autosaveVersionRef.current) setSaveStatus('error');
        } else {
          if (version === autosaveVersionRef.current) setSaveStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error');
        }
      }
    }, 600);
  };

  const handleSelectOption = (questionId, optionId, isMultiple = false) => {
    if (isExpired || submitting || revisionConflict) return;
    const selected = Array.isArray(userAnswers[questionId]) ? userAnswers[questionId] : [];
    const nextSelected = isMultiple
      ? (selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId])
      : [optionId];
    const updated = { ...userAnswers, [questionId]: nextSelected };
    setActiveQuestionId(questionId);
    setUserAnswers(updated);
    triggerAutosave(updated, flaggedIds);
  };

  const handleToggleFlag = (questionId) => {
    if (isExpired || submitting || revisionConflict) return;
    let updatedFlags = [];
    if (flaggedIds.includes(questionId)) {
      updatedFlags = flaggedIds.filter((id) => id !== questionId);
    } else {
      updatedFlags = [...flaggedIds, questionId];
    }
    setFlaggedIds(updatedFlags);
    triggerAutosave(userAnswers, updatedFlags);
  };

  useEffect(() => {
    const retryWhenOnline = () => {
      if (attempt && !revisionConflict && !isExpired && saveStatus !== 'saved') {
        triggerAutosave(userAnswers, flaggedIds);
      }
    };
    window.addEventListener('online', retryWhenOnline);
    return () => window.removeEventListener('online', retryWhenOnline);
  }, [attempt, flaggedIds, isExpired, revisionConflict, saveStatus, userAnswers]);

  const handleAutoSubmitOnExpire = async () => {
    if (autoSubmitStartedRef.current || !attemptId) return;
    autoSubmitStartedRef.current = true;
    try {
      setSubmitting(true);
      // Ensure the last debounced answer write reaches the server before an
      // expired attempt is finalized. The backend intentionally ignores a
      // late client answer payload and scores the persisted answer map.
      await autosaveQueueRef.current.catch(() => undefined);
      const res = await toeicApi.submitToeicAttempt(attemptId, userAnswers, revisionRef.current);
      if (res.status === 'success') {
        try { window.localStorage.removeItem(attemptNavigationKey(attemptId)); } catch {}
        navigate(`/student/toeic/results/${attemptId}`);
      }
    } catch (err) {
      try {
        const current = await toeicApi.getToeicAttempt(attemptId);
        if (['submitted', 'completed'].includes(current.data?.attempt?.status)) {
          navigate(`/student/toeic/results/${attemptId}`);
          return;
        }
      } catch {}
      setRevisionConflict(true);
      setSaveStatus('error');
    } finally {
      setSubmitting(false);
    }
  };
  autoSubmitHandlerRef.current = handleAutoSubmitOnExpire;

  const handleSubmitAttempt = async () => {
    try {
      setSubmitting(true);
      await autosaveQueueRef.current.catch(() => undefined);
      const res = await toeicApi.submitToeicAttempt(attemptId, userAnswers, revisionRef.current);
      if (res.status === 'success') {
        navigate(`/student/toeic/results/${attemptId}`);
      }
    } catch (err) {
      if (err.response?.data?.code === 'ATTEMPT_FINALIZED') {
        navigate(`/student/toeic/results/${attemptId}`);
      } else if (err.response?.status === 409 || err.response?.status === 428) {
        setRevisionConflict(true);
        setSaveStatus('error');
      } else {
        alert(err.response?.data?.message || 'Nộp bài thất bại. Vui lòng thử lại.');
      }
    } finally {
      setSubmitting(false);
      setShowSubmitModal(false);
    }
  };

  // Build Parts and Groups structure safely
  const parts = useMemo(() => {
    if (!attempt) return [];

    const defaultPartDefs = [
      { partNumber: 1, name: 'Part 1: Photographs', section: 'listening', instructions: 'For each question, select the statement that best describes what you see in the picture.' },
      { partNumber: 2, name: 'Part 2: Question-Response', section: 'listening', instructions: 'You will hear a question or statement and three responses. Select the best response.' },
      { partNumber: 3, name: 'Part 3: Conversations', section: 'listening', instructions: 'You will hear some conversations between two or more people. Answer three questions about what the speakers say.' },
      { partNumber: 4, name: 'Part 4: Talks', section: 'listening', instructions: 'You will hear some talks given by a single speaker. Answer three questions about what the speaker says.' },
      { partNumber: 5, name: 'Part 5: Incomplete Sentences', section: 'reading', instructions: 'Select the best answer to complete each sentence.' },
      { partNumber: 6, name: 'Part 6: Text Completion', section: 'reading', instructions: 'Select the best answer to complete each text.' },
      { partNumber: 7, name: 'Part 7: Reading Comprehension', section: 'reading', instructions: 'Read the passages and answer the questions that follow.' },
    ];

    const sourceParts = assessment?.parts?.length ? assessment.parts : defaultPartDefs;

    return sourceParts.map((partDef) => {
      // Find question groups for this part
      const groupsForPart = (attempt.groupSnapshots || [])
        .filter((group) => group.partNumber === partDef.partNumber)
        .map((group) => {
          const groupQuestions = (group.questionIds || [])
            .map((id) => {
              const strId = String(id);
              return (attempt.questionSnapshots || []).find((q) => (q.questionId || q._id) === strId);
            })
            .filter(Boolean);

          return {
            ...group,
            questions: groupQuestions,
          };
        });

      // Find standalone questions for this part not in any group
      const groupedQuestionIdSet = new Set(
        groupsForPart.flatMap((g) => g.questions.map((q) => q.questionId || q._id))
      );
      const standaloneQuestions = (attempt.questionSnapshots || []).filter(
        (q) => q.toeicPart === partDef.partNumber && !groupedQuestionIdSet.has(q.questionId || q._id)
      );

      if (standaloneQuestions.length > 0) {
        groupsForPart.push({
          _id: `standalone-${partDef.partNumber}`,
          groupId: `standalone-${partDef.partNumber}`,
          partNumber: partDef.partNumber,
          type: 'standalone',
          title: '',
          instructions: '',
          questions: standaloneQuestions,
        });
      }

      return {
        ...partDef,
        questionGroups: groupsForPart,
      };
    });
  }, [attempt, assessment]);

  const activePart = useMemo(() => {
    return parts.find((p) => p.partNumber === activePartNumber) || parts[0];
  }, [parts, activePartNumber]);

  // Flatten all questions for Question Navigator
  const allQuestions = useMemo(() => {
    const list = [];
    parts.forEach((p) => {
      (p.questionGroups || []).forEach((g) => {
        (g.questions || []).forEach((q) => {
          const qId = q.questionId || q._id;
          list.push({
            ...q,
            qId,
            partNumber: p.partNumber,
            group: g,
          });
        });
      });
    });
    return list;
  }, [parts]);

  const activeQuestion = useMemo(() => {
    if (!allQuestions.length) return null;
    return allQuestions.find((question) => question.qId === activeQuestionId)
      || allQuestions.find((question) => question.partNumber === activePartNumber)
      || allQuestions[0];
  }, [activePartNumber, activeQuestionId, allQuestions]);

  const activeQuestionIndex = activeQuestion
    ? allQuestions.findIndex((question) => question.qId === activeQuestion.qId)
    : -1;
  const activeGroup = activeQuestion?.group || null;
  const questionPositionInGroup = activeGroup
    ? (activeGroup.questions || []).findIndex((question) => (question.questionId || question._id) === activeQuestion?.qId) + 1
    : 0;
  const activePartQuestionCount = activePart
    ? allQuestions.filter((question) => question.partNumber === activePart.partNumber).length
    : 0;

  useEffect(() => {
    if (!activeQuestion || activeQuestionId === activeQuestion.qId) return;
    setActivePartNumber(activeQuestion.partNumber);
    setActiveQuestionId(activeQuestion.qId);
  }, [activeQuestion, activeQuestionId]);

  const totalQuestions = allQuestions.length;
  const answeredCount = useMemo(() => {
    return allQuestions.filter((q) => {
      const ans = userAnswers[q.qId];
      return ans && ans.length > 0;
    }).length;
  }, [allQuestions, userAnswers]);

  const unansweredCount = totalQuestions - answeredCount;
  const unansweredQuestionNumbers = allQuestions.reduce((numbers, question, index) => {
    const answer = userAnswers[question.qId];
    const answered = Array.isArray(answer) ? answer.length > 0 : answer !== undefined && answer !== null && answer !== '';
    if (!answered) numbers.push(question.questionNumber || index + 1);
    return numbers;
  }, []);

  // Formatting time MM:SS or HH:MM:SS
  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const jumpToQuestion = (qId, partNumber) => {
    setActivePartNumber(partNumber);
    setActiveQuestionId(qId);
    setMobileDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const moveQuestion = (direction) => {
    const target = allQuestions[activeQuestionIndex + direction];
    if (!target) return;
    jumpToQuestion(target.qId, target.partNumber);
  };

  const handleListeningAudioEnded = (completedQuestionId) => {
    // Part 1 and Part 2 store one audio per question. For grouped listening
    // (Parts 3–4), this moves to the next question in the same conversation.
    window.setTimeout(() => {
      if (activeQuestionIdRef.current === completedQuestionId) moveQuestion(1);
    }, 250);
  };

  if (loading) {
    return (
      <div className="toeic-exam-screen toeic-exam-screen--state toeic-exam-screen--loading">
        <div className="toeic-exam-screen__state-icon">⏱️</div>
        <h2 className="toeic-exam-screen__state-title">Đang tải bài thi TOEIC...</h2>
        <p className="toeic-exam-screen__state-copy">Khôi phục trạng thái làm bài và đồng bộ đồng hồ máy chủ</p>
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div className="toeic-exam-screen toeic-exam-screen--state toeic-exam-screen--error">
        <h3>Không thể mở bài thi</h3>
        <p>{error || 'Lượt làm bài không hợp lệ hoặc đã kết thúc.'}</p>
        <button
          onClick={() => navigate('/student/toeic')}
          className="toeic-exam-screen__back-button"
        >
          Quay lại Kho Đề TOEIC
        </button>
      </div>
    );
  }

  return (
    <div className="toeic-exam-screen">
      <div className="toeic-exam-screen__sticky-shell">
      {/* Sticky Exam Room Header */}
      <header className="toeic-exam-screen__header">
        {/* Left: Test Title & Save Status */}
        <div className="toeic-exam-screen__header-main">
          <h1 className="toeic-exam-screen__header-title">
            {assessment?.title || 'TOEIC Test'}
          </h1>
          <span className={`toeic-exam-screen__header-status toeic-exam-screen__header-status--${saveStatus === 'saved' ? 'saved' : saveStatus === 'saving' ? 'saving' : 'error'}`}>
            {saveStatus === 'saved' ? '✓ Đã lưu' : saveStatus === 'saving' ? '⏳ Đang lưu...' : saveStatus === 'offline' ? '⌁ Chờ kết nối để lưu' : '⚠️ Không thể lưu'}
          </span>
        </div>

        {/* Center: Server-Authoritative Timer */}
        <div className={`toeic-exam-screen__timer${isExpired ? ' toeic-exam-screen__timer--expired' : remainingSeconds < 300 ? ' toeic-exam-screen__timer--urgent' : ''}`}>
          <span>⏱️</span>
          <span>{formatTime(remainingSeconds)}</span>
        </div>

        {/* Right: Navigator toggle (mobile) & Submit button */}
        <div className="toeic-exam-screen__header-actions">
          <button
            onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
            className="toeic-mobile-nav-btn toeic-exam-screen__nav-button"
          >
            📋 Câu hỏi ({answeredCount}/{totalQuestions})
          </button>

          <button
            onClick={() => setShowSubmitModal(true)}
            disabled={submitting || revisionConflict}
            className="toeic-exam-screen__submit-button"
          >
            {submitting ? 'ĐANG NỘP...' : 'NỘP BÀI'}
          </button>
        </div>
      </header>

      {/* Part Navigation Bar */}
      <nav className="toeic-exam-screen__part-nav" aria-label="Chọn phần thi TOEIC">
        {parts.map((p) => {
          const isActive = activePartNumber === p.partNumber;
          return (
            <button
              key={p.partNumber}
              onClick={() => { setActivePartNumber(p.partNumber); setActiveQuestionId(null); }}
              className={`toeic-exam-screen__part-button${isActive ? ' toeic-exam-screen__part-button--active' : ''}`}
            >
              Part {p.partNumber}
            </button>
          );
        })}
      </nav>
      </div>

      {revisionConflict && (
        <div className="attempt-conflict-banner" role="alert">
          <div><strong>Bài làm đã thay đổi ở một tab khác.</strong><span> Đáp án ở tab này đang bị khóa để tránh ghi đè dữ liệu mới hơn.</span></div>
          <button type="button" onClick={loadAttempt} disabled={loading}>Tải bản mới nhất</button>
        </div>
      )}

      {/* Main Exam Room Container */}
      <div className="toeic-exam-container">
        {/* Left/Main Exam Content */}
        <main className="toeic-exam-main">
          {activePart && activeQuestion ? (
            <section className="toeic-exam-room">
              <header className="toeic-exam-room__header">
                <div>
                  <span className={`toeic-exam-room__mode toeic-exam-room__mode--${activePart.section}`}>{activePart.section === 'listening' ? 'Listening' : 'Reading'}</span>
                  <h2>PART {activePart.partNumber}</h2>
                  <p>{activePart.name}</p>
                </div>
                <div className="toeic-exam-room__counter"><strong>{activePartQuestionCount} câu</strong><span>trong Part {activePart.partNumber}</span></div>
              </header>

              <div className="toeic-exam-room__stage">
                <section className="toeic-exam-room__stimulus" aria-label="Tài liệu câu hỏi">
                  {activePart.section === 'listening' && renderListeningPlayer(activeGroup, activeQuestion)}
                  {activeGroup?.title && <p className="toeic-exam-room__group-title">{activeGroup.title}</p>}
                  {renderStimulus(activeGroup, activePart.partNumber)}
                </section>

                <section className="toeic-exam-room__answer">
                  {renderQuestionCard(activeQuestion)}
                  <footer className="toeic-exam-room__question-nav">
                    <button type="button" onClick={() => moveQuestion(-1)} disabled={activeQuestionIndex <= 0}>← Câu trước</button>
                    {questionPositionInGroup > 0 && <span>Câu {questionPositionInGroup} / {(activeGroup?.questions || []).length} trong nhóm</span>}
                    <button type="button" onClick={() => moveQuestion(1)} disabled={activeQuestionIndex >= totalQuestions - 1}>Câu tiếp →</button>
                  </footer>
                </section>
              </div>
            </section>
          ) : (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-muted)' }}>
              Không có câu hỏi nào thuộc phần này.
            </div>
          )}
        </main>

        {/* Right Sidebar: Desktop Question Navigator */}
        <aside className="toeic-navigator-aside">
          <div
            style={{
              background: 'var(--brand-surface)',
              borderRadius: '16px',
              border: '1px solid var(--brand-border)',
              padding: '1.25rem',
              position: 'sticky',
              top: '120px',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              boxShadow: 'var(--shadow-subtle)',
            }}
          >
            {renderNavigatorContent()}
          </div>
        </aside>
      </div>

      {/* Mobile Drawer Question Navigator */}
      {mobileDrawerOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--overlay-scrim)',
            backdropFilter: 'blur(2px)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setMobileDrawerOpen(false)}
        >
          <div
            style={{
              width: '85%',
              maxWidth: '360px',
              height: '100%',
              background: 'var(--brand-surface)',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              boxShadow: 'var(--shadow-raised)',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--brand-text)', margin: 0 }}>Bảng Câu Hỏi</h3>
              <button
                onClick={() => setMobileDrawerOpen(false)}
                style={{ background: 'transparent', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--brand-muted)' }}
              >
                ✕
              </button>
            </div>
            {renderNavigatorContent()}
          </div>
        </div>
      )}

      {expandedPassageImage && (
        <div
          className="toeic-passage-image-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Bài đọc phóng to"
          onClick={() => setExpandedPassageImage(null)}
        >
          <div className="toeic-passage-image-modal__content" onClick={(event) => event.stopPropagation()}>
            <header>
              <strong>Bài đọc phóng to</strong>
              <button type="button" onClick={() => setExpandedPassageImage(null)} aria-label="Đóng bài đọc phóng to">✕</button>
            </header>
            <ToeicImageWithBrandOverlay
              src={expandedPassageImage.src}
              alt={expandedPassageImage.alt}
              className="toeic-passage-image-modal__image"
            />
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal with Unanswered Warning */}
      {showSubmitModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--overlay-scrim)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: 'var(--brand-surface)',
              borderRadius: '16px',
              padding: '2rem',
              maxWidth: '480px',
              width: '100%',
              boxShadow: 'var(--shadow-subtle)',
            }}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--brand-text)', marginBottom: '0.75rem' }}>
              Xác Nhận Nộp Bài Thi
            </h3>

            {unansweredCount > 0 ? (
              <div
                style={{
                  background: 'var(--brand-danger-bg)',
                  border: '1px solid var(--brand-danger-border)',
                  color: 'var(--brand-danger)',
                  padding: '1rem',
                  borderRadius: '10px',
                  fontSize: '0.95rem',
                  lineHeight: 1.5,
                  marginBottom: '1.25rem',
                }}
              >
                ⚠️ <strong>Câu chưa trả lời: {unansweredQuestionNumbers.join(', ')}.</strong>
                <div style={{ marginTop: '0.35rem', fontSize: '0.875rem' }}>
                  Bạn có chắc chắn muốn kết thúc bài thi và nộp bài ngay bây giờ?
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: 'var(--brand-success-bg)',
                  border: '1px solid var(--brand-success-border)',
                  color: 'var(--brand-success)',
                  padding: '1rem',
                  borderRadius: '10px',
                  fontSize: '0.95rem',
                  lineHeight: 1.5,
                  marginBottom: '1.25rem',
                }}
              >
                ✓ <strong>Bạn đã hoàn thành tất cả {totalQuestions} câu hỏi.</strong>
                <div style={{ marginTop: '0.35rem', fontSize: '0.875rem' }}>
                  Sẵn sàng nộp bài để xem ngay kết quả và bảng điểm chi tiết?
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting || revisionConflict}
                style={{
                  padding: '0.65rem 1.25rem',
                  background: 'var(--brand-bg-sub)',
                  color: 'var(--brand-muted)',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Quay lại làm bài
              </button>

              <button
                onClick={handleSubmitAttempt}
                disabled={submitting || revisionConflict}
                style={{
                  padding: '0.65rem 1.5rem',
                  background: 'var(--brand-yellow)',
                  color: 'var(--brand-text)',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 800,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'ĐANG NỘP...' : 'Xác nhận nộp bài'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function renderListeningPlayer(group, question) {
    const audioUrl = group?.audioUrl || question?.audioUrl || '';
    const audioText = group?.audioText || question?.audioText || '';
    if (audioUrl) {
      return <div className="toeic-exam-room__audio">
        <span aria-hidden="true">♫</span>
        <div>
          <strong>Audio đang phát</strong>
          <small>Kết thúc audio sẽ chuyển sang câu tiếp theo.</small>
        </div>
        <audio
          key={`${group?._id || question?.qId || question?.questionId}-${audioUrl}`}
          controls
          autoPlay={audioSequenceStarted}
          src={resolveMediaUrl(audioUrl)}
          preload="auto"
          onPlay={() => setAudioSequenceStarted(true)}
          onEnded={() => handleListeningAudioEnded(question?.qId || question?.questionId || question?._id)}
        >Trình duyệt của bạn không hỗ trợ phát audio.</audio>
      </div>;
    }
    if (audioText) {
      return <div className="toeic-exam-room__audio toeic-exam-room__audio--tts">
        <span aria-hidden="true">🔊</span>
        <div><strong>Audio TTS</strong><small>Kết thúc giọng đọc sẽ chuyển sang câu tiếp theo.</small></div>
        <button type="button" onClick={() => { setAudioSequenceStarted(true); speakText(audioText, () => handleListeningAudioEnded(question?.qId || question?.questionId || question?._id)); }}>Phát audio</button>
      </div>;
    }
    return <div className="toeic-exam-room__audio toeic-exam-room__audio--empty"><span aria-hidden="true">🎧</span><div><strong>Listening</strong><small>Audio của câu này không khả dụng.</small></div></div>;
  }

  function renderStimulus(group, partNumber) {
    if (!group) return null;
    const groupImages = group.imageUrls?.length ? group.imageUrls : (group.imageUrl ? [group.imageUrl] : []);
    const passages = group.passages || [];
    const hasReadingMaterial = [6, 7].includes(partNumber) && passages.length > 0;

    return <div className="toeic-exam-room__document">
      {groupImages.map((imageUrl, imageIndex) => <ToeicImageWithBrandOverlay
        key={`${imageUrl}-${imageIndex}`}
        src={resolveMediaUrl(imageUrl)}
        alt={`Tài liệu câu hỏi ${imageIndex + 1}`}
        className="toeic-stimulus-image"
        onError={(event) => {
          if (imageUrl.startsWith('/') && !event.currentTarget.dataset.fallbackTried) {
            event.currentTarget.dataset.fallbackTried = 'true';
            event.currentTarget.src = imageUrl;
          }
        }}
      />)}
      {hasReadingMaterial && passages.map((passage, passageIndex) => <article className={`toeic-exam-room__passage toeic-exam-room__passage--part-${partNumber}`} key={passageIndex}>
        {passage.title && <h3>{passage.title}</h3>}
        {(passage.imageUrls?.length ? passage.imageUrls : (passage.imageUrl ? [passage.imageUrl] : [])).map((imageUrl, imageIndex) => {
          const src = resolveMediaUrl(imageUrl);
          const alt = `Tài liệu đọc ${passageIndex + 1}-${imageIndex + 1}`;
          return <div className="toeic-passage-image" key={`${imageUrl}-${imageIndex}`}>
            <ToeicImageWithBrandOverlay src={src} alt={alt} className="toeic-stimulus-image" />
            <button type="button" onClick={() => setExpandedPassageImage({ src, alt })}>
              ⤢ Phóng to bài đọc
            </button>
          </div>;
        })}
        {passage.content && <div>{passage.content}</div>}
      </article>)}
      {!groupImages.length && !hasReadingMaterial && <div className="toeic-exam-room__listening-placeholder"><span>🎧</span><p>Nghe kỹ audio và chọn đáp án phù hợp nhất.</p></div>}
    </div>;
  }

  // Helper to render individual Question Card
  function speakText(value, onEnd) {
    if (typeof window === 'undefined' || !window.speechSynthesis || !String(value || '').trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(value));
    utterance.lang = 'en-US';
    if (onEnd) utterance.onend = onEnd;
    window.speechSynthesis.speak(utterance);
  }

  function renderQuestionCard(q) {
    const qId = q.questionId || q._id;
    const qNum = q.questionNumber || allQuestions.findIndex((question) => question.qId === qId) + 1;
    const isFlagged = flaggedIds.includes(qId);
    const selectedOpts = Array.isArray(userAnswers[qId]) ? userAnswers[qId] : (userAnswers[qId] ? [userAnswers[qId]] : []);
    const isMultiple = q.type === 'multiple_choice';
    const rawQuestionPrompt = q.questionText || q.prompt || q.text || '';
    const questionPrompt = String(rawQuestionPrompt)
      .replace(new RegExp(`^\\s*${qNum}\\s*[.)]?\\s*`), '')
      .trim();

    return (
      <div
        key={qId}
        id={`question-${qId}`}
        className="toeic-question-card"
        onFocusCapture={() => setActiveQuestionId(qId)}
        style={{
          background: 'var(--brand-surface)',
          borderRadius: '12px',
          border: activeQuestionId === qId ? '2px solid var(--brand-yellow)' : '1px solid var(--brand-border)',
          padding: '1.25rem',
          scrollMarginTop: '120px',
          boxShadow: 'var(--shadow-subtle)',
          transition: 'border-color 0.15s ease',
        }}
      >
        {/* Question Header & Prompt */}
        <div className="toeic-question-card__header">
          <div className="toeic-question-card__heading">
            <span className="toeic-question-card__number">Câu {qNum}</span>
            {questionPrompt && (
              <span className="toeic-question-card__prompt">
                {questionPrompt}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleToggleFlag(qId)}
            disabled={isExpired || submitting || revisionConflict}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
              padding: '0.2rem',
              color: isFlagged ? 'var(--brand-warning)' : 'var(--brand-muted)',
              lineHeight: 1,
            }}
            title={isFlagged ? 'Bỏ đánh dấu' : 'Đánh dấu xem lại'}
          >
            {isFlagged ? '🚩' : '🏳️'}
          </button>
        </div>

        {!q.questionGroupId && q.audioUrl && (
          <div style={{ margin: '0.4rem 0 0.75rem' }}>
            <audio controls src={resolveMediaUrl(q.audioUrl)} preload="metadata" style={{ width: '100%', maxWidth: '520px', height: '40px' }} />
          </div>
        )}

        {!q.questionGroupId && !q.audioUrl && q.audioText && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '0.4rem 0 0.75rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => speakText(q.audioText)} style={{ border: '1px solid var(--brand-border)', borderRadius: '7px', padding: '0.4rem 0.65rem', background: 'var(--brand-yellow-soft)', color: 'var(--brand-coffee)', fontWeight: 700, cursor: 'pointer' }}>
              🔊 Nghe câu hỏi (TTS)
            </button>
            <small style={{ color: 'var(--brand-muted)' }}>Không có audio lưu trữ</small>
          </div>
        )}

        {/* Options Radio List */}
        <fieldset aria-label={`Câu ${qNum}, ${isMultiple ? 'chọn nhiều đáp án' : 'chọn một đáp án'}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem', border: 0, padding: 0, minWidth: 0 }}>
          <legend className="visually-hidden">{isMultiple ? 'Chọn tất cả đáp án đúng' : 'Chọn một đáp án'}</legend>
          {(q.options || []).map((opt) => {
            const optId = opt.id || opt._id;
            const isSelected = selectedOpts.includes(optId);

            return (
              <label
                key={optId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: isSelected ? '2px solid var(--brand-yellow)' : '1px solid var(--brand-border)',
                  background: isSelected ? 'var(--brand-yellow-soft)' : 'var(--brand-surface)',
                  cursor: isExpired || revisionConflict ? 'default' : 'pointer',
                  fontSize: '0.95rem',
                  color: isSelected ? 'var(--brand-coffee)' : 'var(--brand-text)',
                  fontWeight: isSelected ? 700 : 400,
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type={isMultiple ? 'checkbox' : 'radio'}
                  name={`q-${qId}`}
                  checked={isSelected}
                  onChange={() => handleSelectOption(qId, optId, isMultiple)}
                  disabled={isExpired || revisionConflict}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--brand-brown-sec)', cursor: 'pointer' }}
                />
                <span style={{ flex: 1 }}>{opt.text}</span>
              </label>
            );
          })}
        </fieldset>
      </div>
    );
  }

  // Helper to render Question Navigator Content
  function renderNavigatorContent() {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--brand-text)', margin: 0 }}>Danh Sách Câu Hỏi</h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--brand-muted)', fontWeight: 700 }}>
            {answeredCount}/{totalQuestions} câu
          </span>
        </div>

        {/* Filter Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.25rem', background: 'var(--brand-bg-sub)', padding: '0.25rem', borderRadius: '8px' }}>
          {[
            { id: 'ALL', label: 'Tất cả' },
            { id: 'UNANSWERED', label: 'Chưa làm' },
            { id: 'ANSWERED', label: 'Đã làm' },
            { id: 'FLAGGED', label: 'Đánh dấu' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setNavFilter(f.id)}
              style={{
                padding: '0.35rem 0.2rem',
                fontSize: '0.7rem',
                fontWeight: 700,
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                background: navFilter === f.id ? 'var(--brand-surface)' : 'transparent',
                color: navFilter === f.id ? 'var(--brand-text)' : 'var(--brand-muted)',
                boxShadow: navFilter === f.id ? 'var(--shadow-subtle)' : 'none',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--brand-muted)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--brand-success-bg)', border: '1px solid var(--brand-success-border)' }} />
            <span>Đã làm</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--brand-bg-sub)', border: '1px solid var(--brand-border)' }} />
            <span>Chưa làm</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--brand-warning-bg)', border: '1px solid var(--brand-warning-border)' }} />
            <span>Đánh dấu</span>
          </div>
        </div>

        {/* Grid Numbers 1..N grouped by Part */}
        <div style={{ maxHeight: '450px', overflowY: 'auto', paddingRight: '0.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {parts.map((p) => {
            const partQuestions = allQuestions.filter((q) => q.partNumber === p.partNumber);
            if (partQuestions.length === 0) return null;

            return (
              <div key={p.partNumber}>
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    color: 'var(--brand-muted)',
                    textTransform: 'uppercase',
                    marginBottom: '0.4rem',
                    paddingBottom: '0.2rem',
                    borderBottom: '1px solid var(--brand-border-light)',
                  }}
                >
                  Part {p.partNumber}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.45rem' }}>
                  {partQuestions.map((q, idx) => {
                    const qId = q.qId;
                    const qNum = q.questionNumber || idx + 1;
                    const isAnswered = (userAnswers[qId] || []).length > 0;
                    const isFlagged = flaggedIds.includes(qId);

                    // Filter check
                    if (navFilter === 'UNANSWERED' && isAnswered) return null;
                    if (navFilter === 'ANSWERED' && !isAnswered) return null;
                    if (navFilter === 'FLAGGED' && !isFlagged) return null;

                    return (
                      <button
                        key={qId}
                        onClick={() => jumpToQuestion(qId, p.partNumber)}
                        className={`toeic-exam-screen__question-tile${qId === activeQuestion?.qId ? ' toeic-exam-screen__question-tile--active' : isFlagged ? ' toeic-exam-screen__question-tile--flagged' : isAnswered ? ' toeic-exam-screen__question-tile--answered' : ''}`}
                      >
                        {qNum}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }
}
