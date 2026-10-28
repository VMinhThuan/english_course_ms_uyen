import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { mediaApi } from '../../api/mediaApi.js';
import { part1DictationApi } from '../../api/part1DictationApi.js';
import { vocabularyDictationApi } from '../../api/vocabularyDictationApi.js';
import { hardWordsDictationApi } from '../../api/hardWordsDictationApi.js';
import { learningContentApi } from '../../api/learningContentApi.js';
import vocabularySeed from '../../data/vocabularyDictationSeed.json';
import hardWordsSeed from '../../data/hardWordsDictationSeed.json';
import roadToPart7Seed from '../../data/roadToPart7Seed.json';
import { resolveMediaUrl } from '../../utils/mediaUrl.js';
import '../../pages/Part1Dictation.css';
import './DictationAdminPage.css';

const emptyForm = () => ({ title: '', audioUrl: '', answers: [{ text: '', translation: '' }], isVisible: false });
const dictationApis = { part1: part1DictationApi, vocabulary: vocabularyDictationApi, hardWords: hardWordsDictationApi };

export default function AdminDictationPage({ kind = 'part1' }) {
  const isVocabulary = kind === 'vocabulary';
  const isHardWords = kind === 'hardWords';
  const isWordDictation = isVocabulary || isHardWords;
  const api = dictationApis[kind] || dictationApis.part1;
  const title = isHardWords ? 'Hard Words Dictation' : isVocabulary ? 'Chép chính tả từ vựng' : 'Chép chính tả Part 1';
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [audioFiles, setAudioFiles] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  const expectedAudio = useMemo(() => (isHardWords ? hardWordsSeed : vocabularySeed.filter((item) => item.audioAvailable)), [isHardWords]);
  const missingAudioNames = useMemo(() => (isVocabulary ? vocabularySeed.filter((item) => !item.audioAvailable).map((item) => item.audioFilename) : []), [isVocabulary]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.getAdminItems();
      setItems(response.data.items || []);
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || `Không thể tải danh sách ${title.toLocaleLowerCase('vi')}.` });
    } finally { setLoading(false); }
  }, [api, title]);
  useEffect(() => { load(); }, [load]);

  const updateAnswer = (index, field, value) => setForm((current) => ({
    ...current,
    answers: current.answers.map((answer, answerIndex) => answerIndex === index ? { ...answer, [field]: value } : answer),
  }));

  const edit = (item) => {
    setEditingId(item._id);
    setForm({ title: item.title, audioUrl: item.audioUrl || '', answers: item.answers.map((answer) => ({ text: answer.text, translation: answer.translation || '' })), isVisible: item.isVisible });
    setNotice({ type: '', text: '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reset = () => { setEditingId(null); setForm(emptyForm()); setNotice({ type: '', text: '' }); };

  const uploadAudio = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true); setNotice({ type: '', text: '' });
    try {
      const response = await mediaApi.uploadMedia(file, isWordDictation ? 'audio-voc' : 'audio-part1');
      if (response.data.fileType !== 'audio') throw new Error('Hãy chọn một file audio hợp lệ.');
      setForm((current) => ({ ...current, audioUrl: response.data.storageUrl || response.data.fileUrl }));
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || error.message || 'Không thể upload audio.' });
    } finally { setUploading(false); event.target.value = ''; }
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true); setNotice({ type: '', text: '' });
    const payload = { ...form, answers: form.answers.map((answer) => ({ text: answer.text, translation: answer.translation })) };
    const wasEditing = Boolean(editingId);
    try {
      if (editingId) await api.update(editingId, payload);
      else await api.create(payload);
      reset(); await load();
      setNotice({ type: 'success', text: wasEditing ? 'Đã lưu thay đổi.' : 'Đã tạo bài nghe mới.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Không thể lưu bài nghe.' });
    } finally { setSaving(false); }
  };

  const toggleVisibility = async (item) => {
    try {
      await api.setVisibility(item._id, !item.isVisible);
      await load();
    } catch (error) { setNotice({ type: 'error', text: error.response?.data?.message || 'Không thể đổi trạng thái hiển thị.' }); }
  };

  const remove = async (item) => {
    if (!window.confirm(`Xóa “${item.title}” và file audio gắn với bài này?`)) return;
    try {
      await api.delete(item._id);
      if (editingId === item._id) reset();
      await load();
      setNotice({ type: 'success', text: 'Đã xóa bài chép chính tả.' });
    } catch (error) { setNotice({ type: 'error', text: error.response?.data?.message || 'Không thể xóa bài.' }); }
  };

  const importSeed = async () => {
    const byName = new Map(audioFiles.filter((file) => file.size > 0).map((file) => [file.name, file]));
    const missing = expectedAudio.map((item) => item.audioFilename).filter((filename) => !byName.has(filename));
    if (missing.length) {
      setNotice({ type: 'error', text: `Thiếu audio: ${missing.join(', ')}. Hãy chọn thư mục audio-voc đầy đủ rồi thử lại.` });
      return;
    }

    setImporting(true); setNotice({ type: '', text: '' }); setImportProgress({ current: 0, total: expectedAudio.length });
    try {
      const audioUrls = {};
      for (const [index, seed] of expectedAudio.entries()) {
        const file = byName.get(seed.audioFilename);
        setImportProgress({ current: index + 1, total: expectedAudio.length });
        const response = await mediaApi.uploadMedia(file, 'audio-voc');
        if (response.data.fileType !== 'audio' || !response.data.storageUrl) {
          throw new Error(`Không nhận được địa chỉ Blob hợp lệ cho ${file.name}.`);
        }
        audioUrls[seed.audioFilename] = response.data.storageUrl;
      }

      if (isHardWords) {
        const itemsToImport = hardWordsSeed.map((seed) => ({
          ...seed,
          audioUrl: audioUrls[seed.audioFilename] || '',
        }));
        const response = await api.importSeed(itemsToImport);
        await load();
        const result = response.data;
        setNotice({
          type: 'success',
          text: `Đã nhập ${result.total} mục Hard Words với ${result.answers} từ và ${result.withAudio} audio.`,
        });
        return;
      }

      const vocabularyItems = vocabularySeed.map((seed) => ({
        ...seed,
        audioUrl: audioUrls[seed.audioFilename] || '',
      }));
      const response = await learningContentApi.importExcelSeed({ vocabularyItems, readings: roadToPart7Seed });
      await load();
      const result = response.data;
      setNotice({
        type: 'success',
        text: `Đã nhập ${result.vocabulary.total} nhóm từ (${result.vocabulary.withAudio} có audio, ${result.vocabulary.hiddenWithoutAudio} đang ẩn) và ${result.roadToPart7.total} bài Road to Part 7. ${missingAudioNames.length ? `Audio chưa có: ${missingAudioNames.join(', ')}.` : ''}`,
      });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || error.message || 'Không thể nhập bộ dữ liệu.' });
    } finally {
      setImporting(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  return <main className="admin-page-container part1-admin-page">
    <PageHeader
      eyebrow={isHardWords ? 'HARD WORDS · DICTATION' : isVocabulary ? 'VOCABULARY · DICTATION' : 'TOEIC · PART 1'}
      title={isHardWords ? 'Quản lý Hard Words Dictation' : isVocabulary ? 'Quản lý chép chính tả từ vựng' : 'Bài chép chính tả Part 1'}
      description={isWordDictation
        ? 'Quản lý từng nhóm audio, từ đáp án và nghĩa tiếng Việt.'
        : 'Mỗi bài gồm một audio và nhiều câu đáp án, độc lập với Course và Lesson.'}
    />
    {notice.text && <div className={`part1-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</div>}

    {isWordDictation && <section className="dictation-import-panel">
      <div>
        <p className="part1-playlist__eyebrow">NHẬP TỪ EXCEL</p>
        <h2>{isHardWords ? 'Hard Words Test 7–8' : 'Test 7–8 và Road to Part 7'}</h2>
        <p>{isHardWords
          ? 'Chọn thư mục hard-words-dictation. Hệ thống tải 16 audio vào audio-voc rồi nhập 16 mục và 160 từ từ workbook.'
          : 'Chọn thư mục audio-voc. Hệ thống tải 15 audio hợp lệ lên Blob rồi nhập 16 nhóm từ và 26 bài đọc đã đọc từ hai workbook.'}</p>
        {missingAudioNames.length > 0 && <small>Audio thiếu hoặc rỗng sẽ được giữ ẩn: {missingAudioNames.join(', ')}.</small>}
      </div>
      <label className="dictation-import-picker">
        <span>{isHardWords ? 'Chọn thư mục hard-words-dictation' : 'Chọn thư mục audio-voc'}</span>
        <input
          type="file"
          accept="audio/mpeg,.mp3"
          multiple
          webkitdirectory=""
          directory=""
          onChange={(event) => setAudioFiles(Array.from(event.target.files || []))}
          disabled={importing}
        />
        {audioFiles.length > 0 && <small>Đã chọn {audioFiles.length} file; {audioFiles.filter((file) => file.size > 0).length} file có dữ liệu.</small>}
      </label>
      <button type="button" className="ds-button ds-button--primary" onClick={importSeed} disabled={importing || audioFiles.length === 0}>
        {importing ? `Đang upload ${importProgress.current}/${importProgress.total} audio…` : isHardWords ? 'Nhập Hard Words và audio' : 'Nhập dữ liệu Excel và audio'}
      </button>
    </section>}

    <section className="part1-admin-editor"><div><p className="part1-playlist__eyebrow">{editingId ? 'CHỈNH SỬA BÀI NGHE' : 'TẠO BÀI NGHE MỚI'}</p><h2>{editingId ? 'Cập nhật audio và đáp án' : 'Một audio, nhiều đáp án cần chép'}</h2></div>
      <form onSubmit={save}>
        <label>Tên bài<input required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder={isWordDictation ? 'Ví dụ: Test 7 · Mục 1' : 'Ví dụ: Pictures at the station'} /></label>
        <label>File audio<input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/*" onChange={uploadAudio} disabled={uploading} />{uploading && <small>Đang upload audio…</small>}</label>
        {form.audioUrl && <div className="part1-admin-preview"><audio controls src={resolveMediaUrl(form.audioUrl)} /><span>Audio đã sẵn sàng</span></div>}
        <fieldset><legend>{isWordDictation ? 'Các từ đáp án' : 'Các câu đáp án'}</legend><p>Mỗi dòng tương ứng một ô nhập của học viên.</p>{form.answers.map((answer, index) => <div className="part1-admin-answer" key={index}><span>{index + 1}</span><div className="part1-admin-answer__fields"><input required value={answer.text} onChange={(event) => updateAnswer(index, 'text', event.target.value)} placeholder={isWordDictation ? `Từ đáp án ${index + 1}` : `Câu đáp án ${index + 1}`} /><input value={answer.translation} onChange={(event) => updateAnswer(index, 'translation', event.target.value)} placeholder={isWordDictation ? 'Nghĩa tiếng Việt' : 'Bản dịch tiếng Việt (không bắt buộc)'} /></div>{form.answers.length > 1 && <button type="button" aria-label={`Xóa đáp án ${index + 1}`} onClick={() => setForm((current) => ({ ...current, answers: current.answers.filter((_, answerIndex) => answerIndex !== index) }))}>Xóa</button>}</div>)}
          <button type="button" className="part1-add-answer" onClick={() => setForm((current) => ({ ...current, answers: [...current.answers, { text: '', translation: '' }] }))}>+ Thêm {isWordDictation ? 'từ' : 'câu'} đáp án</button>
        </fieldset>
        <label className="part1-visibility"><input type="checkbox" checked={form.isVisible} onChange={(event) => setForm((current) => ({ ...current, isVisible: event.target.checked }))} />Hiển thị ngay với toàn bộ học viên</label>
        <div className="part1-editor-actions"><button type="button" className="ds-button ds-button--secondary" onClick={reset}>Hủy</button><button className="ds-button ds-button--primary" type="submit" disabled={saving || uploading}>{saving ? 'Đang lưu…' : editingId ? 'Lưu thay đổi' : 'Tạo bài nghe'}</button></div>
      </form>
    </section>

    <section className="part1-admin-list"><div className="part1-list-head"><div><p className="part1-playlist__eyebrow">THƯ VIỆN</p><h2>Tất cả bài nghe</h2></div><span>{items.length} bài</span></div>
      {loading ? <div className="ds-loading-state">Đang tải danh sách…</div> : items.length === 0 ? <div className="part1-empty">Chưa có bài nghe nào. Hãy tạo bài đầu tiên ở biểu mẫu phía trên.</div> : <div className="part1-admin-items">{items.map((item) => <article key={item._id}><div><span className={`part1-status ${item.isVisible ? 'visible' : 'hidden'}`}>{item.isVisible ? 'Đang hiện' : 'Đang ẩn'}</span><h3>{item.title}</h3><p>{item.answers.length} đáp án · {item.audioUrl ? 'Có audio' : 'Chưa có audio'}</p></div><div className="part1-item-actions"><button type="button" className="ds-button ds-button--secondary" onClick={() => edit(item)}>Sửa</button><button type="button" className={item.isVisible ? 'ds-button ds-button--danger' : 'ds-button ds-button--primary'} onClick={() => toggleVisibility(item)}>{item.isVisible ? 'Ẩn với học viên' : 'Hiện với học viên'}</button><button type="button" className="ds-button ds-button--danger" onClick={() => remove(item)}>Xóa bài</button></div></article>)}</div>}
    </section>
  </main>;
}
