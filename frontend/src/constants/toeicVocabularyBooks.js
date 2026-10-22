export const TOEIC_VOCABULARY_BOOKS = [
  { key: 'toeic-easy-start', title: 'TOEIC EASY START', topic: 'Unit 1' },
  { key: 'toeic-essential-collocation', title: 'TOEIC ESSENTIAL COLLOCATION', topic: 'Unit 2' },
  { key: 'toeic-must-known-words', title: 'TOEIC MUST-KNOWN WORDS', topic: 'Unit 3' },
];

export const getChapterLabel = (lesson, index = 0) => {
  const title = String(lesson?.title || '').trim();
  const match = title.match(/\bchapter\s*0*(\d+)\b/i);
  const number = match ? Number(match[1]) : Number(lesson?.order) || index + 1;

  return {
    title: `Chapter ${number}`,
    subtitle: match
      ? title.replace(match[0], '').replace(/^\s*[-–—:|]+\s*/, '').trim()
      : title,
  };
};

export const sortLessonVocabulary = (words = []) =>
  [...words].sort((left, right) => {
    const orderDifference = Number(left.order || 0) - Number(right.order || 0);
    return orderDifference || String(left.word || '').localeCompare(String(right.word || ''), 'en');
  });
