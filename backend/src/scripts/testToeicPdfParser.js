import assert from 'node:assert/strict';
import { parseToeicPdf } from '../utils/toeicPdfParser.js';

const ocrText = `PART 5
1. Select the correct response.
(A) first
(B) second
(C) third
(D) fourth
Who wrote the e-mail?
2.
(A) a manager
(B) an assistant
(C) a customer
(D) a supplier
PART 7
Questions 3-4 refer to the following notice.
The office will be closed for inventory this Friday.
3. What will happen next?
(A) A meeting
(B) A delivery
(C) A call
(D) A change
4. When will it happen?
(A) Today
(B) Tomorrow
(C) Next week
3. What is the notice about?
(A) A meeting
(B) A delivery
(C) A call
(D) A change
ANSWER KEY: 1-4
1 A 1 B 2 C 3 B 4 D`;

const result = await parseToeicPdf(Buffer.from('synthetic test PDF'), {
  extractedText: ocrText,
  extractionMethod: 'test_fixture',
  toeicMode: 'practice',
});

const questions = result.parsedQuestions;
const question1 = questions.find((question) => question.questionNumber === 1);
const question2 = questions.find((question) => question.questionNumber === 2);
const question4 = questions.find((question) => question.questionNumber === 4);

assert.deepEqual(question1.correctAnswers, [], 'conflicting key entries must not select an answer automatically');
assert.equal(question2.questionText, 'Who wrote the e-mail?', 'a question stem read before its number must be recovered');
assert.deepEqual(question2.correctAnswers, ['opt_3']);
assert.deepEqual(result.report.detected.answerKeyConflicts, [{ questionNumber: 1, answers: ['A', 'B'] }]);
assert.deepEqual(result.report.detected.duplicateQuestionNumbers, [3]);
assert.equal(result.report.detected.incompleteOptionQuestions, 1);
assert.ok(result.report.warnings.some((warning) => warning.includes('Part 7 có 1 passage')));
assert.ok(result.report.warnings.some((warning) => warning.includes('OCR nhận diện trùng số câu 3')));
assert.ok(result.report.warnings.some((warning) => warning.includes('chưa nhận đủ 4 lựa chọn')));
assert.ok(question4.correctAnswers.length === 0, 'an answer without a matching option must remain unset');

const noKeyResult = await parseToeicPdf(Buffer.from('synthetic test PDF'), {
  extractedText: `PART 5
1. Choose the best answer.
(A) first
(B) second
(C) third
(D) fourth
1 A`,
  extractionMethod: 'test_fixture',
  toeicMode: 'practice',
});
assert.deepEqual(noKeyResult.answerKeyMap, {}, 'answer-like pairs outside an explicit key section must not be used');
assert.ok(noKeyResult.report.warnings.some((warning) => warning.includes('Không tìm thấy tiêu đề Answer Key')));

const mergedOptionsResult = await parseToeicPdf(Buffer.from('synthetic test PDF'), {
  extractedText: `PART 5
1. Choose the correct word.
(A) impressive
(B) enthusiastic (©) unlimited
(D) informed ‘GO ON TO THE NEXT PAGE Be
ANSWER KEY: 1-4
1 A 2 B 3 C 4 D`,
  extractionMethod: 'test_fixture',
  toeicMode: 'practice',
});
const mergedOptionsQuestion = mergedOptionsResult.parsedQuestions[0];
assert.deepEqual(
  mergedOptionsQuestion.options.map((option) => [option.id, option.text]),
  [
    ['opt_1', '(A) impressive'],
    ['opt_2', '(B) enthusiastic'],
    ['opt_3', '(C) unlimited'],
    ['opt_4', '(D) informed'],
  ],
  'inline C choices and page-turn instructions must not merge into an adjacent option',
);
assert.deepEqual(mergedOptionsQuestion.correctAnswers, ['opt_1']);

