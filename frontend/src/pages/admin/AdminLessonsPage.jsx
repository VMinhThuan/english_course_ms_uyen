import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { courseApi } from '../../api/courseApi.js';
import { lessonApi } from '../../api/lessonApi.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import UiButton from '../../components/ui/UiButton.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import './AdminStudentsPage.css';

export default function AdminLessonsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const courseIdFromUrl = searchParams.get('courseId');
  const isToeicPart1Workspace = searchParams.get('scope') === 'toeic-part1';

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
    topic: isToeicPart1Workspace ? 'TOEIC Part 1: Photographs' : 'General',
    difficulty: '',
    description: '',
    content: '',
    order: 1,
    duration: 15,
    videoUrl: '',
    audioUrl: '',
    status: isToeicPart1Workspace ? 'draft' : 'published',
  };
  const [formData, setFormData] = useState(initialLessonForm);

  useEffect(() => {
    fetchCourses();
  }, [isToeicPart1Workspace, courseIdFromUrl]);

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
        const allCourses = res.data.courses || [];
        const list = isToeicPart1Workspace
          ? allCourses.filter((course) => course.englishType === 'TOEIC' && course.category === 'listening')
          : allCourses;
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
    setSearchParams({ ...(isToeicPart1Workspace ? { scope: 'toeic-part1' } : {}), courseId });
  };

  const handleOpenCreate = () => {
    setEditingLesson(null);
    setFormData({
      ...initialLessonForm,
      topic: isToeicPart1Workspace ? 'TOEIC Part 1: Photographs' : initialLessonForm.topic,
      status: isToeicPart1Workspace ? 'draft' : initialLessonForm.status,
      order: lessons.length + 1,
    });
    setShowModal(true);
  };

  const handleOpenEdit = (lesson) => {
    setEditingLesson(lesson);
    setFormData({
      title: lesson.title || '',
      topic: lesson.topic || 'General',
      difficulty: lesson.difficulty || '',
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
        difficulty: formData.difficulty || null,
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
      <PageHeader
        title={isToeicPart1Workspace ? 'TOEIC Part 1 · Bài học' : 'Quản Lý Bài Học'}
        description={isToeicPart1Workspace ? 'Chỉ chọn Course có metadata TOEIC + Listening. Bài mới bắt đầu ở Draft và cần Publish thủ công.' : 'Quản lý nội dung bài giảng, video, thứ tự sắp xếp và trạng thái hiển thị cho từng khóa học.'}
        actions={selectedCourseId && (
          <UiButton onClick={handleOpenCreate}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Thêm Bài Học Mới
          </UiButton>
        )}
      />

      {isToeicPart1Workspace && (
        <div role="note" style={{ padding: '0.85rem 1rem', marginBottom: '1rem', borderRadius: '8px', border: '1px solid var(--brand-warning-border)', background: 'var(--brand-warning-bg)', color: 'var(--brand-text)' }}>
          <strong>Audio &amp; storage:</strong> thêm file MP3/M4A/WAV qua mục Tài liệu của bài học; học viên nghe qua luồng preview có kiểm tra quyền. Backend hiện dùng filesystem cục bộ, còn filesystem serverless là tạm thời — chưa upload/publish audio khách hàng trên serverless cho tới khi có persistent object storage được cấu hình.
        </div>
      )}

      {feedback.text && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            background: feedback.type === 'success' ? 'var(--brand-success-bg)' : 'var(--brand-danger-bg)',
            border: `1px solid ${feedback.type === 'success' ? 'var(--brand-success-border)' : 'var(--brand-danger-border)'}`,
            color: feedback.type === 'success' ? 'var(--brand-success)' : 'var(--brand-danger)',
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
          background: 'var(--brand-surface)',
          padding: '1.25rem',
          borderRadius: '12px',
          border: '1px solid var(--brand-border)',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 600, color: 'var(--brand-text)' }}>Khóa học đang chọn:</label>
          {courses.length === 0 ? (
            <span style={{ color: 'var(--brand-muted)' }}>Chưa có khóa học nào</span>
          ) : (
            <select
              value={selectedCourseId}
              onChange={(e) => handleCourseChange(e.target.value)}
              style={{
                padding: '0.6rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--brand-border)',
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
              onClick={() => navigate(isToeicPart1Workspace ? '/admin/courses?template=toeic-listening' : '/admin/courses')}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                border: '1px solid var(--brand-border)',
                background: 'var(--brand-bg-sub)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              {isToeicPart1Workspace ? 'Quản lý Course TOEIC Listening' : 'Quản lý Khóa học'}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-muted)' }}>
          Đang tải khóa học...
        </div>
      ) : error ? (
        <div style={{ padding: '1rem', background: 'var(--brand-danger-bg)', color: 'var(--brand-danger)', borderRadius: '8px', textAlign: 'center' }}>
          {error}
          <div style={{ marginTop: '0.5rem' }}>
            <button
              onClick={fetchCourses}
              style={{ padding: '0.4rem 1rem', borderRadius: '6px', border: '1px solid var(--brand-danger-border)', background: 'var(--brand-surface)', cursor: 'pointer', fontWeight: 600 }}
            >
              Thử lại
            </button>
          </div>
        </div>
      ) : courses.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-muted)', background: 'var(--brand-surface)', borderRadius: '12px', border: '1px solid var(--brand-border)' }}>
          {isToeicPart1Workspace ? <>Chưa có Course TOEIC Listening nào. Hãy tạo Course đúng metadata trước khi thêm bài Part 1. <button type="button" onClick={() => navigate('/admin/courses?template=toeic-listening')} style={{ color: 'var(--brand-coffee)', fontWeight: 700, border: 0, background: 'none', cursor: 'pointer', padding: 0 }}>Tạo Course TOEIC Listening</button></> : <>Bạn chưa tạo khóa học nào. Hãy vào <a href="/admin/courses" style={{ color: 'var(--brand-coffee)', fontWeight: 600 }}>Quản lý khóa học</a> để tạo khóa học trước khi thêm bài học.</>}
        </div>
      ) : loadingLessons ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-muted)' }}>
          Đang tải bài học của khóa học...
        </div>
      ) : lessons.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-muted)', background: 'var(--brand-surface)', borderRadius: '12px', border: '1px solid var(--brand-border)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📝</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--brand-text)' }}>Khóa học này chưa có bài học nào</div>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-muted)', margin: '0.5rem 0 1.25rem' }}>
            Bắt đầu tạo bài học đầu tiên để học viên có thể học tập.
          </p>
          <button
            onClick={handleOpenCreate}
            style={{
              padding: '0.6rem 1.25rem',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--brand-yellow)',
              color: 'var(--brand-text)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Thêm Bài Học Mới
          </button>
        </div>
      ) : (
        <DataTable className="table-responsive" tableClassName="admin-table">
            <thead>
              <tr>
                <th style={{ width: '80px', textAlign: 'center' }}>Thứ Tự</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Di Chuyển</th>
                <th>Tiêu Đề Bài Học</th>
                <th>Chủ Đề</th>
                <th>Mức Độ</th>
                <th>Thời Lượng</th>
                <th>Trạng Thái</th>
                <th style={{ textAlign: 'center' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((lesson, index) => (
                <tr key={lesson._id}>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontWeight: 700, color: 'var(--brand-coffee)' }}>#{lesson.order || index + 1}</span>
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
                          border: '1px solid var(--brand-border)',
                          background: index === 0 ? 'var(--brand-bg-sub)' : 'var(--brand-surface)',
                          cursor: index === 0 ? 'not-allowed' : 'pointer',
                          color: index === 0 ? 'var(--brand-muted)' : 'var(--brand-text)',
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
                          border: '1px solid var(--brand-border)',
                          background: index === lessons.length - 1 ? 'var(--brand-bg-sub)' : 'var(--brand-surface)',
                          cursor: index === lessons.length - 1 ? 'not-allowed' : 'pointer',
                          color: index === lessons.length - 1 ? 'var(--brand-muted)' : 'var(--brand-text)',
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
                      <div style={{ fontSize: '0.8rem', color: 'var(--brand-muted)', maxWidth: '340px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {lesson.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <span style={{ background: 'var(--brand-bg-sub)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', border: '1px solid var(--brand-border)' }}>
                      {lesson.topic || 'General'}
                    </span>
                  </td>
                  <td>
                    {lesson.difficulty ? (
                      <span className={`lesson-difficulty-badge lesson-difficulty-badge--${lesson.difficulty}`}>
                        {{ beginner: 'Cơ bản', intermediate: 'Trung cấp', advanced: 'Nâng cao' }[lesson.difficulty] || 'Chưa phân loại'}
                      </span>
                    ) : <span style={{ color: 'var(--brand-muted)', fontSize: '0.8rem' }}>Chưa phân loại</span>}
                  </td>
                  <td>{lesson.duration || 0} phút</td>
                  <td>
                    <StatusBadge status={lesson.status === 'published' ? 'published' : 'draft'} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                      <button
                        onClick={() => navigate(`/admin/materials?courseId=${selectedCourseId}&lessonId=${lesson._id}`)}
                        title="Quản lý tài liệu bài học"
                        style={{
                          padding: '0.4rem 0.65rem',
                          borderRadius: '6px',
                          border: '1px solid var(--brand-border)',
                          background: 'var(--brand-surface)',
                          color: 'var(--brand-coffee)',
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
                          border: '1px solid var(--brand-border)',
                          background: lesson.status === 'published' ? 'var(--brand-warning-bg)' : 'var(--brand-success-bg)',
                          color: lesson.status === 'published' ? 'var(--brand-warning)' : 'var(--brand-success)',
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
                          border: '1px solid var(--brand-border)',
                          background: 'var(--brand-surface)',
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
                          background: 'var(--brand-danger-bg)',
                          color: 'var(--brand-danger)',
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
        </DataTable>
      )}

      {/* Create / Edit Lesson Modal */}
      {showModal && (
        <div
          className="ds-modal-overlay ds-modal-overlay--scroll"
        >
          <div
            className="ds-modal-content ds-modal-content--lg"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--brand-text)', margin: 0 }}>
                {editingLesson ? 'Chỉnh Sửa Bài Học' : 'Thêm Bài Học Mới'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--brand-muted)' }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveLesson} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-text)', marginBottom: '0.35rem' }}>
                  Tiêu đề bài học *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Lesson 1: Overview & Strategies for Part 1"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)', outline: 'none' }}
                />
              </div>

              <div className="admin-form-grid-3">
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-text)', marginBottom: '0.35rem' }}>
                    Chủ đề (Topic)
                  </label>
                  <input
                    type="text"
                    value={formData.topic}
                    onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-text)', marginBottom: '0.35rem' }}>
                    Thứ tự (Order)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.order}
                    onChange={(e) => setFormData({ ...formData, order: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-text)', marginBottom: '0.35rem' }}>
                    Thời lượng (phút)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-text)', marginBottom: '0.35rem' }}>
                    Mức độ bài học (tùy chọn)
                  </label>
                  <select
                    value={formData.difficulty}
                    onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)', outline: 'none' }}
                  >
                    <option value="">Chưa phân loại</option>
                    <option value="beginner">Cơ bản</option>
                    <option value="intermediate">Trung cấp</option>
                    <option value="advanced">Nâng cao</option>
                  </select>
                  <small style={{ display: 'block', marginTop: '0.35rem', color: 'var(--brand-muted)', lineHeight: 1.45 }}>
                    Mức độ dùng chung cho hệ thống; bài học cũ được giữ ở trạng thái chưa phân loại.
                  </small>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-text)', marginBottom: '0.35rem' }}>
                  Mô tả ngắn gọn
                </label>
                <input
                  type="text"
                  placeholder="Mô tả tóm tắt mục tiêu bài học..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)', outline: 'none' }}
                />
              </div>

              <div className="admin-form-grid">
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-text)', marginBottom: '0.35rem' }}>
                    Video URL (YouTube/Embed)
                  </label>
                  <input
                    type="text"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={formData.videoUrl}
                    onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-text)', marginBottom: '0.35rem' }}>
                    Audio URL
                  </label>
                  <input
                    type="text"
                    placeholder="/uploads/... hoặc audio URL"
                    value={formData.audioUrl}
                    onChange={(e) => setFormData({ ...formData, audioUrl: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)', outline: 'none' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-text)', marginBottom: '0.35rem' }}>
                  Nội dung chi tiết bài học (Hỗ trợ Markdown)
                </label>
                <textarea
                  rows={5}
                  placeholder="Nhập nội dung bài học, ghi chú hoặc transcript bài nghe..."
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)', outline: 'none', resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-text)', marginBottom: '0.35rem' }}>
                  Trạng thái
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)', outline: 'none' }}
                >
                  <option value="published">Đã xuất bản (Công khai cho học viên)</option>
                  <option value="draft">Bản nháp (Chỉ giáo viên/admin thấy)</option>
                  <option value="hidden">Ẩn</option>
                </select>
              </div>

              <div className="admin-modal-actions">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', border: '1px solid var(--brand-border)', background: 'var(--brand-surface)', cursor: 'pointer', fontWeight: 600 }}
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
                    background: 'var(--brand-yellow)',
                    color: 'var(--brand-text)',
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
          className="ds-modal-overlay ds-modal-overlay--scroll"
        >
          <div
            className="ds-modal-content ds-modal-content--sm"
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--brand-text)', marginBottom: '0.75rem' }}>
              Xác Nhận Xóa Bài Học
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
              Bạn có chắc chắn muốn xóa bài học <strong>"{deleteTarget.title}"</strong>?
            </p>
            <div
              style={{
                background: 'var(--brand-danger-bg)',
                border: '1px solid var(--brand-danger-border)',
                color: 'var(--brand-danger)',
                borderRadius: '8px',
                padding: '0.75rem',
                fontSize: '0.85rem',
                marginBottom: '1.5rem',
              }}
            >
              ⚠️ Thao tác này sẽ tự động xóa các tài liệu đính kèm, từ vựng và tiến độ liên kết với bài học này.
            </div>
            <div className="admin-modal-actions">
              <button
                onClick={() => setDeleteTarget(null)}
                style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: '1px solid var(--brand-border)', background: 'var(--brand-surface)', cursor: 'pointer', fontWeight: 600 }}
              >
                Hủy
              </button>
              <button
                onClick={handleDeleteConfirm}
                style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: 'var(--brand-danger)', color: 'var(--brand-surface)', cursor: 'pointer', fontWeight: 600 }}
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
