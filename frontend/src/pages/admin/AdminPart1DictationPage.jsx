import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { mediaApi } from '../../api/mediaApi.js';
import { part1DictationApi } from '../../api/part1DictationApi.js';
import { resolveMediaUrl } from '../../utils/mediaUrl.js';
import '../Part1Dictation.css';

const emptyForm = () => ({ title: '', audioUrl: '', answers: [{ text: '', translation: '' }], isVisible: false });

export default function AdminPart1DictationPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await part1DictationApi.getAdminItems();
      setItems(response.data.items || []);
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Không thể tải danh sách Part 1.' });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const updateAnswer = (index, field, value) => setForm((current) => ({ ...current, answers: current.answers.map((answer, answerIndex) => answerIndex === index ? { ...answer, [field]: value } : answer) }));
  const edit = (item) => {
    setEditingId(item._id);
    setForm({ title: item.title, audioUrl: item.audioUrl, answers: item.answers.map((answer) => ({ text: answer.text, translation: answer.translation || '' })), isVisible: item.isVisible });
    setNotice({ type: '', text: '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const reset = () => { setEditingId(null); setForm(emptyForm()); setNotice({ type: '', text: '' }); };

  const uploadAudio = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true); setNotice({ type: '', text: '' });
    try {
      const response = await mediaApi.uploadMedia(file, 'audio-part1');
      if (response.data.fileType !== 'audio') throw new Error('Hãy chọn một file audio hợp lệ.');
      setForm((current) => ({ ...current, audioUrl: response.data.fileUrl }));
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || error.message || 'Không thể upload audio.' });
    } finally { setUploading(false); }
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true); setNotice({ type: '', text: '' });
    const payload = { ...form, answers: form.answers.map((answer) => ({ text: answer.text, translation: answer.translation })) };
    const wasEditing = Boolean(editingId);
    try {
      if (editingId) await part1DictationApi.update(editingId, payload);
      else await part1DictationApi.create(payload);
      reset(); await load();
      setNotice({ type: 'success', text: wasEditing ? 'Đã lưu thay đổi.' : 'Đã tạo bài nghe mới.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Không thể lưu bài nghe.' });
    } finally { setSaving(false); }
  };

  const toggleVisibility = async (item) => {
    try {
      await part1DictationApi.setVisibility(item._id, !item.isVisible);
      await load();
    } catch (error) { setNotice({ type: 'error', text: error.response?.data?.message || 'Không thể đổi trạng thái hiển thị.' }); }
  };

  return <main className="admin-page-container part1-admin-page">
    <PageHeader eyebrow="TOEIC · Part 1" title="Bài chép chính tả" description="Mỗi bài gồm một audio và nhiều câu đáp án, hoàn toàn độc lập với Course và Lesson." />
    {notice.text && <div className={`part1-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</div>}
    <section className="part1-admin-editor"><div><p className="part1-playlist__eyebrow">{editingId ? 'CHỈNH SỬA BÀI NGHE' : 'TẠO BÀI NGHE MỚI'}</p><h2>{editingId ? 'Cập nhật audio và đáp án' : 'Một audio, nhiều câu cần chép'}</h2></div>
      <form onSubmit={save}>
        <label>Tên bài<input required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ví dụ: Pictures at the station" /></label>
        <label>File audio<input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/*" onChange={uploadAudio} disabled={uploading} />{uploading && <small>Đang upload audio…</small>}</label>
        {form.audioUrl && <div className="part1-admin-preview"><audio controls src={resolveMediaUrl(form.audioUrl)} /><span>Audio đã sẵn sàng</span></div>}
        <fieldset><legend>Các câu đáp án</legend><p>Mỗi dòng tương ứng một ô nhập của học viên.</p>{form.answers.map((answer, index) => <div className="part1-admin-answer" key={index}><span>{index + 1}</span><div className="part1-admin-answer__fields"><input required value={answer.text} onChange={(event) => updateAnswer(index, 'text', event.target.value)} placeholder={`Câu đáp án ${index + 1}`} /><input value={answer.translation} onChange={(event) => updateAnswer(index, 'translation', event.target.value)} placeholder="Bản dịch tiếng Việt (không bắt buộc)" /></div>{form.answers.length > 1 && <button type="button" onClick={() => setForm((current) => ({ ...current, answers: current.answers.filter((_, answerIndex) => answerIndex !== index) }))}>Xóa</button>}</div>)}
          <button type="button" className="part1-add-answer" onClick={() => setForm((current) => ({ ...current, answers: [...current.answers, { text: '', translation: '' }] }))}>+ Thêm câu đáp án</button>
        </fieldset>
        <label className="part1-visibility"><input type="checkbox" checked={form.isVisible} onChange={(event) => setForm((current) => ({ ...current, isVisible: event.target.checked }))} />Hiển thị ngay với toàn bộ học viên</label>
        <div className="part1-editor-actions"><button type="button" className="ds-button ds-button--secondary" onClick={reset}>Hủy</button><button className="ds-button ds-button--primary" type="submit" disabled={saving || uploading}>{saving ? 'Đang lưu…' : editingId ? 'Lưu thay đổi' : 'Tạo bài nghe'}</button></div>
      </form>
    </section>
    <section className="part1-admin-list"><div className="part1-list-head"><div><p className="part1-playlist__eyebrow">THƯ VIỆN PART 1</p><h2>Tất cả bài nghe</h2></div><span>{items.length} bài</span></div>
      {loading ? <div className="ds-loading-state">Đang tải danh sách…</div> : items.length === 0 ? <div className="part1-empty">Chưa có bài nghe nào. Hãy tạo bài đầu tiên ở biểu mẫu phía trên.</div> : <div className="part1-admin-items">{items.map((item) => <article key={item._id}><div><span className={`part1-status ${item.isVisible ? 'visible' : 'hidden'}`}>{item.isVisible ? 'Đang hiện' : 'Đang ẩn'}</span><h3>{item.title}</h3><p>{item.answers.length} câu đáp án · {item.createdBy?.fullName || item.createdBy?.email || 'Admin'}</p></div><div className="part1-item-actions"><button type="button" className="ds-button ds-button--secondary" onClick={() => edit(item)}>Sửa</button><button type="button" className={item.isVisible ? 'ds-button ds-button--danger' : 'ds-button ds-button--primary'} onClick={() => toggleVisibility(item)}>{item.isVisible ? 'Ẩn với học viên' : 'Hiện với học viên'}</button></div></article>)}</div>}
    </section>
  </main>;
}
