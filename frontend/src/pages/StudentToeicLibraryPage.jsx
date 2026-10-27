import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toeicApi } from '../api/toeicApi.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import './StudentToeic.css';

export default function StudentToeicLibraryPage() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeMode, setActiveMode] = useState('ALL');
  const [searchText, setSearchText] = useState('');
  useEffect(() => { fetchToeicTests(); }, []);
  const fetchToeicTests = async () => {
    try { setLoading(true); setError(null); const res = await toeicApi.getStudentToeicTests(); if (res.status === 'success') setTests(res.data.tests || []); }
    catch (err) { setError(err.response?.data?.message || 'Không thể tải danh sách đề thi TOEIC'); }
    finally { setLoading(false); }
  };
  const filteredTests = tests.filter((test) => {
    const matchesMode = activeMode === 'ALL' || test.toeicMode === activeMode;
    const searchableText = `${test.title || ''} ${test.description || ''}`.toLocaleLowerCase('vi');
    return matchesMode && searchableText.includes(searchText.trim().toLocaleLowerCase('vi'));
  });
  const modes = [['ALL', `Tất cả (${tests.length})`], ['full_test', "Full Test (120')"], ['mini_test', 'Mini Test'], ['practice', 'Luyện theo Part']];
  return <div className="toeic-page">
    <PageHeader eyebrow="TOEIC practice" title="Kho đề thi TOEIC" description="Luyện Full Test, Mini Test và từng Part với giao diện mô phỏng thực tế." actions={<div className="toeic-mode-tabs" aria-label="Lọc loại đề thi">{modes.map(([mode, label]) => <button key={mode} type="button" className={activeMode === mode ? 'active' : ''} onClick={() => setActiveMode(mode)}>{label}</button>)}</div>} />
    <label className="assessment-search"><span>Tìm đề thi TOEIC</span><input type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Nhập tên hoặc nội dung đề..." aria-label="Tìm đề thi TOEIC" /></label>
    {loading ? <div className="ds-loading-state">Đang tải kho đề thi TOEIC...</div>
      : error ? <div className="toeic-error ds-error-state"><strong>{error}</strong><button type="button" className="ds-button ds-button--danger" onClick={fetchToeicTests}>Thử lại</button></div>
        : filteredTests.length === 0 ? <div className="ds-empty-state">Chưa có đề thi TOEIC nào thuộc danh mục này.</div>
          : <div className="toeic-library-grid">{filteredTests.map((test) => {
            const mode = test.toeicMode === 'full_test' ? 'FULL TEST (200 CÂU)' : test.toeicMode === 'mini_test' ? 'MINI TEST' : 'PRACTICE';
            const exhausted = !test.hasActiveAttempt && Number(test.attemptLimit || 0) > 0 && test.remainingAttempts <= 0;
            return <article key={test._id} className="toeic-test-card"><div><div className="toeic-card-meta"><StatusBadge label={mode} variant={test.toeicMode === 'full_test' ? 'neutral' : 'warning'} />{test.lastAttempt && <span>Điểm gần nhất: {test.lastAttempt.percentage}%</span>}</div><h2>{test.title}</h2><p>{test.description || 'Đề thi trắc nghiệm TOEIC Listening & Reading chuẩn hóa.'}</p><div className="toeic-specs"><span><strong>{test.questionCount || 200}</strong> câu hỏi</span><span><strong>{test.durationMinutes || 120}</strong> phút</span><span>Listening + Reading</span><span>{test.hasActiveAttempt ? <strong>Đang làm dở</strong> : Number(test.attemptLimit || 0) === 0 ? 'Không giới hạn lượt' : <>Còn <strong>{test.remainingAttempts}</strong>/{test.attemptLimit} lượt</>}</span>{test.lastAttempt && <span>Đã làm <strong>{test.attemptCount}</strong> lượt</span>}</div></div>{test.hasActiveAttempt ? <Link to={`/student/toeic/attempt/${test.activeAttemptId}`} className="ds-button ds-button--secondary toeic-resume">⏳ Tiếp tục bài đang làm →</Link> : exhausted ? <button type="button" className="ds-button ds-button--disabled" disabled>Đã sử dụng hết lượt làm bài</button> : <Link to={`/student/toeic/${test._id}`} className="ds-button ds-button--primary">Xem chi tiết & bắt đầu →</Link>}</article>;
          })}</div>}
  </div>;

}
