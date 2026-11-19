import crypto from 'node:crypto';
import path from 'node:path';
import Part1Dictation from '../models/Part1Dictation.js';
import VocabularyDictation from '../models/VocabularyDictation.js';
import HardWordsDictation from '../models/HardWordsDictation.js';
import Part2ChallengeQuestion from '../models/Part2ChallengeQuestion.js';
import GrammarExerciseQuestion from '../models/GrammarExerciseQuestion.js';
import RoadToPart7Reading from '../models/RoadToPart7Reading.js';
import ExerciseImportBatch, { EXERCISE_IMPORT_TYPES } from '../models/ExerciseImportBatch.js';
import ExerciseImportRow from '../models/ExerciseImportRow.js';
import { normalizeImportText, parseXlsxWorksheetRows } from './toeicPart5XlsxParser.js';

const pad = (value) => String(value).padStart(2, '0');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const normalizeHeader = (value) => normalizeImportText(value)
  .normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[đĐ]/g, 'd')
  .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const valueAt = (row, column) => column ? String(row.values[column - 1] ?? '').trim() : '';
const isPopulated = (row) => row.values.some((value) => String(value ?? '').trim()) || row.cellIssues.length > 0;
const errorIssue = (code, field, message) => ({ code, field, severity: 'error', message });
const safeNumber = (value) => /^\d+$/.test(String(value).trim()) ? Number(value) : null;

export class ExerciseImportError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'ExerciseImportError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const fail = (code, message, statusCode = 400) => { throw new ExerciseImportError(code, message, statusCode); };

export const EXERCISE_IMPORT_DETAILS = Object.freeze({
  'part1-dictation': { label: 'Chép chính tả Part 1', template: 'part1-dictation.xlsx', preferredSheets: ['Dữ liệu Part 1', 'Dữ liệu'] },
  'vocabulary-dictation': { label: 'Chép chính tả từ vựng', template: 'vocabulary-dictation.xlsx', preferredSheets: ['Dữ liệu'] },
  'hard-words-dictation': { label: 'Hard Words Dictation', template: 'hard-words-dictation.xlsx', preferredSheets: ['Dữ liệu'] },
  'part2-challenge': { label: 'Part 2 Challenge', template: 'part2-challenge.xlsx', preferredSheets: ['Dữ liệu'] },
  'grammar-tense-classification': { label: 'Phân loại thì và dạng câu', template: 'grammar-tense-classification.xlsx', preferredSheets: ['Dữ liệu'] },
  'grammar-active-to-passive': { label: 'Chuyển câu chủ động thành bị động', template: 'grammar-active-to-passive.xlsx', preferredSheets: ['Dữ liệu'] },
  'road-to-part-7': { label: 'Road to Part 7', template: 'road-to-part-7.xlsx', preferredSheets: ['Dữ liệu'] },
});

let importIndexesPromise;
const ensureImportIndexes = async () => {
  if (!importIndexesPromise) {
    importIndexesPromise = Promise.all([
      ExerciseImportRow.collection.createIndex({ batchId: 1, rowNumber: 1 }, { unique: true, name: 'uniq_exercise_import_batch_row' }),
      Part1Dictation.collection.createIndex({ sourceKey: 1 }, { unique: true, sparse: true, name: 'part1_dictation_source_key' }),
    ]).catch((error) => {
      importIndexesPromise = null;
      throw error;
    });
  }
  await importIndexesPromise;
};

const HEADER_ALIASES = {
  day: ['ngay', 'day'],
  number: ['so cau', 'cau so', 'so thu tu', 'number', 'no'],
  prompt: ['cau can lam', 'cau hoi', 'noi dung cau hoi', 'cau tieng anh', 'prompt', 'question'],
  answerText: ['script dap an', 'dap an', 'tu vung', 'tu tieng anh', 'tu tieng anh dap an', 'english word', 'word'],
  translation: ['dich nghia', 'nghia tieng viet', 'ban dich', 'translation', 'vietnamese meaning'],
  test: ['test', 'de', 'test number'],
  section: ['muc', 'section', 'section number'],
  tense: ['thi dong tu khiem khuyet', 'thi', 'dong tu khiem khuyet', 'tense'],
  sentenceForm: ['dang cau', 'sentence form', 'voice'],
  answer: ['dap an cau bi dong', 'dap an dung', 'thi va dang cau', 'correct answer', 'answer key', 'answer'],
  questionText: ['cau hoi', 'noi dung cau hoi', 'question', 'question text'],
  optionA: ['dap an a', 'phuong an a', 'a', 'option a'],
  optionB: ['dap an b', 'phuong an b', 'b', 'option b'],
  optionC: ['dap an c', 'phuong an c', 'c', 'option c'],
  correctAnswer: ['dap an dung', 'dap an', 'correct answer', 'answer key'],
  script: ['script', 'script nghe'],
  title: ['tieu de', 'title'],
  sourceKey: ['ma bai', 'source key', 'ma bai doc'],
  order: ['thu tu', 'order'],
  englishText: ['noi dung tieng anh', 'bai doc tieng anh', 'english text', 'english passage'],
  bilingualPairs: ['ban dich song ngu tung cau', 'ban dich tung cau', 'ban dich song ngu', 'bilingual sentences', 'translation by sentence'],
};

