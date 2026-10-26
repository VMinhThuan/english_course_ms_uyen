import { useEffect, useState, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { lessonApi } from '../api/lessonApi.js';
import { materialApi } from '../api/materialApi.js';
import { progressApi } from '../api/progressApi.js';
import { getSafeLessonMediaUrl, sanitizeLessonHtml } from '../utils/sanitizeLessonHtml.js';
import { notifyFileOperation } from '../utils/fileOperationFeedback.js';
import {
  getMaterialOperationError,
  hasAttachedMaterialFile,
  isDownloadErrorBlob,
  readDownloadErrorMessage,
  resolveMaterialFilename,
} from '../utils/materialDownload.js';
import LessonMaterialPreview from '../components/LessonMaterialPreview.jsx';
import './CourseLearning.css';

const LESSON_DIFFICULTY_LABELS = {
  beginner: 'Cơ bản',
  intermediate: 'Trung cấp',
  advanced: 'Nâng cao',
};

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
  const safeUrl = getSafeLessonMediaUrl(url);
  if (!safeUrl) return null;
  let parsed;
  try {
    parsed = new URL(safeUrl, window.location.origin);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  const isYouTubeHost = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host);
  let videoId = '';
  if (isYouTubeHost && host === 'youtu.be') {
    videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
  } else if (isYouTubeHost) {
    const segments = parsed.pathname.split('/').filter(Boolean);
    videoId = parsed.searchParams.get('v') || (['embed', 'shorts', 'live', 'v'].includes(segments[0]) ? segments[1] : '') || '';
  }
  if (/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return {
      type: 'youtube',
      src: 'https://www.youtube.com/embed/' + videoId,
    };
  }
  return {
    type: 'html5',
    src: safeUrl,
  };
}

