import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { vocabularyImportApi, VocabularyImportApiError } from './api.js';
import {
  candidateFileName, candidateHasDuplicate, candidateLocator, candidateOrdinal,
  effectiveValues, editorValues, FIELD_LABELS, formatBytes, ISSUE_LABELS, issueLabel,
  MAX_BATCH_BYTES, MAX_FILE_BYTES, MAX_FILES_PER_BATCH, PAGE_SIZE, safeSourceText,
  STATUS_LABELS, STEP_LABELS, timestampLabel,
} from './model.js';
import './VocabularyImportWorkspace.css';

const ACCEPTED_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip', 'application/x-zip-compressed', 'application/octet-stream',
]);

const errorText = (error, fallback) => {
  if (error instanceof VocabularyImportApiError) return error.message;
  return error?.message || fallback;
};

const statusTone = (value) => {
  if (['VALID', 'VALIDATION_PASSED', 'REVIEW_APPROVED', 'IMPORTED_AS_DRAFT', 'CONFIRMED_DRAFT', 'REVIEW_COMPLETE'].includes(value)) return 'success';
  if (['INVALID', 'VALIDATION_FAILED', 'REVIEW_REJECTED', 'FAILED'].includes(value)) return 'danger';
  if (['NEEDS_REVIEW', 'EDITED', 'PARSED', 'PARTIALLY_CONFIRMED_DRAFT'].includes(value)) return 'warning';
  return 'neutral';
};

function Badge({ value, label }) {
  if (!value) return null;
  return <span className={`vwi-badge vwi-badge--${statusTone(value)}`}>{label || STATUS_LABELS[value] || value}</span>;
}

function Dialog({ open, title, labelledBy, onClose, children, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
    return undefined;
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`vwi-dialog ${className}`}
      aria-labelledby={labelledBy}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClose={() => { if (open) onClose(); }}
    >
      <div className="vwi-dialog__heading">
        <div><p className="vwi-eyebrow">Vocabulary · Editorial desk</p><h2 id={labelledBy}>{title}</h2></div>
        <button type="button" className="vwi-icon-button" aria-label="Đóng hộp thoại" onClick={onClose}>×</button>
      </div>
      {children}
    </dialog>
  );
}

const newExample = () => ({ english: '', vietnamese: '' });
const newSense = () => ({ partOfSpeech: [], meaning: '', examples: [newExample()] });
const valuesEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const fileError = (files) => {
  if (files.length > MAX_FILES_PER_BATCH) return `Một batch chỉ nhận tối đa ${MAX_FILES_PER_BATCH} file DOCX.`;
  if (files.some((file) => !/\.docx$/i.test(file.name))) return 'Chỉ chọn tài liệu Microsoft Word có đuôi .docx.';
  const wrongMime = files.find((file) => file.type && !ACCEPTED_MIMES.has(file.type.toLowerCase()));
  if (wrongMime) return `Định dạng trình duyệt báo cho “${wrongMime.name}” không được hỗ trợ.`;
  const oversized = files.find((file) => file.size > MAX_FILE_BYTES);
  if (oversized) return `“${oversized.name}” vượt quá giới hạn ${formatBytes(MAX_FILE_BYTES)}.`;
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_BATCH_BYTES) return `Tổng dung lượng batch vượt quá ${formatBytes(MAX_BATCH_BYTES)}.`;
  return '';
};

