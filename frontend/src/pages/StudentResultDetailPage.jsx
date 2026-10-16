import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { assessmentApi } from '../api/assessmentApi.js';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import AssessmentQuestionReviewCard from '../components/assessment/AssessmentQuestionReviewCard.jsx';
import '../styles/assessment-screens.css';

export default function StudentResultDetailPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (attemptId) {
      fetchResult();
    }
  }, [attemptId]);

  const fetchResult = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await assessmentApi.getAttemptResult(attemptId);
      if (res.status === 'success') {
        const attData = res.data?.attempt || res.data?.result || res.data;
        const assData = res.data?.assessment || {};
        if (assData.examFormat === 'toeic' || attData.toeicBreakdown) {
          navigate(`/student/toeic/results/${attemptId}`, { replace: true });
          return;
        }
        setResult(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải chi tiết kết quả');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="student-result-screen student-result-screen--state student-result-screen--detail student-result-screen--loading">
        Đang tải kết quả bài làm...
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="student-result-screen student-result-screen--state student-result-screen--detail student-result-screen--error">
        <div className="student-result-screen__error-message">
          {error || 'Không tìm thấy kết quả làm bài'}
        </div>
        <Link to="/student/history" style={{ color: 'var(--brand-coffee)', fontWeight: 600, textDecoration: 'none' }}>
          ← Quay lại Lịch sử làm bài
        </Link>
      </div>
    );
  }

  const attemptData = result.attempt || result.result || result;
  const assessmentData = result.assessment || { title: attemptData.assessmentTitle, type: attemptData.assessmentType, passScore: attemptData.passScore };
  const showAnswers = result.showCorrectAnswers !== undefined ? result.showCorrectAnswers : attemptData.showCorrectAnswers;
  const questionsList = result.questionDetails || result.result?.questions || result.questions || [];
  const passScore = attemptData.passScore ?? assessmentData.passScore ?? 0;
  const isPassed = attemptData.passed === true;

  return (
    <div className="student-result-screen student-result-screen--detail">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/student/history" className="ds-back-link">
          ← Quay lại Lịch sử làm bài
        </Link>
        <StatusBadge status={assessmentData?.type} label={assessmentData?.type === 'exam' ? 'BÀI KIỂM TRA' : 'BÀI TẬP'} />
      </div>

      {/* Result Overview Header Card */}
      <div className="ds-card student-result-screen__overview">
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-text)', marginBottom: '0.5rem' }}>
          {assessmentData?.title || attemptData?.assessmentTitle || 'Bài đánh giá'}
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--brand-muted)', marginBottom: '1.5rem' }}>
          Thời gian nộp: {attemptData?.submittedAt ? new Date(attemptData.submittedAt).toLocaleString('vi-VN') : '---'}
        </p>

        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div
            style={{
              fontSize: '3rem',
              fontWeight: 900,
              color: isPassed ? 'var(--brand-success)' : 'var(--brand-danger)',
              lineHeight: 1,
            }}
          >
            {attemptData?.score || 0} <span style={{ fontSize: '1.5rem', color: 'var(--brand-muted)' }}>/ {attemptData?.totalScore || attemptData?.maxScore || 100}</span>
          </div>
          <StatusBadge status={isPassed ? 'passed' : 'failed'} label={`${attemptData?.scorePercentage ?? attemptData?.percentage ?? 0}% — ${isPassed ? 'ĐẠT' : 'CHƯA ĐẠT'}`} />
        </div>

        {/* Detailed Stats Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '1rem',
            background: 'var(--brand-bg-sub)',
            padding: '1.25rem',
            borderRadius: '12px',
            border: '1px solid var(--brand-border)',
          }}
        >
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--brand-success)' }}>{attemptData?.correctCount || 0}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--brand-muted)' }}>Câu đúng</div>
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--brand-danger)' }}>{attemptData?.incorrectCount || 0}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--brand-muted)' }}>Câu sai</div>
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--brand-warning)' }}>{attemptData?.unansweredCount || 0}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--brand-muted)' }}>Chưa trả lời</div>
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--brand-coffee)' }}>
              {attemptData?.duration ? `${Math.round(attemptData.duration / 60)} phút` : '---'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--brand-muted)' }}>Thời gian làm</div>
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--brand-muted)' }}>{passScore}%</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--brand-muted)' }}>Điểm đạt</div>
          </div>
        </div>
      </div>

      {/* Question Review Section */}
      {showAnswers ? (
        <div className="assessment-review-list">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--brand-text)' }}>Xem Lại Chi Tiết Câu Hỏi</h2>
          {questionsList.map((question, idx) => (
            <AssessmentQuestionReviewCard
              key={question._id || question.questionId || idx}
              question={question}
              questionNumber={idx + 1}
              showCorrectAnswer={showAnswers}
            />
          ))}
        </div>
      ) : (
        <div style={{ background: 'var(--brand-warning-bg)', border: '1px solid var(--brand-warning-border)', color: 'var(--brand-warning)', padding: '1.25rem', borderRadius: '12px', textAlign: 'center' }}>
          Bài kiểm tra này không bật chế độ hiển thị đáp án chi tiết sau khi làm.
        </div>
      )}
    </div>
  );
}
