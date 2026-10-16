import { useEffect, useState } from 'react';
import { assessmentApi } from '../../api/assessmentApi.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import './AdminStudentsPage.css';

export default function AdminResultsPage() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState('ALL');
  useEffect(() => { fetchAdminResults(); }, []);
  const fetchAdminResults = async () => {
    try { setLoading(true); setError(null); const res = await assessmentApi.getAdminResults(); if (res.status === 'success') setResults(res.data.results || []); }
    catch (err) { setError(err.response?.data?.message || 'Không thể tải danh sách kết quả làm bài'); }
    finally { setLoading(false); }
  };
  const filteredResults = results.filter((result) => filterType === 'ALL' || result.assessment?.type === filterType);
  const tabs = [['ALL', `Tất cả (${results.length})`], ['exercise', 'Bài tập'], ['exam', 'Bài kiểm tra']];
  return <div className="admin-page-container">
    <PageHeader eyebrow="Báo cáo học tập" title="Kết quả làm bài học viên" description="Theo dõi kết quả làm bài tập và điểm thi thực tế của từng học viên." />
    <div className="admin-filter-tabs" aria-label="Lọc kết quả">{tabs.map(([type, label]) => <button key={type} type="button" className={filterType === type ? 'active' : ''} onClick={() => setFilterType(type)}>{label}</button>)}</div>
    {loading ? <div className="admin-table-skeleton"><i /><i /><i /></div>
      : error ? <div className="admin-error">{error}</div>
        : filteredResults.length === 0 ? <div className="admin-empty">Chưa có lượt nộp bài nào được ghi nhận.</div>
          : <div className="admin-table-container"><table className="admin-data-table"><thead><tr><th>Học viên</th><th>Bài đánh giá</th><th>Phân loại</th><th>Điểm số</th><th>Tỷ lệ thành công</th><th>Điểm đạt</th><th>Thời gian làm</th><th>Thời gian nộp</th></tr></thead><tbody>{filteredResults.map((result) => { const isPass = result.passed === true; return <tr key={result._id}><td><strong>{result.student?.fullName || result.student?.email}</strong><small className="assessment-table-sub">{result.student?.email}</small></td><td><strong>{result.assessment?.title || 'Bài đánh giá'}</strong></td><td><StatusBadge status={result.assessment?.type} /></td><td><strong>{result.score}</strong> / {result.totalScore || 100}</td><td><StatusBadge label={`${result.scorePercentage ?? result.percentage}% · ${isPass ? 'Đạt' : 'Chưa đạt'}`} variant={isPass ? 'success' : 'danger'} /></td><td>{result.passScore}%</td><td>{result.duration ? `${Math.round(result.duration / 60)} phút` : '---'}</td><td>{result.submittedAt ? new Date(result.submittedAt).toLocaleString('vi-VN') : '---'}</td></tr>; })}</tbody></table></div>}
  </div>;
}
