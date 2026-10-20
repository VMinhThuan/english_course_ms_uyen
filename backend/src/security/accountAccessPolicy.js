const STUDENT_STATUS_ERRORS = {
  pending: {
    statusCode: 403,
    code: 'ACCOUNT_PENDING',
    message: 'Tài khoản của bạn đang chờ giáo viên/Admin phê duyệt.',
  },
  suspended: {
    statusCode: 403,
    code: 'ACCOUNT_SUSPENDED',
    message: 'Tài khoản của bạn đã bị tạm khóa.',
  },
  rejected: {
    statusCode: 403,
    code: 'ACCOUNT_REJECTED',
    message: 'Tài khoản của bạn đã bị từ chối phê duyệt.',
  },
};

export const getStudentStatusError = (user) => {
  if (user?.role !== 'student') return null;
  if (STUDENT_STATUS_ERRORS[user.status]) return STUDENT_STATUS_ERRORS[user.status];
  if (user.status !== 'active' || !user.isActive) {
    return {
      statusCode: 403,
      code: 'ACCOUNT_NOT_ACTIVE',
      message: 'Tài khoản chưa được kích hoạt.',
    };
  }
  return null;
};

export const getSuspendedAccountError = (user) =>
  user?.role === 'student' && user.status === 'suspended'
    ? STUDENT_STATUS_ERRORS.suspended
    : null;

export const isTokenIssuedBeforeSuspension = (user, issuedAtSeconds) => {
  if (!user?.suspendedAt) return false;
  const suspendedAtMs = new Date(user.suspendedAt).getTime();
  if (!Number.isFinite(suspendedAtMs) || !Number.isFinite(Number(issuedAtSeconds))) return true;
  // JWT iat has second precision. Reject tokens from the suspension second too,
  // so a token minted just before the suspension write cannot survive it.
  return Number(issuedAtSeconds) <= Math.floor(suspendedAtMs / 1000);
};

export const getRevokedSessionError = () => ({
  statusCode: 401,
  code: 'SESSION_REVOKED',
  message: 'Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.',
});
