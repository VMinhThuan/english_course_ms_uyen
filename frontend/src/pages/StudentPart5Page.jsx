import { useCallback, useEffect, useState } from 'react';
import { assessmentApi } from '../api/assessmentApi.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import './StudentPart5Page.css';

export default function StudentPart5Page() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await assessmentApi.getStudentPart5Questions({ page, limit: 20, search: search.trim() });
      setItems(response.data?.items || []);
      setPages(response.data?.pagination?.pages || 1);
      setResults({}); setAnswers({});
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể tải ngân hàng câu hỏi Part 5.');
    } finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const submit = async (question) => {
    const answer = answers[question._id];
    if (!answer) { setError(`Chọn đáp án cho câu ${items.indexOf(question) + 1} trước khi kiểm tra.`); return; }
    setSubmittingId(question._id); setError('');
    try {
      const response = await assessmentApi.submitStudentPart5Answer(question._id, answer);
      setResults((current) => ({ ...current, [question._id]: response.data }));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể kiểm tra đáp án.');
    } finally { setSubmittingId(''); }
  };

  return <main className="student-part5-page">
    <PageHeader eyebrow="TOEIC · PART 5" title="Ngân hàng câu hỏi Part 5" description="Chọn đáp án cho từng câu và kiểm tra ngay. Đáp án đúng chỉ được trả về sau khi bạn nộp câu đó." />
    <label className="student-part5-search"><span>Tìm câu hỏi</span><input type="search" value={search} placeholder="Nhập nội dung câu hỏi..." onChange={(event) => { setPage(1); setSearch(event.target.value); }} /></label>
    {error && <div className="student-part5-error" role="alert">{error}<button type="button" onClick={() => setError('')}>Đóng</button></div>}
    {loading ? <div className="ds-loading-state">Đang tải câu hỏi…</div>
      : items.length ? <div className="student-part5-list">{items.map((question, index) => {
        const result = results[question._id];
        return <article className={`student-part5-card${result ? (result.isCorrect ? ' is-correct' : ' is-incorrect') : ''}`} key={question._id}>
          <div className="student-part5-question"><span>Câu {(page - 1) * 20 + index + 1}</span><h2>{question.questionText}</h2></div>
          <fieldset className="student-part5-options"><legend>Chọn một đáp án</legend>{(question.options || []).map((option) => <label className={result?.correctOption?.id === option.id ? 'is-answer' : ''} key={option.id}><input type="radio" name={`part5-${question._id}`} value={option.id} checked={answers[question._id] === option.id} disabled={Boolean(result) || submittingId === question._id} onChange={() => setAnswers((current) => ({ ...current, [question._id]: option.id }))} /><span className="student-part5-option-id">{option.id}</span><span>{option.text}</span></label>)}</fieldset>
          {result && <div className={`student-part5-feedback ${result.isCorrect ? 'is-correct' : 'is-incorrect'}`} role="status"><strong>{result.isCorrect ? 'Chính xác' : `Chưa đúng · Đáp án: ${result.correctOption?.id || ''}`}</strong>{result.explanation && <p>{result.explanation}</p>}</div>}
          <button type="button" className="ds-button ds-button--primary" disabled={!answers[question._id] || Boolean(result) || submittingId === question._id} onClick={() => submit(question)}>{submittingId === question._id ? 'Đang kiểm tra…' : result ? 'Đã kiểm tra' : 'Kiểm tra đáp án'}</button>
        </article>;
      })}</div> : <div className="ds-empty-state">Chưa có câu hỏi Part 5 được hiển thị.</div>}
    {!loading && pages > 1 && <nav className="student-part5-pagination" aria-label="Phân trang câu hỏi"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>← Trang trước</button><span>Trang {page}/{pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Trang sau →</button></nav>}
  </main>;
}
