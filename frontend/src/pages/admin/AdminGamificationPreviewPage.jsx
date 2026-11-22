import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { adminApi } from '../../api/adminApi.js';
import './AdminGamificationPage.css';

export default function AdminGamificationPreviewPage() {
  const { level, stage } = useParams();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { adminApi.previewGamificationQuest(level, stage).then((response) => setPreview(response.data?.preview)).catch((loadError) => setError(loadError.response?.data?.message || 'Không thể tạo preview chặng chơi.')).finally(() => setLoading(false)); }, [level, stage]);
  return <div className="admin-page-container admin-gamification-page"><Link className="admin-gamification-back" to="/admin/gamification/quest">← Cấu hình Vocabulary Quest</Link><PageHeader eyebrow={`TOEIC LEVEL ${level} · CHẶNG ${stage}`} title="Preview câu hỏi Quest" description="Preview được tạo từ vocabulary đã publish và assignment hiện tại; không tạo attempt và không ảnh hưởng tiến độ học viên." />{loading && <div className="ds-loading-state">Đang tạo preview...</div>}{error && <div className="admin-error" role="alert">{error}</div>}{preview && <section className="admin-gamification-preview-grid">{preview.questions.map((question, index) => <article className="admin-panel admin-gamification-preview-card" key={question.questionId}><span>CÂU {index + 1}</span><h2>{question.prompt}</h2>{question.sentence && <p>{question.sentence}</p>}<div>{question.options.map((option) => <div key={option.id}>{option.text}</div>)}</div></article>)}</section>}</div>;
}
