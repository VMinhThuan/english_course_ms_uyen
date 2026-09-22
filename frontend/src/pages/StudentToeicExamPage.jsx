import { useState, useEffect, useRef } from 'react';
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
  const [userAnswers, setUserAnswers] = useState({}); // questionId -> selectedOptionIds array
  const [flaggedIds, setFlaggedIds] = useState([]);
  const [revision, setRevision] = useState(1);
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
        setRevision(att.revision || 1);
        setFlaggedIds(att.flaggedQuestionIds || []);

        // Restore user answers map
        const ansMap = {};
        if (att.answers && Array.isArray(att.answers)) {
          att.answers.forEach((ans) => {
            if (ans.questionId) {
              const qId = typeof ans.questionId === 'object' ? ans.questionId._id : ans.questionId;
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

  // Debounced Autosave Effect when userAnswers or flaggedIds change
  const triggerAutosave = (newAnswers, newFlags) => {
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
          revision: revision,
        });

        if (res.status === 'success') {
          setRevision(res.data.revision);
          setSaveStatus('saved');
        }
      } catch (err) {
        if (err.response?.status === 409) {
          // Stale revision, reload state
          setSaveStatus('error');
          loadAttempt();
        } else {
          setSaveStatus('offline');
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
      const res = await toeicApi.submitToeicAttempt(attemptId);
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
      const res = await toeicApi.submitToeicAttempt(attemptId);
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

  if (loading) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', minHeight: '100vh' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Đang chuẩn bị phòng thi TOEIC...</h2>
        <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Vui lòng đợi trong giây lát</p>
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div style={{ maxWidth: '600px', margin: '3rem auto', padding: '1.5rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '12px' }}>
        {error || 'Không thể tải đề thi.'}
      </div>
    );
  }

  const parts = assessment?.parts || [];
  const activePart = parts.find((p) => p.partNumber === activePartNumber) || parts[0];

  // Flatten all questions across parts to build the full 1..N navigator index
  const allQuestions = [];
  parts.forEach((p) => {
    (p.questionGroups || []).forEach((g) => {
      (g.questionIds || []).forEach((q) => {
        allQuestions.push({
          ...q,
          partNumber: p.partNumber,
          group: g,
        });
      });
    });
  });

  const totalQuestions = allQuestions.length;
  const answeredCount = Object.keys(userAnswers).filter((k) => userAnswers[k]?.length > 0).length;
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

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Sticky Exam Header */}
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
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, whiteSpace: 'nowrap' }}>
            {assessment?.title || 'TOEIC Test'}
          </h1>
          <span
            style={{
              padding: '0.2rem 0.6rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: saveStatus === 'saved' ? '#166534' : saveStatus === 'saving' ? '#D97706' : '#991B1B',
              color: '#FFFFFF',
            }}
          >
            {saveStatus === 'saved' ? '✓ Đã lưu' : saveStatus === 'saving' ? '⏳ Đang lưu...' : '⚠️ Thử lại'}
          </span>
        </div>

        {/* Center Timer */}
        <div
          style={{
            background: isExpired ? '#991B1B' : '#1E293B',
            border: '1px solid #334155',
            padding: '0.4rem 1.25rem',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '1.1rem',
            fontWeight: 800,
            color: remainingSeconds < 300 ? '#EF4444' : '#38BDF8',
          }}
        >
          <span>⏱️</span>
          <span>{formatTime(remainingSeconds)}</span>
        </div>

        {/* Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
            className="mobile-nav-toggle-btn"
            style={{
              padding: '0.4rem 0.8rem',
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
              padding: '0.5rem 1.25rem',
              background: '#0284C7',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Nộp Bài
          </button>
        </div>
      </header>

      {/* Part Navigation Bar */}
      <div
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          padding: '0.5rem 1.5rem',
          display: 'flex',
          gap: '0.5rem',
          overflowX: 'auto',
        }}
      >
        {parts.map((p) => (
          <button
            key={p.partNumber}
            onClick={() => setActivePartNumber(p.partNumber)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              background: activePartNumber === p.partNumber ? '#0284C7' : '#F1F5F9',
              color: activePartNumber === p.partNumber ? '#FFFFFF' : '#475569',
            }}
          >
            Part {p.partNumber}
          </button>
        ))}
      </div>

      {/* Main Container with Sidebar Navigator */}
      <div style={{ display: 'flex', flex: 1, maxWidth: '1440px', margin: '0 auto', width: '100%', gap: '1rem', padding: '1rem' }}>
        {/* Left/Main Exam Content */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {activePart ? (
            <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.5rem' }}>
              <div style={{ borderBottom: '1px solid #E2E8F0', pb: '1rem', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                  PART {activePart.partNumber}: {activePart.name}
                </h2>
                {activePart.instructions && (
                  <p style={{ fontSize: '0.9rem', color: '#64748B', marginTop: '0.25rem' }}>
                    {activePart.instructions}
                  </p>
                )}
              </div>

              {/* Render Groups in this part */}
              {(activePart.questionGroups || []).map((group, gIdx) => (
                <div
                  key={group._id || gIdx}
                  style={{
                    marginBottom: '2rem',
                    padding: '1.25rem',
                    background: '#F8FAFC',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  {/* Group Media / Passages */}
                  {group.audioUrl && (
                    <div style={{ marginBottom: '1rem' }}>
                      <audio controls src={group.audioUrl} style={{ width: '100%', maxWidth: '500px' }} />
                    </div>
                  )}

                  {group.imageUrl && (
                    <div style={{ marginBottom: '1rem' }}>
                      <img
                        src={group.imageUrl}
                        alt="Question Stimulus"
                        style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', objectFit: 'contain' }}
                      />
                    </div>
                  )}

                  {/* Passages display */}
                  {group.passages && group.passages.length > 0 && (
                    <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {group.passages.map((pas, pIdx) => (
                        <div
                          key={pIdx}
                          style={{
                            padding: '1.25rem',
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.95rem',
                            lineHeight: 1.6,
                            color: '#1E293B',
                          }}
                        >
                          {pas.title && <h4 style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#0F172A' }}>{pas.title}</h4>}
                          <div style={{ whiteSpace: 'pre-wrap' }}>{pas.content}</div>
                          {pas.imageUrl && (
                            <img src={pas.imageUrl} alt="Passage visual" style={{ maxWidth: '100%', marginTop: '0.75rem', borderRadius: '6px' }} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Questions in group */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {(group.questionIds || []).map((q) => {
                      const qId = typeof q === 'object' ? q._id : q;
                      const qNum = q.questionNumber || q.order;
                      const isFlagged = flaggedIds.includes(qId);
                      const selectedOpts = userAnswers[qId] || [];

                      return (
                        <div
                          key={qId}
                          id={`question-${qId}`}
                          style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: activeQuestionId === qId ? '2px solid #0284C7' : '1px solid #E2E8F0',
                            padding: '1.25rem',
                            scrollMarginTop: '100px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <span
                                style={{
                                  background: '#0F172A',
                                  color: '#FFFFFF',
                                  fontSize: '0.85rem',
                                  fontWeight: 800,
                                  padding: '0.2rem 0.6rem',
                                  borderRadius: '6px',
                                }}
                              >
                                Câu {qNum}
                              </span>
                              {q.text && <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>{q.text}</span>}
                            </div>

                            <button
                              onClick={() => handleToggleFlag(qId)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '1.2rem',
                                color: isFlagged ? '#D97706' : '#94A3B8',
                              }}
                              title="Đánh dấu xem lại"
                            >
                              {isFlagged ? '🚩' : '🏳️'}
                            </button>
                          </div>

                          {/* Options Choice */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                            {(q.options || []).map((opt) => {
                              const isSelected = selectedOpts.includes(opt._id);
                              return (
                                <label
                                  key={opt._id}
                                  onClick={() => handleSelectOption(qId, opt._id)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    padding: '0.75rem 1rem',
                                    borderRadius: '8px',
                                    border: isSelected ? '2px solid #0284C7' : '1px solid #E2E8F0',
                                    background: isSelected ? '#F0F9FF' : '#FFFFFF',
                                    cursor: 'pointer',
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
                                    style={{ width: '18px', height: '18px', accentColor: '#0284C7' }}
                                  />
                                  <span>{opt.text}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>Không tìm thấy part</div>
          )}
        </main>

        {/* Right Sidebar: Question Navigator (Desktop) */}
        <aside
          className="toeic-navigator-sidebar"
          style={{
            width: '300px',
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            height: 'fit-content',
            position: 'sticky',
            top: '80px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>Danh Sách Câu Hỏi</h3>
            <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>
              {answeredCount}/{totalQuestions} câu
            </span>
          </div>

          {/* Filters */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', background: '#F1F5F9', padding: '0.25rem', borderRadius: '8px' }}>
            {['ALL', 'UNANSWERED', 'ANSWERED', 'FLAGGED'].map((f) => (
              <button
                key={f}
                onClick={() => setNavFilter(f)}
                style={{
                  padding: '0.3rem',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: navFilter === f ? '#FFFFFF' : 'transparent',
                  color: navFilter === f ? '#0F172A' : '#64748B',
                }}
              >
                {f === 'ALL' ? 'Tất cả' : f === 'UNANSWERED' ? 'Chưa làm' : f === 'ANSWERED' ? 'Đã làm' : 'Đánh dấu'}
              </button>
            ))}
          </div>

          {/* Grid Numbers 1..N */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '0.5rem',
              maxHeight: '400px',
              overflowY: 'auto',
              paddingRight: '0.25rem',
            }}
          >
            {allQuestions.map((q, idx) => {
              const qId = q._id;
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
                  onClick={() => {
                    setActivePartNumber(q.partNumber);
                    setActiveQuestionId(qId);
                    const el = document.getElementById(`question-${qId}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  style={{
                    padding: '0.4rem 0',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: `1px solid ${borderColor}`,
                    background: bgColor,
                    color: textColor,
                    cursor: 'pointer',
                  }}
                >
                  {qNum}
                </button>
              );
            })}
          </div>
        </aside>
      </div>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '2rem', maxWidth: '480px', width: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.75rem' }}>
              Xác Nhận Nộp Bài Thi
            </h3>

            {unansweredCount > 0 ? (
              <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '1rem', borderRadius: '10px', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                ⚠️ <strong>Bạn còn {unansweredCount} câu chưa trả lời.</strong>
                <br />
                Bạn có chắc chắn muốn kết thúc bài thi và nộp bài ngay bây giờ?
              </div>
            ) : (
              <p style={{ color: '#475569', fontSize: '0.95rem', marginBottom: '1.25rem' }}>
                Bạn đã hoàn thành tất cả {totalQuestions} câu hỏi. Bấm nộp bài để xem ngay kết quả!
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
                style={{ padding: '0.65rem 1.25rem', background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
              >
                Tiếp tục làm bài
              </button>
              <button
                onClick={handleSubmitAttempt}
                disabled={submitting}
                style={{ padding: '0.65rem 1.25rem', background: '#0284C7', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
              >
                {submitting ? 'ĐANG NỘP...' : 'XÁC NHẬN NỘP BÀI'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
