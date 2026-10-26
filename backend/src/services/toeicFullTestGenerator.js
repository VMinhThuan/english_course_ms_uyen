import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import Question from '../models/Question.js';
import QuestionGroup from '../models/QuestionGroup.js';
import { DEFAULT_TOEIC_PARTS } from '../utils/toeicHelper.js';

export const TOEIC_FULL_TEST_SPEC = Object.freeze({
  1: { questions: 6, groups: 6, groupSize: 1, section: 'listening' },
  2: { questions: 25, groups: 25, groupSize: 1, section: 'listening' },
  3: { questions: 39, groups: 13, groupSize: 3, section: 'listening' },
  4: { questions: 30, groups: 10, groupSize: 3, section: 'listening' },
  5: { questions: 30, groups: 30, groupSize: 1, section: 'reading' },
  6: { questions: 16, groups: 4, groupSize: 4, section: 'reading' },
  7: {
    questions: 54,
    section: 'reading',
    passageQuestions: 29,
    multiPassageQuestions: 25,
  },
});

export class ToeicFullTestGenerationError extends Error {
  constructor(message, code = 'TOEIC_FULL_TEST_GENERATION_FAILED', details = null) {
    super(message);
    this.name = 'ToeicFullTestGenerationError';
    this.code = code;
    this.details = details;
    this.statusCode = 422;
  }
}

const clean = (value) => typeof value === 'string' ? value.trim() : '';
const idString = (value) => value?._id?.toString?.() || value?.toString?.() || '';
const contentKey = (question) => crypto.createHash('sha256').update(JSON.stringify({
  questionText: clean(question?.questionText).toLowerCase().replace(/\s+/g, ' '),
  options: (question?.options || []).map((option) => ({
    id: option?.id || '',
    text: clean(option?.text).toLowerCase().replace(/\s+/g, ' '),
  })),
  correctAnswers: question?.correctAnswers || [],
})).digest('hex');

function addIssue(issues, part, group, message) {
  issues.push({
    part,
    groupId: idString(group),
    title: group?.title || '',
    message,
  });
}

function questionIsEligible(question, part, group, issues) {
  if (!question || question.sourceType === 'user') {
    addIssue(issues, part, group, 'Câu hỏi không có quyền sử dụng đã xác minh.');
    return false;
  }
  if (Number(question.toeicPart) !== part) {
    addIssue(issues, part, group, 'toeicPart của câu hỏi không khớp với group.');
    return false;
  }
  const expectedOptionCount = part === 2 ? 3 : 4;
  if (!clean(question.questionText) || !Array.isArray(question.options) || question.options.length !== expectedOptionCount) {
    addIssue(issues, part, group, `Thiếu nội dung hoặc đủ ${expectedOptionCount} lựa chọn.`);
    return false;
  }
  if (!Array.isArray(question.correctAnswers) || question.correctAnswers.length !== 1) {
    addIssue(issues, part, group, 'Thiếu chính xác một đáp án đúng.');
    return false;
  }
  return true;
}

function normalizeGroup(group, issues) {
  const part = Number(group.partNumber);
  const sourceQuestions = Array.isArray(group.questionIds) ? group.questionIds : [];
  const questions = sourceQuestions.filter((question) => questionIsEligible(question, part, group, issues));
  const spec = TOEIC_FULL_TEST_SPEC[part];
  if (!spec) {
    addIssue(issues, part, group, 'Part không thuộc 1–7.');
    return null;
  }
  if (part === 7) {
    if (!['passage', 'multi_passage'].includes(group.type) || ![2, 3, 4, 5].includes(questions.length)) {
      addIssue(issues, part, group, 'Part 7 phải là group passage/multi_passage có 2–5 câu.');
      return null;
    }
    if (!Array.isArray(group.passages) || group.passages.length === 0) {
      addIssue(issues, part, group, 'Part 7 thiếu passage.');
      return null;
    }
  } else if (questions.length !== spec.groupSize) {
    addIssue(issues, part, group, `Group cần đúng ${spec.groupSize} câu nhưng đang có ${questions.length}.`);
    return null;
  }
  if (part === 1 && !group.imageUrl && !questions.some((question) => question.imageUrl)) {
    addIssue(issues, part, group, 'Part 1 thiếu hình ảnh.');
    return null;
  }
  if ([3, 4].includes(part) && !group.audioText && !questions.some((question) => question.audioText)) {
    addIssue(issues, part, group, 'Part nghe thiếu transcript/TTS.');
    return null;
  }
  const questionContentKeys = questions.map((question) => contentKey(question));
  if (new Set(questionContentKeys).size !== questionContentKeys.length) {
    addIssue(issues, part, group, 'Group có câu hỏi trùng nội dung.');
    return null;
  }
  return {
    sourceGroup: group,
    part,
    type: group.type,
    order: group.order || 0,
    questions,
    questionIds: questions.map((question) => idString(question)),
    questionContentKeys,
  };
}