export default function VocabularyImportWorkspace({ api = vocabularyImportApi, initialBatchId = '', autoOpenBatch = false }) {
  const [step, setStep] = useState('upload');
  const [files, setFiles] = useState([]);
  const [sourceFolder, setSourceFolder] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [batchIdInput, setBatchIdInput] = useState(() => initialBatchId || localStorage.getItem('vwi:lastBatchId') || '');
  const [batch, setBatch] = useState(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [candidateItems, setCandidateItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [validationFilter, setValidationFilter] = useState('');
  const [reviewFilter, setReviewFilter] = useState('');
  const [page, setPage] = useState(1);
  const [activeCandidate, setActiveCandidate] = useState(null);
  const [auditHistory, setAuditHistory] = useState([]);
  const [editor, setEditor] = useState(null);
  const [editorInitial, setEditorInitial] = useState(null);
  const [editReason, setEditReason] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [keepSeparate, setKeepSeparate] = useState(false);
  const [candidateBusy, setCandidateBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [serverConflict, setServerConflict] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmUncertain, setConfirmUncertain] = useState(false);
  const [confirmBlocked, setConfirmBlocked] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmResults, setConfirmResults] = useState([]);
  const [confirmErrors, setConfirmErrors] = useState([]);
  const [selectedDuplicateIds, setSelectedDuplicateIds] = useState(() => new Set());
  const [notice, setNotice] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingNavigation = useRef(null);
  const autoOpenedInitialBatch = useRef('');
  const fileInputRef = useRef(null);
  const dirty = Boolean(editor && editorInitial && !valuesEqual(editor, editorInitial));
  const hasUnsavedWork = dirty || Boolean(editReason.trim()) || Boolean(reviewReason.trim());
  const editorIssues = activeCandidate?.validationIssues || [];
  const duplicate = activeCandidate ? candidateHasDuplicate(activeCandidate) : false;

  useEffect(() => {
    if (!hasUnsavedWork) return undefined;
    const protectReload = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protectReload);
    return () => window.removeEventListener('beforeunload', protectReload);
  }, [hasUnsavedWork]);

  const candidateQuery = useMemo(() => ({
    page, limit: PAGE_SIZE,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(validationFilter ? { validationStatus: validationFilter } : {}),
    ...(reviewFilter ? { reviewStatus: reviewFilter } : {}),
  }), [page, reviewFilter, search, statusFilter, validationFilter]);

  const loadCandidates = useCallback(async (batchId, query = candidateQuery) => {
    if (!batchId) return;
    setListBusy(true);
    setListError('');
    try {
      const result = await api.getCandidates(batchId, query);
      setCandidateItems(Array.isArray(result.items) ? result.items : []);
      setPagination(result.pagination || { page: query.page || 1, limit: PAGE_SIZE, total: 0, pages: 1 });
    } catch (error) {
      setListError(errorText(error, 'Không thể tải danh sách Chapter. Dữ liệu đã lưu vẫn an toàn; hãy thử lại.'));
    } finally {
      setListBusy(false);
    }
  }, [api, candidateQuery]);

  const refreshBatch = useCallback(async (batchId = batch?._id) => {
    if (!batchId) return null;
    setBatchBusy(true);
    setBatchError('');
    try {
      const fresh = await api.getBatch(batchId);
      setBatch(fresh);
      setBatchIdInput(String(fresh._id || batchId));
      localStorage.setItem('vwi:lastBatchId', String(fresh._id || batchId));
      await loadCandidates(batchId);
      if (confirmBlocked) {
        setSelectedIds(new Set());
        setSelectedDuplicateIds(new Set());
        setConfirmMessage('Đã tải lại batch. Hãy chọn lại candidate chưa tạo Draft sau khi kiểm tra trạng thái mới.');
      }
      setConfirmUncertain(false);
      setConfirmBlocked(false);
      return fresh;
    } catch (error) {
      setBatchError(errorText(error, 'Không thể tải batch. Hãy kiểm tra Batch ID hoặc thử lại.'));
      return null;
    } finally {
      setBatchBusy(false);
    }
  }, [api, batch?._id, confirmBlocked, loadCandidates]);

  useEffect(() => {
    if (!batch?._id) return;
    loadCandidates(batch._id, candidateQuery);
  }, [batch?._id, candidateQuery, loadCandidates]);

  useEffect(() => {
    if (page > pagination.pages) setPage(Math.max(1, pagination.pages));
  }, [page, pagination.pages]);

  const navigateWithGuard = (action) => {
    if (hasUnsavedWork) {
      pendingNavigation.current = action;
      setDiscardOpen(true);
      return;
    }
    action();
  };

  const continueAfterDiscard = () => {
    const action = pendingNavigation.current;
    pendingNavigation.current = null;
    setDiscardOpen(false);
    setActiveCandidate(null);
    setEditor(null);
    setEditorInitial(null);
    setEditReason('');
    setReviewReason('');
    setServerConflict(null);
    action?.();
  };

  const applyFiles = (list) => {
    const selected = Array.from(list || []);
    const problem = fileError(selected);
    setUploadError(problem);
    setFiles(selected);
  };

  const uploadBatch = async (event) => {
    event.preventDefault();
    const problem = fileError(files);
    if (problem) { setUploadError(problem); return; }
    if (!files.length) { setUploadError('Chọn ít nhất một file DOCX để tạo batch.'); return; }
    if (!sourceFolder.trim()) { setUploadError('Hãy chọn hoặc nhập Tag / nhóm nguồn trước khi tải lên.'); return; }
    setUploadBusy(true);
    setUploadError('');
    setConfirmResults([]);
    setConfirmErrors([]);
    setConfirmMessage('');
    try {
      const result = await api.uploadBatch(files, sourceFolder.trim());
      const created = result.batch;
      setActiveCandidate(null);
      setEditor(null);
      setEditorInitial(null);
      setEditReason('');
      setReviewReason('');
      setKeepSeparate(false);
      setEditorError('');
      setServerConflict(null);
      setAuditHistory([]);
      setSelectedIds(new Set());
      setSelectedDuplicateIds(new Set());
      setSearch('');
      setStatusFilter('');
      setValidationFilter('');
      setReviewFilter('');
      setListError('');
      setBatchError('');
      setConfirmUncertain(false);
      setConfirmBlocked(false);
      setConfirmOpen(false);
      setConfirmMessage('');
      setBatch(created);
      setBatchIdInput(String(created._id));
      localStorage.setItem('vwi:lastBatchId', String(created._id));
      setCandidateItems(Array.isArray(result.candidates) ? result.candidates : []);
      setPage(1);
      setStep('preview');
      setNotice(result.idempotent ? 'Batch đã tồn tại; đã khôi phục trạng thái và lịch sử review.' : 'Đã tạo batch. Mỗi tài liệu được giữ thành một Chapter candidate.');
      await refreshBatch(created._id);
    } catch (error) {
      setUploadError(errorText(error, 'Không thể tạo batch. File và lựa chọn vẫn còn trên màn hình để thử lại.'));
    } finally {
      setUploadBusy(false);
    }
  };

  const openBatchById = async (event) => {
    event?.preventDefault();
    const id = batchIdInput.trim();
    if (!id) { setBatchError('Nhập Batch ID để mở lại phiên import.'); return; }
    navigateWithGuard(async () => {
      setBatchBusy(true);
      setBatchError('');
      setListError('');
      setBatch(null);
      setCandidateItems([]);
      setActiveCandidate(null);
      setEditor(null);
      setEditorInitial(null);
      setEditReason('');
      setReviewReason('');
      setKeepSeparate(false);
      setEditorError('');
      setServerConflict(null);
      setAuditHistory([]);
      setSelectedIds(new Set());
      setSelectedDuplicateIds(new Set());
      setSearch('');
      setStatusFilter('');
      setValidationFilter('');
      setReviewFilter('');
      setConfirmUncertain(false);
      setConfirmBlocked(false);
      setConfirmOpen(false);
      setConfirmResults([]);
      setConfirmErrors([]);
      setConfirmMessage('');
      try {
        const fresh = await api.getBatch(id);
        setBatch(fresh);
        setBatchIdInput(String(fresh._id || id));
        localStorage.setItem('vwi:lastBatchId', String(fresh._id || id));
        setPage(1);
        setStep('preview');
        await loadCandidates(id, { page: 1, limit: PAGE_SIZE });
        setNotice('Đã mở batch đã lưu. Có thể tiếp tục từ trạng thái hiện tại.');
        setConfirmUncertain(false);
      } catch (error) {
        setBatchError(errorText(error, 'Không thể mở batch. Kiểm tra ID hoặc tải lại sau.'));
      } finally {
        setBatchBusy(false);
      }
    });
  };

  useEffect(() => {
    if (!autoOpenBatch || !initialBatchId || autoOpenedInitialBatch.current === initialBatchId) return;
    autoOpenedInitialBatch.current = initialBatchId;
    setBatchIdInput(initialBatchId);
    openBatchById({ preventDefault() {} });
  }, [autoOpenBatch, initialBatchId]);

  const refreshAfterWrite = async (candidate) => {
    if (!candidate) return;
    let latest = candidate;
    try {
      const detail = await api.getCandidate(batch?._id, candidate._id);
      latest = detail.candidate || candidate;
      setAuditHistory(detail.auditHistory || []);
    } catch { /* the write result remains authoritative; timeline can be reloaded later */ }
    setActiveCandidate(latest);
    setEditor(editorValues(latest));
    setEditorInitial(editorValues(latest));
    setEditReason('');
    setReviewReason('');
    setKeepSeparate(false);
    setServerConflict(null);
    await refreshBatch(batch?._id);
  };

  const openCandidate = (candidateId) => navigateWithGuard(async () => {
    if (!batch?._id) return;
    setCandidateBusy(true);
    setEditorError('');
    setServerConflict(null);
    try {
      const result = await api.getCandidate(batch._id, candidateId);
      const candidate = result.candidate;
      setActiveCandidate(candidate);
      const values = editorValues(candidate);
      setEditor(values);
      setEditorInitial(values);
      setAuditHistory(Array.isArray(result.auditHistory) ? result.auditHistory : []);
      setEditReason('');
      setReviewReason('');
      setKeepSeparate(candidate.duplicateDecision === 'KEEP_SEPARATE');
    } catch (error) {
      setEditorError(errorText(error, 'Không thể mở candidate. Hãy tải lại danh sách rồi thử lại.'));
    } finally {
      setCandidateBusy(false);
    }
  });

  const updateEditor = (updater) => setEditor((current) => (typeof updater === 'function' ? updater(current) : updater));

  const makeChanges = () => {
    if (!editor || !editorInitial) return {};
    const changes = {};
    if (editor.word !== editorInitial.word) changes.word = editor.word;
    if (!valuesEqual(editor.partOfSpeech, editorInitial.partOfSpeech)) changes.partOfSpeech = editor.partOfSpeech;
    if (!valuesEqual(editor.senses, editorInitial.senses)) changes.senses = editor.senses;
    if (!valuesEqual(editor.notes, editorInitial.notes)) changes.notes = editor.notes;
    return changes;
  };

  const saveCandidate = async (event) => {
    event.preventDefault();
    if (!activeCandidate || !batch?._id) return;
    const changes = makeChanges();
    if (!Object.keys(changes).length) return;
    if (!editReason.trim()) { setEditorError('Nhập lý do chỉnh sửa trước khi lưu.'); return; }
    setSaveBusy(true);
    setEditorError('');
    setServerConflict(null);
    try {
      const saved = await api.updateCandidate(batch._id, activeCandidate._id, {
        expectedVersion: activeCandidate.version,
        reason: editReason.trim(),
        changes,
      });
      await refreshAfterWrite(saved);
      setNotice('Đã lưu thay đổi và đưa candidate về trạng thái cần kiểm duyệt lại.');
    } catch (error) {
      setEditorError(errorText(error, 'Không thể lưu chỉnh sửa. Nội dung đang nhập được giữ nguyên.'));
      if (error?.status === 409 || error?.code === 'CONCURRENT_MODIFICATION') {
        try {
          const fresh = await api.getCandidate(batch._id, activeCandidate._id);
          setServerConflict(fresh);
        } catch { setServerConflict({ unavailable: true }); }
      }
    } finally {
      setSaveBusy(false);
    }
  };

  const loadServerVersion = () => {
    if (!serverConflict?.candidate) return;
    const freshCandidate = serverConflict.candidate;
    const values = editorValues(freshCandidate);
    setActiveCandidate(freshCandidate);
    setEditor(values);
    setEditorInitial(values);
    setAuditHistory(serverConflict.auditHistory || []);
    setEditReason('');
    setKeepSeparate(freshCandidate.duplicateDecision === 'KEEP_SEPARATE');
    setServerConflict(null);
    setEditorError('');
    setNotice('Đã tải phiên bản mới nhất. Hãy kiểm tra lại nội dung trước khi lưu.');
  };

  const decideReview = async (decision) => {
    if (!activeCandidate || !batch?._id) return;
    if (decision === 'REJECT' && !reviewReason.trim()) { setEditorError('Nhập lý do từ chối để ghi vào lịch sử review.'); return; }
    if (decision === 'APPROVE' && activeCandidate.validationStatus !== 'VALIDATION_PASSED') return;
    if (decision === 'APPROVE' && duplicate && !keepSeparate) { setEditorError('Candidate có dấu hiệu trùng. Hãy chọn KEEP_SEPARATE trước khi duyệt.'); return; }
    setReviewBusy(true);
    setEditorError('');
    try {
      const payload = {
        expectedVersion: activeCandidate.version,
        decision,
        ...(decision === 'REJECT' ? { reason: reviewReason.trim() } : {}),
        ...(decision === 'APPROVE' && duplicate ? { duplicateDecision: 'KEEP_SEPARATE' } : {}),
      };
      const updated = await api.reviewCandidate(batch._id, activeCandidate._id, payload);
      setActiveCandidate(updated);
      setEditor(editorValues(updated));
      setEditorInitial(editorValues(updated));
      setReviewReason('');
      setKeepSeparate(updated.duplicateDecision === 'KEEP_SEPARATE');
      const details = await api.getCandidate(batch._id, updated._id);
      setAuditHistory(details.auditHistory || []);
      await refreshBatch(batch._id);
      setNotice(decision === 'APPROVE' ? 'Candidate đã được duyệt; bước tiếp theo vẫn cần Confirm riêng.' : 'Đã ghi nhận lý do từ chối.');
    } catch (error) {
      setEditorError(errorText(error, 'Không thể ghi quyết định review. Hãy tải lại candidate.'));
      if (error?.status === 409 || error?.code === 'CONCURRENT_MODIFICATION') {
        try { setServerConflict(await api.getCandidate(batch._id, activeCandidate._id)); }
        catch { setServerConflict({ unavailable: true }); }
      }
    } finally {
      setReviewBusy(false);
    }
  };

  const toggleCandidateSelection = (candidate) => {
    if (candidate.reviewStatus !== 'REVIEW_APPROVED' || candidate.validationStatus !== 'VALIDATION_PASSED') return;
    const id = String(candidate._id);
    const selecting = !selectedIds.has(id);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedDuplicateIds((current) => {
      const next = new Set(current);
      if (selecting && candidateHasDuplicate(candidate)) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const confirmDraft = async () => {
    if (!batch?._id || !selectedIds.size || confirmBlocked) return;
    setConfirmBusy(true);
    setConfirmErrors([]);
    setConfirmResults([]);
    setConfirmMessage('');
    setConfirmOpen(false);
    try {
      const result = await api.confirmBatch(batch._id, {
        expectedVersion: batch.version,
        candidateIds: [...selectedIds],
      });
      setBatch(result.batch || batch);
      setConfirmResults(Array.isArray(result.results) ? result.results : []);
      setConfirmErrors(Array.isArray(result.rowErrors) ? result.rowErrors : []);
      setSelectedIds(new Set());
      setSelectedDuplicateIds(new Set());
      await refreshBatch(batch._id);
      if (result.rowErrors?.length) setConfirmMessage('Một số candidate chưa được tạo Draft. Hãy xem lỗi từng dòng và tải lại trạng thái trước khi tiếp tục.');
      setNotice(result.idempotent ? 'Batch đã được Confirm trước đó; đã tải lại tham chiếu Draft hiện có.' : 'Đã nhận kết quả Confirm từ API. Các Vocabulary vẫn ở trạng thái Draft.');
    } catch (error) {
      if (!error?.status || error?.code === 'NETWORK_ERROR' || error?.code === 'REQUEST_TIMEOUT') {
        setConfirmUncertain(true);
        setConfirmBlocked(true);
        setConfirmMessage('Chưa xác định được Confirm có hoàn tất hay không. Hãy tải lại trạng thái batch để đối soát trước khi thử tiếp.');
      } else {
        setConfirmBlocked(true);
        setConfirmMessage(`${errorText(error, 'Confirm bị từ chối.')} Hãy tải lại batch để cập nhật counts và version.`);
      }
      setConfirmErrors(error?.payload?.rowErrors || []);
    } finally {
      setConfirmBusy(false);
    }
  };

  const beginNextBatch = () => navigateWithGuard(() => {
    setBatch(null);
    setCandidateItems([]);
    setActiveCandidate(null);
    setEditor(null);
    setEditorInitial(null);
    setEditReason('');
    setReviewReason('');
    setKeepSeparate(false);
    setEditorError('');
    setServerConflict(null);
    setAuditHistory([]);
    setFiles([]);
    setSourceFolder('');
    setUploadError('');
    setBatchError('');
    setListError('');
    setSearch('');
    setStatusFilter('');
    setValidationFilter('');
    setReviewFilter('');
    setPage(1);
    setSelectedIds(new Set());
    setSelectedDuplicateIds(new Set());
    setConfirmResults([]);
    setConfirmErrors([]);
    setConfirmUncertain(false);
    setConfirmBlocked(false);
    setConfirmOpen(false);
    setConfirmMessage('');
    setStep('upload');
  });

  const stepTo = (next) => navigateWithGuard(() => setStep(next));

  return (
    <main className="vwi-page">
      <header className="vwi-page-header">
        <div>
          <p className="vwi-eyebrow">Kho từ vựng · Quy trình nội dung</p>
          <h1>Nhập Word & kiểm duyệt</h1>
          <p className="vwi-page-intro">Mỗi file DOCX trở thành một Chapter candidate. Nội dung chỉ được tạo ở trạng thái nháp sau khi Admin duyệt và Confirm.</p>
        </div>
        <button type="button" className="vwi-button vwi-button--quiet" onClick={beginNextBatch}>
          Batch khác
        </button>
      </header>

      <nav className="vwi-stepper" aria-label="Các bước nhập từ vựng">
        {STEP_LABELS.map((item, index) => (
          <button
            type="button"
            key={item.id}
            className={`vwi-stepper__step${step === item.id ? ' is-active' : ''}${batch && item.id !== 'upload' ? ' is-available' : ''}`}
            aria-current={step === item.id ? 'step' : undefined}
            onClick={() => (item.id === 'upload' || batch) && stepTo(item.id)}
            disabled={item.id !== 'upload' && !batch}
          >
            <span className="vwi-stepper__index">{String(index + 1).padStart(2, '0')}</span>
            <span className="vwi-stepper__copy"><strong>{item.label}</strong><small>{item.hint}</small></span>
          </button>
        ))}
      </nav>

      {notice && <div className="vwi-notice" role="status"><span>{notice}</span><button type="button" aria-label="Ẩn thông báo" onClick={() => setNotice('')}>×</button></div>}

      {step === 'upload' && (
        <section className="vwi-upload-view" aria-labelledby="vwi-upload-title">
          <div className="vwi-upload-main">
            <div className="vwi-section-heading">
              <div><p className="vwi-eyebrow">Nguồn tài liệu</p><h2 id="vwi-upload-title">Tạo một batch DOCX</h2></div>
              <span className="vwi-limit-chip">Tối đa 5 file · 25 MiB</span>
            </div>
            <form onSubmit={uploadBatch}>
              <div
                className={`vwi-dropzone${dragActive ? ' is-dragging' : ''}`}
                onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragActive(false); }}
                onDrop={(event) => { event.preventDefault(); setDragActive(false); applyFiles(event.dataTransfer.files); }}
              >
                <span className="vwi-dropzone__glyph" aria-hidden="true">.docx</span>
                <div><strong>Kéo tài liệu Word vào đây</strong><span>Hoặc chọn file từ thiết bị của bạn. Mỗi batch nhận tối đa 5 tài liệu.</span></div>
                <button type="button" className="vwi-button vwi-button--secondary" onClick={() => fileInputRef.current?.click()}>Chọn DOCX</button>
                <input
                  ref={fileInputRef}
                  className="vwi-visually-hidden"
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  multiple
                  aria-label="Chọn một hoặc nhiều file DOCX"
                  onChange={(event) => { applyFiles(event.target.files); event.target.value = ''; }}
                />
              </div>
              <div className="vwi-file-list" aria-live="polite">
                {files.map((file, index) => (
                  <div className="vwi-file-row" key={`${file.name}-${file.size}-${index}`}>
                    <span className="vwi-file-row__icon" aria-hidden="true">W</span>
                    <span className="vwi-file-row__name"><strong>{file.name}</strong><small>{formatBytes(file.size)} · File {index + 1} trong batch</small></span>
                    <Badge value="VALID" label="Sẵn sàng" />
                    <button type="button" className="vwi-icon-button" aria-label={`Bỏ ${file.name}`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>
                  </div>
                ))}
                {files.length === 0 && <p className="vwi-file-empty">Chưa chọn tài liệu nào.</p>}
              </div>

              <label className="vwi-field vwi-field--source">
                <span>Tag / nhóm nguồn <b aria-hidden="true">*</b></span>
                <input
                  value={sourceFolder}
                  onChange={(event) => setSourceFolder(event.target.value)}
                  maxLength={100}
                  placeholder="Ví dụ: TOEIC EASY START"
                  required
                  aria-describedby="vwi-source-help"
                />
                <small id="vwi-source-help">Hãy xác nhận tên nhóm nguồn. Trình duyệt không đọc hoặc suy đoán thư mục trên máy của bạn.</small>
              </label>

              {uploadError && <div className="vwi-inline-error" role="alert">{uploadError}</div>}
              <div className="vwi-upload-footer">
                <span>{files.length} / {MAX_FILES_PER_BATCH} file · {formatBytes(files.reduce((sum, file) => sum + file.size, 0))} / {formatBytes(MAX_BATCH_BYTES)}</span>
                <button className="vwi-button vwi-button--primary" type="submit" disabled={uploadBusy || !files.length || !sourceFolder.trim()}>
                  {uploadBusy ? 'Đang phân tích DOCX…' : 'Tạo batch & xem trước'}
                </button>
              </div>
            </form>
            <div className="vwi-batch-sequence"><span className="vwi-sequence-mark">↳</span><p><strong>Đang có 30 tài liệu nguồn?</strong> Hãy xử lý lần lượt thành nhiều batch. Sau khi hoàn tất một batch, chọn “Batch khác”; hệ thống không tự gộp 30 file vào một request.</p></div>
          </div>

          <aside className="vwi-recovery-card" aria-labelledby="vwi-recovery-title">
            <p className="vwi-eyebrow">Tiếp tục phiên trước</p>
            <h2 id="vwi-recovery-title">Mở lại theo Batch ID</h2>
            <p>Batch không có danh sách tra cứu. Nhập ID đã lưu hoặc dùng ID gần nhất trên thiết bị này.</p>
            <form onSubmit={openBatchById}>
              <label className="vwi-field"><span>Batch ID</span><input value={batchIdInput} onChange={(event) => setBatchIdInput(event.target.value)} placeholder="Dán Batch ID" /></label>
              <button type="submit" className="vwi-button vwi-button--secondary" disabled={batchBusy}>{batchBusy ? 'Đang mở…' : 'Mở batch'}</button>
            </form>
            {batchError && <div className="vwi-inline-error" role="alert">{batchError}<button type="button" onClick={openBatchById}>Thử lại</button></div>}
            {batchIdInput && <small className="vwi-recovery-hint">ID gần nhất được lưu cục bộ trong trình duyệt.</small>}
          </aside>
        </section>
      )}

      {step !== 'upload' && batch && (
        <>
          <BatchOverview batch={batch} busy={batchBusy} onReload={() => refreshBatch(batch._id)} onNewBatch={beginNextBatch} />
          {(batchError || confirmUncertain) && (
            <div className="vwi-inline-error vwi-recovery-alert" role="alert">
              <span>{confirmUncertain ? 'Phản hồi Confirm bị mất hoặc hết thời gian chờ. Chưa thể xác nhận kết quả cho đến khi batch được tải lại.' : batchError}</span>
              <button className="vwi-button vwi-button--secondary vwi-button--small" type="button" onClick={() => refreshBatch(batch._id)} disabled={batchBusy}>Tải lại batch</button>
            </div>
          )}
          {step === 'preview' && (
            <section className="vwi-workspace" aria-labelledby="vwi-preview-title">
              <div className="vwi-section-heading"><div><p className="vwi-eyebrow">Preview · Phân trang {PAGE_SIZE} candidate</p><h2 id="vwi-preview-title">Các Chapter candidate</h2></div><button type="button" className="vwi-button vwi-button--primary" onClick={() => stepTo('review')}>Mở editorial review <span aria-hidden="true">→</span></button></div>
              <CandidateFilters search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} validationFilter={validationFilter} setValidationFilter={setValidationFilter} reviewFilter={reviewFilter} setReviewFilter={setReviewFilter} resetPage={() => setPage(1)} />
              <CandidateList
                items={candidateItems} busy={listBusy || batchBusy} error={listError} onRetry={() => batch?._id && loadCandidates(batch._id)}
                pagination={pagination} page={page} setPage={setPage} onOpen={openCandidate} activeId={activeCandidate?._id}
              />
              {activeCandidate && <CandidateWorkbench
                candidate={activeCandidate} editor={editor} editorIssues={editorIssues} auditHistory={auditHistory}
                dirty={dirty} busy={candidateBusy} saving={saveBusy} reviewing={reviewBusy} error={editorError}
                editReason={editReason} setEditReason={setEditReason} reviewReason={reviewReason} setReviewReason={setReviewReason}
                keepSeparate={keepSeparate} setKeepSeparate={setKeepSeparate} duplicate={duplicate}
                serverConflict={serverConflict} onLoadServer={loadServerVersion} onClose={() => navigateWithGuard(() => setActiveCandidate(null))}
                onEditorChange={updateEditor} onSave={saveCandidate} onReview={decideReview}
              />}
            </section>
          )}
          {step === 'review' && (
            <section className="vwi-workspace" aria-labelledby="vwi-review-title">
              <div className="vwi-section-heading"><div><p className="vwi-eyebrow">Editorial review · từng candidate</p><h2 id="vwi-review-title">Kiểm tra nội dung & quyết định</h2></div><button type="button" className="vwi-button vwi-button--secondary" onClick={() => stepTo('confirm')}>Chuẩn bị Confirm <span aria-hidden="true">→</span></button></div>
              <CandidateFilters search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} validationFilter={validationFilter} setValidationFilter={setValidationFilter} reviewFilter={reviewFilter} setReviewFilter={setReviewFilter} resetPage={() => setPage(1)} />
              <div className="vwi-review-layout">
                <CandidateList
                  items={candidateItems} busy={listBusy || batchBusy} error={listError} onRetry={() => batch?._id && loadCandidates(batch._id)}
                  pagination={pagination} page={page} setPage={setPage} onOpen={openCandidate} activeId={activeCandidate?._id}
                />
                <div className="vwi-editor-stage">
                  {candidateBusy && <div className="vwi-loading-state" role="status">Đang mở candidate và audit…</div>}
                  {!activeCandidate && !candidateBusy && <div className="vwi-empty-state"><span className="vwi-empty-mark">↖</span><strong>Chọn một Chapter để bắt đầu</strong><p>Chọn một candidate ở danh sách bên trái để so sánh nguồn, chỉnh sửa và review.</p></div>}
                  {activeCandidate && <CandidateWorkbench
                    candidate={activeCandidate} editor={editor} editorIssues={editorIssues} auditHistory={auditHistory}
                    dirty={dirty} busy={candidateBusy} saving={saveBusy} reviewing={reviewBusy} error={editorError}
                    editReason={editReason} setEditReason={setEditReason} reviewReason={reviewReason} setReviewReason={setReviewReason}
                    keepSeparate={keepSeparate} setKeepSeparate={setKeepSeparate} duplicate={duplicate}
                    serverConflict={serverConflict} onLoadServer={loadServerVersion} onClose={() => navigateWithGuard(() => setActiveCandidate(null))}
                    onEditorChange={updateEditor} onSave={saveCandidate} onReview={decideReview}
                  />}
                </div>
              </div>
            </section>
          )}
          {step === 'confirm' && (
            <section className="vwi-workspace" aria-labelledby="vwi-confirm-title">
              <div className="vwi-section-heading"><div><p className="vwi-eyebrow">Confirm · Catalog only</p><h2 id="vwi-confirm-title">Tạo Vocabulary Draft</h2></div><button type="button" className="vwi-button vwi-button--secondary" onClick={() => stepTo('review')}>← Quay lại kiểm duyệt</button></div>
              <div className="vwi-confirm-grid">
                <section className="vwi-confirm-panel">
                  <div className="vwi-confirm-panel__heading"><span className="vwi-confirm-mark" aria-hidden="true">✓</span><div><h3>Candidate đã duyệt</h3><p>Chọn riêng các occurrence cần tạo nháp. Không có thao tác publish.</p></div></div>
                  <CandidateFilters search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} validationFilter={validationFilter} setValidationFilter={setValidationFilter} reviewFilter={reviewFilter} setReviewFilter={setReviewFilter} resetPage={() => setPage(1)} />
                  <CandidateList
                    items={candidateItems} busy={listBusy || batchBusy} error={listError} onRetry={() => batch?._id && loadCandidates(batch._id)}
                    pagination={pagination} page={page} setPage={setPage} activeId={activeCandidate?._id}
                    selectable onToggle={toggleCandidateSelection} selectedIds={selectedIds}
                    onOpen={(id) => { stepTo('review'); openCandidate(id); }}
                  />
                </section>
                <aside className="vwi-confirm-aside" aria-label="Tóm tắt Confirm">
                  <p className="vwi-eyebrow">Đối soát batch</p>
                  <div className="vwi-selected-total"><strong>{selectedIds.size}</strong><span>candidate được chọn</span></div>
                  <dl className="vwi-confirm-counts">
                    <div><dt>Hợp lệ & đã duyệt</dt><dd>{batch.counts?.approved ?? 0}</dd></div>
                    <div><dt>Còn cần review</dt><dd>{batch.counts?.needsReview ?? 0}</dd></div>
                    <div><dt>Bị từ chối</dt><dd>{batch.counts?.rejected ?? 0}</dd></div>
                    <div><dt>Đã tạo Draft</dt><dd>{batch.counts?.importedAsDraft ?? 0}</dd></div>
                    <div><dt>Duplicate cần giữ riêng</dt><dd>{selectedDuplicateIds.size}</dd></div>
                  </dl>
                  <p className="vwi-publication-guard"><span aria-hidden="true">◌</span> Tất cả nội dung được tạo ở trạng thái nháp, chưa xuất bản cho học viên.</p>
                  {confirmBlocked && !confirmMessage && <div className="vwi-inline-error" role="alert">Tải lại batch để đối soát trước khi mở Confirm lần nữa.</div>}
                  {confirmMessage && <div className="vwi-inline-error" role={confirmUncertain ? 'alert' : 'status'}>{confirmMessage}</div>}
                  <button type="button" className="vwi-button vwi-button--primary vwi-button--wide" disabled={!selectedIds.size || confirmBusy || confirmBlocked} onClick={() => setConfirmOpen(true)}>
                    {confirmBusy ? 'Đang xác nhận…' : `Xác nhận ${selectedIds.size} bản nháp`}
                  </button>
                  {confirmResults.length > 0 && <div className="vwi-results" role="status"><strong>API trả về {confirmResults.length} kết quả</strong>{confirmResults.map((item) => <div key={String(item.candidateId)}><Badge value={item.status} /><small>Vocabulary ID · {String(item.vocabularyId || '—')}</small><small>Chapter ID · {String(item.chapterId || '—')}</small></div>)}</div>}
                  {confirmErrors.length > 0 && <div className="vwi-row-errors" role="alert"><strong>Các candidate cần đối soát</strong>{confirmErrors.slice(0, 8).map((item, index) => <p key={`${item.candidateId || 'row'}-${index}`}>{String(item.candidateId || 'Candidate')} · {item.code || item.errors?.map((issue) => ISSUE_LABELS[issue.code] || issue.code).join(', ') || 'Không đủ điều kiện Confirm.'}</p>)}</div>}
                </aside>
              </div>
            </section>
          )}
        </>
      )}

      <Dialog open={confirmOpen} title="Xác nhận tạo bản nháp?" labelledBy="vwi-confirm-dialog-title" onClose={() => setConfirmOpen(false)} className="vwi-dialog--confirm">
        <div className="vwi-confirm-dialog-copy">
          <p><strong>{selectedIds.size}</strong> candidate đã được chọn để tạo Vocabulary, Chapter và membership Draft.</p>
          <p>Thao tác này tạo Vocabulary Draft, chưa xuất bản cho học viên.</p>
          <p>Phản hồi mạng bị mất sẽ cần tải lại batch để đối soát trước khi thử lại.</p>
        </div>
        <div className="vwi-dialog__actions"><button type="button" className="vwi-button vwi-button--secondary" onClick={() => setConfirmOpen(false)}>Quay lại</button><button type="button" className="vwi-button vwi-button--primary" onClick={confirmDraft} disabled={confirmBusy}>Confirm bản nháp</button></div>
      </Dialog>

      <Dialog open={discardOpen} title="Bỏ thay đổi chưa lưu?" labelledBy="vwi-discard-dialog-title" onClose={() => { setDiscardOpen(false); pendingNavigation.current = null; }} className="vwi-dialog--confirm">
        <p className="vwi-confirm-dialog-copy">Nội dung bạn vừa nhập chưa được lưu. Chọn bỏ thay đổi để tiếp tục, hoặc ở lại chỉnh sửa.</p>
        <div className="vwi-dialog__actions"><button type="button" className="vwi-button vwi-button--secondary" onClick={() => { setDiscardOpen(false); pendingNavigation.current = null; }}>Ở lại chỉnh sửa</button><button type="button" className="vwi-button vwi-button--danger" onClick={continueAfterDiscard}>Bỏ thay đổi</button></div>
      </Dialog>
    </main>
  );
}

