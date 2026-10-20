import { useEffect, useRef, useState } from 'react';
import { enrollmentApi } from '../../api/enrollmentApi.js';
import './EnrollmentConfirmationModal.css';

export default function EnrollmentConfirmationModal({ course, open, onClose, onEnrolled }) {
  const dialogRef = useRef(null);
  const submittingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onEnrolledRef = useRef(onEnrolled);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  onCloseRef.current = onClose;
  onEnrolledRef.current = onEnrolled;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return undefined;

    if (!dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleCancel = (event) => {
      event.preventDefault();
      if (!submittingRef.current) onCloseRef.current?.();
    };
    dialog.addEventListener('cancel', handleCancel);

    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, [open]);

  useEffect(() => {
    if (open) setError('');
  }, [course?._id, open]);

  const submitEnrollment = async (event) => {
    event.preventDefault();
    if (!course?._id || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const response = await enrollmentApi.enrollCourse(course._id);
      onEnrolledRef.current?.(response.data?.enrollment || response.data?.data?.enrollment || null);
    } catch (requestError) {
      const message = requestError.response?.data?.message;
      setError(message === 'Already enrolled in this course'
        ? 'Tài khoản đã đăng ký khóa học này. Hãy quay lại danh sách khóa học của bạn.'
        : message || 'Không thể đăng ký khóa học. Vui lòng thử lại.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (!course) return null;

  return (
    <dialog
      ref={dialogRef}
      className="enrollment-confirmation"
      aria-labelledby="enrollment-confirmation-title"
      aria-describedby="enrollment-confirmation-description"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submittingRef.current) onCloseRef.current?.();
      }}
    >
      <section className="enrollment-confirmation__panel">
        <button
          type="button"
          className="enrollment-confirmation__close"
          aria-label="Đóng xác nhận đăng ký"
          disabled={submitting}
          onClick={() => onCloseRef.current?.()}
        >
          ×
        </button>
        <p className="learning-eyebrow">XÁC NHẬN ĐĂNG KÝ</p>
        <h2 id="enrollment-confirmation-title">{course.title}</h2>
        <p id="enrollment-confirmation-description" className="enrollment-confirmation__description">
          Bạn muốn đăng ký khóa học này và bắt đầu học ngay chứ?
        </p>
        {error && <div className="enrollment-confirmation__error" role="alert">{error}</div>}
        <form className="enrollment-confirmation__actions" onSubmit={submitEnrollment}>
          <button type="button" disabled={submitting} onClick={() => onCloseRef.current?.()}>
            Để sau
          </button>
          <button type="submit" className="learning-primary" disabled={submitting}>
            {submitting ? 'Đang đăng ký...' : 'Xác nhận đăng ký'}
          </button>
        </form>
      </section>
    </dialog>
  );
}
