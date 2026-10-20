import { resolveAttemptEngine } from './attemptLifecycle.js';

const TERMINAL_STATUSES = new Set(['submitted', 'completed']);
const NUMERIC_TYPES = new Set(['int', 'long', 'double', 'decimal']);

/**
 * Read-only canonical interpretation shared by student history and admin reports.
 * A stored score of zero is valid when maxScore is positive and finalization time exists.
 */
export const interpretAttemptForReport = (attempt, assessment, now = new Date()) => {
  const engine = resolveAttemptEngine(attempt, assessment);
  const status = attempt?.status;
  const score = attempt?.score;
  const maxScore = attempt?.maxScore;
  const submittedAt = attempt?.submittedAt;
  const terminalStatusMatches = (engine === 'standard' && status === 'submitted')
    || (engine === 'toeic' && status === 'completed');
  const hasScoredFields = typeof score === 'number'
    && Number.isFinite(score)
    && score >= 0
    && typeof maxScore === 'number'
    && Number.isFinite(maxScore)
    && maxScore > 0
    && score <= maxScore
    && submittedAt instanceof Date
    && Number.isFinite(submittedAt.getTime());

  let logicalState = 'LEGACY_UNVERIFIED';
  if (terminalStatusMatches && hasScoredFields) {
    logicalState = 'COMPLETED_SCORED';
  } else if (status === 'in_progress') {
    const deadline = attempt?.deadlineAt instanceof Date ? attempt.deadlineAt : null;
    logicalState = attempt?.isExpired === true || (deadline && deadline <= now)
      ? 'EXPIRED_PENDING_FINALIZATION'
      : 'IN_PROGRESS';
  } else if (!TERMINAL_STATUSES.has(status)) {
    logicalState = 'LEGACY_UNVERIFIED';
  }

  const isScored = logicalState === 'COMPLETED_SCORED';
  return {
    engine,
    logicalState,
    isTerminal: TERMINAL_STATUSES.has(status),
    isScored,
    isExpired: attempt?.isExpired === true || logicalState === 'EXPIRED_PENDING_FINALIZATION',
    completionTime: submittedAt instanceof Date && Number.isFinite(submittedAt.getTime()) ? submittedAt : null,
    score: isScored ? score : null,
    maxScore: isScored ? maxScore : null,
    percentage: isScored ? Math.round((score / maxScore) * 100) : null,
    duration: isScored && Number.isFinite(attempt?.duration) ? attempt.duration : null,
  };
};

const scoredExpression = {
  $and: [
    { $or: [
      { $and: [{ $eq: ['$__resolvedEngine', 'standard'] }, { $eq: ['$status', 'submitted'] }] },
      { $and: [{ $eq: ['$__resolvedEngine', 'toeic'] }, { $eq: ['$status', 'completed'] }] },
    ] },
    { $in: [{ $type: '$score' }, [...NUMERIC_TYPES]] },
    { $in: [{ $type: '$maxScore' }, [...NUMERIC_TYPES]] },
    { $eq: [{ $type: '$submittedAt' }, 'date'] },
    { $gte: ['$score', 0] },
    { $gt: ['$maxScore', 0] },
    { $lte: ['$score', '$maxScore'] },
  ],
};

/** Mongo expressions equivalent to interpretAttemptForReport for server-side filtering/counting. */
export const buildAttemptReportingStages = ({
  assessmentCollection = 'assessments',
  studentId,
  assessmentId,
  assessmentType,
  engine,
  from,
  to,
  now = new Date(),
} = {}) => {
  const match = {};
  if (studentId) match.student = studentId;
  if (assessmentId) match.assessment = assessmentId;
  if (from || to) {
    match.startedAt = {};
    if (from) match.startedAt.$gte = from;
    if (to) match.startedAt.$lte = to;
  }

  const stages = [
    { $match: match },
    {
      $lookup: {
        from: assessmentCollection,
        localField: 'assessment',
        foreignField: '_id',
        pipeline: [{ $project: { title: 1, type: 1, examFormat: 1, toeicMode: 1, totalScore: 1, passScore: 1 } }],
        as: '__assessmentMatches',
      },
    },
    {
      $set: {
        __assessment: { $arrayElemAt: ['$__assessmentMatches', 0] },
      },
    },
    {
      $set: {
        __storedEngine: { $cond: [{ $in: ['$engine', ['standard', 'toeic']] }, '$engine', null] },
        __assessmentEngine: {
          $cond: [{ $in: ['$__assessment.examFormat', ['standard', 'toeic']] }, '$__assessment.examFormat', null],
        },
      },
    },
    {
      $set: {
        __resolvedEngine: {
          $cond: [
            {
              $and: [
                { $ne: ['$__storedEngine', null] },
                { $ne: ['$__assessmentEngine', null] },
                { $ne: ['$__storedEngine', '$__assessmentEngine'] },
              ],
            },
            null,
            { $ifNull: ['$__storedEngine', '$__assessmentEngine'] },
          ],
        },
      },
    },
    { $set: { __isScored: scoredExpression } },
    {
      $set: {
        __logicalState: {
          $switch: {
            branches: [
              { case: '$__isScored', then: 'COMPLETED_SCORED' },
              {
                case: {
                  $and: [
                    { $eq: ['$status', 'in_progress'] },
                    {
                      $or: [
                        { $eq: ['$isExpired', true] },
                        {
                          $and: [
                            { $eq: [{ $type: '$deadlineAt' }, 'date'] },
                            { $lte: ['$deadlineAt', now] },
                          ],
                        },
                      ],
                    },
                  ],
                },
                then: 'EXPIRED_PENDING_FINALIZATION',
              },
              { case: { $eq: ['$status', 'in_progress'] }, then: 'IN_PROGRESS' },
            ],
            default: 'LEGACY_UNVERIFIED',
          },
        },
      },
    },
  ];

  if (assessmentType) {
    stages.push({
      $match: {
        $or: [
          { assessmentType },
          { assessmentType: { $exists: false }, '__assessment.type': assessmentType },
        ],
      },
    });
  }
  if (engine) stages.push({ $match: { __resolvedEngine: engine } });
  return stages;
};