const embeddedPart7QuestionResult = await parseToeicPdf(Buffer.from('synthetic test PDF'), {
  extractedText: `PART 7
Questions 151-152 refer to the following text-message chain.
Irene asks Anthony about sales figures.
151. What is true about Anthony?
(A) He is on a trip.
(B) He lost his files.
(C) He changed jobs.
(D) He forgot to compile some sales figures. At 11:01 a.m., what does Mr. Cipriani mean when he writes “No problem"?
152.
(A) A question about the files
(B) A request for a meeting
(C) A complaint about a report
(D) A request for clarification`,
  extractionMethod: 'test_fixture',
  toeicMode: 'full_test',
});
assert.equal(
  embeddedPart7QuestionResult.parsedQuestions.find((question) => question.questionNumber === 152).questionText,
  'At 11:01 a.m., what does Mr. Cipriani mean when he writes “No problem"?',
  'a Part 7 stem appended to option D must be moved to its number-only question label',
);
assert.equal(
  embeddedPart7QuestionResult.parsedGroups.find((group) => group.partNumber === 7).questions.length,
  2,
);

const reorderedPart7PassageResult = await parseToeicPdf(Buffer.from('synthetic test PDF'), {
  extractedText: `PART 7
Questions 181-185 refer to the following survey and summary.
Employee Growth Survey
181. What does the employee comment on?
(A) Training
(B) Salary
(C) Travel
(D) Hiring
182. What is suggested about the employee?
(A) She is new.
(B) She is a manager.
(C) She is leaving.
(D) She is a trainer.
183. Which statement had the lowest rating?
(A) Statement 1
(B) Statement 2
(C) Statement 3
(D) Statement 4
184.
I have grown professionally in the past year. The survey summary explains the results and recommends assembling a task force to research the issue and seek solutions.
184. What problem with the survey does the summary mention?
(A) Low responses
(B) Late delivery
(C) Missing staff
(D) Bad instructions
185. What is recommended?
(A) A new survey
(B) A task force
(C) A workshop
(D) A new policy
Answer Keys 181 (A) 182 (B) 183 (C) 184 (D) 185 (B)`,
  extractionMethod: 'test_fixture',
  toeicMode: 'full_test',
});
const reorderedPart7Group = reorderedPart7PassageResult.parsedGroups.find((group) => group.partNumber === 7);
assert.equal(reorderedPart7Group.questions.length, 5, 'a number-only duplicate label must not create an extra Part 7 question');
assert.equal(
  reorderedPart7Group.questions.find((question) => question.questionNumber === 184).questionText,
  'What problem with the survey does the summary mention?',
);
assert.equal(reorderedPart7Group.passages[0].content, '', 'Part 7 OCR passage prose must not be persisted as student-facing content');

const part7SurveyResult = await parseToeicPdf(Buffer.from('synthetic test PDF'), {
  extractedText: `PART 7
Questions 181-185 refer to the following survey and summary.
Employee Growth Survey
1. I receive sufficient opportunities to take on new tasks.
2. My supervisor supports my professional growth.
3. I have grown professionally in the past year.
181. What does the employee comment on?
(A) Training
(B) Salary
(C) Travel
(D) Hiring
182. What is suggested about the employee?
(A) She is new.
(B) She is a manager.
(C) She is leaving.
(D) She is a trainer.
183. Which statement had the lowest rating?
(A) Statement 1
(B) Statement 2
(C) Statement 3
(D) Statement 4
184. What problem is mentioned?
(A) Low responses
(B) Late delivery
(C) Missing staff
(D) Bad instructions
185. What is recommended?
(A) A new survey
(B) A task force
(C) A workshop
(D) A new policy
Answer Keys 181 (A) 182 (B) 183 (C) 184 (D) 185 (B)`,
  extractionMethod: 'test_fixture',
  toeicMode: 'full_test',
});
const part7SurveyGroup = part7SurveyResult.parsedGroups.find((group) => group.partNumber === 7);
assert.equal(part7SurveyGroup.questions.length, 5, 'survey row numbers must stay in passage text, not become extra questions');
assert.equal(part7SurveyGroup.passages[0].content, '', 'Part 7 survey prose should be displayed from a source image instead of OCR text');
assert.deepEqual(part7SurveyResult.report.detected.groupQuestionCountMismatches, []);