function BatchOverview({ batch, busy, onReload, onNewBatch }) {
  const counts = batch.counts || {};
  return (
    <section className="vwi-batch-card" aria-label="Thông tin batch">
      <div className="vwi-batch-card__main">
        <div><p className="vwi-eyebrow">Batch ID</p><div className="vwi-batch-id"><code>{String(batch._id)}</code><button type="button" className="vwi-copy-button" onClick={() => navigator.clipboard?.writeText(String(batch._id))}>Sao chép ID</button></div></div>
        <div className="vwi-batch-state"><Badge value={batch.status} /><small>{batch.candidateCount || 0} candidate · {batch.sourceFiles?.length || 0} Chapter source</small></div>
      </div>
      <div className="vwi-batch-stats">
        <Metric label="Đã parse" value={counts.parsed ?? 0} />
        <Metric label="Hợp lệ" value={counts.valid ?? 0} />
        <Metric label="Lỗi dữ liệu" value={counts.invalid ?? 0} />
        <Metric label="Chờ review" value={counts.needsReview ?? 0} />
        <Metric label="Đã duyệt" value={counts.approved ?? 0} />
        <Metric label="Đã tạo Draft" value={counts.importedAsDraft ?? 0} />
        <Metric label="Nhóm trùng" value={batch.duplicateGroupCount ?? 0} />
        <Metric label="Occurrence trùng" value={batch.duplicateOccurrenceCount ?? 0} />
      </div>
      <div className="vwi-batch-footer">
        <span>Parser {Array.isArray(batch.parserVersions) ? batch.parserVersions.join(', ') : '—'} · Tạo {timestampLabel(batch.createdAt)} · Cập nhật {timestampLabel(batch.updatedAt)}</span>
        <div><button type="button" className="vwi-button vwi-button--quiet vwi-button--small" onClick={onReload} disabled={busy}>{busy ? 'Đang tải…' : 'Tải lại trạng thái'}</button><button type="button" className="vwi-button vwi-button--quiet vwi-button--small" onClick={onNewBatch}>Batch khác</button></div>
      </div>
      {Array.isArray(batch.sourceFiles) && batch.sourceFiles.length > 0 && <div className="vwi-source-files" aria-label="Các file DOCX trong batch">{batch.sourceFiles.map((source) => <span key={`${source.relativePath}-${source.fileSha256}`} title={source.chapterCandidate || ''}><strong>{source.chapterCandidate || source.relativePath?.split('/').pop()}</strong><small>{source.candidateCount} từ</small></span>)}</div>}
    </section>
  );
}

