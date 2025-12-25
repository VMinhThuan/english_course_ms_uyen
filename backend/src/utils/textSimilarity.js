/**
 * Calculate similarity between two texts using Levenshtein distance
 * Returns a value between 0 and 1 (1 = identical)
 */
export const calculateSimilarity = (text1, text2) => {
  const str1 = text1.toLowerCase().trim();
  const str2 = text2.toLowerCase().trim();

  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;

  const maxLength = Math.max(str1.length, str2.length);
  const distance = levenshteinDistance(str1, str2);
  const similarity = 1 - distance / maxLength;

  return Math.max(0, similarity);
};

/**
 * Levenshtein distance algorithm
 */
const levenshteinDistance = (str1, str2) => {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
};

/**
 * Check if student's reading text matches expected text
 * Returns { isCorrect: boolean, similarity: number, message: string }
 */
export const checkReadingText = (studentText, expectedText, threshold = 0.8) => {
  const similarity = calculateSimilarity(studentText, expectedText);
  const isCorrect = similarity >= threshold;

  return {
    isCorrect,
    similarity: Math.round(similarity * 100) / 100,
    message: isCorrect
      ? 'Reading text is correct!'
      : `Similarity: ${Math.round(similarity * 100)}%. Need at least ${Math.round(threshold * 100)}%`,
  };
};