export const buildReportRowsFacet = ({ state = 'COMPLETED_SCORED', page, limit, sort, userCollection = 'users' }) => {
  const stateMatch = state === 'ALL' ? [] : [{ $match: { __logicalState: state } }];
  const studentLookup = [
    {
      $lookup: {
        from: userCollection,
        localField: 'student',
        foreignField: '_id',
        pipeline: [{ $project: { fullName: 1, email: 1, username: 1 } }],
        as: '__studentMatches',
      },
    },
    { $set: { __student: { $arrayElemAt: ['$__studentMatches', 0] } } },
  ];
  const studentSort = Object.hasOwn(sort, '__student.fullName');
  const resultRows = [
    ...stateMatch,
    ...(studentSort ? studentLookup : []),
    { $sort: sort },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    ...(!studentSort ? studentLookup : []),
    {
      $project: {
        _id: 1,
        assessmentId: '$assessment',
        studentId: '$student',
        student: {
          $cond: [
            { $ne: ['$__student', null] },
            {
              _id: '$__student._id',
              fullName: '$__student.fullName',
              email: '$__student.email',
              username: '$__student.username',
            },
            null,
          ],
        },
        assessment: {
          $cond: [
            { $ne: ['$__assessment', null] },
            {
              _id: '$__assessment._id',
              title: '$__assessment.title',
              type: '$__assessment.type',
              examFormat: '$__assessment.examFormat',
              toeicMode: '$__assessment.toeicMode',
              totalScore: '$__assessment.totalScore',
              passScore: '$__assessment.passScore',
            },
            null,
          ],
        },
        assessmentTitle: { $ifNull: ['$__assessment.title', 'Đề thi đã bị xóa'] },
        assessmentType: { $ifNull: ['$assessmentType', '$__assessment.type'] },
        engine: '$__resolvedEngine',
        status: 1,
        logicalStatus: '$__logicalState',
        isScored: '$__isScored',
        isExpired: {
          $or: [
            { $eq: ['$isExpired', true] },
            { $eq: ['$__logicalState', 'EXPIRED_PENDING_FINALIZATION'] },
          ],
        },
        score: { $cond: ['$__isScored', '$score', null] },
        maxScore: { $cond: ['$__isScored', '$maxScore', null] },
        percentage: {
          $cond: ['$__isScored', { $multiply: [{ $divide: ['$score', '$maxScore'] }, 100] }, null],
        },
        scorePercentage: { $cond: ['$__isScored', { $multiply: [{ $divide: ['$score', '$maxScore'] }, 100] }, null] },
        passScore: '$passScore',
        startedAt: 1,
        submittedAt: 1,
        completedAt: '$submittedAt',
        deadlineAt: 1,
        duration: { $cond: ['$__isScored', '$duration', null] },
        toeicEstimatedScore: {
          $cond: [
            { $and: ['$__isScored', { $eq: ['$__resolvedEngine', 'toeic'] }] },
            '$toeicBreakdown.estimatedToeicScore',
            null,
          ],
        },
      },
    },
  ];
  return {
    $facet: {
      summary: [
        {
          $group: {
            _id: null,
            attemptCount: { $sum: 1 },
            scoredAttemptCount: { $sum: { $cond: ['$__isScored', 1, 0] } },
            studentIds: { $addToSet: '$student' },
            scoredStudentIds: { $addToSet: { $cond: ['$__isScored', '$student', null] } },
            scoreTotal: { $sum: { $cond: ['$__isScored', '$score', 0] } },
            highestScore: { $max: { $cond: ['$__isScored', '$score', null] } },
            lowestScore: { $min: { $cond: ['$__isScored', '$score', null] } },
            inProgressCount: { $sum: { $cond: [{ $eq: ['$__logicalState', 'IN_PROGRESS'] }, 1, 0] } },
            expiredPendingCount: { $sum: { $cond: [{ $eq: ['$__logicalState', 'EXPIRED_PENDING_FINALIZATION'] }, 1, 0] } },
            unverifiedCount: { $sum: { $cond: [{ $eq: ['$__logicalState', 'LEGACY_UNVERIFIED'] }, 1, 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            attemptCount: 1,
            scoredAttemptCount: 1,
            distinctStudents: {
              $size: {
                $filter: {
                  input: '$studentIds',
                  as: 'studentId',
                  cond: { $ne: ['$$studentId', null] },
                },
              },
            },
            scoredDistinctStudents: {
              $size: {
                $filter: {
                  input: '$scoredStudentIds',
                  as: 'studentId',
                  cond: { $ne: ['$$studentId', null] },
                },
              },
            },
            highestScore: 1,
            lowestScore: 1,
            averageScore: {
              $cond: [
                { $gt: ['$scoredAttemptCount', 0] },
                { $divide: ['$scoreTotal', '$scoredAttemptCount'] },
                null,
              ],
            },
            inProgressCount: 1,
            expiredPendingCount: 1,
            unverifiedCount: 1,
          },
        },
      ],
      resultCount: [...stateMatch, { $count: 'total' }],
      results: resultRows,
    },
  };
};
