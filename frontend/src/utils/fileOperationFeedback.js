export const FILE_OPERATION_FEEDBACK_EVENT = 'toeic:file-operation-feedback';

export const notifyFileOperation = ({
  action = 'save',
  outcome = 'success',
  message,
  code = '',
  onClose,
} = {}) => {
  if (typeof window === 'undefined' || !message) return;

  window.dispatchEvent(new CustomEvent(FILE_OPERATION_FEEDBACK_EVENT, {
    detail: { action, outcome, message: String(message), code: String(code || ''), onClose },
  }));
};
