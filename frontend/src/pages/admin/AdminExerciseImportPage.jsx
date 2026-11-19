import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { exerciseImportApi } from '../../api/exerciseImportApi.js';
import './AdminExerciseImportPage.css';

const TYPES = [
  { id: 'part1-dictation', label: 'Chép chính tả Part 1', template: 'part1-dictation.xlsx' },
  { id: 'vocabulary-dictation', label: 'Chép chính tả từ vựng', template: 'vocabulary-dictation.xlsx' },
  { id: 'hard-words-dictation', label: 'Hard Words Dictation', template: 'hard-words-dictation.xlsx' },
  { id: 'part2-challenge', label: 'Part 2 Challenge', template: 'part2-challenge.xlsx' },
  { id: 'grammar-tense-classification', label: 'Phân loại thì và dạng câu', template: 'grammar-tense-classification.xlsx' },
  { id: 'grammar-active-to-passive', label: 'Chủ động sang bị động', template: 'grammar-active-to-passive.xlsx' },
  { id: 'road-to-part-7', label: 'Road to Part 7', template: 'road-to-part-7.xlsx' },
];

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

export default function AdminExerciseImportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const batchId = searchParams.get('batchId') || '';
  const [exerciseType, setExerciseType] = useState(TYPES[0].id);
  const [file, setFile] = useState(null);
  const [batch, setBatch] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const selectedType = useMemo(() => TYPES.find((type) => type.id === exerciseType) || TYPES[0], [exerciseType]);

  useEffect(() => {
    if (!batchId) { setBatch(null); return; }
    let active = true;
    setBusy(true);
    setError('');
    exerciseImportApi.getBatch(batchId)
      .then((response) => { if (active) { setBatch(response.data.batch); setExerciseType(response.data.batch.exerciseType); } })
      .catch((reason) => { if (active) setError(errorMessage(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [batchId]);

  const upload = async (event) => {
    event.preventDefault();
    if (!file) { setError('Chọn file Excel trước khi xem trước.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await exerciseImportApi.upload(exerciseType, file);
      setBatch(response.data.batch);
      setSearchParams({ batchId: response.data.batch._id });
      setNotice('Đã phân tích file. Chưa có dữ liệu nào được ghi vào bài tập.');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!batch) return;
    const count = (batch.rowCounts?.create || 0) + (batch.rowCounts?.update || 0);
    if (!count || !window.confirm(`Xác nhận ghi ${count} bản ghi vào ${selectedType.label}?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await exerciseImportApi.confirm(batch._id);
      setBatch(response.data.batch);
      setNotice(`Đã lưu ${response.data.batch.resultCounts?.imported || 0} bản ghi.`);
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  };

  const reset = () => {
    setBatch(null); setFile(null); setError(''); setNotice(''); setSearchParams({});
  };

  const canConfirm = batch?.state === 'PREVIEW_READY'
    && ((batch.rowCounts?.create || 0) + (batch.rowCounts?.update || 0) > 0);

  return (
    <div className="exercise-import">
      <header className="exercise-import__hero">
        <p className="exercise-import__eyebrow">QUẢN LÝ NỘI DUNG</p>
        <div className="exercise-import__hero-row">
          <div>
            <h1>Import bài tập từ Excel</h1>
            <p>Chọn template, tải workbook lên để xem trước. Chỉ khi xác nhận, nội dung mới được lưu vào bộ dữ liệu bài tập.</p>
          </div>
          <Link className="exercise-import__part5-link" to="/admin/questions/import-part5">Mở importer TOEIC Part 5 ↗</Link>
        </div>
      </header>

      <form className="exercise-import__panel" onSubmit={upload}>
        <div className="exercise-import__form-grid">
          <label>
            <span>Loại bài tập</span>
            <select value={exerciseType} onChange={(event) => { setExerciseType(event.target.value); setFile(null); }} disabled={busy || Boolean(batch)}>
              {TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
            </select>
          </label>
          <div className="exercise-import__template-card">
            <div><strong>Template cho loại bài này</strong><small>Workbook có hướng dẫn, cột dữ liệu và ví dụ.</small></div>
            <a href={`/import-templates/${selectedType.template}`} download>Tải template Excel</a>
          </div>
        </div>

        <label className="exercise-import__file-field">
          <span>File Excel .xlsx</span>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] || null)} disabled={busy || Boolean(batch)} />
          <small>Workbook được gửi trực tiếp để xử lý; giới hạn 8 MiB. File không được lưu lên Blob hoặc Cloudinary.</small>
        </label>

        <div className="exercise-import__actions">
          {batch && <button className="exercise-import__button exercise-import__button--secondary" type="button" onClick={reset} disabled={busy}>Import file khác</button>}
          {!batch && <button className="exercise-import__button exercise-import__button--primary" type="submit" disabled={busy || !file}>{busy ? 'Đang đọc file…' : 'Xem trước dữ liệu'}</button>}
          {batch && <button className="exercise-import__button exercise-import__button--primary" type="button" onClick={confirm} disabled={busy || !canConfirm}>{busy ? 'Đang lưu…' : 'Xác nhận lưu dữ liệu'}</button>}
        </div>
      </form>

      {error && <div className="exercise-import__alert exercise-import__alert--error" role="alert">{error}</div>}
      {notice && <div className="exercise-import__alert exercise-import__alert--success" role="status">{notice}</div>}

      {batch && (
        <section className="exercise-import__preview">
          <div className="exercise-import__preview-heading">
            <div><p className="exercise-import__eyebrow">XEM TRƯỚC</p><h2>{batch.sourceFileName}</h2><p>Sheet: {batch.sheetName} · {batch.rows?.length || 0} bản ghi</p></div>
            <span className={`exercise-import__state exercise-import__state--${batch.state.toLowerCase()}`}>{batch.state === 'PREVIEW_READY' ? 'Chờ xác nhận' : batch.state === 'CONFIRMED' ? 'Đã xác nhận' : batch.state === 'PARTIALLY_CONFIRMED' ? 'Có bản ghi lỗi' : 'Đang xử lý'}</span>
          </div>
          <div className="exercise-import__counts">
            {countEntries(batch.rowCounts).map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}
          </div>
          {batch.resultCounts && (batch.resultCounts.imported > 0 || batch.resultCounts.failed > 0) && (
            <p className="exercise-import__result-line">Đã lưu {batch.resultCounts.imported} · Lỗi {batch.resultCounts.failed}</p>
          )}
          <div className="exercise-import__rows">
            {(batch.rows || []).map((row) => (
              <article className={`exercise-import__row exercise-import__row--${row.action.toLowerCase()}`} key={row._id || row.rowNumber}>
                <div className="exercise-import__row-head">
                  <div><strong>{getRowTitle(row)}</strong><small>Dòng Excel {row.sourceRowNumber} · {row.sourceKey}</small></div>
                  <span>{getActionLabel(row.action, batch.exerciseType)}</span>
                </div>
                <p className="exercise-import__row-description">{getRowDescription(row)}</p>
                <details className="exercise-import__row-details"><summary>Xem toàn bộ dữ liệu</summary><pre>{JSON.stringify(row.data, null, 2)}</pre></details>
                {row.issues?.length > 0 && <ul className="exercise-import__issues">{row.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul>}
                {row.resultMessage && <p className="exercise-import__row-result">{row.resultMessage}</p>}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