function Metric({ label, value }) { return <div className="vwi-metric"><strong>{value}</strong><span>{label}</span></div>; }

function CandidateFilters({ search, setSearch, statusFilter, setStatusFilter, validationFilter, setValidationFilter, reviewFilter, setReviewFilter, resetPage }) {
  return (
    <div className="vwi-filters" aria-label="Tìm và lọc candidate">
      <label className="vwi-filter-search"><span>Tìm từ hoặc tên Chapter</span><input type="search" value={search} maxLength={80} onChange={(event) => { setSearch(event.target.value); resetPage(); }} placeholder="Ví dụ: accommodation" /></label>
      <label><span>Trạng thái import</span><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); resetPage(); }}><option value="">Tất cả</option><option value="PARSED">Đã parse</option><option value="VALID">Hợp lệ</option><option value="INVALID">Cần sửa dữ liệu</option><option value="REVIEW_APPROVED">Đã duyệt</option><option value="REVIEW_REJECTED">Bị từ chối</option><option value="IMPORTED_AS_DRAFT">Đã tạo bản nháp</option></select></label>
      <label><span>Validation</span><select value={validationFilter} onChange={(event) => { setValidationFilter(event.target.value); resetPage(); }}><option value="">Tất cả</option><option value="VALIDATION_PASSED">Hợp lệ</option><option value="VALIDATION_FAILED">Có lỗi</option><option value="NOT_RUN">Chưa kiểm tra</option></select></label>
      <label><span>Editorial review</span><select value={reviewFilter} onChange={(event) => { setReviewFilter(event.target.value); resetPage(); }}><option value="">Tất cả</option><option value="NEEDS_REVIEW">Cần kiểm duyệt</option><option value="EDITED">Đã sửa · chờ duyệt</option><option value="REVIEW_APPROVED">Đã duyệt</option><option value="REVIEW_REJECTED">Bị từ chối</option></select></label>
    </div>
  );
}