const headerMapFor = (row) => {
  const columns = {};
  for (let index = 0; index < row.values.length; index += 1) {
    const normalized = normalizeHeader(row.values[index]);
    if (!normalized) continue;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(normalized)) {
        columns[field] ||= index + 1;
      }
    }
  }
  return columns;
};

const findHeader = (rows, exerciseType) => {
  const requiredCandidates = {
    'part1-dictation': [['day', 'number', 'answerText', 'translation']],
    'vocabulary-dictation': [['section', 'answerText', 'translation']],
    'hard-words-dictation': [['test', 'section', 'answerText', 'translation']],
    'part2-challenge': [
      ['number', 'questionText', 'optionA', 'optionB', 'optionC', 'correctAnswer', 'translation'],
      ['number', 'script', 'translation', 'correctAnswer'],
    ],
    'grammar-tense-classification': [['prompt', 'tense', 'sentenceForm']],
    'grammar-active-to-passive': [['prompt', 'answer', 'translation']],
    'road-to-part-7': [['englishText', 'bilingualPairs']],
  }[exerciseType];
  const candidates = rows.slice(0, 20).map((row) => ({ row, columns: headerMapFor(row) }));
  const matches = candidates.filter(({ columns }) => requiredCandidates.some((required) => required.every((field) => columns[field])));
  if (matches.length > 1) fail('AMBIGUOUS_HEADER_ROW', 'Không thể chọn duy nhất dòng tiêu đề trong file Excel.');
  return matches[0] || null;
};

const rowField = (row, columns, field) => valueAt(row, columns[field]);
const numberFrom = (text, label = '') => {
  const match = label
    ? normalizeHeader(text).match(new RegExp(`${normalizeHeader(label)}\\s*(?:so\\s*)?(\\d+)`, 'i'))
    : normalizeHeader(text).match(/^\s*(?:(?:cau|question|q)(?:\s*so)?\s*)?(\d+)(?:\s*[.):-])?/i);
  return match ? Number(match[1]) : null;
};
const sourceRowIssues = (row) => row.cellIssues.map(({ code, column }) => errorIssue(
  code,
  `cột ${column}`,
  code === 'FORMULA_NOT_ALLOWED' ? 'Không hỗ trợ ô có công thức; hãy nhập giá trị cố định.' : 'Ô Excel bị lỗi hoặc vượt quá độ dài cho phép.',
));
const splitNumberPrefix = (text) => {
  const match = String(text).trim().match(/^(?:câu\s*)?(\d+)\s*[.):\-–]\s*(.+)$/i);
  return match ? { number: Number(match[1]), text: match[2].trim() } : { number: null, text: String(text).trim() };
};

const groupVocabularyRows = (rows, exerciseType) => {
  const grouped = new Map();
  let current = null;
  const isHardWords = exerciseType === 'hard-words-dictation';
  for (const row of rows) {
    const first = valueAt(row, 1);
    const second = valueAt(row, 2);
    const joined = row.values.map((value) => String(value ?? '')).join(' ');
    const normalizedJoined = normalizeHeader(joined);
    const test = numberFrom(normalizedJoined, 'test');
    const section = numberFrom(normalizedJoined, 'muc') || numberFrom(normalizedJoined, 'section');
    if (section && (normalizeHeader(joined).includes('muc') || normalizeHeader(joined).includes('section'))) {
      current = { testNumber: test || null, sectionNumber: section, answers: [], sourceRows: [], issues: [] };
      grouped.set(`${current.testNumber || 'none'}:${section}`, current);
      continue;
    }
    const normalizedFirst = normalizeHeader(first);
    const normalizedSecond = normalizeHeader(second);
    if ((normalizedFirst.includes('tu tieng anh') || normalizedFirst === 'tu vung' || normalizedFirst === 'word')
      && (normalizedSecond.includes('nghia') || normalizedSecond.includes('translation') || normalizedSecond.includes('meaning'))) continue;
    if (!current || (!first && !row.cellIssues.length)) continue;
    const english = first.replace(/^(?:\d+[.)]\s*)/, '').trim();
    if (!english || /^muc\s*\d+/i.test(normalizedFirst) || /^test\s*\d+/i.test(normalizedFirst)) continue;
    current.answers.push({ text: english, translation: second, order: current.answers.length + 1 });
    current.sourceRows.push(row.rowNumber);
    current.issues.push(...sourceRowIssues(row));
  }

  return [...grouped.values()].map((group) => {
    const testNumber = group.testNumber;
    const sectionNumber = group.sectionNumber;
    const firstWord = 1;
    const lastWord = group.answers.length;
    const sourceKey = isHardWords
      ? `hard-words-test-${testNumber || 0}-section-${pad(sectionNumber)}`
      : testNumber ? `test-${testNumber}-section-${pad(sectionNumber)}` : `vocabulary-section-${pad(sectionNumber)}`;
    const title = testNumber
      ? `Test ${testNumber} · Mục ${sectionNumber} · Từ ${firstWord}–${lastWord}`
      : `Mục ${sectionNumber} · Từ ${firstWord}–${lastWord}`;
    const data = { sourceKey, title, sectionNumber, firstWord, lastWord, answers: group.answers };
    if (testNumber) data.testNumber = testNumber;
    if (isHardWords && !testNumber) group.issues.push(errorIssue('MISSING_TEST', 'test', 'Hard Words cần có số Test 7 hoặc 8.'));
    for (const answer of group.answers) {
      if (!answer.translation) group.issues.push(errorIssue('MISSING_TRANSLATION', 'translation', `Thiếu nghĩa tiếng Việt của từ “${answer.text}”.`));
      if (answer.text.length > 1000 || answer.translation.length > 1000) group.issues.push(errorIssue('CELL_TOO_LONG', 'answers', 'Từ hoặc nghĩa vượt quá 1.000 ký tự.'));
    }
    if (group.answers.length === 0) group.issues.push(errorIssue('EMPTY_GROUP', 'answers', 'Mục này chưa có từ vựng nào.'));
    return { data, sourceKey, sourceRowNumber: group.sourceRows[0] || 1, issues: group.issues };
  });
};

