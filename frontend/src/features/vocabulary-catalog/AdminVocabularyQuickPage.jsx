import { useCallback, useEffect, useRef, useState } from 'react';
import { vocabularyCatalogApi as api } from './api.js';
import './AdminVocabularyQuickPage.css';

const NEW_VALUE = '__new__';

async function loadAllTags() {
  const first = await api.listTags({ page: 1, limit: 100 });
  const items = [...(first.items || [])];
  for (let page = 2; page <= (first.pagination?.pages || 1); page += 1) {
    const next = await api.listTags({ page, limit: 100 });
    items.push(...(next.items || []));
  }
  return items.filter((tag) => tag.status !== 'archived');
}

export default function AdminVocabularyQuickPage() {
  const [tags, setTags] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [tagId, setTagId] = useState('');
  const [chapterId, setChapterId] = useState(NEW_VALUE);
  const [newTagName, setNewTagName] = useState('');
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef(null);

  const loadTags = useCallback(async (preferredId = '') => {
    const nextTags = await loadAllTags();
    setTags(nextTags);
    setTagId((current) => preferredId || (nextTags.some((tag) => tag._id === current) ? current : nextTags[0]?._id || NEW_VALUE));
    return nextTags;
  }, []);

  useEffect(() => {
    let live = true;
    loadAllTags().then((items) => {
      if (!live) return;
      setTags(items);
      setTagId(items[0]?._id || NEW_VALUE);
    }).catch((requestError) => {
      if (live) setError(requestError.message || 'Không thể tải danh mục từ vựng.');
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!tagId || tagId === NEW_VALUE) { setChapters([]); setChapterId(NEW_VALUE); return undefined; }
    let live = true;
    api.listChapters(tagId, { page: 1, limit: 100 }).then((result) => {
      if (!live) return;
      const items = (result.items || []).filter((chapter) => chapter.status !== 'archived');
      setChapters(items);
      setChapterId((current) => items.some((chapter) => chapter._id === current) ? current : NEW_VALUE);
    }).catch((requestError) => { if (live) setError(requestError.message || 'Không thể tải chapter.'); });
    return () => { live = false; };
  }, [tagId]);

  const previewFile = async (event) => {
    event.preventDefault();
    if (!file) { setError('Chọn file Word .docx trước.'); return; }
    setPreviewing(true); setError(''); setNotice('');
    try {
      setPreview(await api.previewDocx(file));
    } catch (requestError) {
      setError(requestError.message || 'Không thể nhận diện file Word.');
    } finally { setPreviewing(false); }
  };

  const publish = async () => {
    const validItems = (preview?.items || []).filter((item) => item.isValid);
    if (!validItems.length) { setError('File chưa có từ hợp lệ để xuất bản.'); return; }
    if (tagId === NEW_VALUE && !newTagName.trim()) { setError('Nhập tên Tag mới.'); return; }
    if (chapterId === NEW_VALUE && !newChapterTitle.trim()) { setError('Nhập tên Chapter mới.'); return; }
    setPublishing(true); setError(''); setNotice('');
    try {
      const result = await api.publishDocx({
        ...(tagId === NEW_VALUE ? { tagName: newTagName.trim() } : { tagId }),
        ...(chapterId === NEW_VALUE ? { chapterTitle: newChapterTitle.trim() } : { chapterId }),
        items: validItems,
      });
      setNotice(`Đã xuất bản ${result.importedCount} từ cho toàn bộ học viên.`);
      setPreview(null); setFile(null); setNewTagName(''); setNewChapterTitle('');
      if (fileInput.current) fileInput.current.value = '';
      await loadTags(result.tagId);
      setChapterId(result.chapterId);
    } catch (requestError) {
      setError(requestError.message || 'Không thể xuất bản từ vựng.');
    } finally { setPublishing(false); }
  };

  const toggleTag = async (tag) => {
    setError('');
    try {
      await api.setTagVisibility(tag._id, tag.status !== 'published');
      await loadTags(tag._id);
    } catch (requestError) { setError(requestError.message || 'Không thể đổi trạng thái Tag.'); }
  };

  const toggleChapter = async (chapter) => {
    setError('');
    try {
      await api.setChapterVisibility(chapter._id, chapter.status !== 'published');
      const result = await api.listChapters(tagId, { page: 1, limit: 100 });
      setChapters((result.items || []).filter((item) => item.status !== 'archived'));
    } catch (requestError) { setError(requestError.message || 'Không thể đổi trạng thái Chapter.'); }
  };

  return <main className="admin-page-container vocab-quick-page">
    <header className="vocab-quick-header">
      <div><p className="admin-eyebrow">VOCABULARY CATALOG</p><h1 className="admin-page-title">Quản lý từ vựng</h1><p className="admin-page-sub">Import một file Word, chọn Tag và Chapter, rồi xuất bản toàn bộ từ hợp lệ cho học viên.</p></div>
    </header>

    {error && <div className="vocab-quick-message is-error" role="alert">{error}<button type="button" onClick={() => setError('')}>Đóng</button></div>}
    {notice && <div className="vocab-quick-message is-success" role="status">{notice}</div>}

    <section className="vocab-quick-panel">
      <div className="vocab-quick-panel__heading"><span>01</span><div><h2>Nhận diện từ trong file Word</h2><p>Chọn file .docx để xem trước các từ được quét trước khi lưu.</p></div></div>
      <form className="vocab-quick-file" onSubmit={previewFile}>
        <label>File Word (.docx)<input ref={fileInput} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setError(''); }} /></label>
        <button type="submit" className="admin-primary-button" disabled={!file || previewing}>{previewing ? 'Đang nhận diện…' : 'Nhận diện từ'}</button>
      </form>
      {preview && <div className="vocab-quick-preview">
        <div className="vocab-quick-counts"><strong>{preview.summary?.valid || 0} từ hợp lệ</strong><span>{preview.summary?.invalid || 0} dòng cần kiểm tra</span><span>{preview.fileName}</span></div>
        {preview.warnings?.length > 0 && <ul className="vocab-quick-warnings">{preview.warnings.map((warning, index) => <li key={index}>{typeof warning === 'string' ? warning : warning.message || JSON.stringify(warning)}</li>)}</ul>}
        <div className="vocab-quick-table-wrap"><table className="vocab-quick-table"><thead><tr><th>Từ</th><th>Từ loại</th><th>Nghĩa</th><th>Trạng thái</th></tr></thead><tbody>{preview.items.map((item, index) => <tr key={`${item.word}-${index}`} className={!item.isValid ? 'is-invalid' : ''}><td><strong>{item.word || '—'}</strong></td><td>{item.partOfSpeech || '—'}</td><td>{item.meaning || '—'}</td><td>{item.isValid ? 'Sẵn sàng' : item.validationErrors?.join(', ') || 'Thiếu dữ liệu'}</td></tr>)}</tbody></table></div>
      </div>}
    </section>

    <section className="vocab-quick-panel">
      <div className="vocab-quick-panel__heading"><span>02</span><div><h2>Chọn Tag và Chapter</h2><p>Chọn mục có sẵn hoặc nhập tên mới. Tag và Chapter mới sẽ tự được tạo khi xuất bản.</p></div></div>
      <div className="vocab-quick-fields">
        <label>Tag<select value={tagId} disabled={loading} onChange={(event) => { setTagId(event.target.value); setError(''); }}><option value={NEW_VALUE}>+ Tạo Tag mới</option>{tags.map((tag) => <option key={tag._id} value={tag._id}>{tag.name}{tag.status === 'published' ? '' : ' · đang ẩn'}</option>)}</select></label>
        {tagId === NEW_VALUE && <label>Tên Tag mới<input value={newTagName} maxLength={120} onChange={(event) => setNewTagName(event.target.value)} placeholder="Ví dụ: TOEIC Essential" /></label>}
        <label>Chapter<select value={chapterId} onChange={(event) => setChapterId(event.target.value)} disabled={tagId === NEW_VALUE}><option value={NEW_VALUE}>+ Tạo Chapter mới</option>{chapters.map((chapter) => <option key={chapter._id} value={chapter._id}>{chapter.title}{chapter.status === 'published' ? '' : ' · đang ẩn'}</option>)}</select></label>
        {chapterId === NEW_VALUE && <label>Tên Chapter mới<input value={newChapterTitle} maxLength={120} onChange={(event) => setNewChapterTitle(event.target.value)} placeholder="Ví dụ: Chapter 1" /></label>}
      </div>
      <div className="vocab-quick-publish-row"><p>Khi xuất bản, học viên sẽ thấy các từ thuộc Tag/Chapter đang bật hiển thị.</p><button type="button" className="admin-primary-button" disabled={!preview || publishing || !(preview.items || []).some((item) => item.isValid)} onClick={publish}>{publishing ? 'Đang xuất bản…' : `Xuất bản ${(preview?.items || []).filter((item) => item.isValid).length} từ`}</button></div>
    </section>

    <section className="vocab-quick-panel">
      <div className="vocab-quick-panel__heading"><span>03</span><div><h2>Ẩn hoặc hiện với học viên</h2><p>Ẩn Tag để ẩn cả bộ; hoặc ẩn riêng từng Chapter.</p></div></div>
      {loading ? <p className="vocab-quick-muted">Đang tải danh mục…</p> : tags.length ? <div className="vocab-quick-visibility">
        {tags.map((tag) => <section className="vocab-quick-tag" key={tag._id}>
          <div className="vocab-quick-toggle-row"><div><strong>{tag.name}</strong><small>{tag.chapterCount} chapter · {tag.vocabularyCount} từ</small></div><button type="button" className={`vocab-quick-toggle ${tag.status === 'published' ? 'is-on' : ''}`} aria-pressed={tag.status === 'published'} onClick={() => toggleTag(tag)}>{tag.status === 'published' ? 'Đang hiện' : 'Đang ẩn'}</button></div>
          {tag._id === tagId && <div className="vocab-quick-chapters">{chapters.map((chapter) => <div className="vocab-quick-toggle-row" key={chapter._id}><div><strong>{chapter.title}</strong><small>{chapter.vocabularyCount} từ</small></div><button type="button" className={`vocab-quick-toggle ${chapter.status === 'published' ? 'is-on' : ''}`} aria-pressed={chapter.status === 'published'} onClick={() => toggleChapter(chapter)}>{chapter.status === 'published' ? 'Đang hiện' : 'Đang ẩn'}</button></div>)}</div>}
        </section>)}
      </div> : <p className="vocab-quick-muted">Chưa có Tag nào. Import file và tạo Tag mới để bắt đầu.</p>}
    </section>
  </main>;
}