function summarizeInventory(groups, issues) {
  const byPart = {};
  for (let part = 1; part <= 7; part += 1) {
    const rows = groups.filter((group) => group.part === part);
    byPart[part] = {
      groups: rows.length,
      questions: rows.reduce((sum, group) => sum + group.questions.length, 0),
      groupSizes: rows.reduce((sizes, group) => {
        const size = String(group.questions.length);
        sizes[size] = (sizes[size] || 0) + 1;
        return sizes;
      }, {}),
      types: rows.reduce((types, group) => {
        types[group.type] = (types[group.type] || 0) + 1;
        return types;
      }, {}),
    };
  }
  return { byPart, validationIssues: issues, validationIssueCount: issues.length };
}

export async function inspectToeicFullTestSource(sourceAssessmentId) {
  const query = sourceAssessmentId
    ? { _id: sourceAssessmentId }
    : { crawlerSourceSystem: 'toeic-question-ocean' };
  const source = await Assessment.findOne(query).select('+crawlerSourceSystem +crawlerSourceId').populate({
    path: 'questionGroups',
    populate: { path: 'questionIds', model: 'Question', select: '+sourceMetadata +crawlerSourceId' },
  }).lean();
  if (!source || source.examFormat !== 'toeic') {
    throw new ToeicFullTestGenerationError('Không tìm thấy Assessment TOEIC nguồn.', 'TOEIC_SOURCE_ASSESSMENT_NOT_FOUND');
  }
  const issues = [];
  const groups = (source.questionGroups || [])
    .map((group) => normalizeGroup(group, issues))
    .filter(Boolean);
  const inventory = summarizeInventory(groups, issues);
  return {
    source,
    groups,
    sourceAssessmentId: idString(source),
    sourceVersion: source.crawlerSourceId || '',
    ...inventory,
  };
}

function availableGroups(groups, usedQuestionIds, usedContentKeys) {
  return groups
    .filter((group) => group.questionIds.every((id, index) => (
      !usedQuestionIds.has(id) && !usedContentKeys.has(group.questionContentKeys[index])
    )))
    .sort((left, right) => left.order - right.order || left.sourceGroup.title.localeCompare(right.sourceGroup.title));
}

function selectFixedGroups(groups, count, size, usedQuestionIds, usedContentKeys) {
  const selected = availableGroups(groups, usedQuestionIds, usedContentKeys).filter((group) => group.questions.length === size).slice(0, count);
  return selected.length === count ? selected : null;
}

function selectPart7Groups(groups, targetQuestions, usedQuestionIds, usedContentKeys, targetPassageQuestions = 29, targetMultiPassageQuestions = 25) {
  const candidates = availableGroups(groups, usedQuestionIds, usedContentKeys);
  const states = new Map([['0:0', []]]);
  for (const group of candidates) {
    const isMultiPassage = group.type === 'multi_passage';
    const snapshot = [...states.entries()];
    for (const [key, path] of snapshot) {
      const [passageText, multiText] = key.split(':');
      const passageQuestions = Number(passageText) + (isMultiPassage ? 0 : group.questions.length);
      const multiPassageQuestions = Number(multiText) + (isMultiPassage ? group.questions.length : 0);
      if (passageQuestions > targetPassageQuestions || multiPassageQuestions > targetMultiPassageQuestions) continue;
      const nextKey = `${passageQuestions}:${multiPassageQuestions}`;
      if (!states.has(nextKey)) states.set(nextKey, [...path, group]);
    }
    if (states.has(`${targetPassageQuestions}:${targetMultiPassageQuestions}`)) break;
  }
  return states.get(`${targetPassageQuestions}:${targetMultiPassageQuestions}`) || null;
}