const parseScriptChoices = (script) => {
  const text = String(script || '').replace(/\r/g, '').trim();
  const options = {};
  const matches = [...text.matchAll(/(?:^|\n)\s*\(?([ABC])\)?[).:\-]?\s+([^\n]+)/gi)];
  if (matches.length < 3) return null;
  for (const match of matches) options[match[1].toUpperCase()] = match[2].trim();
  if (!options.A || !options.B || !options.C) return null;
  const questionText = text.slice(0, matches[0].index).trim().replace(/^(?:câu\s*)?\d+\s*[.):\-–]?\s*/i, '');
  if (!questionText) return null;
  return { questionText, choices: ['A', 'B', 'C'].map((letter) => ({ letter, text: options[letter] })) };
};

const parseBilingualPairs = (value) => String(value || '').replace(/\r/g, '').split('\n')
  .map((line) => line.trim().replace(/^(?:\d+[.)]\s*)/, ''))
  .filter(Boolean)
  .map((line, index) => {
    const open = line.lastIndexOf('(');
    const english = open >= 0 && line.endsWith(')') ? line.slice(0, open).trim() : line;
    const vietnamese = open >= 0 && line.endsWith(')') ? line.slice(open + 1, -1).trim() : '';
    return { english, vietnamese, order: index + 1 };
  });

