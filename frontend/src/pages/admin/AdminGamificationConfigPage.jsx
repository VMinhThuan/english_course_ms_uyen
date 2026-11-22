import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { adminApi } from '../../api/adminApi.js';
import useAuthStore from '../../store/authStore.js';
import './AdminGamificationPage.css';

const GAME_COPY = {
  streak: {
    eyebrow: 'STREAK CHALLENGE',
    title: 'Cấu hình Thử thách 7 ngày',
    description: 'Điều chỉnh trạng thái vận hành của thử thách học từ vựng hằng ngày.',
  },
  quest: {
    eyebrow: 'VOCABULARY QUEST',
    title: 'Cấu hình Vượt ải TOEIC',
    description: 'Điều chỉnh trạng thái và thời lượng của các lượt chơi theo cấp độ.',
  },
};

export default function AdminGamificationConfigPage() {
  const { game } = useParams();
  const navigate = useNavigate();
  const copy = GAME_COPY[game];
  const role = useAuthStore((state) => state.user?.role);
  const canEdit = role === 'admin';
  const [config, setConfig] = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(120);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!copy) return;
    Promise.all([adminApi.getGamificationConfigs(), adminApi.getGamificationHistory({ limit: 5 })])
      .then(([response, historyResponse]) => {
        const next = response.data?.configs?.find((item) => item.game === game);
        if (!next) throw new Error('Không tìm thấy cấu hình mini game.');
        setConfig(next);
        setEnabled(next.enabled);
        setTimeLimitSeconds(next.timeLimitSeconds || 120);
        setHistory(historyResponse.data?.history || []);
      })
      .catch((loadError) => setError(loadError.response?.data?.message || loadError.message || 'Không thể tải cấu hình.'))
      .finally(() => setLoading(false));
  }, [copy, game]);

  const fields = useMemo(() => game === 'streak'
    ? [
      ['Mục tiêu mỗi ngày', `${config?.dailyWordCount || 20} từ`, 'Cố định theo chính sách streak; không thể thay đổi.'],
      ['Múi giờ tính streak', 'Theo múi giờ học viên', 'Ngày học được tính theo timezone của từng học viên.'],
    ]
    : [
      ['Ngưỡng qua cấp', `${config?.passThreshold || 80}%`, 'Cố định để bảo toàn quy tắc mở khóa đã audit.'],
      ['Số câu mỗi lượt', `${config?.questionCount || 10} câu`, 'Số lượng câu hỏi dùng chung cho các chặng.'],
      ['Số cấp độ', `${config?.levelCount || 4} cấp`, 'Bản đồ TOEIC hiện có bốn cấp độ.'],
    ], [config, game]);

  if (!copy) return <div className="admin-error">Mini game không hợp lệ.</div>;

  const save = async (event) => {
    event.preventDefault();
    if (!canEdit) return;
    if (!enabled && config?.enabled && !window.confirm('Tắt mini game sẽ chặn lượt chơi mới. Các lượt đang diễn ra vẫn được bảo toàn. Bạn có chắc muốn tiếp tục?')) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await adminApi.updateGamificationConfig(game, { enabled, ...(game === 'quest' ? { timeLimitSeconds: Number(timeLimitSeconds) } : {}) });
      setConfig(response.data?.config || config);
      setMessage('Đã lưu cấu hình mini game.');
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Không thể lưu cấu hình.');
    } finally { setSaving(false); }
  };

  return <div className="admin-page-container admin-gamification-page">
    <Link className="admin-gamification-back" to="/admin/gamification">← Quản lý Mini Game</Link>
    <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
    {!canEdit && <div className="admin-gamification-readonly-notice">Teacher chỉ có quyền xem. Chỉ tài khoản admin mới được thay đổi cấu hình mini game.</div>}
    {loading ? <div className="ds-loading-state">Đang tải cấu hình...</div> : <form className="admin-gamification-config" onSubmit={save}>
      <section className="admin-panel admin-gamification-config__panel">
        <div className="admin-panel-head"><div><h2>Trạng thái vận hành</h2><p>Tắt game sẽ ngăn học viên bắt đầu lượt chơi mới.</p></div></div>
        <label className="admin-gamification-toggle"><input type="checkbox" checked={enabled} disabled={!canEdit} onChange={(event) => setEnabled(event.target.checked)} /><span><strong>{enabled ? 'Đang bật' : 'Đang tắt'}</strong><small>{enabled ? 'Học viên có thể bắt đầu game.' : 'Học viên sẽ nhận thông báo tạm ngưng.'}</small></span></label>
      </section>
      <section className="admin-panel admin-gamification-config__panel">
        <div className="admin-panel-head"><div><h2>Quy tắc cố định</h2><p>Các giá trị này không cho chỉnh sửa để giữ đúng luật game.</p></div></div>
        <div className="admin-gamification-readonly-grid">{fields.map(([label, value, hint]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>)}</div>
        {game === 'quest' && <label className="admin-gamification-field"><span>Thời lượng mỗi lượt Quest (giây)</span><input type="number" min="60" max="600" step="1" value={timeLimitSeconds} disabled={!canEdit} onChange={(event) => setTimeLimitSeconds(event.target.value)} /><small>Cho phép từ 60 đến 600 giây. Timer được kiểm tra ở server.</small></label>}
      </section>
      {game === 'quest' && <section className="admin-panel admin-gamification-config__panel"><div className="admin-panel-head"><div><h2>Level & chặng Quest</h2><p>Mỗi chặng dùng vocabulary assignment đúng TOEIC level. Cần tối thiểu 10 từ để bắt đầu lượt.</p></div><Link className="admin-text-link" to="/admin/gamification/vocabulary">Quản lý assignment</Link></div><div className="admin-gamification-stage-grid">{[1, 2, 3, 4].flatMap((level) => [1, 2, 3, 4].map((stage) => { const assignment = config?.questStages?.find((item) => item.level === level && item.stage === stage); return <Link className="admin-gamification-stage" to={`/admin/gamification/preview/${level}/${stage}`} key={`${level}-${stage}`}><span>LEVEL {level} · CHẶNG {stage}</span><strong>{assignment?.vocabularyIds?.length || 0} từ</strong><small>{assignment?.vocabularyIds?.length ? 'Đã gán' : 'Chưa gán'}</small><em>Preview</em></Link>; }))}</div></section>}
      {error && <div className="admin-error" role="alert">{error}</div>}
      {message && <div className="admin-gamification-success" role="status">{message}</div>}
      {history.length > 0 && <section className="admin-panel admin-gamification-config__panel admin-gamification-config-history"><div className="admin-panel-head"><div><h2>Lịch sử gần đây</h2><p>{history.slice(0, 3).map((item) => `${item.game === game ? 'Cấu hình này' : 'Mini game khác'} · ${item.changedBy?.fullName || item.changedBy?.email || 'Admin'}`).join(' · ')}</p></div></div></section>}
      <div className="admin-gamification-form-actions"><button className="admin-primary-button" type="submit" disabled={saving || !canEdit}>{saving ? 'Đang lưu...' : canEdit ? 'Lưu cấu hình' : 'Chỉ xem'}</button><button className="admin-quiet-button" type="button" onClick={() => navigate('/admin/gamification')}>Hủy</button></div>
    </form>}
  </div>;
}
