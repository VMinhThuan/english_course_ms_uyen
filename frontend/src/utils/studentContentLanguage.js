const CJK_CHARACTERS = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;

export const containsCjkText = (value) => CJK_CHARACTERS.test(String(value || ''));

export const studentExplanationText = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return containsCjkText(text)
    ? 'Lời giải thích tiếng Việt cho câu này đang được cập nhật.'
    : text;
};

export const studentTopicLabel = (value) => {
  const text = String(value || '').trim();
  if (!text || containsCjkText(text)) return 'Chủ đề TOEIC';
  if (text.toLowerCase() === 'general') return 'Chủ đề chung';
  return text;
};
