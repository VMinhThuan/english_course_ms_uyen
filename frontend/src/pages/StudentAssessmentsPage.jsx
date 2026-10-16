import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { assessmentApi } from '../api/assessmentApi.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import './StudentAssessmentsPage.css';

export default function StudentAssessmentsPage() {
  const [assessments, setAssessments] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(null); const [filterType, setFilterType] = useState('ALL');
  useEffect(() => { fetchAssessments(); }, []);
  const fetchAssessments = async () => { try { setLoading(true); setError(null); const res = await assessmentApi.getAvailableAssessments(); if (res.status === 'success') setAssessments(res.data.assessments || []); } catch (err) { setError(err.response?.data?.message || 'Không thể tải danh sách bài tập & đề thi'); } finally { setLoading(false); } };
  const filteredAssessments = assessments.filter((item) => filterType === 'ALL' || item.type === filterType);
  const tabs = [['ALL', `Tất cả (${assessments.length})`], ['exercise', 'Bài tập'], ['exam', 'Bài kiểm tra']];
  return <div className="assessment-page"><PageHeader eyebrow="Luyện tập" title="Bài tập & đề thi" description="Chọn bài tập hoặc bài kiểm tra được xuất bản để luyện tập và củng cố kiến thức." actions={<div className="assessment-tabs">{tabs.map(([type, label]) => <button type="button" key={type} className={filterType === type ? 'active' : ''} onClick={() => setFilterType(type)}>{label}</button>)}</div>} />{loading ? <div className="ds-loading-state">Đang tải bài tập & đề thi...</div> : error ? <div className="ds-error-state">{error}</div> : filteredAssessments.length === 0 ? <div className="ds-empty-state">Hiện chưa có bài tập hay đề thi nào thuộc danh mục này.</div> : <div className="assessment-grid">{filteredAssessments.map((assessment) => <article key={assessment._id} className="assessment-card"><div><div className="assessment-card-meta"><StatusBadge status={assessment.type} /><span>Điểm đạt: {assessment.passScore ?? 0}%</span></div><h2>{assessment.title}</h2><p>{assessment.description || 'Bài đánh giá kiểm tra kiến thức của học viên.'}</p><div className="assessment-specs"><span><strong>{assessment.questions?.length || 0}</strong> câu hỏi</span><span><strong>{assessment.duration || assessment.minutes || 30}</strong> phút</span><span>Lần làm: <strong>{assessment.attemptLimit === 0 ? 'Không giới hạn' : assessment.attemptLimit}</strong></span></div></div><Link to={`/student/tests/${assessment._id}`} className="ds-button ds-button--primary">Bắt đầu làm bài →</Link></article>)}</div>}</div>;
}
