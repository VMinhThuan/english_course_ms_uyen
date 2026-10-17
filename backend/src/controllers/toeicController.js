import fs from 'fs';
import path from 'path';
import Assessment from '../models/Assessment.js';
import QuestionGroup from '../models/QuestionGroup.js';
import Question from '../models/Question.js';
import Attempt from '../models/Attempt.js';
import { DEFAULT_TOEIC_PARTS, calculateEstimatedListeningScore, calculateEstimatedReadingScore } from '../utils/toeicHelper.js';
import { parseToeicPdf } from '../utils/toeicPdfParser.js';

// Helper to sanitize questions for student DTO
const sanitizeQuestionForStudent = (q) => ({
  _id: (q.questionId || q._id)?.toString(),
  questionId: (q.questionId || q._id)?.toString(),
  questionNumber: q.questionNumber,
  toeicPart: q.toeicPart,
  type: q.type || 'single_choice',
  questionText: q.questionText || q.prompt || '',
  prompt: q.questionText || q.prompt || '',
  text: q.questionText || q.prompt || '',
  options: q.options
    ? q.options.map((o) => ({
        _id: (o.id || o._id)?.toString() || o.text,
        id: (o.id || o._id)?.toString() || o.text,
        text: o.text,
      }))
    : [],
  score: q.score || 1,
});

const sanitizeQuestionSnapshotForStudent = sanitizeQuestionForStudent;

// Helper to sanitize QuestionGroup for student DTO
const sanitizeGroupForStudent = (g) => ({
  _id: (g._id ? g._id.toString() : g.groupId) || '',
  groupId: (g._id ? g._id.toString() : g.groupId) || '',
  partNumber: g.partNumber,
  type: g.type,
  title: g.title || '',
  instructions: g.instructions || '',
  imageUrl: g.imageUrl || '',
  imageUrls: g.imageUrls?.length ? g.imageUrls : (g.imageUrl ? [g.imageUrl] : []),
  imagePageNumbers: g.imagePageNumbers || [],
  audioUrl: g.audioUrl || '',
  passages: g.passages || [],
  questionIds: g.questionIds ? g.questionIds.map((id) => (typeof id === 'object' && id !== null ? (id.questionId || id._id || id).toString() : id.toString())) : [],
  order: g.order || 1,
});

// ==================================================
// ADMIN CONTROLLERS
// ==================================================

