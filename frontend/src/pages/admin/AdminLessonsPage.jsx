import { useState, useEffect } from 'react';
import { courseApi } from '../../api/courseApi.js';
import { lessonApi } from '../../api/lessonApi.js';
import './AdminStudentsPage.css';

export default function AdminLessonsPage() {
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    fetchCourses();
  }, []);

  useEffect(() => {
    if (selectedCourseId) {
      fetchLessons(selectedCourseId);
    }
  }, [selectedCourseId]);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const res = await courseApi.getCourses();
      if (res.status === 'success') {
        const list = res.data.courses || [];
        setCourses(list);
        if (list.length > 0) {
          setSelectedCourseId(list[0]._id);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách khóa học');
    } finally {
      setLoading(false);
    }
  };

  const fetchLessons = async (courseId) => {
    try {
      const res = await lessonApi.getLessonsByCourse(courseId);
      if (res.status === 'success') {
        setLessons(res.data.lessons || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải bài học');
    }
  };

  const handleToggleStatus = async (lesson) => {
    const nextStatus = lesson.status === 'published' ? 'draft' : 'published';
    try {
      setFeedback({ type: '', text: '' });
      const res = await lessonApi.updateLessonStatus(lesson._id, nextStatus);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: `Đã đổi trạng thái bài học thành: ${nextStatus.toUpperCase()}` });
        fetchLessons(selectedCourseId);
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Thao tác thất bại' });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setFeedback({ type: '', text: '' });
      const res = await lessonApi.deleteLesson(deleteTarget._id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Đã xóa bài học thành công!' });
        setDeleteTarget(null);
        fetchLessons(selectedCourseId);
      }
    } catch (err) {
      const msg = err.response?.status === 409
        ? (err.response?.data?.message || 'Bài học đang được sử dụng, không thể xóa.')
        : (err.response?.data?.message || 'Xóa bài học thất bại.');
      setFeedback({ type: 'error', text: msg });
      setDeleteTarget(null);
    }
  };

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Quản Lý Bài Học</h1>
          <p className="admin-page-sub">Quản lý nội dung bài học, trạng thái xuất bản và tài liệu đính kèm.</p>
        </div>
      </div>

      {feedback.text && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', background: feedback.type === 'success' ? '#DCFCE7' : '#FEF2F2', border: `1px solid ${feedback.type === 'success' ? '#86EFAC' : '#FCA5A5'}`, color: feedback.type === 'success' ? '#166534' : '#991B1B' }}>
          {feedback.text}
        </div>
      )}

      {/* Select Course Filter */}
      <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 600, color: '#334155' }}>Chọn Khóa Học:</label>
        <select
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none', minWidth: '240px' }}
        >
          {courses.map((c) => (
            <option key={c._id} value={c._id}>{c.title}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>Đang tải bài học...</div>
      ) : error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', color: '#991B1B', borderRadius: '8px' }}>{error}</div>
      ) : lessons.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          Khóa học này chưa có bài học nào.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Thứ Tự</th>
                <th>Tiêu Đề Bài Học</th>
                <th>Trạng Thái</th>
                <th>Ngày Tạo</th>
                <th>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((lesson) => (
                <tr key={lesson._id}>
                  <td><strong>Bài {lesson.order || 1}</strong></td>
                  <td>
                    <strong>{lesson.title}</strong>
                    <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{lesson.description}</div>
                  </td>
                  <td>
                    <span className={`status-badge ${lesson.status === 'published' ? 'badge-active' : 'badge-pending'}`}>
                      {lesson.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
                    </span>
                  </td>
                  <td>{new Date(lesson.createdAt).toLocaleDateString('vi-VN')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleToggleStatus(lesson)}
                        style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        {lesson.status === 'published' ? 'Ẩn' : 'Xuất bản'}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(lesson)}
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

      {/* Confirm Delete Modal */}
      {deleteTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '1.75rem', maxWidth: '440px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.75rem' }}>Xác Nhận Xóa Bài Học</h3>
            <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1.5rem' }}>
              Bạn có chắc chắn muốn xóa bài học <strong>"{deleteTarget.title}"</strong>? Thao tác này không thể hoàn tác.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer', fontWeight: 600 }}
              >
                Hủy
              </button>
              <button
                onClick={handleDeleteConfirm}
                style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: '#DC2626', color: '#FFFFFF', cursor: 'pointer', fontWeight: 600 }}
              >
                Xác Nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
