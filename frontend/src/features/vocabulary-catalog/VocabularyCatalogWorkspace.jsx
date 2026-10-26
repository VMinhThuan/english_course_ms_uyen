import { useCallback, useEffect, useRef, useState } from 'react';
import { vocabularyImportApi } from '../vocabulary-import/api.js';
import VocabularyImportWorkspace from '../vocabulary-import/VocabularyImportWorkspace.jsx';
import { vocabularyCatalogApi, VocabularyCatalogApiError } from './api.js';
import {
  CATALOG_PAGE_SIZE, formatDate, mapCounts, MEMBERSHIP_PAGE_SIZE, moveId, safeSlug, STATUS_LABELS,
} from './model.js';
import './VocabularyCatalogWorkspace.css';

const blankTag = () => ({ name: '', slug: '', description: '', sortOrder: 0 });
const blankChapter = (tagId = '') => ({ title: '', description: '', chapterNumber: '', sortOrder: 0, tagId });
const idOf = (item) => String(item?._id || '');
const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const errorText = (error, fallback) => error instanceof VocabularyCatalogApiError ? error.message : error?.message || fallback;

function Status({ value }) {
  const tone = value === 'draft' || value === 'NOT_MAPPED' || value === 'NOT_CONFIRMED' ? 'draft'
    : value === 'archived' || value === 'FAILED' ? 'muted'
      : value === 'LOCKED' || value === 'CONFIRMED' || value === 'CONFIRMED_DRAFT' ? 'good' : 'review';
  return <span className={`vcm-status vcm-status--${tone}`}>{STATUS_LABELS[value] || value || '—'}</span>;
}

function Dialog({ open, title, labelledBy, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
    return undefined;
  }, [open]);
  return (
    <dialog ref={ref} className={`vcm-dialog${wide ? ' vcm-dialog--wide' : ''}`} aria-labelledby={labelledBy}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClose={() => { if (open) onClose(); }}>
      <div className="vcm-dialog__head"><div><span className="vcm-kicker">Vocabulary catalog · Admin</span><h2 id={labelledBy}>{title}</h2></div>
        <button className="vcm-icon-button" type="button" aria-label="Đóng hộp thoại" onClick={onClose}>×</button></div>
      {children}
    </dialog>
  );
}

function Field({ label, hint, error, children }) {
  return <label className={`vcm-field${error ? ' has-error' : ''}`}><span>{label}{hint && <small>{hint}</small>}</span>{children}{error && <em role="alert">{error}</em>}</label>;
}

function Pager({ pagination, onPage }) {
  if (!pagination || pagination.pages <= 1) return null;
  return <nav className="vcm-pager" aria-label="Phân trang">
    <button type="button" className="vcm-button vcm-button--quiet" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>Trang trước</button>
    <span>Trang {pagination.page} / {pagination.pages} · {pagination.total} mục</span>
    <button type="button" className="vcm-button vcm-button--quiet" disabled={pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)}>Trang sau</button>
  </nav>;
}

