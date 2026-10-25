import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { assessmentApi } from '../../api/assessmentApi.js';
import {
  getPart5CompletenessIssues,
  mapPart5ApiValidationErrors,
  normalizePart5QuestionForm,
  validatePart5QuestionForm,
} from './toeicPart5QuestionBankUtils.js';

const PAGE_SIZE = 20;
const statusOptions = [['', 'Tất cả trạng thái'], ['draft', 'Bản nháp'], ['published', 'Đã xuất bản'], ['hidden', 'Đang ẩn']];

const createEmptyForm = () => ({
  questionText: '',
  type: 'single_choice',
  toeicPart: 5,
  options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: '' })),
  correctAnswers: [],
  explanation: '',
  score: 1,
  topic: 'TOEIC Part 5',
  status: 'draft',
});

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN');
};

const getCorrectAnswerLabels = (question) => {
  const answers = Array.isArray(question.correctAnswers) ? question.correctAnswers : [];
  if (!answers.length) return 'Chưa có đáp án đúng';
  return answers.map((answer) => {
    const index = (question.options || []).findIndex((option) => option.id === answer);
    if (index < 0) return String(answer);
    return `${String.fromCharCode(65 + index)} (${question.options[index].text})`;
  }).join(', ');
};

function QuestionStatus({ status }) {
  const labels = { draft: 'Bản nháp', published: 'Đã xuất bản', hidden: 'Đang ẩn' };
  const className = status === 'published' ? 'active' : status === 'hidden' ? 'inactive' : 'pending';
  return <span className={`status-badge ${className}`}>{labels[status] || status || 'Không rõ'}</span>;
}