function CandidateList({ items, busy, error, onRetry, pagination, page, setPage, onOpen, activeId, selectable = false, onToggle, selectedIds = new Set() }) {
  return (
    <section className="vwi-candidate-list" aria-label="Danh sách Chapter candidate" aria-busy={busy}>
      <div className="vwi-candidate-list__heading"><div><strong>{pagination.total} candidate</strong><span>Hiển thị {items.length} · tối đa {PAGE_SIZE} mỗi trang</span></div><div className="vwi-pagination"><button type="button" className="vwi-icon-button" aria-label="Trang trước" disabled={page <= 1 || busy} onClick={() => setPage((value) => Math.max(1, value - 1))}>←</button><span>Trang {pagination.page || page} / {pagination.pages || 1}</span><button type="button" className="vwi-icon-button" aria-label="Trang sau" disabled={page >= (pagination.pages || 1) || busy} onClick={() => setPage((value) => Math.min(pagination.pages || 1, value + 1))}>→</button></div></div>
      {error && <div className="vwi-inline-error" role="alert">{error}<button type="button" onClick={onRetry}>Thử lại</button></div>}
      {busy && <div className="vwi-loading-state" role="status">Đang tải danh sách candidate…</div>}
      {!busy && !error && items.length === 0 && <div className="vwi-empty-state"><strong>Không có candidate phù hợp</strong><p>Thay bộ lọc hoặc kiểm tra lại trạng thái của batch.</p></div>}
      {!busy && items.length > 0 && <div className="vwi-candidate-rows">{items.map((candidate) => {
        const eligible = candidate.reviewStatus === 'REVIEW_APPROVED' && candidate.validationStatus === 'VALIDATION_PASSED';
        const selected = selectedIds.has(String(candidate._id));
        return (
          <article className={`vwi-candidate-row${String(candidate._id) === String(activeId) ? ' is-active' : ''}`} key={String(candidate._id)}>
            {selectable && <label className="vwi-candidate-check"><input type="checkbox" checked={selected} disabled={!eligible || candidate.importStatus === 'IMPORTED_AS_DRAFT'} onChange={() => onToggle(candidate)} /><span className="vwi-visually-hidden">Chọn {candidateFileName(candidate)} để Confirm</span></label>}
            <button type="button" className="vwi-candidate-open" onClick={() => onOpen(candidate._id)}>
              <span className="vwi-candidate-index">{String(candidateOrdinal(candidate)).padStart(2, '0')}</span>
              <span className="vwi-candidate-copy"><strong>{effectiveValues(candidate).word || 'Chưa có từ'}</strong><small>{candidateFileName(candidate)} · {candidateLocator(candidate)}</small><span className="vwi-row-badges"><Badge value={candidate.validationStatus} /><Badge value={candidate.reviewStatus} /><Badge value={candidate.importStatus} />{candidateHasDuplicate(candidate) && <Badge value="NEEDS_REVIEW" label="Có dấu hiệu trùng" />}</span></span>
              <span className="vwi-candidate-arrow" aria-hidden="true">↗</span>
            </button>
          </article>
        );
      })}</div>}
    </section>
  );
}