export default function LessonPage() {
  const { courseId, lessonId } = useParams();

  const [lesson, setLesson] = useState(null);
  const [courseLessons, setCourseLessons] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [vocabulary, setVocabulary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [lessonVocabularyFlipped, setLessonVocabularyFlipped] = useState(false);

  useEffect(() => {
    let isLive = true;

    async function loadData() {
      setLoading(true);
      setError('');
      setNotice(null);
      setLessonVocabularyFlipped(false);
      try {
        const [lessonRes, courseLessonsRes, accessRes, materialsRes] = await Promise.all([
          lessonApi.getLessonById(lessonId),
          lessonApi.getLessonsByCourse(courseId).catch(() => ({ data: { lessons: [] } })),
          progressApi.accessLesson(lessonId).catch(() => ({ data: {} })),
          materialApi.getMaterialsByLesson(lessonId),
        ]);

        if (!isLive) return;

        const lessonData = lessonRes.data?.lesson;
        setLesson(lessonData);
        setMaterials(materialsRes.data?.materials || []);
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
    setNotice(null);
    try {
      await progressApi.completeLesson(lessonId);
      setCompleted(true);
      setNotice({ type: 'success', text: '🎉 Đã đánh dấu hoàn thành bài học!' });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.message || 'Không thể cập nhật tiến độ.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (material) => {
    setNotice(null);
    if (!hasAttachedMaterialFile(material)) {
      notifyFileOperation({ action: 'download', outcome: 'error', message: 'Tài liệu này chưa có tệp đính kèm để tải xuống.' });
      return;
    }

    try {
      if (material.fileUrl && /^https:\/\//i.test(material.fileUrl)) {
        window.open(material.fileUrl, '_blank', 'noopener,noreferrer');
        notifyFileOperation({
          action: 'download',
          outcome: 'success',
          message: 'Đã mở liên kết tài liệu trong tab mới. Quyền truy cập tệp do dịch vụ lưu trữ liên kết quản lý.',
        });
        return;
      }
      const res = await materialApi.downloadMaterial(material._id);
      if (isDownloadErrorBlob(res.data)) {
        const message = await readDownloadErrorMessage(res.data);
        throw new Error(message || 'Máy chủ không trả về tệp hợp lệ.');
      }
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = resolveMaterialFilename({
        contentDisposition: res.headers?.['content-disposition'],
        fallbackName: material.originalName || material.filename || material.title || 'tai-lieu',
        mimeType: res.data.type || res.headers?.['content-type'],
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      notifyFileOperation({ action: 'download', outcome: 'success', message: 'Máy chủ đã gửi tệp cho trình duyệt tải xuống.' });
    } catch (e) {
      const result = await getMaterialOperationError(e, { action: 'download', fallbackMessage: 'Không thể tải tài liệu này.' });
      notifyFileOperation({ action: 'download', outcome: 'error', ...result });
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
          <Link to={`/student/courses/${courseId}`}>Quay lại khóa học của tôi</Link>
        </div>
      </main>
    );
  }

  const embedVideo = getEmbedVideo(lesson.videoUrl);
  return (
    <main className="learning-page lesson-learning">
      {/* Top Breadcrumb & Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <Link className="learning-back" style={{ marginBottom: 0 }} to={`/student/courses/${courseId}`}>
          ← Quay lại khóa học của tôi
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
          {lesson.difficulty && LESSON_DIFFICULTY_LABELS[lesson.difficulty] && (
            <span className={`lesson-difficulty-badge lesson-difficulty-badge--${lesson.difficulty}`}>
              {LESSON_DIFFICULTY_LABELS[lesson.difficulty]}
            </span>
          )}
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
      {getSafeLessonMediaUrl(lesson.audioUrl) && (
        <div style={{ margin: '1rem 0 1.5rem', padding: '1rem', background: 'var(--brand-bg-sub)', borderRadius: '12px', border: '1px solid var(--brand-border)' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-coffee)', display: 'block', marginBottom: '0.5rem' }}>
            🎧 File âm thanh bài giảng / luyện nghe:
          </span>
          <audio controls src={getSafeLessonMediaUrl(lesson.audioUrl)} style={{ width: '100%' }} />
        </div>
      )}

      {/* Lesson Content */}
      <article
        className="lesson-content"
        dangerouslySetInnerHTML={{ __html: sanitizeLessonHtml(lesson.content || '<p>Chưa có nội dung chi tiết cho bài học này.</p>') }}
      />

      {/* Vocabulary Section */}
      {vocabulary.length > 0 && (
        <section className="material-section" style={{ marginTop: '2rem' }}>
          <div className="section-title lesson-vocabulary-title">
            <h2>Flashcard từ vựng bài học</h2>
            <span>{vocabulary.length} từ · 1 thẻ</span>
          </div>
          <div className={`lesson-inline-flashcard${lessonVocabularyFlipped ? ' is-flipped' : ''}`}>
            <div className="lesson-inline-flashcard__inner">
              <section
                className="lesson-inline-flashcard__face lesson-inline-flashcard__front"
                role="button"
                tabIndex={lessonVocabularyFlipped ? -1 : 0}
                aria-hidden={lessonVocabularyFlipped}
                aria-pressed={lessonVocabularyFlipped}
                aria-label={`Lật flashcard ${lesson.title}`}
                onClick={() => setLessonVocabularyFlipped(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setLessonVocabularyFlipped(true);
                  }
                }}
              >
                <span className="lesson-inline-flashcard__eyebrow">FLASHCARD · BÀI HỌC</span>
                <h3>{lesson.title}</h3>
                {lesson.description && <p>{lesson.description}</p>}
                <span className="lesson-inline-flashcard__count">{vocabulary.length} từ vựng</span>
                <span className="lesson-inline-flashcard__flip-hint">Nhấn vào thẻ để xem toàn bộ từ →</span>
              </section>
              <section className="lesson-inline-flashcard__face lesson-inline-flashcard__back" aria-hidden={!lessonVocabularyFlipped}>
                <header>
                  <div>
                    <span>TOÀN BỘ TỪ VỰNG</span>
                    <h3>{lesson.title}</h3>
                  </div>
                  <div className="lesson-inline-flashcard__back-actions">
                    <strong>{vocabulary.length} từ</strong>
                    <button type="button" disabled={!lessonVocabularyFlipped} onClick={() => setLessonVocabularyFlipped(false)}>Mặt trước</button>
                  </div>
                </header>
                <ol className="lesson-inline-flashcard__word-list">
                  {vocabulary.map((word, index) => (
                    <li key={word._id || `${word.word}-${index}`}>
                      <div className="lesson-inline-flashcard__term">
                        <span>{index + 1}</span>
                        <div>
                          <h4>{word.word} {word.partOfSpeech && <em>({word.partOfSpeech})</em>}</h4>
                          {word.pronunciation && <small>{word.pronunciation}</small>}
                        </div>
                        <p>{word.meaning}</p>
                      </div>
                      {(word.exampleEnglish || word.example || word.exampleVietnamese) && (
                        <div className="lesson-inline-flashcard__examples">
                          {(word.exampleEnglish || word.example) && <p><b>EN</b> {word.exampleEnglish || word.example}</p>}
                          {word.exampleVietnamese && <p><b>VI</b> {word.exampleVietnamese}</p>}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            </div>
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
            <article className="lesson-material-item" key={m._id}>
              <div className="material-row">
                <b>{fileKind(m.fileType)}</b>
                <div title={m.title}>
                  <h3>{m.title}</h3>
                  {m.description && <p>{m.description}</p>}
                  <small>
                    {m.fileType} {fileSize(m.fileSize) && `· ${fileSize(m.fileSize)}`}
                  </small>
                </div>
                {m.allowDownload && hasAttachedMaterialFile(m) && (
                  <div className="material-actions">
                    <button type="button" className="material-download-button" onClick={() => handleDownload(m)}>
                      {m.fileUrl && /^https:\/\//i.test(m.fileUrl) ? 'Mở tài liệu' : '⬇️ Tải xuống'}
                    </button>
                  </div>
                )}
              </div>
              {m.allowDownload && hasAttachedMaterialFile(m) && <LessonMaterialPreview material={m} />}
            </article>
          ))
        ) : (
          <p className="learning-empty">Bài học chưa có tài liệu đính kèm.</p>
        )}
      </section>

      {/* Feedback notice */}
      {notice && (
        <div
          className={`learning-notice learning-notice--${notice.type}`}
          role={notice.type === 'error' ? 'alert' : 'status'}
          aria-live={notice.type === 'error' ? 'assertive' : 'polite'}
        >
          {notice.text}
        </div>
      )}

      {/* Bottom Completion & Prev/Next Bar */}
      <nav className="lesson-footer-nav" aria-label="Điều hướng bài học">
        {prevLesson ? (
          <Link
            to={`/student/courses/${courseId}/lessons/${prevLesson._id}`}
            className="lesson-footer-nav__previous"
            aria-label={`Bài trước: ${prevLesson.title}`}
          >
            <span aria-hidden="true">← Bài trước</span>
          </Link>
        ) : (
          <span className="lesson-footer-nav__placeholder" aria-hidden="true" />
        )}

        <button
          className="learning-primary complete-button"
          disabled={completed || saving}
          onClick={markComplete}
        >
          {completed ? '✓ Đã hoàn thành' : saving ? 'Đang cập nhật...' : 'Đánh dấu hoàn thành'}
        </button>

        {nextLesson ? (
          <Link
            to={`/student/courses/${courseId}/lessons/${nextLesson._id}`}
            className="lesson-footer-nav__next"
            aria-label={`Bài tiếp theo: ${nextLesson.title}`}
          >
            <span aria-hidden="true">Bài tiếp theo →</span>
          </Link>
        ) : (
          <Link
            to={`/student/courses/${courseId}`}
            className="lesson-footer-nav__next lesson-footer-nav__course"
            aria-label="Quay lại khóa học sau khi hoàn thành"
          >
            <span aria-hidden="true">Hoàn thành khóa học →</span>
          </Link>
        )}
      </nav>
    </main>
  );
}
