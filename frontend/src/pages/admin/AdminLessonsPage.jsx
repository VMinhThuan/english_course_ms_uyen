import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { courseApi } from '../../api/courseApi.js';
import { lessonApi } from '../../api/lessonApi.js';
import './AdminStudentsPage.css';

export default function AdminLessonsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const courseIdFromUrl = searchParams.get('courseId');

  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const initialLessonForm = {
    title: '',
    topic: 'General',
    description: '',
    content: '',
    order: 1,
    duration: 15,
    videoUrl: '',
    audioUrl: '',
    status: 'published',
  };
  const [formData, setFormData] = useState(initialLessonForm);

  useEffect(() => {
    fetchCourses();
  }, []);

  useEffect(() => {
    if (selectedCourseId) {
      fetchLessons(selectedCourseId);
    } else {
      setLessons([]);
    }
  }, [selectedCourseId]);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetch via getAdminCourses to include drafts and teacher-specific courses
      const res = await courseApi.getAdminCourses();
      if (res.status === 'success') {
        const list = res.data.courses || [];
        setCourses(list);
        if (list.length > 0) {
          // Check if courseIdFromUrl matches one of the courses
          const match = list.find((c) => c._id === courseIdFromUrl);
          if (match) {
            setSelectedCourseId(match._id);
          } else {
            setSelectedCourseId(list[0]._id);
          }
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
      setLoadingLessons(true);
      const res = await lessonApi.getLessonsByCourse(courseId);
      if (res.status === 'success') {
        const sorted = (res.data.lessons || []).sort((a, b) => (a.order || 0) - (b.order || 0));
        setLessons(sorted);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải bài học');
    } finally {
      setLoadingLessons(false);
    }
  };

  const handleCourseChange = (courseId) => {
    setSelectedCourseId(courseId);
    setSearchParams({ courseId });
  };

  const handleOpenCreate = () => {
    setEditingLesson(null);
    setFormData({
      ...initialLessonForm,
      order: lessons.length + 1,
    });
    setShowModal(true);
  };

  const handleOpenEdit = (lesson) => {
    setEditingLesson(lesson);
    setFormData({
      title: lesson.title || '',
      topic: lesson.topic || 'General',
      description: lesson.description || '',
      content: lesson.content || '',
      order: lesson.order || 1,
      duration: lesson.duration || 15,
      videoUrl: lesson.videoUrl || '',
      audioUrl: lesson.audioUrl || '',
      status: lesson.status || 'published',
    });
    setShowModal(true);
  };

  const handleSaveLesson = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setFeedback({ type: 'error', text: 'Vui lòng nhập tiêu đề bài học' });
      return;
    }
    if (!selectedCourseId) {
      setFeedback({ type: 'error', text: 'Vui lòng chọn khóa học' });
      return;
    }

    try {
      setSubmitting(true);
      setFeedback({ type: '', text: '' });

      const payload = {
        ...formData,
        course: selectedCourseId,
        order: Number(formData.order) || 1,
        duration: Number(formData.duration) || 0,
      };

      if (editingLesson) {
        await lessonApi.updateLesson(editingLesson._id, payload);
        setFeedback({ type: 'success', text: 'Cập nhật bài học thành công!' });
      } else {
        await lessonApi.createLesson(payload);
        setFeedback({ type: 'success', text: 'Tạo bài học mới thành công!' });
      }

      setShowModal(false);
      fetchLessons(selectedCourseId);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Thao tác lưu bài học thất bại',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (lesson) => {
    const nextStatus = lesson.status === 'published' ? 'draft' : 'published';
    try {
      setFeedback({ type: '', text: '' });
      const res = await lessonApi.updateLessonStatus(lesson._id, nextStatus);
      if (res.status === 'success') {
        setFeedback({
          type: 'success',
          text: `Đã đổi trạng thái bài học thành: ${nextStatus === 'published' ? 'Đã xuất bản' : 'Bản nháp'}`,
        });
        fetchLessons(selectedCourseId);
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Thao tác thất bại' });
    }
  };

  const handleMoveOrder = async (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= lessons.length) return;

    const newLessons = [...lessons];
    const temp = newLessons[index];
    newLessons[index] = newLessons[targetIndex];
    newLessons[targetIndex] = temp;

    const lessonIds = newLessons.map((l) => l._id);

    try {
      setFeedback({ type: '', text: '' });
      const res = await courseApi.reorderCourseLessons(selectedCourseId, lessonIds);
      if (res.status === 'success') {
        setLessons(res.data.lessons);
        setFeedback({ type: 'success', text: 'Đã cập nhật thứ tự bài học thành công!' });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Không thể sắp xếp bài học' });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setFeedback({ type: '', text: '' });
      const res = await lessonApi.deleteLesson(deleteTarget._id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Đã xóa bài học và tài liệu liên quan thành công!' });
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

  const currentCourse = courses.find((c) => c._id === selectedCourseId);

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Quản Lý Bài Học</h1>
          <p className="admin-page-sub">
            Quản lý nội dung bài giảng, video, thứ tự sắp xếp và trạng thái hiển thị cho từng khóa học.
          </p>
        </div>
        {selectedCourseId && (
          <div>
            <button
              onClick={handleOpenCreate}
              style={{
                padding: '0.65rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                background: '#4F46E5',
                color: '#FFFFFF',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Thêm Bài Học Mới
            </button>
          </div>
        )}
      </div>

      {feedback.text && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            background: feedback.type === 'success' ? '#DCFCE7' : '#FEF2F2',
            border: `1px solid ${feedback.type === 'success' ? '#86EFAC' : '#FCA5A5'}`,
            color: feedback.type === 'success' ? '#166534' : '#991B1B',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{feedback.text}</span>
          <button
            onClick={() => setFeedback({ type: '', text: '' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Select Course Filter */}
      <div
        style={{
          background: '#FFFFFF',
          padding: '1.25rem',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 600, color: '#334155' }}>Khóa học đang chọn:</label>
          {courses.length === 0 ? (
            <span style={{ color: '#64748B' }}>Chưa có khóa học nào</span>
          ) : (
            <select
              value={selectedCourseId}
              onChange={(e) => handleCourseChange(e.target.value)}
              style={{
                padding: '0.6rem 1rem',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                outline: 'none',
                minWidth: '280px',
                fontWeight: 500,
              }}
            >
              {courses.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.title} {c.isPublished ? '(Đã xuất bản)' : '(Bản nháp)'}
                </option>
              ))}
            </select>
          )}
        </div>

        {currentCourse && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span className={`status-badge ${currentCourse.isPublished ? 'badge-active' : 'badge-pending'}`}>
              {currentCourse.isPublished ? 'Khóa học: Đã xuất bản' : 'Khóa học: Bản nháp'}
            </span>
            <button
              onClick={() => navigate('/admin/courses')}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                background: '#F8FAFC',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              Quản lý Khóa học
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
          Đang tải khóa học...
        </div>
      ) : error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', color: '#991B1B', borderRadius: '8px', textAlign: 'center' }}>
          {error}
          <div style={{ marginTop: '0.5rem' }}>
            <button
              onClick={fetchCourses}
              style={{ padding: '0.4rem 1rem', borderRadius: '6px', border: '1px solid #FCA5A5', background: '#FFFFFF', cursor: 'pointer', fontWeight: 600 }}
            >
              Thử lại
            </button>
          </div>
        </div>
      ) : courses.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          Bạn chưa tạo khóa học nào. Hãy vào <a href="/admin/courses" style={{ color: '#4F46E5', fontWeight: 600 }}>Quản lý khóa học</a> để tạo khóa học trước khi thêm bài học.
        </div>
      ) : loadingLessons ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
          Đang tải bài học của khóa học...
        </div>
      ) : lessons.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📝</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#334155' }}>Khóa học này chưa có bài học nào</div>
          <p style={{ fontSize: '0.9rem', color: '#64748B', margin: '0.5rem 0 1.25rem' }}>
            Bắt đầu tạo bài học đầu tiên để học viên có thể học tập.
          </p>
          <button
            onClick={handleOpenCreate}
            style={{
              padding: '0.6rem 1.25rem',
              borderRadius: '8px',
              border: 'none',
              background: '#4F46E5',
              color: '#FFFFFF',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Thêm Bài Học Mới
          </button>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: '80px', textAlign: 'center' }}>Thứ Tự</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Di Chuyển</th>
                <th>Tiêu Đề Bài Học</th>
                <th>Chủ Đề</th>
                <th>Thời Lượng</th>
                <th>Trạng Thái</th>
                <th style={{ textAlign: 'center' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((lesson, index) => (
                <tr key={lesson._id}>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#4F46E5' }}>#{lesson.order || index + 1}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      <button
                        disabled={index === 0}
                        onClick={() => handleMoveOrder(index, 'up')}
                        title="Di chuyển lên"
                        style={{
                          padding: '0.25rem 0.45rem',
                          borderRadius: '4px',
                          border: '1px solid #CBD5E1',
                          background: index === 0 ? '#F1F5F9' : '#FFFFFF',
                          cursor: index === 0 ? 'not-allowed' : 'pointer',
                          color: index === 0 ? '#94A3B8' : '#334155',
                          fontSize: '0.75rem',
                        }}
                      >
                        ▲
                      </button>
                      <button
                        disabled={index === lessons.length - 1}
                        onClick={() => handleMoveOrder(index, 'down')}
                        title="Di chuyển xuống"
                        style={{
                          padding: '0.25rem 0.45rem',
                          borderRadius: '4px',
                          border: '1px solid #CBD5E1',
                          background: index === lessons.length - 1 ? '#F1F5F9' : '#FFFFFF',
                          cursor: index === lessons.length - 1 ? 'not-allowed' : 'pointer',
                          color: index === lessons.length - 1 ? '#94A3B8' : '#334155',
                          fontSize: '0.75rem',
                        }}
                      >
                        ▼
                      </button>
                    </div>
                  </td>
                  <td>
                    <strong>{lesson.title}</strong>
                    {lesson.description && (
                      <div style={{ fontSize: '0.8rem', color: '#64748B', maxWidth: '340px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {lesson.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <span style={{ background: '#F8FAFC', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', border: '1px solid #E2E8F0' }}>
                      {lesson.topic || 'General'}
                    </span>
                  </td>
                  <td>{lesson.duration || 0} phút</td>
                  <td>
                    <span className={`status-badge ${lesson.status === 'published' ? 'badge-active' : 'badge-pending'}`}>
                      {lesson.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                      <button
                        onClick={() => navigate(`/admin/materials?courseId=${selectedCourseId}&lessonId=${lesson._id}`)}
                        title="Quản lý tài liệu bài học"
                        style={{
                          padding: '0.4rem 0.65rem',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          background: '#FFFFFF',
                          color: '#0284C7',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
                      >
                        Tài liệu
                      </button>
                      <button
                        onClick={() => handleToggleStatus(lesson)}
                        title={lesson.status === 'published' ? 'Chuyển sang nháp' : 'Xuất bản bài học'}
                        style={{
                          padding: '0.4rem 0.65rem',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          background: lesson.status === 'published' ? '#FFFBEB' : '#ECFDF5',
                          color: lesson.status === 'published' ? '#D97706' : '#059669',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
                      >
                        {lesson.status === 'published' ? 'Gỡ' : 'Xuất bản'}
                      </button>
                      <button
                        onClick={() => handleOpenEdit(lesson)}
                        title="Chỉnh sửa bài học"
                        style={{
                          padding: '0.4rem 0.65rem',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          background: '#FFFFFF',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => setDeleteTarget(lesson)}
                        title="Xóa bài học"
                        style={{
                          padding: '0.4rem 0.65rem',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#FEE2E2',
                          color: '#991B1B',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
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

      {/* Create / Edit Lesson Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              padding: '2rem',
              maxWidth: '650px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                {editingLesson ? 'Chỉnh Sửa Bài Học' : 'Thêm Bài Học Mới'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748B' }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveLesson} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Tiêu đề bài học *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Lesson 1: Overview & Strategies for Part 1"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    Chủ đề (Topic)
                  </label>
                  <input
                    type="text"
                    value={formData.topic}
                    onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    Thứ tự (Order)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.order}
                    onChange={(e) => setFormData({ ...formData, order: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    Thời lượng (phút)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Mô tả ngắn gọn
                </label>
                <input
                  type="text"
                  placeholder="Mô tả tóm tắt mục tiêu bài học..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    Video URL (YouTube/Embed)
                  </label>
                  <input
                    type="text"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={formData.videoUrl}
                    onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    Audio URL
                  </label>
                  <input
                    type="text"
                    placeholder="/uploads/... hoặc audio URL"
                    value={formData.audioUrl}
                    onChange={(e) => setFormData({ ...formData, audioUrl: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Nội dung chi tiết bài học (Hỗ trợ Markdown)
                </label>
                <textarea
                  rows={5}
                  placeholder="Nhập nội dung bài học, ghi chú hoặc transcript bài nghe..."
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none', resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Trạng thái
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                >
                  <option value="published">Đã xuất bản (Công khai cho học viên)</option>
                  <option value="draft">Bản nháp (Chỉ giáo viên/admin thấy)</option>
                  <option value="hidden">Ẩn</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid #E2E8F0', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer', fontWeight: 600 }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '0.65rem 1.5rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#4F46E5',
                    color: '#FFFFFF',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {submitting ? 'Đang lưu...' : editingLesson ? 'Lưu Thay Đổi' : 'Thêm Bài Học'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              padding: '1.75rem',
              maxWidth: '440px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.75rem' }}>
              Xác Nhận Xóa Bài Học
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1rem', lineHeight: 1.5 }}>
              Bạn có chắc chắn muốn xóa bài học <strong>"{deleteTarget.title}"</strong>?
            </p>
            <div
              style={{
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                color: '#991B1B',
                borderRadius: '8px',
                padding: '0.75rem',
                fontSize: '0.85rem',
                marginBottom: '1.5rem',
              }}
            >
              ⚠️ Thao tác này sẽ tự động xóa các tài liệu đính kèm, từ vựng và tiến độ liên kết với bài học này.
            </div>
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
