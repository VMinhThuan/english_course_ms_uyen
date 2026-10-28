import { useEffect, useState } from 'react';
import { part2ChallengeApi } from '../api/part2ChallengeApi.js';
import './Part2ChallengePage.css';

export default function Part2ChallengePage() {
  const [questions, setQuestions] = useState([]);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [revealedAnswers, setRevealedAnswers] = useState({});
  const [openAnswers, setOpenAnswers] = useState({});
  const [answerErrors, setAnswerErrors] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

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

  const selectAnswer = (number, letter) => {
    setSelectedAnswers((current) => ({ ...current, [number]: letter }));
    const nextQuestion = questions.find((question) => question.number > number);
    window.setTimeout(() => {
      const target = nextQuestion
        ? document.getElementById(`part2-question-${nextQuestion.number}`)
        : document.getElementById('part2-challenge-complete');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 180);
  };

  const toggleAnswer = async (number) => {
    if (openAnswers[number]) {
      setOpenAnswers((current) => ({ ...current, [number]: false }));
      return;
    }
    setOpenAnswers((current) => ({ ...current, [number]: true }));
    if (revealedAnswers[number]) return;
    setAnswerErrors((current) => ({ ...current, [number]: '' }));
    try {
      const response = await part2ChallengeApi.getAnswer(number);
      setRevealedAnswers((current) => ({ ...current, [number]: response.data }));
    } catch {
      setAnswerErrors((current) => ({ ...current, [number]: 'Chưa tải được đáp án. Hãy thử lại.' }));
    }
  };

  const answeredCount = Object.keys(selectedAnswers).length;

  return (
    <main className="part2-challenge-page">
      <header className="part2-challenge-header">
        <div>
          <p className="part2-challenge-eyebrow">TOEIC LISTENING PART 2</p>
          <h1>Part 2 Challange</h1>
          <p>Nghe câu hỏi, chọn A, B hoặc C. Sau khi chọn, trang sẽ tự chuyển đến câu tiếp theo.</p>
        </div>
        <div className="part2-challenge-progress" role="status" aria-live="polite">
          <strong>{answeredCount}</strong><span>/ {questions.length || 110} câu đã chọn</span>
        </div>
      </header>

      {isLoading && <div className="part2-challenge-state" role="status">Đang tải câu hỏi…</div>}
      {!isLoading && loadError && <div className="part2-challenge-state is-error" role="alert">{loadError}</div>}
      {!isLoading && !loadError && questions.length === 0 && (
        <div className="part2-challenge-state">Hiện chưa có câu hỏi nào được mở.</div>
      )}

      {!isLoading && !loadError && questions.length > 0 && (
        <>
          <div className="part2-challenge-question-list">
            {questions.map((question) => {
              const revealed = revealedAnswers[question.number];
              const isAnswerOpen = Boolean(openAnswers[question.number]);
              return (
                <article className="part2-challenge-question" id={`part2-question-${question.number}`} key={question.number}>
                  <div className="part2-challenge-question__heading">
                    <h2>Câu số {question.number}</h2>
                    {selectedAnswers[question.number] && <span>Đã chọn {selectedAnswers[question.number]}</span>}
                  </div>

                  {question.audioUrl
                    ? <audio className="part2-challenge-audio" controls preload="none" src={question.audioUrl}>Trình duyệt không hỗ trợ phát audio.</audio>
                    : <p className="part2-challenge-audio-missing">Audio câu này chưa có file hợp lệ.</p>}

                  <div className="part2-challenge-options" role="group" aria-label={`Đáp án cho câu ${question.number}`}>
                    {question.choices.map((choice) => (
                      <button
                        type="button"
                        key={choice.letter}
                        className={`part2-challenge-option ${selectedAnswers[question.number] === choice.letter ? 'is-selected' : ''}`}
                        aria-pressed={selectedAnswers[question.number] === choice.letter}
                        onClick={() => selectAnswer(question.number, choice.letter)}
                      >
                        <span>{choice.letter}</span><span>{choice.text}</span>
                      </button>
                    ))}
                  </div>

                  <div className="part2-challenge-answer">
                    <button
                      type="button"
                      className="part2-challenge-reveal"
                      aria-expanded={isAnswerOpen}
                      onClick={() => toggleAnswer(question.number)}
                    >
                      {isAnswerOpen ? 'Ẩn đáp án' : 'Hiện đáp án'}
                    </button>
                    {isAnswerOpen && answerErrors[question.number] && <p className="part2-challenge-answer__error" role="alert">{answerErrors[question.number]}</p>}
                    {isAnswerOpen && revealed && (
                      <div className="part2-challenge-answer__content">
                        <p><strong>Đáp án đúng: {revealed.correctAnswer}</strong>{revealed.correctChoice ? ` — ${revealed.correctChoice}` : ''}</p>
                        <p><strong>Script</strong><span>{revealed.script}</span></p>
                        <p><strong>Dịch nghĩa</strong><span>{revealed.translation}</span></p>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <p className="part2-challenge-complete" id="part2-challenge-complete" tabIndex={-1}>
            {answeredCount === questions.length ? 'Bạn đã chọn đáp án cho tất cả câu.' : 'Hết danh sách câu hỏi.'}
          </p>
        </>
      )}
    </main>
  );
}