export default function AdminToeicPart5QuestionBank() {
  const [searchParams, setSearchParams] = useSearchParams();
  const scopeParam = searchParams.get('toeicPart');
  const pageParam = Number.parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const statusFilter = searchParams.get('status') || '';
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, limit: PAGE_SIZE });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(createEmptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);

  const setBankParams = useCallback((changes = {}) => {
    const next = new URLSearchParams(searchParams);
    next.set('toeicPart', '5');
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === undefined || value === '') next.delete(key);
      else next.set(key, String(value));
    }
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (scopeParam === '5') return;
    const next = new URLSearchParams(searchParams);
    next.set('toeicPart', '5');
    setSearchParams(next, { replace: true });
  }, [scopeParam, searchParams, setSearchParams]);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const response = await assessmentApi.getAdminQuestions({
        toeicPart: 5,
        page,
        limit: PAGE_SIZE,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      if (currentRequest !== requestId.current) return;
      const result = response.data || {};
      const part5Items = (result.questions || []).filter((question) => Number(question.toeicPart) === 5);
      setItems(part5Items);
      setPagination({
        total: Number(result.pagination?.total) || 0,
        page: Number(result.pagination?.page) || page,
        pages: Math.max(1, Number(result.pagination?.pages) || 1),
        limit: Number(result.pagination?.limit) || PAGE_SIZE,
      });
    } catch {
      if (currentRequest === requestId.current) setError('Không thể tải Ngân hàng Part 5. Vui lòng thử lại.');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, reloadKey, search]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const openCreate = () => {
    setForm(createEmptyForm());
    setFieldErrors({});
    setModal({ type: 'create' });
  };

  const openEdit = (question) => {
    setForm(normalizePart5QuestionForm(question));
    setFieldErrors({});
    setModal({ type: 'edit', item: question });
  };

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined, _form: undefined }));
  };

  const updateOption = (index, value) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => optionIndex === index ? { ...option, text: value } : option),
    }));
    setFieldErrors((current) => ({ ...current, options: undefined, [`options.${String.fromCharCode(65 + index)}`]: undefined, _form: undefined }));
  };

  const chooseAnswer = (id) => {
    setForm((current) => ({ ...current, correctAnswers: [id] }));
    setFieldErrors((current) => ({ ...current, correctAnswers: undefined, _form: undefined }));
  };

  const save = async (event) => {
    event.preventDefault();
    const errors = validatePart5QuestionForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSaving(true);
    try {
      const payload = {
        questionText: form.questionText,
        type: 'single_choice',
        toeicPart: 5,
        options: form.options.map((option, index) => ({ id: String.fromCharCode(65 + index), text: option.text })),
        correctAnswers: [...form.correctAnswers],
        explanation: form.explanation,
        score: Number(form.score) || 1,
        topic: form.topic || 'TOEIC Part 5',
        status: modal.type === 'create' ? 'draft' : form.status,
      };
      if (modal.type === 'edit') await assessmentApi.updateQuestion(modal.item._id, payload);
      else await assessmentApi.createQuestion(payload);
      setToast(modal.type === 'edit' ? 'Đã cập nhật câu hỏi Part 5.' : 'Đã tạo câu hỏi Part 5 ở trạng thái Bản nháp.');
      setModal(null);
      setFieldErrors({});
      if (page !== 1) setBankParams({ page: null });
      setReloadKey((value) => value + 1);
    } catch (saveError) {
      setFieldErrors(mapPart5ApiValidationErrors(saveError));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await assessmentApi.deleteQuestion(modal.item._id);
      setToast('Đã xóa câu hỏi Part 5.');
      setModal(null);
      setReloadKey((value) => value + 1);
    } catch (deleteError) {
      setFieldErrors({ _form: deleteError.response?.data?.message || 'Không thể xóa câu hỏi.' });
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setSearchParams(new URLSearchParams({ toeicPart: '5' }));
  };

  const completenessIssues = modal?.item ? getPart5CompletenessIssues(modal.item) : [];

  return (
    <div className="admin-page-container admin-part5-bank">
      <header className="admin-p5-heading">
        <p className="admin-eyebrow">Question bank · TOEIC Part 5</p>
        <h1 className="admin-page-title">Ngân hàng Part 5</h1>
        <p className="admin-page-sub">Quản lý câu hỏi ngữ pháp và từ vựng Part 5. Các câu mới luôn được lưu ở trạng thái Bản nháp.</p>
      </header>

      <div className="admin-p5-toolbar">
        <label className="admin-p5-search">
          <span className="sr-only">Tìm câu hỏi Part 5</span>
          <input value={search} onChange={(event) => { setSearch(event.target.value); if (page !== 1) setBankParams({ page: null }); }} placeholder="Tìm nội dung câu hỏi..." aria-label="Tìm câu hỏi Part 5" />
        </label>
        <select value={statusFilter} onChange={(event) => setBankParams({ status: event.target.value || null, page: null })} aria-label="Lọc trạng thái câu hỏi">
          {statusOptions.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}
        </select>
        <button type="button" className="admin-quiet-button" onClick={clearFilters}>Đặt lại bộ lọc</button>
        <Link className="admin-quiet-button admin-qb-import-link" to="/admin/questions/import-part5">Import Excel</Link>
        <button type="button" className="admin-primary-button" onClick={openCreate}>Thêm câu hỏi</button>
      </div>

      <div className="admin-p5-scope-note" role="status">Đang hiển thị riêng câu hỏi TOEIC Part 5. Phạm vi này được giữ nguyên khi tìm kiếm, lọc và chuyển trang.</div>

      {error && <div className="admin-error" role="alert">{error}<button type="button" onClick={load}>Thử lại</button></div>}

      <div className="admin-p5-table-meta" aria-live="polite">
        <span>{pagination.total.toLocaleString('vi-VN')} câu hỏi</span>
        {statusFilter && <span className="admin-p5-active-filter">{statusOptions.find(([value]) => value === statusFilter)?.[1] || statusFilter}</span>}
      </div>

      <div className="admin-table-container admin-p5-table-wrap">
        {loading ? <div className="admin-table-skeleton" role="status" aria-label="Đang tải câu hỏi Part 5"><i /><i /><i /></div> : (
          <table className="admin-data-table admin-p5-table">
            <thead><tr><th>Câu hỏi và phương án</th><th>Đáp án đúng</th><th>Lời giải thích</th><th>Trạng thái</th><th>Cập nhật</th><th>Thao tác</th></tr></thead>
            <tbody>{items.length ? items.map((question) => {
              const issues = getPart5CompletenessIssues(question);
              return (
                <tr key={question._id}>
                  <td data-label="Câu hỏi và phương án">
                    <b className="admin-p5-stem">{question.questionText}</b>
                    <ol className="admin-p5-options" type="A">{(question.options || []).map((option, index) => <li key={`${option.id}-${index}`}>{option.text || <em>Chưa nhập</em>}</li>)}</ol>
                    {issues.length > 0 && <span className="admin-p5-legacy-warning">Cần hoàn thiện: {issues.join(' · ')}</span>}
                  </td>
                  <td data-label="Đáp án đúng" className={!question.correctAnswers?.length ? 'admin-p5-missing' : ''}>{getCorrectAnswerLabels(question)}</td>
                  <td data-label="Lời giải thích">{question.explanation?.trim() || <span className="admin-p5-missing">Chưa có lời giải thích</span>}</td>
                  <td data-label="Trạng thái"><QuestionStatus status={question.status} /></td>
                  <td data-label="Cập nhật">{formatDate(question.updatedAt || question.createdAt)}</td>
                  <td data-label="Thao tác" className="admin-p5-actions">
                    <button type="button" className="admin-quiet-button" onClick={() => setModal({ type: 'view', item: question })}>Xem</button>
                    <button type="button" className="admin-quiet-button" onClick={() => openEdit(question)}>Sửa</button>
                    <button type="button" className="admin-danger-button" onClick={() => { setFieldErrors({}); setModal({ type: 'delete', item: question }); }}>Xóa</button>
                  </td>
                </tr>
              );
            }) : <tr><td colSpan="6"><div className="admin-empty">{pagination.total ? 'Không có câu hỏi ở trang này.' : 'Chưa có câu hỏi Part 5 phù hợp.'}</div></td></tr>}</tbody>
          </table>
        )}
      </div>

      <nav className="admin-p5-pagination" aria-label="Phân trang câu hỏi Part 5">
        <span>Trang {page} / {pagination.pages}</span>
        <div>
          <button type="button" className="admin-quiet-button" disabled={page <= 1 || loading} onClick={() => setBankParams({ page: page - 1 })}>Trước</button>
          <button type="button" className="admin-quiet-button" disabled={page >= pagination.pages || loading} onClick={() => setBankParams({ page: page + 1 })}>Sau</button>
        </div>
      </nav>

      {modal?.type === 'view' && (
        <div className="admin-modal-backdrop">
          <section className="admin-confirm-modal admin-p5-modal" role="dialog" aria-modal="true" aria-labelledby="part5-view-title">
            <button type="button" className="modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            <p className="admin-eyebrow">TOEIC Part 5 · {modal.item._id}</p>
            <h2 id="part5-view-title">Chi tiết câu hỏi</h2>
            <p className="admin-p5-view-stem">{modal.item.questionText}</p>
            <ol className="admin-p5-view-options" type="A">{(modal.item.options || []).map((option, index) => <li key={`${option.id}-${index}`}>{option.text}</li>)}</ol>
            <p><b>Đáp án đúng:</b> {getCorrectAnswerLabels(modal.item)}</p>
            <p><b>Lời giải thích:</b> {modal.item.explanation?.trim() || 'Chưa có lời giải thích'}</p>
            <p><b>Trạng thái:</b> <QuestionStatus status={modal.item.status} /></p>
            <p><b>Ngày tạo:</b> {formatDate(modal.item.createdAt)} · <b>Cập nhật:</b> {formatDate(modal.item.updatedAt)}</p>
            {getPart5CompletenessIssues(modal.item).length > 0 && <div className="admin-p5-legacy-notice" role="note">Câu hỏi cũ còn thiếu {getPart5CompletenessIssues(modal.item).join(' và ').toLowerCase()}. Hãy bổ sung khi chỉnh sửa; hệ thống không tự suy luận đáp án.</div>}
            <div className="modal-actions"><button type="button" className="admin-quiet-button" onClick={() => setModal(null)}>Đóng</button><button type="button" className="admin-primary-button" onClick={() => openEdit(modal.item)}>Sửa câu hỏi</button></div>
          </section>
        </div>
      )}

      {modal && ['create', 'edit'].includes(modal.type) && (
        <div className="admin-modal-backdrop">
          <form className="admin-confirm-modal assessment-form admin-p5-modal" onSubmit={save} aria-label="Biểu mẫu câu hỏi Part 5" noValidate>
            <button type="button" className="modal-close" onClick={() => setModal(null)} aria-label="Đóng">×</button>
            <p className="admin-eyebrow">TOEIC Part 5 · Single choice</p>
            <h2>{modal.type === 'edit' ? 'Chỉnh sửa câu hỏi Part 5' : 'Thêm câu hỏi Part 5'}</h2>
            {completenessIssues.length > 0 && <div className="admin-p5-legacy-notice" role="note">Câu hỏi cũ đang {completenessIssues.join(' và ').toLowerCase()}. Bổ sung các trường bắt buộc trước khi lưu. Không có đáp án nào được suy luận tự động.</div>}
            <label className={fieldErrors.questionText ? 'has-error' : ''}>Nội dung câu hỏi<textarea value={form.questionText} onChange={(event) => updateForm('questionText', event.target.value)} aria-invalid={Boolean(fieldErrors.questionText)} aria-describedby={fieldErrors.questionText ? 'p5-question-error' : undefined} required /></label>
            {fieldErrors.questionText && <small id="p5-question-error" className="admin-p5-field-error">{fieldErrors.questionText}</small>}

            <section className="admin-p5-option-editor" aria-labelledby="p5-options-title">
              <h3 id="p5-options-title">Bốn phương án A–D</h3>
              {form.options.map((option, index) => {
                const letter = String.fromCharCode(65 + index);
                return (
                  <div className="admin-p5-option-row" key={letter}>
                    <label className="admin-p5-answer-choice" title={`Chọn ${letter} là đáp án đúng`}>
                      <input type="radio" name="part5-correct-answer" checked={form.correctAnswers.includes(letter)} onChange={() => chooseAnswer(letter)} aria-label={`Chọn ${letter} là đáp án đúng`} />
                      <span>{letter}</span>
                    </label>
                    <label className="admin-p5-option-input">
                      <span className="sr-only">Phương án {letter}</span>
                      <input value={option.text} onChange={(event) => updateOption(index, event.target.value)} placeholder={`Nội dung phương án ${letter}`} aria-invalid={Boolean(fieldErrors.options || fieldErrors[`options.${letter}`])} />
                    </label>
                  </div>
                );
              })}
              {fieldErrors.options && <small className="admin-p5-field-error">{fieldErrors.options}</small>}
              {fieldErrors.correctAnswers && <small className="admin-p5-field-error">{fieldErrors.correctAnswers}</small>}
              <small>Chọn một vòng tròn để đánh dấu đáp án đúng. ID A, B, C, D được gửi đến API.</small>
            </section>

            <label className={fieldErrors.explanation ? 'has-error' : ''}>Lời giải thích<textarea value={form.explanation} onChange={(event) => updateForm('explanation', event.target.value)} aria-invalid={Boolean(fieldErrors.explanation)} aria-describedby={fieldErrors.explanation ? 'p5-explanation-error' : undefined} required /></label>
            {fieldErrors.explanation && <small id="p5-explanation-error" className="admin-p5-field-error">{fieldErrors.explanation}</small>}

            <div className="admin-p5-form-grid">
              <label>Điểm<input type="number" min="0.1" step="0.1" value={form.score} onChange={(event) => updateForm('score', event.target.value)} /></label>
              <label>Chủ đề<input value={form.topic} onChange={(event) => updateForm('topic', event.target.value)} /></label>
              {modal.type === 'edit' ? <label>Trạng thái<select value={form.status || 'draft'} onChange={(event) => updateForm('status', event.target.value)}><option value="draft">Bản nháp</option><option value="published">Đã xuất bản</option><option value="hidden">Đang ẩn</option></select></label> : <p className="admin-p5-default-status">Trạng thái khi tạo: <QuestionStatus status="draft" /></p>}
            </div>

            {fieldErrors._form && <div className="admin-error" role="alert">{fieldErrors._form}</div>}
            <div className="modal-actions"><button type="button" className="admin-quiet-button" onClick={() => setModal(null)}>Hủy</button><button className="admin-primary-button" disabled={saving}>{saving ? 'Đang lưu...' : modal.type === 'edit' ? 'Lưu thay đổi' : 'Tạo Bản nháp'}</button></div>
          </form>
        </div>
      )}

      {modal?.type === 'delete' && (
        <div className="admin-modal-backdrop">
          <section className="admin-confirm-modal admin-p5-modal" role="dialog" aria-modal="true" aria-labelledby="part5-delete-title">
            <h2 id="part5-delete-title">Xóa câu hỏi Part 5?</h2>
            <p>Question ID: {modal.item._id}</p>
            <p>Câu hỏi đang được Assessment hoặc lượt làm bài tham chiếu sẽ không thể xóa.</p>
            {fieldErrors._form && <div className="admin-error" role="alert">{fieldErrors._form}</div>}
            <div className="modal-actions"><button type="button" className="admin-quiet-button" onClick={() => setModal(null)}>Hủy</button><button type="button" className="admin-danger-button" disabled={saving} onClick={remove}>{saving ? 'Đang xóa...' : 'Xóa'}</button></div>
          </section>
        </div>
      )}

      {toast && <div className="admin-toast" role="status">{toast}</div>}
    </div>
  );
}
