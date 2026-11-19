import ExerciseSubmission from '../models/ExerciseSubmission.js';

export const getMyExerciseSubmissions = async (req, res, next) => {
  try {
    const requestedPage = Number.parseInt(req.query.page, 10);
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 20;
    const filter = { student: req.user._id };

    const [submissions, total] = await Promise.all([
      ExerciseSubmission.find(filter)
        .select('-student')
        .sort({ submittedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ExerciseSubmission.countDocuments(filter),
    ]);

    return res.json({
      status: 'success',
      data: {
        submissions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};
