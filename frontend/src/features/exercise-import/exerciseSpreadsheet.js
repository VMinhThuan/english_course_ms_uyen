import { z } from 'zod';

const string = z.string();
const requiredText = (message) => string.trim().min(1, message);
const positiveInteger = (message) => string.trim().regex(/^[1-9]\d*$/, message);
const optionalPositiveInteger = (message) => string.trim().refine((value) => !value || /^[1-9]\d*$/.test(value), message);
const letterAnswer = z.enum(['A', 'B', 'C']);

export const EXERCISE_SHEETS = Object.freeze({
  'part1-dictation': {
    label: 'Chép chính tả Part 1',
    template: 'part1-dictation.xlsx',
    sheetName: 'Dữ liệu',
    columns: [
      { key: 'day', label: 'Ngày', width: 82 },
      { key: 'number', label: 'Câu trong ngày', width: 120 },
      { key: 'answerText', label: 'Script đáp án', width: 420 },
      { key: 'translation', label: 'Dịch nghĩa', width: 380 },
    ],
    guide: 'Mỗi dòng là một câu. Các dòng cùng Ngày được gom vào một bài nghe Part 1.',
    optionalColumns: ['translation'],
    schema: z.object({
      day: positiveInteger('Ngày phải là số từ 1 đến 31.').refine((value) => Number(value) <= 31, 'Ngày phải từ 1 đến 31.'),
      number: positiveInteger('Câu trong ngày phải là số nguyên dương.'),
      answerText: requiredText('Script đáp án không được để trống.'),
      translation: string,
    }),
  },
  'vocabulary-dictation': {
    label: 'Chép chính tả từ vựng',
    template: 'vocabulary-dictation.xlsx',
    sheetName: 'Dữ liệu',
    columns: [
      { key: 'test', label: 'Test', width: 76 },
      { key: 'section', label: 'Mục', width: 76 },
      { key: 'answerText', label: 'Từ vựng', width: 260 },
      { key: 'translation', label: 'Nghĩa tiếng Việt', width: 380 },
    ],
    guide: 'Mỗi dòng là một từ. Dùng cùng Test và Mục để gom các từ vào cùng một bộ.',
    schema: z.object({
      test: optionalPositiveInteger('Test phải là số nguyên dương hoặc để trống.'),
      section: positiveInteger('Mục phải là số nguyên dương.'),
      answerText: requiredText('Từ vựng không được để trống.'),
      translation: requiredText('Nghĩa tiếng Việt không được để trống.'),
    }),
  },
  'hard-words-dictation': {
    label: 'Hard Words Dictation',
    template: 'hard-words-dictation.xlsx',
    sheetName: 'Dữ liệu',
    columns: [
      { key: 'test', label: 'Test', width: 76 },
      { key: 'section', label: 'Mục', width: 76 },
      { key: 'answerText', label: 'Từ tiếng Anh', width: 260 },
      { key: 'translation', label: 'Nghĩa tiếng Việt', width: 380 },
    ],
    guide: 'Mỗi dòng là một từ. Hard Words chỉ nhận Test 7 hoặc Test 8.',
    schema: z.object({
      test: z.enum(['7', '8'], 'Hard Words chỉ nhận Test 7 hoặc Test 8.'),
      section: positiveInteger('Mục phải là số nguyên dương.'),
      answerText: requiredText('Từ tiếng Anh không được để trống.'),
      translation: requiredText('Nghĩa tiếng Việt không được để trống.'),
    }),
  },
  'part2-challenge': {
    label: 'Part 2 Challenge',
    template: 'part2-challenge.xlsx',
    sheetName: 'Dữ liệu',
    columns: [
      { key: 'number', label: 'Số câu', width: 82 },
      { key: 'questionText', label: 'Câu hỏi', width: 360 },
      { key: 'optionA', label: 'Đáp án A', width: 260 },
      { key: 'optionB', label: 'Đáp án B', width: 260 },
      { key: 'optionC', label: 'Đáp án C', width: 260 },
      { key: 'correctAnswer', label: 'Đáp án đúng', width: 110 },
      { key: 'translation', label: 'Dịch nghĩa', width: 360 },
    ],
    guide: 'Mỗi dòng là một câu hỏi. Nhập lựa chọn A, B, C và đáp án đúng bằng một chữ cái.',
    schema: z.object({
      number: positiveInteger('Số câu phải là số nguyên dương.'),
      questionText: requiredText('Câu hỏi không được để trống.'),
      optionA: requiredText('Đáp án A không được để trống.'),
      optionB: requiredText('Đáp án B không được để trống.'),
      optionC: requiredText('Đáp án C không được để trống.'),
      correctAnswer: letterAnswer,
      translation: requiredText('Dịch nghĩa không được để trống.'),
    }),
  },
  'grammar-tense-classification': {
    label: 'Phân loại thì và dạng câu',
    template: 'grammar-tense-classification.xlsx',
    sheetName: 'Dữ liệu',
    columns: [
      { key: 'number', label: 'Số câu', width: 82 },
      { key: 'prompt', label: 'Câu cần làm', width: 420 },
      { key: 'tense', label: 'Thì / động từ khiếm khuyết', width: 260 },
      { key: 'sentenceForm', label: 'Dạng câu', width: 140 },
    ],
    guide: 'Mỗi dòng là một câu cần phân loại thì và dạng câu.',
    schema: z.object({
      number: positiveInteger('Số câu phải là số nguyên dương.'),
      prompt: requiredText('Câu cần làm không được để trống.'),
      tense: requiredText('Thì hoặc động từ khiếm khuyết không được để trống.'),
      sentenceForm: z.enum(['Chủ động', 'Bị động'], 'Dạng câu phải là Chủ động hoặc Bị động.'),
    }),
  },
  'grammar-active-to-passive': {
    label: 'Chuyển câu chủ động sang bị động',
    template: 'grammar-active-to-passive.xlsx',
    sheetName: 'Dữ liệu',
    columns: [
      { key: 'number', label: 'Số câu', width: 82 },
      { key: 'prompt', label: 'Câu cần làm', width: 420 },
      { key: 'answer', label: 'Đáp án – câu bị động', width: 420 },
      { key: 'translation', label: 'Dịch nghĩa', width: 380 },
    ],
    guide: 'Mỗi dòng là một câu chủ động, đáp án chuyển sang bị động và bản dịch.',
    schema: z.object({
      number: positiveInteger('Số câu phải là số nguyên dương.'),
      prompt: requiredText('Câu cần làm không được để trống.'),
      answer: requiredText('Đáp án câu bị động không được để trống.'),
      translation: requiredText('Dịch nghĩa không được để trống.'),
    }),
  },
  'road-to-part-7': {
    label: 'Road to Part 7',
    template: 'road-to-part-7.xlsx',
    sheetName: 'Dữ liệu',
    columns: [
      { key: 'sourceKey', label: 'Mã bài', width: 150 },
      { key: 'order', label: 'Thứ tự', width: 82 },
      { key: 'title', label: 'Tiêu đề', width: 280 },
      { key: 'englishText', label: 'Nội dung tiếng Anh', width: 520 },
      { key: 'bilingualPairs', label: 'Bản dịch song ngữ từng câu', width: 520 },
    ],
    guide: 'Mỗi dòng là một bài đọc. Mỗi dòng trong cột song ngữ có dạng: câu tiếng Anh (bản dịch tiếng Việt).',
    schema: z.object({
      sourceKey: string,
      order: positiveInteger('Thứ tự phải là số nguyên dương.'),
      title: string,
      englishText: requiredText('Nội dung tiếng Anh không được để trống.'),
      bilingualPairs: requiredText('Bản dịch song ngữ không được để trống.').refine((value) => value.split(/\r?\n/).every((line) => /.+\s\(.+\)\s*$/.test(line.trim())), 'Mỗi dòng dịch phải có dạng câu tiếng Anh (bản dịch tiếng Việt).'),
    }),
  },
  'toeic-part5': {
    label: 'Ngân hàng câu hỏi TOEIC Part 5',
    template: 'toeic-part5.xlsx',
    sheetName: 'Dữ liệu',
    columns: [
      { key: 'questionText', label: 'Câu hỏi', width: 520 },
      { key: 'optionA', label: 'Đáp án A', width: 220 },
      { key: 'optionB', label: 'Đáp án B', width: 220 },
      { key: 'optionC', label: 'Đáp án C', width: 220 },
      { key: 'optionD', label: 'Đáp án D', width: 220 },
      { key: 'correctAnswer', label: 'Đáp án đúng', width: 110 },
      { key: 'explanation', label: 'Lời giải thích', width: 560 },
    ],
    guide: 'Mỗi dòng là một câu TOEIC Part 5. Đáp án đúng nhập một chữ cái A, B, C hoặc D.',
    schema: z.object({
      questionText: requiredText('Câu hỏi không được để trống.'),
      optionA: requiredText('Đáp án A không được để trống.'),
      optionB: requiredText('Đáp án B không được để trống.'),
      optionC: requiredText('Đáp án C không được để trống.'),
      optionD: requiredText('Đáp án D không được để trống.'),
      correctAnswer: z.enum(['A', 'B', 'C', 'D'], 'Đáp án đúng phải là A, B, C hoặc D.'),
      explanation: requiredText('Lời giải thích không được để trống.'),
    }),
  },
});