const parseHeaderRows = (rows, exerciseType, header) => {
  const records = [];
  let generatedNumber = 0;
  for (const row of rows) {
    if (row.rowNumber <= header.row.rowNumber) continue;
    const hasData = row.values.some((value) => String(value ?? '').trim());
    if (!hasData && !row.cellIssues.length) continue;
    const firstCell = normalizeHeader(row.values.find((value) => String(value ?? '').trim()) || '');
    if (firstCell.startsWith('vi du') || firstCell.startsWith('example')) continue;
    const issues = sourceRowIssues(row);
    const get = (field) => rowField(row, header.columns, field);
    if (exerciseType === 'part1-dictation') {
      const day = safeNumber(get('day'));
      const number = safeNumber(get('number'));
      const text = get('answerText');
      const translation = get('translation');
      if (!day || day > 31) issues.push(errorIssue('INVALID_DAY', 'day', 'Ngày phải là số từ 1 đến 31.'));
      if (!number || number > 999) issues.push(errorIssue('INVALID_NUMBER', 'number', 'Số câu phải là số nguyên dương.'));
      if (!text) issues.push(errorIssue('MISSING_ANSWER', 'answerText', 'Script đáp án không được để trống.'));
      if (text.length > 1000 || translation.length > 1000) issues.push(errorIssue('CELL_TOO_LONG', 'answerText', 'Nội dung Part 1 tối đa 1.000 ký tự mỗi ô.'));
      records.push({ rowNumber: row.rowNumber, day, number, text, translation, issues });
      continue;
    }
    if (exerciseType === 'vocabulary-dictation' || exerciseType === 'hard-words-dictation') {
      const testNumber = safeNumber(get('test'));
      const sectionNumber = safeNumber(get('section'));
      const text = get('answerText');
      const translation = get('translation');
      if (!sectionNumber || sectionNumber > 999) issues.push(errorIssue('INVALID_SECTION', 'section', 'Mục phải là số nguyên dương.'));
      if (exerciseType === 'hard-words-dictation' && ![7, 8].includes(testNumber)) issues.push(errorIssue('INVALID_TEST', 'test', 'Hard Words chỉ nhận Test 7 hoặc Test 8.'));
      if (!text) issues.push(errorIssue('MISSING_WORD', 'answerText', 'Từ tiếng Anh không được để trống.'));
      if (!translation) issues.push(errorIssue('MISSING_TRANSLATION', 'translation', 'Nghĩa tiếng Việt không được để trống.'));
      if (text.length > 1000 || translation.length > 1000) issues.push(errorIssue('CELL_TOO_LONG', 'answerText', 'Từ và nghĩa tối đa 1.000 ký tự mỗi ô.'));
      records.push({ rowNumber: row.rowNumber, testNumber, sectionNumber, text, translation, issues });
      continue;
    }
    if (exerciseType === 'part2-challenge') {
      const number = safeNumber(get('number')) || numberFrom(get('number'));
      let questionText = get('questionText');
      let choices = ['A', 'B', 'C'].map((letter) => ({ letter, text: get(`option${letter}`) }));
      const script = get('script');
      if (script) {
        const parsed = parseScriptChoices(script);
        if (parsed) {
          questionText ||= parsed.questionText;
          if (choices.every((choice) => !choice.text)) choices = parsed.choices;
        } else {
          issues.push(errorIssue('SCRIPT_FORMAT', 'script', 'Script phải có câu hỏi và ba dòng lựa chọn A, B, C.'));
        }
      }
      const correctAnswer = get('correctAnswer').toUpperCase();
      const translation = get('translation');
      if (!number || number > 9999) issues.push(errorIssue('INVALID_NUMBER', 'number', 'Số câu phải là số nguyên dương.'));
      if (!questionText) issues.push(errorIssue('MISSING_QUESTION', 'questionText', 'Nội dung câu hỏi không được để trống.'));
      if (choices.some((choice) => !choice.text)) issues.push(errorIssue('MISSING_CHOICES', 'choices', 'Cần có đủ lựa chọn A, B và C.'));
      if (!['A', 'B', 'C'].includes(correctAnswer)) issues.push(errorIssue('INVALID_ANSWER', 'correctAnswer', 'Đáp án đúng phải là A, B hoặc C.'));
      if (!translation) issues.push(errorIssue('MISSING_TRANSLATION', 'translation', 'Dịch nghĩa không được để trống.'));
      if (questionText.length > 1000 || choices.some((choice) => choice.text.length > 1000)
        || script.length > 4000 || translation.length > 4000) issues.push(errorIssue('CELL_TOO_LONG', 'row', 'Nội dung vượt quá độ dài cho phép của Part 2.'));
      const normalizedScript = script || [questionText, ...choices.map((choice) => `(${choice.letter}) ${choice.text}`)].join('\n');
      records.push({ rowNumber: row.rowNumber, number, data: { number, questionText, choices, correctAnswer, script: normalizedScript, translation }, issues });
      continue;
    }
    if (exerciseType === 'grammar-tense-classification') {
      const rawPrompt = get('prompt');
      const prefix = splitNumberPrefix(rawPrompt);
      const number = safeNumber(get('number')) || prefix.number || generatedNumber + 1;
      const prompt = prefix.text;
      const tense = get('tense');
      const sentenceForm = get('sentenceForm');
      const answer = get('answer') || `${tense} – ${sentenceForm}`;
      generatedNumber = number;
      if (!prompt) issues.push(errorIssue('MISSING_PROMPT', 'prompt', 'Câu cần làm không được để trống.'));
      if (!tense) issues.push(errorIssue('MISSING_TENSE', 'tense', 'Thì hoặc động từ khiếm khuyết không được để trống.'));
      if (!sentenceForm) issues.push(errorIssue('MISSING_SENTENCE_FORM', 'sentenceForm', 'Dạng câu không được để trống.'));
      if (prompt.length > 2000 || tense.length > 120 || sentenceForm.length > 80 || answer.length > 2000) issues.push(errorIssue('CELL_TOO_LONG', 'row', 'Nội dung vượt quá giới hạn của bài ngữ pháp.'));
      records.push({ rowNumber: row.rowNumber, number, data: { exerciseType: 'tense-classification', number, prompt, tense, sentenceForm, answer, translation: '' }, issues });
      continue;
    }
    if (exerciseType === 'grammar-active-to-passive') {
      const prefix = splitNumberPrefix(get('prompt'));
      const number = safeNumber(get('number')) || prefix.number || generatedNumber + 1;
      const prompt = prefix.text;
      const answer = get('answer');
      const translation = get('translation');
      generatedNumber = number;
      if (!prompt) issues.push(errorIssue('MISSING_PROMPT', 'prompt', 'Câu cần làm không được để trống.'));
      if (!answer) issues.push(errorIssue('MISSING_ANSWER', 'answer', 'Đáp án câu bị động không được để trống.'));
      if (!translation) issues.push(errorIssue('MISSING_TRANSLATION', 'translation', 'Dịch nghĩa không được để trống.'));
      if (prompt.length > 2000 || answer.length > 2000 || translation.length > 2000) issues.push(errorIssue('CELL_TOO_LONG', 'row', 'Nội dung vượt quá 2.000 ký tự mỗi ô.'));
      records.push({ rowNumber: row.rowNumber, number, data: { exerciseType: 'active-to-passive', number, prompt, tense: '', sentenceForm: '', answer, translation }, issues });
      continue;
    }
    if (exerciseType === 'road-to-part-7') {
      const englishText = get('englishText').replace(/\s+/g, ' ').trim();
      const bilingualPairs = parseBilingualPairs(get('bilingualPairs'));
      const order = safeNumber(get('order')) || generatedNumber + 1;
      const title = get('title') || bilingualPairs[0]?.english || `Bài đọc ${pad(order)}`;
      const sourceKey = get('sourceKey') || `reading-${pad(order)}`;
      generatedNumber = order;
      if (!englishText) issues.push(errorIssue('MISSING_ENGLISH_TEXT', 'englishText', 'Nội dung tiếng Anh không được để trống.'));
      if (!bilingualPairs.length || bilingualPairs.some((pair) => !pair.english || !pair.vietnamese)) {
        issues.push(errorIssue('INVALID_TRANSLATION_PAIRS', 'bilingualPairs', 'Mỗi dòng phải có câu tiếng Anh và bản dịch tiếng Việt trong ngoặc đơn.'));
      }
      if (title.length > 120 || englishText.length > 30000 || bilingualPairs.some((pair) => pair.english.length > 4000 || pair.vietnamese.length > 4000)) {
        issues.push(errorIssue('CELL_TOO_LONG', 'row', 'Bài đọc hoặc một cặp dịch vượt quá giới hạn cho phép.'));
      }
      records.push({ rowNumber: row.rowNumber, sourceKey, data: { sourceKey, sourceWorkbook: '', sourceRow: row.rowNumber, order, title, englishText, bilingualPairs }, issues });
    }
  }
  return records;
};

