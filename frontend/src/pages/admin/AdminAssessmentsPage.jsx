import { useState, useEffect } from 'react';
import { assessmentApi } from '../../api/assessmentApi.js';
import './AdminStudentsPage.css';

export default function AdminAssessmentsPage() {
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    fetchAssessments();
  }, []);

  const fetchAssessments = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await assessmentApi.getAdminAssessments();
      if (res.status === 'success') {
        setAssessments(res.data.assessments || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách bài tập & đề thi');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (ass) => {
    const nextStatus = ass.status === 'published' ? 'draft' : 'published';
    try {
      setFeedback({ type: '', text: '' });
      const res = await assessmentApi.updateAssessmentStatus(ass._id, nextStatus);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: `Đã đổi trạng thái thành: ${nextStatus.toUpperCase()}` });
        fetchAssessments();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Không thể đổi trạng thái bài đánh giá.' });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setFeedback({ type: '', text: '' });
      const res = await assessmentApi.deleteAssessment(deleteTarget._id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Đã xóa bài đánh giá thành công!' });
        setDeleteTarget(null);
        fetchAssessments();
      }
    } catch (err) {
      const isConflict = err.response?.status === 409;
      const msg = isConflict
        ? (err.response?.data?.message || 'Bài tập/đề thi đã có lượt làm bài của học viên, không thể xóa.')
        : (err.response?.data?.message || 'Xóa bài đánh giá thất bại.');
      setFeedback({ type: 'error', text: msg });
      setDeleteTarget(null);
    }
  };

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Quản Lý Bài Tập & Đề Thi</h1>
          <p className="admin-page-sub">Cấu hình bài tập luyện tập, bài kiểm tra định kỳ, điểm đạt và thời gian làm bài.</p>
        </div>
      </div>

      {feedback.text && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', background: feedback.type === 'success' ? '#DCFCE7' : '#FEF2F2', border: `1px solid ${feedback.type === 'success' ? '#86EFAC' : '#FCA5A5'}`, color: feedback.type === 'success' ? '#166534' : '#991B1B' }}>
          {feedback.text}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>Đang tải danh sách bài đánh giá...</div>
      ) : error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', color: '#991B1B', borderRadius: '8px' }}>{error}</div>
      ) : assessments.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          Chưa có bài tập hoặc bài kiểm tra nào trong hệ thống.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tên Bài Đánh Giá</th>
                <th>Phân Loại</th>
                <th>Số Câu Hỏi</th>
                <th>Thời Gian</th>
                <th>Điểm Đạt</th>
                <th>Trạng Thái</th>
                <th>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((ass) => (
                <tr key={ass._id}>
                  <td>
                    <strong>{ass.title}</strong>
                    <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{ass.description}</div>
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        background: ass.type === 'exam' ? '#FEE2E2' : '#DCFCE7',
                        color: ass.type === 'exam' ? '#991B1B' : '#166534',
                      }}
                    >
                      {ass.type === 'exam' ? 'BÀI KIỂM TRA' : 'BÀI TẬP'}
                    </span>
                  </td>
                  <td><strong>{ass.questions?.length || 0}</strong> câu</td>
                  <td>{ass.duration || ass.minutes || 30} phút</td>
                  <td>{ass.passScore || 0}/{ass.totalScore || 100}</td>
                  <td>
                    <span className={`status-badge ${ass.status === 'published' ? 'badge-active' : 'badge-pending'}`}>
                      {ass.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleToggleStatus(ass)}
                        style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        {ass.status === 'published' ? 'Ẩn' : 'Xuất bản'}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(ass)}
                        style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: 'none', background: '#FEE2E2', color: '#991B1B', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
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
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.75rem' }}>Xác Nhận Xóa Bài Đánh Giá</h3>
            <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1.5rem' }}>
              Bạn có chắc chắn muốn xóa bài <strong>"{deleteTarget.title}"</strong>?
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
