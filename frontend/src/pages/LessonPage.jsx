import { useEffect, useState, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { lessonApi } from '../api/lessonApi.js';
import { materialApi } from '../api/materialApi.js';
import { progressApi } from '../api/progressApi.js';
import './CourseLearning.css';

const fileKind = (type = '') =>
  type.includes('pdf')
    ? 'PDF'
    : type.includes('word') || type.includes('document')
    ? 'WORD'
    : type.includes('image')
    ? 'IMAGE'
    : type.includes('audio')
    ? 'AUDIO'
    : 'FILE';

const fileSize = (size) =>
  size ? `${Math.max(1, Math.round(size / 1024))} KB` : '';

function getEmbedVideo(url) {
  if (!url) return null;
  const trimmed = url.trim();
  const ytMatch = trimmed.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
  );
  if (ytMatch && ytMatch[1]) {
    return {
      type: 'youtube',
      src: `https://www.youtube.com/embed/${ytMatch[1]}`,
    };
  }
  return {
    type: 'html5',
    src: trimmed,
  };
}

export default function LessonPage() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();

  const [lesson, setLesson] = useState(null);
  const [courseLessons, setCourseLessons] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [vocabulary, setVocabulary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let isLive = true;

    async function loadData() {
      setLoading(true);
      setError('');
      try {
        const [lessonRes, courseLessonsRes, accessRes] = await Promise.all([
          lessonApi.getLessonById(lessonId),
          lessonApi.getLessonsByCourse(courseId).catch(() => ({ data: { lessons: [] } })),
          progressApi.accessLesson(lessonId).catch(() => ({ data: {} })),
        ]);

        if (!isLive) return;

        const lessonData = lessonRes.data?.lesson;
        setLesson(lessonData);
        setMaterials(lessonRes.data?.materials || []);
        setVocabulary(lessonRes.data?.vocabulary || []);
        setCourseLessons(courseLessonsRes.data?.lessons || []);
        setCompleted(accessRes.data?.progress?.status === 'completed');
      } catch (err) {
        if (isLive) {
          setError(err.response?.data?.message || 'Không thể tải nội dung bài học.');
        }
      } finally {
        if (isLive) setLoading(false);
      }
    }

    loadData();
    return () => {
      isLive = false;
    };
  }, [courseId, lessonId]);

  // Determine prev and next lessons
  const { prevLesson, nextLesson, currentIndex } = useMemo(() => {
    if (!courseLessons.length) return { prevLesson: null, nextLesson: null, currentIndex: -1 };
    const sorted = [...courseLessons].sort((a, b) => (a.order || 0) - (b.order || 0));
    const idx = sorted.findIndex((l) => String(l._id) === String(lessonId));
    return {
      prevLesson: idx > 0 ? sorted[idx - 1] : null,
      nextLesson: idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null,
      currentIndex: idx,
    };
  }, [courseLessons, lessonId]);

  const markComplete = async () => {
    setSaving(true);
    setNotice('');
    try {
      await progressApi.completeLesson(lessonId);
      setCompleted(true);
      setNotice('🎉 Đã đánh dấu hoàn thành bài học!');
    } catch (e) {
      setNotice(e.response?.data?.message || 'Không thể cập nhật tiến độ.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (material) => {
    try {
      const res = await materialApi.downloadMaterial(material._id);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = material.title || 'tai-lieu';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setNotice(e.response?.data?.message || 'Không thể tải tài liệu này.');
    }
  };

  if (loading) {
    return (
      <main className="learning-page">
        <div className="learning-loading">Đang tải nội dung bài học...</div>
      </main>
    );
  }

  if (!lesson) {
    return (
      <main className="learning-page">
        <div className="learning-error">
          <span>{error || 'Không tìm thấy bài học này.'}</span>
          <Link to={`/courses/${courseId}`}>Quay lại khóa học</Link>
        </div>
      </main>
    );
  }

  const embedVideo = getEmbedVideo(lesson.videoUrl);

  return (
    <main className="learning-page lesson-learning">
      {/* Top Breadcrumb & Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <Link className="learning-back" style={{ marginBottom: 0 }} to={`/courses/${courseId}`}>
          ← Quay lại khóa học
        </Link>
        {courseLessons.length > 0 && (
          <span style={{ fontSize: '0.85rem', color: 'var(--brand-muted)', fontWeight: 600 }}>
            Bài {currentIndex + 1} / {courseLessons.length}
          </span>
        )}
      </div>

      {/* Lesson Header */}
      <header className="lesson-learning-head">
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span className="learning-eyebrow">BÀI HỌC {lesson.order || currentIndex + 1}</span>
          {lesson.topic && <span className="lesson-topic-badge">{lesson.topic}</span>}
          {completed && <span className="pass-badge pass" style={{ fontSize: '11px' }}>✓ Đã hoàn thành</span>}
        </div>
        <h1>{lesson.title}</h1>
        {lesson.description && <p>{lesson.description}</p>}
        {lesson.duration > 0 && <small style={{ color: 'var(--brand-muted)', display: 'block', marginTop: '0.5rem' }}>⏱️ Thời lượng ước tính: {lesson.duration} phút</small>}
      </header>

      {/* Video Player */}
      {embedVideo && (
        <div style={{ margin: '1.5rem 0' }}>
          {embedVideo.type === 'youtube' ? (
            <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '14px', background: '#000' }}>
              <iframe
                src={embedVideo.src}
                title={lesson.title}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <video
              className="lesson-media"
              controls
              src={embedVideo.src}
              style={{ width: '100%', borderRadius: '14px' }}
            />
          )}
        </div>
      )}

      {/* Audio Player */}
      {lesson.audioUrl && (
        <div style={{ margin: '1rem 0 1.5rem', padding: '1rem', background: 'var(--brand-bg-sub)', borderRadius: '12px', border: '1px solid var(--brand-border)' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-coffee)', display: 'block', marginBottom: '0.5rem' }}>
            🎧 File âm thanh bài giảng / luyện nghe:
          </span>
          <audio controls src={lesson.audioUrl} style={{ width: '100%' }} />
        </div>
      )}

      {/* Lesson Content */}
      <article
        className="lesson-content"
        dangerouslySetInnerHTML={{ __html: lesson.content || '<p>Chưa có nội dung chi tiết cho bài học này.</p>' }}
      />

      {/* Vocabulary Section */}
      {vocabulary.length > 0 && (
        <section className="material-section" style={{ marginTop: '2rem' }}>
          <div className="section-title">
            <h2>Từ vựng trọng tâm trong bài</h2>
            <span>{vocabulary.length} từ</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            {vocabulary.map((v) => (
              <div
                key={v._id}
                style={{
                  padding: '1rem',
                  borderRadius: '12px',
                  border: '1px solid var(--brand-border-light)',
                  background: 'var(--brand-surface)',
                  boxShadow: 'var(--shadow-subtle)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                  <strong style={{ fontSize: '1.1rem', color: 'var(--brand-coffee)' }}>{v.word}</strong>
                  {v.partOfSpeech && <em style={{ fontSize: '0.8rem', color: 'var(--brand-muted)' }}>({v.partOfSpeech})</em>}
                </div>
                {v.pronunciation && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--brand-muted)', marginBottom: '0.5rem' }}>
                    {v.pronunciation}
                  </div>
                )}
                <div style={{ fontSize: '0.9rem', color: 'var(--brand-text)', fontWeight: 600, marginBottom: '0.5rem' }}>
                  {v.meaning}
                </div>
                {(v.exampleEnglish || v.example) && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--brand-muted)', fontStyle: 'italic', margin: 0 }}>
                    "{v.exampleEnglish || v.example}"
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Materials Section */}
      <section className="material-section" style={{ marginTop: '2rem' }}>
        <div className="section-title">
          <h2>Tài liệu đính kèm</h2>
          <span>{materials.length} tập tin</span>
        </div>
        {materials.length > 0 ? (
          materials.map((m) => (
            <article className="material-row" key={m._id}>
              <b>{fileKind(m.fileType)}</b>
              <div title={m.title}>
                <h3>{m.title}</h3>
                {m.description && <p>{m.description}</p>}
                <small>
                  {m.fileType} {fileSize(m.fileSize) && `· ${fileSize(m.fileSize)}`}
                </small>
              </div>
              {m.allowDownload && (
                <button onClick={() => handleDownload(m)}>
                  ⬇️ Tải xuống
                </button>
              )}
            </article>
          ))
        ) : (
          <p className="learning-empty">Bài học chưa có tài liệu đính kèm.</p>
        )}
      </section>

      {/* Feedback notice */}
      {notice && <div className="learning-notice">{notice}</div>}

      {/* Bottom Completion & Prev/Next Bar */}
      <div
        style={{
          marginTop: '2.5rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid var(--brand-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        {prevLesson ? (
          <Link
            to={`/student/courses/${courseId}/lessons/${prevLesson._id}`}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '8px',
              border: '1px solid var(--brand-border)',
              background: 'var(--brand-surface)',
              color: 'var(--brand-text)',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            ← {prevLesson.title}
          </Link>
        ) : (
          <div />
        )}

        <button
          className="learning-primary complete-button"
          style={{ marginTop: 0 }}
          disabled={completed || saving}
          onClick={markComplete}
        >
          {completed ? '✓ Đã hoàn thành bài học' : saving ? 'Đang cập nhật...' : 'Đánh dấu hoàn thành bài học'}
        </button>

        {nextLesson ? (
          <Link
            to={`/student/courses/${courseId}/lessons/${nextLesson._id}`}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--brand-coffee)',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            Bài tiếp theo: {nextLesson.title} →
          </Link>
        ) : (
          <Link
            to={`/courses/${courseId}`}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '8px',
              border: '1px solid var(--brand-border)',
              background: 'var(--brand-surface)',
              color: 'var(--brand-text)',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            🎉 Hoàn thành khóa học
          </Link>
        )}
      </div>
    </main>
  );
}
