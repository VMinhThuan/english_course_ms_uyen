import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { part2ChallengeApi } from '../api/part2ChallengeApi.js';
import './Part2ChallengePage.css';

const ANSWER_SECONDS = 30;

const answerStatuses = {
  correct: 'Đúng',
  incorrect: 'Chưa đúng',
  unanswered: 'Chưa chọn',
  unavailable: 'Thiếu đáp án',
};

export default function Part2ChallengePage() {
  const [questions, setQuestions] = useState([]);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [revealedAnswers, setRevealedAnswers] = useState({});
  const [isAnswerOpen, setIsAnswerOpen] = useState(false);
  const [answerError, setAnswerError] = useState('');
  const [isAnswerLoading, setIsAnswerLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sessionState, setSessionState] = useState('instructions');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [audioState, setAudioState] = useState('idle');
  const [secondsLeft, setSecondsLeft] = useState(ANSWER_SECONDS);
  const [timerActive, setTimerActive] = useState(false);
  const [awaitingSubmit, setAwaitingSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [reviewRows, setReviewRows] = useState([]);
  const [reviewFilter, setReviewFilter] = useState('all');
  const [reviewSearch, setReviewSearch] = useState('');
  const audioRef = useRef(null);
  const playbackVersion = useRef(0);
  const answerRequestVersion = useRef(0);

  useEffect(() => {
    let active = true;
    part2ChallengeApi.getQuestions()
      .then((response) => {
        if (active) setQuestions(response.data?.items || []);
      })
      .catch(() => {
        if (active) setLoadError('Chưa tải được danh sách câu hỏi. Vui lòng thử tải lại trang.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    playbackVersion.current += 1;
    audioRef.current?.pause();
  }, []);

  const currentQuestion = questions[currentIndex];
  const currentAnswer = currentQuestion ? revealedAnswers[currentQuestion.number] : null;
  const selectedCount = Object.keys(selectedAnswers).length;
  const answerWindowOpen = audioState === 'answering' || audioState === 'unavailable';

  const playQuestion = useCallback((question) => {
    const player = audioRef.current;
    const version = ++playbackVersion.current;
    answerRequestVersion.current += 1;
    setTimerActive(false);
    setSecondsLeft(ANSWER_SECONDS);
    setAwaitingSubmit(false);
    setIsAnswerOpen(false);
    setIsAnswerLoading(false);
    setAnswerError('');

    if (!player || !question?.audioUrl) {
      if (player) {
        player.pause();
        player.removeAttribute('src');
        player.load();
      }
      setAudioState('unavailable');
      setTimerActive(true);
      return;
    }

    setAudioState('loading');
    const continueWithoutAudio = () => {
      if (version !== playbackVersion.current) return;
      setAudioState('unavailable');
      setSecondsLeft(ANSWER_SECONDS);
      setTimerActive(true);
    };

    try {
      player.pause();
      player.currentTime = 0;
      player.src = question.audioUrl;
      player.load();
      const playPromise = player.play();
      if (playPromise?.catch) playPromise.catch(continueWithoutAudio);
    } catch {
      continueWithoutAudio();
    }
  }, []);

  const openQuestion = useCallback((index) => {
    if (!questions[index]) return;
    setCurrentIndex(index);
    playQuestion(questions[index]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [questions, playQuestion]);

  const handleAudioEnded = () => {
    if (sessionState !== 'active') return;
    setAudioState('answering');
    setSecondsLeft(ANSWER_SECONDS);
    setTimerActive(true);
  };

  const handleAudioError = () => {
    if (sessionState !== 'active' || audioState === 'answering' || audioState === 'unavailable') return;
    setAudioState('unavailable');
    setSecondsLeft(ANSWER_SECONDS);
    setTimerActive(true);
  };

  useEffect(() => {
    if (sessionState !== 'active' || !timerActive) return undefined;
    if (secondsLeft <= 0) {
      setTimerActive(false);
      if (currentIndex + 1 < questions.length) openQuestion(currentIndex + 1);
      else setAwaitingSubmit(true);
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [sessionState, timerActive, secondsLeft, currentIndex, questions, openQuestion]);

  const startSession = () => {
    setSelectedAnswers({});
    setRevealedAnswers({});
    setReviewRows([]);
    setReviewFilter('all');
    setReviewSearch('');
    setSubmitError('');
    setCurrentIndex(0);
    setSessionState('active');
    playQuestion(questions[0]);
  };

  const selectAnswer = (letter) => {
    if (!currentQuestion || !answerWindowOpen) return;
    setSelectedAnswers((current) => ({ ...current, [currentQuestion.number]: letter }));
  };

  const toggleAnswer = async () => {
    if (!currentQuestion || !answerWindowOpen) return;
    if (isAnswerOpen) {
      setIsAnswerOpen(false);
      return;
    }
    setIsAnswerOpen(true);
    if (revealedAnswers[currentQuestion.number]) return;

    const requestVersion = ++answerRequestVersion.current;
    setIsAnswerLoading(true);
    setAnswerError('');
    try {
      const response = await part2ChallengeApi.getAnswer(currentQuestion.number);
      if (requestVersion !== answerRequestVersion.current) return;
      setRevealedAnswers((current) => ({ ...current, [currentQuestion.number]: response.data }));
    } catch {
      if (requestVersion === answerRequestVersion.current) setAnswerError('Chưa tải được đáp án và script. Hãy thử lại.');
    } finally {
      if (requestVersion === answerRequestVersion.current) setIsAnswerLoading(false);
    }
  };

  const submitSession = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const response = await part2ChallengeApi.submit(questions.map((question) => ({
        number: question.number,
        selectedAnswer: selectedAnswers[question.number] || '',
      })));
      const answersByNumber = new Map((response.data?.items || []).map((item) => [item.number, item]));
      const rows = questions.map((question) => {
        const answer = answersByNumber.get(question.number) || revealedAnswers[question.number];
        const selectedAnswer = selectedAnswers[question.number] || '';
        const correctAnswer = answer?.correctAnswer || '';
        const status = answersByNumber.get(question.number)?.status || (!answer ? 'unavailable'
          : !selectedAnswer ? 'unanswered'
            : selectedAnswer === correctAnswer ? 'correct' : 'incorrect');
        return {
          ...question,
          selectedAnswer,
          correctAnswer,
          correctChoice: answer?.correctChoice || '',
          script: answer?.script || '',
          translation: answer?.translation || '',
          status,
        };
      });
      setReviewRows(rows);
      setSessionState('results');
      setTimerActive(false);
      audioRef.current?.pause();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setSubmitError('Chưa tải được bảng đáp án. Kiểm tra kết nối rồi thử nộp lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextQuestion = () => {
    if (!answerWindowOpen) return;
    if (currentIndex + 1 < questions.length) openQuestion(currentIndex + 1);
    else submitSession();
  };

  const resultCounts = useMemo(() => reviewRows.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] || 0) + 1;
    return counts;
  }, { correct: 0, incorrect: 0, unanswered: 0, unavailable: 0 }), [reviewRows]);

  const filteredReviewRows = useMemo(() => {
    const search = reviewSearch.trim().toLocaleLowerCase('vi');
    return reviewRows.filter((row) => {
      if (reviewFilter !== 'all' && row.status !== reviewFilter) return false;
      if (!search) return true;
      return [
        String(row.number), row.questionText, row.selectedAnswer, row.correctAnswer,
        ...(row.choices || []).map((choice) => `${choice.letter} ${choice.text}`),
      ].some((value) => String(value || '').toLocaleLowerCase('vi').includes(search));
    });
  }, [reviewRows, reviewFilter, reviewSearch]);

  const progressPercent = questions.length ? ((currentIndex + 1) / questions.length) * 100 : 0;

  return (
    <main className="part2-challenge-page">
      <audio
        ref={audioRef}
        className="part2-challenge-audio-engine"
        preload="auto"
        aria-hidden="true"
        onPlaying={() => setAudioState('playing')}
        onEnded={handleAudioEnded}
        onError={handleAudioError}
      />

      {sessionState !== 'results' && (
        <header className="part2-challenge-header">
          <div>
            <p className="part2-challenge-eyebrow">TOEIC LISTENING PART 2</p>
            <h1>Part 2 Challange</h1>
            <p>{sessionState === 'active' ? 'Nghe từng câu, chọn đáp án rồi chuyển câu tiếp theo.' : 'Luyện nghe và chọn đáp án theo nhịp thời gian của từng câu.'}</p>
          </div>
          {sessionState === 'active' && (
            <div className="part2-challenge-progress" role="status" aria-live="polite">
              <strong>{selectedCount}</strong><span>/ {questions.length} câu đã chọn</span>
            </div>
          )}
        </header>
      )}

      {isLoading && <div className="part2-challenge-state" role="status">Đang tải câu hỏi…</div>}
      {!isLoading && loadError && <div className="part2-challenge-state is-error" role="alert">{loadError}</div>}
      {!isLoading && !loadError && questions.length === 0 && (
        <div className="part2-challenge-state">Hiện chưa có câu hỏi nào được mở.</div>
      )}

      {!isLoading && !loadError && questions.length > 0 && sessionState === 'instructions' && (
        <section className="part2-challenge-instructions">
          <div className="part2-challenge-instructions__intro">
            <p className="part2-challenge-eyebrow">TRƯỚC KHI BẮT ĐẦU</p>
            <h2>Hướng dẫn làm bài</h2>
            <p>Bài luyện gồm <strong>{questions.length} câu</strong>. Hãy chuẩn bị âm thanh trước khi bắt đầu.</p>
          </div>
          <ol className="part2-challenge-instructions__steps">
            <li><strong>Nghe audio</strong><span>Bấm Bắt đầu để phát lần lượt từng câu. Audio tự chạy và không có nút tua hoặc quay lại câu trước.</span></li>
            <li><strong>Chọn đáp án</strong><span>Khi audio kết thúc, bạn có 30 giây để chọn A, B hoặc C. Bạn cũng có thể chủ động bấm Next.</span></li>
            <li><strong>Xem lời giải</strong><span>Trong mỗi câu, nút Hiện đáp án và script sẽ mở đáp án đúng, script và bản dịch.</span></li>
            <li><strong>Nộp bài</strong><span>Ở câu cuối, bấm Nộp bài để xem lại đáp án của toàn bộ câu hỏi.</span></li>
          </ol>
          <button type="button" className="ds-button ds-button--primary part2-challenge-start" onClick={startSession}>Bắt đầu</button>
        </section>
      )}

      {!isLoading && !loadError && sessionState === 'active' && currentQuestion && (
        <section className="part2-challenge-test" aria-label="Đang làm Part 2 Challenge">
          <div className="part2-challenge-test__progress">
            <div><span>Câu {currentIndex + 1} / {questions.length}</span><span>{selectedCount} câu đã chọn</span></div>
            <progress max="100" value={progressPercent} aria-label={`Tiến độ ${currentIndex + 1} trên ${questions.length}`} />
          </div>

          <article className="part2-challenge-question part2-challenge-question--active">
            <div className="part2-challenge-question__heading">
              <h2>Câu số {currentQuestion.number}</h2>
              {audioState === 'playing' && <span className="part2-challenge-audio-status is-playing" role="status" aria-live="polite">Đang phát audio</span>}
              {audioState === 'loading' && <span className="part2-challenge-audio-status" role="status" aria-live="polite">Đang tải audio…</span>}
              {answerWindowOpen && <span className="part2-challenge-audio-status is-answering" role="timer" aria-live="off">{timerActive ? `Còn ${secondsLeft} giây` : 'Có thể chọn đáp án'}</span>}
            </div>

            {audioState === 'playing' || audioState === 'loading'
              ? <p className="part2-challenge-audio-message">Hãy nghe audio. Thời gian chọn đáp án bắt đầu khi audio kết thúc.</p>
              : audioState === 'unavailable'
                ? <p className="part2-challenge-audio-message is-warning">Không phát được audio câu này. Thời gian chọn đáp án 30 giây đã bắt đầu.</p>
                : <p className="part2-challenge-audio-message">Audio đã kết thúc. Chọn đáp án trước khi thời gian hết.</p>}

            <div className="part2-challenge-options" role="group" aria-label={`Lựa chọn A, B hoặc C cho câu ${currentQuestion.number}`}>
              {(currentQuestion.choices || []).map((choice) => (
                <button
                  type="button"
                  key={choice.letter}
                  className={`part2-challenge-option ${selectedAnswers[currentQuestion.number] === choice.letter ? 'is-selected' : ''}`}
                  aria-pressed={selectedAnswers[currentQuestion.number] === choice.letter}
                  aria-label={`Đáp án ${choice.letter}`}
                  disabled={!answerWindowOpen}
                  onClick={() => selectAnswer(choice.letter)}
                >
                  <span>{choice.letter}</span>
                </button>
              ))}
            </div>

            <div className="part2-challenge-answer">
              <button
                type="button"
                className="part2-challenge-reveal"
                aria-expanded={isAnswerOpen}
                disabled={!answerWindowOpen || isAnswerLoading}
                onClick={toggleAnswer}
              >
                {isAnswerLoading ? 'Đang tải đáp án…' : isAnswerOpen ? 'Ẩn đáp án và script' : 'Hiện đáp án và script'}
              </button>
              {answerError && <p className="part2-challenge-answer__error" role="alert">{answerError}</p>}
              {isAnswerOpen && currentAnswer && (
                <div className="part2-challenge-answer__content">
                  <p><strong>Đáp án đúng: {currentAnswer.correctAnswer}</strong></p>
                  <p><strong>Script</strong><span>{currentAnswer.script}</span></p>
                  <p><strong>Dịch nghĩa</strong><span>{currentAnswer.translation}</span></p>
                </div>
              )}
            </div>

            {awaitingSubmit && <p className="part2-challenge-submit-hint" role="status">Đã hết thời gian câu cuối. Nộp bài để xem kết quả và toàn bộ đáp án.</p>}
            {submitError && <p className="part2-challenge-answer__error" role="alert">{submitError}</p>}
            <div className="part2-challenge-test__actions">
              <span>{selectedAnswers[currentQuestion.number] ? `Bạn đã chọn ${selectedAnswers[currentQuestion.number]}` : 'Chưa chọn đáp án'}</span>
              <button type="button" className="ds-button ds-button--primary" disabled={!answerWindowOpen || isSubmitting || isAnswerLoading} onClick={nextQuestion}>
                {isSubmitting ? 'Đang nộp bài…' : currentIndex + 1 === questions.length ? 'Nộp bài' : 'Next'}
              </button>
            </div>
          </article>
        </section>
      )}

      {!isLoading && !loadError && sessionState === 'results' && (
        <section className="part2-challenge-results">
          <header className="part2-challenge-results__header">
            <p className="part2-challenge-eyebrow">KẾT QUẢ BÀI LÀM</p>
            <h1>Đáp án Part 2 Challange</h1>
            <p>Đáp án đúng được hiển thị ngay bên cạnh lựa chọn của bạn. Mở từng câu để xem đủ lựa chọn, script và bản dịch.</p>
          </header>

          <div className="part2-challenge-result-summary" aria-label="Tổng kết kết quả">
            <article className="is-score"><span>Điểm</span><strong>{resultCounts.correct} / {reviewRows.length}</strong></article>
            <article className="is-correct"><span>Đúng</span><strong>{resultCounts.correct}</strong></article>
            <article className="is-incorrect"><span>Chưa đúng</span><strong>{resultCounts.incorrect}</strong></article>
            <article><span>Chưa chọn</span><strong>{resultCounts.unanswered}</strong></article>
          </div>

          <div className="part2-challenge-review-tools">
            <label className="part2-challenge-review-search">Tìm câu
              <input type="search" value={reviewSearch} onChange={(event) => setReviewSearch(event.target.value)} placeholder="Nhập số câu hoặc đáp án…" />
            </label>
            <div className="part2-challenge-review-filters" role="group" aria-label="Lọc kết quả">
              {[
                ['all', `Tất cả ${reviewRows.length}`],
                ['incorrect', `Chưa đúng ${resultCounts.incorrect}`],
                ['unanswered', `Chưa chọn ${resultCounts.unanswered}`],
                ['correct', `Đúng ${resultCounts.correct}`],
              ].map(([filter, label]) => (
                <button type="button" key={filter} aria-pressed={reviewFilter === filter} className={reviewFilter === filter ? 'is-active' : ''} onClick={() => setReviewFilter(filter)}>{label}</button>
              ))}
            </div>
            <p role="status">Đang xem {filteredReviewRows.length} / {reviewRows.length} câu</p>
          </div>

          <div className="part2-challenge-review-list">
            {filteredReviewRows.map((row) => (
              <article className={`part2-challenge-review-item is-${row.status}`} key={row.number}>
                <div className="part2-challenge-review-item__top">
                  <strong>Câu {row.number}</strong>
                  <span className="part2-challenge-review-status">{answerStatuses[row.status]}</span>
                  <span>Bạn chọn: <b>{row.selectedAnswer || '—'}</b></span>
                  <span>Đáp án đúng: <b>{row.correctAnswer || '—'}</b></span>
                </div>
                {row.questionText && <p className="part2-challenge-review-question">{row.questionText}</p>}
                <details>
                  <summary>Xem các lựa chọn và script</summary>
                  <div className="part2-challenge-review-item__details">
                    <ul className="part2-challenge-review-choices">
                      {(row.choices || []).map((choice) => (
                        <li className={`${choice.letter === row.correctAnswer ? 'is-correct' : ''} ${choice.letter === row.selectedAnswer ? 'is-picked' : ''}`} key={choice.letter}>
                          <strong>{choice.letter}</strong>
                          {choice.letter === row.correctAnswer && <em>Đáp án đúng</em>}
                          {choice.letter === row.selectedAnswer && <em>Bạn chọn</em>}
                        </li>
                      ))}
                    </ul>
                    {row.script && <p><strong>Script</strong><span>{row.script}</span></p>}
                    {row.translation && <p><strong>Dịch nghĩa</strong><span>{row.translation}</span></p>}
                    {row.status === 'unavailable' && <p className="part2-challenge-audio-message is-warning">Chưa tải được lời giải cho câu này. Tải lại trang và thử lại.</p>}
                  </div>
                </details>
              </article>
            ))}
            {filteredReviewRows.length === 0 && <p className="part2-challenge-state">Không có câu nào khớp bộ lọc.</p>}
          </div>
        </section>
      )}
    </main>
  );
}
