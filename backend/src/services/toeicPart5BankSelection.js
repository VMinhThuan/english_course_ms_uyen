import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import Question from '../models/Question.js';
import QuestionGroup from '../models/QuestionGroup.js';
import QuestionBankSelectionBatch from '../models/QuestionBankSelectionBatch.js';

const MAX_SELECTION_SIZE = 50;
const LOCK_LEASE_MS = 5 * 60 * 1000;
const OPTION_IDS = ['A', 'B', 'C', 'D'];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

export const hasActiveQuestionBankSelectionLock = async (assessmentId) => {
  const assessment = await Assessment.findById(assessmentId)
    .select('+bankSelectionLockToken +bankSelectionLockExpiresAt')
    .lean();
  return Boolean(
    assessment?.bankSelectionLockToken
    && assessment.bankSelectionLockExpiresAt > new Date()
  );
};

export const getPart5EligibilityIssues = (question) => {
  const issues = [];
  if (!question) return [{ code: 'QUESTION_NOT_FOUND', field: 'questionId', message: 'Không tìm thấy câu hỏi.' }];
  if (question.bankSourceQuestionId || question.bankTargetAssessmentId) {
    issues.push({ code: 'NOT_BANK_SOURCE', field: 'questionId', message: 'Chỉ chọn câu nguồn trong Question Bank.' });
  }
  if (Number(question.toeicPart) !== 5) {
    issues.push({ code: 'WRONG_TOEIC_PART', field: 'toeicPart', message: 'Câu hỏi không thuộc TOEIC Part 5.' });
  }
  if (question.type !== 'single_choice') {
    issues.push({ code: 'WRONG_QUESTION_TYPE', field: 'type', message: 'Câu hỏi Part 5 phải là single_choice.' });
  }
  if (question.status !== 'published') {
    issues.push({ code: 'QUESTION_NOT_PUBLISHED', field: 'status', message: 'Câu hỏi phải được Admin duyệt và Published.' });
  }
  if (typeof question.questionText !== 'string' || !question.questionText.trim()) {
    issues.push({ code: 'MISSING_QUESTION_TEXT', field: 'questionText', message: 'Thiếu nội dung câu hỏi.' });
  }

  const options = Array.isArray(question.options) ? question.options : [];
  const optionIds = options.map((option) => option?.id);
  if (options.length !== 4 || OPTION_IDS.some((id) => !optionIds.includes(id)) || new Set(optionIds).size !== 4) {
    issues.push({ code: 'INVALID_OPTIONS', field: 'options', message: 'Cần đúng bốn phương án có ID A, B, C và D.' });
  }
  if (options.some((option) => typeof option?.text !== 'string' || !option.text.trim())) {
    issues.push({ code: 'MISSING_OPTION_TEXT', field: 'options', message: 'Mỗi phương án A, B, C, D phải có nội dung.' });
  }

  const correctAnswers = Array.isArray(question.correctAnswers) ? question.correctAnswers : [];
  if (correctAnswers.length !== 1 || !optionIds.includes(correctAnswers[0])) {
    issues.push({ code: 'INVALID_CORRECT_ANSWER', field: 'correctAnswers', message: 'Cần chính xác một đáp án đúng khớp với A, B, C hoặc D.' });
  }
  if (typeof question.explanation !== 'string' || !question.explanation.trim()) {
    issues.push({ code: 'MISSING_EXPLANATION', field: 'explanation', message: 'Cần có lời giải thích.' });
  }
  return issues;
};

