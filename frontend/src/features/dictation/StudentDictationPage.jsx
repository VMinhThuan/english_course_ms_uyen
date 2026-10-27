import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { part1DictationApi } from '../../api/part1DictationApi.js';
import { vocabularyDictationApi } from '../../api/vocabularyDictationApi.js';
import { resolveMediaUrl } from '../../utils/mediaUrl.js';
import '../../pages/Part1Dictation.css';

const dictationApis = { part1: part1DictationApi, vocabulary: vocabularyDictationApi };

export default function StudentDictationPage({ kind = 'part1' }) {
  const isVocabulary = kind === 'vocabulary';
  const api = dictationApis[kind] || dictationApis.part1;
  const pageTitle = isVocabulary ? 'Chép chính tả từ vựng' : 'Chép chính tả Part 1';
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
      const response = await api.getStudentItem(id);
      const item = response.data.item;
      setActive(item);
      setAnswers(Array.from({ length: item.answerCount }, () => ''));
    } catch (requestError) {
      setError(requestError.response?.data?.message || `Không thể mở bài ${pageTitle.toLocaleLowerCase('vi')}.`);
    }
  }, [api, pageTitle]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getStudentItems();
      const nextItems = response.data.items || [];
      setItems(nextItems);
      if (nextItems[0]) await chooseItem(nextItems[0]._id);
      else setActive(null);
    } catch (requestError) {
      setError(requestError.response?.data?.message || `Không thể tải danh sách ${pageTitle.toLocaleLowerCase('vi')}.`);
    } finally {
      setLoading(false);
    }
  }, [api, chooseItem, pageTitle]);

  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    if (!active) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await api.submit(active._id, answers);
      setResults(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể chấm bài. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="part1-page" data-testid={isVocabulary ? 'vocabulary-dictation-student-page' : 'part1-dictation-student-page'}>
    <PageHeader
      eyebrow={isVocabulary ? 'Vocabulary · Dictation' : 'TOEIC · Part 1'}
      title={pageTitle}
      description={isVocabulary
        ? 'Luyện từng nhóm từ, nhập đáp án tiếng Anh và xem nghĩa sau khi nộp.'
        : 'Nghe audio, chép lại từng câu và xem đáp án mẫu sau khi nộp.'}
    />
    {loading ? <div className="ds-loading-state">Đang tải bài nghe…</div>
      : error && !active ? <div className="ds-error-state"><strong>{error}</strong><button type="button" className="ds-button ds-button--danger" onClick={load}>Thử lại</button></div>
        : items.length === 0 ? <div className="part1-empty"><strong>Chưa có bài nghe để luyện.</strong><p>Giáo viên sẽ mở bài mới tại đây khi sẵn sàng.</p></div>
          : <div className="part1-workspace">
            <aside className="part1-playlist" aria-label="Danh sách bài nghe">
              <p className="part1-playlist__eyebrow">BÀI LUYỆN ĐANG MỞ</p>
              {items.map((item, index) => <button type="button" key={item._id} className={`part1-playlist__item${active?._id === item._id ? ' is-active' : ''}`} onClick={() => chooseItem(item._id)}>
                <span>{String(index + 1).padStart(2, '0')}</span><strong>{item.title}</strong><small>{item.answerCount} {isVocabulary ? 'từ cần chép' : 'câu cần chép'}</small>
              </button>)}
            </aside>
            {active && <section className="part1-listening-card">
              <div className="part1-listening-card__header"><div><p className="part1-playlist__eyebrow">{active.audioUrl ? 'NGHE VÀ CHÉP LẠI' : 'ÔN TẬP VÀ ĐIỀN ĐÁP ÁN'}</p><h2>{active.title}</h2></div><span>{active.answerCount} {isVocabulary ? 'từ' : 'câu'}</span></div>
              <div className="part1-audio"><span aria-hidden="true">♫</span>{active.audioUrl
                ? <audio controls preload="metadata" src={resolveMediaUrl(active.audioUrl)}>Trình duyệt của bạn không hỗ trợ phát audio.</audio>
                : <p className="part1-audio__missing">Audio chưa được cập nhật. Bạn vẫn có thể làm bài và xem đáp án sau khi nộp.</p>}
              </div>
              <form onSubmit={submit} className="part1-answer-form">
                <p>{active.audioUrl
                  ? (isVocabulary ? 'Nghe audio và nhập từ hoặc cụm từ tiếng Anh tương ứng.' : 'Nhập câu bạn nghe được. Hệ thống không phân biệt chữ hoa và chữ thường.')
                  : 'Nhập đáp án theo từng dòng. Hệ thống không phân biệt chữ hoa và chữ thường.'}</p>
                {answers.map((answer, index) => {
                  const result = results?.results[index];
                  return <label key={index} className={`part1-answer-row${result ? (result.isCorrect ? ' is-correct' : ' is-incorrect') : ''}`}>
                    <span>{index + 1}</span>
                    <input
                      value={answer}
                      disabled={submitting}
                      onChange={(event) => { const next = [...answers]; next[index] = event.target.value; setAnswers(next); setResults(null); }}
                      placeholder={isVocabulary ? `Nhập từ ${index + 1}` : `Nhập câu ${index + 1}`}
                      aria-label={isVocabulary ? `Đáp án từ ${index + 1}` : `Đáp án câu ${index + 1}`}
                    />
                    {result && <b>{result.isCorrect ? 'Đúng' : 'Chưa đúng'}</b>}
                  </label>;
                })}
                {error && <p className="part1-form-error" role="alert">{error}</p>}
                {results && <>
                  <div className="part1-score" role="status"><strong>{results.correctCount}/{results.total}</strong><span>đáp án đúng</span></div>
                  <section className="part1-results" aria-label="Đáp án sau khi nộp">
                    <h3>Đáp án sau khi nộp</h3>
                    <ol>
                      {results.results.map((result, index) => (
                        <li key={`${result.order}-${index}`} className={result.isCorrect ? 'is-correct' : 'is-incorrect'}>
                          <span className="part1-results__number">{index + 1}</span>
                          <div>
                            <strong>{result.isCorrect ? 'Bạn trả lời đúng' : 'Đáp án chuẩn'}</strong>
                            <p>{result.correctAnswer}</p>
                            {result.correctTranslation && <small>{isVocabulary ? 'Nghĩa' : 'Bản dịch'}: {result.correctTranslation}</small>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                </>}
                <button className="ds-button ds-button--primary" type="submit" disabled={submitting}>{submitting ? 'Đang chấm…' : results ? 'Nộp lại bài' : 'Nộp bài để kiểm tra'}</button>
              </form>
            </section>}
          </div>}
  </main>;
}
