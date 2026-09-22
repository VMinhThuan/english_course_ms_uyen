import { useState, useEffect } from 'react';
import { assessmentApi } from '../../api/assessmentApi.js';
import './AdminStudentsPage.css';

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterType, setFilterType] = useState('ALL');

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await assessmentApi.getAdminQuestions();
      if (res.status === 'success') {
        setQuestions(res.data.questions || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải ngân hàng câu hỏi');
    } finally {
      setLoading(false);
    }
  };

  const filteredQuestions = questions.filter((q) => {
    if (filterType === 'ALL') return true;
    return q.type === filterType;
  });

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setFeedback({ type: '', text: '' });
      const res = await assessmentApi.deleteQuestion(deleteTarget._id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Đã xóa câu hỏi thành công!' });
        setDeleteTarget(null);
        fetchQuestions();
      }
    } catch (err) {
      const isConflict = err.response?.status === 409;
      const msg = isConflict
        ? (err.response?.data?.message || 'Không thể xóa câu hỏi vì đang được tham chiếu trong bài kiểm tra/bài tập.')
        : (err.response?.data?.message || 'Xóa câu hỏi thất bại.');
      setFeedback({ type: 'error', text: msg });
      setDeleteTarget(null);
    }
  };

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Ngân Hàng Câu Hỏi (Question Bank)</h1>
          <p className="admin-page-sub">Quản lý kho câu hỏi trắc nghiệm, điền từ và điền đáp án tự luận.</p>
        </div>
      </div>

      {feedback.text && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', background: feedback.type === 'success' ? '#DCFCE7' : '#FEF2F2', border: `1px solid ${feedback.type === 'success' ? '#86EFAC' : '#FCA5A5'}`, color: feedback.type === 'success' ? '#166534' : '#991B1B' }}>
          {feedback.text}
        </div>
      )}

      {/* Type Filter */}
      <div style={{ background: '#FFFFFF', padding: '1rem', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setFilterType('ALL')}
          style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: filterType === 'ALL' ? '#0284C7' : '#F1F5F9', color: filterType === 'ALL' ? '#FFFFFF' : '#475569', fontWeight: 600, cursor: 'pointer' }}
        >
          Tất Cả ({questions.length})
        </button>
        <button
          onClick={() => setFilterType('single_choice')}
          style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: filterType === 'single_choice' ? '#0284C7' : '#F1F5F9', color: filterType === 'single_choice' ? '#FFFFFF' : '#475569', fontWeight: 600, cursor: 'pointer' }}
        >
          Một Đáp Án
        </button>
        <button
          onClick={() => setFilterType('multiple_choice')}
          style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: filterType === 'multiple_choice' ? '#0284C7' : '#F1F5F9', color: filterType === 'multiple_choice' ? '#FFFFFF' : '#475569', fontWeight: 600, cursor: 'pointer' }}
        >
          Nhiều Đáp Án
        </button>
        <button
          onClick={() => setFilterType('fill_blank')}
          style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: filterType === 'fill_blank' ? '#0284C7' : '#F1F5F9', color: filterType === 'fill_blank' ? '#FFFFFF' : '#475569', fontWeight: 600, cursor: 'pointer' }}
        >
          Điền Chỗ Trống
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>Đang tải ngân hàng câu hỏi...</div>
      ) : error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', color: '#991B1B', borderRadius: '8px' }}>{error}</div>
      ) : filteredQuestions.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          Không có câu hỏi nào thuộc dạng này.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nội Dung Câu Hỏi</th>
                <th>Dạng Câu Hỏi</th>
                <th>Điểm Chuẩn</th>
                <th>Đáp Án Đúng</th>
                <th>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuestions.map((q) => (
                <tr key={q._id}>
                  <td>
                    <strong style={{ fontSize: '0.95rem' }}>{q.prompt}</strong>
                  </td>
                  <td>
                    <code style={{ background: '#F1F5F9', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>{q.type}</code>
                  </td>
                  <td><strong>{q.points || 10}</strong> điểm</td>
                  <td>
                    <span style={{ color: '#166534', fontWeight: 600 }}>
                      {Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : q.correctAnswer}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => setDeleteTarget(q)}
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
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.75rem' }}>Xác Nhận Xóa Câu Hỏi</h3>
            <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1.5rem' }}>
              Bạn có chắc chắn muốn xóa câu hỏi <strong>"{deleteTarget.prompt}"</strong>?
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
