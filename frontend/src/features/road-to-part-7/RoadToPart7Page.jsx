import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { roadToPart7Api } from '../../api/roadToPart7Api.js';
import './RoadToPart7Page.css';

export default function RoadToPart7Page({ admin = false }) {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [side, setSide] = useState('front');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const selected = items.find((item) => (item._id || item.sourceKey) === selectedId) || filteredItems[0] || null;

  const choose = (item) => {
    setSelectedId(item._id || item.sourceKey);
    setSide('front');
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
                  const itemId = item._id || item.sourceKey;
                  return <button
                    type="button"
                    key={itemId}
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

            {selected && <section className="road7-reader" aria-labelledby="road7-reader-title">
              <header className="road7-reader__header">
                <div><p className="part1-playlist__eyebrow">BÀI {String(selected.order || 1).padStart(2, '0')} · {side === 'front' ? 'MẶT TRƯỚC' : 'MẶT SAU'}</p><h2 id="road7-reader-title">{selected.title}</h2></div>
                <div className="road7-face-switch" role="group" aria-label="Mặt flashcard">
                  <button type="button" aria-pressed={side === 'front'} onClick={() => setSide('front')}>Tiếng Anh</button>
                  <button type="button" aria-pressed={side === 'back'} onClick={() => setSide('back')}>Song ngữ</button>
                </div>
              </header>
              <div className="road7-reader__meta"><span>{side === 'front' ? 'Bài đọc tiếng Anh' : 'English · Tiếng Việt'}</span><span>{side === 'front' ? '1 đoạn đọc' : `${(selected.bilingualPairs || []).length} câu`}</span></div>
              <div className={`road7-reading-content${side === 'back' ? ' is-bilingual' : ''}`} tabIndex="0" role="region" aria-label={`${selected.title}, ${side === 'front' ? 'bài đọc tiếng Anh' : 'bản dịch song ngữ'}`}>
                {side === 'front'
                  ? <p className="road7-english-article">{selected.englishText}</p>
                  : <div className="road7-bilingual-pairs">{(selected.bilingualPairs || []).map((pair, index) => <p key={`${pair.order || index}-${index}`}><strong>{pair.english}</strong> <span>({pair.vietnamese})</span></p>)}</div>}
              </div>
              <footer className="road7-reader__footer"><span>{side === 'front' ? 'Mặt trước · Toàn bộ bài đọc' : 'Mặt sau · Bản dịch theo từng câu'}</span><button type="button" className="ds-button ds-button--primary" onClick={() => setSide((current) => current === 'front' ? 'back' : 'front')}>{side === 'front' ? 'Xem mặt song ngữ' : 'Quay lại tiếng Anh'}</button></footer>
            </section>}
          </div>}
  </main>;
}
