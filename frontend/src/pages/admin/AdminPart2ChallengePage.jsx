import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { adminPart2ChallengeApi } from '../../api/adminPart2ChallengeApi.js';
import { mediaApi } from '../../api/mediaApi.js';
import { resolveMediaUrl } from '../../utils/mediaUrl.js';
import './AdminPart2ChallengePage.css';

const createEmptyForm = (number) => ({
  number,
  questionText: '',
  choices: { A: '', B: '', C: '' },
  correctAnswer: 'A',
  script: '',
  translation: '',
  audioFilename: '',
  audioUrl: '',
  isVisible: false,
});

const getNextNumber = (items) => (items.reduce((maximum, item) => Math.max(maximum, Number(item.number) || 0), 0) || 0) + 1;

const toForm = (item) => ({
  number: item.number,
  questionText: item.questionText || '',
  choices: Object.fromEntries(['A', 'B', 'C'].map((letter) => [
    letter,
    item.choices?.find((choice) => choice.letter === letter)?.text || '',
  ])),
  correctAnswer: item.correctAnswer || 'A',
  script: item.script || '',
  translation: item.translation || '',
  audioFilename: item.audioFilename || '',
  audioUrl: item.audioUrl || '',
  isVisible: Boolean(item.isVisible),
});

export default function AdminPart2ChallengePage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(() => createEmptyForm(1));
  const [editingNumber, setEditingNumber] = useState(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyNumber, setBusyNumber] = useState(null);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const initialFormLoaded = useRef(false);
  const formTouched = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminPart2ChallengeApi.getQuestions();
      const nextItems = response.data?.items || [];
      setItems(nextItems);
      if (!initialFormLoaded.current) {
        initialFormLoaded.current = true;
        if (!formTouched.current) setForm(createEmptyForm(getNextNumber(nextItems)));
      }
      return nextItems;
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Không thể tải danh sách Part 2 Challenge.' });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visibleCount = items.filter((item) => item.isVisible).length;
  const hiddenCount = items.length - visibleCount;
  const filteredItems = useMemo(() => {
    const value = query.trim().toLocaleLowerCase('vi');
    if (!value) return items;
    return items.filter((item) => [
      String(item.number), item.questionText, item.script, item.translation,
      item.correctAnswer, item.audioFilename,
      ...(item.choices || []).map((choice) => `${choice.letter} ${choice.text}`),
    ].some((text) => String(text || '').toLocaleLowerCase('vi').includes(value)));
  }, [items, query]);

  const updateField = (field, value) => {
    formTouched.current = true;
    setForm((current) => ({ ...current, [field]: value }));
  };
  const updateChoice = (letter, value) => {
    formTouched.current = true;
    setForm((current) => ({ ...current, choices: { ...current.choices, [letter]: value } }));
  };

  const resetForm = (sourceItems = items) => {
    setEditingNumber(null);
    setForm(createEmptyForm(getNextNumber(sourceItems)));
    formTouched.current = false;
    setNotice({ type: '', text: '' });
  };

  const edit = (item) => {
    setEditingNumber(item.number);
    setForm(toForm(item));
    setNotice({ type: '', text: '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const uploadAudio = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setNotice({ type: '', text: '' });
    try {
      const response = await mediaApi.uploadMedia(file, 'audio-part2-challenge');
      if (response.data.fileType !== 'audio' || !response.data.storageUrl) {
        throw new Error('Không nhận được địa chỉ Blob hợp lệ cho file audio.');
      }
      setForm((current) => ({
        ...current,
        audioUrl: response.data.storageUrl,
        audioFilename: response.data.originalName || file.name,
      }));
      formTouched.current = true;
      setNotice({ type: 'success', text: 'Đã upload audio. Lưu biểu mẫu để gắn file vào câu hỏi.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || error.message || 'Không thể upload audio.' });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice({ type: '', text: '' });
    const payload = {
      ...form,
      number: Number(form.number),
      choices: ['A', 'B', 'C'].map((letter) => ({ letter, text: form.choices[letter] })),
    };
    const wasEditing = editingNumber !== null;
    try {
      if (wasEditing) await adminPart2ChallengeApi.update(editingNumber, payload);
      else await adminPart2ChallengeApi.create(payload);
      const nextItems = await load();
      setEditingNumber(null);
      setForm(createEmptyForm(getNextNumber(nextItems || items)));
      formTouched.current = false;
      setNotice({ type: 'success', text: wasEditing ? 'Đã lưu thay đổi câu hỏi.' : 'Đã tạo câu hỏi Part 2 mới.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Không thể lưu câu hỏi.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = async (item) => {
    setBusyNumber(item.number);
    setNotice({ type: '', text: '' });
    try {
      await adminPart2ChallengeApi.setVisibility(item.number, !item.isVisible);
      await load();
      setNotice({ type: 'success', text: `Đã ${item.isVisible ? 'ẩn' : 'hiện'} câu số ${item.number} với học viên.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Không thể đổi trạng thái câu hỏi.' });
    } finally {
      setBusyNumber(null);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Xóa câu số ${item.number} khỏi Part 2 Challenge? File audio trên Blob sẽ được giữ lại.`)) return;
    setBusyNumber(item.number);
    setNotice({ type: '', text: '' });
    try {
      await adminPart2ChallengeApi.delete(item.number);
      const nextItems = await load();
      if (editingNumber === item.number) resetForm(nextItems || items.filter(({ number }) => number !== item.number));
      setNotice({ type: 'success', text: `Đã xóa câu số ${item.number}.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Không thể xóa câu hỏi.' });
    } finally {
      setBusyNumber(null);
    }
  };

  return (
    <main className="admin-part2-challenge-page part1-admin-page">
      <PageHeader
        eyebrow="TOEIC · PART 2"
        title="Part 2 Challange"
        description="Tạo và chỉnh sửa câu hỏi, quản lý audio, script, bản dịch và trạng thái hiển thị với học viên."
      />

      {notice.text && <div className={`admin-part2-notice is-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</div>}

      <section className="admin-part2-summary" aria-label="Tổng quan Part 2 Challenge">
        <article><span>Tổng số câu</span><strong>{items.length}</strong></article>
        <article><span>Đang hiển thị</span><strong>{visibleCount}</strong></article>
        <article><span>Đang ẩn</span><strong>{hiddenCount}</strong></article>
      </section>

      <section className="part1-admin-editor admin-part2-editor">
        <div>
          <p className="part1-playlist__eyebrow">{editingNumber !== null ? 'CHỈNH SỬA CÂU HỎI' : 'TẠO CÂU HỎI MỚI'}</p>
          <h2>{editingNumber !== null ? `Cập nhật câu số ${editingNumber}` : 'Thêm câu Part 2 Challenge'}</h2>
        </div>
        <form onSubmit={save}>
          <div className="admin-part2-form-row">
            <label>Số câu
              <input type="number" min="1" max="9999" required value={form.number} disabled={editingNumber !== null} onChange={(event) => updateField('number', event.target.value)} />
            </label>
            <label>Đáp án đúng
              <select required value={form.correctAnswer} onChange={(event) => updateField('correctAnswer', event.target.value)}>
                {['A', 'B', 'C'].map((letter) => <option key={letter} value={letter}>{letter}</option>)}
              </select>
            </label>
          </div>

          <label>Nội dung câu hỏi
            <textarea required maxLength="1000" rows="2" value={form.questionText} onChange={(event) => updateField('questionText', event.target.value)} placeholder="Nhập nội dung hoặc hướng dẫn cho câu hỏi" />
          </label>

          <fieldset className="admin-part2-choice-fields">
            <legend>Các lựa chọn</legend>
            {['A', 'B', 'C'].map((letter) => (
              <label key={letter}><span>{letter}</span>
                <input required maxLength="1000" value={form.choices[letter]} onChange={(event) => updateChoice(letter, event.target.value)} placeholder={`Nội dung đáp án ${letter}`} />
              </label>
            ))}
          </fieldset>

          <label>File audio
            <input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/*" onChange={uploadAudio} disabled={uploading} />
            <small>{form.audioFilename ? `Đang gắn: ${form.audioFilename}` : 'Chưa có audio. Có thể upload MP3, M4A hoặc WAV.'}</small>
          </label>
          {form.audioUrl && <div className="part1-admin-preview"><audio controls preload="none" src={resolveMediaUrl(form.audioUrl)}>Trình duyệt không hỗ trợ phát audio.</audio><span>Audio hiện tại</span></div>}

          <label>Script
            <textarea required maxLength="4000" rows="3" value={form.script} onChange={(event) => updateField('script', event.target.value)} placeholder="Nội dung script hiển thị khi học viên xem đáp án" />
          </label>
          <label>Dịch nghĩa
            <textarea required maxLength="4000" rows="3" value={form.translation} onChange={(event) => updateField('translation', event.target.value)} placeholder="Bản dịch tiếng Việt" />
          </label>

          <label className="part1-visibility"><input type="checkbox" checked={form.isVisible} onChange={(event) => updateField('isVisible', event.target.checked)} />Hiển thị ngay với học viên</label>
          <div className="part1-editor-actions">
            {editingNumber !== null && <button type="button" className="ds-button ds-button--secondary" onClick={() => resetForm()}>Hủy chỉnh sửa</button>}
            <button className="ds-button ds-button--primary" type="submit" disabled={saving || uploading}>{saving ? 'Đang lưu…' : editingNumber !== null ? 'Lưu thay đổi' : 'Tạo câu hỏi'}</button>
          </div>
        </form>
      </section>

      <section className="admin-part2-list">
        <div className="admin-part2-list__header">
          <div><p>THƯ VIỆN PART 2</p><h2>Danh sách câu hỏi</h2></div>
          <span>{filteredItems.length}/{items.length} câu</span>
        </div>
        <label className="admin-part2-search">
          <span>Tìm câu hỏi</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập số câu, đáp án hoặc nội dung…" />
        </label>

        {loading ? <div className="admin-part2-state">Đang tải danh sách…</div>
          : filteredItems.length === 0 ? <div className="admin-part2-state">{items.length ? 'Không tìm thấy câu hỏi phù hợp.' : 'Chưa có câu hỏi. Hãy tạo câu đầu tiên ở biểu mẫu phía trên.'}</div>
            : <div className="admin-part2-questions">
              {filteredItems.map((item) => (
                <details className="admin-part2-question" key={item.number}>
                  <summary>
                    <strong>Câu số {item.number}</strong>
                    <span className={`admin-part2-status ${item.isVisible ? 'is-visible' : 'is-hidden'}`}>{item.isVisible ? 'Đang hiện' : 'Đang ẩn'}</span>
                    <small>Đáp án {item.correctAnswer} · {item.audioUrl ? 'Có audio' : 'Thiếu audio'}</small>
                  </summary>
                  <div className="admin-part2-question__body">
                    {item.audioUrl ? <audio controls preload="none" src={resolveMediaUrl(item.audioUrl)}>Trình duyệt không hỗ trợ phát audio.</audio>
                      : <p className="admin-part2-audio-missing">Chưa có đường dẫn audio.</p>}
                    <p className="admin-part2-question__prompt">{item.questionText}</p>
                    <ol className="admin-part2-choices" type="A">
                      {(item.choices || []).map((choice) => (
                        <li className={choice.letter === item.correctAnswer ? 'is-correct' : ''} key={choice.letter}><strong>{choice.letter}.</strong> {choice.text}</li>
                      ))}
                    </ol>
                    <div className="admin-part2-script"><strong>Script</strong><p>{item.script}</p></div>
                    <div className="admin-part2-script"><strong>Dịch nghĩa</strong><p>{item.translation}</p></div>
                    <div className="part1-item-actions admin-part2-item-actions">
                      <button type="button" className="ds-button ds-button--secondary" onClick={() => edit(item)}>Sửa</button>
                      <button type="button" className={item.isVisible ? 'ds-button ds-button--danger' : 'ds-button ds-button--primary'} disabled={busyNumber === item.number} onClick={() => toggleVisibility(item)}>{busyNumber === item.number ? 'Đang cập nhật…' : item.isVisible ? 'Ẩn với học viên' : 'Hiện với học viên'}</button>
                      <button type="button" className="ds-button ds-button--danger" disabled={busyNumber === item.number} onClick={() => remove(item)}>Xóa câu</button>
                    </div>
                  </div>
                </details>
              ))}
            </div>}
      </section>
    </main>
  );
}
