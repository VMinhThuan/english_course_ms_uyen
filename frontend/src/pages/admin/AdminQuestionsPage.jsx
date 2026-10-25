import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { assessmentApi } from '../../api/assessmentApi.js';
import useAuthStore from '../../store/authStore.js';
import AdminToeicPart5QuestionBank from './AdminToeicPart5QuestionBank.jsx';
import './AdminStudentsPage.css';
import './AssessmentAdmin.css';
import './AdminQuestionsPart5.css';

const types = [['single_choice', 'Một đáp án'], ['multiple_choice', 'Nhiều đáp án'], ['fill_blank', 'Điền chỗ trống'], ['typed_answer', 'Trả lời tự luận']];
const empty = { questionText: '', type: 'single_choice', options: [{ id: 'a', text: '' }, { id: 'b', text: '' }], correctAnswers: [], score: 1, explanation: '', topic: 'General', status: 'draft' };

export default function AdminQuestionsPage() {
  const user = useAuthStore((state) => state.user);
  return user?.role === 'admin' ? <AdminToeicPart5QuestionBank /> : <GenericAdminQuestionsPage />;
}

function GenericAdminQuestionsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const toeicPart = searchParams.get('toeicPart') || '';
  const statusFilter = searchParams.get('status') || '';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        limit: 100,
        ...(search ? { search } : {}),
        ...(type ? { type } : {}),
        ...(toeicPart ? { toeicPart } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      };
      const response = await assessmentApi.getAdminQuestions(params);
      setItems(response.data.questions || []);
    } catch {
      setError('Không thể tải ngân hàng câu hỏi.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, toeicPart, type]);

  useEffect(() => {
    const id = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(id);
  }, [load, search]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const open = (question) => {
    setForm(question ? { ...empty, ...question, options: question.options || [], correctAnswers: question.correctAnswers || [] } : empty);
    setModal(question ? { type: 'edit', item: question } : { type: 'create' });
  };
  const updateOption = (index, key, value) => setForm((current) => ({
    ...current,
    options: current.options.map((option, itemIndex) => itemIndex === index ? { ...option, [key]: value } : option),
  }));
  const toggleAnswer = (id) => setForm((current) => ({
    ...current,
    correctAnswers: current.type === 'single_choice'
      ? [id]
      : current.correctAnswers.includes(id) ? current.correctAnswers.filter((answer) => answer !== id) : [...current.correctAnswers, id],
  }));

  const save = async (event) => {
    event.preventDefault();
    const choice = ['single_choice', 'multiple_choice'].includes(form.type);
    const data = {
      ...form,
      options: choice ? form.options : [],
      correctAnswers: choice ? form.correctAnswers : form.correctAnswers.filter(Boolean),
      score: Number(form.score),
    };
    if (!data.questionText.trim() || !data.correctAnswers.length || (choice && data.options.some((option) => !option.text.trim()))) {
      setModal((current) => ({ ...current, error: 'Vui lòng nhập đầy đủ nội dung và đáp án đúng.' }));
      return;
    }
    setSaving(true);
    try {
      const response = modal.type === 'edit'
        ? await assessmentApi.updateQuestion(modal.item._id, data)
        : await assessmentApi.createQuestion(data);
      const question = response.data.question;
      setItems((current) => modal.type === 'edit' ? current.map((item) => item._id === question._id ? question : item) : [question, ...current]);
      setToast(modal.type === 'edit' ? 'Đã cập nhật câu hỏi.' : 'Đã tạo câu hỏi.');
      setModal(null);
    } catch (saveError) {
      setModal((current) => ({ ...current, error: saveError.response?.data?.message || 'Không thể lưu câu hỏi.' }));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await assessmentApi.deleteQuestion(modal.item._id);
      setItems((current) => current.filter((item) => item._id !== modal.item._id));
      setToast('Đã xóa câu hỏi.');
      setModal(null);
    } catch (deleteError) {
      setModal((current) => ({ ...current, error: deleteError.response?.data?.message || 'Không thể xóa câu hỏi.' }));
    }
  };

  const clearBankFilter = () => setSearchParams({});

  return (
    <div className="admin-page-container">
      <header>
        <p className="admin-eyebrow">Question bank</p>
        <h1 className="admin-page-title">Ngân hàng câu hỏi</h1>
        <p className="admin-page-sub">Tạo câu hỏi cho bài tập và bài kiểm tra.</p>
      </header>
      {(toeicPart || statusFilter) && (
        <div className="admin-qb-filter-note" role="status">
          Đang lọc{toeicPart ? ` TOEIC Part ${toeicPart}` : ''}{statusFilter ? ` · ${statusFilter}` : ''}
          <button type="button" className="admin-quiet-button" onClick={clearBankFilter}>Xóa bộ lọc</button>
        </div>
      )}
      <div className="assessment-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm nội dung câu hỏi..." aria-label="Tìm câu hỏi" />
        <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Lọc dạng câu hỏi">
          <option value="">Tất cả dạng câu hỏi</option>
          {types.map((item) => <option key={item[0]} value={item[0]}>{item[1]}</option>)}
        </select>
        {user?.role === 'admin' && <Link className="admin-quiet-button admin-qb-import-link" to="/admin/questions/import-part5">Import Excel Part 5</Link>}
        <button className="admin-primary-button" onClick={() => open()}>Thêm câu hỏi</button>
      </div>
      {error && <div className="admin-error" role="alert">{error}<button onClick={load}>Thử lại</button></div>}
      <div className="admin-table-container">
        {loading ? <div className="admin-table-skeleton" role="status" aria-label="Đang tải câu hỏi"><i /><i /><i /></div> : (
          <table className="admin-data-table">
            <thead><tr><th>Câu hỏi</th><th>Dạng</th><th>Điểm</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>{items.length ? items.map((question) => (
              <tr key={question._id}>
                <td><b>{question.questionText}</b><small className="assessment-table-sub">{question.topic}</small></td>
                <td>{types.find((item) => item[0] === question.type)?.[1]}</td>
                <td>{question.score}</td>
                <td><span className={`status-badge ${question.status === 'published' ? 'active' : 'pending'}`}>{question.status}</span></td>
                <td className="student-actions"><button className="admin-quiet-button" onClick={() => open(question)}>Sửa</button><button className="admin-danger-button" onClick={() => setModal({ type: 'delete', item: question })}>Xóa</button></td>
              </tr>
            )) : <tr><td colSpan="5"><div className="admin-empty">Chưa có câu hỏi phù hợp.</div></td></tr>}</tbody>
          </table>
        )}
      </div>
      {modal?.type === 'delete' && <div className="admin-modal-backdrop"><section className="admin-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-question-title"><h2 id="delete-question-title">Xóa câu hỏi?</h2><p>Bạn có chắc muốn xóa câu hỏi này?</p>{modal.error && <div className="admin-error">{modal.error}</div>}<div className="modal-actions"><button className="admin-quiet-button" onClick={() => setModal(null)}>Hủy</button><button className="admin-danger-button" onClick={remove}>Xóa</button></div></section></div>}
      {modal && ['create', 'edit'].includes(modal.type) && (
        <div className="admin-modal-backdrop">
          <form className="admin-confirm-modal assessment-form" onSubmit={save} aria-label="Biểu mẫu câu hỏi">
            <button type="button" className="modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            <h2>{modal.type === 'edit' ? 'Chỉnh sửa câu hỏi' : 'Thêm câu hỏi'}</h2>
            <label>Nội dung câu hỏi<textarea value={form.questionText} onChange={(event) => setForm((current) => ({ ...current, questionText: event.target.value }))} required /></label>
            <div className="assessment-form-grid">
              <label>Dạng câu hỏi<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value, options: ['single_choice', 'multiple_choice'].includes(event.target.value) ? current.options.length ? current.options : empty.options : [], correctAnswers: [] }))}>{types.map((item) => <option key={item[0]} value={item[0]}>{item[1]}</option>)}</select></label>
              <label>Điểm<input type="number" min="0.1" step="0.1" value={form.score} onChange={(event) => setForm((current) => ({ ...current, score: event.target.value }))} /></label>
              <label>Chủ đề<input value={form.topic} onChange={(event) => setForm((current) => ({ ...current, topic: event.target.value }))} /></label>
              <label>Trạng thái<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option value="draft">Bản nháp</option><option value="published">Đã xuất bản</option><option value="hidden">Đang ẩn</option></select></label>
            </div>
            {['single_choice', 'multiple_choice'].includes(form.type) ? (
              <section className="option-builder"><h3>Đáp án</h3>{form.options.map((option, index) => <div key={option.id} className="option-edit"><input type={form.type === 'single_choice' ? 'radio' : 'checkbox'} checked={form.correctAnswers.includes(option.id)} onChange={() => toggleAnswer(option.id)} aria-label={`Đáp án đúng ${option.id}`} /><input value={option.text} onChange={(event) => updateOption(index, 'text', event.target.value)} placeholder={`Lựa chọn ${index + 1}`} />{form.options.length > 2 && <button type="button" onClick={() => setForm((current) => ({ ...current, options: current.options.filter((item) => item.id !== option.id), correctAnswers: current.correctAnswers.filter((answer) => answer !== option.id) }))}>×</button>}</div>)}<button type="button" className="admin-quiet-button" onClick={() => setForm((current) => ({ ...current, options: [...current.options, { id: `opt_${Date.now()}`, text: '' }] }))}>+ Thêm lựa chọn</button></section>
            ) : <label>Đáp án chấp nhận (mỗi dòng một đáp án)<textarea value={form.correctAnswers.join('\n')} onChange={(event) => setForm((current) => ({ ...current, correctAnswers: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean) }))} /><small>Typed answer hiện được backend tự chấm chính xác theo đáp án tham chiếu.</small></label>}
            <label>Giải thích (chỉ hiện sau nộp nếu bài kiểm tra cho phép)<textarea value={form.explanation} onChange={(event) => setForm((current) => ({ ...current, explanation: event.target.value }))} /></label>
            {modal.error && <div className="admin-error" role="alert">{modal.error}</div>}
            <div className="modal-actions"><button type="button" className="admin-quiet-button" onClick={() => setModal(null)}>Hủy</button><button className="admin-primary-button" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu câu hỏi'}</button></div>
          </form>
        </div>
      )}
      {toast && <div className="admin-toast" role="status">{toast}</div>}
    </div>
  );
}
