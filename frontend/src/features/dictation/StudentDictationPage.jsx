import { useCallback, useEffect, useRef, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { part1DictationApi } from '../../api/part1DictationApi.js';
import { vocabularyDictationApi } from '../../api/vocabularyDictationApi.js';
import { hardWordsDictationApi } from '../../api/hardWordsDictationApi.js';
import usePauseAudioOnSpace from '../../hooks/usePauseAudioOnSpace.js';
import { resolveMediaUrl } from '../../utils/mediaUrl.js';
import '../../pages/Part1Dictation.css';

const dictationApis = { part1: part1DictationApi, vocabulary: vocabularyDictationApi, hardWords: hardWordsDictationApi };

export default function StudentDictationPage({ kind = 'part1' }) {
  const isVocabulary = kind === 'vocabulary';
  const isHardWords = kind === 'hardWords';
  const isWordDictation = isVocabulary || isHardWords;
  const api = dictationApis[kind] || dictationApis.part1;
  const pageTitle = isHardWords ? 'Hard Words Dictation' : isVocabulary ? 'Chép chính tả từ vựng' : 'Chép chính tả Part 1';
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const audioRef = useRef(null);

  usePauseAudioOnSpace(audioRef);

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

  return <main className="part1-page" data-testid={isHardWords ? 'hard-words-dictation-student-page' : isVocabulary ? 'vocabulary-dictation-student-page' : 'part1-dictation-student-page'}>
    <PageHeader
      eyebrow={isHardWords ? 'HARD WORDS · DICTATION' : isVocabulary ? 'Vocabulary · Dictation' : 'TOEIC · Part 1'}
      title={pageTitle}
      description={isHardWords
        ? 'Nghe từng nhóm từ khó, điền đáp án tiếng Anh và xem nghĩa sau khi nộp.'
        : isVocabulary
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
                <span>{String(index + 1).padStart(2, '0')}</span><strong>{item.title}</strong><small>{item.answerCount} {isWordDictation ? 'từ cần chép' : 'câu cần chép'}</small>
              </button>)}
            </aside>
            {active && <section className="part1-listening-card">
              <div className="part1-listening-card__header"><div><p className="part1-playlist__eyebrow">{active.audioUrl ? 'NGHE VÀ CHÉP LẠI' : 'ÔN TẬP VÀ ĐIỀN ĐÁP ÁN'}</p><h2>{active.title}</h2></div><span>{active.answerCount} {isWordDictation ? 'từ' : 'câu'}</span></div>
              <div className="part1-audio"><span aria-hidden="true">♫</span>{active.audioUrl
                ? <audio ref={audioRef} controls preload="metadata" src={resolveMediaUrl(active.audioUrl)}>Trình duyệt của bạn không hỗ trợ phát audio.</audio>
                : <p className="part1-audio__missing">Audio chưa được cập nhật. Bạn vẫn có thể làm bài và xem đáp án sau khi nộp.</p>}
              </div>
              <form onSubmit={submit} className="part1-answer-form">
                <p>{active.audioUrl
                  ? (isWordDictation ? 'Nghe audio và nhập từ hoặc cụm từ tiếng Anh tương ứng.' : 'Nhập câu bạn nghe được. Hệ thống không phân biệt chữ hoa và chữ thường.')
                  : 'Nhập đáp án theo từng dòng. Hệ thống không phân biệt chữ hoa và chữ thường.'}</p>
                {answers.map((answer, index) => {
                  const result = results?.results[index];
                  return <label key={index} className={`part1-answer-row${result ? (result.isCorrect ? ' is-correct' : ' is-incorrect') : ''}`}>
                    <span>{index + 1}</span>
                    <div className="part1-answer-field">
                      <div className="part1-answer-field__control">
                        <input
                          value={answer}
                          disabled={submitting}
                          onChange={(event) => { const next = [...answers]; next[index] = event.target.value; setAnswers(next); setResults(null); }}
                          placeholder={isWordDictation ? `Nhập từ ${index + 1}` : `Nhập câu ${index + 1}`}
                          aria-label={isWordDictation ? `Đáp án từ ${index + 1}` : `Đáp án câu ${index + 1}`}
                        />
                        {result && <b className="part1-answer-status">{result.isCorrect ? '✓ Đúng' : '× Chưa đúng'}</b>}
                      </div>
                      {result && <div className={`part1-answer-correction${result.isCorrect ? ' is-correct' : ''}`}>
                        <strong>{result.isCorrect ? 'Đáp án của bạn' : 'Đáp án đúng'}</strong>
                        <span className="part1-answer-correction__text">{result.correctAnswer}</span>
                        {result.correctTranslation && <span className="part1-answer-correction__translation">{isWordDictation ? 'Nghĩa' : 'Bản dịch'}: {result.correctTranslation}</span>}
                      </div>}
                    </div>
                  </label>;
                })}
                {error && <p className="part1-form-error" role="alert">{error}</p>}
                {results && <div className="part1-score" role="status"><strong>{results.correctCount}/{results.total}</strong><span>đáp án đúng</span></div>}
                <button className="ds-button ds-button--primary" type="submit" disabled={submitting}>{submitting ? 'Đang chấm…' : results ? 'Nộp lại bài' : 'Nộp bài để kiểm tra'}</button>
              </form>
            </section>}
          </div>}
  </main>;
}
