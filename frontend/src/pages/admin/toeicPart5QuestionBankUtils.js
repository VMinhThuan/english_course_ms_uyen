const letters = ['A', 'B', 'C', 'D'];

export const normalizePart5QuestionForm = (question = {}) => {
  const sourceOptions = Array.isArray(question.options) ? question.options : [];
  const optionMap = new Map(sourceOptions.map((option, index) => [option.id, letters[index]]));
  const options = letters.map((id, index) => ({
    id,
    text: typeof sourceOptions[index]?.text === 'string' ? sourceOptions[index].text : '',
  }));
  const correctAnswers = (Array.isArray(question.correctAnswers) ? question.correctAnswers : [])
    .map((answer) => optionMap.get(answer))
    .filter(Boolean);
  return {
    questionText: question.questionText || '',
    type: 'single_choice',
    toeicPart: 5,
    options,
    correctAnswers: correctAnswers.length === 1 ? correctAnswers : [],
    explanation: question.explanation || '',
    score: question.score ?? 1,
    topic: question.topic || 'TOEIC Part 5',
    status: question.status || 'draft',
  };
};

export const getPart5CompletenessIssues = (question = {}) => {
  const issues = [];
  const options = Array.isArray(question.options) ? question.options : [];
  const optionIds = options.map((option) => option?.id);
  const answers = Array.isArray(question.correctAnswers) ? question.correctAnswers : [];
  if (question.type !== 'single_choice' || options.length !== 4 || new Set(optionIds).size !== 4 || optionIds.some((id) => !letters.includes(id))) {
    issues.push('cấu trúc không đủ bốn phương án A–D');
  }
  if (options.some((option) => typeof option?.text !== 'string' || !option.text.trim())) {
    issues.push('thiếu phương án');
  }
  if (answers.length !== 1 || !optionIds.includes(answers[0])) issues.push('thiếu hoặc sai đáp án đúng');
  if (typeof question.explanation !== 'string' || !question.explanation.trim()) issues.push('thiếu lời giải thích');
  return issues;
};

export const validatePart5QuestionForm = (form = {}) => {
  const errors = {};
  if (typeof form.questionText !== 'string' || !form.questionText.trim()) errors.questionText = 'Vui lòng nhập nội dung câu hỏi.';
  if (!Array.isArray(form.options) || form.options.length !== 4) errors.options = 'Câu hỏi Part 5 phải có đúng bốn phương án A, B, C và D.';
  else if (form.options.some((option) => typeof option?.text !== 'string' || !option.text.trim())) errors.options = 'Vui lòng nhập nội dung cho cả bốn phương án A, B, C và D.';
  if (!Array.isArray(form.correctAnswers) || form.correctAnswers.length !== 1 || !letters.includes(form.correctAnswers[0])) errors.correctAnswers = 'Hãy chọn chính xác một đáp án đúng A, B, C hoặc D.';
  if (typeof form.explanation !== 'string' || !form.explanation.trim()) errors.explanation = 'Vui lòng nhập lời giải thích.';
  return errors;
};

const fieldForMessage = (message) => {
  const text = String(message || '').toLowerCase();
  if (text.includes('question text')) return 'questionText';
  if (text.includes('option')) return 'options';
  if (text.includes('correct answer')) return 'correctAnswers';
  if (text.includes('explanation')) return 'explanation';
  if (text.includes('type')) return 'type';
  if (text.includes('toeicpart')) return 'toeicPart';
  return '_form';
};

export const mapPart5ApiValidationErrors = (error) => {
  const payload = error?.response?.data || {};
  const structured = payload.fieldErrors || payload.errors;
  if (structured && typeof structured === 'object' && !Array.isArray(structured)) {
    const entries = Object.entries(structured).filter(([, value]) => value);
    if (entries.length) return Object.fromEntries(entries.map(([key, value]) => [key, Array.isArray(value) ? value.join(' ') : String(value)]));
  }
  const message = payload.message || error?.message || 'Không thể lưu câu hỏi Part 5.';
  return { [fieldForMessage(message)]: message };
};
