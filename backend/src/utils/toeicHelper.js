// TOEIC Default 7-Part Template Configuration
export const DEFAULT_TOEIC_PARTS = [
  { partNumber: 1, name: 'Part 1: Photographs', section: 'listening', instructions: 'For each question in this part, you will hear four statements about a picture. Select the statement that best describes what you see.', order: 1, durationMinutes: 5 },
  { partNumber: 2, name: 'Part 2: Question-Response', section: 'listening', instructions: 'You will hear a question or statement and three responses. Select the best response.', order: 2, durationMinutes: 10 },
  { partNumber: 3, name: 'Part 3: Conversations', section: 'listening', instructions: 'You will hear some conversations between two or more people. Answer three questions about what the speakers say.', order: 3, durationMinutes: 15 },
  { partNumber: 4, name: 'Part 4: Talks', section: 'listening', instructions: 'You will hear some talks given by a single speaker. Answer three questions about what the speaker says.', order: 4, durationMinutes: 15 },
  { partNumber: 5, name: 'Part 5: Incomplete Sentences', section: 'reading', instructions: 'Select the best answer to complete each sentence.', order: 5, durationMinutes: 20 },
  { partNumber: 6, name: 'Part 6: Text Completion', section: 'reading', instructions: 'Select the best answer to complete each text.', order: 6, durationMinutes: 15 },
  { partNumber: 7, name: 'Part 7: Reading Comprehension', section: 'reading', instructions: 'Read the passages and answer the questions that follow.', order: 7, durationMinutes: 40 },
];

// Estimated TOEIC Listening score table mapping (raw correct 0..100 -> score 5..495)
export function calculateEstimatedListeningScore(rawCorrect, totalQuestions = 100) {
  if (totalQuestions <= 0 || rawCorrect <= 0) return 5;
  const ratio = Math.min(1, Math.max(0, rawCorrect / totalQuestions));
  // Non-linear approximation mapping (0->5, 50->250, 100->495)
  let score = Math.round(5 + ratio * 490);
  return Math.min(495, Math.max(5, Math.round(score / 5) * 5)); // Round to nearest 5
}

// Estimated TOEIC Reading score table mapping (raw correct 0..100 -> score 5..495)
export function calculateEstimatedReadingScore(rawCorrect, totalQuestions = 100) {
  if (totalQuestions <= 0 || rawCorrect <= 0) return 5;
  const ratio = Math.min(1, Math.max(0, rawCorrect / totalQuestions));
  let score = Math.round(5 + ratio * 490);
  return Math.min(495, Math.max(5, Math.round(score / 5) * 5)); // Round to nearest 5
}