const textValue = (value) => value === undefined || value === null ? '' : String(value);
const dayFromRecord = (item) => {
  const fromKey = String(item.sourceKey || '').match(/part1-day-(\d+)/i)?.[1];
  const fromTitle = String(item.title || '').match(/day\s*(\d+)/i)?.[1];
  return textValue(fromKey || fromTitle);
};
const answerText = (answer) => textValue(answer?.text);
const answerTranslation = (answer) => textValue(answer?.translation);
const pairLines = (pairs = []) => pairs.map((pair) => `${pair.english || ''} (${pair.vietnamese || ''})`).join('\n');
const optionsByLetter = (options = []) => Object.fromEntries(['A', 'B', 'C', 'D'].map((letter) => [
  `option${letter}`,
  textValue(options.find((option) => String(option.id || option.letter).toUpperCase() === letter)?.text),
]));

export const dataToTemplateRows = (exerciseType, data = {}) => {
  if (exerciseType === 'part1-dictation') {
    const day = dayFromRecord(data);
    return (data.answers?.length ? data.answers : [{ text: '', translation: '' }]).map((answer, index) => ({
      day,
      number: textValue(answer.order || index + 1),
      answerText: answerText(answer),
      translation: answerTranslation(answer),
    }));
  }
  if (exerciseType === 'vocabulary-dictation' || exerciseType === 'hard-words-dictation') {
    return (data.answers?.length ? data.answers : [{ text: '', translation: '' }]).map((answer) => ({
      test: textValue(data.testNumber),
      section: textValue(data.sectionNumber),
      answerText: answerText(answer),
      translation: answerTranslation(answer),
    }));
  }
  if (exerciseType === 'part2-challenge') {
    return [{
      number: textValue(data.number),
      questionText: textValue(data.questionText),
      optionA: textValue(data.choices?.find((choice) => choice.letter === 'A')?.text),
      optionB: textValue(data.choices?.find((choice) => choice.letter === 'B')?.text),
      optionC: textValue(data.choices?.find((choice) => choice.letter === 'C')?.text),
      correctAnswer: textValue(data.correctAnswer).toUpperCase().slice(0, 1),
      translation: textValue(data.translation),
    }];
  }
  if (exerciseType === 'grammar-tense-classification') {
    return [{ number: textValue(data.number), prompt: textValue(data.prompt), tense: textValue(data.tense), sentenceForm: textValue(data.sentenceForm) }];
  }
  if (exerciseType === 'grammar-active-to-passive') {
    return [{ number: textValue(data.number), prompt: textValue(data.prompt), answer: textValue(data.answer), translation: textValue(data.translation) }];
  }
  if (exerciseType === 'road-to-part-7') {
    return [{
      sourceKey: textValue(data.sourceKey),
      order: textValue(data.order),
      title: textValue(data.title),
      englishText: textValue(data.englishText),
      bilingualPairs: pairLines(data.bilingualPairs),
    }];
  }
  if (exerciseType === 'toeic-part5') {
    return [{
      questionText: textValue(data.questionText),
      ...optionsByLetter(data.options),
      correctAnswer: textValue(data.correctAnswers?.[0]),
      explanation: textValue(data.explanation),
    }];
  }
  return [];
};

