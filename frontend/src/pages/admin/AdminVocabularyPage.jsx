import { useState, useEffect } from 'react';
import { vocabularyApi } from '../../api/vocabularyApi.js';
import './AdminStudentsPage.css';

export default function AdminVocabularyPage() {
  const [vocabularies, setVocabularies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchVocabulary();
  }, []);

  const fetchVocabulary = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await vocabularyApi.getAdminVocabulary();
      if (res.status === 'success') {
        setVocabularies(res.data.vocabularies || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách từ vựng');
    } finally {
      setLoading(false);
    }
  };

  const filteredVocab = vocabularies.filter((v) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (v.word || '').toLowerCase().includes(term) || (v.meaning || '').toLowerCase().includes(term);
  });

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setFeedback({ type: '', text: '' });
      const res = await vocabularyApi.deleteVocabulary(deleteTarget._id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Đã xóa từ vựng thành công!' });
        setDeleteTarget(null);
        fetchVocabulary();
      }
    } catch (err) {
      const msg = err.response?.status === 409
        ? (err.response?.data?.message || 'Từ vựng đang được sử dụng trong bài kiểm tra.')
        : (err.response?.data?.message || 'Xóa từ vựng thất bại.');
      setFeedback({ type: 'error', text: msg });
      setDeleteTarget(null);
    }
  };

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Quản Lý Từ Vựng (Vocabulary Bank)</h1>
          <p className="admin-page-sub">Quản lý từ vựng, phiên âm, nghĩa tiếng Việt và ví dụ minh họa.</p>
        </div>
      </div>

      {feedback.text && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', background: feedback.type === 'success' ? '#DCFCE7' : '#FEF2F2', border: `1px solid ${feedback.type === 'success' ? '#86EFAC' : '#FCA5A5'}`, color: feedback.type === 'success' ? '#166534' : '#991B1B' }}>
          {feedback.text}
        </div>
      )}

      {/* Search Input */}
      <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '1.5rem' }}>
        <input
          type="text"
          placeholder="Tìm kiếm từ vựng hoặc nghĩa tiếng Việt..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: '400px', padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
        />
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>Đang tải danh sách từ vựng...</div>
      ) : error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', color: '#991B1B', borderRadius: '8px' }}>{error}</div>
      ) : filteredVocab.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          Chưa tìm thấy từ vựng nào phù hợp.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Từ Tiếng Anh</th>
                <th>Phiên Âm</th>
                <th>Loại Từ</th>
                <th>Nghĩa Tiếng Việt</th>
                <th>Bài Học</th>
                <th>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredVocab.map((v) => (
                <tr key={v._id}>
                  <td><strong style={{ fontSize: '1.05rem', color: '#0284C7' }}>{v.word}</strong></td>
                  <td><span style={{ fontStyle: 'italic', color: '#64748B' }}>{v.phonetic || '---'}</span></td>
                  <td><code style={{ background: '#F1F5F9', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>{v.partOfSpeech || 'noun'}</code></td>
                  <td><strong>{v.meaning}</strong></td>
                  <td>{v.lesson?.title || '---'}</td>
                  <td>
                    <button
                      onClick={() => setDeleteTarget(v)}
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
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.75rem' }}>Xác Nhận Xóa Từ Vựng</h3>
            <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1.5rem' }}>
              Bạn có chắc chắn muốn xóa từ <strong>"{deleteTarget.word}"</strong>?
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
