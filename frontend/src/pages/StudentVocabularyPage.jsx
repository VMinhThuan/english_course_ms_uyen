import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { vocabularyApi } from '../api/vocabularyApi.js';
import './Vocabulary.css';

const PAGE_SIZE = 48;

export default function StudentVocabularyPage() {
  const [params, setParams] = useSearchParams();
  const [words, setWords] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('word_asc');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
  const [showBackToTop, setShowBackToTop] = useState(false);
  const requestId = useRef(0);
  const topic = params.get('topic') || '';

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const response = await vocabularyApi.getStudentVocabulary({
        ...(topic ? { topic } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        page,
        limit: PAGE_SIZE,
        sort,
      });
      if (currentRequest !== requestId.current) return;
      setWords(response.data?.vocabulary || []);
      setTopics(response.data?.topics || []);
      setPagination(response.data?.pagination || { page, limit: PAGE_SIZE, total: 0, pages: 1 });
    } catch (requestError) {
      if (currentRequest !== requestId.current) return;
      setWords([]);
      setError(requestError.response?.data?.message || 'Không thể tải danh sách từ vựng. Vui lòng thử lại.');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [page, search, sort, topic]);

  useEffect(() => {
    const timer = window.setTimeout(load, search.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    const updateVisibility = () => setShowBackToTop(window.scrollY > 500);
    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    return () => window.removeEventListener('scroll', updateVisibility);
  }, []);

  const chooseTopic = (nextTopic) => {
    setPage(1);
    setParams(nextTopic ? { topic: nextTopic } : {});
  };

  const changeSearch = (value) => {
    setPage(1);
    setSearch(value);
  };

  const changeSort = (value) => {
    setPage(1);
    setSort(value);
  };

  const scrollToTop = () => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo(0, 0);
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="vocab-page">
      <header className="vocab-header">
        <div>
          <p>VOCABULARY</p>
          <h1>Từ vựng theo bài học</h1>
          <span>Tra cứu nghĩa và ví dụ, sau đó học bằng flashcard.</span>
        </div>
        {pagination.total > 0 && (
          <Link className="vocab-primary" to={`/student/flashcards${topic ? `?topic=${encodeURIComponent(topic)}` : ''}`}>
            Học bằng Flashcard →
          </Link>
        )}
      </header>

      <nav className="topic-tabs" aria-label="Lọc từ vựng theo chủ đề">
        <button type="button" className={!topic ? 'active' : ''} aria-pressed={!topic} onClick={() => chooseTopic('')}>
          Tất cả
        </button>
        {topics.map((item) => (
          <button key={item} type="button" className={item === topic ? 'active' : ''} aria-pressed={item === topic} onClick={() => chooseTopic(item)}>
            {item}
          </button>
        ))}
      </nav>

      <section className="vocab-toolbar" aria-label="Tìm và sắp xếp từ vựng">
        <label className="vocab-search">
          <span>Tìm từ tiếng Anh hoặc nghĩa tiếng Việt</span>
          <input
            type="search"
            value={search}
            onChange={(event) => changeSearch(event.target.value)}
            placeholder="Ví dụ: appointment hoặc cuộc hẹn"
            maxLength={80}
          />
        </label>
        {search && (
          <button className="vocab-clear-search" type="button" onClick={() => changeSearch('')}>
            Xóa tìm kiếm
          </button>
        )}
        <label className="vocab-sort">
          <span>Sắp xếp</span>
          <select value={sort} onChange={(event) => changeSort(event.target.value)}>
            <option value="word_asc">Từ A–Z</option>
            <option value="word_desc">Từ Z–A</option>
          </select>
        </label>
      </section>

      {error && <div className="vocab-error" role="alert">{error}<button type="button" onClick={load}>Thử lại</button></div>}
      {loading ? (
        <div className="vocab-state" role="status">Đang tải từ vựng...</div>
      ) : words.length ? (
        <>
          <div className="vocab-result-summary" aria-live="polite">
            {search.trim() ? `Tìm thấy ${pagination.total} từ phù hợp` : `${pagination.total} từ vựng`}
          </div>
          <section className="vocab-list" aria-label="Danh sách từ vựng">
            {words.map((word, index) => (
              <article key={word._id} className="vocab-entry">
                <span className="vocab-number">{(page - 1) * PAGE_SIZE + index + 1}</span>
                <div className="vocab-entry__content">
                  <h2>{word.word} {word.partOfSpeech && <em>({word.partOfSpeech})</em>}</h2>
                  {word.pronunciation && <span className="vocab-pronunciation">{word.pronunciation}</span>}
                  <h3>{word.meaning}</h3>
                  {(word.exampleEnglish || word.example) && <p className="vocab-en">{word.exampleEnglish || word.example}</p>}
                  {word.exampleVietnamese && <p className="vocab-vi">{word.exampleVietnamese}</p>}
                </div>
              </article>
            ))}
          </section>
          {pagination.pages > 1 && (
            <nav className="vocab-pagination" aria-label="Phân trang từ vựng">
              <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Trang trước</button>
              <span>Trang {page} / {pagination.pages}</span>
              <button type="button" disabled={page >= pagination.pages || loading} onClick={() => setPage((current) => Math.min(pagination.pages, current + 1))}>Trang sau →</button>
            </nav>
          )}
        </>
      ) : (
        <div className="vocab-state" role="status">
          {search.trim() ? 'Không tìm thấy từ vựng phù hợp.' : topic ? 'Chưa có từ vựng trong chủ đề này.' : 'Chưa có từ vựng.'}
        </div>
      )}

      {showBackToTop && (
        <button type="button" className="vocab-back-to-top" onClick={scrollToTop} aria-label="Cuộn về đầu trang">
          ↑ <span>Về đầu trang</span>
        </button>
      )}
    </div>
  );
}
