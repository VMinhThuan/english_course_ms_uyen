const getOptionId = (option) => {
  if (option && typeof option === 'object') {
    return option.id ?? option._id ?? option.value ?? option.key;
  }
  return option;
};

const getOptionText = (option) => {
  if (option && typeof option === 'object') {
    return option.text ?? option.label ?? option.value ?? option.name ?? '';
  }
  return option;
};

const formatSingleAnswer = (question, answer) => {
  if (answer === undefined || answer === null || answer === '') return '';

  const rawAnswer = String(answer);
  const options = Array.isArray(question?.options) ? question.options : [];
  const optionIndex = options.findIndex((option) => String(getOptionId(option)) === rawAnswer);

  if (optionIndex >= 0) {
    const optionText = getOptionText(options[optionIndex]);
    const letter = String.fromCharCode(65 + optionIndex);
    return optionText ? `${letter}. ${optionText}` : `Đáp án ${letter}`;
  }

  const textMatch = options.find((option) => String(getOptionText(option)).trim() === rawAnswer.trim());
  if (textMatch) return String(getOptionText(textMatch));

  // Older assessment snapshots may contain option IDs without their option DTO.
  // Translate recognizable generated IDs instead of exposing implementation IDs.
  if (rawAnswer.length > 20 || /^(toeic|option?|opt)[_-]/i.test(rawAnswer)) {
    const letterMatch = rawAnswer.match(/(?:^|[_-])([a-z])$/i);
    return letterMatch ? `Đáp án ${letterMatch[1].toUpperCase()}` : 'Đáp án đã chọn';
  }

  return rawAnswer;
};

export const formatAssessmentAnswer = (question, answer) => {
  const values = Array.isArray(answer) ? answer : [answer];
  const readableValues = values
    .map((value) => formatSingleAnswer(question, value))
    .filter(Boolean);

  return readableValues.length ? readableValues.join(', ') : '(Bỏ trống)';
};

export const hasAssessmentAnswer = (answer) => answer !== undefined
  && answer !== null
  && answer !== ''
  && !(Array.isArray(answer) && answer.length === 0);
