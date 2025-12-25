import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { lessonApi } from '../api/lessonApi.js';
import { useParams } from 'react-router-dom';

/**
 * VÍ DỤ CODE: Upload bài giảng (Teacher)
 * 
 * Flow:
 * 1. Teacher điền form thông tin bài giảng
 * 2. Teacher chọn file attachments (video, audio, documents)
 * 3. Frontend tạo FormData và gọi API POST /api/v1/lessons
 * 4. Backend nhận file qua multer, lưu vào uploads/, lưu metadata vào DB
 * 5. Backend trả về JSON với thông tin lesson đã tạo
 * 6. Frontend hiển thị thông báo thành công
 */
export default function CreateLessonPage() {
  const { lessonId } = useParams();
  const isEdit = !!lessonId;
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    videoUrl: '',
    audioUrl: '',
    courseId: '',
    order: 0,
    duration: 0,
  });
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'order' || name === 'duration' ? Number(value) : value,
    }));
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setAttachments(files);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      // Frontend tạo FormData với files
      const lessonData = {
        ...formData,
        attachments: attachments, // Files sẽ được append vào FormData
      };

      let response;
      if (isEdit) {
        response = await lessonApi.updateLesson(lessonId, lessonData);
      } else {
        response = await lessonApi.createLesson(lessonData);
      }

      if (response.status === 'success') {
        setMessage('Lesson created successfully!');
        setTimeout(() => {
          navigate('/teacher/lessons');
        }, 2000);
      }
    } catch (error) {
      setMessage(error.response?.data?.message || 'Failed to create lesson');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h2>{isEdit ? 'Edit Lesson' : 'Create New Lesson'}</h2>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label>Title:</label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            required
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label>Content:</label>
          <textarea
            name="content"
            value={formData.content}
            onChange={handleInputChange}
            required
            rows={10}
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label>Course ID:</label>
          <input
            type="text"
            name="courseId"
            value={formData.courseId}
            onChange={handleInputChange}
            required
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label>Video URL:</label>
          <input
            type="url"
            name="videoUrl"
            value={formData.videoUrl}
            onChange={handleInputChange}
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label>Audio URL:</label>
          <input
            type="url"
            name="audioUrl"
            value={formData.audioUrl}
            onChange={handleInputChange}
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label>Attachments (Files):</label>
          <input
            type="file"
            multiple
            onChange={handleFileChange}
            style={{ width: '100%', padding: '0.5rem' }}
          />
          {attachments.length > 0 && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
              Selected: {attachments.length} file(s)
            </div>
          )}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label>Order:</label>
          <input
            type="number"
            name="order"
            value={formData.order}
            onChange={handleInputChange}
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label>Duration (minutes):</label>
          <input
            type="number"
            name="duration"
            value={formData.duration}
            onChange={handleInputChange}
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        {message && (
          <div
            style={{
              padding: '1rem',
              marginBottom: '1rem',
              background: message.includes('success') ? '#d4edda' : '#f8d7da',
              color: message.includes('success') ? '#155724' : '#721c24',
              borderRadius: '4px',
            }}
          >
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            background: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Creating...' : isEdit ? 'Update Lesson' : 'Create Lesson'}
        </button>
      </form>

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f8f9fa', borderRadius: '4px' }}>
        <h4>API Call Example:</h4>
        <pre style={{ background: '#fff', padding: '0.5rem', borderRadius: '4px', overflow: 'auto' }}>
          {`// Frontend: lessonApi.createLesson(lessonData)
POST /api/v1/lessons
Headers: {
  Authorization: "Bearer <access_token>",
  Content-Type: "multipart/form-data"
}
Body (FormData): {
  title: "Lesson Title",
  content: "Lesson content...",
  courseId: "course_id",
  videoUrl: "https://...",
  attachments: [File, File, ...] // Files
}

// Backend Response:
{
  "status": "success",
  "message": "Lesson created successfully",
  "data": {
    "lesson": {
      "_id": "...",
      "title": "...",
      "attachments": [
        {
          "filename": "...",
          "url": "uploads/file-123.pdf",
          "type": "application/pdf"
        }
      ]
    }
  }
}`}
        </pre>
      </div>
    </div>
  );
}

