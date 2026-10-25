import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { questionImportApi } from '../../api/questionImportApi.js';
import { setUnsavedNavigationGuard } from '../../utils/unsavedNavigationGuard.js';
import {
  countStatuses,
  filterImportRows,
  getSelectedValidRows,
  IMPORT_PAGE_SIZE,
  isRowImportable,
  MAX_XLSX_BYTES,
  validateXlsxFile,
} from './toeicPart5ImportUtils.js';
import './AdminToeicPart5ImportPage.css';

const LABELS = {
  VALID: 'Hợp lệ',
  INVALID: 'Thiếu hoặc sai dữ liệu',
  NEEDS_REVIEW: 'Cần kiểm duyệt',
  DUPLICATE: 'Trùng lặp',
  IMPORTED: 'Đã tạo Draft',
  ALREADY_IMPORTED: 'Đã nhập trước đó',
  FAILED: 'Thất bại',
  ROW_IN_PROGRESS: 'Đang xử lý',
  ROW_NOT_FOUND: 'Không tìm thấy dòng',
};

const STATUS_CLASS = {
  VALID: 'success', IMPORTED: 'success', ALREADY_IMPORTED: 'success',
  INVALID: 'danger', FAILED: 'danger', ROW_NOT_FOUND: 'danger',
  NEEDS_REVIEW: 'warning', DUPLICATE: 'warning', ROW_IN_PROGRESS: 'warning',
};

const emptyValues = () => ({ questionText: '', options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: '' })), correctAnswers: [], explanation: '' });
const errorMessage = (error, fallback) => error?.response?.data?.message || error?.response?.data?.code || fallback;
const formatSize = (bytes) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KiB` : `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
const hasResult = (row) => row.importState === 'IMPORTED' || ['FAILED', 'DUPLICATE', 'SKIPPED'].includes(row.importState);

const StatusPill = ({ status }) => (
  <span className={`p5-import__status p5-import__status--${STATUS_CLASS[status] || 'neutral'}`}>{LABELS[status] || status}</span>
);

const Modal = ({ title, labelledBy, children, onClose, className = '' }) => (
  <ModalContent title={title} labelledBy={labelledBy} onClose={onClose} className={className}>{children}</ModalContent>
);

