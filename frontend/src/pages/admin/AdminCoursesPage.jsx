import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { courseApi } from '../../api/courseApi.js';
import './AdminStudentsPage.css';

export default function AdminCoursesPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, published, draft
  const [levelFilter, setLevelFilter] = useState('all');

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const initialFormData = {
    title: '',
    description: '',
    slug: '',
    level: 'Intermediate',
    englishType: 'TOEIC',
    category: 'general',
    price: 0,
    discount: 0,
    thumbnail: '',
    skills: '',
    isPublished: false,
  };
  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    fetchCourses();
  }, [statusFilter, levelFilter]);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (levelFilter !== 'all') params.level = levelFilter;
      if (search.trim()) params.search = search.trim();

      const res = await courseApi.getAdminCourses(params);
      if (res.status === 'success') {
        setCourses(res.data.courses || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách khóa học');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchCourses();
  };

  const handleOpenCreate = () => {
    setEditingCourse(null);
    setFormData(initialFormData);
    setShowModal(true);
  };

  const handleOpenEdit = (course) => {
    setEditingCourse(course);
    setFormData({
      title: course.title || '',
      description: course.description || '',
      slug: course.slug || '',
      level: course.level || 'Intermediate',
      englishType: course.englishType || 'TOEIC',
      category: course.category || 'general',
      price: course.price || 0,
      discount: course.discount || 0,
      thumbnail: course.thumbnail || course.image || '',
      skills: Array.isArray(course.skills) ? course.skills.join(', ') : '',
      isPublished: Boolean(course.isPublished),
    });
    setShowModal(true);
  };

  const handleSaveCourse = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.description.trim()) {
      setFeedback({ type: 'error', text: 'Vui lòng điền đầy đủ tiêu đề và mô tả khóa học' });
      return;
    }

    try {
      setSubmitting(true);
      setFeedback({ type: '', text: '' });

      const payload = {
        ...formData,
        price: Number(formData.price) || 0,
        discount: Number(formData.discount) || 0,
        skills: formData.skills ? formData.skills.split(',').map((s) => s.trim()).filter(Boolean) : [],
      };

      if (editingCourse) {
        await courseApi.updateCourse(editingCourse._id, payload);
        setFeedback({ type: 'success', text: 'Cập nhật khóa học thành công!' });
      } else {
        await courseApi.createCourse(payload);
        setFeedback({ type: 'success', text: 'Tạo khóa học mới thành công!' });
      }

      setShowModal(false);
      fetchCourses();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Thao tác lưu khóa học thất bại',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (course) => {
    const nextStatus = !course.isPublished;
    try {
      setFeedback({ type: '', text: '' });
      const res = await courseApi.updateCourseStatus(course._id, nextStatus);
      if (res.status === 'success') {
        setFeedback({
          type: 'success',
          text: `Đã ${nextStatus ? 'xuất bản' : 'chuyển sang bản nháp'} khóa học: "${course.title}"`,
        });
        fetchCourses();
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Không thể thay đổi trạng thái khóa học',
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setFeedback({ type: '', text: '' });
      const res = await courseApi.deleteCourse(deleteTarget._id);
      if (res.status === 'success') {
        setFeedback({ type: 'success', text: 'Đã xóa khóa học thành công!' });
        setDeleteTarget(null);
        fetchCourses();
      }
    } catch (err) {
      const msg = err.response?.status === 409
        ? (err.response?.data?.message || 'Khóa học đã có học viên đăng ký hoặc có tiến độ học tập, không thể xóa.')
        : (err.response?.data?.message || 'Xóa khóa học thất bại.');
      setFeedback({ type: 'error', text: msg });
      setDeleteTarget(null);
    }
  };

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Quản Lý Khóa Học</h1>
          <p className="admin-page-sub">
            Quản lý khóa học, lộ trình bài giảng, tài liệu đính kèm và trạng thái xuất bản cho học viên.
          </p>
        </div>
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
            Tạo Khóa Học Mới
          </button>
        </div>
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

      {/* Filter & Search Bar */}
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
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: '1', minWidth: '260px' }}>
          <input
            type="text"
            placeholder="Tìm theo tên hoặc mô tả khóa học..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              flex: 1,
              outline: 'none',
              fontSize: '0.9rem',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '0.6rem 1.25rem',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#F8FAFC',
              cursor: 'pointer',
              fontWeight: 600,
              color: '#334155',
            }}
          >
            Tìm kiếm
          </button>
        </form>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>Trạng thái:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="published">Đã xuất bản</option>
              <option value="draft">Bản nháp</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>Cấp độ:</span>
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              style={{ padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
            >
              <option value="all">Tất cả cấp độ</option>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>
          </div>
        </div>
      </div>

      {/* Course List Table */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
          Đang tải danh sách khóa học...
        </div>
      ) : error ? (
        <div style={{ padding: '1.25rem', background: '#FEF2F2', color: '#991B1B', borderRadius: '8px', textAlign: 'center' }}>
          {error}
          <div style={{ marginTop: '0.75rem' }}>
            <button
              onClick={fetchCourses}
              style={{ padding: '0.4rem 1rem', borderRadius: '6px', border: '1px solid #FCA5A5', background: '#FFFFFF', cursor: 'pointer', fontWeight: 600 }}
            >
              Thử lại
            </button>
          </div>
        </div>
      ) : courses.length === 0 ? (
        <div
          style={{
            padding: '3.5rem 1.5rem',
            textAlign: 'center',
            color: '#64748B',
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📚</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#334155' }}>Chưa tìm thấy khóa học nào</div>
          <p style={{ fontSize: '0.9rem', color: '#64748B', margin: '0.5rem 0 1.25rem' }}>
            {search || statusFilter !== 'all' || levelFilter !== 'all'
              ? 'Thử điều chỉnh lại bộ lọc hoặc từ khóa tìm kiếm.'
              : 'Hãy bắt đầu tạo khóa học đầu tiên cho học viên!'}
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
            + Tạo Khóa Học Mới
          </button>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>Khóa Học</th>
                <th>Giảng Viên</th>
                <th>Cấp Độ / Thể Loại</th>
                <th>Giá</th>
                <th>Bài Học</th>
                <th>Học Viên</th>
                <th>Trạng Thái</th>
                <th style={{ textAlign: 'center' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course._id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {course.thumbnail || course.image ? (
                        <img
                          src={course.thumbnail || course.image}
                          alt={course.title}
                          style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover' }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '8px',
                            background: '#EEF2FF',
                            color: '#4F46E5',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '1.1rem',
                            flexShrink: 0,
                          }}
                        >
                          📖
                        </div>
                      )}
                      <div>
                        <strong>{course.title}</strong>
                        <div style={{ fontSize: '0.8rem', color: '#64748B', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {course.description}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{course.teacher?.fullName || '---'}</td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>{course.level}</span>
                      <span style={{ fontSize: '0.75rem', color: '#64748B' }}>{course.englishType} ({course.category})</span>
                    </div>
                  </td>
                  <td>
                    {course.price === 0 ? (
                      <span style={{ color: '#16A34A', fontWeight: 600 }}>Miễn phí</span>
                    ) : (
                      <span style={{ fontWeight: 600 }}>${course.price}</span>
                    )}
                  </td>
                  <td>
                    <span style={{ background: '#F1F5F9', padding: '0.2rem 0.5rem', borderRadius: '6px', fontWeight: 600, fontSize: '0.85rem' }}>
                      {course.lessonCount || 0} bài
                    </span>
                  </td>
                  <td>
                    <span style={{ color: '#475569', fontSize: '0.85rem' }}>
                      {course.enrolledCount || 0} HV
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${course.isPublished ? 'badge-active' : 'badge-pending'}`}>
                      {course.isPublished ? 'Đã xuất bản' : 'Bản nháp'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                      <button
                        onClick={() => navigate(`/admin/lessons?courseId=${course._id}`)}
                        title="Quản lý bài học"
                        style={{
                          padding: '0.4rem 0.65rem',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          background: '#FFFFFF',
                          color: '#4F46E5',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
                      >
                        Bài học
                      </button>
                      <button
                        onClick={() => handleToggleStatus(course)}
                        title={course.isPublished ? 'Gỡ xuất bản' : 'Xuất bản khóa học'}
                        style={{
                          padding: '0.4rem 0.65rem',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          background: course.isPublished ? '#FFFBEB' : '#ECFDF5',
                          color: course.isPublished ? '#D97706' : '#059669',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
                      >
                        {course.isPublished ? 'Gỡ' : 'Xuất bản'}
                      </button>
                      <button
                        onClick={() => handleOpenEdit(course)}
                        title="Chỉnh sửa khóa học"
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
                        onClick={() => setDeleteTarget(course)}
                        title="Xóa khóa học"
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

      {/* Create / Edit Course Modal */}
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
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                {editingCourse ? 'Chỉnh Sửa Khóa Học' : 'Tạo Khóa Học Mới'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748B' }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveCourse} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Tiêu đề khóa học *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Lộ Trình TOEIC 650+ Chuyên Sâu"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Mô tả chi tiết *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Mô tả nội dung, mục tiêu đầu ra và đối tượng phù hợp..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    Loại chứng chỉ / Anh ngữ *
                  </label>
                  <select
                    value={formData.englishType}
                    onChange={(e) => setFormData({ ...formData, englishType: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                  >
                    <option value="TOEIC">TOEIC</option>
                    <option value="IELTS">IELTS</option>
                    <option value="TOEFL">TOEFL</option>
                    <option value="General">General</option>
                    <option value="Business">Business</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    Cấp độ (Level) *
                  </label>
                  <select
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                  >
                    <option value="Beginner">Beginner (Cơ bản)</option>
                    <option value="Intermediate">Intermediate (Trung cấp)</option>
                    <option value="Advanced">Advanced (Nâng cao)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    Danh mục kỹ năng
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                  >
                    <option value="general">Tổng quát (General)</option>
                    <option value="reading">Đọc hiểu (Reading)</option>
                    <option value="listening">Nghe hiểu (Listening)</option>
                    <option value="speaking">Nói (Speaking)</option>
                    <option value="writing">Viết (Writing)</option>
                    <option value="all-skills">Toàn diện 4 kỹ năng (All skills)</option>
                    <option value="business">Thương mại (Business)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    Giá khóa học ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Ảnh bìa (Thumbnail URL)
                </label>
                <input
                  type="text"
                  placeholder="https://example.com/image.jpg hoặc /uploads/..."
                  value={formData.thumbnail}
                  onChange={(e) => setFormData({ ...formData, thumbnail: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Kỹ năng bổ trợ (ngăn cách bằng dấu phẩy)
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Listening Part 1-4, Vocabulary, Grammar"
                  value={formData.skills}
                  onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="coursePublished"
                  checked={formData.isPublished}
                  onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="coursePublished" style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
                  Xuất bản khóa học ngay (Học viên có thể nhìn thấy và đăng ký)
                </label>
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
                  {submitting ? 'Đang lưu...' : editingCourse ? 'Lưu Thay Đổi' : 'Tạo Khóa Học'}
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
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.75rem' }}>
              Xác Nhận Xóa Khóa Học
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1rem', lineHeight: 1.5 }}>
              Bạn có chắc chắn muốn xóa khóa học <strong>"{deleteTarget.title}"</strong>?
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
              ⚠️ Lưu ý an toàn: Nếu khóa học đã có học viên đăng ký, hệ thống sẽ từ chối xóa để bảo vệ tiến độ học viên.
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
