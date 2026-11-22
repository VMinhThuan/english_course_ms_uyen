import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import useAuthStore from '../../store/authStore.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { adminApi } from '../../api/adminApi.js';
import './AdminGamificationPage.css';

const levels = [1, 2, 3, 4];

export default function AdminGamificationVocabularyPage() {
  const role = useAuthStore((state) => state.user?.role);
  const canEdit = role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ unclassified: 0, 1: 0, 2: 0, 3: 0, 4: 0 });
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [level, setLevel] = useState(searchParams.get('level') || '');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const response = await adminApi.getGamificationVocabulary({ page, limit: 50, ...(search ? { search } : {}), ...(level ? { level } : {}) });
      setItems(response.data?.vocabulary || []); setCounts(response.data?.counts || counts); setPagination(response.data?.pagination || pagination);
    } catch (loadError) { setError(loadError.response?.data?.message || 'Không thể tải vocabulary mini game.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [page, level]);
  useEffect(() => { const timer = setTimeout(() => { setPage(1); load(); }, 300); return () => clearTimeout(timer); }, [search]);

  const update = async (item, nextLevel, nextStage) => {
    if (!canEdit) return;
    if (!window.confirm(`Xác nhận phân loại “${item.word}” vào ${nextLevel ? `TOEIC Level ${nextLevel}` : 'chưa phân loại'}${nextStage ? ` · Chặng ${nextStage}` : ''}?`)) return;
    setSavingId(item._id); setError(''); setMessage('');
    try { await adminApi.updateGamificationVocabulary(item._id, { toeicLevel: nextLevel || null, stage: nextStage || null }); setMessage('Đã cập nhật phân loại vocabulary.'); await load(); }
    catch (saveError) { setError(saveError.response?.data?.message || 'Không thể cập nhật vocabulary.'); }
    finally { setSavingId(''); }
  };

  return <div className="admin-page-container admin-gamification-page">
    <Link className="admin-gamification-back" to="/admin/gamification">← Quản lý Mini Game</Link>
    <PageHeader eyebrow="Vocabulary assignment" title="Vocabulary cho Mini Game" description="Phân loại rõ bốn TOEIC level và gán vocabulary đã publish vào các chặng Quest. Không dùng thứ tự insert database để suy luận level." />
    {!canEdit && <div className="admin-gamification-readonly-notice">Bạn đang ở chế độ chỉ xem. Chỉ tài khoản admin mới được thay đổi phân loại và stage.</div>}
    <div className="admin-gamification-level-counts">{levels.map((item) => <Link to={`/admin/gamification/vocabulary?level=${item}`} key={item}><span>TOEIC Level {item}</span><strong>{counts[item] || 0}</strong><small>vocabulary đã publish</small></Link>)}<Link to="/admin/gamification/vocabulary?level=unclassified"><span>Chưa phân loại</span><strong>{counts.unclassified || 0}</strong><small>Cần admin review</small></Link></div>
    <section className="admin-panel admin-gamification-vocab-panel">
      <div className="admin-gamification-toolbar"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm word hoặc meaning..." aria-label="Tìm vocabulary" /><select value={level} onChange={(event) => { setLevel(event.target.value); setPage(1); setSearchParams(event.target.value ? { level: event.target.value } : {}); }} aria-label="Lọc TOEIC level"><option value="">Tất cả level</option><option value="unclassified">Chưa phân loại</option>{levels.map((item) => <option value={item} key={item}>TOEIC Level {item}</option>)}</select></div>
      {error && <div className="admin-error" role="alert">{error}</div>}{message && <div className="admin-gamification-success" role="status">{message}</div>}
      {loading ? <div className="ds-loading-state">Đang tải danh sách vocabulary...</div> : <div className="admin-gamification-table-wrap"><table className="admin-gamification-table"><thead><tr><th>Word</th><th>Meaning</th><th>TOEIC level</th><th>Quest stage</th><th>Trạng thái</th></tr></thead><tbody>{items.map((item) => <tr key={item._id}><td><strong>{item.word}</strong><small>{item.topic || 'General'}</small></td><td>{item.meaning}</td><td><select value={item.toeicLevel || ''} disabled={!canEdit || savingId === item._id} onChange={(event) => update(item, event.target.value, item.stage || '')} aria-label={`TOEIC level cho ${item.word}`}><option value="">Chưa phân loại</option>{levels.map((itemLevel) => <option value={itemLevel} key={itemLevel}>Level {itemLevel}</option>)}</select></td><td><select value={item.stage || ''} disabled={!canEdit || savingId === item._id || !item.toeicLevel} onChange={(event) => update(item, item.toeicLevel, event.target.value)} aria-label={`Quest stage cho ${item.word}`}><option value="">Không gán</option>{levels.map((stage) => <option value={stage} key={stage}>Chặng {stage}</option>)}</select></td><td><span className={`admin-gamification-vocab-status ${item.catalogOnly ? 'is-catalog' : ''}`}>{item.catalogOnly ? 'Catalog published' : 'Published'}</span></td></tr>)}</tbody></table>{!items.length && <div className="admin-empty">Không có vocabulary phù hợp.</div>}</div>}
      <div className="admin-gamification-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Trước</button><span>Trang {page} / {pagination.pages || 1} · {pagination.total || 0} từ</span><button type="button" disabled={page >= (pagination.pages || 1)} onClick={() => setPage((value) => value + 1)}>Sau →</button></div>
    </section>
  </div>;
}