const parseRows = (rows, exerciseType) => {
  if (exerciseType === 'vocabulary-dictation' || exerciseType === 'hard-words-dictation') {
    const header = findHeader(rows, exerciseType);
    if (!header) return groupVocabularyRows(rows, exerciseType);
    const grouped = new Map();
    for (const row of rows) {
      if (row.rowNumber <= header.row.rowNumber) continue;
      if (!isPopulated(row)) continue;
      const testNumber = safeNumber(rowField(row, header.columns, 'test'));
      const sectionNumber = safeNumber(rowField(row, header.columns, 'section'));
      const text = rowField(row, header.columns, 'answerText');
      const translation = rowField(row, header.columns, 'translation');
      const groupKey = `${testNumber || 'none'}:${sectionNumber || 'invalid'}`;
      if (!grouped.has(groupKey)) grouped.set(groupKey, { testNumber, sectionNumber, answers: [], sourceRows: [], issues: [] });
      const group = grouped.get(groupKey);
      const issues = sourceRowIssues(row);
      if (!sectionNumber) issues.push(errorIssue('MISSING_SECTION', 'section', 'Mục là bắt buộc.'));
      if (!text) issues.push(errorIssue('MISSING_WORD', 'answerText', 'Từ tiếng Anh không được để trống.'));
      if (!translation) issues.push(errorIssue('MISSING_TRANSLATION', 'translation', 'Nghĩa tiếng Việt không được để trống.'));
      group.answers.push({ text, translation, order: group.answers.length + 1 });
      group.sourceRows.push(row.rowNumber);
      group.issues.push(...issues);
    }
    const normalizedRows = [];
    for (const group of grouped.values()) {
      const testNumber = group.testNumber;
      const sectionNumber = group.sectionNumber;
      const sourceKey = exerciseType === 'hard-words-dictation'
        ? `hard-words-test-${testNumber || 0}-section-${pad(sectionNumber || 0)}`
        : testNumber ? `test-${testNumber}-section-${pad(sectionNumber || 0)}` : `vocabulary-section-${pad(sectionNumber || 0)}`;
      const firstWord = 1;
      const lastWord = group.answers.length;
      const title = testNumber ? `Test ${testNumber} · Mục ${sectionNumber} · Từ ${firstWord}–${lastWord}` : `Mục ${sectionNumber} · Từ ${firstWord}–${lastWord}`;
      const data = { sourceKey, title, sectionNumber, firstWord, lastWord, answers: group.answers };
      if (testNumber) data.testNumber = testNumber;
      if (exerciseType === 'hard-words-dictation' && ![7, 8].includes(testNumber)) group.issues.push(errorIssue('INVALID_TEST', 'test', 'Hard Words chỉ nhận Test 7 hoặc Test 8.'));
      for (const answer of group.answers) {
        if (answer.text.length > 1000 || answer.translation.length > 1000) group.issues.push(errorIssue('CELL_TOO_LONG', 'answers', 'Từ hoặc nghĩa vượt quá 1.000 ký tự.'));
      }
      normalizedRows.push({ rowNumber: group.sourceRows[0] || 1, sourceKey, data, issues: group.issues });
    }
    return normalizedRows;
  }

  const header = findHeader(rows, exerciseType);
  if (!header) fail('HEADER_NOT_FOUND', 'Không tìm thấy hàng tiêu đề phù hợp. Hãy tải template đúng loại bài tập.');
  if (exerciseType === 'part1-dictation') {
    const parsedRows = parseHeaderRows(rows, exerciseType, header);
    const groups = new Map();
    for (const row of parsedRows) {
      const key = String(row.day ?? 'invalid');
      if (!groups.has(key)) groups.set(key, { day: row.day, answers: [], issues: [], sourceRows: new Set(), seenNumbers: new Set() });
      const group = groups.get(key);
      group.issues.push(...row.issues);
      group.sourceRows.add(row.rowNumber);
      if (group.seenNumbers.has(row.number)) group.issues.push(errorIssue('DUPLICATE_QUESTION_NUMBER', 'number', `Ngày ${row.day} bị trùng câu ${row.number}.`));
      group.seenNumbers.add(row.number);
      group.answers.push({ text: row.text, translation: row.translation, order: row.number || group.answers.length + 1 });
    }
    return [...groups.values()].map((group) => {
      group.answers.sort((left, right) => left.order - right.order);
      const day = group.day || 0;
      const sourceKey = `part1-day-${pad(day)}`;
      const data = { sourceKey, title: `Part 1 – Day ${day}`, answers: group.answers };
      if (!group.answers.length) group.issues.push(errorIssue('EMPTY_DAY', 'answers', 'Ngày này chưa có câu nào.'));
      return { rowNumber: group.sourceRows.values().next().value || 1, sourceKey, data, issues: group.issues };
    });
  }
  return parseHeaderRows(rows, exerciseType, header).map((record) => {
    if (exerciseType === 'vocabulary-dictation' || exerciseType === 'hard-words-dictation') return record;
    if (record.data) {
      if (exerciseType === 'road-to-part-7') record.data.sourceWorkbook = '';
      return { ...record, sourceKey: record.sourceKey || `${exerciseType}:${record.data.number}` };
    }
    if (exerciseType === 'part2-challenge') {
      return { rowNumber: record.rowNumber, sourceKey: `part2:${record.number || 0}`, data: record.data, issues: record.issues };
    }
    const exerciseSubType = exerciseType === 'grammar-tense-classification' ? 'tense-classification' : 'active-to-passive';
    const data = record.data || {};
    return { rowNumber: record.rowNumber, sourceKey: `${exerciseSubType}:${record.number || 0}`, data, issues: record.issues };
  });
};

