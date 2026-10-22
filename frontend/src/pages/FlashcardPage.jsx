import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { lessonApi } from '../api/lessonApi.js';
import { TOEIC_VOCABULARY_BOOKS, getChapterLabel, sortLessonVocabulary } from '../constants/toeicVocabularyBooks.js';
import { loadAllStudentVocabulary } from '../utils/loadAllStudentVocabulary.js';
import { loadToeicVocabularyBook } from '../utils/loadToeicVocabularyChapters.js';
import './Vocabulary.css';

const BOOKMARK_STORAGE_KEY = 'toeic-chapter-flashcard-bookmarks';
const chapterKey = (card) => String(card?.lesson?._id || card?.lesson?.id || '');

export default function FlashcardPage() {
  const [params] = useSearchParams();
  const courseId = params.get('courseId') || '';
  const bookKey = params.get('book') || TOEIC_VOCABULARY_BOOKS[0].key;
  const lessonId = params.get('lessonId') || '';
  const lessonTitle = params.get('lessonTitle') || '';
  const topic = params.get('topic') || '';
  const startLessonId = params.get('startLessonId') || '';
  const book = TOEIC_VOCABULARY_BOOKS.find((item) => item.key === bookKey) || TOEIC_VOCABULARY_BOOKS[0];
  const isLessonContext = Boolean(lessonId);
  const backHref = isLessonContext
    ? `/student/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`
    : `/student/vocabulary?book=${encodeURIComponent(book.key)}`;
  const backLabel = isLessonContext ? '← Quay lại bài học' : '← Danh sách chapter';

  const [cards, setCards] = useState([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [bookmarked, setBookmarked] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(BOOKMARK_STORAGE_KEY) || '[]'));
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    let live = true;

    async function loadFlashcards() {
      setLoading(true);
      setError('');
      setCards([]);
      setIndex(0);
      setFlipped(false);

      try {
        let nextCards = [];
        if (lessonId) {
          const response = await lessonApi.getLessonById(lessonId);
          const data = response.data?.data || response.data;
          const lesson = data?.lesson;
          const words = sortLessonVocabulary(data?.vocabulary || []);
          if (lesson) {
            nextCards = [{
              lesson,
              chapterTitle: lesson.title || lessonTitle || 'Từ vựng bài học',
              chapterSubtitle: 'Toàn bộ từ vựng của bài học',
              words,
            }];
          }
        } else if (topic) {
          nextCards = await loadToeicVocabularyBook(topic);
        } else if (courseId) {
          const [lessonsResponse, vocabulary] = await Promise.all([
            lessonApi.getLessonsByCourse(courseId),
            loadAllStudentVocabulary({ courseId }),
          ]);
          const lessons = [...(lessonsResponse.data?.lessons || [])].sort((left, right) =>
            Number(left.order || 0) - Number(right.order || 0)
            || String(left._id).localeCompare(String(right._id)),
          );
          const wordsByLesson = new Map();
          vocabulary.forEach((word) => {
            const id = String(word.lesson?._id || word.lesson || '');
            if (!id) return;
            const words = wordsByLesson.get(id) || [];
            words.push(word);
            wordsByLesson.set(id, words);
          });

          nextCards = lessons.map((lesson, lessonIndex) => {
            const label = getChapterLabel(lesson, lessonIndex);
            return {
              lesson,
              chapterTitle: label.title,
              chapterSubtitle: label.subtitle,
              words: sortLessonVocabulary(wordsByLesson.get(String(lesson._id)) || []),
            };
          }).filter((card) => card.words.length > 0);
        } else {
          throw new Error('Hãy mở flashcard từ một bộ từ vựng hoặc từ trang bài học.');
        }

        if (!live) return;
        setCards(nextCards);
        const initialIndex = startLessonId
          ? nextCards.findIndex((card) => String(card.lesson?._id) === startLessonId)
          : -1;
        setIndex(initialIndex >= 0 ? initialIndex : 0);
      } catch (loadError) {
        if (live) setError(loadError.response?.data?.message || loadError.message || 'Không thể tải flashcard.');
      } finally {
        if (live) setLoading(false);
      }
    }

    loadFlashcards();
    return () => { live = false; };
  }, [courseId, lessonId, lessonTitle, startLessonId, topic]);

  useEffect(() => {
    localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify([...bookmarked]));
  }, [bookmarked]);

  const visibleCards = useMemo(
    () => reviewOnly ? cards.filter((card) => bookmarked.has(chapterKey(card))) : cards,
    [bookmarked, cards, reviewOnly],
  );
  const card = visibleCards[index];
  const isBookmarked = Boolean(card && bookmarked.has(chapterKey(card)));
  const markedCount = cards.filter((item) => bookmarked.has(chapterKey(item))).length;

  const changeView = (onlyBookmarked) => {
    setReviewOnly(onlyBookmarked);
    setIndex(0);
    setFlipped(false);
  };

  const toggleBookmark = () => {
    const key = chapterKey(card);
    if (!key) return;
    setBookmarked((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    if (reviewOnly) setIndex(0);
  };

  const moveCard = (direction) => {
    setIndex((current) => Math.min(visibleCards.length - 1, Math.max(0, current + direction)));
    setFlipped(false);
  };

  if (loading) return <div className="vocab-page"><div className="vocab-state" role="status">Đang tải flashcard...</div></div>;
  if (error && !cards.length) return <div className="vocab-page"><div className="vocab-error" role="alert">{error}</div><Link to={backHref}>{backLabel}</Link></div>;
  if (!cards.length) return <div className="vocab-page"><div className="vocab-state">{isLessonContext ? 'Bài học này chưa có từ vựng.' : 'Bộ từ vựng này chưa có chapter.'}</div><Link to={backHref}>{backLabel}</Link></div>;

  return (
    <div className="vocab-page flashcard-page chapter-flashcard-page">
      <Link className="vocab-back" to={backHref}>{backLabel}</Link>
      <header className="flash-head">
        <div>
          <p>FLASHCARD · {isLessonContext ? 'BÀI HỌC' : book.title}</p>
          <h1>{visibleCards.length ? `${index + 1} / ${visibleCards.length}` : '0 / 0'}</h1>
        </div>
        <div className="flashcard-view-controls" aria-label="Chọn nhóm flashcard">
          <button type="button" className={!reviewOnly ? 'active' : ''} aria-pressed={!reviewOnly} onClick={() => changeView(false)}>
            Tất cả chapter
          </button>
          <button type="button" className={reviewOnly ? 'active' : ''} aria-pressed={reviewOnly} onClick={() => changeView(true)}>
            ★ Đã đánh dấu <span>{markedCount}</span>
          </button>
          {card && (
            <button type="button" className="chapter-bookmark-button" aria-pressed={isBookmarked} onClick={toggleBookmark}>
              {isBookmarked ? '★ Đã lưu chapter' : '☆ Lưu chapter'}
            </button>
          )}
        </div>
      </header>

      {error && <div className="vocab-error" role="alert">{error}</div>}
      {!card ? (
        <section className="flashcard-review-empty">
          <span aria-hidden="true">☆</span>
          <h2>Chưa có chapter nào được đánh dấu</h2>
          <p>Đánh dấu một chapter để lưu vào danh sách xem lại.</p>
          <button type="button" onClick={() => changeView(false)}>Xem tất cả chapter</button>
        </section>
      ) : (
        <>
          <div
            role="button"
            tabIndex="0"
            className={`flashcard chapter-flashcard ${flipped ? 'flipped' : ''}`}
            onClick={(event) => {
              if (event.target.closest('.chapter-flash-word-list')) return;
              setFlipped((value) => !value);
            }}
            onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                setFlipped((value) => !value);
              }
            }}
            aria-label={`Lật flashcard ${card.chapterTitle}`}
            aria-pressed={flipped}
          >
            <div className="flash-front chapter-flash-front">
              <span className="chapter-flash-kicker">{isLessonContext ? 'BÀI HỌC' : book.title}</span>
              <h2>{card.chapterTitle}</h2>
              {card.chapterSubtitle && <p>{card.chapterSubtitle}</p>}
              <span className="chapter-flash-word-count">{card.words.length} từ vựng</span>
              <i>Nhấn để xem toàn bộ từ vựng</i>
            </div>
            <div className="flash-back chapter-flash-back">
              <header className="chapter-flash-back-head">
                <div>
                  <span>TOÀN BỘ TỪ VỰNG</span>
                  <h2>{card.chapterTitle}</h2>
                </div>
                <strong>{card.words.length} từ</strong>
              </header>
              <ol className="chapter-flash-word-list" onClick={(event) => event.stopPropagation()}>
                {card.words.map((word, wordIndex) => (
                  <li key={word._id || `${word.word}-${wordIndex}`}>
                    <div className="chapter-flash-word-term">
                      <span>{wordIndex + 1}</span>
                      <div>
                        <h3>{word.word} {word.partOfSpeech && <em>({word.partOfSpeech})</em>}</h3>
                        {word.pronunciation && <small>{word.pronunciation}</small>}
                      </div>
                      <p>{word.meaning}</p>
                    </div>
                    {(word.exampleEnglish || word.example || word.exampleVietnamese) && (
                      <div className="chapter-flash-word-examples">
                        {(word.exampleEnglish || word.example) && <p><b>EN</b> {word.exampleEnglish || word.example}</p>}
                        {word.exampleVietnamese && <p><b>VI</b> {word.exampleVietnamese}</p>}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              <span className="chapter-flash-back-hint">Nhấn ngoài danh sách để quay lại mặt trước</span>
            </div>
          </div>

          <nav className="flash-nav" aria-label="Điều hướng chapter flashcard">
            <button type="button" disabled={index === 0} onClick={() => moveCard(-1)} aria-label="Chapter trước">← Trước</button>
            <span>{card.chapterTitle} · {card.words.length} từ vựng</span>
            <button type="button" disabled={index >= visibleCards.length - 1} onClick={() => moveCard(1)} aria-label="Chapter tiếp theo">Tiếp theo →</button>
          </nav>
        </>
      )}
    </div>
  );
}