function CandidateWorkbench({ candidate, editor, editorIssues, auditHistory, dirty, busy, saving, reviewing, error, editReason, setEditReason, reviewReason, setReviewReason, keepSeparate, setKeepSeparate, duplicate, serverConflict, onLoadServer, onClose, onEditorChange, onSave, onReview }) {
  const parsed = candidate.parsedValues || {};
  const source = candidate.sourceMetadata || {};
  const canApprove = candidate.validationStatus === 'VALIDATION_PASSED' && candidate.importStatus !== 'IMPORTED_AS_DRAFT' && (!duplicate || keepSeparate);
  const imported = candidate.importStatus === 'IMPORTED_AS_DRAFT';
  const updateSense = (senseIndex, key, value) => onEditorChange((current) => ({ ...current, senses: current.senses.map((sense, index) => index === senseIndex ? { ...sense, [key]: value } : sense) }));
  const updateExample = (senseIndex, exampleIndex, key, value) => onEditorChange((current) => ({ ...current, senses: current.senses.map((sense, index) => index === senseIndex ? { ...sense, examples: sense.examples.map((example, itemIndex) => itemIndex === exampleIndex ? { ...example, [key]: value } : example) } : sense) }));

  return (
    <section className="vwi-workbench" aria-label="Biên tập và đối chiếu candidate">
      <div className="vwi-workbench__head"><div><p className="vwi-eyebrow">Chapter {candidateOrdinal(candidate)} · {candidateFileName(candidate)}</p><h3>{editor?.word || parsed.word || 'Candidate chưa có từ'}</h3><div className="vwi-row-badges"><Badge value={candidate.validationStatus} /><Badge value={candidate.reviewStatus} /><Badge value={candidate.importStatus} /><Badge value={candidate.publicationStatus} /></div></div><button type="button" className="vwi-icon-button" aria-label="Đóng editor" onClick={onClose}>×</button></div>
      {duplicate && <DuplicateNotice candidate={candidate} />}
      <div className="vwi-compare-grid">
        <section className="vwi-compare-card vwi-compare-card--source"><div className="vwi-compare-label"><span className="vwi-compare-step">01</span><div><strong>Nguồn DOCX</strong><small>Đọc nguyên văn · không thể sửa</small></div></div><p className="vwi-source-location">{candidateFileName(candidate)} · {candidateLocator(candidate)}</p><pre className="vwi-source-text">{safeSourceText(candidate.rawValues)}</pre><details className="vwi-raw-details"><summary>Chi tiết vị trí nguồn</summary><dl><div><dt>Chapter ordinal</dt><dd>{String(source.sourceOrdinal ?? '—')}</dd></div><div><dt>Đoạn nguồn</dt><dd>{candidateLocator(candidate)}</dd></div><div><dt>Parser</dt><dd>{candidate.parserVersion || '—'}</dd></div></dl></details></section>
        <section className="vwi-compare-card vwi-compare-card--parsed"><div className="vwi-compare-label"><span className="vwi-compare-step">02</span><div><strong>Máy đọc</strong><small>Bản parse bất biến</small></div></div><ParsedSummary values={parsed} /></section>
      </div>

      <form className="vwi-editor-form" onSubmit={onSave}>
        <div className="vwi-editor-title"><div><span className="vwi-compare-step">03</span><div><strong>Bản biên tập</strong><small>Controlled form · chỉnh sửa chưa gửi được giữ lại khi lỗi mạng</small></div></div>{dirty && <span className="vwi-unsaved-tag">Chưa lưu</span>}</div>
        <div className="vwi-editor-fields">
          <label className="vwi-field"><span>Từ / cụm từ</span><input value={editor?.word || ''} onChange={(event) => onEditorChange((current) => ({ ...current, word: event.target.value }))} disabled={imported} aria-invalid={editorIssues.some((issue) => issue.field === 'word') || undefined} /></label>
          <label className="vwi-field"><span>Từ loại <small>ngăn cách bằng dấu phẩy</small></span><input value={(editor?.partOfSpeech || []).join(', ')} onChange={(event) => onEditorChange((current) => ({ ...current, partOfSpeech: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) }))} disabled={imported} /></label>
        </div>
        <div className="vwi-senses-heading"><h4>Nghĩa & ví dụ song ngữ</h4><button type="button" className="vwi-button vwi-button--quiet vwi-button--small" disabled={imported || (editor?.senses?.length || 0) >= 30} onClick={() => onEditorChange((current) => ({ ...current, senses: [...current.senses, newSense()] }))}>+ Thêm nghĩa</button></div>
        {(editor?.senses || []).map((sense, senseIndex) => (
          <fieldset className="vwi-sense" key={`sense-${senseIndex}`}>
            <legend>Nghĩa {senseIndex + 1}</legend>
            <label className="vwi-field"><span>Nội dung nghĩa tiếng Việt</span><textarea value={sense.meaning} onChange={(event) => updateSense(senseIndex, 'meaning', event.target.value)} rows={3} disabled={imported} /></label>
            <label className="vwi-field"><span>Từ loại của nghĩa <small>ngăn cách bằng dấu phẩy</small></span><input value={sense.partOfSpeech.join(', ')} onChange={(event) => updateSense(senseIndex, 'partOfSpeech', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} disabled={imported} /></label>
            <div className="vwi-example-heading"><strong>Ví dụ</strong><button type="button" className="vwi-button vwi-button--quiet vwi-button--small" disabled={imported || sense.examples.length >= 20} onClick={() => updateSense(senseIndex, 'examples', [...sense.examples, newExample()])}>+ Thêm ví dụ</button></div>
            {sense.examples.map((example, exampleIndex) => <div className="vwi-example" key={`example-${senseIndex}-${exampleIndex}`}>
              <label className="vwi-field"><span>Tiếng Anh</span><textarea rows={2} value={example.english} onChange={(event) => updateExample(senseIndex, exampleIndex, 'english', event.target.value)} disabled={imported} /></label>
              <label className="vwi-field"><span>Tiếng Việt</span><textarea rows={2} value={example.vietnamese} onChange={(event) => updateExample(senseIndex, exampleIndex, 'vietnamese', event.target.value)} disabled={imported} /></label>
              <button type="button" className="vwi-button vwi-button--quiet vwi-button--small vwi-remove-example" disabled={imported || sense.examples.length <= 1} onClick={() => updateSense(senseIndex, 'examples', sense.examples.filter((_, index) => index !== exampleIndex))}>Xóa ví dụ</button>
            </div>)}
            <button type="button" className="vwi-text-action" disabled={imported || editor.senses.length <= 1} onClick={() => onEditorChange((current) => ({ ...current, senses: current.senses.filter((_, index) => index !== senseIndex) }))}>Xóa nghĩa này</button>
          </fieldset>
        ))}
        <label className="vwi-field"><span>Ghi chú <small>mỗi dòng là một ghi chú</small></span><textarea rows={3} value={(editor?.notes || []).join('\n')} onChange={(event) => onEditorChange((current) => ({ ...current, notes: event.target.value.split('\n') }))} disabled={imported} /></label>
        {editorIssues.length > 0 && <div className="vwi-validation-panel" role="status"><strong>Cần kiểm tra {editorIssues.length} trường</strong><ul>{editorIssues.map((issue, index) => { const label = issueLabel(issue); return <li key={`${issue.field}-${issue.code}-${index}`}><b>{label.field}:</b> {ISSUE_LABELS[issue.code] || label.message}</li>; })}</ul></div>}
        {serverConflict && <div className="vwi-conflict-panel" role="alert"><div className="vwi-conflict-copy"><strong>Phiên bản đã thay đổi trên máy chủ</strong><p>Hai bản đang được giữ riêng; chọn tải bản máy chủ sau khi so sánh. Không có thay đổi nào bị ghi đè.</p>{serverConflict.candidate ? <div className="vwi-conflict-compare"><div><small>Bản đang nhập · version {candidate.version}</small><strong>{editor?.word || '—'}</strong><span>{editor?.senses?.length || 0} nghĩa · {(editor?.senses || []).reduce((sum, sense) => sum + sense.examples.length, 0)} ví dụ · {editor?.notes?.length || 0} ghi chú</span></div><div><small>Bản máy chủ · version {serverConflict.candidate.version}</small><strong>{editorValues(serverConflict.candidate).word || '—'}</strong><span>{editorValues(serverConflict.candidate).senses.length} nghĩa · {editorValues(serverConflict.candidate).senses.reduce((sum, sense) => sum + sense.examples.length, 0)} ví dụ · {editorValues(serverConflict.candidate).notes.length} ghi chú</span><details><summary>Xem nội dung phiên bản máy chủ</summary><ParsedSummary values={editorValues(serverConflict.candidate)} /></details></div></div> : <p>Không thể tải phiên bản mới nhất ngay lúc này.</p>}</div>{serverConflict.candidate && <button type="button" className="vwi-button vwi-button--secondary vwi-button--small" onClick={onLoadServer}>Tải bản máy chủ</button>}</div>}
        {error && <div className="vwi-inline-error" role="alert">{error}</div>}
        <label className="vwi-field"><span>Lý do chỉnh sửa <small>bắt buộc khi lưu</small></span><input value={editReason} maxLength={500} onChange={(event) => setEditReason(event.target.value)} placeholder="Ví dụ: chuẩn hóa nghĩa theo ngữ cảnh" disabled={imported} /></label>
        <div className="vwi-editor-actions"><button className="vwi-button vwi-button--primary" type="submit" disabled={!dirty || !editReason.trim() || saving || imported}>{saving ? 'Đang lưu…' : 'Lưu chỉnh sửa'}</button>{imported && <span>Candidate đã tạo Draft và được khóa sửa.</span>}</div>
      </form>

      <section className="vwi-review-panel" aria-labelledby="vwi-review-actions-title">
        <div className="vwi-review-panel__top"><div><p className="vwi-eyebrow">Editorial decision</p><h4 id="vwi-review-actions-title">Quyết định kiểm duyệt</h4></div><Badge value={candidate.reviewStatus} /></div>
        {duplicate && <label className="vwi-keep-separate"><input type="checkbox" checked={keepSeparate} disabled={imported} onChange={(event) => setKeepSeparate(event.target.checked)} /><span><strong>KEEP_SEPARATE</strong><small>Giữ occurrence này thành từ riêng khi tạo Draft. API chưa hỗ trợ dùng lại hoặc gộp Vocabulary có sẵn.</small></span></label>}
        <label className="vwi-field"><span>Lý do từ chối <small>bắt buộc khi chọn Reject</small></span><textarea rows={2} maxLength={500} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} placeholder="Nhập lý do để ghi vào audit" disabled={imported} /></label>
        <div className="vwi-review-actions"><button type="button" className="vwi-button vwi-button--danger" disabled={reviewing || imported || !reviewReason.trim()} onClick={() => onReview('REJECT')}>{reviewing ? 'Đang ghi…' : 'Từ chối'}</button><button type="button" className="vwi-button vwi-button--primary" disabled={reviewing || imported || !canApprove || dirty} title={dirty ? 'Lưu chỉnh sửa trước khi duyệt.' : candidate.validationStatus !== 'VALIDATION_PASSED' ? 'Backend chưa xác nhận candidate hợp lệ.' : ''} onClick={() => onReview('APPROVE')}>{reviewing ? 'Đang ghi…' : 'Duyệt candidate'}</button></div>
        {candidate.validationStatus !== 'VALIDATION_PASSED' && <p className="vwi-helper-warning">Approve chỉ khả dụng khi backend trả validation hợp lệ.</p>}
        {candidate.reviewStatus === 'REVIEW_APPROVED' && <p className="vwi-approved-note">Đã duyệt nội dung. Candidate chưa được Confirm và chưa thể xuất bản.</p>}
      </section>

      <AuditTimeline entries={auditHistory} />
      {candidate.importStatus === 'IMPORTED_AS_DRAFT' && <section className="vwi-imported-ref"><strong>Đã tạo Vocabulary Draft</strong><span>Vocabulary ID · {String(candidate.importedVocabularyId || '—')}</span><span>Chapter ID · {String(candidate.importedChapterId || '—')}</span><Badge value={candidate.publicationStatus} /></section>}
    </section>
  );
}

