import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toeicApi } from '../api/toeicApi.js';

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
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [navFilter, setNavFilter] = useState('ALL'); // 'ALL' | 'UNANSWERED' | 'ANSWERED' | 'FLAGGED'

  const autosaveTimerRef = useRef(null);
  const autosaveVersionRef = useRef(0);
  const revisionRef = useRef(1);

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
        setAttempt(att);
        setAssessment(res.data.assessment || att.assessment);
        setRevisionState(att.revision || 1);
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
        const now = Date.now();
        const diff = Math.max(0, Math.floor((deadline - now) / 1000));
        setRemainingSeconds(diff);
        if (diff <= 0) {
          setIsExpired(true);
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
      const now = Date.now();
      const diff = Math.max(0, Math.floor((deadline - now) / 1000));

      setRemainingSeconds(diff);

      if (diff <= 0) {
        setIsExpired(true);
        clearInterval(timer);
        handleAutoSubmitOnExpire();
      }
    }, 1000);

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

        const res = await toeicApi.autosaveToeicAnswers(attemptId, {
          answers: payloadAnswers,
          flaggedQuestionIds: newFlags,
          revision: revisionRef.current,
        });

        if (res.status === 'success') {
          revisionRef.current = res.data.revision;
          if (version === autosaveVersionRef.current) setSaveStatus('saved');
        }
      } catch (err) {
        if (err.response?.status === 409) {
          // Stale revision, reload state
          if (version === autosaveVersionRef.current) setSaveStatus('error');
          loadAttempt();
        } else {
          if (version === autosaveVersionRef.current) setSaveStatus('error');
        }
      }
    }, 600);
  };

  const handleSelectOption = (questionId, optionId) => {
    if (isExpired || submitting) return;

    const updated = {
      ...userAnswers,
      [questionId]: [optionId],
    };
    setUserAnswers(updated);
    triggerAutosave(updated, flaggedIds);
  };

  const handleToggleFlag = (questionId) => {
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
    try {
      setSubmitting(true);
      const res = await toeicApi.submitToeicAttempt(attemptId, userAnswers);
      if (res.status === 'success') {
        navigate(`/student/toeic/results/${attemptId}`);
      }
    } catch (err) {
      console.error('Auto-submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitAttempt = async () => {
    try {
      setSubmitting(true);
      const res = await toeicApi.submitToeicAttempt(attemptId, userAnswers);
      if (res.status === 'success') {
        navigate(`/student/toeic/results/${attemptId}`);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Nộp bài thất bại. Vui lòng thử lại.');
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
      <div style={{ padding: '5rem 1rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', minHeight: '100vh' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏱️</div>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A' }}>Đang tải bài thi TOEIC...</h2>
        <p style={{ marginTop: '0.5rem', fontSize: '0.95rem' }}>Khôi phục trạng thái làm bài và đồng bộ đồng hồ máy chủ</p>
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div style={{ maxWidth: '600px', margin: '4rem auto', padding: '2rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '16px', textAlign: 'center' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Không thể mở bài thi</h3>
        <p style={{ fontSize: '0.95rem', marginBottom: '1.5rem' }}>{error || 'Lượt làm bài không hợp lệ hoặc đã kết thúc.'}</p>
        <button
          onClick={() => navigate('/student/toeic')}
          style={{ padding: '0.75rem 1.5rem', background: '#DC2626', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
        >
          Quay lại Kho Đề TOEIC
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Sticky Exam Room Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: '#0F172A',
          color: '#FFFFFF',
          padding: '0.75rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        {/* Left: Test Title & Save Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, whiteSpace: 'nowrap', maxWidth: '350px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {assessment?.title || 'TOEIC Test'}
          </h1>
          <span
            style={{
              padding: '0.25rem 0.65rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: saveStatus === 'saved' ? '#166534' : saveStatus === 'saving' ? '#D97706' : '#991B1B',
              color: '#FFFFFF',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            {saveStatus === 'saved' ? '✓ Đã lưu' : saveStatus === 'saving' ? '⏳ Đang lưu...' : '⚠️ Không thể lưu'}
          </span>
        </div>

        {/* Center: Server-Authoritative Timer */}
        <div
          style={{
            background: isExpired ? '#991B1B' : '#1E293B',
            border: `1px solid ${remainingSeconds < 300 ? '#EF4444' : '#334155'}`,
            padding: '0.4rem 1.25rem',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '1.15rem',
            fontWeight: 800,
            color: remainingSeconds < 300 ? '#EF4444' : '#38BDF8',
          }}
        >
          <span>⏱️</span>
          <span>{formatTime(remainingSeconds)}</span>
        </div>

        {/* Right: Navigator toggle (mobile) & Submit button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
            className="toeic-mobile-nav-btn"
            style={{
              padding: '0.45rem 0.85rem',
              background: '#334155',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            📋 Câu hỏi ({answeredCount}/{totalQuestions})
          </button>

          <button
            onClick={() => setShowSubmitModal(true)}
            disabled={submitting}
            style={{
              padding: '0.55rem 1.5rem',
              background: '#0284C7',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 800,
              fontSize: '0.95rem',
              cursor: submitting ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)',
              transition: 'background 0.15s ease',
            }}
          >
            {submitting ? 'ĐANG NỘP...' : 'NỘP BÀI'}
          </button>
        </div>
      </header>

      {/* Part Navigation Bar */}
      <nav
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          padding: '0.5rem 1.5rem',
          display: 'flex',
          gap: '0.5rem',
          overflowX: 'auto',
          position: 'sticky',
          top: '56px',
          zIndex: 90,
        }}
      >
        {parts.map((p) => {
          const isActive = activePartNumber === p.partNumber;
          return (
            <button
              key={p.partNumber}
              onClick={() => setActivePartNumber(p.partNumber)}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: isActive ? '#0284C7' : '#F1F5F9',
                color: isActive ? '#FFFFFF' : '#475569',
                transition: 'all 0.15s ease',
              }}
            >
              Part {p.partNumber}
            </button>
          );
        })}
      </nav>

      {/* Main Exam Room Container */}
      <div className="toeic-exam-container">
        {/* Left/Main Exam Content */}
        <main className="toeic-exam-main">
          {activePart ? (
            <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              {/* Part Header */}
              <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      background: activePart.section === 'listening' ? '#E0F2FE' : '#DCFCE7',
                      color: activePart.section === 'listening' ? '#0369A1' : '#166534',
                      textTransform: 'uppercase',
                    }}
                  >
                    {activePart.section === 'listening' ? '🎧 LISTENING' : '📖 READING'}
                  </span>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    PART {activePart.partNumber}: {activePart.name}
                  </h2>
                </div>
                {activePart.instructions && (
                  <p style={{ fontSize: '0.9rem', color: '#64748B', margin: '0.5rem 0 0 0', lineHeight: 1.5 }}>
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
                      background: '#F8FAFC',
                      borderRadius: '14px',
                      border: '1px solid #E2E8F0',
                    }}
                  >
                    {/* Part Title / Instructions if given */}
                    {group.title && (
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.75rem' }}>
                        {group.title}
                      </h3>
                    )}

                    {/* Split Layout for Part 6 & 7 reading passages */}
                    {isReadingSplit ? (
                      <div className="toeic-split-layout">
                        {/* Left Column: Shared Passages / Documents */}
                        <div className="toeic-passage-panel">
                          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0284C7', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                            {group.passages.length > 1 ? `Đoạn văn đọc hiểu (${group.passages.length} tài liệu)` : 'Đoạn văn đọc hiểu'}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {group.passages.map((pas, pIdx) => (
                              <div
                                key={pIdx}
                                style={{
                                  padding: '1.25rem',
                                  background: '#F8FAFC',
                                  borderRadius: '8px',
                                  border: '1px solid #E2E8F0',
                                  fontSize: '0.95rem',
                                  lineHeight: 1.7,
                                  color: '#1E293B',
                                }}
                              >
                                {pas.title && (
                                  <h4 style={{ fontWeight: 800, fontSize: '1rem', color: '#0F172A', marginBottom: '0.5rem' }}>
                                    {pas.title}
                                  </h4>
                                )}
                                <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{pas.content}</div>
                                {pas.imageUrl && (
                                  <div style={{ marginTop: '0.75rem' }}>
                                    <img src={pas.imageUrl} alt="Passage illustration" className="toeic-stimulus-image" />
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
                          <div style={{ marginBottom: '1.25rem', background: '#FFFFFF', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #CBD5E1', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '1.2rem' }}>🎧</span>
                            <audio
                              controls
                              src={group.audioUrl}
                              preload="metadata"
                              style={{ width: '100%', maxWidth: '520px', height: '40px' }}
                            />
                          </div>
                        )}

                        {/* Image Stimulus (Part 1 Photograph or Part 3/4 graphic) */}
                        {group.imageUrl && (
                          <div style={{ marginBottom: '1.25rem', textAlign: 'center' }}>
                            <img
                              src={group.imageUrl}
                              alt="Question Stimulus"
                              className="toeic-stimulus-image"
                            />
                          </div>
                        )}

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
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
              Không có câu hỏi nào thuộc phần này.
            </div>
          )}
        </main>

        {/* Right Sidebar: Desktop Question Navigator */}
        <aside className="toeic-navigator-aside">
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              padding: '1.25rem',
              position: 'sticky',
              top: '120px',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
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
            background: 'rgba(15, 23, 42, 0.6)',
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
              background: '#FFFFFF',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Bảng Câu Hỏi</h3>
              <button
                onClick={() => setMobileDrawerOpen(false)}
                style={{ background: 'transparent', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748B' }}
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
            background: 'rgba(15, 23, 42, 0.65)',
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
              background: '#FFFFFF',
              borderRadius: '16px',
              padding: '2rem',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.75rem' }}>
              Xác Nhận Nộp Bài Thi
            </h3>

            {unansweredCount > 0 ? (
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: '#991B1B',
                  padding: '1rem',
                  borderRadius: '10px',
                  fontSize: '0.95rem',
                  lineHeight: 1.5,
                  marginBottom: '1.25rem',
                }}
              >
                ⚠️ <strong>Còn {unansweredCount} câu chưa trả lời.</strong>
                <div style={{ marginTop: '0.35rem', fontSize: '0.875rem' }}>
                  Bạn có chắc chắn muốn kết thúc bài thi và nộp bài ngay bây giờ?
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  color: '#166534',
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
                disabled={submitting}
                style={{
                  padding: '0.65rem 1.25rem',
                  background: '#F1F5F9',
                  color: '#475569',
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
                disabled={submitting}
                style={{
                  padding: '0.65rem 1.5rem',
                  background: '#0284C7',
                  color: '#FFFFFF',
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
  function renderQuestionCard(q) {
    const qId = q.questionId || q._id;
    const qNum = q.questionNumber || q.order;
    const isFlagged = flaggedIds.includes(qId);
    const selectedOpts = userAnswers[qId] || [];
    const questionPrompt = q.questionText || q.prompt || q.text;

    return (
      <div
        key={qId}
        id={`question-${qId}`}
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: activeQuestionId === qId ? '2px solid #0284C7' : '1px solid #E2E8F0',
          padding: '1.25rem',
          scrollMarginTop: '120px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          transition: 'border-color 0.15s ease',
        }}
      >
        {/* Question Header & Prompt */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
            <span
              style={{
                background: '#0F172A',
                color: '#FFFFFF',
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
              <span style={{ fontSize: '0.98rem', fontWeight: 600, color: '#0F172A', lineHeight: 1.5 }}>
                {questionPrompt}
              </span>
            )}
          </div>

          <button
            onClick={() => handleToggleFlag(qId)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
              padding: '0.2rem',
              color: isFlagged ? '#D97706' : '#94A3B8',
              lineHeight: 1,
            }}
            title={isFlagged ? 'Bỏ đánh dấu' : 'Đánh dấu xem lại'}
          >
            {isFlagged ? '🚩' : '🏳️'}
          </button>
        </div>

        {/* Options Radio List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
          {(q.options || []).map((opt) => {
            const optId = opt.id || opt._id;
            const isSelected = selectedOpts.includes(optId);

            return (
              <label
                key={optId}
                onClick={() => handleSelectOption(qId, optId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: isSelected ? '2px solid #0284C7' : '1px solid #E2E8F0',
                  background: isSelected ? '#F0F9FF' : '#FFFFFF',
                  cursor: isExpired ? 'default' : 'pointer',
                  fontSize: '0.95rem',
                  color: isSelected ? '#0369A1' : '#334155',
                  fontWeight: isSelected ? 700 : 400,
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="radio"
                  name={`q-${qId}`}
                  checked={isSelected}
                  onChange={() => {}}
                  disabled={isExpired}
                  style={{ width: '18px', height: '18px', accentColor: '#0284C7', cursor: 'pointer' }}
                />
                <span style={{ flex: 1 }}>{opt.text}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  // Helper to render Question Navigator Content
  function renderNavigatorContent() {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Danh Sách Câu Hỏi</h3>
          <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 700 }}>
            {answeredCount}/{totalQuestions} câu
          </span>
        </div>

        {/* Filter Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.25rem', background: '#F1F5F9', padding: '0.25rem', borderRadius: '8px' }}>
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
                background: navFilter === f.id ? '#FFFFFF' : 'transparent',
                color: navFilter === f.id ? '#0F172A' : '#64748B',
                boxShadow: navFilter === f.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: '#64748B', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#DCFCE7', border: '1px solid #22C55E' }} />
            <span>Đã làm</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#F1F5F9', border: '1px solid #CBD5E1' }} />
            <span>Chưa làm</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#FEF3C7', border: '1px solid #F59E0B' }} />
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
                    color: '#64748B',
                    textTransform: 'uppercase',
                    marginBottom: '0.4rem',
                    paddingBottom: '0.2rem',
                    borderBottom: '1px solid #F1F5F9',
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

                    let bgColor = '#F1F5F9';
                    let textColor = '#475569';
                    let borderColor = '#CBD5E1';

                    if (isFlagged) {
                      bgColor = '#FEF3C7';
                      textColor = '#92400E';
                      borderColor = '#F59E0B';
                    } else if (isAnswered) {
                      bgColor = '#DCFCE7';
                      textColor = '#166534';
                      borderColor = '#22C55E';
                    }

                    return (
                      <button
                        key={qId}
                        onClick={() => jumpToQuestion(qId, p.partNumber)}
                        style={{
                          padding: '0.4rem 0',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          borderRadius: '6px',
                          border: `1px solid ${borderColor}`,
                          background: bgColor,
                          color: textColor,
                          cursor: 'pointer',
                          transition: 'transform 0.1s ease',
                        }}
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
