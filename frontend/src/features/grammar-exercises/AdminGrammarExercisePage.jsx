import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { grammarExerciseApi } from '../../api/grammarExerciseApi.js';
import { GRAMMAR_EXERCISES } from './grammarExerciseConfig.js';
import './adminGrammarExercise.css';

const createForm = (number = 1) => ({
  number,
  prompt: '',
  tense: '',
  sentenceForm: 'Chủ động',
  answer: '',
  translation: '',
  isVisible: false,
});

const nextNumber = (items) => items.reduce((max, item) => Math.max(max, Number(item.number) || 0), 0) + 1;

const toForm = (item) => ({
  number: item.number,
  prompt: item.prompt || '',
  tense: item.tense || '',
  sentenceForm: item.sentenceForm || 'Chủ động',
  answer: item.answer || '',
  translation: item.translation || '',
  isVisible: Boolean(item.isVisible),
});

export default function AdminGrammarExercisePage({ exerciseType }) {
  const config = GRAMMAR_EXERCISES[exerciseType];
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(() => createForm());
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState({ type: '', text: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await grammarExerciseApi.getAdminQuestions(exerciseType);
      const nextItems = response.data?.items || [];
      setItems(nextItems);
      return nextItems;
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Không thể tải danh sách câu hỏi.' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [exerciseType]);

  useEffect(() => {
    let active = true;
    setEditingId(null);
    setQuery('');
    setNotice({ type: '', text: '' });
    setForm(createForm());
    load().then((nextItems) => {
      if (active && nextItems) setForm(createForm(nextNumber(nextItems)));
    });
    return () => { active = false; };
  }, [exerciseType, load]);

  const visibleCount = items.filter((item) => item.isVisible).length;
  const filteredItems = useMemo(() => {
    const value = query.trim().toLocaleLowerCase('vi');
    if (!value) return items;
    return items.filter((item) => [
      String(item.number), item.prompt, item.tense, item.sentenceForm, item.answer, item.translation,
    ].some((text) => String(text || '').toLocaleLowerCase('vi').includes(value)));
  }, [items, query]);

  if (!config) return null;

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const resetForm = (sourceItems = items) => {
    setEditingId(null);
    setForm(createForm(nextNumber(sourceItems)));
    setNotice({ type: '', text: '' });
  };

  const edit = (item) => {
    setEditingId(item._id);
    setForm(toForm(item));
    setNotice({ type: '', text: '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setNotice({ type: '', text: '' });
    const payload = { ...form, exerciseType, number: Number(form.number) };
    const wasEditing = Boolean(editingId);
    try {
      if (wasEditing) await grammarExerciseApi.updateQuestion(editingId, payload);
      else await grammarExerciseApi.createQuestion(payload);
      const updatedItems = await load();
      setEditingId(null);
      setForm(createForm(nextNumber(updatedItems || items)));
      setNotice({ type: 'success', text: wasEditing ? 'Đã lưu thay đổi câu hỏi.' : 'Đã tạo câu hỏi mới.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Không thể lưu câu hỏi.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = async (item) => {
    setBusyId(item._id);
    setNotice({ type: '', text: '' });
    try {
      await grammarExerciseApi.setVisibility(item._id, !item.isVisible);
      await load();
      setNotice({ type: 'success', text: `Đã ${item.isVisible ? 'ẩn' : 'hiện'} câu ${item.number} với học viên.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Không thể cập nhật trạng thái câu hỏi.' });
    } finally {
      setBusyId('');
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Xóa câu ${item.number} khỏi “${config.title}”?`)) return;
    setBusyId(item._id);
    setNotice({ type: '', text: '' });
    try {
      await grammarExerciseApi.deleteQuestion(item._id);
      const updatedItems = await load();
      if (editingId === item._id) resetForm(updatedItems || items.filter(({ _id }) => _id !== item._id));
      setNotice({ type: 'success', text: `Đã xóa câu ${item.number}.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Không thể xóa câu hỏi.' });
    } finally {
      setBusyId('');
    }
  };

  return (
    <main className="admin-grammar-exercise-page">
      <PageHeader
        eyebrow="QUẢN LÝ BÀI TẬP NGỮ PHÁP"
        title={config.title}
        description="Thêm, sửa, xóa câu hỏi và chọn câu sẽ hiển thị với học viên. Dạng bài này không dùng audio."
      />

      {notice.text && <div className={`admin-grammar-notice is-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</div>}

      <section className="admin-grammar-summary" aria-label="Tổng quan bài tập">
        <article><span>Tổng số câu</span><strong>{items.length}</strong></article>
        <article><span>Đang hiển thị</span><strong>{visibleCount}</strong></article>
        <article><span>Đang ẩn</span><strong>{items.length - visibleCount}</strong></article>
      </section>

      <section className="admin-grammar-editor">
        <header>
          <p>{editingId ? 'CHỈNH SỬA CÂU HỎI' : 'TẠO CÂU HỎI MỚI'}</p>
          <h2>{editingId ? `Cập nhật câu ${form.number}` : `Thêm câu ${form.number}`}</h2>
        </header>
        <form onSubmit={save}>
          <div className="admin-grammar-form-row">
            <label>Số câu
              <input type="number" min="1" max="9999" required disabled={Boolean(editingId)} value={form.number} onChange={(event) => updateField('number', event.target.value)} />
            </label>
          </div>

          <label>Câu cần làm
            <textarea required maxLength="2000" rows="3" value={form.prompt} onChange={(event) => updateField('prompt', event.target.value)} placeholder="Nhập câu hỏi" />
          </label>

          {exerciseType === 'tense-classification' ? (
            <div className="admin-grammar-form-row">
              <label>Thì / động từ khiếm khuyết
                <input required maxLength="120" value={form.tense} onChange={(event) => updateField('tense', event.target.value)} placeholder="Ví dụ: Hiện tại đơn" />
              </label>
              <label>Dạng câu
                <select value={form.sentenceForm} onChange={(event) => updateField('sentenceForm', event.target.value)}>
                  <option value="Chủ động">Chủ động</option>
                  <option value="Bị động">Bị động</option>
                </select>
              </label>
            </div>
          ) : (
            <>
              <label>Đáp án câu bị động
                <textarea required maxLength="2000" rows="3" value={form.answer} onChange={(event) => updateField('answer', event.target.value)} placeholder="Nhập câu bị động đúng" />
              </label>
              <label>Dịch nghĩa
                <textarea required maxLength="2000" rows="3" value={form.translation} onChange={(event) => updateField('translation', event.target.value)} placeholder="Nhập bản dịch tiếng Việt" />
              </label>
            </>
          )}

          <label className="admin-grammar-visibility"><input type="checkbox" checked={form.isVisible} onChange={(event) => updateField('isVisible', event.target.checked)} />Hiển thị ngay với học viên</label>
          <div className="admin-grammar-form-actions">
            {editingId && <button type="button" className="ds-button ds-button--secondary" onClick={() => resetForm()}>Hủy chỉnh sửa</button>}
            <button type="submit" className="ds-button ds-button--primary" disabled={saving}>{saving ? 'Đang lưu…' : editingId ? 'Lưu thay đổi' : 'Tạo câu hỏi'}</button>
          </div>
        </form>
      </section>

      <section className="admin-grammar-list">
        <div className="admin-grammar-list__heading">
          <div><p>DANH SÁCH CÂU HỎI</p><h2>Câu hỏi trong bài</h2></div>
          <span>{filteredItems.length}/{items.length} câu</span>
        </div>
        <label className="admin-grammar-search">Tìm câu hỏi
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập số câu, nội dung hoặc đáp án…" />
        </label>

        {loading ? <div className="admin-grammar-state" role="status">Đang tải câu hỏi…</div>
          : filteredItems.length === 0 ? <div className="admin-grammar-state">{items.length ? 'Không tìm thấy câu hỏi phù hợp.' : 'Chưa có câu hỏi. Hãy tạo câu đầu tiên ở biểu mẫu phía trên.'}</div>
            : <div className="admin-grammar-questions">
              {filteredItems.map((item) => (
                <details className="admin-grammar-question" key={item._id}>
                  <summary>
                    <strong>Câu {item.number}</strong>
                    <span className={`admin-grammar-status ${item.isVisible ? 'is-visible' : 'is-hidden'}`}>{item.isVisible ? 'Đang hiện' : 'Đang ẩn'}</span>
                    <small>{exerciseType === 'tense-classification' ? `${item.tense} · ${item.sentenceForm}` : 'Có đáp án và bản dịch'}</small>
                  </summary>
                  <div className="admin-grammar-question__body">
                    <p>{item.prompt}</p>
                    {exerciseType === 'tense-classification' ? (
                      <div className="admin-grammar-answer"><strong>Đáp án đầy đủ</strong><span>{item.answer}</span><small>Thì: {item.tense} · Dạng câu: {item.sentenceForm}</small></div>
                    ) : (
                      <>
                        <div className="admin-grammar-answer"><strong>Đáp án câu bị động</strong><span>{item.answer}</span></div>
                        <div className="admin-grammar-answer"><strong>Dịch nghĩa</strong><span>{item.translation}</span></div>
                      </>
                    )}
                    <div className="admin-grammar-item-actions">
                      <button type="button" className="ds-button ds-button--secondary" onClick={() => edit(item)}>Sửa</button>
                      <button type="button" className={item.isVisible ? 'ds-button ds-button--danger' : 'ds-button ds-button--primary'} disabled={busyId === item._id} onClick={() => toggleVisibility(item)}>
                        {busyId === item._id ? 'Đang cập nhật…' : item.isVisible ? 'Ẩn với học viên' : 'Hiện với học viên'}
                      </button>
                      <button type="button" className="ds-button ds-button--danger" disabled={busyId === item._id} onClick={() => remove(item)}>Xóa câu</button>
                    </div>
                  </div>
                </details>
              ))}
            </div>}
      </section>
    </main>
  );
}