function planOneTest(groups, usedQuestionIds, usedContentKeys) {
  // Reserve source IDs only after the entire plan succeeds. This prevents a
  // partial plan from poisoning the next planning attempt.
  const planningUsedIds = new Set(usedQuestionIds);
  const planningUsedContentKeys = new Set(usedContentKeys);
  const selected = {};
  for (let part = 1; part <= 6; part += 1) {
    const spec = TOEIC_FULL_TEST_SPEC[part];
    const rows = selectFixedGroups(
      groups.filter((group) => group.part === part),
      spec.groups,
      spec.groupSize,
      planningUsedIds,
      planningUsedContentKeys,
    );
    if (!rows) return null;
    selected[part] = rows;
    rows.forEach((group) => {
      group.questionIds.forEach((id) => planningUsedIds.add(id));
      group.questionContentKeys.forEach((key) => planningUsedContentKeys.add(key));
    });
  }
  const part7Spec = TOEIC_FULL_TEST_SPEC[7];
  const part7 = selectPart7Groups(
    groups.filter((group) => group.part === 7),
    part7Spec.questions,
    planningUsedIds,
    planningUsedContentKeys,
    part7Spec.passageQuestions,
    part7Spec.multiPassageQuestions,
  );
  if (!part7) return null;
  selected[7] = part7;
  planningUsedIds.forEach((id) => usedQuestionIds.add(id));
  planningUsedContentKeys.forEach((key) => usedContentKeys.add(key));
  return selected;
}

function buildMissingReport(groups, usedQuestionIds, usedContentKeys) {
  const missing = {};
  for (let part = 1; part <= 7; part += 1) {
    const spec = TOEIC_FULL_TEST_SPEC[part];
    const rows = availableGroups(groups.filter((group) => group.part === part), usedQuestionIds, usedContentKeys);
    const availableQuestions = rows.reduce((sum, group) => sum + group.questions.length, 0);
    const availableGroupsCount = rows.length;
    if (part === 7) {
      const availablePassageQuestions = rows
        .filter((group) => group.type === 'passage')
        .reduce((sum, group) => sum + group.questions.length, 0);
      const availableMultiPassageQuestions = rows
        .filter((group) => group.type === 'multi_passage')
        .reduce((sum, group) => sum + group.questions.length, 0);
      const missingPassageQuestions = Math.max(0, spec.passageQuestions - availablePassageQuestions);
      const missingMultiPassageQuestions = Math.max(0, spec.multiPassageQuestions - availableMultiPassageQuestions);
      if (missingPassageQuestions || missingMultiPassageQuestions || availableQuestions < spec.questions) {
        missing[part] = {
          questions: Math.max(0, spec.questions - availableQuestions),
          groups: 0,
          passageQuestions: missingPassageQuestions,
          multiPassageQuestions: missingMultiPassageQuestions,
        };
      }
    } else {
      const neededGroups = spec.groups;
      const compatibleGroups = rows.filter((group) => group.questions.length === spec.groupSize).length;
      if (compatibleGroups < neededGroups) missing[part] = {
        questions: Math.max(0, spec.questions - availableQuestions),
        groups: neededGroups - compatibleGroups,
      };
    }
    if (!missing[part] && availableGroupsCount === 0) missing[part] = { questions: spec.questions, groups: spec.groups || 0 };
  }
  return missing;
}

function questionClonePayload(question, assessmentId, groupId, actorId) {
  return {
    questionText: question.questionText,
    type: question.type,
    explanation: question.explanation,
    translation: question.translation,
    answerTranslation: question.answerTranslation,
    audioText: question.audioText,
    audioTranslation: question.audioTranslation,
    audioSource: question.audioSource,
    audioUrl: question.audioUrl,
    imageUrl: question.imageUrl,
    imageAlt: question.imageAlt,
    difficulty: question.difficulty,
    category: question.category,
    tags: question.tags,
    sourceType: question.sourceType,
    sourceLabel: question.sourceLabel,
    sourceProvider: question.sourceProvider,
    sourceUrl: question.sourceUrl,
    sourceDetail: question.sourceDetail,
    sourceNote: question.sourceNote,
    evidence: question.evidence,
    evidenceLocation: question.evidenceLocation,
    choiceNotes: question.choiceNotes,
    sourceMetadata: question.sourceMetadata,
    options: question.options,
    correctAnswers: question.correctAnswers,
    score: question.score || 1,
    status: 'draft',
    toeicPart: question.toeicPart,
    questionGroup: groupId,
    questionNumber: question.questionNumber,
    order: question.order,
    createdBy: actorId || undefined,
    bankSourceQuestionId: question._id,
    bankTargetAssessmentId: assessmentId,
  };
}

