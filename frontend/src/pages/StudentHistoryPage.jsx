import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { assessmentApi } from '../api/assessmentApi.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import './StudentHistoryPage.css';

export default function StudentHistoryPage() {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { fetchHistory(); }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await assessmentApi.getStudentHistory();
      if (res.status === 'success') setAttempts(res.data.history || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải lịch sử làm bài');
    } finally { setLoading(false); }
  };

  return <div className="student-history-page">
    <PageHeader eyebrow="Lịch sử học tập" title="Lịch sử làm bài" description="Xem lại các bài tập và đề thi bạn đã thực hiện cùng chi tiết kết quả." />
    {loading ? <div className="ds-loading-state">Đang tải lịch sử...</div>
      : error ? <div className="ds-error-state">{error}</div>
        : attempts.length === 0 ? <div className="history-empty ds-empty-state">Bạn chưa nộp bài tập hoặc đề thi nào.<Link to="/student/assessments" className="ds-text-link">Làm bài ngay →</Link></div>
          : <div className="ds-table-shell"><div className="ds-table-scroll"><table className="ds-data-table history-table"><thead><tr><th>Tên bài đánh giá</th><th>Phân loại</th><th>Ngày nộp bài</th><th>Điểm số</th><th>Tỷ lệ</th><th>Kết quả</th><th>Thời gian</th><th className="ds-table-action-header">Thao tác</th></tr></thead><tbody>{attempts.map((att) => {
            const isToeic = att.assessment?.examFormat === 'toeic' || !!att.toeicBreakdown?.estimatedToeicScore;
            const isPass = att.passed === true;
            const resultUrl = isToeic ? `/student/toeic/results/${att._id}` : `/student/results/${att._id}`;
            const typeLabel = isToeic ? 'TOEIC' : att.assessment?.type === 'exam' ? 'Bài kiểm tra' : 'Bài tập';
            return <tr key={att._id}><td><strong>{att.assessment?.title || (isToeic ? 'Đề thi TOEIC' : 'Bài đánh giá')}</strong></td><td><StatusBadge label={typeLabel} variant={isToeic ? 'neutral' : att.assessment?.type === 'exam' ? 'danger' : 'success'} /></td><td>{att.submittedAt ? new Date(att.submittedAt).toLocaleString('vi-VN') : '---'}</td><td>{isToeic && att.toeicBreakdown?.estimatedToeicScore !== undefined ? <div><strong className="history-score">{att.toeicBreakdown.estimatedToeicScore}</strong> / 990<div className="history-subscore">L: {att.toeicBreakdown.listeningScore ?? 0} | R: {att.toeicBreakdown.readingScore ?? 0}</div></div> : <div><strong>{att.score}</strong> / {att.totalScore || att.maxScore}</div>}</td><td><strong className={isToeic ? 'history-score' : isPass ? 'history-score history-score--pass' : 'history-score history-score--fail'}>{att.scorePercentage ?? att.percentage}%</strong></td><td><StatusBadge label={isToeic ? 'Hoàn thành' : isPass ? 'Đạt' : 'Chưa đạt'} variant={isToeic || isPass ? 'success' : 'danger'} /></td><td>{att.duration ? `${Math.round(att.duration / 60)} phút` : '---'}</td><td className="ds-table-action"><Link to={resultUrl} className="ds-button ds-button--secondary ds-button--small">Xem chi tiết</Link></td></tr>;
          })}</tbody></table></div></div>}
  </div>;
}
