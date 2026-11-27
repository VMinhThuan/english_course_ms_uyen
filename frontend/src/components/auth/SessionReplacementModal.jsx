import './SessionReplacementModal.css';

export default function SessionReplacementModal({ open, onRelogin }) {
  if (!open) return null;
  return (
    <div className="session-replacement-backdrop" role="presentation">
      <div className="session-replacement-modal" role="dialog" aria-modal="true" aria-labelledby="session-replacement-title">
        <h2 id="session-replacement-title">Phiên đăng nhập đã kết thúc</h2>
        <p>Tài khoản của bạn vừa được đăng nhập trên một thiết bị khác. Mỗi tài khoản chỉ được sử dụng trên một thiết bị tại cùng một thời điểm.</p>
        <button type="button" onClick={onRelogin} autoFocus>Đăng nhập lại</button>
      </div>
    </div>
  );
}