const inlineAnswerKeyResult = await parseToeicPdf(Buffer.from('synthetic test PDF'), {
  extractedText: `PART 7
Questions 196-200 refer to the following advertisement and e-mail.
Sparkle Car offers vehicle maintenance.
196. What does the company provide?
(A) Repairs
(B) Insurance
(C) Training
(D) Fuel
197. What does Ms. Tenton request?
(A) A refund
(B) A new vehicle
(C) A discount
(D) An appointment
198. When did the service happen?
(A) Monday
(B) Tuesday
(C) Wednesday
(D) Thursday
199. What is refunded?
(A) $25
(B) $50
(C) $495
(D) $1,202
200. What does Mr. Shadow ask Ms. Tenton to do?
(A) Return a signed contract
(B) Speak to her colleague
(C) Visit another branch
(D) Check some completed work before time is called. Answer Keys eh 196 (A) 197 (B) 198 (C) 199 (D) 200 (A)`,
  extractionMethod: 'test_fixture',
  toeicMode: 'full_test',
});
const finalQuestion = inlineAnswerKeyResult.parsedQuestions.find((question) => question.questionNumber === 200);
assert.equal(finalQuestion.options.length, 3, 'footer and inline answer-key text must not become the final answer choice');
assert.ok(finalQuestion.options.every((option) => !/completed work|Answer Keys/i.test(option.text)));
assert.equal(inlineAnswerKeyResult.answerKeyMap[200], 'A', 'inline Answer Key headings must still expose their answer pairs');

const passageImageResult = await parseToeicPdf(Buffer.from('synthetic test PDF'), {
  extractedText: `-- 8 of 20 --
PART 7
Questions 147-148 refer to the following notice.
The office will close for inventory on Friday.
147. What will happen on Friday?
(A) The office will close.
(B) A meeting will begin.
(C) A delivery will arrive.
(D) Staff will travel.
148. When will the office close?
(A) Monday
(B) Wednesday
(C) Friday
(D) Saturday`,
  imagePageNumbers: [8],
  pageImageUrlsByNumber: { 8: '/uploads/page-8.jpg' },
  extractionMethod: 'test_fixture',
  toeicMode: 'full_test',
});
const passageImageGroup = passageImageResult.parsedGroups.find((group) => group.partNumber === 7);
assert.equal(passageImageGroup.passages[0].content, '', 'Part 7 OCR prose must not be saved');
assert.equal(passageImageGroup.passages[0].imageUrl, '/uploads/page-8.jpg', 'Part 7 passage source page should be attached as an image');
assert.deepEqual(passageImageGroup.passages[0].imagePageNumbers, [8]);

const partOneImageResult = await parseToeicPdf(Buffer.from('synthetic test PDF'), {
  extractedText: `-- 1 of 1 --
PART 1
1.
2.
3.
4.
5.
6.
Answer Keys 1 (A) 2 (B) 3 (C) 4 (D) 5 (A) 6 (B)`,
  imagePageNumbers: [1],
  pageImageUrlsByNumber: { 1: '/uploads/part-1-page.jpg' },
  extractionMethod: 'test_fixture',
  toeicMode: 'full_test',
});
const partOneImageGroup = partOneImageResult.parsedGroups.find((group) => group.partNumber === 1);
assert.equal(partOneImageGroup.questions.length, 6, 'all six Part 1 photo question labels must be retained');
assert.deepEqual(partOneImageGroup.imagePageNumbers, [1], 'the complete source page with all six photos must stay attached');
assert.equal(partOneImageGroup.imageUrl, '/uploads/part-1-page.jpg');

