import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { adminPart2ChallengeApi } from '../../api/adminPart2ChallengeApi.js';
import './AdminPart2ChallengePage.css';

export default function AdminPart2ChallengePage() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingNumber, setUpdatingNumber] = useState(null);
  const [notice, setNotice] = useState({ type: '', text: '' });

  const load = async () => {
    setLoading(true);
    try {
      const response = await adminPart2ChallengeApi.getQuestions();
      setItems(response.data?.items || []);
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Không thể tải danh sách Part 2 Challange.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visibleCount = items.filter((item) => item.isVisible).length;
  const hiddenCount = items.length - visibleCount;
  const filteredItems = useMemo(() => {
    const value = query.trim().toLocaleLowerCase('vi');
    if (!value) return items;
    return items.filter((item) => [
      String(item.number),
      item.questionText,
      item.script,
      item.translation,
      item.correctAnswer,
      ...item.choices.map((choice) => `${choice.letter} ${choice.text}`),
    ].some((text) => String(text || '').toLocaleLowerCase('vi').includes(value)));
  }, [items, query]);

  const toggleVisibility = async (item) => {
    setUpdatingNumber(item.number);
    setNotice({ type: '', text: '' });
    try {
      await adminPart2ChallengeApi.setVisibility(item.number, !item.isVisible);
      setItems((current) => current.map((question) => (
        question.number === item.number ? { ...question, isVisible: !item.isVisible } : question
      )));
      setNotice({
        type: 'success',
        text: `Đã ${item.isVisible ? 'ẩn' : 'hiện'} câu số ${item.number} với học viên.`,
      });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Không thể đổi trạng thái câu hỏi.' });
    } finally {
      setUpdatingNumber(null);
    }
  };

  return (
    <main className="admin-part2-challenge-page">
      <PageHeader
        eyebrow="TOEIC · PART 2"
        title="Part 2 Challange"
        description="Xem bộ 110 câu hỏi, nghe audio và kiểm soát câu nào đang hiển thị với học viên."
      />

      {notice.text && <div className={`admin-part2-notice is-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</div>}

      <section className="admin-part2-summary" aria-label="Tổng quan Part 2 Challange">
        <article><span>Tổng số câu</span><strong>{items.length}</strong></article>
        <article><span>Đang hiển thị</span><strong>{visibleCount}</strong></article>
        <article><span>Đang ẩn</span><strong>{hiddenCount}</strong></article>
      </section>

      <section className="admin-part2-list">
        <div className="admin-part2-list__header">
          <div><p>THƯ VIỆN PART 2</p><h2>Danh sách câu hỏi</h2></div>
          <span>{filteredItems.length}/{items.length} câu</span>
        </div>
        <label className="admin-part2-search">
          <span>Tìm câu hỏi</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập số câu, đáp án hoặc nội dung…" />
        </label>

        {loading ? <div className="admin-part2-state">Đang tải danh sách…</div>
          : filteredItems.length === 0 ? <div className="admin-part2-state">Không tìm thấy câu hỏi phù hợp.</div>
            : <div className="admin-part2-questions">
              {filteredItems.map((item) => (
                <details className="admin-part2-question" key={item.number}>
                  <summary>
                    <strong>Câu số {item.number}</strong>
                    <span className={`admin-part2-status ${item.isVisible ? 'is-visible' : 'is-hidden'}`}>
                      {item.isVisible ? 'Đang hiện' : 'Đang ẩn'}
                    </span>
                    <small>Đáp án {item.correctAnswer} · {item.audioUrl ? 'Có audio' : 'Thiếu audio'}</small>
                  </summary>
                  <div className="admin-part2-question__body">
                    {item.audioUrl ? <audio controls preload="none" src={item.audioUrl}>Trình duyệt không hỗ trợ phát audio.</audio>
                      : <p className="admin-part2-audio-missing">Chưa có đường dẫn audio.</p>}
                    <p className="admin-part2-question__prompt">{item.questionText}</p>
                    <ol className="admin-part2-choices" type="A">
                      {item.choices.map((choice) => (
                        <li className={choice.letter === item.correctAnswer ? 'is-correct' : ''} key={choice.letter}>
                          <strong>{choice.letter}.</strong> {choice.text}
                        </li>
                      ))}
                    </ol>
                    <div className="admin-part2-script"><strong>Script</strong><p>{item.script}</p></div>
                    <div className="admin-part2-script"><strong>Dịch nghĩa</strong><p>{item.translation}</p></div>
                    <button
                      type="button"
                      className={item.isVisible ? 'ds-button ds-button--danger' : 'ds-button ds-button--primary'}
                      disabled={updatingNumber === item.number}
                      onClick={() => toggleVisibility(item)}
                    >
                      {updatingNumber === item.number ? 'Đang cập nhật…' : item.isVisible ? 'Ẩn câu này với học viên' : 'Hiện câu này với học viên'}
                    </button>
                  </div>
                </details>
              ))}
            </div>}
      </section>
    </main>
  );
}
