import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { testApi } from '../api/testApi.js';
import { speakText, stopSpeaking } from '../utils/tts.js';
import { startSpeechRecognition, stopSpeechRecognition, isSpeechRecognitionSupported } from '../utils/speechRecognition.js';

/**
 * VÍ DỤ CODE: Bài test Reading (TTS ở FE, auto-check ở BE)
 * 
 * Flow:
 * 1. Frontend hiển thị câu hỏi reading với text cần đọc
 * 2. Frontend sử dụng Web Speech API (TTS) để đọc text cho học sinh nghe
 * 3. Học sinh đọc lại text (Speech-to-Text hoặc nhập tay)
 * 4. Frontend gửi readingText lên Backend qua API POST /api/v1/tests/:testId/submit
 * 5. Backend sử dụng textSimilarity để so sánh readingText với expectedText
 * 6. Backend trả về kết quả (isCorrect, similarity, score)
 * 7. Frontend hiển thị kết quả
 */
export default function TestPage() {
  const { testId } = useParams();
  const [test, setTest] = useState(null);
  const [answers, setAnswers] = useState({});
  const [readingText, setReadingText] = useState(''); // Text học sinh đọc
  const [isRecording, setIsRecording] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [recognitionRef, setRecognitionRef] = useState(null);

  useEffect(() => {
    const fetchTest = async () => {
      try {
        // Note: In real app, we'd get testId from lesson or route
        // For demo, we'll use a mock test structure
        const response = await testApi.getTestByLesson(testId);
        setTest(response.data.test);
      } catch (error) {
        console.error('Error fetching test:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTest();
  }, [testId]);

  // TTS: Đọc text cho học sinh nghe
  const handlePlayText = (text) => {
    stopSpeaking();
    speakText(text, { lang: 'en-US', rate: 0.9 });
  };

  // Speech-to-Text: Ghi âm học sinh đọc
  const handleStartRecording = (questionIndex) => {
    if (!isSpeechRecognitionSupported()) {
      alert('Speech recognition is not supported in your browser');
      return;
    }

    const recognition = startSpeechRecognition({
      lang: 'en-US',
      continuous: false,
      interimResults: false,
    });

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setReadingText(transcript);
      setAnswers((prev) => ({
        ...prev,
        [questionIndex]: transcript,
      }));
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
    setIsRecording(true);
    setRecognitionRef(recognition);
  };

  const handleStopRecording = () => {
    if (recognitionRef) {
      stopSpeechRecognition();
      setIsRecording(false);
      setRecognitionRef(null);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Frontend gửi answers và readingText lên Backend
      const response = await testApi.submitTest(testId, {
        answers: Object.values(answers),
        readingText: readingText, // Text học sinh đọc (cho reading test)
      });

      if (response.status === 'success') {
        setResult(response.data);
      }
    } catch (error) {
      console.error('Error submitting test:', error);
      alert(error.response?.data?.message || 'Failed to submit test');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>Loading test...</div>;
  if (!test) return <div>Test not found</div>;
  if (result) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h2>Test Results</h2>
        <div style={{ padding: '1rem', background: '#d4edda', borderRadius: '4px', marginBottom: '1rem' }}>
          <h3>Score: {result.percentage}%</h3>
          <p>Total Points: {result.score} / {result.totalPoints}</p>
        </div>
        <div>
          <h3>Question Results:</h3>
          {result.results.map((r, idx) => (
            <div
              key={idx}
              style={{
                padding: '1rem',
                marginBottom: '1rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                background: r.isCorrect ? '#d4edda' : '#f8d7da',
              }}
            >
              <p><strong>Question {idx + 1}:</strong> {r.question}</p>
              <p><strong>Your Answer:</strong> {r.studentAnswer}</p>
              <p><strong>Result:</strong> {r.isCorrect ? '✓ Correct' : '✗ Incorrect'}</p>
              {r.similarity !== undefined && (
                <p><strong>Similarity:</strong> {Math.round(r.similarity * 100)}%</p>
              )}
              <p><strong>Points:</strong> {r.points}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Find reading question
  const readingQuestion = test.questions.find((q) => q.textToRead);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h2>{test.title}</h2>
      <p>Type: {test.type}</p>

      {test.questions.map((question, index) => (
        <div
          key={index}
          style={{
            padding: '1.5rem',
            marginBottom: '1.5rem',
            border: '1px solid #ccc',
            borderRadius: '8px',
          }}
        >
          <h3>Question {index + 1}</h3>
          <p>{question.question}</p>

          {/* Reading Test với TTS */}
          {question.textToRead && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8f9fa', borderRadius: '4px' }}>
              <h4>Text to Read:</h4>
              <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>{question.textToRead}</p>

              {/* TTS Button - Frontend xử lý */}
              <div style={{ marginBottom: '1rem' }}>
                <button
                  onClick={() => handlePlayText(question.textToRead)}
                  style={{
                    padding: '0.5rem 1rem',
                    marginRight: '0.5rem',
                    background: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  🔊 Play Text (TTS)
                </button>
                <button
                  onClick={() => handleStartRecording(index)}
                  disabled={isRecording}
                  style={{
                    padding: '0.5rem 1rem',
                    marginRight: '0.5rem',
                    background: isRecording ? '#ccc' : '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isRecording ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isRecording ? '⏹ Recording...' : '🎤 Start Recording'}
                </button>
                {isRecording && (
                  <button
                    onClick={handleStopRecording}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Stop
                  </button>
                )}
              </div>

              {/* Text input fallback */}
              <div>
                <label>Or type your reading:</label>
                <textarea
                  value={answers[index] || readingText}
                  onChange={(e) => {
                    const value = e.target.value;
                    setReadingText(value);
                    setAnswers((prev) => ({ ...prev, [index]: value }));
                  }}
                  rows={4}
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.5rem' }}
                  placeholder="Read the text above or type it here..."
                />
              </div>
            </div>
          )}

          {/* Multiple choice questions */}
          {question.type === 'multiple-choice' && question.options && (
            <div style={{ marginTop: '1rem' }}>
              {question.options.map((option, optIndex) => (
                <label
                  key={optIndex}
                  style={{
                    display: 'block',
                    padding: '0.5rem',
                    marginBottom: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name={`question-${index}`}
                    value={option}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [index]: e.target.value }))
                    }
                    style={{ marginRight: '0.5rem' }}
                  />
                  {option}
                </label>
              ))}
            </div>
          )}

          {/* Fill blank questions */}
          {question.type === 'fill-blank' && !question.textToRead && (
            <div style={{ marginTop: '1rem' }}>
              <input
                type="text"
                value={answers[index] || ''}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [index]: e.target.value }))
                }
                placeholder="Enter your answer"
                style={{ width: '100%', padding: '0.5rem' }}
              />
            </div>
          )}
        </div>
      ))}

      <button
        onClick={handleSubmit}
        disabled={submitting || Object.keys(answers).length === 0}
        style={{
          padding: '0.75rem 1.5rem',
          fontSize: '1rem',
          background: '#28a745',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: submitting ? 'not-allowed' : 'pointer',
          marginTop: '1rem',
        }}
      >
        {submitting ? 'Submitting...' : 'Submit Test'}
      </button>

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f8f9fa', borderRadius: '4px' }}>
        <h4>API Call Example:</h4>
        <pre style={{ background: '#fff', padding: '0.5rem', borderRadius: '4px', overflow: 'auto', fontSize: '0.85rem' }}>
          {`// Frontend: testApi.submitTest(testId, { answers, readingText })
POST /api/v1/tests/${testId}/submit
Headers: {
  Authorization: "Bearer <access_token>",
  Content-Type: "application/json"
}
Body: {
  "answers": ["answer1", "answer2", ...],
  "readingText": "${readingText || 'student reading text'}" // For reading test
}

// Backend: Auto-check using textSimilarity
// Backend Response:
{
  "status": "success",
  "message": "Test submitted successfully",
  "data": {
    "score": 8,
    "totalPoints": 10,
    "percentage": 80,
    "results": [
      {
        "questionIndex": 0,
        "question": "...",
        "studentAnswer": "${readingText || 'student answer'}",
        "isCorrect": true,
        "similarity": 0.95, // For reading test
        "message": "Reading text is correct!",
        "points": 5
      }
    ]
  }
}`}
        </pre>
      </div>
    </div>
  );
}

