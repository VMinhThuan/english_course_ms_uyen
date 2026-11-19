import { useEffect, useMemo, useState } from 'react';
import { ReactGrid } from '@silevis/reactgrid';
import '@silevis/reactgrid/styles.css';
import { downloadWorkbook } from './exerciseWorkbook.js';
import {
  EXERCISE_SHEETS,
  blankEditorRow,
  getDirtyRows,
  getGridCellText,
  recordsToEditorRows,
  validateEditorRows,
} from './exerciseSpreadsheet.js';
import './ExerciseSpreadsheetEditor.css';

const formatCount = (value) => Number(value || 0).toLocaleString('vi-VN');
const EMPTY_RECORDS = [];

export default function ExerciseSpreadsheetEditor({
  exerciseType,
  records = EMPTY_RECORDS,
  recordsLoading = false,
  loadRecords,
  onSave,
  onClose,
  saveLabel = 'Xem trước và lưu',
}) {
  const spec = EXERCISE_SHEETS[exerciseType];
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(Boolean(recordsLoading || loadRecords));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [issues, setIssues] = useState([]);
  const [selectedCell, setSelectedCell] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const currentRecords = loadRecords ? await loadRecords() : records;
        if (active) setRows(recordsToEditorRows(exerciseType, currentRecords || []));
      } catch (loadError) {
        if (active) setError(loadError?.response?.data?.message || loadError.message || 'Không thể tải dữ liệu hiện tại.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [exerciseType, loadRecords, records]);

  const columns = useMemo(() => spec.columns.map(({ key, width }) => ({ columnId: key, width })), [spec]);
  const gridRows = useMemo(() => {
    const header = { rowId: 'exercise-sheet-header', cells: spec.columns.map(({ label }) => ({ type: 'header', text: label })) };
    return [header, ...rows.map((row) => {
      const longestCell = Math.max(0, ...spec.columns.map(({ key }) => String(row.values[key] || '').length));
      const hasLines = spec.columns.some(({ key }) => String(row.values[key] || '').includes('\n'));
      return {
        rowId: row.rowId,
        height: hasLines || longestCell > 350 ? 116 : longestCell > 150 ? 82 : 54,
        cells: spec.columns.map(({ key }) => ({
          type: 'text',
          text: getGridCellText(row, key),
          placeholder: 'Nhập dữ liệu',
        })),
      };
    })];
  }, [rows, spec]);

  const dirtyRows = useMemo(() => getDirtyRows(exerciseType, rows), [exerciseType, rows]);
  const dirtyCount = dirtyRows.length;
  const selectedRow = selectedCell ? rows.find((row) => row.rowId === selectedCell.rowId) : null;
  const selectedColumn = selectedCell ? spec.columns.find((column) => column.key === selectedCell.columnId) : null;
  const selectedValue = selectedRow && selectedColumn ? selectedRow.values[selectedColumn.key] || '' : '';

  const updateCell = (rowId, columnId, value) => {
    setRows((current) => current.map((row) => row.rowId === rowId
      ? { ...row, values: { ...row.values, [columnId]: value } }
      : row));
    setIssues([]);
    setError('');
    setNotice('');
  };

  const handleCellsChanged = (changes) => {
    setRows((current) => {
      const valuesByRow = new Map();
      for (const change of changes) {
        if (!valuesByRow.has(change.rowId)) valuesByRow.set(change.rowId, {});
        valuesByRow.get(change.rowId)[change.columnId] = change.newCell?.text ?? '';
      }
      return current.map((row) => valuesByRow.has(row.rowId)
        ? { ...row, values: { ...row.values, ...valuesByRow.get(row.rowId) } }
        : row);
    });
    setIssues([]);
    setError('');
    setNotice('');
  };

  const addRow = () => {
    setRows((current) => [...current, blankEditorRow(exerciseType, current.length + 1)]);
    setNotice('Đã thêm một dòng mới. Điền các cột theo mẫu rồi lưu.');
  };

  const removeNewRow = () => {
    if (!selectedRow?.isNew) return;
    setRows((current) => current.filter((row) => row.rowId !== selectedRow.rowId));
    setSelectedCell(null);
    setIssues([]);
  };

  const downloadCurrent = () => downloadWorkbook(exerciseType, rows, 'du-lieu-hien-tai');

  const close = () => {
    if (dirtyCount && !window.confirm('Bạn có chỉnh sửa chưa lưu. Đóng bảng và bỏ các thay đổi này?')) return;
    onClose?.();
  };

  const save = async () => {
    if (!onSave || saving) return;
    const validationIssues = validateEditorRows(exerciseType, rows);
    setIssues(validationIssues);
    setError('');
    setNotice('');
    if (validationIssues.length) {
      setError(`Có ${validationIssues.length} lỗi cần sửa trước khi lưu.`);
      return;
    }
    if (!dirtyCount) {
      setNotice('Chưa có thay đổi nào cần lưu.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ rows, dirtyRows });
      setNotice('Đã hoàn tất lưu dữ liệu.');
    } catch (saveError) {
      setError(saveError?.response?.data?.message || saveError.message || 'Không thể lưu dữ liệu.');
    } finally {
      setSaving(false);
    }
  };

  if (!spec) return null;

  return (
    <section className="exercise-sheet-editor" aria-label={`Bảng Excel ${spec.label}`}>
      <header className="exercise-sheet-editor__header">
        <div>
          <p className="exercise-sheet-editor__eyebrow">BẢNG DỮ LIỆU THEO TEMPLATE</p>
          <h3>{spec.label}</h3>
          <p>{formatCount(rows.length)} dòng · sửa nội dung hiện có hoặc thêm dòng mới. Trạng thái và audio đang có được giữ nguyên.</p>
        </div>
        <div className="exercise-sheet-editor__header-actions">
          <button type="button" className="exercise-sheet-editor__button exercise-sheet-editor__button--quiet" onClick={downloadCurrent} disabled={loading || saving}>
            Tải Excel có dữ liệu
          </button>
          {onClose && <button type="button" className="exercise-sheet-editor__button exercise-sheet-editor__button--quiet" onClick={close} disabled={saving}>Đóng bảng</button>}
        </div>
      </header>

      <div className="exercise-sheet-editor__toolbar">
        <p>{spec.guide}</p>
        <div>
          <button type="button" className="exercise-sheet-editor__button exercise-sheet-editor__button--quiet" onClick={addRow} disabled={loading || saving}>+ Thêm dòng</button>
          {selectedRow?.isNew && <button type="button" className="exercise-sheet-editor__button exercise-sheet-editor__button--quiet" onClick={removeNewRow} disabled={saving}>Bỏ dòng mới</button>}
          <button type="button" className="exercise-sheet-editor__button exercise-sheet-editor__button--primary" onClick={save} disabled={loading || saving || !onSave}>
            {saving ? 'Đang lưu…' : `${saveLabel}${dirtyCount ? ` · ${dirtyCount}` : ''}`}
          </button>
        </div>
      </div>

      {loading ? <div className="exercise-sheet-editor__state" role="status">Đang tải toàn bộ dữ liệu…</div> : error && rows.length === 0
        ? <div className="exercise-sheet-editor__state exercise-sheet-editor__state--error" role="alert">{error}</div>
        : <>
          <div className="exercise-sheet-editor__grid-wrap">
            <ReactGrid
              rows={gridRows}
              columns={columns}
              stickyTopRows={1}
              enableRangeSelection
              onCellsChanged={handleCellsChanged}
              onFocusLocationChanged={(location) => setSelectedCell(location?.rowId === 'exercise-sheet-header' ? null : location)}
            />
          </div>
          {selectedRow && selectedColumn && <label className="exercise-sheet-editor__cell-detail">
            <span>{selectedColumn.label} · dòng {rows.findIndex((row) => row.rowId === selectedRow.rowId) + 1}</span>
            <textarea rows={selectedColumn.key === 'englishText' || selectedColumn.key === 'bilingualPairs' || selectedColumn.key === 'explanation' ? 5 : 3}
              value={selectedValue}
              onChange={(event) => updateCell(selectedRow.rowId, selectedColumn.key, event.target.value)}
              aria-label={`Chỉnh sửa ${selectedColumn.label}`} />
          </label>}
        </>}

      {issues.length > 0 && <div className="exercise-sheet-editor__validation" role="alert">
        <strong>Các ô cần chỉnh sửa</strong>
        <ul>{issues.slice(0, 40).map((issue, index) => <li key={`${issue.rowId}-${issue.field}-${index}`}>Dòng {issue.rowNumber} · {issue.label}: {issue.message}</li>)}</ul>
        {issues.length > 40 && <p>Còn {issues.length - 40} lỗi khác.</p>}
      </div>}
      {error && rows.length > 0 && <div className="exercise-sheet-editor__state exercise-sheet-editor__state--error" role="alert">{error}</div>}
      {notice && <div className="exercise-sheet-editor__state" role="status">{notice}</div>}
      <p className="exercise-sheet-editor__footnote">Xóa một dòng trong bảng không xóa bản ghi trong hệ thống. Hãy dùng thao tác Xóa ở danh sách quản lý để xóa dữ liệu.</p>
    </section>
  );
}