function ParsedSummary({ values }) {
  return <div className="vwi-parsed-summary"><div><small>Từ / cụm từ</small><strong>{values.word || '—'}</strong></div><div><small>Từ loại</small><span>{Array.isArray(values.partOfSpeech) ? values.partOfSpeech.join(', ') || '—' : String(values.partOfSpeech || '—')}</span></div>{(values.senses || []).map((sense, index) => <div className="vwi-parsed-sense" key={`parsed-${index}`}><small>Nghĩa {index + 1}</small><span>{sense.meaning || '—'}</span>{sense.examples?.[0] && <em>{sense.examples[0].english}<br />{sense.examples[0].vietnamese}</em>}</div>)}{values.notes?.length > 0 && <div><small>Ghi chú</small><span>{values.notes.join(' · ')}</span></div>}</div>;
}

function DuplicateNotice({ candidate }) {
  const metadata = candidate.duplicateMetadata || {};
  const catalogMatches = metadata.catalogMatches || [];
  return <aside className="vwi-duplicate-notice"><strong>Candidate có dấu hiệu trùng hoặc là bản sửa nguồn</strong><ul>{metadata.parser && <li>Parser đánh dấu occurrence có liên quan trong chính nguồn hoặc batch.</li>}{metadata.sourceRevision?.revisionDetected && <li>Cùng nhãn đường dẫn nguồn có nội dung đã thay đổi; candidate cũ không bị ghi đè.</li>}{catalogMatches.length > 0 && <li>Có {catalogMatches.length} headword khớp với Catalog. Đây là tín hiệu để review, không chứng minh nội dung tương đương.</li>}</ul><p>Chỉ hỗ trợ quyết định <b>KEEP_SEPARATE</b>. Không có lựa chọn REUSE_EXISTING trong API hiện tại.</p></aside>;
}