const ModalContent = ({ title, labelledBy, children, onClose, className }) => {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const focusable = () => [...(dialogRef.current?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') || [])];
    focusable()[0]?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const targets = focusable();
      if (!targets.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <div className="p5-import__modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeRef.current(); }}>
    <section ref={dialogRef} tabIndex={-1} className={`p5-import__modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <button className="p5-import__modal-close" type="button" onClick={onClose} aria-label="Đóng">×</button>
      <h2 id={labelledBy}>{title}</h2>
      {children}
    </section>
  </div>
  );
};

export default function AdminToeicPart5ImportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const batchId = searchParams.get('batchId') || '';
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [batch, setBatch] = useState(null);
  const [rows, setRows] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [search, setSearch] = useState('');
  const [rowNumberFilter, setRowNumberFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [selectedRows, setSelectedRows] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const [editValues, setEditValues] = useState(emptyValues);
  const [savingRow, setSavingRow] = useState(false);
  const [editError, setEditError] = useState('');
  const [previewRow, setPreviewRow] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmUncertain, setConfirmUncertain] = useState(false);
  const [results, setResults] = useState([]);
  const [notice, setNotice] = useState('');
  const fileInputRef = useRef(null);
  const editFormRef = useRef(null);
  const confirmLockRef = useRef(false);
  const dirty = Boolean(editing) && JSON.stringify(editValues) !== JSON.stringify(editing.initialValues);
  const selectedValidRows = useMemo(() => getSelectedValidRows(rows, selectedRows), [rows, selectedRows]);
  const filteredRows = useMemo(() => filterImportRows(rows, { search, rowNumber: rowNumberFilter, status: statusFilter }), [rows, rowNumberFilter, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / IMPORT_PAGE_SIZE));
  const visibleRows = filteredRows.slice((page - 1) * IMPORT_PAGE_SIZE, page * IMPORT_PAGE_SIZE);
  const counts = useMemo(() => countStatuses(rows), [rows]);
  const batchState = batch?.batch?.state || '';

  const applyDetail = useCallback((detail) => {
    const payload = detail?.data || detail;
    setBatch(payload || null);
    setRows(Array.isArray(payload?.rows) ? payload.rows : []);
    setSelectedRows((current) => new Set([...current].filter((rowNumber) => {
      const row = payload?.rows?.find((item) => item.rowNumber === rowNumber);
      return isRowImportable(row);
    })));
    setConfirmUncertain(false);
  }, []);

  const loadBatch = useCallback(async ({ quiet = false } = {}) => {
    if (!batchId) return;
    if (!quiet) setBatchLoading(true);
    setBatchError('');
    try {
      const response = await questionImportApi.getBatch(batchId);
      applyDetail(response);
    } catch (error) {
      setBatchError(errorMessage(error, 'Không thể mở phiên import. Hãy kiểm tra mã batch hoặc thử tải lại.'));
    } finally {
      if (!quiet) setBatchLoading(false);
    }
  }, [applyDetail, batchId]);

  useEffect(() => {
    if (batchId) {
      setBatch(null);
      setRows([]);
      setResults([]);
      loadBatch();
    } else {
      setBatch(null);
      setRows([]);
      setBatchLoading(false);
    }
  }, [batchId, loadBatch]);

  useEffect(() => {
    if (!batchId || !batch?.inProgress || confirmBusy) return undefined;
    const id = window.setInterval(() => loadBatch({ quiet: true }), 2500);
    return () => window.clearInterval(id);
  }, [batch?.inProgress, batchId, confirmBusy, loadBatch]);

  useEffect(() => setPage(1), [search, rowNumberFilter, statusFilter]);

  useEffect(() => {
    if (!dirty) {
      setUnsavedNavigationGuard(null);
      return undefined;
    }
    setUnsavedNavigationGuard({
      historyIndex: window.history.state?.idx,
      allowNavigation: () => window.confirm('Bạn có chỉnh sửa chưa lưu. Rời trang và bỏ các thay đổi này?'),
    });
    const beforeUnload = (event) => { event.preventDefault(); event.returnValue = ''; };
    const guardLinks = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target?.closest?.('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      if (new URL(anchor.href, window.location.href).href === window.location.href) return;
      if (!window.confirm('Bạn có chỉnh sửa chưa lưu. Rời trang và bỏ các thay đổi này?')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', guardLinks, true);
    return () => {
      setUnsavedNavigationGuard(null);
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', guardLinks, true);
    };
  }, [dirty]);

  useEffect(() => {
    if (!editing || !editFormRef.current) return undefined;
    const firstInput = editFormRef.current.querySelector('textarea, input');
    firstInput?.focus();
    return undefined;
  }, [editing]);

  const chooseFile = (nextFile) => {
    const validation = validateXlsxFile(nextFile);
    setFileError(validation);
    setFile(validation ? null : nextFile);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadFile = async () => {
    const validation = validateXlsxFile(file);
    if (validation) { setFileError(validation); return; }
    setUploading(true);
    setFileError('');
    setNotice('');
    try {
      const response = await questionImportApi.upload(file);
      const detail = response.data;
      if (!detail?.batch?._id) throw new Error('API không trả về batch ID hợp lệ.');
      applyDetail(detail);
      localStorage.setItem('toeicPart5LastImportBatchId', detail.batch._id);
      setSearchParams({ batchId: detail.batch._id });
      setNotice(response.httpStatus === 202 || detail.inProgress
        ? 'File đang được phân tích. Trang sẽ tự cập nhật trạng thái.'
        : detail.reused ? 'Đã mở lại preview có sẵn cho file này.' : 'Preview đã sẵn sàng. Chưa có Question nào được tạo.');
    } catch (error) {
      setFileError(errorMessage(error, 'Không thể phân tích file. Vui lòng thử lại.'));
    } finally {
      setUploading(false);
    }
  };

  const startNewUpload = () => {
    if (dirty && !window.confirm('Bạn có chỉnh sửa chưa lưu. Rời phiên này và bỏ các thay đổi?')) return;
    setSearchParams({});
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setFileError('');
    setResults([]);
    setSelectedRows(new Set());
    setConfirmUncertain(false);
  };

  const openEditor = (row) => {
    const values = {
      questionText: row.values?.questionText || '',
      options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: row.values?.options?.find((option) => option.id === id)?.text || '' })),
      correctAnswers: [...(row.values?.correctAnswers || [])],
      explanation: row.values?.explanation || '',
    };
    setEditing({ rowNumber: row.rowNumber, initialValues: values });
    setEditValues(values);
    setEditError('');
  };

  const discardEdit = () => {
    if (dirty && !window.confirm('Bỏ các chỉnh sửa chưa lưu?')) return;
    setEditing(null);
    setEditError('');
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!editing || savingRow) return;
    setSavingRow(true);
    setEditError('');
    try {
      const response = await questionImportApi.updateRow(batchId, editing.rowNumber, editValues);
      applyDetail(response);
      setEditing(null);
      setNotice(`Dòng ${editing.rowNumber} đã được backend kiểm tra lại.`);
    } catch (error) {
      setEditError(errorMessage(error, 'Không thể lưu chỉnh sửa. Dữ liệu bạn nhập vẫn được giữ lại để thử lại.'));
    } finally {
      setSavingRow(false);
    }
  };

  const setSelected = (rowNumber, checked) => setSelectedRows((current) => {
    const next = new Set(current);
    if (checked) next.add(rowNumber); else next.delete(rowNumber);
    return next;
  });

  const selectRows = (sourceRows) => setSelectedRows((current) => {
    const next = new Set(current);
    for (const row of sourceRows) if (isRowImportable(row)) next.add(row.rowNumber);
    return next;
  });

  const clearSelection = () => setSelectedRows(new Set());

  const confirmImport = async () => {
    const rowNumbers = getSelectedValidRows(rows, selectedRows);
    if (!rowNumbers.length || confirmBusy || confirmLockRef.current || confirmUncertain) return;
    confirmLockRef.current = true;
    setConfirmBusy(true);
    setResults([]);
    try {
      const response = await questionImportApi.confirm(batchId, rowNumbers);
      const resultData = response.data;
      applyDetail(resultData);
      setResults(Array.isArray(resultData?.results) ? resultData.results : []);
      setNotice(response.httpStatus === 207
        ? 'Import hoàn tất một phần. Hãy xem kết quả riêng của từng dòng.'
        : 'Các dòng đã được xử lý. Question được tạo ở trạng thái Draft.');
      setConfirmOpen(false);
    } catch (error) {
      if (!error.response) {
        setConfirmUncertain(true);
        setBatchError('Mất kết nối khi Confirm. Kết quả có thể đã được ghi một phần; hãy tải lại batch để kiểm tra trước khi thao tác tiếp.');
      } else {
        setBatchError(errorMessage(error, 'Backend không thể xử lý yêu cầu Confirm.'));
      }
      setConfirmOpen(false);
    } finally {
      confirmLockRef.current = false;
      setConfirmBusy(false);
    }
  };

  const rowResults = useMemo(() => {
    const resultByNumber = new Map(results.map((result) => [result.rowNumber, result]));
    return resultByNumber;
  }, [results]);

  return (
    <main className="p5-import">
      <div className="p5-import__topline">
        <Link to="/admin/questions?toeicPart=5" className="p5-import__back">← Ngân hàng Part 5</Link>
        <span className="p5-import__admin-mark">ADMIN REVIEW</span>
      </div>
      <header className="p5-import__hero">
        <div>
          <p className="p5-import__eyebrow">TOEIC · PART 5</p>
          <h1>Import Excel Part 5</h1>
          <p>Phân tích, rà soát từng dòng và chọn câu hỏi sẽ tạo thành bản nháp.</p>
        </div>
        {batchId && <button type="button" className="p5-import__button p5-import__button--secondary" onClick={startNewUpload}>Phiên upload mới</button>}
      </header>

      {!batchId && (
        <section className="p5-import__upload-panel" aria-labelledby="upload-title">
          <div className="p5-import__section-heading"><span className="p5-import__step">01</span><div><h2 id="upload-title">Chọn workbook</h2><p>Backend sẽ kiểm tra cấu trúc XLSX. Upload không tạo Question.</p></div></div>
          <button
            className={`p5-import__dropzone${dragActive ? ' is-dragging' : ''}`}
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => { event.preventDefault(); setDragActive(false); chooseFile(event.dataTransfer.files?.[0]); }}
            aria-describedby="upload-hint"
          >
            <span className="p5-import__upload-icon" aria-hidden="true">↑</span>
            <strong>{file ? file.name : 'Kéo file XLSX vào đây'}</strong>
            <span>{file ? formatSize(file.size) : 'hoặc nhấn để chọn từ thiết bị'}</span>
            <span id="upload-hint" className="p5-import__drop-hint">.xlsx · tối đa {formatSize(MAX_XLSX_BYTES)}</span>
          </button>
          <input ref={fileInputRef} className="p5-import__visually-hidden" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => chooseFile(event.target.files?.[0])} aria-label="Chọn file XLSX" />
          {fileError && <p className="p5-import__alert p5-import__alert--error" role="alert">{fileError}</p>}
          <div className="p5-import__upload-footer"><p>Chỉ chấp nhận workbook Excel .xlsx. Không xử lý file trên trình duyệt.</p><button type="button" className="p5-import__button p5-import__button--primary" disabled={!file || uploading} onClick={uploadFile}>{uploading ? 'Đang phân tích…' : 'Phân tích file'}</button></div>
          {localStorage.getItem('toeicPart5LastImportBatchId') && <button type="button" className="p5-import__text-button" onClick={() => setSearchParams({ batchId: localStorage.getItem('toeicPart5LastImportBatchId') })}>Mở lại batch gần nhất</button>}
        </section>
      )}

      {batchId && batchLoading && !batch && <div className="p5-import__loading" role="status"><span className="p5-import__spinner" />Đang khôi phục preview của batch…</div>}
      {batchError && <div className="p5-import__alert p5-import__alert--error" role="alert"><div><strong>Cần kiểm tra phiên import</strong><p>{batchError}</p></div><button type="button" className="p5-import__button p5-import__button--secondary" onClick={() => { if (confirmUncertain) { setSelectedRows(new Set()); setResults([]); } loadBatch(); }}>Tải lại batch</button></div>}
      {notice && !batchError && <div className="p5-import__notice" role="status">{notice}</div>}

      {batch && (
        <>
          <section className="p5-import__batch-bar">
            <div><p className="p5-import__eyebrow">PHIÊN IMPORT</p><h2>{batch.batch.sourceFileName || 'Workbook Part 5'}</h2><p>Batch <code>{batch.batch._id}</code> · Sheet {batch.batch.sheetName || '—'} · {batch.batch.state}</p></div>
            <div className="p5-import__batch-actions"><button type="button" className="p5-import__button p5-import__button--secondary" onClick={() => loadBatch()} disabled={batchLoading}>{batchLoading ? 'Đang tải…' : 'Tải lại kết quả'}</button><Link className="p5-import__button p5-import__button--text" to="/admin/questions?toeicPart=5&status=draft">Mở Ngân hàng Part 5 · Bản nháp ↗</Link></div>
          </section>
          {batch.inProgress && <div className="p5-import__progress" role="status"><span className="p5-import__spinner" />Backend đang hoàn tất thao tác. Preview sẽ tự cập nhật.</div>}

          <section className="p5-import__summary" aria-label="Tổng quan trạng thái import">
            {[
              ['TOTAL', 'Tổng số câu', batch.batch.totalRows ?? rows.length, 'neutral'],
              ['VALID', 'Hợp lệ', counts.VALID, 'success'],
              ['INVALID', 'Không hợp lệ', counts.INVALID, 'danger'],
              ['NEEDS_REVIEW', 'Cần kiểm duyệt', counts.NEEDS_REVIEW, 'warning'],
              ['DUPLICATE', 'Trùng lặp', counts.DUPLICATE, 'warning'],
              ['IMPORTED', 'Đã tạo Draft', counts.IMPORTED, 'success'],
            ].map((item) => <article key={item[0]} className={`p5-import__metric p5-import__metric--${item[3]}`}><span>{item[1]}</span><strong>{item[2]}</strong></article>)}
          </section>

          <section className="p5-import__review" aria-labelledby="review-title">
            <div className="p5-import__section-heading"><span className="p5-import__step">02</span><div><h2 id="review-title">Rà soát từng dòng</h2><p>Trạng thái và cảnh báo do backend xác định. Dòng trùng hoặc cần kiểm duyệt không thể Confirm.</p></div></div>
            <div className="p5-import__filters">
              <label className="p5-import__search">Tìm kiếm<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nội dung, lựa chọn, mã lỗi…" /></label>
              <label>Số dòng Excel<input type="number" min="1" value={rowNumberFilter} onChange={(event) => setRowNumberFilter(event.target.value)} placeholder="Ví dụ: 61" /></label>
              <label>Trạng thái<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">Tất cả trạng thái</option><option value="VALID">Hợp lệ</option><option value="INVALID">Không hợp lệ</option><option value="NEEDS_REVIEW">Cần kiểm duyệt</option><option value="DUPLICATE">Trùng lặp</option><option value="IMPORTED">Đã import</option></select></label>
            </div>

            <div className="p5-import__selection-toolbar">
              <div><strong>{selectedValidRows.length}</strong> câu hợp lệ được chọn <span>· Chọn xong rồi mới Confirm</span></div>
              <div className="p5-import__selection-actions"><button type="button" onClick={() => selectRows(rows.filter(isRowImportable))}>Chọn tất cả VALID</button><button type="button" onClick={() => selectRows(filteredRows.filter(isRowImportable))}>Chọn VALID đang lọc</button><button type="button" onClick={clearSelection}>Bỏ chọn</button></div>
            </div>

            {rows.length === 0 ? <div className="p5-import__empty">Batch chưa có dòng preview. Nếu đang phân tích, trạng thái sẽ tự cập nhật.</div> : filteredRows.length === 0 ? <div className="p5-import__empty">Không có dòng nào khớp bộ lọc.</div> : (
              <div className="p5-import__row-list">
                {visibleRows.map((row) => {
                  const result = rowResults.get(row.rowNumber);
                  const answer = row.values?.correctAnswers || [];
                  const canImport = isRowImportable(row);
                  return (
                    <article className={`p5-import__row p5-import__row--${STATUS_CLASS[row.status] || 'neutral'}`} key={row.rowNumber}>
                      <div className="p5-import__row-top">
                        <label className={`p5-import__row-select${canImport ? '' : ' is-disabled'}`}><input type="checkbox" checked={selectedRows.has(row.rowNumber) && canImport} disabled={!canImport || batch.inProgress} onChange={(event) => setSelected(row.rowNumber, event.target.checked)} aria-label={`Chọn dòng Excel ${row.rowNumber}`} /><span>Dòng Excel {row.rowNumber}</span></label>
                        <div className="p5-import__row-badges"><StatusPill status={row.status} />{row.importState !== 'PENDING' && !result && row.importState !== row.status && <span className="p5-import__state">{LABELS[row.importState] || row.importState}</span>}{result && <StatusPill status={result.status} />}</div>
                      </div>
                      <div className="p5-import__question-content">
                        <p className="p5-import__stem">{row.values?.questionText || <em>Chưa có nội dung câu hỏi</em>}</p>
                        <div className="p5-import__options">{['A', 'B', 'C', 'D'].map((id) => <div className={`p5-import__option${answer.includes(id) ? ' is-correct' : ''}`} key={id}><b>{id}</b><span>{row.values?.options?.find((option) => option.id === id)?.text || '—'}</span></div>)}</div>
                        <p className="p5-import__answer"><span>Đáp án đúng</span><strong>{answer.length ? answer.join(', ') : 'Chưa chọn'}</strong></p>
                        <p className="p5-import__explanation"><span>Lời giải thích</span>{row.values?.explanation || 'Chưa có lời giải thích'}</p>
                      </div>
                      {row.issues?.length > 0 && <ul className="p5-import__issues">{row.issues.map((issue, index) => <li key={`${issue.code}-${index}`}><code>{issue.code}</code><span>{issue.message}</span></li>)}</ul>}
                      {(row.duplicateOfRowNumber || row.questionId || row.resultMessage || result?.questionId || result?.code) && <div className="p5-import__duplicate-meta">{row.duplicateOfRowNumber && <span>Trùng dòng Excel {row.duplicateOfRowNumber}</span>}{row.questionId && <span>Question ID: <code>{row.questionId}</code></span>}{result?.questionId && String(result.questionId) !== String(row.questionId || '') && <span>Question ID: <code>{result.questionId}</code></span>}{(result?.message || row.resultMessage) && <span>{result?.message || row.resultMessage}</span>}{(result?.code || row.resultCode) && <code>{result?.code || row.resultCode}</code>}</div>}
                      <div className="p5-import__row-actions"><button type="button" className="p5-import__row-action" onClick={() => setPreviewRow(row)}>Xem trước như câu hỏi</button><button type="button" className="p5-import__row-action" onClick={() => openEditor(row)} disabled={row.importState === 'IMPORTED'}>Sửa dòng</button></div>
                    </article>
                  );
                })}
              </div>
            )}

            {filteredRows.length > IMPORT_PAGE_SIZE && <nav className="p5-import__pagination" aria-label="Phân trang preview"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>← Trước</button><span>Trang {page} / {pageCount} · {filteredRows.length} dòng</span><button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>Sau →</button></nav>}
          </section>

          {(results.length > 0 || rows.some(hasResult)) && <section className="p5-import__results" aria-labelledby="results-title"><div className="p5-import__section-heading"><span className="p5-import__step p5-import__step--done">03</span><div><h2 id="results-title">Kết quả xử lý</h2><p>Kết quả từng dòng; phần import có thể thành công một phần.</p></div></div><div className="p5-import__result-list">{(results.length ? results : rows.filter(hasResult).map((row) => ({ rowNumber: row.rowNumber, status: row.importState === 'IMPORTED' ? 'ALREADY_IMPORTED' : row.importState, questionId: row.questionId, code: row.resultCode, message: row.resultMessage }))).map((result) => <div className="p5-import__result" key={`${result.rowNumber}-${result.status}`}><span>Dòng {result.rowNumber}</span><StatusPill status={result.status} />{result.questionId && <code>Question ID: {result.questionId}</code>}{result.code && <code>{result.code}</code>}{result.message && <p>{result.message}</p>}</div>)}</div><Link className="p5-import__button p5-import__button--primary p5-import__bank-link" to="/admin/questions?toeicPart=5&status=draft">Mở Ngân hàng Part 5 · Bản nháp</Link></section>}

          <div className="p5-import__sticky-bar"><div><strong>{selectedValidRows.length} câu được chọn</strong><span>Question mới sẽ ở trạng thái Draft, chưa được publish vào đề thi.</span></div><button type="button" className="p5-import__button p5-import__button--primary" disabled={!selectedValidRows.length || confirmBusy || confirmUncertain || batch.inProgress} onClick={() => setConfirmOpen(true)}>{confirmBusy ? 'Đang xử lý…' : `Import ${selectedValidRows.length} câu hỏi`}</button></div>
        </>
      )}

      {editing && (
        <Modal title={`Chỉnh sửa dòng Excel ${editing.rowNumber}`} labelledBy="edit-row-title" onClose={discardEdit} className="p5-import__edit-modal">
          <form ref={editFormRef} onSubmit={saveEdit}>
            <p className="p5-import__modal-intro">Backend sẽ kiểm tra lại sau khi lưu. Đáp án chỉ được chọn theo dữ liệu Admin xác nhận.</p>
            <label className="p5-import__field">Nội dung câu hỏi<textarea rows="3" value={editValues.questionText} onChange={(event) => setEditValues((current) => ({ ...current, questionText: event.target.value }))} /></label>
            <fieldset className="p5-import__answer-fields"><legend>Bốn phương án và đáp án đúng</legend>{editValues.options.map((option, index) => <div className="p5-import__answer-field" key={option.id}><label className="p5-import__radio-label"><input type="radio" name="correct-answer" checked={editValues.correctAnswers.includes(option.id)} onChange={() => setEditValues((current) => ({ ...current, correctAnswers: [option.id] }))} aria-label={`Đặt ${option.id} là đáp án đúng`} />{option.id}</label><input aria-label={`Nội dung phương án ${option.id}`} value={option.text} onChange={(event) => setEditValues((current) => ({ ...current, options: current.options.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item) }))} /></div>)}</fieldset>
            <label className="p5-import__field">Lời giải thích<textarea rows="4" value={editValues.explanation} onChange={(event) => setEditValues((current) => ({ ...current, explanation: event.target.value }))} /></label>
            {editError && <div className="p5-import__alert p5-import__alert--error" role="alert">{editError}</div>}
            <div className="p5-import__modal-actions"><button type="button" className="p5-import__button p5-import__button--secondary" onClick={discardEdit}>Hủy</button><button type="submit" className="p5-import__button p5-import__button--primary" disabled={savingRow}>{savingRow ? 'Đang kiểm tra…' : 'Lưu và kiểm tra lại'}</button></div>
          </form>
        </Modal>
      )}

      {previewRow && (
        <Modal title={`Preview · Dòng ${previewRow.rowNumber}`} labelledBy="question-preview-title" onClose={() => setPreviewRow(null)} className="p5-import__preview-modal">
          <div className="p5-import__student-preview"><p className="p5-import__eyebrow">TOEIC PART 5 · ADMIN REVIEW</p><p className="p5-import__student-stem">{previewRow.values?.questionText || 'Chưa có nội dung câu hỏi'}</p><ol type="A">{['A', 'B', 'C', 'D'].map((id) => <li key={id}>{previewRow.values?.options?.find((option) => option.id === id)?.text || '—'}</li>)}</ol><div className="p5-import__answer-reveal"><strong>Đáp án đúng: {previewRow.values?.correctAnswers?.join(', ') || 'Chưa chọn'}</strong><p>{previewRow.values?.explanation || 'Chưa có lời giải thích.'}</p></div></div><div className="p5-import__modal-actions"><button type="button" className="p5-import__button p5-import__button--secondary" onClick={() => setPreviewRow(null)}>Đóng preview</button><button type="button" className="p5-import__button p5-import__button--primary" onClick={() => { setPreviewRow(null); openEditor(previewRow); }}>Sửa câu này</button></div>
        </Modal>
      )}

      {confirmOpen && (
        <Modal title="Xác nhận tạo Question Draft" labelledBy="confirm-import-title" onClose={() => setConfirmOpen(false)}>
          <div className="p5-import__confirm-copy"><p><strong>{selectedValidRows.length} Question Draft</strong> sẽ được tạo từ các dòng đang VALID đã chọn.</p><p>{Math.max(0, rows.length - selectedValidRows.length)} dòng còn lại được bỏ qua trong lần này. Dòng trùng và cần kiểm duyệt không được gửi.</p><div className="p5-import__draft-note">Các Question chỉ lưu trong ngân hàng ở trạng thái <b>Draft</b>; thao tác này không publish vào đề thi.</div></div><div className="p5-import__modal-actions"><button type="button" className="p5-import__button p5-import__button--secondary" onClick={() => setConfirmOpen(false)}>Quay lại rà soát</button><button type="button" className="p5-import__button p5-import__button--primary" disabled={confirmBusy} onClick={confirmImport}>{confirmBusy ? 'Đang xử lý…' : `Tạo ${selectedValidRows.length} Draft`}</button></div>
        </Modal>
      )}
    </main>
  );
}
