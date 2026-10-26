import { useEffect, useRef, useState } from 'react';
import { FILE_OPERATION_FEEDBACK_EVENT } from '../../utils/fileOperationFeedback.js';
import './FileOperationDialog.css';

const getTitle = ({ action, outcome }) => {
  if (outcome === 'error') {
    if (action === 'download') return 'Không thể tải tài liệu';
    if (action === 'upload') return 'Không thể tải tệp lên';
    if (action === 'lesson') return 'Không thể lưu bài học';
    if (action === 'save') return 'Không thể lưu tài liệu';
    return 'Thao tác chưa hoàn tất';
  }

  if (action === 'download') return 'Tải xuống đã được bắt đầu';
  if (action === 'upload') return 'Đã tải tệp lên';
  if (action === 'lesson') return 'Đã lưu bài học';
  if (action === 'save') return 'Đã lưu tài liệu';
  return 'Thao tác hoàn tất';
};

export default function FileOperationDialog() {
  const [notice, setNotice] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    const handleFeedback = (event) => setNotice(event.detail || null);
    window.addEventListener(FILE_OPERATION_FEEDBACK_EVENT, handleFeedback);
    return () => window.removeEventListener(FILE_OPERATION_FEEDBACK_EVENT, handleFeedback);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (notice && dialog && !dialog.open) dialog.showModal();
  }, [notice]);

  const close = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
    const onClose = notice?.onClose;
    setNotice(null);
    if (typeof onClose === 'function') onClose();
  };

  if (!notice) return null;

  const isError = notice.outcome === 'error';
  return (
    <dialog
      ref={dialogRef}
      className={`file-operation-dialog${isError ? ' is-error' : ' is-success'}`}
      aria-labelledby="file-operation-title"
      aria-describedby="file-operation-message"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
    >
      <div className="file-operation-dialog__icon" aria-hidden="true">
        {isError ? '!' : '✓'}
      </div>
      <h2 id="file-operation-title">{getTitle(notice)}</h2>
      <p id="file-operation-message">{notice.message}</p>
      {notice.code && <code className="file-operation-dialog__code">Mã lỗi: {notice.code}</code>}
      <button type="button" autoFocus onClick={close}>Đóng</button>
    </dialog>
  );
}
