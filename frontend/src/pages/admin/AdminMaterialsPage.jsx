import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { courseApi } from '../../api/courseApi.js';
import { lessonApi } from '../../api/lessonApi.js';
import { materialApi } from '../../api/materialApi.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import UiButton from '../../components/ui/UiButton.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import './AdminStudentsPage.css';

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function AdminMaterialsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCourseId = searchParams.get('courseId');
  const urlLessonId = searchParams.get('lessonId');

  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [lessons, setLessons] = useState([]);
  const [selectedLessonId, setSelectedLessonId] = useState('');

  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const initialFormState = {
    title: '',
    description: '',
    lessonId: '',
    allowDownload: true,
    status: 'published',
    fileUrl: '',
    file: null,
  };
  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    fetchCourses();
  }, []);

  useEffect(() => {
    if (selectedCourseId) {
      fetchLessonsForCourse(selectedCourseId);
    } else {
      setLessons([]);
      setSelectedLessonId('');
    }
  }, [selectedCourseId]);

  useEffect(() => {
    fetchMaterials();
  }, [selectedCourseId, selectedLessonId]);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await courseApi.getAdminCourses();
      if (res.status === 'success') {
        const list = res.data.courses || [];
        setCourses(list);
        if (list.length > 0) {
          const match = list.find((c) => c._id === urlCourseId);
          setSelectedCourseId(match ? match._id : list[0]._id);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách khóa học');
    } finally {
      setLoading(false);
    }
  };

  const fetchLessonsForCourse = async (courseId) => {
    try {
      const res = await lessonApi.getLessonsByCourse(courseId);
      if (res.status === 'success') {
        const lessonList = res.data.lessons || [];
        setLessons(lessonList);
        if (urlLessonId && lessonList.some((l) => l._id === urlLessonId)) {
          setSelectedLessonId(urlLessonId);
        } else {
          setSelectedLessonId('');
        }
      }
    } catch (err) {
      console.error('Failed to load lessons for course:', err);
    }
  };

  const fetchMaterials = async () => {
    try {
      setLoadingMaterials(true);
      setError(null);
      const params = {};
      if (selectedCourseId) params.courseId = selectedCourseId;
      if (selectedLessonId) params.lessonId = selectedLessonId;

      const res = await materialApi.getAdminMaterials(params);
      if (res.status === 'success') {
        setMaterials(res.data.materials || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách tài liệu');
    } finally {
      setLoadingMaterials(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingMaterial(null);
    setFormData({
      ...initialFormState,
      lessonId: selectedLessonId || (lessons.length > 0 ? lessons[0]._id : ''),
    });
    setShowModal(true);
  };

  const handleOpenEdit = (mat) => {
    setEditingMaterial(mat);
    setFormData({
      title: mat.title || '',
      description: mat.description || '',
      lessonId: mat.lesson?._id || mat.lesson || '',
      allowDownload: Boolean(mat.allowDownload),
      status: mat.status || 'published',
      fileUrl: mat.fileUrl || '',
      file: null,
    });
    setShowModal(true);
  };

  const handleSaveMaterial = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setFeedback({ type: 'error', text: 'Vui lòng nhập tên tài liệu' });
      return;
    }
    if (!formData.lessonId) {
      setFeedback({ type: 'error', text: 'Vui lòng chọn bài học đính kèm tài liệu' });
      return;
    }
    if (!editingMaterial && !formData.file && !formData.fileUrl.trim()) {
      setFeedback({ type: 'error', text: 'Vui lòng chọn file tải lên hoặc nhập file URL' });
      return;
    }

    try {
      setSubmitting(true);
      setFeedback({ type: '', text: '' });

      const data = new FormData();
      data.append('title', formData.title.trim());
      data.append('description', formData.description.trim());
      data.append('lessonId', formData.lessonId);
      data.append('allowDownload', String(formData.allowDownload));
      data.append('status', formData.status);

      if (formData.file) {
        data.append('file', formData.file);
      } else if (formData.fileUrl) {
        data.append('fileUrl', formData.fileUrl.trim());
      }

      if (editingMaterial) {
        await materialApi.updateMaterial(editingMaterial._id, data);
        setFeedback({ type: 'success', text: 'Cập nhật tài liệu thành công!' });
      } else {
        await materialApi.createMaterial(data);
        setFeedback({ type: 'success', text: 'Thêm tài liệu mới thành công!' });
      }

      setShowModal(false);
      fetchMaterials();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Lưu tài liệu thất bại',
      });
    } finally {
      setSubmitting(false);
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
        ? (err.response?.data?.message || 'Tài liệu đang được sử dụng, không thể xóa.')
        : (err.response?.data?.message || 'Xóa tài liệu thất bại.');
      setFeedback({ type: 'error', text: msg });
      setDeleteTarget(null);
    }
  };

  return (
    <div className="admin-page-container">
      <PageHeader
        title="Quản Lý Tài Liệu"
        description="Quản lý tài liệu đính kèm, slide bài giảng, file nghe và phân quyền tải xuống cho học viên."
        actions={selectedCourseId && lessons.length > 0 && (
          <UiButton onClick={handleOpenCreate}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Thêm Tài Liệu Mới
          </UiButton>
        )}
      />

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

      {/* Course & Lesson Filters */}
      <div
        style={{
          background: 'var(--brand-surface)',
          padding: '1.25rem',
          borderRadius: '12px',
          border: '1px solid var(--brand-border)',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ fontWeight: 600, color: 'var(--brand-text)' }}>Khóa học:</label>
          <select
            value={selectedCourseId}
            onChange={(e) => {
              setSelectedCourseId(e.target.value);
              setSearchParams({ courseId: e.target.value });
            }}
            style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--brand-border)', outline: 'none', minWidth: '240px' }}
          >
            {courses.map((c) => (
              <option key={c._id} value={c._id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ fontWeight: 600, color: 'var(--brand-text)' }}>Bài học:</label>
          <select
            value={selectedLessonId}
            onChange={(e) => {
              setSelectedLessonId(e.target.value);
              setSearchParams({ courseId: selectedCourseId, lessonId: e.target.value });
            }}
            style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--brand-border)', outline: 'none', minWidth: '220px' }}
          >
            <option value="">Tất cả bài học</option>
            {lessons.map((l) => (
              <option key={l._id} value={l._id}>
                #{l.order || 1} - {l.title}
              </option>
            ))}
          </select>
        </div>
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
              onClick={fetchMaterials}
              style={{ padding: '0.4rem 1rem', borderRadius: '6px', border: '1px solid var(--brand-danger-border)', background: 'var(--brand-surface)', cursor: 'pointer', fontWeight: 600 }}
            >
              Thử lại
            </button>
          </div>
        </div>
      ) : loadingMaterials ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-muted)' }}>
          Đang tải danh sách tài liệu...
        </div>
      ) : materials.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-muted)', background: 'var(--brand-surface)', borderRadius: '12px', border: '1px solid var(--brand-border)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📄</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--brand-text)' }}>Chưa có tài liệu nào</div>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-muted)', margin: '0.5rem 0 1.25rem' }}>
            Thêm tài liệu hướng dẫn, file PDF hoặc tài liệu đính kèm cho bài học này.
          </p>
          {lessons.length > 0 && (
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
              + Thêm Tài Liệu Mới
            </button>
          )}
        </div>
      ) : (
        <DataTable className="table-responsive" tableClassName="admin-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>Tên Tài Liệu</th>
                <th>Bài Học</th>
                <th>Loại File</th>
                <th>Dung Lượng</th>
                <th>Quyền Tải Xuống</th>
                <th>Trạng Thái</th>
                <th style={{ textAlign: 'center' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((mat) => (
                <tr key={mat._id}>
                  <td>
                    <strong>{mat.title}</strong>
                    {mat.description && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--brand-muted)', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {mat.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: '0.85rem', color: 'var(--brand-text)' }}>
                      {mat.lesson?.title || '---'}
                    </span>
                  </td>
                  <td>
                    <code style={{ background: 'var(--brand-bg-sub)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                      {mat.fileType || 'file'}
                    </code>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.85rem', color: 'var(--brand-muted)' }}>
                      {formatFileSize(mat.fileSize)}
                    </span>
                  </td>
                  <td>
                    <StatusBadge status={mat.allowDownload ? 'active' : 'hidden'} label={mat.allowDownload ? 'Cho phép tải' : 'Chỉ xem'} />
                  </td>
                  <td>
                    <StatusBadge status={mat.status === 'published' ? 'published' : 'hidden'} label={mat.status === 'published' ? 'Đã xuất bản' : 'Ẩn'} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                      {mat.fileUrl && (
                        <a
                          href={mat.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            padding: '0.4rem 0.65rem',
                            borderRadius: '6px',
                            border: '1px solid var(--brand-border)',
                            background: 'var(--brand-surface)',
                            color: 'var(--brand-coffee)',
                            textDecoration: 'none',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            display: 'inline-block',
                          }}
                        >
                          Mở file
                        </a>
                      )}
                      <button
                        onClick={() => handleOpenEdit(mat)}
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
                        onClick={() => setDeleteTarget(mat)}
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

      {/* Create / Edit Material Modal */}
      {showModal && (
        <div
          className="ds-modal-overlay"
        >
          <div
            className="ds-modal-content ds-modal-content--md"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--brand-text)', margin: 0 }}>
                {editingMaterial ? 'Chỉnh Sửa Tài Liệu' : 'Thêm Tài Liệu Mới'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--brand-muted)' }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveMaterial} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-text)', marginBottom: '0.35rem' }}>
                  Tiêu đề tài liệu *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Slide Bài Giảng Part 1 - Picture Description"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-text)', marginBottom: '0.35rem' }}>
                  Thuộc bài học *
                </label>
                <select
                  required
                  value={formData.lessonId}
                  onChange={(e) => setFormData({ ...formData, lessonId: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)', outline: 'none' }}
                >
                  <option value="">-- Chọn bài học --</option>
                  {lessons.map((l) => (
                    <option key={l._id} value={l._id}>
                      #{l.order || 1} - {l.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-text)', marginBottom: '0.35rem' }}>
                  Mô tả tài liệu
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú thêm về nội dung tài liệu..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)', outline: 'none', resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-text)', marginBottom: '0.35rem' }}>
                  Tải lên tệp tài liệu (PDF, Word, MP3, ZIP...)
                </label>
                <input
                  type="file"
                  onChange={(e) => setFormData({ ...formData, file: e.target.files[0] })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--brand-border)', outline: 'none' }}
                />
                {editingMaterial && !formData.file && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--brand-muted)', marginTop: '0.25rem' }}>
                    Hiện tại: {editingMaterial.fileUrl ? <code>{editingMaterial.fileUrl}</code> : 'Chưa có file'} (chọn file mới nếu muốn thay thế)
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-text)', marginBottom: '0.35rem' }}>
                  Hoặc nhập File URL trực tiếp
                </label>
                <input
                  type="text"
                  placeholder="https://... hoặc /uploads/..."
                  value={formData.fileUrl}
                  onChange={(e) => setFormData({ ...formData, fileUrl: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--brand-border)', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="allowDownloadCheck"
                    checked={formData.allowDownload}
                    onChange={(e) => setFormData({ ...formData, allowDownload: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="allowDownloadCheck" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--brand-text)', cursor: 'pointer' }}>
                    Cho phép học viên tải tài liệu về máy (Bỏ chọn nếu chỉ cho xem online)
                  </label>
                </div>
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
                  <option value="hidden">Ẩn</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--brand-border)', paddingTop: '1rem' }}>
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
                  {submitting ? 'Đang lưu...' : editingMaterial ? 'Lưu Thay Đổi' : 'Thêm Tài Liệu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="ds-modal-overlay"
        >
          <div
            className="ds-modal-content ds-modal-content--sm"
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--brand-text)', marginBottom: '0.75rem' }}>
              Xác Nhận Xóa Tài Liệu
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Bạn có chắc chắn muốn xóa tài liệu <strong>"{deleteTarget.title}"</strong>? Tệp vật lý đính kèm cũng sẽ được xóa khỏi hệ thống.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
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
