import { useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { roadToPart7Api } from '../../api/roadToPart7Api.js';
import '../../pages/Vocabulary.css';
import './RoadToPart7Page.css';

const readingId = (item) => item?._id || item?.sourceKey || '';

export default function RoadToPart7Page({ admin = false }) {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [side, setSide] = useState('front');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const selectedOptionRef = useRef(null);

  useEffect(() => {
    let isCurrent = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = admin
          ? await roadToPart7Api.getAdminReadings()
          : await roadToPart7Api.getStudentReadings();
        if (!isCurrent) return;
        const readings = response.data.items || [];
        setItems(readings);
        setSelectedId(readings[0]?._id || readings[0]?.sourceKey || '');
      } catch (requestError) {
        if (isCurrent) setError(requestError.response?.data?.message || 'Không thể tải danh sách bài đọc.');
      } finally {
        if (isCurrent) setLoading(false);
      }
    };
    load();
    return () => { isCurrent = false; };
  }, [admin]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi');
    if (!normalizedQuery) return items;
    return items.filter((item) => `${item.title} ${item.englishText}`.toLocaleLowerCase('vi').includes(normalizedQuery));
  }, [items, query]);

  const selected = filteredItems.find((item) => readingId(item) === selectedId) || filteredItems[0] || null;
  const selectedIndex = selected ? filteredItems.findIndex((item) => readingId(item) === readingId(selected)) : -1;

  useEffect(() => {
    selectedOptionRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedId, query]);

  const choose = (item) => {
    setSelectedId(readingId(item));
    setSide('front');
  };

  const flip = () => setSide((current) => current === 'front' ? 'back' : 'front');
  const moveReading = (direction) => {
    const next = filteredItems[selectedIndex + direction];
    if (next) choose(next);
  };

  return <main className="road7-page">
    <PageHeader
      eyebrow="READING · TOEIC PART 7"
      title="Road to Part 7"
      description={admin
        ? 'Thư viện 26 bài đọc song ngữ. Chọn bài để xem mặt tiếng Anh hoặc bản dịch từng câu.'
        : 'Chọn một bài đọc, đọc toàn văn tiếng Anh rồi lật sang bản dịch song ngữ theo từng câu.'}
    />

    {loading ? <div className="ds-loading-state">Đang tải 26 bài đọc…</div>
      : error ? <div className="ds-error-state" role="alert"><strong>{error}</strong></div>
        : items.length === 0 ? <div className="part1-empty"><strong>Chưa có bài đọc nào.</strong><p>Quản trị viên có thể nhập bộ dữ liệu Road to Part 7 từ trang chép chính tả từ vựng.</p></div>
          : <div className="road7-workspace">
            <aside className="road7-library" aria-label="Danh sách bài đọc">
              <div className="road7-library__heading">
                <div><p className="part1-playlist__eyebrow">THƯ VIỆN BÀI ĐỌC</p><h2>{filteredItems.length} / {items.length} bài</h2></div>
              </div>
              <label className="road7-search">Tìm bài đọc
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập từ khóa tiếng Anh…" />
              </label>
              <nav className="road7-reading-list" aria-label="Chọn bài đọc">
                {filteredItems.map((item, index) => {
                  const itemId = readingId(item);
                  return <button
                    type="button"
                    key={itemId}
                    ref={selected && itemId === (selected._id || selected.sourceKey) ? selectedOptionRef : null}
                    className={`road7-reading-option${selected && itemId === (selected._id || selected.sourceKey) ? ' is-active' : ''}`}
                    aria-current={selected && itemId === (selected._id || selected.sourceKey) ? 'true' : undefined}
                    onClick={() => choose(item)}
                  >
                    <span>{String(item.order || index + 1).padStart(2, '0')}</span>
                    <strong>{item.title || `Bài đọc ${String(index + 1).padStart(2, '0')}`}</strong>
                    <small>{(item.bilingualPairs || []).length} câu song ngữ</small>
                  </button>;
                })}
                {filteredItems.length === 0 && <p className="road7-no-results">Không tìm thấy bài đọc phù hợp.</p>}
              </nav>
            </aside>

            {selected && <section className="road7-reader" aria-label={`${selected.title}, flashcard Road to Part 7`}>
              <div
                className={`flashcard chapter-flashcard road7-flashcard${side === 'back' ? ' flipped' : ''}`}
                role="button"
                tabIndex="0"
                aria-label={`Lật flashcard ${selected.title}, mặt ${side === 'front' ? 'tiếng Anh' : 'song ngữ'}`}
                aria-pressed={side === 'back'}
                onClick={(event) => { if (!event.target.closest('.road7-flash-scroll')) flip(); }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); flip(); }
                  else if (event.key === 'ArrowLeft') { event.preventDefault(); moveReading(-1); }
                  else if (event.key === 'ArrowRight') { event.preventDefault(); moveReading(1); }
                  else if (['ArrowDown', 'PageDown', 'ArrowUp', 'PageUp'].includes(event.key)) {
                    event.preventDefault();
                    const scrollArea = event.currentTarget.querySelector(side === 'front' ? '.road7-flash-english' : '.road7-flash-pairs');
                    if (!scrollArea) return;
                    const direction = event.key === 'ArrowDown' || event.key === 'PageDown' ? 1 : -1;
                    const step = event.key.startsWith('Page') ? scrollArea.clientHeight * 0.8 : 80;
                    scrollArea.scrollBy({ top: direction * step, behavior: 'auto' });
                  }
                }}
              >
                <div className="flash-front chapter-flash-front road7-flash-front">
                  <span className="chapter-flash-kicker">ROAD TO PART 7 · BÀI {String(selected.order || 1).padStart(2, '0')}</span>
                  <h2>{selected.title}</h2>
                  <span className="chapter-flash-word-count">Mặt trước · Bài đọc tiếng Anh</span>
                  <div className="road7-flash-scroll road7-flash-english" role="region" tabIndex="0" aria-label={`${selected.title}, bài đọc tiếng Anh`}>
                    <p className="road7-flash-english__content">{selected.englishText}</p>
                  </div>
                  <i>Cuộn trong khung để đọc hết bài · Nhấn để xem bản dịch song ngữ</i>
                </div>
                <div className="flash-back chapter-flash-back road7-flash-back">
                  <header className="chapter-flash-back-head">
                    <div>
                      <span>ROAD TO PART 7 · BẢN DỊCH SONG NGỮ</span>
                      <h2>{selected.title}</h2>
                    </div>
                    <strong>{(selected.bilingualPairs || []).length} câu</strong>
                  </header>
                  <div className="road7-flash-scroll road7-flash-pairs" role="region" tabIndex="0" aria-label={`${selected.title}, bản dịch song ngữ`}>
                    {(selected.bilingualPairs || []).map((pair, index) => (
                      <p key={`${pair.order || index}-${index}`}><strong>{pair.english}</strong> <span>({pair.vietnamese})</span></p>
                    ))}
                  </div>
                  <span className="chapter-flash-back-hint">Nhấn để quay lại mặt tiếng Anh</span>
                </div>
              </div>
              <nav className="flash-nav road7-flash-nav" aria-label="Điều hướng bài đọc">
                <button type="button" disabled={selectedIndex <= 0} onClick={() => moveReading(-1)}>← Bài trước</button>
                <span>{selectedIndex + 1} / {filteredItems.length}</span>
                <button type="button" className="road7-flip-button" onClick={flip}>{side === 'front' ? 'Xem mặt song ngữ' : 'Mặt tiếng Anh'}</button>
                <button type="button" disabled={selectedIndex < 0 || selectedIndex >= filteredItems.length - 1} onClick={() => moveReading(1)}>Bài tiếp theo →</button>
              </nav>
            </section>}
          </div>}
  </main>;
}
