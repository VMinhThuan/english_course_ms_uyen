import { useState, useEffect } from 'react';
import { materialApi } from '../../api/materialApi.js';
import './AdminStudentsPage.css';

export default function AdminMaterialsPage() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await materialApi.getAdminMaterials();
      if (res.status === 'success') {
        setMaterials(res.data.materials || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách tài liệu');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setFeedback({ type: '', text: '' });
      const res = await materialApi.deleteMaterial(deleteTarget._id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Đã xóa tài liệu thành công!' });
        setDeleteTarget(null);
        fetchMaterials();
      }
    } catch (err) {
      const msg = err.response?.status === 409
        ? (err.response?.data?.message || 'Tài liệu đang được học viên sử dụng, không thể xóa.')
        : (err.response?.data?.message || 'Xóa tài liệu thất bại.');
      setFeedback({ type: 'error', text: msg });
      setDeleteTarget(null);
    }
  };

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Quản Lý Tài Liệu Hướng Dẫn</h1>
          <p className="admin-page-sub">Quản lý file đính kèm, PDF, bài giảng đính kèm trong bài học.</p>
        </div>
      </div>

      {feedback.text && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', background: feedback.type === 'success' ? '#DCFCE7' : '#FEF2F2', border: `1px solid ${feedback.type === 'success' ? '#86EFAC' : '#FCA5A5'}`, color: feedback.type === 'success' ? '#166534' : '#991B1B' }}>
          {feedback.text}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>Đang tải danh sách tài liệu...</div>
      ) : error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', color: '#991B1B', borderRadius: '8px' }}>{error}</div>
      ) : materials.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          Chưa có tài liệu nào được tạo trong hệ thống.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tên Tài Liệu</th>
                <th>Bài Học</th>
                <th>Loại File</th>
                <th>Cho Phép Tải</th>
                <th>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((mat) => (
                <tr key={mat._id}>
                  <td>
                    <strong>{mat.title}</strong>
                    <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{mat.description}</div>
                  </td>
                  <td>{mat.lesson?.title || '---'}</td>
                  <td><code style={{ background: '#F1F5F9', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>{mat.fileType || 'PDF'}</code></td>
                  <td>
                    <span className={`status-badge ${mat.allowDownload ? 'badge-active' : 'badge-pending'}`}>
                      {mat.allowDownload ? 'Cho phép' : 'Chỉ xem'}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => setDeleteTarget(mat)}
                      style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: 'none', background: '#FEE2E2', color: '#991B1B', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                    >
                      Xóa
                    </button>
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
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.75rem' }}>Xác Nhận Xóa Tài Liệu</h3>
            <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1.5rem' }}>
              Bạn có chắc chắn muốn xóa tài liệu <strong>"{deleteTarget.title}"</strong>?
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