export const recordsToEditorRows = (exerciseType, records = []) => {
  let nextId = 0;
  return records.flatMap((record) => dataToTemplateRows(exerciseType, record).map((values) => {
    const normalizedValues = Object.fromEntries(EXERCISE_SHEETS[exerciseType].columns.map(({ key }) => [key, textValue(values[key])]));
    return {
      rowId: `saved-${String(record._id || record.sourceKey || record.number || nextId)}-${nextId++}`,
      recordId: record._id ? String(record._id) : null,
      recordStatus: record.status || '',
      originalRecord: record,
      originalValues: { ...normalizedValues },
      values: normalizedValues,
      isNew: false,
    };
  }));
};

export const blankEditorRow = (exerciseType, index) => ({
  rowId: `new-${exerciseType}-${Date.now()}-${index}`,
  recordId: null,
  recordStatus: '',
  originalRecord: null,
  originalValues: null,
  values: Object.fromEntries(EXERCISE_SHEETS[exerciseType].columns.map(({ key }) => [key, ''])),
  isNew: true,
});

export const getDirtyRows = (exerciseType, rows) => {
  const columns = EXERCISE_SHEETS[exerciseType].columns;
  return rows.filter((row) => {
    if (row.isNew) return columns.some(({ key }) => String(row.values[key] || '').trim());
    return columns.some(({ key }) => row.values[key] !== row.originalValues?.[key]);
  });
};

export const validateEditorRows = (exerciseType, rows) => {
  const spec = EXERCISE_SHEETS[exerciseType];
  const columns = spec.columns;
  const issues = [];
  for (const [index, row] of rows.entries()) {
    const isBlank = columns.every(({ key }) => !String(row.values[key] || '').trim());
    const changed = row.isNew ? !isBlank : columns.some(({ key }) => row.values[key] !== row.originalValues?.[key]);
    if (!changed || isBlank) continue;
    const result = spec.schema.safeParse(row.values);
    if (result.success) continue;
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] || '');
      issues.push({
        rowId: row.rowId,
        rowNumber: index + 1,
        field,
        label: columns.find((column) => column.key === field)?.label || 'Dòng dữ liệu',
        message: issue.message,
      });
    }
  }
  return issues;
};

export const getSheetRowsFromBatch = (exerciseType, batchRow) => dataToTemplateRows(exerciseType, batchRow?.data || {});

export const getGridCellText = (row, columnKey) => textValue(row.values[columnKey]);
