import mongoose from 'mongoose';
import Attempt from '../models/Attempt.js';
import Assessment from '../models/Assessment.js';
import User from '../models/User.js';
import {
  buildAttemptReportingStages,
  buildReportRowsFacet,
} from '../utils/attemptReporting.js';

const REPORT_STATES = new Set([
  'ALL',
  'COMPLETED_SCORED',
  'IN_PROGRESS',
  'EXPIRED_PENDING_FINALIZATION',
  'LEGACY_UNVERIFIED',
]);
const ASSESSMENT_TYPES = new Set(['exercise', 'exam']);
const ENGINES = new Set(['standard', 'toeic']);
const SORTS = {
  score_desc: { score: -1, submittedAt: 1, _id: 1 },
  score_asc: { score: 1, submittedAt: 1, _id: 1 },
  completed_asc: { submittedAt: 1, _id: 1 },
  started_desc: { startedAt: -1, _id: 1 },
  student_asc: { '__student.fullName': 1, _id: 1 },
};

const fail = (res, statusCode, code, message) => res.status(statusCode).json({
  status: 'error',
  code,
  message,
});

const isObjectId = (value) => typeof value === 'string' && /^[\da-f]{24}$/i.test(value);
const toObjectId = (value) => new mongoose.Types.ObjectId(value);