const targetFor = (exerciseType) => ({
  'part1-dictation': Part1Dictation,
  'vocabulary-dictation': VocabularyDictation,
  'hard-words-dictation': HardWordsDictation,
  'part2-challenge': Part2ChallengeQuestion,
  'grammar-tense-classification': GrammarExerciseQuestion,
  'grammar-active-to-passive': GrammarExerciseQuestion,
  'road-to-part-7': RoadToPart7Reading,
})[exerciseType];

const databaseFilter = (exerciseType, row) => {
  if (exerciseType === 'part1-dictation' || exerciseType === 'vocabulary-dictation'
    || exerciseType === 'hard-words-dictation' || exerciseType === 'road-to-part-7') return { sourceKey: row.sourceKey };
  if (exerciseType === 'part2-challenge') return { number: row.data.number };
  return { exerciseType: exerciseType === 'grammar-tense-classification' ? 'tense-classification' : 'active-to-passive', number: row.data.number };
};

const contentForComparison = (exerciseType, item) => {
  const answers = (item.answers || []).map((answer) => ({ text: answer.text, translation: answer.translation, order: answer.order }));
  if (exerciseType === 'part1-dictation') return { title: item.title, answers };
  if (exerciseType === 'vocabulary-dictation' || exerciseType === 'hard-words-dictation') {
    return { title: item.title, testNumber: item.testNumber ?? null, sectionNumber: item.sectionNumber, firstWord: item.firstWord, lastWord: item.lastWord, answers };
  }
  if (exerciseType === 'part2-challenge') return {
    number: item.number, questionText: item.questionText,
    choices: (item.choices || []).map((choice) => ({ letter: choice.letter, text: choice.text })),
    correctAnswer: item.correctAnswer, script: item.script, translation: item.translation,
  };
  if (exerciseType.startsWith('grammar-')) return {
    exerciseType: item.exerciseType, number: item.number, prompt: item.prompt, tense: item.tense,
    sentenceForm: item.sentenceForm, answer: item.answer, translation: item.translation,
  };
  return {
    sourceKey: item.sourceKey, order: item.order, title: item.title, englishText: item.englishText,
    bilingualPairs: (item.bilingualPairs || []).map((pair) => ({ english: pair.english, vietnamese: pair.vietnamese, order: pair.order })),
  };
};
const stableJson = (value) => JSON.stringify(value, (_key, item) => {
  if (item && !Array.isArray(item) && typeof item === 'object' && !(item instanceof Date)) {
    return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
  }
  return item;
});
const fingerprint = (exerciseType, item) => sha256(stableJson(contentForComparison(exerciseType, item)));

const addRecordIssues = (record) => {
  const issues = [...record.issues];
  if (!record.sourceKey || record.sourceKey.length > 180) issues.push(errorIssue('INVALID_SOURCE_KEY', 'sourceKey', 'Mã định danh dữ liệu không hợp lệ.'));
  if (record.data?.answers?.length > 300) issues.push(errorIssue('ANSWER_LIMIT', 'answers', 'Một nhóm không được vượt quá 300 câu/từ.'));
  if (record.data?.bilingualPairs?.length > 300) issues.push(errorIssue('PAIR_LIMIT', 'bilingualPairs', 'Một bài đọc không được vượt quá 300 cặp dịch.'));
  if (record.data?.order && (!Number.isInteger(record.data.order) || record.data.order < 1)) issues.push(errorIssue('INVALID_ORDER', 'order', 'Thứ tự bài đọc không hợp lệ.'));
  if (record.data?.number && (!Number.isInteger(record.data.number) || record.data.number < 1 || record.data.number > 9999)) issues.push(errorIssue('INVALID_NUMBER', 'number', 'Số câu phải từ 1 đến 9999.'));
  return issues;
};