const finishFooterResult = await parseToeicPdf(Buffer.from('synthetic test PDF'), {
  extractedText: `PART 7
Questions 196-200 refer to the following e-mail.
196. What is offered?
(A) Repairs
(B) Insurance
(C) Training
(D) Fuel
197. What is requested?
(A) A refund
(B) A vehicle
(C) A discount
(D) An appointment
198. When did the service happen?
(A) Monday
(B) Tuesday
(C) Wednesday
(D) Thursday
199. What is refunded?
(A) $25
(B) $50
(C) $495
(D) $1,202
200. What does Mr. Shadow ask Ms. Tenton to do?
(A) Return a signed contract
(B) Speak to her colleague
(C) Visit another branch of Sparkle Car. Finish before time is called, you may go 17 and CXXJ
Answer Keys 196 (A) 197 (B) 198 (C) 199 (D) 200 (A)`,
  extractionMethod: 'test_fixture',
  toeicMode: 'full_test',
});
const finishFooterQuestion = finishFooterResult.parsedQuestions.find((question) => question.questionNumber === 200);
assert.match(finishFooterQuestion.options[2].text, /another branch of Sparkle Car\./i);
assert.doesNotMatch(finishFooterQuestion.options[2].text, /finish before time|CXXJ/i);
assert.ok(finishFooterResult.report.detected.suspiciousOptionQuestionNumbers.includes(200));

const contaminatedPart7Result = await parseToeicPdf(Buffer.from('synthetic test PDF'), {
  extractedText: `PART 7
Questions 147-148 refer to the following notice.
The office will close for inventory on Friday.
147. What will happen on Friday?
(A) The office will close.
(B) A meeting will begin.
(C) A delivery will arrive.
(D) The site of its hiring interviews
The exhibit is the work of museum curator Dan Swanson, who stated that he was extremely proud of it.
148. When will the office close?
(A) Monday
(B) Wednesday
(C) Friday
(D) Saturday`,
  extractionMethod: 'test_fixture',
  toeicMode: 'practice',
});
const contaminatedQuestion = contaminatedPart7Result.parsedQuestions.find((question) => question.questionNumber === 147);
assert.equal(contaminatedQuestion.options.length, 4, 'the question should retain all four options');
assert.match(contaminatedQuestion.options[3].text, /site of its hiring interviews/i);
assert.doesNotMatch(contaminatedQuestion.options[3].text, /exhibit|museum curator/i, 'passage text after option D must not leak into the option');

const expectedMissingQuestions = [1, 3, 5, 53, 163];
const expectedIncompleteQuestions = [40, 44, 45, 52, 63, 70, 100, 151, 155, 166, 187, 200];
const missingQuestionSet = new Set(expectedMissingQuestions);
const incompleteQuestionSet = new Set(expectedIncompleteQuestions);
const fullTestRanges = [[1, 6], [7, 31], [32, 70], [71, 100], [101, 130], [131, 146], [147, 200]];
const fullTestOcrLines = [];
for (let partIndex = 0; partIndex < fullTestRanges.length; partIndex += 1) {
  const partNumber = partIndex + 1;
  const [start, end] = fullTestRanges[partIndex];
  fullTestOcrLines.push(`PART ${partNumber}`);
  for (let questionNumber = start; questionNumber <= end; questionNumber += 1) {
    if (missingQuestionSet.has(questionNumber)) continue;
    fullTestOcrLines.push(`${questionNumber}. What is the correct answer for question ${questionNumber}?`);
    if (partNumber >= 3) {
      fullTestOcrLines.push('(A) Choice A', '(B) Choice B', '(C) Choice C');
      if (!incompleteQuestionSet.has(questionNumber)) fullTestOcrLines.push('(D) Choice D');
    }
  }
}
const fullTestValidationResult = await parseToeicPdf(Buffer.from('synthetic test PDF'), {
  extractedText: fullTestOcrLines.join('\n'),
  extractionMethod: 'test_fixture',
  toeicMode: 'full_test',
});
assert.deepEqual(fullTestValidationResult.report.detected.missingQuestionNumbers, expectedMissingQuestions);
assert.deepEqual(fullTestValidationResult.report.detected.incompleteOptionQuestionNumbers, expectedIncompleteQuestions);
assert.equal(fullTestValidationResult.report.saveValidation.allowed, false, 'a structurally incomplete full test must require review before saving');

console.log('TOEIC PDF parser checks passed.');
