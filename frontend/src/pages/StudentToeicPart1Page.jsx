import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../components/ui/PageHeader.jsx';
import { part1DictationApi } from '../api/part1DictationApi.js';
import { resolveMediaUrl } from '../utils/mediaUrl.js';
import './Part1Dictation.css';

export default function StudentToeicPart1Page() {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const chooseItem = useCallback(async (id) => {
    setError('');
    setResults(null);
    try {
      const response = await part1DictationApi.getStudentItem(id);
      const item = response.data.item;
      setActive(item);
      setAnswers(Array.from({ length: item.answerCount }, () => ''));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể mở bài chép chính tả.');
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await part1DictationApi.getStudentItems();
      const nextItems = response.data.items || [];
      setItems(nextItems);
      if (nextItems[0]) await chooseItem(nextItems[0]._id);
      else setActive(null);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể tải bài chép chính tả Part 1.');
    } finally {
      setLoading(false);
    }
  }, [chooseItem]);

  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    if (!active) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await part1DictationApi.submit(active._id, answers);
      setResults(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể chấm bài. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="part1-page" data-testid="part1-dictation-student-page">
    <PageHeader eyebrow="TOEIC · Dictation" title="Luyện nghe Part 1" description="Nghe audio, chép lại từng câu và nhận kết quả ngay sau khi nộp." />
    {loading ? <div className="ds-loading-state">Đang tải bài nghe…</div>
      : error && !active ? <div className="ds-error-state"><strong>{error}</strong><button type="button" className="ds-button ds-button--danger" onClick={load}>Thử lại</button></div>
        : items.length === 0 ? <div className="part1-empty"><strong>Chưa có bài nghe để luyện.</strong><p>Giáo viên sẽ mở bài mới tại đây khi sẵn sàng.</p></div>
          : <div className="part1-workspace">
            <aside className="part1-playlist" aria-label="Danh sách bài nghe">
              <p className="part1-playlist__eyebrow">BÀI LUYỆN ĐANG MỞ</p>
              {items.map((item, index) => <button type="button" key={item._id} className={`part1-playlist__item${active?._id === item._id ? ' is-active' : ''}`} onClick={() => chooseItem(item._id)}>
                <span>{String(index + 1).padStart(2, '0')}</span><strong>{item.title}</strong><small>{item.answerCount} câu cần chép</small>
              </button>)}
            </aside>
            {active && <section className="part1-listening-card">
              <div className="part1-listening-card__header"><div><p className="part1-playlist__eyebrow">NGHE VÀ CHÉP LẠI</p><h2>{active.title}</h2></div><span>{active.answerCount} câu</span></div>
              <div className="part1-audio"><span aria-hidden="true">♫</span><audio controls preload="metadata" src={resolveMediaUrl(active.audioUrl)}>Trình duyệt của bạn không hỗ trợ phát audio.</audio></div>
              <form onSubmit={submit} className="part1-answer-form">
                <p>Nhập câu bạn nghe được. Hệ thống không phân biệt chữ hoa và chữ thường.</p>
                {answers.map((answer, index) => {
                  const result = results?.results[index];
                  return <label key={index} className={`part1-answer-row${result ? (result.isCorrect ? ' is-correct' : ' is-incorrect') : ''}`}>
                    <span>{index + 1}</span><input value={answer} disabled={submitting} onChange={(event) => { const next = [...answers]; next[index] = event.target.value; setAnswers(next); setResults(null); }} placeholder={`Nhập câu ${index + 1}`} aria-label={`Đáp án câu ${index + 1}`} />
                    {result && <b>{result.isCorrect ? 'Đúng' : 'Chưa đúng'}</b>}
                    {result && !result.isCorrect && <span className="part1-answer-correction"><strong>Đáp án đúng:</strong> {result.correctAnswer}</span>}
                  </label>;
                })}
                {error && <p className="part1-form-error" role="alert">{error}</p>}
                {results && <div className="part1-score" role="status"><strong>{results.correctCount}/{results.total}</strong><span>câu đúng</span></div>}
                <button className="ds-button ds-button--primary" type="submit" disabled={submitting}>{submitting ? 'Đang chấm…' : 'Nộp bài để kiểm tra'}</button>
              </form>
            </section>}
          </div>}
  </main>;
}