export default function VocabularyCatalogWorkspace({ api = vocabularyCatalogApi, importApi = vocabularyImportApi }) {
  const [view, setView] = useState('tags');
  const [reviewBatchId, setReviewBatchId] = useState('');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [tagItems, setTagItems] = useState([]);
  const [tagPagination, setTagPagination] = useState({ page: 1, limit: CATALOG_PAGE_SIZE, total: 0, pages: 1 });
  const [tagSearch, setTagSearch] = useState('');
  const [tagStatus, setTagStatus] = useState('');
  const [tagPage, setTagPage] = useState(1);
  const [tagBusy, setTagBusy] = useState(false);
  const [tagError, setTagError] = useState('');
  const [chapterItems, setChapterItems] = useState([]);
  const [chapterPagination, setChapterPagination] = useState({ page: 1, limit: CATALOG_PAGE_SIZE, total: 0, pages: 1 });
  const [chapterSearch, setChapterSearch] = useState('');
  const [chapterStatus, setChapterStatus] = useState('');
  const [chapterPage, setChapterPage] = useState(1);
  const [chapterBusy, setChapterBusy] = useState(false);
  const [chapterError, setChapterError] = useState('');
  const [membershipItems, setMembershipItems] = useState([]);
  const [membershipPagination, setMembershipPagination] = useState({ page: 1, limit: MEMBERSHIP_PAGE_SIZE, total: 0, pages: 1 });
  const [membershipSearch, setMembershipSearch] = useState('');
  const [membershipPage, setMembershipPage] = useState(1);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [membershipError, setMembershipError] = useState('');
  const [tagDialog, setTagDialog] = useState(null);
  const [tagForm, setTagForm] = useState(blankTag());
  const [tagFormOriginal, setTagFormOriginal] = useState(blankTag());
  const [tagSaving, setTagSaving] = useState(false);
  const [chapterDialog, setChapterDialog] = useState(null);
  const [chapterTarget, setChapterTarget] = useState(null);
  const [chapterForm, setChapterForm] = useState(blankChapter());
  const [chapterFormOriginal, setChapterFormOriginal] = useState(blankChapter());
  const [chapterSaving, setChapterSaving] = useState(false);
  const [addingMembership, setAddingMembership] = useState(false);
  const [vocabularyOptions, setVocabularyOptions] = useState([]);
  const [vocabularySearch, setVocabularySearch] = useState('');
  const [selectedVocabularyId, setSelectedVocabularyId] = useState('');
  const [membershipSaving, setMembershipSaving] = useState(false);
  const [batches, setBatches] = useState([]);
  const [batchPagination, setBatchPagination] = useState({ page: 1, limit: CATALOG_PAGE_SIZE, total: 0, pages: 1 });
  const [batchSearch, setBatchSearch] = useState('');
  const [batchStatus, setBatchStatus] = useState('');
  const [batchPage, setBatchPage] = useState(1);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingBusy, setMappingBusy] = useState(false);
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingError, setMappingError] = useState('');
  const [mappingBatch, setMappingBatch] = useState(null);
  const [mappingForm, setMappingForm] = useState(null);
  const [mappingOriginal, setMappingOriginal] = useState(null);
  const [mappingTags, setMappingTags] = useState([]);
  const [mappingChapters, setMappingChapters] = useState([]);
  const [mappingChapterSearch, setMappingChapterSearch] = useState('');
  const [mappingChapterPage, setMappingChapterPage] = useState(1);
  const [mappingChapterPagination, setMappingChapterPagination] = useState({ page: 1, limit: 100, total: 0, pages: 1 });
  const [notice, setNotice] = useState('');
  const [globalError, setGlobalError] = useState('');

  const tagDirty = Boolean(tagDialog && !sameValue(tagForm, tagFormOriginal));
  const chapterDirty = Boolean(chapterDialog && !sameValue(chapterForm, chapterFormOriginal));
  const mappingDirty = Boolean(mappingOpen && mappingForm && !sameValue(mappingForm, mappingOriginal));
  const hasUnsavedChanges = tagDirty || chapterDirty || mappingDirty;
  const selectedTag = tagItems.find((tag) => idOf(tag) === selectedTagId) || null;
  const selectedChapter = chapterItems.find((chapter) => idOf(chapter) === selectedChapterId) || null;

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const beforeUnload = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [hasUnsavedChanges]);

  const loadTags = useCallback(async () => {
    setTagBusy(true); setTagError('');
    try {
      const result = await api.listTags({ search: tagSearch, status: tagStatus, page: tagPage, limit: CATALOG_PAGE_SIZE });
      setTagItems(result.items || []); setTagPagination(result.pagination || { page: 1, limit: CATALOG_PAGE_SIZE, total: 0, pages: 1 });
      if (!selectedTagId && result.items?.[0]) setSelectedTagId(idOf(result.items[0]));
      if (selectedTagId && !result.items?.some((tag) => idOf(tag) === selectedTagId) && tagPage === 1 && !tagSearch && !tagStatus) {
        setSelectedTagId(result.items?.[0] ? idOf(result.items[0]) : '');
      }
    } catch (error) { setTagError(errorText(error, 'Không thể tải danh sách Tag.')); }
    finally { setTagBusy(false); }
  }, [api, selectedTagId, tagPage, tagSearch, tagStatus]);

  const loadChapters = useCallback(async () => {
    if (!selectedTagId) { setChapterItems([]); setChapterPagination({ page: 1, limit: CATALOG_PAGE_SIZE, total: 0, pages: 1 }); return; }
    setChapterBusy(true); setChapterError('');
    try {
      const result = await api.listChapters(selectedTagId, { search: chapterSearch, status: chapterStatus, page: chapterPage, limit: CATALOG_PAGE_SIZE });
      setChapterItems(result.items || []); setChapterPagination(result.pagination || { page: 1, limit: CATALOG_PAGE_SIZE, total: 0, pages: 1 });
      if (selectedChapterId && !result.items?.some((chapter) => idOf(chapter) === selectedChapterId)) setSelectedChapterId('');
    } catch (error) { setChapterError(errorText(error, 'Không thể tải Chapter của Tag này.')); }
    finally { setChapterBusy(false); }
  }, [api, chapterPage, chapterSearch, chapterStatus, selectedChapterId, selectedTagId]);

  const loadMemberships = useCallback(async () => {
    if (!selectedChapterId) { setMembershipItems([]); return; }
    setMembershipBusy(true); setMembershipError('');
    try {
      const result = await api.listMemberships(selectedChapterId, { search: membershipSearch, page: membershipPage, limit: MEMBERSHIP_PAGE_SIZE });
      setMembershipItems(result.items || []); setMembershipPagination(result.pagination || { page: 1, limit: MEMBERSHIP_PAGE_SIZE, total: 0, pages: 1 });
    } catch (error) { setMembershipError(errorText(error, 'Không thể tải Vocabulary trong Chapter.')); }
    finally { setMembershipBusy(false); }
  }, [api, membershipPage, membershipSearch, selectedChapterId]);

  const loadBatches = useCallback(async () => {
    setBatchBusy(true); setBatchError('');
    try {
      const result = await api.listBatches({ search: batchSearch, status: batchStatus, page: batchPage, limit: CATALOG_PAGE_SIZE });
      setBatches(result.items || []); setBatchPagination(result.pagination || { page: 1, limit: CATALOG_PAGE_SIZE, total: 0, pages: 1 });
    } catch (error) { setBatchError(errorText(error, 'Không thể tải lịch sử Import Batch.')); }
    finally { setBatchBusy(false); }
  }, [api, batchPage, batchSearch, batchStatus]);

  useEffect(() => { loadTags(); }, [loadTags]);
  useEffect(() => { loadChapters(); }, [loadChapters]);
  useEffect(() => { loadMemberships(); }, [loadMemberships]);
  useEffect(() => { if (view === 'batches') loadBatches(); }, [loadBatches, view]);

  const guard = (action) => {
    if (hasUnsavedChanges && !window.confirm('Bạn có thay đổi chưa lưu. Rời màn hình sẽ bỏ các thay đổi này. Tiếp tục?')) return;
    action();
  };

  const closeDialog = (setDialog) => guard(() => setDialog(null));
  const openTagEditor = (tag = null) => {
    const next = tag ? { name: tag.name, slug: tag.slug, description: tag.description || '', sortOrder: tag.sortOrder || 0 } : blankTag();
    setTagForm(next); setTagFormOriginal(next); setTagDialog(tag ? 'edit' : 'create');
  };
  const submitTag = async (event) => {
    event.preventDefault(); setTagSaving(true); setGlobalError('');
    try {
      const result = tagDialog === 'edit'
        ? await api.updateTag(selectedTagId, { expectedVersion: selectedTag.version, ...tagForm })
        : await api.createTag(tagForm);
      if (tagDialog === 'create') setSelectedTagId(idOf(result.tag));
      setTagDialog(null); setNotice(tagDialog === 'create' ? 'Đã tạo Tag Draft.' : 'Đã cập nhật Tag.'); await loadTags(); await loadChapters();
    } catch (error) { setGlobalError(errorText(error, 'Không thể lưu Tag.')); }
    finally { setTagSaving(false); }
  };
  const archiveTag = async (tag) => {
    if (!window.confirm(`Lưu trữ Tag “${tag.name}”? Chapter và Vocabulary đang thuộc Tag sẽ được giữ nguyên.`)) return;
    setGlobalError('');
    try { await api.archiveTag(idOf(tag), { expectedVersion: tag.version }); setNotice('Đã lưu trữ Tag; Chapter và Vocabulary vẫn được giữ nguyên.'); await loadTags(); await loadChapters(); }
    catch (error) { setGlobalError(errorText(error, 'Không thể lưu trữ Tag.')); }
  };

  const openChapterEditor = (chapter = null) => {
    const next = chapter ? {
      title: chapter.title, description: chapter.description || '', chapterNumber: chapter.chapterNumber ?? '',
      sortOrder: chapter.sortOrder || 0, tagId: idOf(selectedTag),
    } : blankChapter(selectedTagId);
    setChapterTarget(chapter); setChapterForm(next); setChapterFormOriginal(next); setChapterDialog(chapter ? 'edit' : 'create');
  };
  const submitChapter = async (event) => {
    event.preventDefault(); setChapterSaving(true); setGlobalError('');
    try {
      const { tagId, ...chapterFields } = chapterForm;
      const payload = { ...chapterFields, chapterNumber: chapterFields.chapterNumber === '' ? null : Number(chapterFields.chapterNumber), sortOrder: Number(chapterFields.sortOrder) };
      let result;
      if (chapterDialog === 'edit') result = await api.updateChapter(idOf(chapterTarget), { expectedVersion: chapterTarget.version, tagId, ...payload });
      else result = await api.createChapter(selectedTagId, payload);
      setSelectedTagId(idOf(result.chapter.tagId)); setSelectedChapterId(idOf(result.chapter)); setChapterDialog(null);
      setNotice(chapterDialog === 'create' ? 'Đã tạo Chapter Draft.' : 'Đã lưu Chapter và thay đổi Tag nếu có.'); await loadChapters(); await loadTags();
    } catch (error) { setGlobalError(errorText(error, 'Không thể lưu Chapter.')); }
    finally { setChapterSaving(false); }
  };
  const archiveChapter = async (chapter) => {
    if (!window.confirm(`Lưu trữ Chapter “${chapter.title}”? Membership và Vocabulary sẽ được giữ nguyên.`)) return;
    setGlobalError('');
    try { await api.archiveChapter(idOf(chapter), { expectedVersion: chapter.version }); setNotice('Đã lưu trữ Chapter; memberships và Vocabulary vẫn được giữ nguyên.'); await loadChapters(); await loadTags(); }
    catch (error) { setGlobalError(errorText(error, 'Không thể lưu trữ Chapter.')); }
  };

  const openAddMembership = async () => {
    setAddingMembership(true); setMembershipError(''); setVocabularySearch(''); setSelectedVocabularyId('');
    try { const result = await api.listVocabularyOptions({ page: 1, limit: 20 }); setVocabularyOptions(result.items || []); }
    catch (error) { setMembershipError(errorText(error, 'Không thể tải Vocabulary Catalog.')); }
  };
  const searchVocabularyOptions = async (value) => {
    setVocabularySearch(value);
    try { const result = await api.listVocabularyOptions({ search: value, page: 1, limit: 20 }); setVocabularyOptions(result.items || []); }
    catch (error) { setMembershipError(errorText(error, 'Không thể tìm Vocabulary.')); }
  };
  const addMembership = async () => {
    if (!selectedVocabularyId || !selectedChapter) return;
    setMembershipSaving(true); setMembershipError('');
    try {
      await api.addMembership(selectedChapterId, { vocabularyId: selectedVocabularyId, expectedVersion: selectedChapter.version });
      setNotice('Đã thêm Vocabulary vào Chapter. Nội dung từ không bị thay đổi.'); setAddingMembership(false); setSelectedVocabularyId(''); await loadChapters(); await loadMemberships(); await loadTags();
    } catch (error) { setMembershipError(errorText(error, 'Không thể thêm membership.')); }
    finally { setMembershipSaving(false); }
  };
  const moveMembership = async (membershipId, direction) => {
    if (membershipSearch) { setMembershipError('Xóa bộ lọc tìm kiếm trước khi sắp xếp để tránh đổi thứ tự nhầm.'); return; }
    setMembershipBusy(true); setMembershipError('');
    try {
      const first = await api.listMemberships(selectedChapterId, { page: 1, limit: 100 });
      let all = [...(first.items || [])];
      for (let page = 2; page <= (first.pagination?.pages || 1); page += 1) {
        const next = await api.listMemberships(selectedChapterId, { page, limit: 100 }); all.push(...(next.items || []));
      }
      const reordered = moveId(all, membershipId, direction);
      await api.reorderMemberships(selectedChapterId, { expectedVersion: first.chapter.version, membershipIds: reordered.map((item) => idOf(item)) });
      setNotice('Đã đổi thứ tự Vocabulary trong Chapter. Các Chapter khác không bị ảnh hưởng.'); await loadChapters(); await loadMemberships();
    } catch (error) { setMembershipError(errorText(error, 'Không thể đổi thứ tự. Hãy tải lại Chapter.')); }
    finally { setMembershipBusy(false); }
  };

  const openMapping = async (batchId) => {
    setMappingOpen(true); setMappingBusy(true); setMappingError(''); setMappingBatch(null); setMappingForm(null);
    try {
      const [result, tagResult] = await Promise.all([
        api.getBatchMapping(batchId), api.listTags({ page: 1, limit: 100 }),
      ]);
      const form = { targetTagId: result.mapping.targetTagId || '', entries: result.mapping.entries || [], version: result.mapping.version, status: result.mapping.status };
      setMappingBatch(result.batch); setMappingTags((tagResult.items || []).filter((tag) => tag.status !== 'archived'));
      setMappingForm(form); setMappingOriginal(form);
    } catch (error) { setMappingError(errorText(error, 'Không thể tải Batch mapping.')); }
    finally { setMappingBusy(false); }
  };
  const loadMappingChapters = useCallback(async () => {
    if (!mappingForm?.targetTagId) { setMappingChapters([]); return; }
    try {
      const result = await api.listChapters(mappingForm.targetTagId, { search: mappingChapterSearch, status: '', page: mappingChapterPage, limit: 100 });
      setMappingChapters(result.items || []); setMappingChapterPagination(result.pagination || { page: 1, limit: 100, total: 0, pages: 1 });
    } catch (error) { setMappingError(errorText(error, 'Không thể tải Chapter cho Tag này.')); }
  }, [api, mappingChapterPage, mappingChapterSearch, mappingForm?.targetTagId]);
  useEffect(() => { if (mappingOpen && mappingForm?.targetTagId) loadMappingChapters(); }, [loadMappingChapters, mappingOpen, mappingForm?.targetTagId]);

  const updateMappingEntry = (identity, update) => setMappingForm((current) => ({
    ...current,
    entries: current.entries.map((entry) => entry.sourceFileIdentity === identity ? { ...entry, ...update } : entry),
  }));
  const changeMappingAction = (entry, action) => updateMappingEntry(entry.sourceFileIdentity, {
    chapterAction: action,
    targetChapterId: action === 'EXISTING' ? '' : null,
    createChapter: action === 'CREATE' ? { title: '', description: '', chapterNumber: null, sortOrder: 0 } : null,
  });
  const submitMapping = async () => {
    if (!mappingForm?.targetTagId) { setMappingError('Chọn Tag đích trước khi lưu.'); return; }
    if (mappingForm.entries.some((entry) => !['EXISTING', 'CREATE'].includes(entry.chapterAction))) { setMappingError('Chọn Chapter đích cho từng file DOCX.'); return; }
    if (mappingForm.entries.some((entry) => entry.chapterAction === 'EXISTING' && !entry.targetChapterId)) { setMappingError('Chọn Chapter hiện có cho từng file được gán EXISTING.'); return; }
    if (mappingForm.entries.some((entry) => entry.chapterAction === 'CREATE' && !entry.createChapter?.title?.trim())) { setMappingError('Nhập tiêu đề cho Chapter mới.'); return; }
    setMappingSaving(true); setMappingError('');
    try {
      const result = await api.saveBatchMapping(mappingBatch._id, {
        expectedVersion: mappingForm.version,
        targetTagId: mappingForm.targetTagId,
        entries: mappingForm.entries.map((entry) => ({
          sourceFileIdentity: entry.sourceFileIdentity,
          chapterAction: entry.chapterAction,
          ...(entry.chapterAction === 'EXISTING' ? { targetChapterId: entry.targetChapterId } : { createChapter: entry.createChapter }),
        })),
      });
      const form = { targetTagId: result.mapping.targetTagId, entries: result.mapping.entries, version: result.mapping.version, status: result.mapping.status };
      setMappingBatch(result.batch); setMappingForm(form); setMappingOriginal(form); setNotice('Đã lưu ánh xạ Tag và Chapter. Nội dung review của Batch vẫn nguyên vẹn.'); await loadBatches();
    } catch (error) { setMappingError(errorText(error, 'Không thể lưu ánh xạ. Kiểm tra Tag, Chapter và Batch version.')); }
    finally { setMappingSaving(false); }
  };

  if (view === 'review') return <div className="vcm-page vcm-review-shell">
    <div className="vcm-review-back"><button className="vcm-button vcm-button--quiet" type="button" onClick={() => setView('batches')}>← Lịch sử Import Batch</button><Status value="DRAFT" /></div>
    <VocabularyImportWorkspace api={importApi} initialBatchId={reviewBatchId} autoOpenBatch key={reviewBatchId} />
  </div>;

  return <main className="vcm-page">
    <header className="vcm-hero">
      <div><span className="vcm-kicker">Admin catalog · Phase V4A</span><h1>Quản lý Tag & Chapter</h1>
        <p>Gom các Chapter thành bộ từ vựng có thứ tự. Mỗi Chapter là một card; nội dung vẫn ở Draft cho đến khi chính sách xuất bản được duyệt.</p></div>
      <div className="vcm-hero-stamp"><span>CATALOG</span><strong>{tagPagination.total.toString().padStart(2, '0')}</strong><small>nhóm nguồn</small></div>
    </header>
    {notice && <div className="vcm-notice" role="status"><span>{notice}</span><button type="button" aria-label="Ẩn thông báo" onClick={() => setNotice('')}>×</button></div>}
    {globalError && <div className="vcm-error" role="alert"><span>{globalError}</span><button type="button" onClick={() => setGlobalError('')}>Đóng</button></div>}
    <nav className="vcm-tabs" aria-label="Quản lý Vocabulary Catalog">
      <button type="button" className={view === 'tags' ? 'is-active' : ''} aria-current={view === 'tags' ? 'page' : undefined} onClick={() => guard(() => setView('tags'))}><span className="vcm-tab-mark">A</span><span><strong>Tag & Chapter</strong><small>Quản lý Catalog</small></span></button>
      <button type="button" className={view === 'batches' ? 'is-active' : ''} aria-current={view === 'batches' ? 'page' : undefined} onClick={() => guard(() => setView('batches'))}><span className="vcm-tab-mark">↗</span><span><strong>Import history</strong><small>Batch và ánh xạ nguồn</small></span></button>
      <span className="vcm-policy"><i aria-hidden="true" /> Chính sách publish: PENDING_PO</span>
    </nav>

    {view === 'tags' ? <section className="vcm-catalog-grid" aria-label="Tag và Chapter">
      <aside className="vcm-tag-panel">
        <div className="vcm-panel-heading"><div><span className="vcm-kicker">Nguồn từ vựng</span><h2>Tag</h2></div><button className="vcm-button vcm-button--primary vcm-button--small" type="button" onClick={() => openTagEditor()}>+ Tạo Tag</button></div>
        <div className="vcm-filter-stack"><label className="vcm-search"><span className="sr-only">Tìm Tag</span><input value={tagSearch} placeholder="Tìm tên hoặc slug" onChange={(event) => { setTagSearch(event.target.value); setTagPage(1); }} /></label>
          <label className="sr-only" htmlFor="vcm-tag-status">Lọc trạng thái Tag</label><select id="vcm-tag-status" value={tagStatus} onChange={(event) => { setTagStatus(event.target.value); setTagPage(1); }}><option value="">Tất cả trạng thái</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></div>
        {tagBusy ? <div className="vcm-state" role="status">Đang tải Tag…</div> : tagError ? <div className="vcm-error" role="alert"><span>{tagError}</span><button type="button" onClick={loadTags}>Thử lại</button></div> : tagItems.length === 0 ? <div className="vcm-empty"><span className="vcm-empty-mark">＋</span><strong>Chưa có Tag phù hợp</strong><small>Tạo Tag Draft để gom các Chapter theo nguồn.</small></div> : <div className="vcm-tag-list">
          {tagItems.map((tag, index) => <button type="button" key={idOf(tag)} className={`vcm-tag-row${selectedTagId === idOf(tag) ? ' is-selected' : ''}`} aria-pressed={selectedTagId === idOf(tag)} onClick={() => { setSelectedTagId(idOf(tag)); setSelectedChapterId(''); setChapterPage(1); }}>
            <span className="vcm-tag-index">{String((tagPage - 1) * CATALOG_PAGE_SIZE + index + 1).padStart(2, '0')}</span><span className="vcm-tag-copy"><strong>{tag.name}</strong><small>{tag.slug}</small></span><span className="vcm-tag-count"><b>{tag.chapterCount}</b><small>chapters</small></span>
          </button>)}
        </div>}
        <Pager pagination={tagPagination} onPage={setTagPage} />
      </aside>

      <div className="vcm-chapter-area">
        {!selectedTag ? <div className="vcm-empty vcm-empty--large"><span className="vcm-empty-mark">01</span><strong>Chọn một Tag để bắt đầu</strong><small>Chapter cards sẽ hiện ở đây.</small></div> : <>
          <section className="vcm-tag-detail">
            <div className="vcm-tag-detail__head"><div><span className="vcm-kicker">Catalog group · {selectedTag.slug}</span><h2>{selectedTag.name}</h2><p>{selectedTag.description || 'Chưa có mô tả cho nhóm từ vựng này.'}</p></div><Status value={selectedTag.status} /></div>
            <div className="vcm-tag-metrics"><span><b>{selectedTag.chapterCount}</b> Chapter</span><span><b>{selectedTag.vocabularyCount}</b> membership Vocabulary</span><span><b>{selectedTag.sortOrder}</b> thứ tự Tag</span></div>
            <div className="vcm-tag-actions"><button className="vcm-button vcm-button--secondary" type="button" onClick={() => openTagEditor(selectedTag)}>Sửa Tag</button><button className="vcm-button vcm-button--danger" type="button" disabled={selectedTag.status === 'archived'} onClick={() => archiveTag(selectedTag)}>Lưu trữ Tag</button></div>
          </section>
          <section className="vcm-chapters-section">
            <div className="vcm-section-head"><div><span className="vcm-kicker">Thứ tự học · mỗi card là một Chapter</span><h2>Chapters <small>{chapterPagination.total}</small></h2></div><button className="vcm-button vcm-button--primary" type="button" disabled={selectedTag.status === 'archived'} onClick={() => openChapterEditor()}>+ Tạo Chapter</button></div>
            <div className="vcm-filter-row"><label className="vcm-search"><span className="sr-only">Tìm Chapter</span><input value={chapterSearch} placeholder="Tìm tên Chapter" onChange={(event) => { setChapterSearch(event.target.value); setChapterPage(1); }} /></label>
              <label className="sr-only" htmlFor="vcm-chapter-status">Lọc trạng thái Chapter</label><select id="vcm-chapter-status" value={chapterStatus} onChange={(event) => { setChapterStatus(event.target.value); setChapterPage(1); }}><option value="">Tất cả trạng thái</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></div>
            {chapterBusy ? <div className="vcm-state" role="status">Đang tải Chapter…</div> : chapterError ? <div className="vcm-error" role="alert"><span>{chapterError}</span><button type="button" onClick={loadChapters}>Thử lại</button></div> : chapterItems.length === 0 ? <div className="vcm-empty"><span className="vcm-empty-mark">↳</span><strong>Tag này chưa có Chapter</strong><small>Tạo một Chapter Draft hoặc ánh xạ file từ Batch history.</small></div> : <div className="vcm-chapter-grid">
              {chapterItems.map((chapter) => <article key={idOf(chapter)} className={`vcm-chapter-card${selectedChapterId === idOf(chapter) ? ' is-selected' : ''}`}>
                <button className="vcm-chapter-open" type="button" onClick={() => { setSelectedChapterId(idOf(chapter)); setMembershipPage(1); setMembershipSearch(''); }} aria-pressed={selectedChapterId === idOf(chapter)}>
                  <span className="vcm-chapter-number">{chapter.chapterNumber ? String(chapter.chapterNumber).padStart(2, '0') : '—'}</span><span className="vcm-chapter-card__body"><Status value={chapter.status} /><strong>{chapter.title}</strong><small>{chapter.vocabularyCount} Vocabulary · {chapter.sortOrder} thứ tự</small></span><span className="vcm-card-arrow" aria-hidden="true">↗</span>
                </button>
                <div className="vcm-chapter-actions"><button type="button" className="vcm-link-button" onClick={() => { setSelectedChapterId(idOf(chapter)); openChapterEditor(chapter); }}>Sửa</button><button type="button" className="vcm-link-button vcm-link-button--danger" disabled={chapter.status === 'archived'} onClick={() => archiveChapter(chapter)}>Lưu trữ</button></div>
              </article>)}
            </div>}
            <Pager pagination={chapterPagination} onPage={setChapterPage} />
          </section>
        </>}
      </div>

      {selectedChapter && <section className="vcm-membership-panel">
        <div className="vcm-membership-head"><div><span className="vcm-kicker">Chapter membership · {selectedChapter.chapterNumber ? `Chapter ${selectedChapter.chapterNumber}` : 'Không đánh số'}</span><h2>{selectedChapter.title}</h2><p>{selectedChapter.vocabularyCount} Vocabulary trong card này</p></div>
          <button type="button" className="vcm-button vcm-button--secondary" disabled={selectedChapter.status === 'archived'} onClick={openAddMembership}>+ Thêm từ đã có</button></div>
        {addingMembership && <div className="vcm-add-membership"><label className="vcm-search"><span className="sr-only">Tìm Vocabulary</span><input value={vocabularySearch} placeholder="Tìm từ trong Catalog" onChange={(event) => searchVocabularyOptions(event.target.value)} /></label>
          <label className="sr-only" htmlFor="vcm-vocab-select">Chọn Vocabulary</label><select id="vcm-vocab-select" value={selectedVocabularyId} onChange={(event) => setSelectedVocabularyId(event.target.value)}><option value="">Chọn Vocabulary</option>{vocabularyOptions.map((item) => <option key={idOf(item)} value={idOf(item)}>{item.word} · {item.meaning}</option>)}</select>
          <button className="vcm-button vcm-button--primary vcm-button--small" type="button" disabled={!selectedVocabularyId || membershipSaving} onClick={addMembership}>{membershipSaving ? 'Đang thêm…' : 'Thêm vào Chapter'}</button><button className="vcm-button vcm-button--quiet vcm-button--small" type="button" onClick={() => setAddingMembership(false)}>Hủy</button></div>}
        {membershipSearch && <p className="vcm-reorder-hint">Xóa bộ lọc trước khi đổi thứ tự để sắp xếp trên toàn Chapter.</p>}
        <div className="vcm-filter-row vcm-membership-filter"><label className="vcm-search"><span className="sr-only">Tìm Vocabulary trong Chapter</span><input value={membershipSearch} placeholder="Tìm từ hoặc nghĩa" onChange={(event) => { setMembershipSearch(event.target.value); setMembershipPage(1); }} /></label><span className="vcm-count-note">Sort order là riêng cho Chapter này.</span></div>
        {membershipError && <div className="vcm-error" role="alert"><span>{membershipError}</span><button type="button" onClick={() => setMembershipError('')}>Đóng</button></div>}
        {membershipBusy ? <div className="vcm-state" role="status">Đang tải membership…</div> : membershipItems.length === 0 ? <div className="vcm-empty vcm-empty--compact"><strong>Chapter chưa có Vocabulary</strong><small>Thêm một từ đã có trong Catalog. Nội dung Vocabulary sẽ được giữ nguyên.</small></div> : <ol className="vcm-membership-list">{membershipItems.map((membership, index) => <li key={idOf(membership)}>
          <span className="vcm-membership-order">{String((membershipPage - 1) * MEMBERSHIP_PAGE_SIZE + index + 1).padStart(2, '0')}</span><span className="vcm-membership-copy"><strong>{membership.vocabulary.word}</strong><small>{membership.vocabulary.meaning} · {membership.vocabulary.partOfSpeech || 'Chưa có POS'}</small></span><Status value={membership.vocabulary.catalogStatus} />
          <span className="vcm-reorder-controls"><button type="button" aria-label={`Đưa ${membership.vocabulary.word} lên`} title="Đưa lên" disabled={membershipBusy || Boolean(membershipSearch)} onClick={() => moveMembership(idOf(membership), -1)}>↑</button><button type="button" aria-label={`Đưa ${membership.vocabulary.word} xuống`} title="Đưa xuống" disabled={membershipBusy || Boolean(membershipSearch)} onClick={() => moveMembership(idOf(membership), 1)}>↓</button></span>
        </li>)}</ol>}
        <Pager pagination={membershipPagination} onPage={setMembershipPage} />
      </section>}
    </section> : <section className="vcm-history-section">
      <div className="vcm-section-head"><div><span className="vcm-kicker">Batch identity · source-preserving mapping</span><h2>Lịch sử Import Batch</h2><p>Danh sách chỉ hiển thị metadata và counts; không trả DOCX hoặc nội dung từ vựng.</p></div><button className="vcm-button vcm-button--secondary" type="button" onClick={loadBatches}>Làm mới</button></div>
      <div className="vcm-filter-row"><label className="vcm-search"><span className="sr-only">Tìm Batch</span><input value={batchSearch} placeholder="Tìm Batch ID hoặc nhóm nguồn" onChange={(event) => { setBatchSearch(event.target.value); setBatchPage(1); }} /></label>
        <label className="sr-only" htmlFor="vcm-batch-status">Lọc trạng thái Batch</label><select id="vcm-batch-status" value={batchStatus} onChange={(event) => { setBatchStatus(event.target.value); setBatchPage(1); }}><option value="">Tất cả trạng thái</option><option value="NEEDS_REVIEW">Cần kiểm duyệt</option><option value="REVIEW_COMPLETE">Đã kiểm duyệt</option><option value="PARTIALLY_CONFIRMED_DRAFT">Tạo Draft một phần</option><option value="CONFIRMED_DRAFT">Đã tạo Draft</option><option value="FAILED">Thất bại</option></select></div>
      {batchError && <div className="vcm-error" role="alert"><span>{batchError}</span><button type="button" onClick={loadBatches}>Thử lại</button></div>}
      {batchBusy ? <div className="vcm-state" role="status">Đang tải lịch sử…</div> : batches.length === 0 ? <div className="vcm-empty vcm-empty--large"><span className="vcm-empty-mark">↗</span><strong>Chưa có Import Batch</strong><small>Batch mới sẽ xuất hiện ở đây sau khi được tạo trong Import & Review.</small></div> : <div className="vcm-batch-list">
        {batches.map((batch) => <article className="vcm-batch-row" key={idOf(batch)}>
          <div className="vcm-batch-row__main"><code>{batch._id}</code><span>{batch.sourceFolderLabels?.join(' · ') || 'Không có nhãn nguồn'}</span><small>{formatDate(batch.createdAt)} · {batch.fileCount} file · {batch.candidateCount} candidate</small></div>
          <div className="vcm-batch-row__counts">{mapCounts(batch).slice(1).map(([label, count]) => <span key={label}><b>{count}</b><small>{label}</small></span>)}</div>
          <div className="vcm-batch-row__state"><Status value={batch.status} /><Status value={batch.confirmStatus} /><small>{batch.parserVersions?.join(', ') || 'Parser version chưa ghi'}</small></div>
          <div className="vcm-batch-row__actions"><Status value={batch.mappingStatus} /><button className="vcm-button vcm-button--secondary vcm-button--small" type="button" disabled={batch.mappingStatus === 'LOCKED'} onClick={() => openMapping(idOf(batch))}>{batch.mappingStatus === 'LOCKED' ? 'Mapping đã khóa' : batch.mappingStatus === 'NOT_MAPPED' ? 'Ánh xạ Tag / Chapter' : 'Sửa ánh xạ'}</button><button className="vcm-button vcm-button--quiet vcm-button--small" type="button" onClick={() => { setReviewBatchId(idOf(batch)); setView('review'); }}>Tiếp tục review</button></div>
        </article>)}
      </div>}
      <Pager pagination={batchPagination} onPage={setBatchPage} />
    </section>}

    <Dialog open={Boolean(tagDialog)} title={tagDialog === 'edit' ? 'Sửa Tag' : 'Tạo Tag Draft'} labelledBy="vcm-tag-dialog-title" onClose={() => closeDialog(setTagDialog)}>
      <form className="vcm-form" onSubmit={submitTag}>
        <Field label="Tên Tag"><input required maxLength={120} value={tagForm.name} onChange={(event) => setTagForm((current) => ({ ...current, name: event.target.value, ...(tagDialog === 'create' && !current.slug ? { slug: safeSlug(event.target.value) } : {}) }))} /></Field>
        <Field label="Slug" hint="Dùng trong mapping và quản lý Catalog."><input required maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={tagForm.slug} onChange={(event) => setTagForm((current) => ({ ...current, slug: safeSlug(event.target.value) }))} /></Field>
        <Field label="Mô tả"><textarea maxLength={2000} rows={3} value={tagForm.description} onChange={(event) => setTagForm((current) => ({ ...current, description: event.target.value }))} /></Field>
        <Field label="Thứ tự hiển thị"><input type="number" min="0" max="1000000" value={tagForm.sortOrder} onChange={(event) => setTagForm((current) => ({ ...current, sortOrder: event.target.value }))} /></Field>
        <div className="vcm-dialog-actions"><button className="vcm-button vcm-button--secondary" type="button" onClick={() => closeDialog(setTagDialog)}>Hủy</button><button className="vcm-button vcm-button--primary" type="submit" disabled={tagSaving}>{tagSaving ? 'Đang lưu…' : 'Lưu Tag Draft'}</button></div>
      </form>
    </Dialog>

    <Dialog open={Boolean(chapterDialog)} title={chapterDialog === 'edit' ? 'Sửa Chapter' : 'Tạo Chapter Draft'} labelledBy="vcm-chapter-dialog-title" onClose={() => closeDialog(setChapterDialog)}>
      <form className="vcm-form" onSubmit={submitChapter}>
        {chapterDialog === 'edit' && <Field label="Tag đích" hint="Di chuyển Chapter không thay đổi các Vocabulary memberships."><select value={chapterForm.tagId} onChange={(event) => setChapterForm((current) => ({ ...current, tagId: event.target.value }))}>{tagItems.filter((tag) => tag.status !== 'archived').map((tag) => <option key={idOf(tag)} value={idOf(tag)}>{tag.name}</option>)}</select></Field>}
        <Field label="Tiêu đề Chapter"><input required maxLength={120} value={chapterForm.title} onChange={(event) => setChapterForm((current) => ({ ...current, title: event.target.value }))} /></Field>
        <Field label="Mô tả"><textarea maxLength={2000} rows={3} value={chapterForm.description} onChange={(event) => setChapterForm((current) => ({ ...current, description: event.target.value }))} /></Field>
        <div className="vcm-form-grid"><Field label="Chapter number"><input type="number" min="1" max="100000" value={chapterForm.chapterNumber} onChange={(event) => setChapterForm((current) => ({ ...current, chapterNumber: event.target.value }))} /></Field><Field label="Thứ tự hiển thị"><input type="number" min="0" max="1000000" value={chapterForm.sortOrder} onChange={(event) => setChapterForm((current) => ({ ...current, sortOrder: event.target.value }))} /></Field></div>
        <div className="vcm-dialog-actions"><button className="vcm-button vcm-button--secondary" type="button" onClick={() => closeDialog(setChapterDialog)}>Hủy</button><button className="vcm-button vcm-button--primary" type="submit" disabled={chapterSaving}>{chapterSaving ? 'Đang lưu…' : 'Lưu Chapter Draft'}</button></div>
      </form>
    </Dialog>

    <Dialog open={mappingOpen} title="Ánh xạ DOCX vào Catalog" labelledBy="vcm-mapping-dialog-title" wide onClose={() => closeDialog(setMappingOpen)}>
      {mappingBusy ? <div className="vcm-state" role="status">Đang tải Batch và Tag…</div> : mappingError && !mappingForm ? <div className="vcm-error" role="alert">{mappingError}<button type="button" onClick={() => setMappingOpen(false)}>Đóng</button></div> : mappingForm && <div className="vcm-mapping-form">
        <div className="vcm-mapping-banner"><div><span className="vcm-kicker">Batch {mappingBatch?._id}</span><p>{mappingBatch?.fileCount} DOCX · {mappingBatch?.candidateCount} candidate · {mappingBatch?.counts?.approved || 0} đã duyệt</p></div><Status value={mappingForm.status || 'NOT_MAPPED'} /></div>
        <p className="vcm-mapping-rule">Source folder, relative path, file SHA và Parser source identity được giữ nguyên. Mỗi file cần một lựa chọn rõ ràng; tiêu đề giống nhau chỉ là gợi ý, không tự ghép vào Chapter có sẵn.</p>
        <Field label="Tag đích"><select value={mappingForm.targetTagId} disabled={mappingForm.status === 'LOCKED'} onChange={(event) => setMappingForm((current) => ({ ...current, targetTagId: event.target.value, entries: current.entries.map((entry) => ({ ...entry, ...(entry.chapterAction === 'EXISTING' ? { targetChapterId: '' } : {}) })) }))}><option value="">Chọn Tag</option>{mappingTags.map((tag) => <option key={idOf(tag)} value={idOf(tag)}>{tag.name} · {tag.slug}</option>)}</select></Field>
        {mappingChapterSearch !== undefined && mappingForm.targetTagId && <label className="vcm-search vcm-map-chapter-search"><span className="sr-only">Tìm Chapter đích</span><input value={mappingChapterSearch} placeholder="Tìm Chapter đã có trong Tag" onChange={(event) => { setMappingChapterSearch(event.target.value); setMappingChapterPage(1); }} /></label>}
        <div className="vcm-source-map-list">{mappingForm.entries.map((entry, index) => <article className="vcm-source-map-card" key={entry.sourceFileIdentity}>
          <div className="vcm-source-map-source"><span className="vcm-source-map-index">{String(index + 1).padStart(2, '0')}</span><div><strong>{entry.sourceFileName}</strong><small>Source folder · {entry.sourceFolderLabel || '—'}</small><small>Chapter candidate · {entry.sourceChapterCandidate || '—'}</small><small>{entry.candidateCount} candidate · path và SHA giữ nguyên</small></div></div>
          <div className="vcm-source-map-target"><Field label="Cách gán Chapter"><select disabled={mappingForm.status === 'LOCKED'} value={entry.chapterAction || ''} onChange={(event) => changeMappingAction(entry, event.target.value)}><option value="">Chọn cách gán</option><option value="EXISTING">Dùng Chapter hiện có</option><option value="CREATE">Tạo Chapter mới khi Confirm</option></select></Field>
            {entry.chapterAction === 'EXISTING' && <Field label="Chapter đích"><select disabled={mappingForm.status === 'LOCKED' || !mappingForm.targetTagId} value={entry.targetChapterId || ''} onChange={(event) => updateMappingEntry(entry.sourceFileIdentity, { targetChapterId: event.target.value })}><option value="">Chọn Chapter có sẵn</option>{mappingChapters.map((chapter) => <option key={idOf(chapter)} value={idOf(chapter)}>{chapter.chapterNumber ? `${chapter.chapterNumber}. ` : ''}{chapter.title} · {chapter.vocabularyCount} từ</option>)}</select></Field>}
            {entry.chapterAction === 'CREATE' && <div className="vcm-create-chapter-grid"><Field label="Tiêu đề Chapter mới"><input disabled={mappingForm.status === 'LOCKED'} maxLength={120} value={entry.createChapter?.title || ''} placeholder={entry.sourceChapterCandidate || 'Nhập tiêu đề'} onChange={(event) => updateMappingEntry(entry.sourceFileIdentity, { createChapter: { ...entry.createChapter, title: event.target.value } })} /></Field><Field label="Chapter number"><input disabled={mappingForm.status === 'LOCKED'} type="number" min="1" value={entry.createChapter?.chapterNumber ?? ''} onChange={(event) => updateMappingEntry(entry.sourceFileIdentity, { createChapter: { ...entry.createChapter, chapterNumber: event.target.value ? Number(event.target.value) : null } })} /></Field></div>}
          </div>
        </article>)}</div>
        {mappingChapterPagination.pages > 1 && <Pager pagination={mappingChapterPagination} onPage={setMappingChapterPage} />}
        {mappingError && <div className="vcm-error" role="alert"><span>{mappingError}</span><button type="button" onClick={() => setMappingError('')}>Đóng</button></div>}
        {mappingForm.status === 'LOCKED' && <p className="vcm-mapping-locked">Batch đã tạo Draft; mapping được khóa để bảo toàn đích của các candidate đã Confirm.</p>}
        <div className="vcm-dialog-actions"><button type="button" className="vcm-button vcm-button--secondary" onClick={() => closeDialog(setMappingOpen)}>Đóng</button><button type="button" className="vcm-button vcm-button--primary" disabled={mappingSaving || mappingForm.status === 'LOCKED'} onClick={submitMapping}>{mappingSaving ? 'Đang lưu…' : mappingForm.version === null ? 'Lưu ánh xạ' : 'Cập nhật ánh xạ'}</button></div>
      </div>}
    </Dialog>
  </main>;
}
