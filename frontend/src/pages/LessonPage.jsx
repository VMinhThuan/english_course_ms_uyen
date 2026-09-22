import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { lessonApi } from '../api/lessonApi.js';
import { testApi } from '../api/testApi.js';
import './LessonPage.css';

export default function LessonPage() {
  const { courseId, lessonId } = useParams();
  const [lesson, setLesson] = useState(null);
  const [test, setTest] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const lessonsResponse = await lessonApi.getLessonsByCourse(courseId);
        const foundLesson = lessonsResponse.data.lessons?.find(
          (l) => l._id === lessonId
        );
        setLesson(foundLesson || null);

        try {
          const testResponse = await testApi.getTestByLesson(lessonId);
          setTest(testResponse.data.test);
        } catch (error) {
          // No test for this lesson
        }
      } catch (error) {
        console.error('Error fetching lesson:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [courseId, lessonId]);

  // Wrap any raw tables in content with responsive table wrappers
  const getProcessedContent = (contentHtml) => {
    if (!contentHtml) return '';
    // Wrap <table> with <div class="table-responsive-wrapper">
    return contentHtml.replace(/<table/gi, '<div class="table-responsive-wrapper"><table').replace(/<\/table>/gi, '</table></div>');
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: '#64748B' }}>Đang tải nội dung bài học...</p>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <h3 style={{ color: '#334155', marginBottom: '1rem' }}>Không tìm thấy bài học</h3>
        <Link to={`/courses/${courseId}`} style={{ color: '#49BBBD', textDecoration: 'none', fontWeight: 600 }}>
          ← Quay lại danh sách bài học
        </Link>
      </div>
    );
  }

  return (
    <div className="lesson-page-container">
      {/* Breadcrumb / Back Link */}
      <div style={{ marginBottom: '1rem' }}>
        <Link to={`/courses/${courseId}`} style={{ color: '#49BBBD', textDecoration: 'none', fontWeight: 500, fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          ← Quay lại khóa học
        </Link>
      </div>

      {/* Lesson Header */}
      <div className="lesson-header-card">
        <h1 className="lesson-title">{lesson.title}</h1>
        <div className="lesson-meta-bar">
          <span>⏱ Thời lượng: 15-20 phút</span>
          <span>•</span>
          <span>📖 Trình độ: Tất cả</span>
        </div>
      </div>

      {/* Lesson Body Content */}
      <div className="lesson-body-content">
        <div dangerouslySetInnerHTML={{ __html: getProcessedContent(lesson.content) }} />

        {/* Responsive Video Media Box */}
        {lesson.videoUrl && (
          <div className="lesson-media-box">
            <div className="lesson-media-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="23 7 16 12 23 17 23 7"></polygon>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
              </svg>
              <span>Video Giảng Bài</span>
            </div>
            <video src={lesson.videoUrl} controls className="lesson-video-player" />
          </div>
        )}

        {/* Responsive Audio Media Box */}
        {lesson.audioUrl && (
          <div className="lesson-media-box">
            <div className="lesson-media-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
              <span>Phần Nghe Luyện Tập (Audio)</span>
            </div>
            <audio src={lesson.audioUrl} controls className="lesson-audio-player" />
          </div>
        )}
      </div>

      {/* Exercise / Test CTA Card */}
      {test && (
        <div className="test-action-card">
          <div className="test-action-info">
            <h3>Sẵn sàng làm bài kiểm tra?</h3>
            <p>Kiểm tra mức độ ghi nhớ kiến thức của bài học này ngay lập tức.</p>
          </div>
          <Link to={`/student/tests/${test._id}`} className="btn-take-test">
            <span>Bắt Đầu Làm Bài</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </Link>
        </div>
      )}
    </div>
  );
}
