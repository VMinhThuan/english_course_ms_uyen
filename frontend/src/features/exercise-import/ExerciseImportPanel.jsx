import { useEffect, useRef, useState } from 'react';
import { exerciseImportApi } from '../../api/exerciseImportApi.js';
import './ExerciseImportPanel.css';

const TYPES = {
  'part1-dictation': { label: 'Chép chính tả Part 1', template: 'part1-dictation.xlsx' },
  'vocabulary-dictation': { label: 'Chép chính tả từ vựng', template: 'vocabulary-dictation.xlsx' },
  'hard-words-dictation': { label: 'Hard Words Dictation', template: 'hard-words-dictation.xlsx' },
  'part2-challenge': { label: 'Part 2 Challenge', template: 'part2-challenge.xlsx' },
  'grammar-tense-classification': { label: 'Phân loại thì và dạng câu', template: 'grammar-tense-classification.xlsx' },
  'grammar-active-to-passive': { label: 'Chủ động sang bị động', template: 'grammar-active-to-passive.xlsx' },
  'road-to-part-7': { label: 'Road to Part 7', template: 'road-to-part-7.xlsx' },
};

const ACTIONS = {
  CREATE: 'Sẽ tạo bản nháp', UPDATE: 'Sẽ cập nhật', UNCHANGED: 'Không thay đổi',
  INVALID: 'Dữ liệu chưa hợp lệ', DUPLICATE: 'Trùng trong file', IMPORTED: 'Đã lưu', FAILED: 'Lưu thất bại',
};

const errorMessage = (error) => error?.response?.data?.message || error?.response?.data?.code || 'Không thể hoàn tất thao tác.';
const countEntries = (counts = {}) => [
  ['Tạo mới', counts.create || 0], ['Cập nhật', counts.update || 0], ['Không đổi', counts.unchanged || 0],
  ['Lỗi', counts.invalid || 0], ['Trùng', counts.duplicate || 0],
];
const getRowTitle = (row) => row.data?.title || row.data?.prompt || row.data?.questionText || row.data?.englishText || `Bản ghi ${row.rowNumber}`;
const getRowDescription = (row) => {
  if (Array.isArray(row.data?.answers)) return `${row.data.answers.length} câu/từ · ${row.data.answers.slice(0, 3).map((answer) => answer.text).join(', ')}`;
  if (Array.isArray(row.data?.choices)) return row.data.choices.map((choice) => `${choice.letter}. ${choice.text}`).join(' · ');
  if (row.data?.answer) return row.data.answer;
  if (row.data?.bilingualPairs) return `${row.data.bilingualPairs.length} cặp câu song ngữ`;
  return row.sourceKey || '';
};
const getActionLabel = (action, exerciseType) => {
  if (action === 'CREATE' && exerciseType === 'road-to-part-7') return 'Sẽ thêm bài đọc';
  return ACTIONS[action] || action;
};