const findExisting = async (exerciseType, records) => {
  const Model = targetFor(exerciseType);
  if (exerciseType === 'part1-dictation') {
    const keys = records.map((row) => row.sourceKey).filter(Boolean);
    const items = await Model.find({ $or: [{ sourceKey: { $in: keys } }, { title: { $regex: /^Part\s*1/i } }] }).lean();
    return { byKey: new Map(items.filter((item) => item.sourceKey).map((item) => [stableJson({ sourceKey: item.sourceKey }), item])), byTitle: items.filter((item) => !item.sourceKey).reduce((map, item) => {
      const titleKey = normalizeHeader(item.title);
      if (!map.has(titleKey)) map.set(titleKey, []);
      map.get(titleKey).push(item);
      return map;
    }, new Map()) };
  }
  const filters = [...new Map(records.map((row) => [stableJson(databaseFilter(exerciseType, row)), databaseFilter(exerciseType, row)])).values()];
  if (!filters.length) return { byKey: new Map() };
  let query;
  if (exerciseType === 'part2-challenge') query = { number: { $in: filters.map((filter) => filter.number) } };
  else if (exerciseType.startsWith('grammar-')) query = { exerciseType: filters[0].exerciseType, number: { $in: filters.map((filter) => filter.number) } };
  else query = { sourceKey: { $in: filters.map((filter) => filter.sourceKey) } };
  const items = await Model.find(query).lean();
  return { byKey: new Map(items.map((item) => [stableJson(databaseFilter(exerciseType, { sourceKey: item.sourceKey, data: item })), item])) };
};

const keyOfExisting = (exerciseType, row) => stableJson(databaseFilter(exerciseType, row));

export const createExerciseImportPreview = async ({ exerciseType, buffer, originalFileName, uploadedBy }) => {
  if (!EXERCISE_IMPORT_TYPES.includes(exerciseType)) fail('INVALID_EXERCISE_TYPE', 'Loại bài tập import không hợp lệ.');
  await ensureImportIndexes();
  const details = EXERCISE_IMPORT_DETAILS[exerciseType];
  const workbook = await parseXlsxWorksheetRows({ buffer, originalFileName, preferredSheetNames: details.preferredSheets });
  let records = parseRows(workbook.rows, exerciseType);
  const sourceFileName = path.basename(String(originalFileName || 'upload.xlsx')).slice(0, 200);
  records = records.map((record) => {
    if (record.data && ['vocabulary-dictation', 'hard-words-dictation', 'grammar-tense-classification', 'grammar-active-to-passive', 'road-to-part-7'].includes(exerciseType)) {
      record.data.sourceWorkbook = sourceFileName;
    }
    return { ...record, issues: addRecordIssues(record) };
  });
  if (records.length === 0) fail('NO_DATA_ROWS', 'File không có dòng dữ liệu để import.');
  if (records.length > 1000) fail('ROW_LIMIT', 'File vượt quá 1.000 bản ghi import.', 413);

  const keyOccurrences = new Map();
  for (const record of records) keyOccurrences.set(record.sourceKey, (keyOccurrences.get(record.sourceKey) || 0) + 1);
  for (const record of records) {
    if ((keyOccurrences.get(record.sourceKey) || 0) > 1) {
      record.issues.push(errorIssue('DUPLICATE_IN_WORKBOOK', 'sourceKey', 'Mã câu/mục/bài bị trùng trong cùng workbook.'));
    }
  }

  const existing = await findExisting(exerciseType, records.filter((row) => !row.issues.length));
  const previewRows = records.map((record, index) => {
    let current = existing.byKey.get(keyOfExisting(exerciseType, record));
    if (exerciseType === 'part1-dictation' && !current) {
      const titleMatches = existing.byTitle.get(normalizeHeader(record.data.title)) || [];
      if (titleMatches.length > 1) record.issues.push(errorIssue('AMBIGUOUS_EXISTING_TITLE', 'title', 'Có nhiều bài Part 1 cùng tên nên không thể chọn bản ghi cập nhật.'));
      else if (titleMatches.length === 1) current = titleMatches[0];
    }
    let action = record.issues.length ? 'INVALID' : 'CREATE';
    if (record.issues.some((issue) => issue.code === 'DUPLICATE_IN_WORKBOOK')) action = 'DUPLICATE';
    let existingId = null;
    let existingFingerprint = '';
    if (current && action !== 'INVALID' && action !== 'DUPLICATE') {
      existingId = current._id;
      existingFingerprint = fingerprint(exerciseType, current);
      action = existingFingerprint === fingerprint(exerciseType, record.data) ? 'UNCHANGED' : 'UPDATE';
      if (exerciseType === 'part1-dictation' && !current.sourceKey) action = 'UPDATE';
    }
    return {
      batchId: null,
      rowNumber: index + 1,
      sourceRowNumber: record.rowNumber,
      sourceKey: record.sourceKey,
      action,
      data: record.data,
      issues: record.issues,
      existingId,
      existingFingerprint,
    };
  });

  const batch = await ExerciseImportBatch.create({
    exerciseType,
    fileSha256: sha256(buffer),
    sourceFileName: path.basename(String(originalFileName || 'upload.xlsx')).slice(0, 240),
    sheetName: workbook.sheetName,
    uploadedBy,
    rowCounts: {
      create: previewRows.filter((row) => row.action === 'CREATE').length,
      update: previewRows.filter((row) => row.action === 'UPDATE').length,
      unchanged: previewRows.filter((row) => row.action === 'UNCHANGED').length,
      invalid: previewRows.filter((row) => row.action === 'INVALID').length,
      duplicate: previewRows.filter((row) => row.action === 'DUPLICATE').length,
    },
  });
  try {
    await ExerciseImportRow.insertMany(previewRows.map((row) => ({ ...row, batchId: batch._id })), { ordered: true });
  } catch (error) {
    await Promise.all([
      ExerciseImportRow.deleteMany({ batchId: batch._id }),
      ExerciseImportBatch.deleteOne({ _id: batch._id }),
    ]);
    throw error;
  }
  return getExerciseImportBatch(batch._id);
};