// @desc    Admin create TOEIC test (support Full 200-q template or Mini/Practice)
// @route   POST /api/v1/admin/toeic-tests
// @access  Private (Admin)
export const createToeicTest = async (req, res, next) => {
  try {
    const {
      title,
      description = '',
      toeicMode = 'full_test',
      durationMinutes = 120,
      attemptLimit = 0,
      showCorrectAnswers = true,
      scoringMode = 'raw',
      customConfig = {},
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Tên đề thi TOEIC không được để trống',
      });
    }

    const toeicConfig = {
      totalQuestions: customConfig.totalQuestions || (toeicMode === 'full_test' ? 200 : 50),
      durationMinutes: durationMinutes || (toeicMode === 'full_test' ? 120 : 45),
      listeningQuestionCount: customConfig.listeningQuestionCount || (toeicMode === 'full_test' ? 100 : 25),
      readingQuestionCount: customConfig.readingQuestionCount || (toeicMode === 'full_test' ? 100 : 25),
      listeningDurationMinutes: customConfig.listeningDurationMinutes || 45,
      readingDurationMinutes: customConfig.readingDurationMinutes || 75,
      scoringMode,
    };

    const newAssessment = await Assessment.create({
      title: title.trim(),
      description,
      type: 'exam',
      examFormat: 'toeic',
      toeicMode,
      durationMinutes: toeicConfig.durationMinutes,
      attemptLimit,
      showCorrectAnswers,
      toeicConfig,
      parts: DEFAULT_TOEIC_PARTS,
      status: 'draft',
      createdBy: req.user._id,
    });

    res.status(201).json({
      status: 'success',
      message: 'Tạo cấu trúc đề thi TOEIC thành công (Bản nháp)',
      data: {
        assessment: newAssessment,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin list all TOEIC tests
// @route   GET /api/v1/admin/toeic-tests
// @access  Private (Admin)
export const getAdminToeicTests = async (req, res, next) => {
  try {
    const { toeicMode, status, search } = req.query;

    const query = { examFormat: 'toeic' };
    if (toeicMode) query.toeicMode = toeicMode;
    if (status) query.status = status;
    if (search) {
      query.title = new RegExp(search, 'i');
    }

    const tests = await Assessment.find(query)
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 });

    const testsWithAttemptStats = await Promise.all(
      tests.map(async (t) => {
        const attemptCount = await Attempt.countDocuments({ assessment: t._id, status: 'submitted' });
        return {
          ...t.toObject(),
          attemptCount,
        };
      })
    );

    res.json({
      status: 'success',
      data: {
        tests: testsWithAttemptStats,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin get full TOEIC test details with Parts & QuestionGroups
// @route   GET /api/v1/admin/toeic-tests/:id
// @access  Private (Admin)
export const getAdminToeicTestById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const assessment = await Assessment.findById(id)
      .populate({
        path: 'questionGroups',
        populate: {
          path: 'questionIds',
          model: 'Question',
        },
      });

    if (!assessment || assessment.examFormat !== 'toeic') {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy đề thi TOEIC',
      });
    }

    res.json({
      status: 'success',
      data: {
        assessment,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin update TOEIC test settings & parts
// @route   PUT /api/v1/admin/toeic-tests/:id
// @access  Private (Admin)
export const updateToeicTest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      toeicMode,
      durationMinutes,
      attemptLimit,
      showCorrectAnswers,
      toeicConfig,
      parts,
    } = req.body;

    const assessment = await Assessment.findById(id);
    if (!assessment || assessment.examFormat !== 'toeic') {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy đề thi TOEIC',
      });
    }

    if (title !== undefined) assessment.title = title.trim();
    if (description !== undefined) assessment.description = description;
    if (toeicMode !== undefined) assessment.toeicMode = toeicMode;
    if (durationMinutes !== undefined) assessment.durationMinutes = durationMinutes;
    if (attemptLimit !== undefined) assessment.attemptLimit = attemptLimit;
    if (showCorrectAnswers !== undefined) assessment.showCorrectAnswers = showCorrectAnswers;
    if (toeicConfig !== undefined) assessment.toeicConfig = { ...assessment.toeicConfig, ...toeicConfig };
    if (parts !== undefined && Array.isArray(parts)) assessment.parts = parts;
    if (req.body.status !== undefined && ['draft', 'published', 'archived'].includes(req.body.status)) {
      assessment.status = req.body.status;
    }

    await assessment.save();

    res.json({
      status: 'success',
      message: 'Cập nhật đề thi TOEIC thành công',
      data: {
        assessment,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin add or update QuestionGroup + Questions in TOEIC test
// @route   POST /api/v1/admin/toeic-tests/:id/groups
// @access  Private (Admin)
export const upsertQuestionGroup = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      groupId,
      partNumber,
      type = 'single',
      title = '',
      instructions = '',
      imageUrl = '',
      imageUrls,
      imagePageNumbers,
      audioUrl = '',
      passages = [],
      questions = [],
      order = 1,
    } = req.body;

    const assessment = await Assessment.findById(id);
    if (!assessment || assessment.examFormat !== 'toeic') {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy đề thi TOEIC',
      });
    }

    let group;
    if (groupId) {
      group = await QuestionGroup.findById(groupId);
    }

    if (!group) {
      group = new QuestionGroup({
        assessment: id,
        partNumber,
        type,
        title,
        instructions,
        imageUrl,
        imageUrls: imageUrls || (imageUrl ? [imageUrl] : []),
        imagePageNumbers: imagePageNumbers || [],
        audioUrl,
        passages,
        order,
      });
    } else {
      group.partNumber = partNumber || group.partNumber;
      group.type = type || group.type;
      group.title = title !== undefined ? title : group.title;
      group.instructions = instructions !== undefined ? instructions : group.instructions;
      if (imageUrls !== undefined) group.imageUrls = imageUrls;
      else if (imageUrl !== undefined && imageUrl !== group.imageUrl) group.imageUrls = imageUrl ? [imageUrl] : [];
      group.imageUrl = imageUrl !== undefined ? imageUrl : group.imageUrl;
      group.imagePageNumbers = imagePageNumbers !== undefined ? imagePageNumbers : group.imagePageNumbers;
      group.audioUrl = audioUrl !== undefined ? audioUrl : group.audioUrl;
      group.passages = passages || group.passages;
      group.order = order || group.order;
    }

    // Process & save individual questions belonging to this group
    const questionIds = [];
    const assessmentQuestions = [...(assessment.questions || [])];

    for (const qData of questions) {
      let qDoc;
      if (qData._id) {
        qDoc = await Question.findById(qData._id);
      }

      const qOptions = (qData.options || []).map((opt, idx) => ({
        id: opt.id || `opt_${idx + 1}`,
        text: opt.text || '',
      }));

      const qCorrect = Array.isArray(qData.correctAnswers)
        ? qData.correctAnswers
        : qData.correctAnswer
        ? [qData.correctAnswer]
        : [];

      if (!qDoc) {
        qDoc = await Question.create({
          questionText: qData.questionText || qData.prompt || `Question ${qData.questionNumber || 1}`,
          type: qData.type || 'single_choice',
          options: qOptions,
          correctAnswers: qCorrect,
          explanation: qData.explanation || '',
          score: qData.score || 1,
          toeicPart: partNumber,
          questionGroup: group._id,
          questionNumber: qData.questionNumber,
          order: qData.order || 1,
          status: 'published',
          createdBy: req.user._id,
        });
      } else {
        qDoc.questionText = qData.questionText || qData.prompt || qDoc.questionText;
        qDoc.type = qData.type || qDoc.type;
        qDoc.options = qOptions;
        qDoc.correctAnswers = qCorrect;
        qDoc.explanation = qData.explanation !== undefined ? qData.explanation : qDoc.explanation;
        qDoc.score = qData.score || qDoc.score;
        qDoc.toeicPart = partNumber;
        qDoc.questionGroup = group._id;
        qDoc.questionNumber = qData.questionNumber || qDoc.questionNumber;
        qDoc.order = qData.order || qDoc.order;
        await qDoc.save();
      }

      questionIds.push(qDoc._id);

      // Link to assessment.questions list if not present
      const existsIndex = assessmentQuestions.findIndex((item) => item.question.toString() === qDoc._id.toString());
      if (existsIndex >= 0) {
        assessmentQuestions[existsIndex].score = qDoc.score;
      } else {
        assessmentQuestions.push({ question: qDoc._id, score: qDoc.score });
      }
    }

    group.questionIds = questionIds;
    await group.save();

    if (!assessment.questionGroups.includes(group._id)) {
      assessment.questionGroups.push(group._id);
    }
    assessment.questions = assessmentQuestions;
    await assessment.save();

    res.json({
      status: 'success',
      message: 'Cập nhật nhóm câu hỏi thành công',
      data: {
        group,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin duplicate TOEIC test (Create deep copy with new IDs)
// @route   POST /api/v1/admin/toeic-tests/:id/duplicate
// @access  Private (Admin)
export const duplicateToeicTest = async (req, res, next) => {
  try {
    const { id } = req.params;

    const source = await Assessment.findById(id).populate({
      path: 'questionGroups',
      populate: { path: 'questionIds', model: 'Question' },
    });

    if (!source || source.examFormat !== 'toeic') {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy đề thi TOEIC cần nhân bản',
      });
    }

    const newTest = await Assessment.create({
      title: `${source.title} (Bản sao)`,
      description: source.description,
      type: source.type,
      examFormat: 'toeic',
      toeicMode: source.toeicMode,
      durationMinutes: source.durationMinutes,
      attemptLimit: source.attemptLimit,
      showCorrectAnswers: source.showCorrectAnswers,
      toeicConfig: source.toeicConfig,
      parts: source.parts,
      status: 'draft',
      createdBy: req.user._id,
    });

    const newGroups = [];
    const newAssessmentQuestions = [];

    for (const group of source.questionGroups || []) {
      const newQuestionIds = [];

      for (const q of group.questionIds || []) {
        const qCopy = await Question.create({
          questionText: q.questionText,
          type: q.type,
          options: q.options,
          correctAnswers: q.correctAnswers,
          explanation: q.explanation,
          score: q.score,
          toeicPart: q.toeicPart,
          questionNumber: q.questionNumber,
          order: q.order,
          status: 'published',
          createdBy: req.user._id,
        });

        newQuestionIds.push(qCopy._id);
        newAssessmentQuestions.push({ question: qCopy._id, score: qCopy.score });
      }

      const groupCopy = await QuestionGroup.create({
        assessment: newTest._id,
        partNumber: group.partNumber,
        type: group.type,
        title: group.title,
        instructions: group.instructions,
        imageUrl: group.imageUrl,
        imageUrls: group.imageUrls,
        imagePageNumbers: group.imagePageNumbers,
        audioUrl: group.audioUrl,
        passages: group.passages,
        questionIds: newQuestionIds,
        order: group.order,
      });

      // Update copied questions with new group ref
      await Question.updateMany({ _id: { $in: newQuestionIds } }, { questionGroup: groupCopy._id });
      newGroups.push(groupCopy._id);
    }

    newTest.questionGroups = newGroups;
    newTest.questions = newAssessmentQuestions;
    await newTest.save();

    res.status(201).json({
      status: 'success',
      message: 'Nhân bản đề thi TOEIC thành công',
      data: {
        assessment: newTest,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin validate & publish TOEIC test
// @route   POST /api/v1/admin/toeic-tests/:id/publish
// @access  Private (Admin)
export const publishToeicTest = async (req, res, next) => {
  try {
    const { id } = req.params;

    const assessment = await Assessment.findById(id).populate({
      path: 'questionGroups',
      populate: { path: 'questionIds', model: 'Question' },
    });

    if (!assessment || assessment.examFormat !== 'toeic') {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy đề thi TOEIC',
      });
    }

    const errors = [];
    const totalQCount = (assessment.questions || []).length;

    if (totalQCount === 0) {
      errors.push('Đề thi chưa có câu hỏi nào.');
    }

    if (assessment.toeicMode === 'full_test' && totalQCount < 200) {
      // Allow warning/notice or strict check if configured
    }

    if (errors.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: `Không thể xuất bản đề thi do cấu trúc chưa hoàn thiện: ${errors.join(' ')}`,
        errors,
      });
    }

    assessment.status = 'published';
    await assessment.save();

    res.json({
      status: 'success',
      message: 'Đã xuất bản đề thi TOEIC thành công (PUBLISHED)',
      data: {
        assessment,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin unpublish TOEIC test (revert to DRAFT)
// @route   POST /api/v1/admin/toeic-tests/:id/unpublish
// @access  Private (Admin/Teacher)
export const unpublishToeicTest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const assessment = await Assessment.findById(id);
    if (!assessment || assessment.examFormat !== 'toeic') {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy đề thi TOEIC',
      });
    }
    assessment.status = 'draft';
    await assessment.save();
    res.json({
      status: 'success',
      message: 'Đã chuyển đề thi về trạng thái Bản nháp (DRAFT)',
      data: { assessment },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin delete a QuestionGroup from TOEIC test
// @route   DELETE /api/v1/admin/toeic-tests/:id/groups/:groupId
// @access  Private (Admin/Teacher)
export const deleteQuestionGroupFromTest = async (req, res, next) => {
  try {
    const { id, groupId } = req.params;
    const assessment = await Assessment.findById(id);
    if (!assessment || assessment.examFormat !== 'toeic') {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy đề thi TOEIC',
      });
    }

    const group = await QuestionGroup.findById(groupId);
    if (!group || group.assessment.toString() !== id.toString()) {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy nhóm câu hỏi trong đề thi',
      });
    }

    const qIds = (group.questionIds || []).map((qId) => qId.toString());
    if (qIds.length > 0) {
      await Question.deleteMany({ _id: { $in: group.questionIds } });
    }

    await QuestionGroup.findByIdAndDelete(groupId);

    // Remove group and its questions from assessment
    assessment.questionGroups = (assessment.questionGroups || []).filter(
      (gId) => gId.toString() !== groupId.toString()
    );
    assessment.questions = (assessment.questions || []).filter(
      (item) => !qIds.includes((item.question?._id || item.question).toString())
    );
    await assessment.save();

    res.json({
      status: 'success',
      message: 'Đã xóa nhóm câu hỏi thành công',
      data: {
        assessmentId: id,
        deletedGroupId: groupId,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin delete a Question from TOEIC test
// @route   DELETE /api/v1/admin/toeic-tests/:id/questions/:questionId
// @access  Private (Admin/Teacher)
export const deleteQuestionFromTest = async (req, res, next) => {
  try {
    const { id, questionId } = req.params;
    const assessment = await Assessment.findById(id);
    if (!assessment || assessment.examFormat !== 'toeic') {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy đề thi TOEIC',
      });
    }

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy câu hỏi',
      });
    }

    if (question.questionGroup) {
      const group = await QuestionGroup.findById(question.questionGroup);
      if (group) {
        group.questionIds = (group.questionIds || []).filter(
          (qId) => qId.toString() !== questionId.toString()
        );
        await group.save();
      }
    }

    await Question.findByIdAndDelete(questionId);

    assessment.questions = (assessment.questions || []).filter(
      (item) => (item.question?._id || item.question).toString() !== questionId.toString()
    );
    await assessment.save();

    res.json({
      status: 'success',
      message: 'Đã xóa câu hỏi thành công',
      data: {
        assessmentId: id,
        deletedQuestionId: questionId,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin delete TOEIC test (protected if submitted attempts exist)
// @route   DELETE /api/v1/admin/toeic-tests/:id
// @access  Private (Admin)
export const deleteToeicTest = async (req, res, next) => {
  try {
    const { id } = req.params;

    const assessment = await Assessment.findById(id);
    if (!assessment || assessment.examFormat !== 'toeic') {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy đề thi TOEIC',
      });
    }

    const attemptCount = await Attempt.countDocuments({ assessment: id });
    if (attemptCount > 0) {
      return res.status(409).json({
        status: 'error',
        code: 'TEST_HAS_ATTEMPTS',
        message: 'Đề thi đã có lượt nộp bài của học viên, không thể xóa. Vui lòng đổi trạng thái thành "Ẩn" (hidden).',
      });
    }

    // Delete associated QuestionGroups and Questions
    await QuestionGroup.deleteMany({ assessment: id });
    const qIds = (assessment.questions || []).map((item) => item.question);
    if (qIds.length > 0) {
      await Question.deleteMany({ _id: { $in: qIds } });
    }

    await Assessment.findByIdAndDelete(id);

    res.json({
      status: 'success',
      message: 'Xóa đề thi TOEIC thành công',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin CSV Bulk Import questions for TOEIC Test
// @route   POST /api/v1/admin/toeic-tests/:id/import-csv
// @access  Private (Admin)
export const importToeicCsv = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { csvContent, previewOnly = false } = req.body;

    if (!csvContent || typeof csvContent !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Nội dung file CSV không được để trống',
      });
    }

    const assessment = await Assessment.findById(id);
    if (!assessment || assessment.examFormat !== 'toeic') {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy đề thi TOEIC',
      });
    }

    const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length <= 1) {
      return res.status(400).json({
        status: 'error',
        message: 'File CSV phải chứa hàng tiêu đề và ít nhất 1 dòng dữ liệu',
      });
    }

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const parseRow = (line) => {
      // Basic CSV parser handling quoted strings
      const result = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          inQuotes = !inQuotes;
        } else if (c === ',' && !inQuotes) {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += c;
        }
      }
      result.push(cur.trim());
      return result;
    };

    const parsedQuestions = [];
    const validationErrors = [];

    for (let i = 1; i < lines.length; i++) {
      const row = parseRow(lines[i]);
      if (row.length === 0 || (row.length === 1 && !row[0])) continue;

      const getVal = (colName) => {
        const idx = header.indexOf(colName);
        return idx >= 0 && idx < row.length ? row[idx] : '';
      };

      const qNum = parseInt(getVal('question_number') || getVal('qnum') || String(i), 10);
      const part = parseInt(getVal('part') || '1', 10);
      const qText = getVal('question_text') || getVal('prompt') || `Question ${qNum}`;
      const optA = getVal('option_a') || 'Option A';
      const optB = getVal('option_b') || 'Option B';
      const optC = getVal('option_c') || 'Option C';
      const optD = getVal('option_d') || 'Option D';
      const correctRaw = getVal('correct_answer') || getVal('correct');
      const explanation = getVal('explanation') || '';
      const audioUrl = getVal('audio_url') || getVal('audio_filename') || '';
      const imageUrl = getVal('image_url') || getVal('image_filename') || '';
      const passageText = getVal('passage_1') || getVal('passage') || '';

      // Validate required correct answer
      let correctOptId = 'opt_1';
      if (!correctRaw || !correctRaw.trim()) {
        validationErrors.push(`Dòng ${i + 1}: Thiếu đáp án đúng (correct_answer)`);
      } else {
        const normCorrect = correctRaw.trim().toUpperCase();
        if (normCorrect === 'A' || normCorrect === '1' || normCorrect === optA.toUpperCase()) correctOptId = 'opt_1';
        else if (normCorrect === 'B' || normCorrect === '2' || normCorrect === optB.toUpperCase()) correctOptId = 'opt_2';
        else if (normCorrect === 'C' || normCorrect === '3' || normCorrect === optC.toUpperCase()) correctOptId = 'opt_3';
        else if (normCorrect === 'D' || normCorrect === '4' || normCorrect === optD.toUpperCase()) correctOptId = 'opt_4';
        else {
          validationErrors.push(`Dòng ${i + 1}: Đáp án đúng không hợp lệ ("${correctRaw}"). Phải là A, B, C, hoặc D.`);
        }
      }

      parsedQuestions.push({
        questionNumber: qNum,
        toeicPart: part,
        questionText: qText,
        options: [
          { id: 'opt_1', text: optA },
          { id: 'opt_2', text: optB },
          { id: 'opt_3', text: optC },
          { id: 'opt_4', text: optD },
        ],
        correctAnswers: [correctOptId],
        explanation,
        audioUrl,
        imageUrl,
        passageText,
      });
    }

    if (previewOnly) {
      return res.json({
        status: 'success',
        message: `Phân tích file CSV thành công (${parsedQuestions.length} câu hỏi hợp lệ)`,
        data: {
          totalParsed: parsedQuestions.length,
          validRows: parsedQuestions.length - validationErrors.length,
          invalidRows: validationErrors.length,
          errors: validationErrors,
          preview: parsedQuestions.slice(0, 10),
        },
      });
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: `Phát hiện ${validationErrors.length} lỗi dữ liệu khi đọc CSV`,
        errors: validationErrors,
      });
    }

    // Atomic Save: create QuestionGroups & Questions
    const createdQuestionIds = [];
    const assessmentQuestions = [...(assessment.questions || [])];

    // Group by Part Number & Audio/Passage Stimulus
    for (const item of parsedQuestions) {
      let groupType = 'single';
      if (item.audioUrl && item.imageUrl) groupType = 'audio_image';
      else if (item.audioUrl) groupType = 'audio';
      else if (item.imageUrl) groupType = 'image';
      else if (item.passageText) groupType = 'passage';

      const group = await QuestionGroup.create({
        assessment: id,
        partNumber: item.toeicPart,
        type: groupType,
        title: `Group Q${item.questionNumber}`,
        imageUrl: item.imageUrl,
        audioUrl: item.audioUrl,
        passages: item.passageText ? [{ title: 'Passage', content: item.passageText, order: 1 }] : [],
        order: item.questionNumber,
      });

      const qDoc = await Question.create({
        questionText: item.questionText,
        type: 'single_choice',
        options: item.options,
        correctAnswers: item.correctAnswers,
        explanation: item.explanation,
        score: 1,
        toeicPart: item.toeicPart,
        questionGroup: group._id,
        questionNumber: item.questionNumber,
        order: item.questionNumber,
        status: 'published',
        createdBy: req.user._id,
      });

      group.questionIds = [qDoc._id];
      await group.save();

      assessment.questionGroups.push(group._id);
      assessmentQuestions.push({ question: qDoc._id, score: 1 });
      createdQuestionIds.push(qDoc._id);
    }

    assessment.questions = assessmentQuestions;
    await assessment.save();

    res.json({
      status: 'success',
      message: `Đã import thành công ${parsedQuestions.length} câu hỏi vào đề thi TOEIC`,
      data: {
        totalImported: parsedQuestions.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin / Teacher PDF Import for TOEIC Test (creates a DRAFT test)
// @route   POST /api/v1/admin/toeic-tests/import-pdf OR /api/v1/admin/toeic-tests/:id/import-pdf
// @access  Private (Admin/Teacher)
export const importToeicPdf = async (req, res, next) => {
  let createdAssessment = null;
  let createdGroups = [];
  let createdQuestions = [];
  let extractedImagePaths = [];
  let uploadedPageImagePaths = [];
  let persistedPageImagePaths = new Set();
  let keepExtractedImages = false;

  try {
    const pdfFile = req.files?.file?.[0] || req.file;
    const pageImageFiles = req.files?.pageImages || [];
    uploadedPageImagePaths = pageImageFiles.map((file) => file.path).filter(Boolean);

    if (!pdfFile && !req.body.pdfBuffer) {
      return res.status(400).json({
        status: 'error',
        message: 'Vui lòng đính kèm file PDF đề thi TOEIC (dung lượng dưới 30MB)',
      });
    }

    let pdfBuffer;
    let originalFilename = 'toeic_import.pdf';

    if (pdfFile) {
      pdfBuffer = fs.readFileSync(pdfFile.path);
      originalFilename = pdfFile.originalname;
    } else if (req.body.pdfBuffer) {
      pdfBuffer = Buffer.from(req.body.pdfBuffer, 'base64');
    }

    const targetAssessmentId = req.params ? req.params.id : null;
    const { title, toeicMode = 'full_test', durationMinutes = 120 } = req.body;
    const previewOnly = req.body.previewOnly === true || req.body.previewOnly === 'true';
    const ocrText = typeof req.body.ocrText === 'string' ? req.body.ocrText : '';
    const ocrPageCount = parseInt(req.body.ocrPageCount, 10) || 0;
    const imagePageNumbers = String(req.body.imagePageNumbers || '')
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
    const pageImageUrlsByNumber = {};
    for (const file of pageImageFiles) {
      const pageNumber = Number(file.originalname.match(/^page-(\d+)\.jpg$/i)?.[1]);
      if (!Number.isInteger(pageNumber) || pageNumber <= 0 || !file.path) continue;

      pageImageUrlsByNumber[pageNumber] = {
        url: `/uploads/${path.basename(file.path)}`,
        path: file.path,
      };
    }

    // 1. Parse PDF using TOEIC PDF Parser Engine
    const { parsedGroups, parsedQuestions, report } = await parseToeicPdf(pdfBuffer, {
      filename: originalFilename,
      extractedText: ocrText,
      extractionMethod: ocrPageCount > 0 ? 'browser_hybrid_ocr' : undefined,
      ocrPageCount,
      toeicMode,
      imagePageNumbers: imagePageNumbers.length > 0 ? imagePageNumbers : Object.keys(pageImageUrlsByNumber),
      pageImageUrlsByNumber: Object.fromEntries(
        Object.entries(pageImageUrlsByNumber)
          .filter(([, image]) => typeof image?.url === 'string' && image.url.length > 0)
          .map(([pageNumber, image]) => [pageNumber, image.url]),
      ),
    });
    const usedImagePageNumbers = new Set(parsedGroups.flatMap((group) => group.imagePageNumbers || []));
    persistedPageImagePaths = new Set(
      Object.entries(pageImageUrlsByNumber)
        .filter(([pageNumber, image]) => usedImagePageNumbers.has(Number(pageNumber)) && Boolean(image?.path))
        .map(([, image]) => image.path),
    );
    extractedImagePaths = [...persistedPageImagePaths];

    parsedGroups.forEach((group) => {
      group.imageUrls = (group.imagePageNumbers || [])
        .map((pageNumber) => pageImageUrlsByNumber[pageNumber]?.url)
        .filter(Boolean);
      group.imageUrl = group.imageUrls[0] || '';
    });

    if (parsedQuestions.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: ['scanned_pdf', 'ocr_no_text'].includes(report.extraction?.status)
          ? 'Không nhận diện được nội dung câu hỏi trong PDF scan. Hãy dùng bản rõ nét hơn hoặc chia nhỏ tài liệu rồi thử lại.'
          : 'Không tìm thấy câu hỏi TOEIC nào hợp lệ trong file PDF. Hãy kiểm tra cấu trúc đề hoặc thử file có lớp văn bản.',
        report,
      });
    }

    const cleanTitle = title?.trim() || `Đề thi TOEIC Import từ PDF - ${path.parse(originalFilename).name}`;

    if (previewOnly) {
      return res.json({
        status: 'success',
        message: `Đã phân tích PDF: nhận diện được ${parsedQuestions.length} câu hỏi.`,
        data: {
          previewOnly: true,
          title: cleanTitle,
          detected: report.detected,
          extraction: report.extraction,
          warnings: report.warnings,
          missing: report.missing,
          needsReview: true,
          preview: {
            groups: parsedGroups.map((group) => ({
              partNumber: group.partNumber,
              title: group.title,
              questionCount: (group.questions || []).length,
              imagePageNumbers: group.imagePageNumbers || [],
            })),
            questions: parsedQuestions.slice(0, 10).map((question) => ({
              questionNumber: question.questionNumber,
              toeicPart: question.toeicPart,
              questionText: question.questionText,
              sourcePageNumbers: question.sourcePageNumbers || [],
              options: question.options,
              correctAnswers: question.correctAnswers,
            })),
            totalQuestions: parsedQuestions.length,
          },
        },
      });
    }

    // 2. Find or Create DRAFT Assessment
    let assessment;
    if (targetAssessmentId) {
      assessment = await Assessment.findById(targetAssessmentId);
      if (!assessment || assessment.examFormat !== 'toeic') {
        return res.status(404).json({
          status: 'error',
          message: 'Không tìm thấy đề thi TOEIC cần import',
        });
      }
    } else {
      assessment = new Assessment({
        title: cleanTitle.trim(),
        description: `Import tự động từ file PDF: ${originalFilename}`,
        type: 'exam',
        examFormat: 'toeic',
        toeicMode: toeicMode,
        durationMinutes: parseInt(durationMinutes, 10) || 120,
        parts: DEFAULT_TOEIC_PARTS,
        status: 'draft', // MUST REMAIN DRAFT
        createdBy: req.user._id,
      });
      await assessment.save();
      createdAssessment = assessment;
    }

    // 3. Save Question Groups & Questions to DB
    const assessmentQuestions = [...(assessment.questions || [])];

    for (const groupData of parsedGroups) {
      const groupDoc = new QuestionGroup({
        assessment: assessment._id,
        partNumber: groupData.partNumber || 1,
        type: groupData.type || 'single',
        title: groupData.title || `Group Part ${groupData.partNumber}`,
        instructions: groupData.instructions || '',
        imageUrl: groupData.imageUrl || '',
        imageUrls: groupData.imageUrls || (groupData.imageUrl ? [groupData.imageUrl] : []),
        imagePageNumbers: groupData.imagePageNumbers || [],
        audioUrl: groupData.audioUrl || '',
        passages: groupData.passages || [],
        order: groupData.order || 1,
      });

      const qIds = [];

      for (const qData of groupData.questions || []) {
        const qDoc = await Question.create({
          questionText: qData.questionText,
          type: qData.type || 'single_choice',
          options: qData.options || [],
          correctAnswers: qData.correctAnswers || [],
          explanation: qData.explanation || '',
          score: qData.score || 1,
          toeicPart: qData.toeicPart || groupData.partNumber || 1,
          questionGroup: groupDoc._id,
          questionNumber: qData.questionNumber,
          order: qData.order || qData.questionNumber || 1,
          status: 'published',
          createdBy: req.user._id,
        });

        qIds.push(qDoc._id);
        createdQuestions.push(qDoc._id);
        assessmentQuestions.push({ question: qDoc._id, score: qDoc.score || 1 });
      }

      groupDoc.questionIds = qIds;
      await groupDoc.save();
      createdGroups.push(groupDoc._id);

      if (!assessment.questionGroups.includes(groupDoc._id)) {
        assessment.questionGroups.push(groupDoc._id);
      }
    }

    assessment.questions = assessmentQuestions;
    assessment.status = 'draft'; // Re-enforce draft status
    await assessment.save();
    keepExtractedImages = true;

    res.json({
      status: 'success',
      message: `Import PDF đề thi TOEIC thành công! Đã tạo bài thi bản nháp (${assessment.questions.length} câu hỏi). Vui lòng kiểm tra và duyệt trước khi xuất bản.`,
      data: {
        testId: assessment._id,
        title: assessment.title,
        status: assessment.status, // Always 'draft'
        detected: report.detected,
        extraction: report.extraction,
        warnings: report.warnings,
        missing: report.missing,
        needsReview: true,
      },
    });
  } catch (error) {
    // Rollback cleanup on error
    if (createdQuestions.length > 0) {
      await Question.deleteMany({ _id: { $in: createdQuestions } }).catch(() => {});
    }
    if (createdGroups.length > 0) {
      await QuestionGroup.deleteMany({ _id: { $in: createdGroups } }).catch(() => {});
    }
    if (createdAssessment) {
      await Assessment.findByIdAndDelete(createdAssessment._id).catch(() => {});
    }
    next(error);
  } finally {
    const removeFile = (filePath) => {
      if (!filePath || !fs.existsSync(filePath)) return;
      try { fs.unlinkSync(filePath); } catch (e) {}
    };

    removeFile(req.files?.file?.[0]?.path || req.file?.path);
    if (!keepExtractedImages) uploadedPageImagePaths.forEach(removeFile);
    else uploadedPageImagePaths.filter((filePath) => !persistedPageImagePaths.has(filePath)).forEach(removeFile);
    if (!keepExtractedImages) extractedImagePaths.forEach(removeFile);
  }
};

// ==================================================
// STUDENT SIMULATOR CONTROLLERS
// ==================================================

// @desc    Student list available TOEIC tests
// @route   GET /api/v1/toeic/tests
// @access  Private (Active Student)
export const getStudentToeicTests = async (req, res, next) => {
  try {
    const { mode } = req.query;

    const query = {
      examFormat: 'toeic',
      status: 'published',
    };
    if (mode) query.toeicMode = mode;

    const tests = await Assessment.find(query).sort({ createdAt: -1 });
    const studentId = req.user._id;

    const testsWithStudentStatus = await Promise.all(
      tests.map(async (t) => {
        const activeAttempt = await Attempt.findOne({ student: studentId, assessment: t._id, status: 'in_progress' });
        const lastSubmittedAttempt = await Attempt.findOne({ student: studentId, assessment: t._id, status: { $in: ['submitted', 'completed'] } }).sort({ submittedAt: -1 });

        return {
          _id: t._id,
          title: t.title,
          description: t.description,
          toeicMode: t.toeicMode,
          durationMinutes: t.durationMinutes,
          questionCount: t.questions ? t.questions.length : 0,
          attemptLimit: t.attemptLimit,
          hasActiveAttempt: !!activeAttempt,
          activeAttemptId: activeAttempt ? activeAttempt._id : null,
          lastAttempt: lastSubmittedAttempt
            ? {
                score: lastSubmittedAttempt.score,
                maxScore: lastSubmittedAttempt.maxScore,
                percentage: Math.round((lastSubmittedAttempt.score / (lastSubmittedAttempt.maxScore || 1)) * 100),
                submittedAt: lastSubmittedAttempt.submittedAt,
              }
            : null,
        };
      })
    );

    res.json({
      status: 'success',
      data: {
        tests: testsWithStudentStatus,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Student get TOEIC test overview before starting
// @route   GET /api/v1/toeic/tests/:id
// @access  Private (Active Student)
export const getStudentToeicTestOverview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const studentId = req.user._id;

    const assessment = await Assessment.findById(id);
    if (!assessment || assessment.status !== 'published' || assessment.examFormat !== 'toeic') {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy đề thi TOEIC',
      });
    }

    const activeAttempt = await Attempt.findOne({ student: studentId, assessment: id, status: 'in_progress' });
    const submittedCount = await Attempt.countDocuments({ student: studentId, assessment: id, status: { $in: ['submitted', 'completed'] } });

    res.json({
      status: 'success',
      data: {
        assessment: {
          _id: assessment._id,
          title: assessment.title,
          description: assessment.description,
          toeicMode: assessment.toeicMode,
          durationMinutes: assessment.durationMinutes,
          totalQuestions: assessment.questions ? assessment.questions.length : 0,
          parts: assessment.parts || DEFAULT_TOEIC_PARTS,
          attemptLimit: assessment.attemptLimit,
          submittedCount,
          hasActiveAttempt: !!activeAttempt,
          activeAttemptId: activeAttempt ? activeAttempt._id : null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Student start or resume TOEIC test attempt
// @route   POST /api/v1/toeic/tests/:id/start
// @access  Private (Active Student)
export const startToeicAttempt = async (req, res, next) => {
  try {
    const { id } = req.params;
    const studentId = req.user._id;

    const assessment = await Assessment.findById(id).populate({
      path: 'questionGroups',
      populate: { path: 'questionIds', model: 'Question' },
    });

    if (!assessment || assessment.status !== 'published' || assessment.examFormat !== 'toeic') {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy đề thi TOEIC',
      });
    }

    const now = new Date();

    // Check existing active in_progress Attempt for Resumable Flow
    let activeAttempt = await Attempt.findOne({
      student: studentId,
      assessment: id,
      status: 'in_progress',
    });

    if (activeAttempt) {
      if (now <= activeAttempt.deadlineAt) {
        const sanitizedQuestions = activeAttempt.questionSnapshots.map(sanitizeQuestionSnapshotForStudent);
        const sanitizedGroups = (activeAttempt.groupSnapshots || []).map(sanitizeGroupForStudent);

        return res.json({
          status: 'success',
          message: 'Resumed existing active TOEIC attempt',
          data: {
            attemptId: activeAttempt._id,
            startedAt: activeAttempt.startedAt,
            deadlineAt: activeAttempt.deadlineAt,
            durationMinutes: assessment.durationMinutes,
            answers: activeAttempt.answers || {},
            flaggedQuestionIds: activeAttempt.flaggedQuestionIds || [],
            revision: activeAttempt.revision || 1,
            questions: sanitizedQuestions,
            groups: sanitizedGroups,
            parts: assessment.parts || DEFAULT_TOEIC_PARTS,
          },
        });
      } else {
        // Expired active attempt
        activeAttempt.status = 'submitted';
        activeAttempt.isExpired = true;
        activeAttempt.submittedAt = activeAttempt.deadlineAt;
        activeAttempt.duration = Math.round((activeAttempt.deadlineAt - activeAttempt.startedAt) / 1000);
        await activeAttempt.save();
      }
    }

    // Check Attempt Limit
    const submittedCount = await Attempt.countDocuments({ student: studentId, assessment: id, status: { $in: ['submitted', 'completed'] } });
    if (assessment.attemptLimit > 0 && submittedCount >= assessment.attemptLimit) {
      return res.status(403).json({
        status: 'error',
        code: 'ATTEMPT_LIMIT_REACHED',
        message: `Bạn đã vượt quá số lần làm bài tối đa (${assessment.attemptLimit}) cho đề thi này.`,
      });
    }

    // Build immutable question & group snapshots
    const questionSnapshots = [];
    const groupSnapshots = [];

    for (const group of assessment.questionGroups || []) {
      const gQuestionIds = [];

      for (const q of group.questionIds || []) {
        questionSnapshots.push({
          questionId: q._id.toString(),
          type: q.type || 'single_choice',
          questionText: q.questionText || q.prompt || '',
          options: q.options || [],
          correctAnswers: q.correctAnswers || [],
          score: q.score || 1,
          explanation: q.explanation || '',
          toeicPart: group.partNumber,
          questionGroupId: group._id.toString(),
          questionNumber: q.questionNumber,
          order: q.order || 1,
        });
        gQuestionIds.push(q._id.toString());
      }

      groupSnapshots.push({
        groupId: group._id.toString(),
        partNumber: group.partNumber,
        type: group.type,
        title: group.title,
        instructions: group.instructions,
        imageUrl: group.imageUrl,
        imageUrls: group.imageUrls,
        imagePageNumbers: group.imagePageNumbers,
        audioUrl: group.audioUrl,
        passages: group.passages,
        questionIds: gQuestionIds,
        order: group.order,
      });
    }

    // If assessment questions weren't grouped, snapshot standalone questions
    if (questionSnapshots.length === 0) {
      for (const item of assessment.questions || []) {
        const qDoc = await Question.findById(item.question);
        if (!qDoc) continue;

        questionSnapshots.push({
          questionId: qDoc._id.toString(),
          type: qDoc.type || 'single_choice',
          questionText: qDoc.questionText || qDoc.prompt || '',
          options: qDoc.options || [],
          correctAnswers: qDoc.correctAnswers || [],
          score: item.score || qDoc.score || 1,
          explanation: qDoc.explanation || '',
          toeicPart: qDoc.toeicPart || 1,
          questionNumber: qDoc.questionNumber,
          order: qDoc.order || 1,
        });
      }
    }

    if (questionSnapshots.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Đề thi TOEIC chưa có câu hỏi nào.',
      });
    }

    const startedAt = new Date();
    const deadlineAt = new Date(startedAt.getTime() + assessment.durationMinutes * 60 * 1000);

    const newAttempt = await Attempt.create({
      student: studentId,
      assessment: id,
      assessmentType: 'exam',
      startedAt,
      deadlineAt,
      status: 'in_progress',
      questionSnapshots,
      groupSnapshots,
      answers: {},
      flaggedQuestionIds: [],
      revision: 1,
    });

    const sanitizedQuestions = questionSnapshots.map(sanitizeQuestionSnapshotForStudent);
    const sanitizedGroups = groupSnapshots.map(sanitizeGroupForStudent);

    res.status(201).json({
      status: 'success',
      message: 'Bắt đầu bài thi TOEIC thành công',
      data: {
        attemptId: newAttempt._id,
        startedAt: newAttempt.startedAt,
        deadlineAt: newAttempt.deadlineAt,
        durationMinutes: assessment.durationMinutes,
        answers: {},
        flaggedQuestionIds: [],
        revision: 1,
        questions: sanitizedQuestions,
        groups: sanitizedGroups,
        parts: assessment.parts || DEFAULT_TOEIC_PARTS,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Student autosave answers & flags with concurrency revision check
// @route   PATCH /api/v1/attempts/:attemptId/answers
// @access  Private (Active Student)
export const autosaveAttemptAnswers = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const { answers, flaggedQuestionIds, revision } = req.body;
    const studentId = req.user._id;

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy bài thi',
      });
    }

    if (attempt.student.toString() !== studentId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Bạn không có quyền cập nhật bài thi này',
      });
    }

    if (attempt.status !== 'in_progress') {
      return res.status(400).json({
        status: 'error',
        message: 'Bài thi đã kết thúc hoặc nộp bài.',
      });
    }

    // Check deadline
    const now = new Date();
    if (now.getTime() > attempt.deadlineAt.getTime() + 10000) {
      attempt.status = 'submitted';
      attempt.isExpired = true;
      attempt.submittedAt = attempt.deadlineAt;
      await attempt.save();

      return res.status(403).json({
        status: 'error',
        code: 'EXPIRED',
        message: 'Đã hết thời gian làm bài.',
      });
    }

    // Concurrency revision check
    if (revision !== undefined && revision < attempt.revision) {
      return res.status(409).json({
        status: 'error',
        code: 'STALE_REVISION',
        message: 'Dữ liệu lưu không phải phiên bản mới nhất.',
        serverRevision: attempt.revision,
      });
    }

    if (answers !== undefined) {
      let answersMap = {};
      if (Array.isArray(answers)) {
        answers.forEach((item) => {
          if (item.questionId) {
            answersMap[item.questionId.toString()] = item.selectedOptionIds || item.answer || [];
          }
        });
      } else if (typeof answers === 'object') {
        answersMap = answers;
      }
      attempt.answers = { ...(attempt.answers || {}), ...answersMap };
    }

    if (flaggedQuestionIds !== undefined && Array.isArray(flaggedQuestionIds)) {
      attempt.flaggedQuestionIds = flaggedQuestionIds;
    }

    attempt.revision = (attempt.revision || 1) + 1;
    await attempt.save();

    res.json({
      status: 'success',
      message: 'Đã lưu đáp án thành công',
      data: {
        saved: true,
        revision: attempt.revision,
        flaggedQuestionIds: attempt.flaggedQuestionIds,
        savedAt: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Student submit TOEIC attempt with Part 1-7 & Listening/Reading breakdown grading
// @route   POST /api/v1/toeic/attempts/:attemptId/submit
// @access  Private (Active Student)
export const submitToeicAttempt = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const studentId = req.user._id;

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy lượt làm bài',
      });
    }

    if (attempt.student.toString() !== studentId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Không có quyền nộp bài thi này',
      });
    }

    if (attempt.status === 'submitted' || attempt.status === 'completed') {
      const percentage = attempt.maxScore > 0 ? Math.round((attempt.score / attempt.maxScore) * 100) : 0;
      return res.json({
        status: 'success',
        message: 'Bài thi đã được nộp trước đó',
        data: {
          attempt: {
            _id: attempt._id,
            status: attempt.status,
            score: attempt.score,
            maxScore: attempt.maxScore,
            percentage,
          },
          result: {
            attemptId: attempt._id,
            status: attempt.status,
            score: attempt.score,
            maxScore: attempt.maxScore,
            percentage,
            correctCount: attempt.correctCount,
            incorrectCount: attempt.incorrectCount,
            unansweredCount: attempt.unansweredCount,
            duration: attempt.duration,
            submittedAt: attempt.submittedAt,
            isExpired: attempt.isExpired,
            toeicBreakdown: attempt.toeicBreakdown,
          },
        },
      });
    }

    const submittedAt = new Date();
    let durationSeconds = Math.max(0, Math.round((submittedAt - attempt.startedAt) / 1000));
    let isExpired = false;

    if (submittedAt.getTime() > attempt.deadlineAt.getTime() + 10000) {
      isExpired = true;
      durationSeconds = Math.round((attempt.deadlineAt - attempt.startedAt) / 1000);
    }

    const rawAnswers = req.body.answers || attempt.answers || {};

    let totalEarnedScore = 0;
    let maxPossibleScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    let listeningCorrect = 0;
    let listeningTotal = 0;
    let readingCorrect = 0;
    let readingTotal = 0;

    const partBreakdown = {
      part1: { correct: 0, total: 0 },
      part2: { correct: 0, total: 0 },
      part3: { correct: 0, total: 0 },
      part4: { correct: 0, total: 0 },
      part5: { correct: 0, total: 0 },
      part6: { correct: 0, total: 0 },
      part7: { correct: 0, total: 0 },
    };

    // Auto-grading against immutable questionSnapshots
    for (const snapshot of attempt.questionSnapshots || []) {
      const qId = snapshot.questionId;
      const qScore = snapshot.score || 1;
      const partNum = snapshot.toeicPart || 1;
      const isListening = partNum <= 4;

      maxPossibleScore += qScore;
      if (isListening) listeningTotal++;
      else readingTotal++;

      const partKey = `part${partNum}`;
      if (partBreakdown[partKey]) {
        partBreakdown[partKey].total++;
      }

      const subAns = rawAnswers[qId];

      if (
        subAns === undefined ||
        subAns === null ||
        subAns === '' ||
        (Array.isArray(subAns) && subAns.length === 0)
      ) {
        unansweredCount++;
        continue;
      }

      let isCorrect = false;
      const submittedValues = Array.isArray(subAns) ? subAns : [subAns];

      if (snapshot.type === 'single_choice') {
        const chosenTexts = (snapshot.options || [])
          .filter((o) => submittedValues.includes(o.id) || submittedValues.includes(o._id?.toString()) || submittedValues.includes(o.text))
          .map((o) => o.text);

        isCorrect = submittedValues.some(
          (val) =>
            (snapshot.correctAnswers || []).includes(val) ||
            (snapshot.correctOptionIds || []).includes(val) ||
            chosenTexts.some((txt) => (snapshot.correctAnswers || []).includes(txt))
        );
      } else if (snapshot.type === 'multiple_choice') {
        const submittedSet = new Set(submittedValues);
        const correctSet = new Set(snapshot.correctAnswers);
        if (submittedSet.size === correctSet.size) {
          isCorrect = [...submittedSet].every((val) => correctSet.has(val));
        }
      } else if (snapshot.type === 'fill_blank' || snapshot.type === 'typed_answer') {
        const normSub = String(subAns).trim().toLowerCase();
        isCorrect = (snapshot.correctAnswers || []).some((ans) => String(ans).trim().toLowerCase() === normSub);
      }

      if (isCorrect) {
        totalEarnedScore += qScore;
        correctCount++;
        if (isListening) listeningCorrect++;
        else readingCorrect++;
        if (partBreakdown[partKey]) partBreakdown[partKey].correct++;
      } else {
        incorrectCount++;
      }
    }

    const listeningScore = calculateEstimatedListeningScore(listeningCorrect, listeningTotal || 100);
    const readingScore = calculateEstimatedReadingScore(readingCorrect, readingTotal || 100);
    const estimatedToeicScore = listeningScore + readingScore;

    attempt.answers = rawAnswers;
    attempt.score = totalEarnedScore;
    attempt.maxScore = maxPossibleScore;
    attempt.correctCount = correctCount;
    attempt.incorrectCount = incorrectCount;
    attempt.unansweredCount = unansweredCount;
    attempt.duration = durationSeconds;
    attempt.submittedAt = submittedAt;
    attempt.status = 'completed';
    attempt.isExpired = isExpired;

    attempt.toeicBreakdown = {
      listeningCorrect,
      readingCorrect,
      listeningTotal,
      readingTotal,
      listeningScore,
      readingScore,
      estimatedToeicScore,
      partBreakdown,
    };

    await attempt.save();

    const percentage = maxPossibleScore > 0 ? Math.round((totalEarnedScore / maxPossibleScore) * 100) : 0;

    res.json({
      status: 'success',
      message: 'Nộp bài thi TOEIC và chấm điểm thành công',
      data: {
        attempt: {
          _id: attempt._id,
          status: attempt.status,
          score: totalEarnedScore,
          maxScore: maxPossibleScore,
          percentage,
        },
        result: {
          attemptId: attempt._id,
          status: attempt.status,
          score: totalEarnedScore,
          maxScore: maxPossibleScore,
          percentage,
          correctCount,
          incorrectCount,
          unansweredCount,
          duration: durationSeconds,
          submittedAt: attempt.submittedAt,
          isExpired,
          toeicBreakdown: attempt.toeicBreakdown,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get student TOEIC attempt state (in-progress or completed review)
// @route   GET /api/v1/toeic/attempts/:attemptId
// @access  Private (Active Student)
export const getStudentToeicAttempt = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const studentId = req.user._id;

    const attempt = await Attempt.findById(attemptId).populate('assessment');
    if (!attempt) {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy lượt làm bài thi TOEIC',
      });
    }

    if (attempt.student.toString() !== studentId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Không có quyền truy cập lượt làm bài này',
      });
    }

    const isCompleted = attempt.status === 'completed' || attempt.status === 'submitted';
    const showCorrect = attempt.assessment?.showCorrectAnswers ?? true;

    // Sanitize questionSnapshots
    // Sanitize questionSnapshots
    const sanitizedQuestions = (attempt.questionSnapshots || []).map((q) => {
      const qObj = typeof q.toObject === 'function' ? q.toObject() : { ...q };
      if (!isCompleted) {
        delete qObj.correctAnswers;
        delete qObj.correctOptionIds;
        delete qObj.isCorrect;
        delete qObj.explanation;
      }
      return {
        ...qObj,
        _id: (qObj.questionId || qObj._id)?.toString(),
        questionId: (qObj.questionId || qObj._id)?.toString(),
        questionText: qObj.questionText || qObj.prompt || '',
        prompt: qObj.questionText || qObj.prompt || '',
        text: qObj.questionText || qObj.prompt || '',
        options: (qObj.options || []).map((o) => ({
          _id: (o.id || o._id)?.toString() || o.text,
          id: (o.id || o._id)?.toString() || o.text,
          text: o.text,
        })),
      };
    });

    // Sanitize groupSnapshots
    const sanitizedGroups = (attempt.groupSnapshots || []).map((g) => {
      const gObj = typeof g.toObject === 'function' ? g.toObject() : { ...g };
      return {
        ...gObj,
        _id: (gObj.groupId || gObj._id)?.toString(),
        groupId: (gObj.groupId || gObj._id)?.toString(),
        questionIds: (gObj.questionIds || []).map((q) => {
          if (typeof q === 'object' && q !== null) {
            const qObj = typeof q.toObject === 'function' ? q.toObject() : { ...q };
            if (!isCompleted) {
              delete qObj.correctAnswers;
              delete qObj.correctOptionIds;
              delete qObj.isCorrect;
              delete qObj.explanation;
            }
            return {
              ...qObj,
              _id: (qObj.questionId || qObj._id)?.toString(),
              questionId: (qObj.questionId || qObj._id)?.toString(),
              questionText: qObj.questionText || qObj.prompt || '',
              prompt: qObj.questionText || qObj.prompt || '',
              text: qObj.questionText || qObj.prompt || '',
              options: (qObj.options || []).map((o) => ({
                _id: (o.id || o._id)?.toString() || o.text,
                id: (o.id || o._id)?.toString() || o.text,
                text: o.text,
              })),
            };
          }
          return q?.toString();
        }),
      };
    });

    // Answers review array for completed review
    const answersReview = (attempt.questionSnapshots || []).map((qSnap) => {
      const qId = qSnap.questionId;
      const rawAns = attempt.answers?.[qId] || [];
      const selectedOptionIds = Array.isArray(rawAns) ? rawAns : [rawAns];

      const qObj = {
        _id: qSnap.questionId,
        questionId: qSnap.questionId,
        questionNumber: qSnap.questionNumber,
        questionText: qSnap.questionText,
        text: qSnap.questionText,
        prompt: qSnap.questionText,
        options: (qSnap.options || []).map((o) => ({
          _id: (o.id || o._id)?.toString() || o.text,
          id: (o.id || o._id)?.toString() || o.text,
          text: o.text,
        })),
        score: qSnap.score || 1,
      };

      let isCorrect = false;
      if (isCompleted) {
        if (qSnap.type === 'single_choice') {
          const chosenTexts = (qSnap.options || [])
            .filter((o) => selectedOptionIds.includes(o.id) || selectedOptionIds.includes(o._id?.toString()) || selectedOptionIds.includes(o.text))
            .map((o) => o.text);

          isCorrect = selectedOptionIds.some(
            (val) =>
              (qSnap.correctAnswers || []).includes(val) ||
              (qSnap.correctOptionIds || []).includes(val) ||
              chosenTexts.some((txt) => (qSnap.correctAnswers || []).includes(txt))
          );
        } else if (qSnap.type === 'multiple_choice') {
          const submittedSet = new Set(selectedOptionIds);
          const correctSet = new Set(qSnap.correctAnswers || []);
          if (submittedSet.size === correctSet.size) {
            isCorrect = [...submittedSet].every((val) => correctSet.has(val));
          }
        } else if (qSnap.type === 'fill_blank' || qSnap.type === 'typed_answer') {
          const normSub = String(rawAns).trim().toLowerCase();
          isCorrect = (qSnap.correctAnswers || []).some((ans) => String(ans).trim().toLowerCase() === normSub);
        }
      }

      if (isCompleted && showCorrect) {
        qObj.correctAnswers = qSnap.correctAnswers;
        qObj.correctOptionIds = qSnap.correctOptionIds;
        qObj.explanation = qSnap.explanation;
      }

      return {
        questionId: qObj,
        selectedOptionIds,
        isCorrect: isCompleted ? isCorrect : undefined,
        score: isCompleted ? (isCorrect ? (qSnap.score || 1) : 0) : 0,
      };
    });

    const rawMap = attempt.answers || {};
    const answersList = Object.entries(rawMap).map(([qId, opts]) => ({
      questionId: qId,
      selectedOptionIds: Array.isArray(opts) ? opts : [opts],
    }));

    res.json({
      status: 'success',
      data: {
        attempt: {
          _id: attempt._id,
          student: attempt.student,
          assessment: attempt.assessment?._id || attempt.assessment,
          startedAt: attempt.startedAt,
          deadlineAt: attempt.deadlineAt,
          submittedAt: attempt.submittedAt,
          status: attempt.status,
          revision: attempt.revision || 1,
          flaggedQuestionIds: attempt.flaggedQuestionIds || [],
          answers: answersList,
          answersMap: rawMap,
          answersReview,
          questionSnapshots: sanitizedQuestions,
          groupSnapshots: sanitizedGroups,
          toeicBreakdown: attempt.toeicBreakdown,
          score: attempt.score,
          maxScore: attempt.maxScore,
        },
        assessment: attempt.assessment,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Student get TOEIC attempts history
// @route   GET /api/v1/toeic/history
// @access  Private (Active Student)
export const getStudentToeicHistory = async (req, res, next) => {
  try {
    const studentId = req.user._id;

    const attempts = await Attempt.find({
      student: studentId,
      status: { $in: ['submitted', 'completed'] },
    })
      .populate('assessment')
      .sort({ submittedAt: -1 });

    const toeicAttempts = attempts.filter((att) => att.assessment?.examFormat === 'toeic');

    const history = toeicAttempts.map((att) => ({
      _id: att._id,
      attemptId: att._id,
      assessment: {
        _id: att.assessment?._id,
        title: att.assessment?.title || 'TOEIC Test',
        toeicMode: att.assessment?.toeicMode,
        durationMinutes: att.assessment?.durationMinutes,
      },
      score: att.score,
      maxScore: att.maxScore,
      percentage: att.maxScore > 0 ? Math.round((att.score / att.maxScore) * 100) : 0,
      toeicBreakdown: att.toeicBreakdown || {},
      status: att.status,
      duration: att.duration,
      submittedAt: att.submittedAt,
    }));

    res.json({
      status: 'success',
      data: {
        attempts: history,
        history,
      },
    });
  } catch (error) {
    next(error);
  }
};

