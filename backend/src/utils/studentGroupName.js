export const normalizeStudentGroupName = (value) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : null;

export const isValidStudentGroupName = (value) =>
  typeof value === 'string' && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