export default function ExerciseImportPanel({ exerciseType, onImported }) {
  const type = TYPES[exerciseType];
  const batchStorageKey = `exercise-import-batch:${exerciseType}`;
  const fileInputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [batch, setBatch] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    setBatch(null);
    setFile(null);
    setError('');
    setNotice('');
    if (!type) return () => { active = false; };

    const savedBatchId = window.localStorage.getItem(batchStorageKey);
    if (!savedBatchId) return () => { active = false; };
    setOpen(true);
    setBusy(true);
    exerciseImportApi.getBatch(savedBatchId)
      .then((response) => {
        if (!active) return;
        if (response.data.batch.exerciseType !== exerciseType) {
          window.localStorage.removeItem(batchStorageKey);
          return;
        }
        setBatch(response.data.batch);
      })
      .catch((reason) => {
        if (!active) return;
        window.localStorage.removeItem(batchStorageKey);
        setError(errorMessage(reason));
      })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [batchStorageKey, exerciseType, type]);

  if (!type) return null;

  const upload = async (event) => {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await exerciseImportApi.upload(exerciseType, file);
      setBatch(response.data.batch);
      window.localStorage.setItem(batchStorageKey, response.data.batch._id);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setNotice('Đã đọc file. Chưa có dữ liệu nào được ghi vào bài tập.');
      setOpen(true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!batch || busy) return;
    const count = (batch.rowCounts?.create || 0) + (batch.rowCounts?.update || 0);
    if (!count || !window.confirm(`Xác nhận ghi ${count} bản ghi vào ${type.label}?`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await exerciseImportApi.confirm(batch._id);
      setBatch(response.data.batch);
      setNotice(`Đã lưu ${response.data.batch.resultCounts?.imported || 0} bản ghi.`);
      if (response.data.batch.resultCounts?.imported > 0) await onImported?.();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setBatch(null);
    setFile(null);
    setError('');
    setNotice('');
    window.localStorage.removeItem(batchStorageKey);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const canConfirm = batch?.state === 'PREVIEW_READY'
    && ((batch.rowCounts?.create || 0) + (batch.rowCounts?.update || 0) > 0);
  const panelId = `exercise-import-${exerciseType}`;

  return (
    <section className="exercise-import-panel">
      <header className="exercise-import-panel__header">
        <div>
          <p className="exercise-import-panel__eyebrow">NHẬP DỮ LIỆU BÀI TẬP</p>
          <h2>Import Excel · {type.label}</h2>
          <p>Tải template, xem trước các thay đổi rồi xác nhận lưu ngay tại trang quản lý này.</p>
        </div>
        <div className="exercise-import-panel__header-actions">
          <a href={`/import-templates/${type.template}`} download>Tải template</a>
          <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
            {open ? 'Thu gọn' : 'Mở import'}
          </button>
        </div>
      </header>

      {open && <div id={panelId} className="exercise-import-panel__content">
        <form className="exercise-import-panel__form" onSubmit={upload}>
          <label>
            <span>File Excel .xlsx</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              disabled={busy || Boolean(batch)}
            />
            <small>File được gửi thẳng tới backend để xử lý trong bộ nhớ, tối đa 8 MiB; workbook không lưu lên Blob hoặc Cloudinary.</small>
          </label>
          <div className="exercise-import-panel__actions">
            {batch && <button type="button" className="exercise-import-panel__button exercise-import-panel__button--secondary" onClick={reset} disabled={busy}>Import file khác</button>}
            {!batch && <button type="submit" className="exercise-import-panel__button exercise-import-panel__button--primary" disabled={busy || !file}>{busy ? 'Đang đọc file…' : 'Xem trước dữ liệu'}</button>}
            {batch && <button type="button" className="exercise-import-panel__button exercise-import-panel__button--primary" onClick={confirm} disabled={busy || !canConfirm}>{busy ? 'Đang lưu…' : 'Xác nhận lưu dữ liệu'}</button>}
          </div>
        </form>

        {error && <div className="exercise-import-panel__alert exercise-import-panel__alert--error" role="alert">{error}</div>}
        {notice && <div className="exercise-import-panel__alert exercise-import-panel__alert--success" role="status">{notice}</div>}

        {batch && <div className="exercise-import-panel__preview">
          <div className="exercise-import-panel__preview-heading">
            <div><p className="exercise-import-panel__eyebrow">XEM TRƯỚC</p><h3>{batch.sourceFileName}</h3><p>Sheet: {batch.sheetName} · {batch.rows?.length || 0} bản ghi</p></div>
            <span className={`exercise-import-panel__state exercise-import-panel__state--${batch.state.toLowerCase()}`}>{batch.state === 'PREVIEW_READY' ? 'Chờ xác nhận' : batch.state === 'CONFIRMED' ? 'Đã xác nhận' : batch.state === 'PARTIALLY_CONFIRMED' ? 'Có bản ghi lỗi' : 'Đang xử lý'}</span>
          </div>
          <div className="exercise-import-panel__counts">
            {countEntries(batch.rowCounts).map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}
          </div>
          {batch.resultCounts && (batch.resultCounts.imported > 0 || batch.resultCounts.failed > 0)
            && <p className="exercise-import-panel__result-line">Đã lưu {batch.resultCounts.imported} · Lỗi {batch.resultCounts.failed}</p>}
          <div className="exercise-import-panel__rows">
            {(batch.rows || []).map((row) => (
              <article className={`exercise-import-panel__row exercise-import-panel__row--${row.action.toLowerCase()}`} key={row._id || row.rowNumber}>
                <div className="exercise-import-panel__row-head">
                  <div><strong>{getRowTitle(row)}</strong><small>Dòng Excel {row.sourceRowNumber} · {row.sourceKey}</small></div>
                  <span>{getActionLabel(row.action, batch.exerciseType)}</span>
                </div>
                <p className="exercise-import-panel__row-description">{getRowDescription(row)}</p>
                <details className="exercise-import-panel__row-details"><summary>Xem toàn bộ dữ liệu</summary><pre>{JSON.stringify(row.data, null, 2)}</pre></details>
                {row.issues?.length > 0 && <ul className="exercise-import-panel__issues">{row.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul>}
                {row.resultMessage && <p className="exercise-import-panel__row-result">{row.resultMessage}</p>}
              </article>
            ))}
          </div>
        </div>}
      </div>}
    </section>
  );
}
