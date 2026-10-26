import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { lessonApi } from '../api/lessonApi.js';
import { TOEIC_VOCABULARY_BOOKS, getChapterLabel, sortLessonVocabulary } from '../constants/toeicVocabularyBooks.js';
import { loadAllStudentVocabulary } from '../utils/loadAllStudentVocabulary.js';
import { loadToeicVocabularyBook } from '../utils/loadToeicVocabularyChapters.js';
import { studentVocabularyCatalogApi } from '../features/vocabulary-catalog/studentApi.js';
import { toCatalogFlashcardWord } from '../features/vocabulary-catalog/flashcardPresentationAdapter.js';
import './Vocabulary.css';

const BOOKMARK_STORAGE_KEY = 'toeic-chapter-flashcard-bookmarks';
const CATALOG_BOOKMARK_STORAGE_KEY = 'student-vocabulary-catalog-chapter-bookmarks-v1';
const readBookmarks = (storageKey) => {
  try { return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')); }
  catch { return new Set(); }
};
const chapterKey = (card) => card?.catalogChapterId
  ? `catalog:${card.catalogTagId}:${card.catalogChapterId}`
  : String(card?.lesson?._id || card?.lesson?.id || '');

async function loadCatalogChapters(tagId) {
  const first = await studentVocabularyCatalogApi.listChapters(tagId, { page: 1, limit: 100 });
  const chapters = [...(first.items || [])];
  for (let page = 2; page <= (first.pagination?.pages || 1); page += 1) {
    const next = await studentVocabularyCatalogApi.listChapters(tagId, { page, limit: 100 });
    chapters.push(...(next.items || []));
  }
  return chapters;
}

async function loadAllChapterWords(chapterId) {
  const first = await studentVocabularyCatalogApi.listChapterVocabulary(chapterId, { page: 1, limit: 100 });
  const words = [...(first.items || [])];
  for (let page = 2; page <= (first.pagination?.pages || 1); page += 1) {
    const next = await studentVocabularyCatalogApi.listChapterVocabulary(chapterId, { page, limit: 100 });
    words.push(...(next.items || []));
  }
  return words.map(toCatalogFlashcardWord);
}

export default function FlashcardPage() {
  const [params] = useSearchParams();
  const catalogTagId = params.get('catalogTagId') || '';
  const startChapterId = params.get('startChapterId') || '';
  const courseId = params.get('courseId') || '';
  const bookKey = params.get('book') || TOEIC_VOCABULARY_BOOKS[0].key;
  const lessonId = params.get('lessonId') || '';
  const lessonTitle = params.get('lessonTitle') || '';
  const topic = params.get('topic') || '';
  const startLessonId = params.get('startLessonId') || '';
  const isCatalogContext = Boolean(catalogTagId);
  const bookmarkStorageKey = isCatalogContext ? CATALOG_BOOKMARK_STORAGE_KEY : BOOKMARK_STORAGE_KEY;
  const book = TOEIC_VOCABULARY_BOOKS.find((item) => item.key === bookKey) || TOEIC_VOCABULARY_BOOKS[0];
  const isLessonContext = Boolean(lessonId);
  const backHref = isCatalogContext
    ? `/student/vocabulary-catalog?tagId=${encodeURIComponent(catalogTagId)}`
    : isLessonContext
    ? `/student/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`
    : `/student/vocabulary?book=${encodeURIComponent(book.key)}`;
  const backLabel = isCatalogContext ? '← Danh sách Chapter' : isLessonContext ? '← Quay lại bài học' : '← Danh sách chapter';

  const [cards, setCards] = useState([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [catalogWords, setCatalogWords] = useState([]);
  const [catalogWordsChapterId, setCatalogWordsChapterId] = useState('');
  const [catalogWordsLoading, setCatalogWordsLoading] = useState(false);
  const [catalogWordsError, setCatalogWordsError] = useState('');
  const [catalogWordsRetry, setCatalogWordsRetry] = useState(0);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [bookmarked, setBookmarked] = useState(() => readBookmarks(bookmarkStorageKey));
  const activeBookmarkKey = useRef(bookmarkStorageKey);

  useEffect(() => {
    activeBookmarkKey.current = bookmarkStorageKey;
    setBookmarked(readBookmarks(bookmarkStorageKey));
    setReviewOnly(false);
  }, [bookmarkStorageKey]);

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
        if (isCatalogContext) {
          const chapters = await loadCatalogChapters(catalogTagId);
          if (startChapterId && !chapters.some((chapter) => chapter._id === startChapterId)) {
            throw new Error('Chapter này không còn khả dụng. Hãy quay lại danh sách để chọn Chapter đã mở.');
          }
          if (startChapterId) {
            const chapter = chapters.find((item) => item._id === startChapterId);
            const words = await loadAllChapterWords(chapter._id);
            nextCards = words.length
              ? words.map((word) => ({
                catalogChapterId: chapter._id,
                catalogTagId,
                catalogTagName: chapter.tagName,
                chapterTitle: chapter.title,
                chapterSubtitle: chapter.description,
                vocabularyCount: words.length,
                word,
                words: [word],
              }))
              : [{
                catalogChapterId: chapter._id,
                catalogTagId,
                catalogTagName: chapter.tagName,
                chapterTitle: chapter.title,
                chapterSubtitle: chapter.description,
                vocabularyCount: 0,
                words: [],
              }];
          } else {
            nextCards = chapters.map((chapter) => ({
              catalogChapterId: chapter._id,
              catalogTagId,
              catalogTagName: chapter.tagName,
              chapterTitle: chapter.title,
              chapterSubtitle: chapter.description,
              vocabularyCount: chapter.vocabularyCount,
              words: [],
            }));
          }
        } else if (lessonId) {
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
        const initialIndex = isCatalogContext && startChapterId
          ? nextCards.findIndex((card) => card.catalogChapterId === startChapterId)
          : startLessonId
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
  }, [catalogTagId, courseId, isCatalogContext, lessonId, lessonTitle, startChapterId, startLessonId, topic]);

  useEffect(() => {
    if (activeBookmarkKey.current !== bookmarkStorageKey) return;
    localStorage.setItem(bookmarkStorageKey, JSON.stringify([...bookmarked]));
  }, [bookmarkStorageKey, bookmarked]);

  const visibleCards = useMemo(
    () => reviewOnly ? cards.filter((card) => bookmarked.has(chapterKey(card))) : cards,
    [bookmarked, cards, reviewOnly],
  );
  const card = visibleCards[index];
  const isBookmarked = Boolean(card && bookmarked.has(chapterKey(card)));
  const markedCount = cards.filter((item) => bookmarked.has(chapterKey(item))).length;
  const activeCatalogChapterId = isCatalogContext ? card?.catalogChapterId || '' : '';
  const visibleWords = isCatalogContext
    ? card?.word
      ? [card.word]
      : (catalogWordsChapterId === activeCatalogChapterId ? catalogWords : [])
    : card?.words || [];
  const visibleWordCount = isCatalogContext
    ? card?.vocabularyCount ?? visibleWords.length
    : visibleWords.length;

  useEffect(() => {
    if (!isCatalogContext || !activeCatalogChapterId || startChapterId) return undefined;
    let live = true;
    setCatalogWords([]);
    setCatalogWordsChapterId('');
    setCatalogWordsLoading(true);
    setCatalogWordsError('');
    loadAllChapterWords(activeCatalogChapterId)
      .then((words) => {
        if (!live) return;
        setCatalogWords(words);
        setCatalogWordsChapterId(activeCatalogChapterId);
      })
      .catch((loadError) => {
        if (live) setCatalogWordsError(loadError.message || 'Không thể tải từ vựng của Chapter.');
      })
      .finally(() => { if (live) setCatalogWordsLoading(false); });
    return () => { live = false; };
  }, [activeCatalogChapterId, catalogWordsRetry, isCatalogContext]);

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
  if (!cards.length) return <div className="vocab-page"><div className="vocab-state">{isCatalogContext ? 'Bộ từ vựng này chưa có Chapter được mở.' : isLessonContext ? 'Bài học này chưa có từ vựng.' : 'Bộ từ vựng này chưa có chapter.'}</div><Link to={backHref}>{backLabel}</Link></div>;

  return (
    <div className="vocab-page flashcard-page chapter-flashcard-page">
      <Link className="vocab-back" to={backHref}>{backLabel}</Link>
      <header className="flash-head">
        <div>
          <p>FLASHCARD · {isCatalogContext ? card?.catalogTagName : isLessonContext ? 'BÀI HỌC' : book.title}</p>
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
      {isCatalogContext && catalogWordsError && (
        <div className="vocab-error" role="alert">
          {catalogWordsError}
          <button type="button" onClick={() => setCatalogWordsRetry((value) => value + 1)}>Thử lại</button>
        </div>
      )}
      {isCatalogContext && !catalogWordsError && (catalogWordsLoading || catalogWordsChapterId !== activeCatalogChapterId) ? (
        <div className="vocab-state" role="status">Đang tải toàn bộ từ vựng của Chapter...</div>
      ) : null}
      {!card ? (
        <section className="flashcard-review-empty">
          <span aria-hidden="true">☆</span>
          <h2>Chưa có chapter nào được đánh dấu</h2>
          <p>Đánh dấu một chapter để lưu vào danh sách xem lại.</p>
          <button type="button" onClick={() => changeView(false)}>Xem tất cả chapter</button>
        </section>
      ) : (
        <>
          {isCatalogContext && card.word ? (
            <div
              role="button"
              tabIndex="0"
              className={`flashcard chapter-flashcard ${flipped ? 'flipped' : ''}`}
              onClick={() => setFlipped((value) => !value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setFlipped((value) => !value);
                } else if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  moveCard(-1);
                } else if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  moveCard(1);
                }
              }}
              aria-label={`Lật flashcard từ ${card.word.word}`}
              aria-pressed={flipped}
            >
              <div className="flash-front chapter-flash-front">
                <span className="chapter-flash-kicker">{card.catalogTagName} · {card.chapterTitle}</span>
                <h2>{card.word.word}</h2>
                {card.word.partOfSpeech && <p>{card.word.partOfSpeech}</p>}
                <span className="chapter-flash-word-count">Từ {index + 1} / {visibleCards.length}</span>
                <i>Nhấn để xem nghĩa và ví dụ</i>
              </div>
              <div className="flash-back chapter-flash-back">
                <header className="chapter-flash-back-head">
                  <div>
                    <span>{card.chapterTitle}</span>
                    <h2>{card.word.word}</h2>
                  </div>
                  <strong>{index + 1} / {visibleCards.length}</strong>
                </header>
                <div className="chapter-flash-word-list chapter-flash-word-list--single">
                  <div className="chapter-flash-word-term">
                    <span>{index + 1}</span>
                    <div>
                      <h3>{card.word.word} {card.word.partOfSpeech && <em>({card.word.partOfSpeech})</em>}</h3>
                      {card.word.pronunciation && <small>{card.word.pronunciation}</small>}
                    </div>
                    {!card.word.catalogSenses?.length && <p>{card.word.meaning}</p>}
                  </div>
                  {card.word.catalogSenses?.length ? (
                    <div className="chapter-flash-catalog-senses">
                      {card.word.catalogSenses.map((sense, senseIndex) => (
                        <section className="chapter-flash-catalog-sense" key={`${card.word._id}-sense-${senseIndex}`}>
                          <div className="chapter-flash-catalog-sense-heading">
                            <span>{sense.partOfSpeech.join(' · ') || 'Nghĩa'}</span>
                            <p>{sense.meaning}</p>
                          </div>
                          {sense.usagePattern && <p className="chapter-flash-catalog-usage">Cách dùng: {sense.usagePattern}</p>}
                          {sense.examples.map((example, exampleIndex) => (
                            <div className="chapter-flash-word-examples" key={`${card.word._id}-${senseIndex}-${exampleIndex}`}>
                              {example.english && <p><b>EN</b> {example.english}</p>}
                              {example.vietnamese && <p><b>VI</b> {example.vietnamese}</p>}
                            </div>
                          ))}
                          {sense.notes.map((note, noteIndex) => <p className="chapter-flash-catalog-note" key={`${card.word._id}-sense-note-${senseIndex}-${noteIndex}`}>{note}</p>)}
                        </section>
                      ))}
                      {card.word.catalogNotes.map((note, noteIndex) => <p className="chapter-flash-catalog-note chapter-flash-catalog-note--chapter" key={`${card.word._id}-chapter-note-${noteIndex}`}>Ghi chú: {note}</p>)}
                    </div>
                  ) : (card.word.exampleEnglish || card.word.example || card.word.exampleVietnamese) && (
                    <div className="chapter-flash-word-examples">
                      {(card.word.exampleEnglish || card.word.example) && <p><b>EN</b> {card.word.exampleEnglish || card.word.example}</p>}
                      {card.word.exampleVietnamese && <p><b>VI</b> {card.word.exampleVietnamese}</p>}
                    </div>
                  )}
                </div>
                <span className="chapter-flash-back-hint">Nhấn để quay lại mặt trước</span>
              </div>
            </div>
          ) : (
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
              } else if (event.target === event.currentTarget && event.key === 'ArrowLeft') {
                event.preventDefault();
                moveCard(-1);
              } else if (event.target === event.currentTarget && event.key === 'ArrowRight') {
                event.preventDefault();
                moveCard(1);
              }
            }}
            aria-label={`Lật flashcard ${card.chapterTitle}`}
            aria-pressed={flipped}
          >
            <div className="flash-front chapter-flash-front">
              <span className="chapter-flash-kicker">{isCatalogContext ? card.catalogTagName : isLessonContext ? 'BÀI HỌC' : book.title}</span>
              <h2>{card.chapterTitle}</h2>
              {card.chapterSubtitle && <p>{card.chapterSubtitle}</p>}
              <span className="chapter-flash-word-count">{visibleWordCount} từ vựng</span>
              <i>Nhấn để xem toàn bộ từ vựng</i>
            </div>
            <div className="flash-back chapter-flash-back">
              <header className="chapter-flash-back-head">
                <div>
                  <span>TOÀN BỘ TỪ VỰNG</span>
                  <h2>{card.chapterTitle}</h2>
                </div>
                <strong>{visibleWords.length} từ</strong>
              </header>
              <ol className="chapter-flash-word-list" onClick={(event) => event.stopPropagation()}>
                {visibleWords.map((word, wordIndex) => (
                  <li key={word._id || `${word.word}-${wordIndex}`}>
                    <div className="chapter-flash-word-term">
                      <span>{wordIndex + 1}</span>
                      <div>
                        <h3>{word.word} {word.partOfSpeech && <em>({word.partOfSpeech})</em>}</h3>
                        {word.pronunciation && <small>{word.pronunciation}</small>}
                      </div>
                      {!(isCatalogContext && word.catalogSenses?.length) && <p>{word.meaning}</p>}
                    </div>
                    {isCatalogContext && word.catalogSenses?.length ? (
                      <div className="chapter-flash-catalog-senses">
                        {word.catalogSenses.map((sense, senseIndex) => (
                          <section className="chapter-flash-catalog-sense" key={`${word._id}-sense-${senseIndex}`}>
                            <div className="chapter-flash-catalog-sense-heading">
                              <span>{sense.partOfSpeech.join(' · ') || 'Nghĩa'}</span>
                              <p>{sense.meaning}</p>
                            </div>
                            {sense.usagePattern && <p className="chapter-flash-catalog-usage">Cách dùng: {sense.usagePattern}</p>}
                            {sense.examples.map((example, exampleIndex) => (
                              <div className="chapter-flash-word-examples" key={`${word._id}-${senseIndex}-${exampleIndex}`}>
                                {example.english && <p><b>EN</b> {example.english}</p>}
                                {example.vietnamese && <p><b>VI</b> {example.vietnamese}</p>}
                              </div>
                            ))}
                            {sense.notes.map((note, noteIndex) => <p className="chapter-flash-catalog-note" key={`${word._id}-sense-note-${senseIndex}-${noteIndex}`}>{note}</p>)}
                          </section>
                        ))}
                        {word.catalogNotes.map((note, noteIndex) => <p className="chapter-flash-catalog-note chapter-flash-catalog-note--chapter" key={`${word._id}-chapter-note-${noteIndex}`}>Ghi chú: {note}</p>)}
                      </div>
                    ) : (word.exampleEnglish || word.example || word.exampleVietnamese) && (
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
          )}

          <nav className="flash-nav" aria-label="Điều hướng chapter flashcard">
            <button type="button" disabled={index === 0} onClick={() => moveCard(-1)} aria-label={card.word ? 'Từ trước' : 'Chapter trước'}>← {card.word ? 'Từ trước' : 'Trước'}</button>
              <span>{card.word ? `${index + 1} / ${visibleCards.length}` : `${card.chapterTitle} · ${visibleWords.length} từ vựng`}</span>
            <button type="button" disabled={index >= visibleCards.length - 1} onClick={() => moveCard(1)} aria-label={card.word ? 'Từ tiếp theo' : 'Chapter tiếp theo'}>{card.word ? 'Từ tiếp theo' : 'Tiếp theo'} →</button>
          </nav>
        </>
      )}
    </div>
  );
}
