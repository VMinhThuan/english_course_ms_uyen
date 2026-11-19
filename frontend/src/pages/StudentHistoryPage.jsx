import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { assessmentApi } from '../api/assessmentApi.js';
import learningApi from '../api/learningApi.js';
import ExerciseSubmissionTree from '../components/learning/ExerciseSubmissionTree.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import './StudentHistoryPage.css';

const formatSubmittedAt = (value) => (
  value ? new Date(value).toLocaleString('vi-VN') : '—'
);

export default function StudentHistoryPage() {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exerciseSubmissions, setExerciseSubmissions] = useState([]);
  const [exerciseLoading, setExerciseLoading] = useState(true);
  const [exerciseError, setExerciseError] = useState('');

  useEffect(() => {
    let active = true;
    assessmentApi.getStudentHistory()
      .then((res) => {
        if (active && res.status === 'success') setAttempts(res.data.history || []);
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.message || 'Không thể tải lịch sử đề thi và bài đánh giá.');
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    learningApi.getMyExerciseSubmissions()
      .then((res) => {
        if (active) setExerciseSubmissions(res.data?.submissions || []);
      })
      .catch((err) => {
        if (active) setExerciseError(err.response?.data?.message || 'Không thể tải lịch sử bài tập đã nộp.');
      })
      .finally(() => { if (active) setExerciseLoading(false); });

    return () => { active = false; };
  }, []);

  return (
    <div className="student-history-page">
      <PageHeader eyebrow="Lịch sử học tập" title="Lịch sử làm bài" description="Xem lại từng lượt làm bài tập và kết quả các đề thi đã nộp." />

      <section className="history-section" aria-labelledby="exercise-history-title">
        <div className="history-section-heading">
          <div>
            <p className="history-section-eyebrow">Bài tập đã nộp</p>
            <h2 id="exercise-history-title">Lịch sử bài tập</h2>
          </div>
          {!exerciseLoading && !exerciseError && (
            <span className="history-total">{exerciseSubmissions.length} lượt nộp</span>
          )}
        </div>
        <ExerciseSubmissionTree
          submissions={exerciseSubmissions}
          loading={exerciseLoading}
          error={exerciseError}
        />
      </section>

      <section className="history-section" aria-labelledby="assessment-history-title">
        <div className="history-section-heading">
          <div>
            <p className="history-section-eyebrow">Assessment và TOEIC</p>
            <h2 id="assessment-history-title">Lịch sử đề thi và bài đánh giá</h2>
          </div>
        </div>
        {loading ? <div className="ds-loading-state">Đang tải lịch sử đề thi...</div>
          : error ? <div className="ds-error-state">{error}</div>
            : attempts.length === 0 ? (
              <div className="history-empty ds-empty-state">
                Bạn chưa có lượt làm đề thi hoặc bài đánh giá nào.
                <Link to="/student/assessments" className="ds-text-link">Xem bài đánh giá →</Link>
              </div>
            ) : (
              <div className="ds-table-shell">
                <div className="ds-table-scroll">
                  <table className="ds-data-table history-table">
                    <thead>
                      <tr><th>Tên bài đánh giá</th><th>Phân loại</th><th>Ngày nộp bài</th><th>Điểm số</th><th>Tỷ lệ</th><th>Kết quả</th><th>Thời gian</th><th className="ds-table-action-header">Thao tác</th></tr>
                    </thead>
                    <tbody>{attempts.map((att) => {
                      const isToeic = att.assessment?.examFormat === 'toeic' || !!att.toeicBreakdown?.estimatedToeicScore;
                      const isPass = att.passed === true;
                      const resultUrl = isToeic ? `/student/toeic/results/${att._id}` : `/student/results/${att._id}`;
                      const typeLabel = isToeic ? 'TOEIC' : att.assessment?.type === 'exam' ? 'Bài kiểm tra' : 'Bài tập';

                      return (
                        <tr key={att._id}>
                          <td><strong>{att.assessment?.title || (isToeic ? 'Đề thi TOEIC' : 'Bài đánh giá')}</strong></td>
                          <td><StatusBadge label={typeLabel} variant={isToeic ? 'neutral' : att.assessment?.type === 'exam' ? 'danger' : 'success'} /></td>
                          <td>{formatSubmittedAt(att.submittedAt)}</td>
                          <td>{isToeic && att.toeicBreakdown?.estimatedToeicScore !== undefined
                            ? <div><strong className="history-score">{att.toeicBreakdown.estimatedToeicScore}</strong> / 990<div className="history-subscore">L: {att.toeicBreakdown.listeningScore ?? 0} | R: {att.toeicBreakdown.readingScore ?? 0}</div></div>
                            : <div><strong>{att.score}</strong> / {att.totalScore || att.maxScore}</div>}</td>
                          <td><strong className={isToeic ? 'history-score' : isPass ? 'history-score history-score--pass' : 'history-score history-score--fail'}>{att.scorePercentage ?? att.percentage}%</strong></td>
                          <td><StatusBadge label={isToeic ? 'Hoàn thành' : isPass ? 'Đạt' : 'Chưa đạt'} variant={isToeic || isPass ? 'success' : 'danger'} /></td>
                          <td>{att.duration ? `${Math.round(att.duration / 60)} phút` : '—'}</td>
                          <td className="ds-table-action"><Link to={resultUrl} className="ds-button ds-button--secondary ds-button--small">Xem chi tiết</Link></td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              </div>
            )}
      </section>
    </div>
  );
}
