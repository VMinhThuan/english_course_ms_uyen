import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { assessmentApi } from '../api/assessmentApi.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import './StudentAssessmentsPage.css';

const formatSubmittedAt = (value) => value
  ? new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
  : '';

export default function StudentAssessmentsPage() {
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState('ALL');
  const [searchText, setSearchText] = useState('');

  useEffect(() => { fetchAssessments(); }, []);

  const fetchAssessments = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await assessmentApi.getAvailableAssessments();
      if (response.status === 'success') setAssessments(response.data.assessments || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách bài tập & đề thi');
    } finally {
      setLoading(false);
    }
  };

  const filteredAssessments = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase('vi');
    return assessments.filter((item) => {
      const matchesType = filterType === 'ALL' || item.type === filterType;
      const searchableText = [item.title, item.description, item.lesson?.title, item.course?.title]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('vi');
      return matchesType && (!query || searchableText.includes(query));
    });
  }, [assessments, filterType, searchText]);

  const tabs = [
    ['ALL', `Tất cả (${assessments.length})`],
    ['exercise', 'Bài tập'],
    ['exam', 'Bài kiểm tra'],
  ];

  return (
    <div className="assessment-page">
      <PageHeader
        eyebrow="Luyện tập"
        title="Bài tập & đề thi"
        description="Chọn bài tập hoặc bài kiểm tra được xuất bản để luyện tập và củng cố kiến thức."
        actions={<div className="assessment-tabs">{tabs.map(([type, label]) => (
          <button type="button" key={type} className={filterType === type ? 'active' : ''} onClick={() => setFilterType(type)}>{label}</button>
        ))}</div>}
      />

      <label className="assessment-search">
        <span>Tìm bài tập hoặc đề thi</span>
        <input
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Nhập tên hoặc nội dung..."
          aria-label="Tìm bài tập hoặc đề thi"
        />
      </label>

      {loading ? <div className="ds-loading-state">Đang tải bài tập & đề thi...</div>
        : error ? <div className="ds-error-state" role="alert">{error}</div>
          : filteredAssessments.length === 0
            ? <div className="ds-empty-state">Không tìm thấy bài tập hoặc đề thi phù hợp.</div>
            : <div className="assessment-grid">{filteredAssessments.map((assessment) => {
              const attemptLimit = Number(assessment.attemptLimit || 0);
              const remainingAttempts = attemptLimit === 0 ? null : assessment.remainingAttempts;
              const exhausted = !assessment.hasActiveAttempt && attemptLimit > 0 && remainingAttempts <= 0;
              return (
                <article key={assessment._id} className="assessment-card">
                  <div>
                    <div className="assessment-card-meta">
                      <StatusBadge status={assessment.type} />
                      <span>Điểm đạt: {assessment.passScore ?? 0}%</span>
                    </div>
                    <h2>{assessment.title}</h2>
                    <p>{assessment.description || 'Bài đánh giá kiểm tra kiến thức của học viên.'}</p>
                    <div className="assessment-specs">
                      <span><strong>{assessment.questionCount ?? assessment.questions?.length ?? 0}</strong> câu hỏi</span>
                      <span><strong>{assessment.durationMinutes || 30}</strong> phút</span>
                      <span>{assessment.hasActiveAttempt ? <strong>Đang làm dở</strong> : attemptLimit === 0 ? 'Không giới hạn lượt' : <>Còn <strong>{remainingAttempts}</strong>/{attemptLimit} lượt</>}</span>
                      {assessment.lastAttempt && <span>Đã làm <strong>{assessment.attemptCount}</strong> lượt</span>}
                    </div>
                    {assessment.lastAttempt && (
                      <div className="assessment-last-result" aria-label="Kết quả gần nhất">
                        <strong>Kết quả gần nhất: {assessment.lastAttempt.percentage}%</strong>
                        <span>{assessment.lastAttempt.score} / {assessment.lastAttempt.maxScore} điểm · {formatSubmittedAt(assessment.lastAttempt.submittedAt)}</span>
                      </div>
                    )}
                  </div>
                  {exhausted ? (
                    <button type="button" className="ds-button ds-button--disabled" disabled>Đã sử dụng hết lượt làm bài</button>
                  ) : (
                    <Link to={`/student/tests/${assessment._id}`} className={`ds-button ${assessment.hasActiveAttempt ? 'ds-button--secondary' : 'ds-button--primary'}`}>
                      {assessment.hasActiveAttempt ? 'Tiếp tục làm bài →' : 'Bắt đầu làm bài →'}
                    </Link>
                  )}
                </article>
              );
            })}</div>}
    </div>
  );
}
