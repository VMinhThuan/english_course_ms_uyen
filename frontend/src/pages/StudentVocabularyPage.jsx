import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TOEIC_VOCABULARY_BOOKS } from '../constants/toeicVocabularyBooks.js';
import { loadToeicVocabularyBooks } from '../utils/loadToeicVocabularyChapters.js';
import './Vocabulary.css';

const normalizeText = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .toLocaleLowerCase('vi');

export default function StudentVocabularyPage() {
  const [params, setParams] = useSearchParams();
  const [books, setBooks] = useState(() => TOEIC_VOCABULARY_BOOKS.map((book) => ({ ...book, course: null, chapters: [] })));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);
  const requestedBookKey = params.get('book') || TOEIC_VOCABULARY_BOOKS[0].key;
  const selectedBookKey = TOEIC_VOCABULARY_BOOKS.some((book) => book.key === requestedBookKey)
    ? requestedBookKey
    : TOEIC_VOCABULARY_BOOKS[0].key;
  const selectedBook = books.find((book) => book.key === selectedBookKey) || books[0];

  useEffect(() => {
    let live = true;
    const currentRequest = ++requestId.current;

    async function loadBooks() {
      setLoading(true);
      setError('');
      try {
        const loadedBooks = await loadToeicVocabularyBooks(TOEIC_VOCABULARY_BOOKS);

        if (live && currentRequest === requestId.current) setBooks(loadedBooks);
      } catch (loadError) {
        if (live && currentRequest === requestId.current) {
          setError(loadError.response?.data?.message || 'Không thể tải các bộ từ vựng. Vui lòng thử lại.');
        }
      } finally {
        if (live && currentRequest === requestId.current) setLoading(false);
      }
    }

    loadBooks();
    return () => { live = false; };
  }, [reloadKey]);

  const visibleChapters = useMemo(() => {
    const chapters = selectedBook?.chapters || [];
    const query = normalizeText(search.trim());
    if (!query) return chapters;

    return chapters.filter((chapter) => {
      const chapterText = normalizeText(`${chapter.chapterTitle} ${chapter.chapterSubtitle}`);
      return chapterText.includes(query) || chapter.words.some((word) =>
        normalizeText(`${word.word} ${word.meaning} ${word.partOfSpeech} ${word.pronunciation}`).includes(query),
      );
    });
  }, [search, selectedBook]);

  const totalWords = selectedBook?.chapters.reduce((count, chapter) => count + chapter.words.length, 0) || 0;
  const visibleWordCount = visibleChapters.reduce((count, chapter) => count + chapter.words.length, 0);

  const chooseBook = (book) => {
    setSearch('');
    setParams({ book: book.key });
  };

  const getFlashcardUrl = (chapter = null) => {
    const flashcardParams = new URLSearchParams({
      book: selectedBook.key,
      topic: selectedBook.topic,
    });
    if (chapter?._id) flashcardParams.set('startLessonId', String(chapter._id));
    return `/student/flashcards?${flashcardParams.toString()}`;
  };

  return (
    <div className="vocab-page vocab-books-page">
      <header className="vocab-header">
        <div>
          <p>VOCABULARY</p>
          <h1>Từ vựng theo chapter</h1>
          <span>Chọn một chapter để lật thẻ và xem toàn bộ từ vựng trong đó.</span>
        </div>
        {selectedBook?.chapters.length > 0 && (
          <Link className="vocab-primary" to={getFlashcardUrl()}>
            Học bằng Flashcard →
          </Link>
        )}
      </header>

      <nav className="topic-tabs vocab-book-tabs" aria-label="Chọn bộ từ vựng TOEIC">
        {books.map((book) => (
          <button
            key={book.key}
            type="button"
            className={book.key === selectedBookKey ? 'active' : ''}
            aria-pressed={book.key === selectedBookKey}
            onClick={() => chooseBook(book)}
          >
            {book.title}
          </button>
        ))}
      </nav>

      <section className="vocab-toolbar vocab-chapter-toolbar" aria-label="Tìm chapter hoặc từ vựng">
        <label className="vocab-search">
          <span>Tìm chapter hoặc từ vựng</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ví dụ: Chapter 1 hoặc appointment"
            maxLength={80}
          />
        </label>
        {search && (
          <button className="vocab-clear-search" type="button" onClick={() => setSearch('')}>
            Xóa tìm kiếm
          </button>
        )}
      </section>

      {error && <div className="vocab-error" role="alert">{error}<button type="button" onClick={() => setReloadKey((current) => current + 1)}>Thử lại</button></div>}
      {loading ? (
        <div className="vocab-state" role="status">Đang tải các chapter từ vựng...</div>
      ) : selectedBook?.chapters.length ? (
          <>
            <div className="vocab-result-summary" aria-live="polite">
              {visibleChapters.length} chapter · {search.trim() ? visibleWordCount : totalWords} từ vựng
            </div>
            {visibleChapters.length ? (
              <section className="chapter-grid" aria-label={`Chapter trong ${selectedBook.title}`}>
                {visibleChapters.map((chapter) => (
                  <Link
                    key={chapter._id}
                    className="chapter-card"
                    to={getFlashcardUrl(chapter)}
                    aria-label={`Mở flashcard ${chapter.chapterTitle}, gồm ${chapter.words.length} từ`}
                  >
                    <span className="chapter-card__eyebrow">{chapter.chapterTitle}</span>
                    <h2>{chapter.chapterTitle}</h2>
                    {chapter.chapterSubtitle && <p className="chapter-card__subtitle">{chapter.chapterSubtitle}</p>}
                    <span className="chapter-card__count">{chapter.words.length} từ vựng</span>
                    <span className="chapter-card__hint">Mở flashcard →</span>
                  </Link>
                ))}
              </section>
            ) : (
              <div className="vocab-state" role="status">Không tìm thấy chapter hoặc từ vựng phù hợp.</div>
            )}
          </>
      ) : (
        <div className="vocab-state" role="status">
          Bộ từ vựng này chưa có chapter chứa từ vựng.
        </div>
      )}
    </div>
  );
}