function AuditTimeline({ entries }) {
  return <section className="vwi-audit" aria-labelledby="vwi-audit-title"><div className="vwi-audit-heading"><div><p className="vwi-eyebrow">Traceable edits</p><h4 id="vwi-audit-title">Lịch sử kiểm duyệt</h4></div><span>{entries.length} sự kiện</span></div>{entries.length === 0 ? <p className="vwi-audit-empty">Chưa có chỉnh sửa hoặc quyết định nào được ghi.</p> : <ol>{entries.map((entry, index) => <li key={String(entry._id || `${entry.action}-${index}`)}><span className="vwi-audit-dot" aria-hidden="true" /><div className="vwi-audit-entry"><div><strong>{entry.action === 'FIELDS_EDITED' ? 'Đã chỉnh sửa trường' : entry.action === 'REVIEW_DECISION' ? `Quyết định ${entry.decision === 'APPROVE' ? 'duyệt' : 'từ chối'}` : 'Đã Confirm Draft'}</strong><time>{timestampLabel(entry.occurredAt || entry.createdAt)}</time></div><small>Admin ID · {String(entry.actorId || '—')}</small>{entry.changedFields?.length > 0 && <span>Trường: {entry.changedFields.map((change) => FIELD_LABELS[change.field] || change.field).join(', ')}</span>}{entry.reason && <p>Lý do: {entry.reason}</p>}{entry.duplicateDecision && <span>Duplicate decision · {entry.duplicateDecision}</span>}</div></li>)}</ol>}</section>;
}