const parseInteger = (value, fallback, { min = 1, max = 100 } = {}) => {
  if (value === undefined || value === '') return fallback;
  if (!/^[0-9]+$/.test(String(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
};

const normalizeDate = (value, endOfDay = false) => {
  if (!value) return null;
  if (typeof value !== 'string' || value.length > 40) return undefined;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly && endOfDay ? `${value}T23:59:59.999Z` : value);
  return Number.isFinite(date.getTime()) ? date : undefined;
};

const parseFilters = (query, { defaultState = 'COMPLETED_SCORED', defaultSort = 'score_desc' } = {}) => {
  const page = parseInteger(query.page, 1, { min: 1, max: 1000000 });
  const limit = parseInteger(query.limit, 20, { min: 1, max: 100 });
  const state = String(query.state || query.status || defaultState).toUpperCase();
  const sortKey = String(query.sort || defaultSort);
  const type = query.type ? String(query.type).toLowerCase() : undefined;
  const engine = query.engine ? String(query.engine).toLowerCase() : undefined;
  const from = normalizeDate(query.from);
  const to = normalizeDate(query.to, true);
  const rawStudentId = query.studentId || query.student;

  if (page === null || limit === null) return { error: ['INVALID_PAGINATION', 'Trang hoặc số dòng mỗi trang không hợp lệ.'] };
  if (!REPORT_STATES.has(state)) return { error: ['INVALID_STATE', 'Trạng thái báo cáo không hợp lệ.'] };
  if (!SORTS[sortKey]) return { error: ['INVALID_SORT', 'Cách sắp xếp báo cáo không được hỗ trợ.'] };
  if (type && !ASSESSMENT_TYPES.has(type)) return { error: ['INVALID_ASSESSMENT_TYPE', 'Loại bài đánh giá không hợp lệ.'] };
  if (engine && !ENGINES.has(engine)) return { error: ['INVALID_ENGINE', 'Loại engine không hợp lệ.'] };
  if (rawStudentId && !isObjectId(String(rawStudentId))) return { error: ['INVALID_STUDENT_ID', 'Mã học viên không hợp lệ.'] };
  if (query.from && from === undefined) return { error: ['INVALID_DATE_RANGE', 'Ngày bắt đầu không hợp lệ.'] };
  if (query.to && to === undefined) return { error: ['INVALID_DATE_RANGE', 'Ngày kết thúc không hợp lệ.'] };
  if (from && to && from > to) return { error: ['INVALID_DATE_RANGE', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.'] };

  return {
    page,
    limit,
    state,
    sortKey,
    sort: SORTS[sortKey],
    assessmentType: type,
    engine,
    studentId: rawStudentId ? toObjectId(String(rawStudentId)) : undefined,
    from,
    to,
  };
};

const safeAssessment = (assessment) => assessment && ({
  _id: assessment._id,
  title: assessment.title,
  type: assessment.type,
  examFormat: assessment.examFormat,
  toeicMode: assessment.toeicMode,
  totalScore: assessment.totalScore,
  passScore: assessment.passScore,
  status: assessment.status,
});

const runReport = async ({ filters, assessmentId }) => {
  const stages = buildAttemptReportingStages({
    assessmentCollection: Assessment.collection.name,
    assessmentId,
    studentId: filters.studentId,
    assessmentType: filters.assessmentType,
    engine: filters.engine,
    from: filters.from,
    to: filters.to,
    now: new Date(),
  });
  stages.push(buildReportRowsFacet({
    state: filters.state,
    page: filters.page,
    limit: filters.limit,
    sort: filters.sort,
    userCollection: User.collection.name,
  }));
  const [aggregation = {}] = await Attempt.aggregate(stages).allowDiskUse(true);
  const summary = aggregation.summary?.[0] || {
    attemptCount: 0,
    scoredAttemptCount: 0,
    distinctStudents: 0,
    scoredDistinctStudents: 0,
    highestScore: null,
    lowestScore: null,
    averageScore: null,
    inProgressCount: 0,
    expiredPendingCount: 0,
    unverifiedCount: 0,
  };
  const results = aggregation.results || [];
  const total = aggregation.resultCount?.[0]?.total || 0;
  return {
    summary,
    results,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      pages: Math.ceil(total / filters.limit),
    },
  };
};

// @route GET /api/v1/admin/report-assessments
// Only bounded, safe assessment fields are returned for the report selector.
export const getAdminReportAssessments = async (req, res, next) => {
  try {
    const page = parseInteger(req.query.page, 1, { min: 1, max: 1000000 });
    const limit = parseInteger(req.query.limit, 50, { min: 1, max: 100 });
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const type = req.query.type ? String(req.query.type).toLowerCase() : undefined;
    const engine = req.query.engine ? String(req.query.engine).toLowerCase() : undefined;
    if (page === null || limit === null) return fail(res, 400, 'INVALID_PAGINATION', 'Trang hoặc số dòng mỗi trang không hợp lệ.');
    if (search.length > 80) return fail(res, 400, 'INVALID_SEARCH', 'Từ khóa tìm kiếm quá dài.');
    if (type && !ASSESSMENT_TYPES.has(type)) return fail(res, 400, 'INVALID_ASSESSMENT_TYPE', 'Loại bài đánh giá không hợp lệ.');
    if (engine && !ENGINES.has(engine)) return fail(res, 400, 'INVALID_ENGINE', 'Loại engine không hợp lệ.');

    const filter = {};
    if (type) filter.type = type;
    if (engine) filter.examFormat = engine;
    if (search) filter.title = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const [assessments, total] = await Promise.all([
      Assessment.find(filter)
        .select('title type examFormat toeicMode totalScore passScore status createdAt')
        .sort({ title: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Assessment.countDocuments(filter),
    ]);
    return res.json({
      status: 'success',
      data: {
        assessments: assessments.map(safeAssessment),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    return next(error);
  }
};

// @route GET /api/v1/admin/results
// Requires one assessment so no request can aggregate the complete attempt collection.
export const getAdminResults = async (req, res, next) => {
  try {
    const requestedAssessment = req.query.assessmentId || req.query.assessment;
    if (!requestedAssessment) return fail(res, 400, 'ASSESSMENT_REQUIRED', 'Hãy chọn đề kiểm tra trước khi xem báo cáo.');
    if (!isObjectId(String(requestedAssessment))) return fail(res, 400, 'INVALID_ASSESSMENT_ID', 'Mã đề kiểm tra không hợp lệ.');
    const assessmentId = toObjectId(String(requestedAssessment));
    const assessment = await Assessment.findById(assessmentId)
      .select('title type examFormat toeicMode totalScore passScore status')
      .lean();
    if (!assessment) return fail(res, 404, 'ASSESSMENT_NOT_FOUND', 'Không tìm thấy đề kiểm tra.');

    const filters = parseFilters(req.query);
    if (filters.error) return fail(res, 400, filters.error[0], filters.error[1]);
    const report = await runReport({ filters, assessmentId });
    return res.json({
      status: 'success',
      data: {
        assessment: safeAssessment(assessment),
        ...report,
        // Keep aliases consumed by the older admin result screen/API clients.
        attempts: report.results,
      },
    });
  } catch (error) {
    return next(error);
  }
};

// @route GET /api/v1/admin/students/:studentId/attempts
// Uses the same logical-state pipeline as by-assessment reporting and never finalizes attempts.
export const getAdminStudentAttempts = async (req, res, next) => {
  try {
    const { studentId: rawStudentId } = req.params;
    if (!isObjectId(rawStudentId)) return fail(res, 400, 'INVALID_STUDENT_ID', 'Mã học viên không hợp lệ.');
    const studentId = toObjectId(rawStudentId);
    const studentExists = await User.exists({ _id: studentId, role: 'student' });
    if (!studentExists) return fail(res, 404, 'STUDENT_NOT_FOUND', 'Không tìm thấy thông tin học viên.');

    const filters = parseFilters(req.query, { defaultState: 'ALL', defaultSort: 'started_desc' });
    if (filters.error) return fail(res, 400, filters.error[0], filters.error[1]);
    const report = await runReport({ filters: { ...filters, studentId } });
    return res.json({ status: 'success', data: report });
  } catch (error) {
    return next(error);
  }
};
