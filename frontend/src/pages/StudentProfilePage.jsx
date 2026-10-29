import { useState, useEffect } from 'react';
import useAuthStore from '../store/authStore.js';
import { authApi } from '../api/authApi.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import UiButton from '../components/ui/UiButton.jsx';
import './StudentProfilePage.css';

export default function StudentProfilePage() {
  const user = useAuthStore((state) => state.user);
  const fetchUser = useAuthStore((state) => state.fetchUser);

  // Profile Form state
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [groupName, setGroupName] = useState(user?.groupName || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });
  const [profileLoading, setProfileLoading] = useState(false);

  // Password Form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState({ type: '', text: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName || '');
      setGroupName(user.groupName || '');
      setPhoneNumber(user.phoneNumber || '');
    }
  }, [user]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileMsg({ type: '', text: '' });

    if (!fullName.trim()) {
      setProfileMsg({ type: 'error', text: 'Họ và tên không được để trống' });
      return;
    }

    try {
      setProfileLoading(true);
      const res = await authApi.updateProfile({ fullName, phoneNumber, groupName });
      if (res.status === 'success') {
        setProfileMsg({ type: 'success', text: 'Cập nhật thông tin cá nhân thành công!' });
        await fetchUser();
      }
    } catch (err) {
      setProfileMsg({
        type: 'error',
        text: err.response?.data?.message || 'Cập nhật thất bại. Vui lòng thử lại.',
      });
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMsg({ type: '', text: '' });

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Vui lòng điền đầy đủ 3 trường mật khẩu' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Mật khẩu mới và xác nhận mật khẩu không khớp' });
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
      return;
    }

    try {
      setPasswordLoading(true);
      const res = await authApi.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      if (res.status === 'success') {
        setPasswordMsg({ type: 'success', text: 'Đổi mật khẩu thành công!' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setPasswordMsg({
        type: 'error',
        text: err.response?.data?.message || 'Đổi mật khẩu thất bại. Vui lòng kiểm tra lại.',
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="profile-page-container">
      <PageHeader eyebrow="Tài khoản" title="Hồ sơ cá nhân & bảo mật" description="Quản lý thông tin tài khoản và cập nhật mật khẩu đăng nhập." />

      <div className="profile-grid">
        {/* Account Info Card */}
        <div className="profile-card">
          <h2>Thông Tin Tài Khoản</h2>
          <div className="account-info-box">
            <div className="info-row">
              <span className="info-label">Email:</span>
              <span className="info-value"><strong>{user?.email}</strong></span>
            </div>
            <div className="info-row">
              <span className="info-label">Vai trò:</span>
              <span className="info-value badge-role">{user?.role === 'admin' ? 'Quản trị viên' : 'Học viên'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Trạng thái:</span>
              <StatusBadge status={user?.status} label={user?.status === 'active' ? 'Đã kích hoạt' : undefined} />
            </div>
          </div>

          <form onSubmit={handleUpdateProfile} className="profile-form">
            <h3>Chỉnh Sửa Thông Tin Cá Nhân</h3>
            {profileMsg.text && (
              <div className={`form-alert ${profileMsg.type}`}>
                {profileMsg.text}
              </div>
            )}

            <div className="form-group">
              <label>Họ và tên *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nhập họ và tên..."
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="student-group-name">Tên nhóm</label>
              <input
                id="student-group-name"
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Nhập tên nhóm học..."
                maxLength={100}
              />
            </div>

            <div className="form-group">
              <label>Số điện thoại</label>
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Nhập số điện thoại..."
              />
            </div>

            <UiButton type="submit" disabled={profileLoading}>
              {profileLoading ? 'Đang lưu...' : 'Lưu Thay Đổi'}
            </UiButton>
          </form>
        </div>

        {/* Change Password Card */}
        <div className="profile-card">
          <h2>Đổi Mật Khẩu</h2>
          <form onSubmit={handleChangePassword} className="profile-form">
            {passwordMsg.text && (
              <div className={`form-alert ${passwordMsg.type}`}>
                {passwordMsg.text}
              </div>
            )}

            <div className="form-group">
              <label>Mật khẩu hiện tại *</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Nhập mật khẩu hiện tại..."
                required
              />
            </div>

            <div className="form-group">
              <label>Mật khẩu mới * (Tối thiểu 6 ký tự)</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nhập mật khẩu mới..."
                required
              />
            </div>

            <div className="form-group">
              <label>Xác nhận mật khẩu mới *</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Xác nhận mật khẩu mới..."
                required
              />
            </div>

            <UiButton type="submit" disabled={passwordLoading}>
              {passwordLoading ? 'Đang xử lý...' : 'Cập Nhật Mật Khẩu'}
            </UiButton>
          </form>
        </div>
      </div>
    </div>
  );
}
