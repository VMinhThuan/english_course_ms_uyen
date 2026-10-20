import { Link, useLocation } from 'react-router-dom';
import AuthLayout from '../components/layouts/AuthLayout.jsx';

export default function AccountStatusPage() {
  const location = useLocation();
  const { state } = location;
  const status = state?.status || new URLSearchParams(location.search).get('status') || 'pending';
  const content = {
    pending: {
      title: state?.registered ? 'Đăng ký thành công' : 'Tài khoản đang chờ phê duyệt',
      message: 'Tài khoản của bạn đang chờ giáo viên phê duyệt. Sau khi được kích hoạt, bạn có thể đăng nhập và bắt đầu học.',
      icon: '✓',
    },
    suspended: {
      title: 'Tài khoản đang tạm khóa',
      message: 'Tài khoản của bạn hiện đang bị tạm khóa. Vui lòng liên hệ giáo viên hoặc quản trị viên để được hỗ trợ.',
      icon: '!',
    },
    rejected: {
      title: 'Yêu cầu đăng ký chưa được chấp nhận',
      message: 'Tài khoản của bạn hiện chưa được phê duyệt. Vui lòng liên hệ giáo viên nếu bạn cần thêm thông tin.',
      icon: '!',
    },
  }[status] || null;

  return (
    <AuthLayout title={content.title} subtitle="Thông tin trạng thái tài khoản" showTabs={false}>
      <section className={`auth-status-card ${status !== 'pending' ? 'is-locked' : ''}`} aria-live="polite">
        <div className="auth-status-icon" aria-hidden="true">
          {content.icon}
        </div>
        <h2>{content.title}</h2>
        <p>{content.message}</p>
        <div className="auth-status-actions">
          <Link className="btn-auth-submit auth-status-cta" to="/">Về trang chủ</Link>
          <Link className="auth-status-secondary" to="/login">Đăng nhập bằng tài khoản khác</Link>
        </div>
      </section>
    </AuthLayout>
  );
}
