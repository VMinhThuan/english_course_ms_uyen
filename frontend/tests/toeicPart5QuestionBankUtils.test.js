import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPart5CompletenessIssues,
  mapPart5ApiValidationErrors,
  normalizePart5QuestionForm,
  validatePart5QuestionForm,
} from '../src/pages/admin/toeicPart5QuestionBankUtils.js';

const validQuestion = () => ({
  questionText: 'The manager _____ the report.',
  type: 'single_choice',
  toeicPart: 5,
  options: [
    { id: 'A', text: 'carefully' },
    { id: 'B', text: 'quickly' },
    { id: 'C', text: 'careful' },
    { id: 'D', text: 'carefulness' },
  ],
  correctAnswers: ['A'],
  explanation: 'An adverb modifies the verb.',
  status: 'draft',
});

test('Part 5 form accepts exactly four A-D options and one matching answer', () => {
  assert.deepEqual(validatePart5QuestionForm(validQuestion()), {});
});

test('Part 5 form reports missing stem, options, answer, and explanation by field', () => {
  const form = validQuestion();
  form.questionText = '  ';
  form.options[2].text = '';
  form.correctAnswers = ['Z'];
  form.explanation = '';
  assert.deepEqual(validatePart5QuestionForm(form), {
    questionText: 'Vui lòng nhập nội dung câu hỏi.',
    options: 'Vui lòng nhập nội dung cho cả bốn phương án A, B, C và D.',
    correctAnswers: 'Hãy chọn chính xác một đáp án đúng A, B, C hoặc D.',
    explanation: 'Vui lòng nhập lời giải thích.',
  });
});

test('legacy normalization preserves option order and never guesses an unmapped correct answer', () => {
  const legacy = normalizePart5QuestionForm({
    questionText: 'Legacy question',
    options: [{ id: 'old-1', text: 'first' }, { id: 'old-2', text: 'second' }],
    correctAnswers: ['missing-id'],
  });
  assert.deepEqual(legacy.options, [
    { id: 'A', text: 'first' },
    { id: 'B', text: 'second' },
    { id: 'C', text: '' },
    { id: 'D', text: '' },
  ]);
  assert.deepEqual(legacy.correctAnswers, []);
  assert.deepEqual(getPart5CompletenessIssues({ ...legacy, correctAnswers: [] }), [
    'thiếu phương án',
    'thiếu hoặc sai đáp án đúng',
    'thiếu lời giải thích',
  ]);
});

test('legacy answers are mapped only through their existing option IDs', () => {
  const form = normalizePart5QuestionForm({
    options: [{ id: 'one', text: 'one' }, { id: 'two', text: 'two' }, { id: 'three', text: 'three' }, { id: 'four', text: 'four' }],
    correctAnswers: ['three'],
  });
  assert.deepEqual(form.correctAnswers, ['C']);
});

test('Part 5 API field errors are surfaced as field errors', () => {
  assert.deepEqual(mapPart5ApiValidationErrors({
    response: { data: { fieldErrors: { explanation: 'Explanation is required.' } } },
  }), { explanation: 'Explanation is required.' });
  assert.deepEqual(mapPart5ApiValidationErrors({
    response: { data: { message: 'TOEIC Part 5 questions require exactly 4 options (A, B, C, D)' } },
  }), { options: 'TOEIC Part 5 questions require exactly 4 options (A, B, C, D)' });
});