/**
 * Strict publish-time validation for assessments generated by this service.
 * Groups are never split and the Part 7 single/multiple-passage distribution
 * is checked separately from the overall 54-question total.
 */
export function validateToeicFullTestAssessment(assessment) {
  const errors = [];
  const groups = Array.isArray(assessment?.questionGroups) ? assessment.questionGroups : [];
  const questionIds = [];
  const byPart = {};

  for (const group of groups) {
    const part = Number(group.partNumber);
    const ids = Array.isArray(group.questionIds) ? group.questionIds : [];
    const size = ids.length;
    questionIds.push(...ids.map((question) => idString(question)));
    byPart[part] = byPart[part] || { groups: 0, questions: 0, passageQuestions: 0, multiPassageQuestions: 0 };
    byPart[part].groups += 1;
    byPart[part].questions += size;
    if (part === 7 && group.type === 'passage') byPart[part].passageQuestions += size;
    if (part === 7 && group.type === 'multi_passage') byPart[part].multiPassageQuestions += size;
  }

  if (questionIds.length !== 200) errors.push(`Đề phải có đúng 200 câu, hiện có ${questionIds.length}.`);
  if (new Set(questionIds).size !== questionIds.length) errors.push('Đề có câu hỏi bị trùng.');
  const assessmentQuestionIds = (assessment?.questions || []).map((item) => idString(item?.question || item));
  if (
    assessmentQuestionIds.length !== questionIds.length
    || new Set(assessmentQuestionIds).size !== new Set(questionIds).size
    || assessmentQuestionIds.some((id) => !questionIds.includes(id))
  ) {
    errors.push('Danh sách câu hỏi của Assessment không khớp với các QuestionGroup.');
  }

  for (let part = 1; part <= 6; part += 1) {
    const actual = byPart[part] || { groups: 0, questions: 0 };
    const expected = TOEIC_FULL_TEST_SPEC[part];
    if (actual.groups !== expected.groups || actual.questions !== expected.questions) {
      errors.push(`Part ${part} cần ${expected.questions} câu/${expected.groups} group, hiện có ${actual.questions} câu/${actual.groups} group.`);
    }
  }
  const part7 = byPart[7] || { questions: 0, passageQuestions: 0, multiPassageQuestions: 0 };
  if (
    part7.questions !== TOEIC_FULL_TEST_SPEC[7].questions
    || part7.passageQuestions !== TOEIC_FULL_TEST_SPEC[7].passageQuestions
    || part7.multiPassageQuestions !== TOEIC_FULL_TEST_SPEC[7].multiPassageQuestions
  ) {
    errors.push(
      `Part 7 cần 54 câu (29 single-passage, 25 multiple-passage), hiện có ${part7.questions} câu (${part7.passageQuestions}/${part7.multiPassageQuestions}).`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    totalQuestions: questionIds.length,
    byPart,
  };
}

async function createGeneratedTest(plan, source, batchId, sequence, actorId, session) {
  const assessment = new Assessment({
    title: `TOEIC Full Test ${String(sequence).padStart(2, '0')}`,
    description: `Đề Full Test 200 câu sinh tự động từ ngân hàng TOEIC đã kiểm tra. Bản nháp chờ Admin review.`,
    type: 'exam',
    examFormat: 'toeic',
    toeicMode: 'full_test',
    durationMinutes: 120,
    attemptLimit: 0,
    showCorrectAnswers: true,
    toeicConfig: {
      totalQuestions: 200,
      durationMinutes: 120,
      listeningQuestionCount: 100,
      readingQuestionCount: 100,
      listeningDurationMinutes: 45,
      readingDurationMinutes: 75,
      scoringMode: 'estimated_toeic',
    },
    parts: DEFAULT_TOEIC_PARTS,
    status: 'draft',
    createdBy: actorId || undefined,
    generatedFromAssessment: source._id,
    generatorBatchId: batchId,
    generatorSequence: sequence,
    crawlerSourceSystem: 'toeic-full-test-generator',
    crawlerSourceId: `${batchId}-${sequence}`,
  });
  await assessment.save({ session });

  const questionRefs = [];
  const groupRefs = [];
  let order = 1;
  for (let part = 1; part <= 7; part += 1) {
    for (const sourceGroup of plan[part]) {
      const group = await QuestionGroup.create([{
        assessment: assessment._id,
        partNumber: sourceGroup.part,
        type: sourceGroup.sourceGroup.type,
        title: sourceGroup.sourceGroup.title,
        instructions: sourceGroup.sourceGroup.instructions,
        imageUrl: sourceGroup.sourceGroup.imageUrl,
        imageUrls: sourceGroup.sourceGroup.imageUrls,
        imagePageNumbers: sourceGroup.sourceGroup.imagePageNumbers,
        audioUrl: sourceGroup.sourceGroup.audioUrl,
        audioText: sourceGroup.sourceGroup.audioText,
        audioSource: sourceGroup.sourceGroup.audioSource,
        transcript: sourceGroup.sourceGroup.transcript,
        passages: sourceGroup.sourceGroup.passages,
        order,
        sourceRepository: 'toeic-question-ocean',
        sourceVersion: source.crawlerSourceId || '',
        sourceMetadata: { generatedFromGroup: sourceGroup.sourceGroup._id, batchId, sequence },
      }], { session }).then((rows) => rows[0]);
      const clonedQuestions = await Question.insertMany(
        sourceGroup.questions.map((question) => questionClonePayload(question, assessment._id, group._id, actorId)),
        { session },
      );
      group.questionIds = clonedQuestions.map((question) => question._id);
      await group.save({ session });
      groupRefs.push(group._id);
      clonedQuestions.forEach((question) => questionRefs.push({ question: question._id, score: question.score || 1 }));
      order += 1;
    }
  }
  assessment.questionGroups = groupRefs;
  assessment.questions = questionRefs;
  await assessment.save({ session });
  return { assessmentId: idString(assessment), questionCount: questionRefs.length, groupCount: groupRefs.length };
}

export async function generateToeicFullTests({ sourceAssessmentId, count = 1, actorId = null } = {}) {
  const requestedCount = Math.min(10, Math.max(1, Math.floor(Number(count) || 1)));
  const inspected = await inspectToeicFullTestSource(sourceAssessmentId);
  if (inspected.validationIssueCount) {
    throw new ToeicFullTestGenerationError('Nguồn có group/câu hỏi không hợp lệ; không tạo đề.', 'TOEIC_SOURCE_VALIDATION_FAILED', inspected);
  }
  const existingTests = await Assessment.find({ generatedFromAssessment: inspected.source._id })
    .select('+generatedFromAssessment +generatorBatchId +generatorSequence')
    .select('questions questionGroups')
    .lean();
  const existingIds = existingTests.map((test) => test._id);
  const existingClones = existingIds.length
    ? await Question.find({ bankTargetAssessmentId: { $in: existingIds } }).select('+bankSourceQuestionId +bankTargetAssessmentId questionText options correctAnswers').lean()
    : [];
  const usedQuestionIds = new Set(existingClones.map((question) => idString(question.bankSourceQuestionId)).filter(Boolean));
  const usedContentKeys = new Set(existingClones.map((question) => contentKey(question)));
  const plans = [];
  const planningUsedIds = new Set(usedQuestionIds);
  const planningUsedContentKeys = new Set(usedContentKeys);
  for (let sequence = 1; sequence <= requestedCount; sequence += 1) {
    const plan = planOneTest(inspected.groups, planningUsedIds, planningUsedContentKeys);
    if (!plan) break;
    plans.push(plan);
  }
  const report = {
    sourceAssessmentId: inspected.sourceAssessmentId,
    requestedCount,
    existingGeneratedCount: existingTests.length,
    available: inspected.byPart,
    createdCount: plans.length,
    shortageCount: requestedCount - plans.length,
    missingForNextTest: plans.length < requestedCount
      ? buildMissingReport(inspected.groups, planningUsedIds, planningUsedContentKeys)
      : {},
    validationIssueCount: inspected.validationIssueCount,
    tests: [],
  };
  if (!plans.length) {
    throw new ToeicFullTestGenerationError('Không đủ group/câu hỏi để tạo thêm Full Test chuẩn.', 'TOEIC_FULL_TEST_INSUFFICIENT_BANK', report);
  }
  const batchId = crypto.randomUUID();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (let index = 0; index < plans.length; index += 1) {
        report.tests.push(await createGeneratedTest(plans[index], inspected.source, batchId, existingTests.length + index + 1, actorId, session));
      }
    });
  } finally {
    await session.endSession();
  }
  return { ...report, batchId };
}