export const listEligiblePart5Questions = async ({ assessmentId, search = '', page = 1, limit = 20 }) => {
  const safeSearch = String(search).trim().slice(0, 120);
  const pageNumber = Math.max(1, Math.floor(Number(page) || 1));
  const limitNumber = Math.min(50, Math.max(1, Math.floor(Number(limit) || 20)));
  const query = {
    toeicPart: 5,
    type: 'single_choice',
    status: 'published',
    bankSourceQuestionId: { $exists: false },
    bankTargetAssessmentId: { $exists: false },
  };
  if (safeSearch) query.questionText = { $regex: escapeRegex(safeSearch), $options: 'i' };

  // Eligibility is checked against current stored values before pagination;
  // published legacy records with incomplete content are excluded here.
  const candidates = await Question.find(query).sort({ createdAt: -1, _id: 1 }).lean();
  const eligible = candidates.filter((question) => getPart5EligibilityIssues(question).length === 0);
  const total = eligible.length;
  const pageItems = eligible.slice((pageNumber - 1) * limitNumber, pageNumber * limitNumber);
  const alreadySelected = new Set();
  if (pageItems.length) {
    const sourceIds = pageItems.map((question) => question._id);
    const assessment = await Assessment.findById(assessmentId).select('questions questionGroups').lean();
    const directQuestionIds = new Set((assessment?.questions || []).map((item) => String(item.question?._id || item.question)));
    const groups = assessment?.questionGroups?.length
      ? await QuestionGroup.find({ _id: { $in: assessment.questionGroups } }).select('questionIds').lean()
      : [];
    groups.flatMap((group) => group.questionIds || []).forEach((questionId) => directQuestionIds.add(String(questionId)));
    sourceIds.forEach((sourceId) => {
      if (directQuestionIds.has(String(sourceId))) alreadySelected.add(String(sourceId));
    });
    const clones = await Question.find({
      bankTargetAssessmentId: assessmentId,
      bankSourceQuestionId: { $in: sourceIds },
    }).select('+bankSourceQuestionId +bankTargetAssessmentId').lean();
    clones.forEach((clone) => alreadySelected.add(String(clone.bankSourceQuestionId)));
  }

  return {
    questions: pageItems.map((question) => ({
      ...question,
      alreadyInAssessment: alreadySelected.has(String(question._id)),
    })),
    pagination: {
      total,
      page: pageNumber,
      pages: Math.max(1, Math.ceil(total / limitNumber)),
      limit: limitNumber,
    },
  };
};

const loadAdminAssessment = (assessmentId) => Assessment.findById(assessmentId).populate({
  path: 'questionGroups',
  populate: { path: 'questionIds', model: 'Question' },
});

const makeAssessmentResponse = async (assessmentId) => loadAdminAssessment(assessmentId);

const acquireAssessmentLock = async (assessmentId) => {
  const token = randomUUID();
  const now = new Date();
  const locked = await Assessment.findOneAndUpdate(
    {
      _id: assessmentId,
      examFormat: 'toeic',
      status: 'draft',
      $or: [
        { bankSelectionLockToken: { $exists: false } },
        { bankSelectionLockExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        bankSelectionLockToken: token,
        bankSelectionLockExpiresAt: new Date(now.getTime() + LOCK_LEASE_MS),
      },
    },
    { new: true, projection: { _id: 1 } }
  );
  return locked ? token : null;
};

const releaseAssessmentLock = async (assessmentId, token) => {
  await Assessment.updateOne(
    { _id: assessmentId, bankSelectionLockToken: token },
    { $unset: { bankSelectionLockToken: 1, bankSelectionLockExpiresAt: 1 } }
  );
};

const appendAssessmentQuestion = (assessment, question) => {
  const questionId = String(question._id);
  const exists = (assessment.questions || []).some((item) => String(item.question?._id || item.question) === questionId);
  if (!exists) assessment.questions.push({ question: question._id, score: question.score || 1 });
  const groupExists = (assessment.questionGroups || []).some((groupId) => String(groupId?._id || groupId) === String(question.questionGroup));
  if (!groupExists) assessment.questionGroups.push(question.questionGroup);
};

const getNextPart5QuestionNumber = async (assessmentId) => {
  const groups = await QuestionGroup.find({ assessment: assessmentId, partNumber: 5 }).select('questionIds').lean();
  const ids = groups.flatMap((group) => group.questionIds || []);
  if (!ids.length) return 1;
  const questions = await Question.find({ _id: { $in: ids } }).select('questionNumber').lean();
  return questions.reduce((max, question) => Math.max(max, Number(question.questionNumber) || 0), 0) + 1;
};

const attachClone = async ({ assessment, group, clone, questionNumber }) => {
  if (clone.questionGroup && String(clone.questionGroup) !== String(group._id)) {
    const previousGroup = await QuestionGroup.findOne({
      _id: clone.questionGroup,
      assessment: assessment._id,
      partNumber: 5,
    });
    if (previousGroup) {
      previousGroup.questionIds = (previousGroup.questionIds || []).filter((id) => String(id) !== String(clone._id));
      await previousGroup.save();
    }
  }
  if (!clone.questionGroup || String(clone.questionGroup) !== String(group._id)) {
    clone.questionGroup = group._id;
  }
  if (!clone.questionNumber) clone.questionNumber = questionNumber;
  if (!clone.order) clone.order = (group.questionIds || []).length + 1;
  if (!(group.questionIds || []).some((id) => String(id) === String(clone._id))) {
    group.questionIds.push(clone._id);
  }
  appendAssessmentQuestion(assessment, clone);
  await group.save();
  await assessment.save();
  if (clone.status !== 'published') {
    clone.status = 'published';
    await clone.save();
  }
};

const validateRequest = ({ questionIds, idempotencyKey }) => {
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || idempotencyKey.length > 128) {
    return { message: 'Cần Idempotency-Key hợp lệ (tối đa 128 ký tự).' };
  }
  if (!Array.isArray(questionIds) || questionIds.length === 0 || questionIds.length > MAX_SELECTION_SIZE) {
    return { message: `questionIds phải chứa từ 1 đến ${MAX_SELECTION_SIZE} ID.` };
  }
  if (questionIds.some((id) => typeof id !== 'string')) {
    return { message: 'Mỗi questionId phải là chuỗi.' };
  }
  return null;
};

