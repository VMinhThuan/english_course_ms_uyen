import { Link, useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { vocabularyApi } from '../api/vocabularyApi.js';
import './Vocabulary.css';

const BOOKMARK_STORAGE_KEY = 'toeic-flashcard-bookmarks';
const PAGE_SIZE = 100;
const wordKey = (word) => String(word?._id || word?.id || word?.word || '');

export default function FlashcardPage() {
  const [params] = useSearchParams();
  const topic = params.get('topic') || '';
  const [words, setWords] = useState([]);
  const [reviewWords, setReviewWords] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [bookmarked, setBookmarked] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(BOOKMARK_STORAGE_KEY) || '[]')); } catch { return new Set(); }
  });

  const fetchPage = useCallback(async (pageNumber) => {
    const response = await vocabularyApi.getStudentVocabulary({
      ...(topic ? { topic } : {}),
      page: pageNumber,
      limit: PAGE_SIZE,
      sort: 'word_asc',
    });
    return response.data;
  }, [topic]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    setPage(1);
    setIndex(0);
    setFlipped(false);
    fetchPage(1)
      .then((data) => {
        if (!live) return;
        setError('');
        setWords(data?.vocabulary || []);
        setHasMore((data?.pagination?.pages || 1) > 1);
      })
      .catch(() => { if (live) setError('Không thể tải flashcard.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [fetchPage]);

  useEffect(() => {
    localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify([...bookmarked]));
  }, [bookmarked]);

  useEffect(() => {
    let live = true;
    if (!reviewOnly) {
      setReviewWords([]);
      return () => { live = false; };
    }

    const ids = [...bookmarked].filter((id) => /^[a-f\d]{24}$/i.test(String(id)));
    if (!ids.length) {
      setReviewWords([]);
      setReviewLoading(false);
      return () => { live = false; };
    }

    setReviewLoading(true);
    const batches = [];
    for (let index = 0; index < ids.length; index += PAGE_SIZE) batches.push(ids.slice(index, index + PAGE_SIZE));
    Promise.all(batches.map((batch) => vocabularyApi.getStudentVocabulary({
      ...(topic ? { topic } : {}),
      ids: batch.join(','),
      page: 1,
      limit: PAGE_SIZE,
      sort: 'word_asc',
    })))
      .then((responses) => {
        if (live) {
          setError('');
          setReviewWords(responses.flatMap((response) => response.data?.vocabulary || []));
        }
      })
      .catch(() => { if (live) setError('Không thể tải danh sách từ đã đánh dấu.'); })
      .finally(() => { if (live) setReviewLoading(false); });

    return () => { live = false; };
  }, [bookmarked, reviewOnly, topic]);

  const visibleWords = useMemo(() => reviewOnly ? reviewWords : words, [reviewOnly, reviewWords, words]);
  const word = visibleWords[index];
  const markedCount = reviewOnly ? reviewWords.length : bookmarked.size;

  const changeView = (onlyBookmarked) => {
    setReviewOnly(onlyBookmarked);
    setIndex(0);
    setFlipped(false);
  };

  const loadNextPage = async () => {
    if (pageLoading || !hasMore || reviewOnly) return false;
    setPageLoading(true);
    try {
      const nextPage = page + 1;
      const data = await fetchPage(nextPage);
      const nextWords = data?.vocabulary || [];
      setWords((current) => [...current, ...nextWords]);
      setError('');
      setPage(nextPage);
      setHasMore(nextPage < (data?.pagination?.pages || nextPage));
      return nextWords.length > 0;
    } catch {
      setError('Không thể tải thêm từ vựng. Vui lòng thử lại.');
      return false;
    } finally {
      setPageLoading(false);
    }
  };

  const movePrevious = () => {
    setIndex((current) => Math.max(0, current - 1));
    setFlipped(false);
  };

  const moveNext = async () => {
    if (index < visibleWords.length - 1) {
      setIndex((current) => current + 1);
      setFlipped(false);
      return;
    }
    if (await loadNextPage()) {
      setIndex((current) => current + 1);
      setFlipped(false);
    }
  };

  const audio = (event) => {
    event.stopPropagation();
    if (word?.audioUrl) new Audio(word.audioUrl).play().catch(() => {});
  };

  const toggleBookmark = (event) => {
    event.stopPropagation();
    const key = wordKey(word);
    if (!key) return;
    setBookmarked((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (loading) return <div className="vocab-page"><div className="vocab-state" role="status">Đang tải flashcard...</div></div>;
  if (error && !words.length && !reviewWords.length) return <div className="vocab-page"><div className="vocab-error" role="alert">{error}</div><Link to="/student/vocabulary">← Quay lại từ vựng</Link></div>;
  if (!words.length && !topic && !reviewOnly) return <div className="vocab-page"><div className="vocab-state">Chưa có từ vựng.</div><Link to="/student/vocabulary">← Quay lại từ vựng</Link></div>;

  return (
    <div className="vocab-page flashcard-page">
      <Link className="vocab-back" to={`/student/vocabulary${topic ? `?topic=${encodeURIComponent(topic)}` : ''}`}>← Danh sách từ vựng</Link>
      <header className="flash-head">
        <div><p>FLASHCARD {topic && `· ${topic}`}</p><h1>{visibleWords.length ? `${index + 1} / ${visibleWords.length}${hasMore && !reviewOnly ? '+' : ''}` : '0 / 0'}</h1></div>
        <div className="flashcard-view-controls">
          <button type="button" className={!reviewOnly ? 'active' : ''} aria-pressed={!reviewOnly} onClick={() => changeView(false)}>Tất cả</button>
          <button type="button" className={reviewOnly ? 'active' : ''} aria-pressed={reviewOnly} onClick={() => changeView(true)}>★ Đã đánh dấu <span>{markedCount}</span></button>
        </div>
      </header>

      {error && <div className="vocab-error" role="alert">{error}</div>}
      {reviewOnly && reviewLoading ? <div className="vocab-state" role="status">Đang tải từ đã đánh dấu...</div> : !word ? (
        <section className="flashcard-review-empty">
          <span aria-hidden="true">☆</span>
          <h2>{reviewOnly ? 'Chưa có từ nào được đánh dấu' : 'Chưa có thêm từ vựng'}</h2>
          <p>{reviewOnly ? 'Nhấn dấu sao trên flashcard để lưu từ cần xem lại.' : 'Danh sách từ vựng của chủ đề này hiện đã hết.'}</p>
          {reviewOnly && <button type="button" onClick={() => changeView(false)}>Xem tất cả từ</button>}
        </section>
      ) : (
        <>
          <div
            role="button"
            tabIndex="0"
            className={`flashcard ${flipped ? 'flipped' : ''}`}
            onClick={() => setFlipped((value) => !value)}
            onKeyDown={(event) => {
              if (event.currentTarget === event.target && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                setFlipped((value) => !value);
              }
            }}
            aria-label="Lật flashcard"
          >
            <button type="button" className={`flashcard-bookmark ${bookmarked.has(wordKey(word)) ? 'is-marked' : ''}`} onClick={toggleBookmark} aria-pressed={bookmarked.has(wordKey(word))} aria-label={bookmarked.has(wordKey(word)) ? 'Bỏ đánh dấu từ này' : 'Đánh dấu từ để xem lại'}>
              {bookmarked.has(wordKey(word)) ? '★' : '☆'}<span>{bookmarked.has(wordKey(word)) ? 'Đã đánh dấu' : 'Đánh dấu xem lại'}</span>
            </button>
            <span className="flash-front">
              <strong>{word.word}</strong>{word.partOfSpeech && <em>({word.partOfSpeech})</em>}{word.pronunciation && <small>{word.pronunciation}</small>}
              {word.audioUrl && <button type="button" onClick={audio} aria-label="Nghe phát âm">🔊</button>}
              <i>Nhấn để xem nghĩa</i>
            </span>
            <span className="flash-back">
              <strong>{word.word} {word.partOfSpeech && <em>({word.partOfSpeech})</em>}</strong><h2>{word.meaning}</h2>
              {(word.exampleEnglish || word.example) && <p><b>EN:</b> {word.exampleEnglish || word.example}</p>}
              {word.exampleVietnamese && <p><b>VI:</b> {word.exampleVietnamese}</p>}
            </span>
          </div>
          <nav className="flash-nav" aria-label="Điều hướng flashcard">
            <button type="button" disabled={index === 0 || pageLoading} onClick={movePrevious} aria-label="Từ vựng trước">← Trước</button>
            <span>{pageLoading ? 'Đang tải thêm từ...' : reviewOnly ? 'Đang xem từ đã đánh dấu' : 'Nhấn ★ để xem lại sau'}</span>
            <button type="button" disabled={(!reviewOnly && !hasMore && index >= visibleWords.length - 1) || (reviewOnly && index >= visibleWords.length - 1) || pageLoading} onClick={moveNext} aria-label="Từ vựng tiếp theo">Tiếp theo →</button>
          </nav>
        </>
      )}
    </div>
  );
}
