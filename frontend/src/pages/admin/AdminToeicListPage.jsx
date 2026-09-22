import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toeicApi } from '../../api/toeicApi.js';
import './AdminStudentsPage.css';

export default function AdminToeicListPage() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchToeicTests();
  }, []);

  const fetchToeicTests = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await toeicApi.getAdminToeicTests();
      if (res.status === 'success') {
        setTests(res.data.tests || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách đề thi TOEIC');
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (id) => {
    try {
      setFeedback({ type: '', text: '' });
      const res = await toeicApi.duplicateToeicTest(id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Nhân bản đề thi TOEIC thành công!' });
        fetchToeicTests();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Lỗi khi nhân bản đề thi' });
    }
  };

  const handlePublish = async (id) => {
    try {
      setFeedback({ type: '', text: '' });
      const res = await toeicApi.publishToeicTest(id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Đã xuất bản đề thi TOEIC thành công!' });
        fetchToeicTests();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Không thể xuất bản đề thi.' });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setFeedback({ type: '', text: '' });
      const res = await toeicApi.deleteToeicTest(deleteTarget._id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Đã xóa đề thi TOEIC thành công!' });
        setDeleteTarget(null);
        fetchToeicTests();
      }
    } catch (err) {
      const isConflict = err.response?.status === 409;
      const msg = isConflict
        ? (err.response?.data?.message || 'Đề thi đã có lượt nộp bài của học viên, không thể xóa.')
        : (err.response?.data?.message || 'Xóa đề thi thất bại.');
      setFeedback({ type: 'error', text: msg });
      setDeleteTarget(null);
    }
  };

  return (
    <div className="admin-page-container">
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="admin-page-title">Quản Lý Đề Thi TOEIC</h1>
          <p className="admin-page-sub">Tạo và quản lý các bộ đề TOEIC Full Test, Mini Test và Luyện tập theo Part.</p>
        </div>
        <Link
          to="/admin/toeic-tests/new"
          style={{
            background: '#0284C7',
            color: '#FFFFFF',
            padding: '0.75rem 1.25rem',
            borderRadius: '10px',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '0.9rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          + Tạo Đề TOEIC Mới
        </Link>
      </div>

      {feedback.text && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', background: feedback.type === 'success' ? '#DCFCE7' : '#FEF2F2', border: `1px solid ${feedback.type === 'success' ? '#86EFAC' : '#FCA5A5'}`, color: feedback.type === 'success' ? '#166534' : '#991B1B' }}>
          {feedback.text}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>Đang tải danh sách đề thi TOEIC...</div>
      ) : error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', color: '#991B1B', borderRadius: '8px' }}>{error}</div>
      ) : tests.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          Chưa có đề thi TOEIC nào. Hãy bấm nút <strong>"+ Tạo Đề TOEIC Mới"</strong> để bắt đầu.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tên Đề Thi</th>
                <th>Loại Đề</th>
                <th>Số Câu</th>
                <th>Thời Gian</th>
                <th>Trạng Thái</th>
                <th>Lượt Thi</th>
                <th>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t._id}>
                  <td>
                    <strong>{t.title}</strong>
                    <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{t.description || 'Không có mô tả'}</div>
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        background: t.toeicMode === 'full_test' ? '#E0F2FE' : '#FEF3C7',
                        color: t.toeicMode === 'full_test' ? '#0369A1' : '#D97706',
                      }}
                    >
                      {t.toeicMode === 'full_test' ? 'FULL TEST (200 câu)' : t.toeicMode === 'mini_test' ? 'MINI TEST' : 'PRACTICE'}
                    </span>
                  </td>
                  <td><strong>{t.questions?.length || 0}</strong> câu</td>
                  <td>{t.durationMinutes || 120} phút</td>
                  <td>
                    <span className={`status-badge ${t.status === 'published' ? 'badge-active' : 'badge-pending'}`}>
                      {t.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
                    </span>
                  </td>
                  <td><strong>{t.attemptCount || 0}</strong> lượt</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => navigate(`/admin/toeic-tests/${t._id}/edit`)}
                        style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => handleDuplicate(t._id)}
                        style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        Nhân bản
                      </button>
                      <button
                        onClick={() => navigate(`/admin/toeic-tests/${t._id}/preview`)}
                        style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid #0284C7', background: '#E0F2FE', color: '#0369A1', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        Preview
                      </button>
                      {t.status !== 'published' && (
                        <button
                          onClick={() => handlePublish(t._id)}
                          style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: 'none', background: '#DCFCE7', color: '#166534', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                        >
                          Xuất bản
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteTarget(t)}
                        style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: 'none', background: '#FEE2E2', color: '#991B1B', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '1.75rem', maxWidth: '440px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.75rem' }}>Xác Nhận Xóa Đề Thi TOEIC</h3>
            <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1.5rem' }}>
              Bạn có chắc chắn muốn xóa đề thi <strong>"{deleteTarget.title}"</strong>?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={() => setDeleteTarget(null)} style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer', fontWeight: 600 }}>Hủy</button>
              <button onClick={handleDeleteConfirm} style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: '#DC2626', color: '#FFFFFF', cursor: 'pointer', fontWeight: 600 }}>Xác Nhận Xóa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
