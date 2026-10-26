import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toeicApi } from '../api/toeicApi.js';
import { resolveMediaUrl } from '../utils/mediaUrl.js';
import '../styles/assessment-screens.css';

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
  const [activePartNumber, setActivePartNumber] = useState(1);
  const [activeQuestionId, setActiveQuestionId] = useState(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [navFilter, setNavFilter] = useState('ALL'); // 'ALL' | 'UNANSWERED' | 'ANSWERED' | 'FLAGGED'

  const autosaveTimerRef = useRef(null);
  const autosaveVersionRef = useRef(0);
  const revisionRef = useRef(1);
  const serverClockOffsetRef = useRef(0);
  const autosaveQueueRef = useRef(Promise.resolve());
  const autoSubmitStartedRef = useRef(false);
  const autoSubmitHandlerRef = useRef(null);

  useEffect(() => {
    loadAttempt();
  }, [attemptId]);

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
          if (version === autosaveVersionRef.current) setSaveStatus('error');
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

    setTimeout(() => {
      const el = document.getElementById(`question-${qId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
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
            {saveStatus === 'saved' ? '✓ Đã lưu' : saveStatus === 'saving' ? '⏳ Đang lưu...' : '⚠️ Không thể lưu'}
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
              onClick={() => setActivePartNumber(p.partNumber)}
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
          {activePart ? (
            <div style={{ background: 'var(--brand-surface)', borderRadius: '16px', border: '1px solid var(--brand-border)', padding: '1.5rem', boxShadow: 'var(--shadow-subtle)' }}>
              {/* Part Header */}
              <div style={{ borderBottom: '1px solid var(--brand-border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      background: activePart.section === 'listening' ? 'var(--brand-yellow-soft)' : 'var(--brand-success-bg)',
                      color: activePart.section === 'listening' ? 'var(--brand-coffee)' : 'var(--brand-success)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {activePart.section === 'listening' ? '🎧 LISTENING' : '📖 READING'}
                  </span>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--brand-text)', margin: 0 }}>
                    PART {activePart.partNumber}: {activePart.name}
                  </h2>
                </div>
                {activePart.instructions && (
                  <p style={{ fontSize: '0.9rem', color: 'var(--brand-muted)', margin: '0.5rem 0 0 0', lineHeight: 1.5 }}>
                    {activePart.instructions}
                  </p>
                )}
              </div>

              {/* Render Question Groups in this Part */}
              {(activePart.questionGroups || []).map((group, gIdx) => {
                const isReadingSplit = (activePart.partNumber === 6 || activePart.partNumber === 7) && group.passages && group.passages.length > 0;

                return (
                  <div
                    key={group._id || gIdx}
                    style={{
                      marginBottom: '2rem',
                      padding: '1.25rem',
                      background: 'var(--brand-bg-sub)',
                      borderRadius: '14px',
                      border: '1px solid var(--brand-border)',
                    }}
                  >
                    {/* Part Title / Instructions if given */}
                    {group.title && (
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--brand-text)', marginBottom: '0.75rem' }}>
                        {group.title}
                      </h3>
                    )}

                    {/* Split Layout for Part 6 & 7 reading passages */}
                    {isReadingSplit ? (
                      <div className="toeic-split-layout">
                        {/* Left Column: Shared Passages / Documents */}
                        <div className="toeic-passage-panel">
                          {(group.imageUrls?.length ? group.imageUrls : (group.imageUrl ? [group.imageUrl] : [])).map((imageUrl, imageIndex) => (
                            <div key={`${imageUrl}-${imageIndex}`} style={{ marginBottom: '1rem' }}>
                              <img
                                src={resolveMediaUrl(imageUrl)}
                                alt={`Passage visual ${imageIndex + 1}`}
                                className="toeic-stimulus-image"
                                onError={(e) => {
                                  if (imageUrl.startsWith('/') && !e.currentTarget.dataset.fallbackTried) {
                                    e.currentTarget.dataset.fallbackTried = 'true';
                                    e.currentTarget.src = imageUrl;
                                  }
                                }}
                              />
                              {group.imagePageNumbers?.[imageIndex] && (
                                <small style={{ display: 'block', textAlign: 'center', color: 'var(--brand-muted)' }}>
                                  Hình từ trang {group.imagePageNumbers[imageIndex]} của PDF
                                </small>
                              )}
                            </div>
                          ))}
                          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--brand-coffee)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                            {group.passages.length > 1 ? `Đoạn văn đọc hiểu (${group.passages.length} tài liệu)` : 'Đoạn văn đọc hiểu'}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {group.passages.map((pas, pIdx) => (
                              <div
                                key={pIdx}
                                style={{
                                  padding: '1.25rem',
                                  background: 'var(--brand-bg-sub)',
                                  borderRadius: '8px',
                                  border: '1px solid var(--brand-border)',
                                  fontSize: '0.95rem',
                                  lineHeight: 1.7,
                                  color: 'var(--brand-text)',
                                }}
                              >
                                {pas.title && (
                                  <h4 style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--brand-text)', marginBottom: '0.5rem' }}>
                                    {pas.title}
                                  </h4>
                                )}
                                {group.partNumber === 7 && (pas.imageUrls?.length || pas.imageUrl) ? (
                                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                                    {(pas.imageUrls?.length ? pas.imageUrls : [pas.imageUrl]).map((imageUrl, imageIndex) => (
                                      <img
                                        key={`${imageUrl}-${imageIndex}`}
                                        src={resolveMediaUrl(imageUrl)}
                                        alt={`Passage ${pas.title || pIdx + 1}, trang ${imageIndex + 1}`}
                                        className="toeic-stimulus-image"
                                        onError={(e) => {
                                          if (imageUrl.startsWith('/') && !e.currentTarget.dataset.fallbackTried) {
                                            e.currentTarget.dataset.fallbackTried = 'true';
                                            e.currentTarget.src = imageUrl;
                                          }
                                        }}
                                      />
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{pas.content}</div>
                                )}
                                {pas.imageUrl && group.partNumber !== 7 && (
                                  <div style={{ marginTop: '0.75rem' }}>
                                    <img
                                      src={resolveMediaUrl(pas.imageUrl)}
                                      alt={`Passage illustration ${pIdx + 1}`}
                                      className="toeic-stimulus-image"
                                      onError={(e) => {
                                        if (pas.imageUrl.startsWith('/') && !e.currentTarget.dataset.fallbackTried) {
                                          e.currentTarget.dataset.fallbackTried = 'true';
                                          e.currentTarget.src = pas.imageUrl;
                                        }
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Right Column: Questions */}
                        <div className="toeic-questions-panel">
                          {(group.questions || []).map((q) => renderQuestionCard(q))}
                        </div>
                      </div>
                    ) : (
                      // Standard Layout for Parts 1, 2, 3, 4, 5
                      <div>
                        {/* Audio Stimulus */}
                        {group.audioUrl && (
                          <div style={{ marginBottom: '1.25rem', background: 'var(--brand-surface)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid var(--brand-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '1.2rem' }}>🎧</span>
                            <audio
                              controls
                              src={group.audioUrl}
                              preload="metadata"
                              style={{ width: '100%', maxWidth: '520px', height: '40px' }}
                            />
                          </div>
                        )}
                        {!group.audioUrl && group.audioText && (
                          <div style={{ marginBottom: '1.25rem', background: 'var(--brand-surface)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid var(--brand-border)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '1.2rem' }}>🔊</span>
                            <button type="button" onClick={() => speakText(group.audioText)} style={{ border: '1px solid var(--brand-border)', borderRadius: '8px', padding: '0.55rem 0.8rem', background: 'var(--brand-yellow-soft)', color: 'var(--brand-coffee)', fontWeight: 700, cursor: 'pointer' }}>
                              Nghe bằng giọng đọc trình duyệt (TTS)
                            </button>
                            <small style={{ color: 'var(--brand-muted)' }}>Nguồn không có file audio MP3.</small>
                          </div>
                        )}

                        {/* Image Stimulus (Part 1 Photograph or Part 3/4 graphic) */}
                        {(group.imageUrls?.length ? group.imageUrls : (group.imageUrl ? [group.imageUrl] : [])).map((imageUrl, imageIndex) => (
                          <div key={`${imageUrl}-${imageIndex}`} style={{ marginBottom: '1.25rem', textAlign: 'center' }}>
                            <img
                              src={resolveMediaUrl(imageUrl)}
                              alt={`Question stimulus ${imageIndex + 1}`}
                              className="toeic-stimulus-image"
                              onError={(e) => {
                                if (imageUrl.startsWith('/') && !e.currentTarget.dataset.fallbackTried) {
                                  e.currentTarget.dataset.fallbackTried = 'true';
                                  e.currentTarget.src = imageUrl;
                                }
                              }}
                            />
                            {group.imagePageNumbers?.[imageIndex] && (
                              <small style={{ color: 'var(--brand-muted)' }}>Ảnh từ trang {group.imagePageNumbers[imageIndex]} của đề PDF</small>
                            )}
                          </div>
                        ))}

                        {/* Questions list */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                          {(group.questions || []).map((q) => renderQuestionCard(q))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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

  // Helper to render individual Question Card
  function speakText(value) {
    if (typeof window === 'undefined' || !window.speechSynthesis || !String(value || '').trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(value));
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  }

  function renderQuestionCard(q) {
    const qId = q.questionId || q._id;
    const qNum = q.questionNumber || allQuestions.findIndex((question) => question.qId === qId) + 1;
    const isFlagged = flaggedIds.includes(qId);
    const selectedOpts = Array.isArray(userAnswers[qId]) ? userAnswers[qId] : (userAnswers[qId] ? [userAnswers[qId]] : []);
    const isMultiple = q.type === 'multiple_choice';
    const questionPrompt = q.questionText || q.prompt || q.text;

    return (
      <div
        key={qId}
        id={`question-${qId}`}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
            <span
              style={{
                background: 'var(--brand-coffee)',
                color: 'var(--brand-surface)',
                fontSize: '0.85rem',
                fontWeight: 800,
                padding: '0.2rem 0.6rem',
                borderRadius: '6px',
                flexShrink: 0,
              }}
            >
              Câu {qNum}
            </span>
            {questionPrompt && (
              <span style={{ fontSize: '0.98rem', fontWeight: 600, color: 'var(--brand-text)', lineHeight: 1.5 }}>
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
                        className={`toeic-exam-screen__question-tile${isFlagged ? ' toeic-exam-screen__question-tile--flagged' : isAnswered ? ' toeic-exam-screen__question-tile--answered' : ''}`}
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