export const getExerciseImportBatch = async (batchId) => {
  const batch = await ExerciseImportBatch.findById(batchId).lean();
  if (!batch) fail('BATCH_NOT_FOUND', 'Không tìm thấy phiên xem trước import.', 404);
  const rows = await ExerciseImportRow.find({ batchId }).sort({ rowNumber: 1 }).lean();
  return { ...batch, rows };
};

const importUpdate = (exerciseType, data, uploadedBy) => {
  const set = { ...data };
  const setOnInsert = {};
  if (exerciseType === 'part1-dictation') Object.assign(setOnInsert, { audioUrl: '', isVisible: false, createdBy: uploadedBy });
  if (exerciseType === 'vocabulary-dictation' || exerciseType === 'hard-words-dictation') {
    Object.assign(setOnInsert, { audioFilename: '', audioUrl: '', isVisible: false, createdBy: uploadedBy });
  }
  if (exerciseType === 'part2-challenge') Object.assign(setOnInsert, { audioFilename: '', audioUrl: '', isVisible: false });
  if (exerciseType.startsWith('grammar-')) setOnInsert.isVisible = false;
  if (exerciseType === 'road-to-part-7') Object.assign(setOnInsert, { isPublished: true, createdBy: uploadedBy });
  return { $set: set, ...(Object.keys(setOnInsert).length ? { $setOnInsert: setOnInsert } : {}) };
};

const findOneCurrent = (Model, row, exerciseType) => {
  if (row.existingId) return Model.findById(row.existingId).lean();
  return Model.findOne(databaseFilter(exerciseType, row)).lean();
};

const confirmRow = async (Model, exerciseType, row, uploadedBy) => {
  const current = await findOneCurrent(Model, row, exerciseType);
  if (row.action === 'CREATE' && current) return { action: 'FAILED', message: 'Dữ liệu đã tồn tại sau bước xem trước. Hãy tạo preview mới.' };
  if (row.action === 'UPDATE' && !current) return { action: 'FAILED', message: 'Bản ghi cần cập nhật không còn tồn tại. Hãy tạo preview mới.' };
  if (row.action === 'UPDATE' && fingerprint(exerciseType, current) !== row.existingFingerprint) {
    return { action: 'FAILED', message: 'Bản ghi đã thay đổi sau bước xem trước. Hãy tạo preview mới để tránh ghi đè thay đổi mới.' };
  }
  const filter = row.existingId ? { _id: row.existingId } : databaseFilter(exerciseType, row);
  const result = await Model.findOneAndUpdate(filter, importUpdate(exerciseType, row.data, uploadedBy), {
    new: true,
    upsert: row.action === 'CREATE',
    runValidators: true,
    setDefaultsOnInsert: true,
  }).lean();
  if (!result) return { action: 'FAILED', message: 'Không tìm thấy bản ghi để cập nhật.' };
  const createMessage = exerciseType === 'road-to-part-7' ? 'Đã thêm và xuất bản bài đọc.' : 'Đã tạo bản nháp.';
  return { action: 'IMPORTED', message: row.action === 'CREATE' ? createMessage : 'Đã cập nhật nội dung.' };
};

export const confirmExerciseImport = async ({ batchId, confirmedBy }) => {
  const batch = await ExerciseImportBatch.findOneAndUpdate(
    { _id: batchId, uploadedBy: confirmedBy, state: 'PREVIEW_READY' },
    { $set: { state: 'CONFIRMING' } },
    { new: true },
  );
  if (!batch) {
    const exists = await ExerciseImportBatch.exists({ _id: batchId, uploadedBy: confirmedBy });
    fail(exists ? 'BATCH_NOT_READY' : 'BATCH_NOT_FOUND', exists ? 'Phiên này đã được xác nhận hoặc đang xử lý.' : 'Không tìm thấy phiên import.', exists ? 409 : 404);
  }
  const Model = targetFor(batch.exerciseType);
  const rows = await ExerciseImportRow.find({ batchId, action: { $in: ['CREATE', 'UPDATE'] } }).sort({ rowNumber: 1 });
  let imported = 0;
  let failed = 0;
  for (let start = 0; start < rows.length; start += 20) {
    const chunk = rows.slice(start, start + 20);
    await Promise.all(chunk.map(async (row) => {
      try {
        const result = await confirmRow(Model, batch.exerciseType, row, confirmedBy);
        row.action = result.action;
        row.resultMessage = result.message;
        if (result.action === 'IMPORTED') imported += 1;
        else failed += 1;
      } catch (error) {
        row.action = 'FAILED';
        row.resultMessage = error?.code === 11000
          ? 'Bản ghi trùng khóa đã được tạo đồng thời; không ghi đè dữ liệu.'
          : error?.message || 'Không thể lưu bản ghi.';
        failed += 1;
      }
      await row.save();
    }));
  }
  batch.state = failed ? 'PARTIALLY_CONFIRMED' : 'CONFIRMED';
  batch.resultCounts = { imported, failed };
  batch.confirmedBy = confirmedBy;
  batch.confirmedAt = new Date();
  await batch.save();
  return getExerciseImportBatch(batchId);
};
