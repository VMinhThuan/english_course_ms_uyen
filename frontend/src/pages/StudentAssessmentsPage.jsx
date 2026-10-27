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
  const [searchText, setSearchText] = useState('');

  useEffect(() => { fetchAssessments(); }, []);

  const fetchAssessments = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await assessmentApi.getAvailableAssessments();
      if (response.status === 'success') setAssessments(response.data.assessments || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách bài tập ngữ pháp');
    } finally {
      setLoading(false);
    }
  };

  const filteredAssessments = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase('vi');
    return assessments.filter((item) => {
      const searchableText = [item.title, item.description]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('vi');
      return !query || searchableText.includes(query);
    });
  }, [assessments, searchText]);

  return (
    <div className="assessment-page">
      <PageHeader
        eyebrow="Bài tập"
        title="Bài tập ngữ pháp"
        description="Các bài tập ngữ pháp đã xuất bản sẽ xuất hiện tại đây cho học viên."
      />

      <label className="assessment-search">
        <span>Tìm bài tập</span>
        <input
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Nhập tên hoặc nội dung..."
          aria-label="Tìm bài tập"
        />
      </label>

      {loading ? <div className="ds-loading-state">Đang tải bài tập...</div>
        : error ? <div className="ds-error-state" role="alert">{error}</div>
          : filteredAssessments.length === 0
            ? <div className="ds-empty-state">Không tìm thấy bài tập phù hợp.</div>
            : <div className="assessment-grid">{filteredAssessments.map((assessment) => {
              const attemptLimit = Number(assessment.attemptLimit || 0);
              const remainingAttempts = attemptLimit === 0 ? null : assessment.remainingAttempts;
              const exhausted = !assessment.hasActiveAttempt && attemptLimit > 0 && remainingAttempts <= 0;
              return (
                <article key={assessment._id} className="assessment-card">
                  <div>
                    <div className="assessment-card-meta">
                      <StatusBadge status="exercise" />
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
