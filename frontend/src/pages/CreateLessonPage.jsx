import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { lessonApi } from '../api/lessonApi.js';
import { courseApi } from '../api/courseApi.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import UiButton from '../components/ui/UiButton.jsx';
import './CreateLessonPage.css';

export default function CreateLessonPage() {
  const { lessonId } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = !!lessonId;
  const navigate = useNavigate();

  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);

  const [formData, setFormData] = useState({
    title: '',
    topic: 'General',
    difficulty: '',
    description: '',
    content: '',
    videoUrl: '',
    audioUrl: '',
    courseId: searchParams.get('courseId') || '',
    order: 1,
    duration: 30,
    status: 'published',
  });

  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchCourses();
    if (isEdit) {
      fetchExistingLesson();
    }
  }, [lessonId]);

  const fetchCourses = async () => {
    try {
      setLoadingCourses(true);
      const res = await courseApi.getAdminCourses();
      if (res.status === 'success') {
        const list = res.data.courses || [];
        setCourses(list);
        if (!formData.courseId && list.length > 0) {
          const preselected = searchParams.get('courseId') || list[0]._id;
          setFormData((prev) => ({ ...prev, courseId: preselected }));
        }
      }
    } catch (err) {
      console.error('Failed to load courses for lesson creator:', err);
    } finally {
      setLoadingCourses(false);
    }
  };

  const fetchExistingLesson = async () => {
    try {
      setLoading(true);
      const res = await lessonApi.getLessonById(lessonId);
      if (res.status === 'success' && res.data.lesson) {
        const l = res.data.lesson;
        setFormData({
          title: l.title || '',
          topic: l.topic || 'General',
          difficulty: l.difficulty || '',
          description: l.description || '',
          content: l.content || '',
          videoUrl: l.videoUrl || '',
          audioUrl: l.audioUrl || '',
          courseId: l.course?._id || l.course || '',
          order: l.order || 1,
          duration: l.duration || 30,
          status: l.status || 'published',
        });
      }
    } catch (err) {
      setMessage(err.response?.data?.message || 'Không thể tải thông tin bài học.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'order' || name === 'duration' ? Number(value) : value,
    }));
  };

  const handleFileChange = (event) => {
    setAttachments(Array.from(event.target.files));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData.courseId) {
      setMessage('Vui lòng chọn khóa học cho bài học này.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const payload = {
        ...formData,
        difficulty: formData.difficulty || null,
        course: formData.courseId,
        attachments,
      };

      const response = isEdit
        ? await lessonApi.updateLesson(lessonId, payload)
        : await lessonApi.createLesson(payload);

      if (response.status === 'success') {
        setMessage(isEdit ? 'Cập nhật bài học thành công!' : 'Tạo bài học mới thành công!');
        setTimeout(() => {
          navigate(`/admin/lessons?courseId=${formData.courseId}`);
        }, 1200);
      }
    } catch (error) {
      setMessage(error.response?.data?.message || 'Thao tác lưu bài học thất bại.');
    } finally {
      setLoading(false);
    }
  };

  const successful = message.includes('thành công');

  return (
    <main className="create-lesson-page">
      <div style={{ marginBottom: '1rem' }}>
        <Link to={`/admin/lessons${formData.courseId ? `?courseId=${formData.courseId}` : ''}`} style={{ color: 'var(--brand-coffee)', textDecoration: 'none', fontWeight: 600 }}>
          ← Quay lại danh sách bài học
        </Link>
      </div>

      <PageHeader
        eyebrow="Quản lý giảng dạy"
        title={isEdit ? 'Chỉnh Sửa Bài Học' : 'Thêm Bài Học Mới'}
        description="Soạn thảo nội dung bài giảng đa phương tiện, đính kèm video, âm thanh và tài liệu học tập."
      />

      <form className="lesson-form" onSubmit={handleSubmit}>
        {/* Course selection dropdown */}
        <label className="form-group">
          <span className="form-label">Chọn Khóa Học (*):</span>
          {loadingCourses ? (
            <div>Đang tải danh sách khóa học...</div>
          ) : (
            <select
              className="form-input"
              name="courseId"
              value={formData.courseId}
              onChange={handleInputChange}
              required
            >
              <option value="">-- Vui lòng chọn một khóa học --</option>
              {courses.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.title} ({c.englishType || 'Course'} - {c.level || 'All'})
                </option>
              ))}
            </select>
          )}
        </label>

        {/* Lesson Title */}
        <label className="form-group">
          <span className="form-label">Tiêu đề bài học (*):</span>
          <input
            className="form-input"
            type="text"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            placeholder="Ví dụ: Unit 1: Present Simple & Daily Vocabulary"
            required
          />
        </label>

        {/* Short description */}
        <label className="form-group">
          <span className="form-label">Tóm tắt ngắn gọn:</span>
          <input
            className="form-input"
            type="text"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Mô tả mục tiêu của bài học trong 1-2 câu"
          />
        </label>

        {/* Grid settings */}
        <div className="lesson-form-grid">
          <label className="form-group">
            <span className="form-label">Chủ đề / Kỹ năng:</span>
            <select
              className="form-input"
              name="topic"
              value={formData.topic}
              onChange={handleInputChange}
            >
              <option value="General">Tổng quát (General)</option>
              <option value="Vocabulary">Từ vựng (Vocabulary)</option>
              <option value="Grammar">Ngữ pháp (Grammar)</option>
              <option value="Listening">Luyện nghe (Listening)</option>
              <option value="Reading">Đọc hiểu (Reading)</option>
              <option value="Speaking">Giao tiếp (Speaking)</option>
              <option value="Writing">Viết (Writing)</option>
              <option value="Practice">Luyện tập (Practice)</option>
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">Mức độ bài học (tùy chọn):</span>
            <select
              className="form-input"
              name="difficulty"
              value={formData.difficulty}
              onChange={handleInputChange}
            >
              <option value="">Chưa phân loại</option>
              <option value="beginner">Cơ bản</option>
              <option value="intermediate">Trung cấp</option>
              <option value="advanced">Nâng cao</option>
            </select>
            <small className="form-help">Bài học cũ không tự gán độ khó; bạn có thể cập nhật khi phù hợp.</small>
          </label>

          <label className="form-group">
            <span className="form-label">Trạng thái:</span>
            <select
              className="form-input"
              name="status"
              value={formData.status}
              onChange={handleInputChange}
            >
              <option value="published">Xuất bản ngay (Published)</option>
              <option value="draft">Bản nháp (Draft)</option>
              <option value="hidden">Ẩn (Hidden)</option>
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">Thứ tự bài học:</span>
            <input
              className="form-input"
              type="number"
              name="order"
              min="1"
              value={formData.order}
              onChange={handleInputChange}
            />
          </label>

          <label className="form-group">
            <span className="form-label">Thời lượng ước tính (phút):</span>
            <input
              className="form-input"
              type="number"
              name="duration"
              min="0"
              value={formData.duration}
              onChange={handleInputChange}
            />
          </label>
        </div>

        {/* Media URLs */}
        <div className="lesson-form-grid">
          <label className="form-group">
            <span className="form-label">Video URL (YouTube hoặc file trực tiếp):</span>
            <input
              className="form-input"
              type="url"
              name="videoUrl"
              placeholder="https://www.youtube.com/watch?v=..."
              value={formData.videoUrl}
              onChange={handleInputChange}
            />
          </label>

          <label className="form-group">
            <span className="form-label">Audio URL (File phát âm/luyện nghe):</span>
            <input
              className="form-input"
              type="url"
              name="audioUrl"
              placeholder="https://example.com/audio.mp3"
              value={formData.audioUrl}
              onChange={handleInputChange}
            />
          </label>
        </div>

        {/* Lesson Rich Content */}
        <label className="form-group">
          <span className="form-label">Nội dung chi tiết bài giảng (Hỗ trợ HTML/Văn bản) (*):</span>
          <textarea
            className="form-textarea"
            name="content"
            value={formData.content}
            onChange={handleInputChange}
            placeholder="Soạn nội dung bài học, lý thuyết, từ vựng, ví dụ minh họa..."
            required
            rows="10"
          />
        </label>

        {/* Attachments */}
        <label className="form-group">
          <span className="form-label">Đính kèm tài liệu học tập (PDF, Word, Ảnh):</span>
          <input
            className="file-input"
            type="file"
            multiple
            onChange={handleFileChange}
          />
          {attachments.length > 0 && (
            <span className="file-count">Đã chọn: {attachments.length} tập tin</span>
          )}
        </label>

        {/* Feedback message */}
        {message && (
          <div className={`message ${successful ? 'message-success' : 'message-error'}`}>
            {message}
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <UiButton type="submit" disabled={loading}>
            {loading ? 'Đang lưu bài học...' : isEdit ? '💾 Cập Nhật Bài Học' : '➕ Tạo Bài Học Mới'}
          </UiButton>
          <button
            type="button"
            onClick={() => navigate(`/admin/lessons${formData.courseId ? `?courseId=${formData.courseId}` : ''}`)}
            style={{
              padding: '0.6rem 1.25rem',
              borderRadius: '8px',
              border: '1px solid var(--brand-border)',
              background: 'var(--brand-surface)',
              color: 'var(--brand-text)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Hủy Bỏ
          </button>
        </div>
      </form>
    </main>
  );
}
