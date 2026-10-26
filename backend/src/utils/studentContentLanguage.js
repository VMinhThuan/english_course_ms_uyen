const CJK_CHARACTERS = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;

export const containsCjkText = (value) => CJK_CHARACTERS.test(String(value || ''));

/**
 * The crawler source contains Chinese editorial notes. Those notes are not
 * suitable for the Vietnamese student UI, so never expose them as-is.
 * English TOEIC stems/options remain untouched; this helper is only for
 * explanation/translation fields.
 */
export const studentExplanationText = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return containsCjkText(text)
    ? 'Lời giải thích tiếng Việt cho câu này đang được cập nhật.'
    : text;
};

export const studentTranslationText = (value) => {
  const text = String(value || '').trim();
  return text && !containsCjkText(text) ? text : '';
};

export const studentTopicLabel = (value) => {
  const text = String(value || '').trim();
  if (!text || containsCjkText(text)) return 'Chủ đề TOEIC';
  if (text.toLowerCase() === 'general') return 'Chủ đề chung';
  return text;
};