export const selectPart5Questions = async ({ assessmentId, groupId, questionIds, idempotencyKey, actorId }) => {
  const invalidRequest = validateRequest({ questionIds, idempotencyKey });
  if (invalidRequest) return { httpStatus: 400, error: invalidRequest };
  if (!isObjectId(assessmentId)) return { httpStatus: 404, error: { code: 'ASSESSMENT_NOT_FOUND', message: 'Không tìm thấy TOEIC Assessment.' } };
  if (groupId && !isObjectId(groupId)) return { httpStatus: 400, error: { code: 'INVALID_GROUP_ID', message: 'groupId không hợp lệ.' } };

  const assessmentBeforeLock = await Assessment.findById(assessmentId).select('examFormat status');
  if (!assessmentBeforeLock || assessmentBeforeLock.examFormat !== 'toeic') {
    return { httpStatus: 404, error: { code: 'ASSESSMENT_NOT_FOUND', message: 'Không tìm thấy TOEIC Assessment.' } };
  }
  if (assessmentBeforeLock.status !== 'draft') {
    return { httpStatus: 409, error: { code: 'ASSESSMENT_NOT_EDITABLE', message: 'Chỉ có thể thêm câu vào TOEIC Assessment đang ở trạng thái Draft.' } };
  }

  const lockToken = await acquireAssessmentLock(assessmentId);
  if (!lockToken) {
    const current = await Assessment.findById(assessmentId).select('examFormat status');
    if (!current || current.examFormat !== 'toeic') {
      return { httpStatus: 404, error: { code: 'ASSESSMENT_NOT_FOUND', message: 'Không tìm thấy TOEIC Assessment.' } };
    }
    if (current.status !== 'draft') {
      return { httpStatus: 409, error: { code: 'ASSESSMENT_NOT_EDITABLE', message: 'Chỉ có thể thêm câu vào TOEIC Assessment đang ở trạng thái Draft.' } };
    }
    return { httpStatus: 409, error: { code: 'QUESTION_BANK_SELECTION_BUSY', message: 'Đang có thao tác thêm câu vào Assessment này. Hãy thử lại cùng Idempotency-Key.' } };
  }

  try {
    const normalizedIds = questionIds.map((id) => id.trim());
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ groupId: groupId || null, questionIds: normalizedIds }))
      .digest('hex');
    let batch = await QuestionBankSelectionBatch.findOne({ assessment: assessmentId, idempotencyKey: idempotencyKey.trim() });
    if (batch && batch.requestHash !== requestHash) {
      return { httpStatus: 409, error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency-Key đã được dùng cho nội dung request khác.' } };
    }
    if (!batch) {
      try {
        batch = await QuestionBankSelectionBatch.create({
          assessment: assessmentId,
          idempotencyKey: idempotencyKey.trim(),
          requestHash,
          requestedQuestionIds: normalizedIds,
          createdBy: actorId,
          status: 'processing',
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        batch = await QuestionBankSelectionBatch.findOne({ assessment: assessmentId, idempotencyKey: idempotencyKey.trim() });
        if (!batch || batch.requestHash !== requestHash) {
          return { httpStatus: 409, error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency-Key đã được dùng cho nội dung request khác.' } };
        }
      }
    }

    if (batch.status === 'completed') {
      return {
        httpStatus: 200,
        data: {
          batch: batch.toObject(),
          results: batch.results || [],
          assessment: await makeAssessmentResponse(assessmentId),
        },
      };
    }

    let assessment = await Assessment.findById(assessmentId);
    if (!assessment || assessment.status !== 'draft' || assessment.examFormat !== 'toeic') {
      return { httpStatus: 409, error: { code: 'ASSESSMENT_NOT_EDITABLE', message: 'Assessment đã thay đổi trạng thái và không thể nhận câu hỏi.' } };
    }

    let group;
    if (groupId) {
      group = await QuestionGroup.findOne({ _id: groupId, assessment: assessmentId, partNumber: 5 });
      if (!group) return { httpStatus: 404, error: { code: 'PART5_GROUP_NOT_FOUND', message: 'Không tìm thấy QuestionGroup Part 5 trong Assessment này.' } };
      if (batch.groupId && String(batch.groupId) !== String(group._id)) {
        return { httpStatus: 409, error: { code: 'IDEMPOTENCY_GROUP_MISMATCH', message: 'Batch đã gắn với QuestionGroup khác.' } };
      }
    } else if (batch.groupId) {
      group = await QuestionGroup.findOne({ _id: batch.groupId, assessment: assessmentId, partNumber: 5 });
    }
    if (!group) {
      group = await QuestionGroup.findOne({ bankSelectionBatchId: batch._id, assessment: assessmentId, partNumber: 5 }).select('+bankSelectionBatchId');
    }
    const ensureGroup = async () => {
      if (!group) {
        const part5GroupCount = await QuestionGroup.countDocuments({ assessment: assessmentId, partNumber: 5 });
        group = await QuestionGroup.create({
          assessment: assessmentId,
          partNumber: 5,
          type: 'single',
          title: 'Câu hỏi từ Ngân hàng Part 5',
          order: part5GroupCount + 1,
          questionIds: [],
          bankSelectionBatchId: batch._id,
        });
      }
      if (String(batch.groupId || '') !== String(group._id)) {
        batch.groupId = group._id;
        await batch.save();
      }
      if (!(assessment.questionGroups || []).some((id) => String(id?._id || id) === String(group._id))) {
        assessment.questionGroups.push(group._id);
        await assessment.save();
      }
      return group;
    };
    if (group) await ensureGroup();

    const results = [];
    const seenRequestIds = new Set();
    let questionNumber = null;

    for (const sourceId of normalizedIds) {
      if (!sourceId || !isObjectId(sourceId)) {
        results.push({ sourceQuestionId: sourceId, status: 'INVALID', code: 'INVALID_QUESTION_ID', issues: [{ code: 'INVALID_QUESTION_ID', field: 'questionId', message: 'Question ID không hợp lệ.' }] });
        batch.results = results;
        await batch.save();
        continue;
      }
      if (seenRequestIds.has(sourceId)) {
        results.push({ sourceQuestionId: sourceId, status: 'DUPLICATE_REQUEST', code: 'DUPLICATE_REQUEST', issues: [{ code: 'DUPLICATE_REQUEST', field: 'questionId', message: 'Question ID bị lặp trong request.' }] });
        batch.results = results;
        await batch.save();
        continue;
      }
      seenRequestIds.add(sourceId);

      const source = await Question.findById(sourceId)
        .select('+bankSourceQuestionId +bankTargetAssessmentId')
        .lean();
      if (!source) {
        results.push({ sourceQuestionId: sourceId, status: 'NOT_FOUND', code: 'QUESTION_NOT_FOUND', issues: [{ code: 'QUESTION_NOT_FOUND', field: 'questionId', message: 'Không tìm thấy câu hỏi.' }] });
        batch.results = results;
        await batch.save();
        continue;
      }
      const eligibilityIssues = getPart5EligibilityIssues(source);
      if (eligibilityIssues.length) {
        results.push({ sourceQuestionId: sourceId, status: 'INVALID', code: eligibilityIssues[0].code, issues: eligibilityIssues });
        batch.results = results;
        await batch.save();
        continue;
      }

      const sourceIdIsAlreadyLinked = (assessment.questions || []).some(
        (item) => String(item.question?._id || item.question) === String(source._id)
      ) || await QuestionGroup.exists({ assessment: assessmentId, questionIds: source._id });
      if (sourceIdIsAlreadyLinked) {
        results.push({ sourceQuestionId: sourceId, questionId: source._id, status: 'ALREADY_IN_ASSESSMENT', code: 'ALREADY_IN_ASSESSMENT', issues: [] });
        batch.results = results;
        await batch.save();
        continue;
      }

      let clone = await Question.findOne({ bankTargetAssessmentId: assessmentId, bankSourceQuestionId: source._id })
        .select('+bankSourceQuestionId +bankTargetAssessmentId +bankSourceSelectionBatchId');
      if (clone) {
        const cloneId = String(clone._id);
        const inAssessment = (assessment.questions || []).some((item) => String(item.question?._id || item.question) === cloneId);
        const inCurrentGroup = (group?.questionIds || []).some((item) => String(item) === cloneId);
        if (inAssessment && inCurrentGroup && String(clone.bankSourceSelectionBatchId) !== String(batch._id)) {
          results.push({ sourceQuestionId: sourceId, questionId: clone._id, status: 'ALREADY_IN_ASSESSMENT', code: 'ALREADY_IN_ASSESSMENT', issues: [] });
          batch.results = results;
          await batch.save();
          continue;
        }
        if (String(clone.bankSourceSelectionBatchId) !== String(batch._id) && (inAssessment || inCurrentGroup)) {
          results.push({ sourceQuestionId: sourceId, questionId: clone._id, status: 'ALREADY_IN_ASSESSMENT', code: 'ALREADY_IN_ASSESSMENT', issues: [] });
          batch.results = results;
          await batch.save();
          continue;
        }
        if (!group && !groupId && String(clone.bankSourceSelectionBatchId || '') !== String(batch._id) && !inAssessment && !inCurrentGroup) {
          const recoveryGroup = clone.questionGroup
            ? await QuestionGroup.findOne({ _id: clone.questionGroup, assessment: assessmentId, partNumber: 5 })
            : null;
          if (recoveryGroup) {
            group = recoveryGroup;
            await ensureGroup();
            if (questionNumber === null) questionNumber = clone.questionNumber || await getNextPart5QuestionNumber(assessmentId);
            await attachClone({ assessment, group, clone, questionNumber });
            questionNumber = Math.max(questionNumber + 1, Number(clone.questionNumber) + 1);
            results.push({ sourceQuestionId: sourceId, questionId: clone._id, status: 'RECOVERED', code: 'RECOVERED', issues: [] });
            batch.results = results;
            await batch.save();
            continue;
          }
        }
      } else {
        await ensureGroup();
        if (questionNumber === null) questionNumber = await getNextPart5QuestionNumber(assessmentId);
        try {
          clone = await Question.create({
            questionText: source.questionText,
            type: 'single_choice',
            explanation: source.explanation,
            options: source.options.map((option) => ({ id: option.id, text: option.text })),
            correctAnswers: [...source.correctAnswers],
            score: source.score || 1,
            topic: source.topic || 'General',
            status: 'draft',
            toeicPart: 5,
            questionGroup: group._id,
            questionNumber,
            order: (group.questionIds || []).length + 1,
            createdBy: actorId,
            bankSourceQuestionId: source._id,
            bankTargetAssessmentId: assessmentId,
            bankSourceSelectionBatchId: batch._id,
          });
        } catch (error) {
          if (error?.code !== 11000) throw error;
          clone = await Question.findOne({ bankTargetAssessmentId: assessmentId, bankSourceQuestionId: source._id })
            .select('+bankSourceQuestionId +bankTargetAssessmentId +bankSourceSelectionBatchId');
          if (!clone) throw error;
        }
      }

      await ensureGroup();
      if (questionNumber === null) questionNumber = await getNextPart5QuestionNumber(assessmentId);
      await attachClone({ assessment, group, clone, questionNumber });
      questionNumber = Math.max(questionNumber + 1, Number(clone.questionNumber) + 1);
      results.push({
        sourceQuestionId: sourceId,
        questionId: clone._id,
        status: 'ADDED',
        code: 'ADDED',
        issues: [],
      });
      batch.results = results;
      await batch.save();
    }

    batch.status = 'completed';
    batch.completedAt = new Date();
    batch.results = results;
    await batch.save();
    return {
      httpStatus: 200,
      data: {
        batch: batch.toObject(),
        results,
        assessment: await makeAssessmentResponse(assessmentId),
      },
    };
  } finally {
    await releaseAssessmentLock(assessmentId, lockToken).catch(() => {});
  }
};
