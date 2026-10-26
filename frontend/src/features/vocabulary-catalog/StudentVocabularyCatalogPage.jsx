import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { studentVocabularyCatalogApi as api } from './studentApi.js';
import './studentCatalog.css';

const CHAPTER_PAGE_SIZE = 12;

async function loadAllTags() {
  const first = await api.listTags({ page: 1, limit: 100 });
  const tags = [...(first.items || [])];
  for (let page = 2; page <= (first.pagination?.pages || 1); page += 1) {
    const next = await api.listTags({ page, limit: 100 });
    tags.push(...(next.items || []));
  }
  return tags;
}

export default function StudentVocabularyCatalogPage() {
  const [params, setParams] = useSearchParams();
  const requestedTagId = params.get('tagId') || '';
  const [tags, setTags] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [tagLoading, setTagLoading] = useState(true);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [tagError, setTagError] = useState('');
  const [chapterError, setChapterError] = useState('');
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [retryKey, setRetryKey] = useState(0);
  const chapterRequest = useRef(0);
  const selectedTagId = requestedTagId || tags[0]?._id || '';
  const selectedTag = tags.find((tag) => tag._id === selectedTagId) || null;

  useEffect(() => {
    let live = true;
    setTagLoading(true);
    setTagError('');
    loadAllTags()
      .then((items) => { if (live) setTags(items); })
      .catch((error) => { if (live) setTagError(error.message || 'Không thể tải danh mục từ vựng.'); })
      .finally(() => { if (live) setTagLoading(false); });
    return () => { live = false; };
  }, [retryKey]);

  useEffect(() => {
    if (!requestedTagId && tags[0]?._id) {
      setParams({ tagId: tags[0]._id }, { replace: true });
    }
  }, [requestedTagId, setParams, tags]);

  useEffect(() => {
    if (!selectedTagId) return undefined;
    let live = true;
    const request = ++chapterRequest.current;
    setChapterLoading(true);
    setChapterError('');
    setChapters([]);
    api.listChapters(selectedTagId, { page: pagination.page, limit: CHAPTER_PAGE_SIZE, search })
      .then((result) => {
        if (!live || request !== chapterRequest.current) return;
        setChapters(result.items || []);
        setPagination(result.pagination || { page: 1, pages: 1, total: 0 });
      })
      .catch((error) => {
        if (!live || request !== chapterRequest.current) return;
        setChapterError(error.response?.status === 404
          ? 'Bộ từ vựng này không còn khả dụng.'
          : error.message || 'Không thể tải các chapter.');
      })
      .finally(() => { if (live && request === chapterRequest.current) setChapterLoading(false); });
    return () => { live = false; };
  }, [pagination.page, retryKey, search, selectedTagId]);

  const totalWordCount = useMemo(() => chapters.reduce((sum, chapter) => sum + chapter.vocabularyCount, 0), [chapters]);

  const chooseTag = (tag) => {
    setSearch('');
    setPagination((current) => ({ ...current, page: 1 }));
    setParams({ tagId: tag._id });
  };

  const updateSearch = (value) => {
    setSearch(value);
    setPagination((current) => ({ ...current, page: 1 }));
  };

  const flashcardUrl = (chapter) => `/student/flashcards?${new URLSearchParams({
    catalogTagId: selectedTagId,
    startChapterId: chapter._id,
  }).toString()}`;

  if (tagLoading) return <div className="vocab-page student-catalog-page"><div className="vocab-state" role="status">Đang tải danh mục từ vựng...</div></div>;

  return (
    <main className="vocab-page student-catalog-page">
      <header className="student-catalog-header">
        <div>
          <p className="student-catalog-eyebrow">VOCABULARY · DANH MỤC HỌC TẬP</p>
          <h1>Từ vựng theo chủ đề</h1>
          <p className="student-catalog-intro">Chọn một Chapter để lật thẻ và ôn trọn bộ từ vựng đã được duyệt.</p>
        </div>
        {selectedTag && <span className="student-catalog-summary">{selectedTag.chapterCount} chapter · {selectedTag.vocabularyCount} lượt từ</span>}
      </header>

      {tagError ? (
        <div className="vocab-error" role="alert">{tagError}<button type="button" onClick={() => setRetryKey((value) => value + 1)}>Thử lại</button></div>
      ) : tags.length ? (
        <nav className="student-catalog-tags" aria-label="Chọn bộ từ vựng">
          {tags.map((tag) => (
            <button
              key={tag._id}
              type="button"
              className={tag._id === selectedTagId ? 'is-selected' : ''}
              aria-pressed={tag._id === selectedTagId}
              onClick={() => chooseTag(tag)}
            >
              <span>{tag.name}</span>
              <small>{tag.chapterCount} chapter</small>
            </button>
          ))}
        </nav>
      ) : (
        <div className="vocab-state" role="status">Chưa có bộ từ vựng nào được mở cho học viên.</div>
      )}

      {chapterError && !selectedTag && (
        <div className="vocab-error" role="alert">
          {chapterError}
          <button type="button" onClick={() => setRetryKey((value) => value + 1)}>Thử lại</button>
        </div>
      )}

      {selectedTag && !tagError && (
        <>
          <section className="student-catalog-section-head">
            <div>
              <p className="student-catalog-eyebrow">{selectedTag.name}</p>
              <h2>Chọn Chapter để bắt đầu</h2>
              {selectedTag.description && <p>{selectedTag.description}</p>}
            </div>
            {pagination.total > 0 && <span aria-live="polite">{pagination.total} chapter · {totalWordCount} từ ở trang này</span>}
          </section>

          <label className="student-catalog-search">
            <span>Tìm Chapter</span>
            <input
              type="search"
              value={search}
              maxLength={80}
              placeholder="Nhập tên hoặc mô tả Chapter"
              onChange={(event) => updateSearch(event.target.value)}
            />
          </label>

          {chapterError ? (
            <div className="vocab-error" role="alert">{chapterError}<button type="button" onClick={() => setRetryKey((value) => value + 1)}>Thử lại</button></div>
          ) : chapterLoading ? (
            <div className="vocab-state" role="status">Đang tải các Chapter...</div>
          ) : chapters.length ? (
            <>
              <section className="student-catalog-chapters" aria-label={`Chapter trong ${selectedTag.name}`}>
                {chapters.map((chapter) => (
                  <Link
                    key={chapter._id}
                    className="student-catalog-chapter"
                    to={flashcardUrl(chapter)}
                    aria-label={`Mở ${chapter.title}, ${chapter.vocabularyCount} từ vựng`}
                  >
                    <span className="student-catalog-chapter-order">
                      {chapter.chapterNumber ? `CHAPTER ${chapter.chapterNumber}` : `CHAPTER · ${chapter.sortOrder + 1}`}
                    </span>
                    <h3>{chapter.title}</h3>
                    {chapter.description && <p className="student-catalog-chapter-description">{chapter.description}</p>}
                    <span className="student-catalog-chapter-meta">{chapter.tagName} <span aria-hidden="true">·</span> {chapter.vocabularyCount} từ</span>
                    <span className="student-catalog-chapter-action">Mở flashcard <span aria-hidden="true">→</span></span>
                  </Link>
                ))}
              </section>
              {pagination.pages > 1 && (
                <nav className="student-catalog-pagination" aria-label="Phân trang Chapter">
                  <button type="button" disabled={pagination.page <= 1} onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}>← Trang trước</button>
                  <span>Trang {pagination.page} / {pagination.pages}</span>
                  <button type="button" disabled={pagination.page >= pagination.pages} onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}>Trang sau →</button>
                </nav>
              )}
            </>
          ) : (
            <div className="vocab-state" role="status">{search ? 'Không tìm thấy Chapter phù hợp.' : 'Bộ từ vựng này chưa có Chapter được mở.'}</div>
          )}
        </>
      )}
    </main>
  );
}
